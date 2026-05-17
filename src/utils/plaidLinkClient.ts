/**
 * Loads Plaid Link in the renderer (Electron) and returns when the user
 * finishes or exits the modal.
 */

const PLAID_SCRIPT_SRC =
  'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

type PlaidHandler = {
  open: () => void;
  destroy?: () => void;
  exit?: () => void;
};

type PlaidCreateConfig = {
  token: string;
  onSuccess: (publicToken: string, metadata: unknown) => void;
  onExit: (err: unknown | null, metadata: unknown) => void;
};

type PlaidGlobal = {
  create: (config: PlaidCreateConfig) => PlaidHandler;
};

let scriptPromise: Promise<void> | null = null;

function loadPlaidScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Plaid Link requires a browser context'));
  }
  const w = window as Window & { Plaid?: PlaidGlobal };
  if (w.Plaid) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PLAID_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Plaid Link'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export type PlaidLinkOutcome = 'success' | 'exit';

export async function openPlaidLinkModal(options: {
  linkToken: string;
  onSuccess: (publicToken: string) => void | Promise<void>;
}): Promise<PlaidLinkOutcome> {
  await loadPlaidScript();
  const w = window as Window & { Plaid?: PlaidGlobal };
  if (!w.Plaid) {
    throw new Error('Plaid Link is not available');
  }

  return await new Promise<PlaidLinkOutcome>((resolve, reject) => {
    let settled = false;
    const handler = w.Plaid!.create({
      token: options.linkToken,
      onSuccess: (publicToken) => {
        void Promise.resolve(options.onSuccess(publicToken))
          .then(() => {
            handler.destroy?.();
            if (!settled) {
              settled = true;
              resolve('success');
            }
          })
          .catch((e: unknown) => {
            handler.destroy?.();
            if (!settled) {
              settled = true;
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          });
      },
      onExit: () => {
        handler.destroy?.();
        if (!settled) {
          settled = true;
          resolve('exit');
        }
      },
    });
    handler.open();
  });
}
