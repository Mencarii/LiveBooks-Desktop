import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import http from 'http';
import { URL } from 'url';
import fetch from 'node-fetch';
import config from 'utils/config';
import { IPC_CHANNELS } from 'utils/messages';

/** Legacy dev path; still accepted by the handoff server for compatibility. */
export const LIVEBOOKS_DEV_HANDOFF_PATH = '/livebooks-desktop-handoff';

/** Matches livebooks-cloud `Web::DesktopSessionUrlsController::DEV_HANDOFF_PATH` (development redirect). */
const LIVEBOOKS_RAILS_DEV_CALLBACK_PATH = '/auth/callback';

const DEV_HANDOFF_PATHS: ReadonlySet<string> = new Set([
  LIVEBOOKS_DEV_HANDOFF_PATH,
  LIVEBOOKS_RAILS_DEV_CALLBACK_PATH,
]);

const DEFAULT_HANDOFF_PORT = 48721;

export type LivebooksCloudMainRef = {
  mainWindow: BrowserWindow | null;
  isDevelopment: boolean;
  isTest: boolean;
};

let mainRef: LivebooksCloudMainRef | null = null;
let pendingDeepLinkUrl: string | null = null;
let handoffServer: http.Server | null = null;

export function attachLivebooksCloudMain(main: LivebooksCloudMainRef): void {
  mainRef = main;
}

export function getLivebooksCloudOriginMain(): string {
  const raw = process.env.LIVEBOOKS_CLOUD_ORIGIN?.trim();
  if (raw) {
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }
  return 'http://127.0.0.1:3000';
}

export function broadcastLivebooksCloudSession(
  main: LivebooksCloudMainRef | null,
  signedIn: boolean
): void {
  const m = main ?? mainRef;
  if (!m?.mainWindow || m.mainWindow.isDestroyed()) {
    return;
  }
  m.mainWindow.webContents.send(IPC_CHANNELS.LIVEBOOKS_CLOUD_SESSION_CHANGED, {
    signedIn,
  });
}

export function isLivebooksCloudSignedIn(): boolean {
  const at = config.get('livebooksCloudAccessToken');
  return typeof at === 'string' && at.length > 0;
}

export function clearLivebooksCloudSessionFromStore(): void {
  config.delete('livebooksCloudAccessToken');
  config.delete('livebooksCloudRefreshToken');
}

/**
 * Extract one-time desktop link `code` from production `livebooks://…` or dev loopback URLs.
 */
export function parseCodeFromDesktopHandoffUrl(
  urlString: string
): string | null {
  try {
    const u = new URL(urlString);
    const scheme = u.protocol.replace(/:$/, '');

    if (scheme === 'livebooks') {
      return u.searchParams.get('code');
    }

    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      if (
        u.pathname === LIVEBOOKS_DEV_HANDOFF_PATH ||
        u.pathname === '/auth/callback'
      ) {
        return u.searchParams.get('code');
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function exchangeCodeForTokens(
  code: string
): Promise<
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; message: string }
> {
  const origin = getLivebooksCloudOriginMain();
  const res = await fetch(`${origin}/api/v1/sessions/exchange_desktop_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const msg =
      typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
        ? data.error
        : `HTTP ${String(res.status)}`;
    return { ok: false, message: msg };
  }

  const at = data.access_token;
  const rt = data.refresh_token;
  if (typeof at === 'string' && typeof rt === 'string') {
    return { ok: true, access_token: at, refresh_token: rt };
  }
  return { ok: false, message: 'Unexpected response from LiveBooks Cloud.' };
}

export async function consumeDesktopHandoffUrl(
  main: LivebooksCloudMainRef,
  urlOrRawCode: string
): Promise<void> {
  const code =
    urlOrRawCode.includes('://') || urlOrRawCode.startsWith('http')
      ? parseCodeFromDesktopHandoffUrl(urlOrRawCode)
      : urlOrRawCode;

  if (!code) {
    return;
  }

  const result = await exchangeCodeForTokens(code);
  if (!result.ok) {
    await dialog.showMessageBox(
      main.mainWindow && !main.mainWindow.isDestroyed()
        ? main.mainWindow
        : undefined,
      {
        type: 'error',
        title: 'LiveBooks Cloud',
        message: 'Could not connect your account',
        detail: result.message,
      }
    );
    return;
  }

  config.set('livebooksCloudAccessToken', result.access_token);
  config.set('livebooksCloudRefreshToken', result.refresh_token);
  broadcastLivebooksCloudSession(main, true);
}

function queueOrHandleDeepLink(url: string): void {
  const main = mainRef;
  if (!main) {
    pendingDeepLinkUrl = url;
    return;
  }
  if (!app.isReady() || !main.mainWindow || main.mainWindow.isDestroyed()) {
    pendingDeepLinkUrl = url;
    return;
  }
  pendingDeepLinkUrl = null;
  void consumeDesktopHandoffUrl(main, url);
}

export function registerLivebooksDeepLinkListeners(): void {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (typeof url === 'string' && url.startsWith('livebooks://')) {
      queueOrHandleDeepLink(url);
    }
  });

  app.on('second-instance', (_event, argv) => {
    const url = argv.find(
      (a): a is string => typeof a === 'string' && a.startsWith('livebooks://')
    );
    if (url) {
      queueOrHandleDeepLink(url);
    }

    const main = mainRef;
    if (main?.mainWindow && !main.mainWindow.isDestroyed()) {
      if (main.mainWindow.isMinimized()) {
        main.mainWindow.restore();
      }
      main.mainWindow.focus();
    }
  });
}

export function flushPendingLivebooksDeepLink(): void {
  const main = mainRef;
  if (!main || !pendingDeepLinkUrl) {
    return;
  }
  const url = pendingDeepLinkUrl;
  pendingDeepLinkUrl = null;
  void consumeDesktopHandoffUrl(main, url);
}

export function consumeArgvLivebooksDeepLink(): void {
  const url = process.argv.find(
    (a) => typeof a === 'string' && a.startsWith('livebooks://')
  );
  if (url) {
    queueOrHandleDeepLink(url);
  }
}

export function registerLivebooksDefaultProtocol(): void {
  if (process.defaultApp) {
    return;
  }
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient('livebooks');
  }
}

export function startLivebooksDevHandoffServer(): void {
  const main = mainRef;
  if (!main || !main.isDevelopment || main.isTest || handoffServer) {
    return;
  }

  const port =
    Number(process.env.LIVEBOOKS_DEV_HANDOFF_PORT) || DEFAULT_HANDOFF_PORT;

  handoffServer = http.createServer((req, res) => {
    try {
      const host = `http://127.0.0.1:${port}`;
      const reqUrl = new URL(req.url ?? '/', host);

      if (req.method === 'GET' && DEV_HANDOFF_PATHS.has(reqUrl.pathname)) {
        const code = reqUrl.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!doctype html><html><body><p>Connecting to LiveBooks Desktop… You can close this tab.</p></body></html>'
        );
        if (code) {
          const full = `${host}${reqUrl.pathname}?code=${encodeURIComponent(
            code
          )}`;
          void consumeDesktopHandoffUrl(main, full);
        }
        return;
      }

      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  handoffServer.listen(port, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(
      `LiveBooks dev handoff: http://127.0.0.1:${port} (${LIVEBOOKS_DEV_HANDOFF_PATH} | ${LIVEBOOKS_RAILS_DEV_CALLBACK_PATH})`
    );
  });
  handoffServer.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.warn('LiveBooks dev handoff server:', err.message);
  });
}
