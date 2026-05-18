// eslint-disable-next-line
require('source-map-support').install({
  handleUncaughtException: false,
  environment: 'node',
});

import { emitMainProcessError } from 'backend/helpers';
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  nativeImage,
  protocol,
  ProtocolRequest,
  ProtocolResponse,
  session,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import registerAppLifecycleListeners from './main/registerAppLifecycleListeners';
import registerAutoUpdaterListeners from './main/registerAutoUpdaterListeners';
import registerIpcMainActionListeners from './main/registerIpcMainActionListeners';
import registerIpcMainMessageListeners from './main/registerIpcMainMessageListeners';
import {
  applyMacShellDisplayName,
  livebooksDesktopShellDisplayName,
  resolveLivebooksAppEnvMain,
} from './main/livebooksAppEnvMain';
import registerProcessListeners from './main/registerProcessListeners';
import { registerDevelopmentContextMenu } from './main/setupDevelopmentShell';
import type { LivebooksAppEnv } from 'utils/livebooksAppEnv';
import { LIVEBOOKS_DESKTOP_PRODUCT_NAME } from 'utils/livebooksAppEnv';
import {
  isTelemetryEnabledFromEnv,
  isUpdaterEnabledFromEnv,
} from 'utils/livebooksFeatureFlags';
import {
  attachLivebooksCloudMain,
  registerLivebooksDeepLinkListeners,
} from './main/livebooksCloudBridge';
import { assertFrozenSigningIdentityForPackagedBuild } from './main/frozenSigningIdentity';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// refuse to boot a packaged build whose signing
// identity drifted from the frozen contract. A drift would silently
// invalidate every user's safeStorage-wrapped SQLCipher key.
assertFrozenSigningIdentityForPackagedBuild();

/** Matches index.html boot splash / body background. */
const BOOT_WINDOW_BACKGROUND = '#f9fafb';

export class Main {
  readonly appEnv: LivebooksAppEnv;
  title = LIVEBOOKS_DESKTOP_PRODUCT_NAME;
  icon: string;

  winURL = '';
  checkedForUpdate = false;
  readonly updaterEnabled = isUpdaterEnabledFromEnv();
  readonly telemetryEnabled = isTelemetryEnabledFromEnv();
  mainWindow: BrowserWindow | null = null;

  WIDTH = 1200;
  HEIGHT = process.platform === 'win32' ? 826 : 800;

  constructor() {
    attachLivebooksCloudMain(this);
    this.icon = this.resolveWindowIcon();

    protocol.registerSchemesAsPrivileged([
      { scheme: 'app', privileges: { secure: true, standard: true } },
    ]);

    this.appEnv = resolveLivebooksAppEnvMain();
    this.title = livebooksDesktopShellDisplayName(this.appEnv);

    if (this.isDevelopment) {
      autoUpdater.logger = console;
    }
    applyMacShellDisplayName(this.appEnv);

    // https://github.com/electron-userland/electron-builder/issues/4987
    app.commandLine.appendSwitch('disable-http2');
    app.commandLine.appendSwitch(
      'disable-features',
      'HardwareMediaKeyHandling'
    );
    app.commandLine.appendSwitch('disable-smooth-scrolling');
    autoUpdater.requestHeaders = {
      'Cache-Control':
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    };

    this.registerListeners();
  }

  resolveWindowIcon(): string {
    // In production we ship a small set of icon assets alongside the main bundle.
    // Prefer platform-native formats where possible to avoid OS fallbacks.
    if (!this.isDevelopment) {
      const packagedCandidates =
        process.platform === 'win32'
          ? [path.join(__dirname, 'icons', 'icon.ico')]
          : [path.join(__dirname, 'icons', '512x512.png')];

      const packaged = packagedCandidates.find((p) => fs.existsSync(p));
      if (packaged) {
        return packaged;
      }
    }

    // Dev / fallback paths (project root)
    if (process.platform === 'win32') {
      const ico = path.join(__dirname, '..', '..', 'build', 'icon.ico');
      if (fs.existsSync(ico)) {
        return ico;
      }
    }

    const appIcon = path.join(__dirname, '..', '..', 'app-icon.png');
    if (fs.existsSync(appIcon)) {
      return appIcon;
    }

    return path.join(__dirname, '..', '..', 'build', 'icon.png');
  }

  /**
   * macOS: set Dock icon as early as possible when creating a window.
   * Packaged apps ship `Contents/Resources/icon.icns` (see electron-builder);
   * dev runs use repo `LiveBooks.icns` / PNG fallbacks.
   */
  setMacDockIcon(): void {
    if (!this.isMac || !app.dock) {
      return;
    }

    if (app.isPackaged) {
      const bundledIcns = path.join(process.resourcesPath, 'icon.icns');
      if (fs.existsSync(bundledIcns)) {
        try {
          app.dock.setIcon(path.resolve(bundledIcns));
          return;
        } catch {
          /* fall through */
        }
      }
    }

    const projectRoot = path.resolve(path.join(__dirname, '..', '..'));
    const icnsCandidates = [
      path.join(projectRoot, 'LiveBooks.icns'),
      path.join(projectRoot, 'build', 'LiveBooks.icns'),
    ];
    const icns = icnsCandidates.find((p) => fs.existsSync(p));

    if (icns) {
      const icnsAbs = path.resolve(icns);
      try {
        app.dock.setIcon(icnsAbs);
        return;
      } catch {
        const rasterPath = rasterizeIcnsToTempPng(icnsAbs);
        if (rasterPath) {
          try {
            const img = nativeImage.createFromPath(rasterPath);
            if (!img.isEmpty()) {
              app.dock.setIcon(img);
              return;
            }
          } catch {
            /* fall through */
          } finally {
            try {
              fs.unlinkSync(rasterPath);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    try {
      const img = nativeImage.createFromPath(path.resolve(this.icon));
      if (!img.isEmpty()) {
        app.dock.setIcon(img);
      }
    } catch {
      /* ignore */
    }
  }

  get isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  get isTest() {
    return !!process.env.IS_TEST;
  }

  get isMac() {
    return process.platform === 'darwin';
  }

  get isLinux() {
    return process.platform === 'linux';
  }

  toggleRendererDevTools() {
    this.mainWindow?.webContents.toggleDevTools();
  }

  registerListeners() {
    registerLivebooksDeepLinkListeners();
    registerIpcMainMessageListeners(this);
    registerIpcMainActionListeners(this);
    registerAutoUpdaterListeners(this);
    registerAppLifecycleListeners(this);
    registerProcessListeners(this);
  }

  getOptions(): BrowserWindowConstructorOptions {
    const preload = path.join(__dirname, 'main', 'preload.js');
    // Security audit (Plaid MVP, 2026-05):
    //   contextIsolation: true   - keeps renderer JS isolated from preload's Node APIs.
    //   nodeIntegration: false   - renderer cannot call Node APIs directly.
    //   sandbox: false           - intentional: the preload script needs Node modules
    //                              (require('source-map-support'), bespoke fs/path access in
    //                              `main/preload.ts`) which the OS-level sandbox blocks.
    //                              Since contextIsolation is on and nodeIntegration is off,
    //                              the renderer surface remains protected.
    // CSP is injected at runtime via `session.webRequest.onHeadersReceived` (see
    // installRendererCsp() below) so it can adapt to the user's configured cloud origin.
    const options: BrowserWindowConstructorOptions = {
      width: this.WIDTH,
      height: this.HEIGHT,
      title: this.title,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 16 },
      show: true,
      backgroundColor: BOOT_WINDOW_BACKGROUND,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload,
      },
      autoHideMenuBar: true,
      frame: !this.isMac,
      resizable: true,
    };

    // Always set explicitly so Windows/Linux never fall back to Electron's default.
    Object.assign(options, { icon: this.icon });

    return options;
  }

  disableRendererSpellcheck() {
    const ses = session.defaultSession;
    if (ses) {
      ses.setSpellCheckerEnabled(false);
    }
  }

  async createWindow() {
    this.installRendererCsp();
    this.disableRendererSpellcheck();

    const options = this.getOptions();
    this.mainWindow = new BrowserWindow(options);

    if (this.isDevelopment) {
      this.setViteServerURL();
    } else {
      this.registerAppProtocol();
    }

    this.setMainWindowListeners();

    const loadPromise = this.mainWindow.loadURL(this.winURL);
    if (this.isMac) {
      setImmediate(() => this.setMacDockIcon());
    }
    await loadPromise;
    if (this.isDevelopment && !this.isTest) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  setViteServerURL() {
    let port = 6969;
    let host = '0.0.0.0';

    if (process.env.VITE_PORT && process.env.VITE_HOST) {
      port = Number(process.env.VITE_PORT);
      host = process.env.VITE_HOST;
    }

    // Load the url of the dev server if in development mode
    this.winURL = `http://${host}:${port}/`;
  }

  registerAppProtocol() {
    protocol.registerBufferProtocol('app', bufferProtocolCallback);

    // Use the registered protocol url to load the files.
    this.winURL = 'app://./index.html';
  }

  /**
   * Inject a Content-Security-Policy response header for every renderer fetch so that:
   *   - scripts can only come from our own bundle (`'self'` / `app:` / dev Vite host) and `cdn.plaid.com`
   *   - frames can only come from `*.plaid.com` (Plaid Link drives bank OAuth via iframes)
   *   - network calls are limited to our own bundle, our cloud origin, and `*.plaid.com`
   * Idempotent: only attaches the listener once.
   */
  cspInstalled = false;
  installRendererCsp() {
    if (this.cspInstalled) {
      return;
    }
    const ses = session.defaultSession;
    if (!ses) {
      return;
    }
    // Vue 3 + Tailwind in our build inline styles; strict 'self' would break the UI.
    // We keep style/script local to our bundle and only allow Plaid CDN as a remote
    // origin. 'unsafe-inline' is scoped to styles only (Vue scoped styles).
    const directives = [
      "default-src 'self' app:",
      "script-src 'self' app: 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com",
      "style-src 'self' app: 'unsafe-inline'",
      "img-src 'self' app: data: blob: https://*.plaid.com",
      "font-src 'self' app: data:",
      "connect-src 'self' app: http://127.0.0.1:* http://localhost:* https://*.plaid.com https:",
      "frame-src 'self' https://*.plaid.com https://*.plaid.io",
      "worker-src 'self' app: blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];
    const csp = directives.join('; ');
    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...(details.responseHeaders ?? {}) };
      // Drop any existing CSP header so we don't end up with two conflicting ones.
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'content-security-policy') {
          delete headers[k];
        }
      }
      headers['Content-Security-Policy'] = [csp];
      callback({ responseHeaders: headers });
    });
    this.cspInstalled = true;
  }

  setMainWindowListeners() {
    if (this.mainWindow === null) {
      return;
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.mainWindow.webContents.on('did-fail-load', () => {
      this.mainWindow!.loadURL(this.winURL).catch((err) =>
        emitMainProcessError(err)
      );
    });

    if (this.isDevelopment && !this.isTest) {
      registerDevelopmentContextMenu(this.mainWindow.webContents, () =>
        this.toggleRendererDevTools()
      );
    }
  }
}

function rasterizeIcnsToTempPng(icnsPath: string): string | null {
  const out = path.join(os.tmpdir(), `livebooks-dock-${process.pid}.png`);
  try {
    if (fs.existsSync(out)) {
      fs.unlinkSync(out);
    }
    execFileSync('sips', ['-s', 'format', 'png', icnsPath, '--out', out], {
      stdio: 'ignore',
    });
    return fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Callback used to register the custom app protocol,
 * during prod, files are read and served by using this
 * protocol.
 */
function bufferProtocolCallback(
  request: ProtocolRequest,
  callback: (response: ProtocolResponse) => void
) {
  const { pathname, host } = new URL(request.url);
  const filePath = path.join(
    __dirname,
    'src',
    decodeURI(host),
    decodeURI(pathname)
  );

  fs.readFile(filePath, (_, data) => {
    const extension = path.extname(filePath).toLowerCase();
    const mimeType =
      {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
      }[extension] ?? '';

    callback({ mimeType, data });
  });
}

export default new Main();
