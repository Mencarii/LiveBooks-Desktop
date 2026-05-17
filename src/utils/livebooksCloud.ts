import { t } from 'fyo';
import { showToast } from 'src/utils/interactive';
import {
  getLivebooksCloudOrigin,
  livebooksCloudRootUrl,
  livebooksCloudSignInUrl,
  livebooksCloudSignUpUrl,
  livebooksCloudAccountSecurityUrl,
  livebooksCloudSubscribeUrl,
} from './livebooksCloudUrls';

export async function getLivebooksCloudSessionSummary(): Promise<{
  signedIn: boolean;
}> {
  return await ipc.getLivebooksCloudSession();
}

/** Fired on `document` when cloud tokens are set or cleared (e.g. desktop deep link or disconnect). */
export const LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT =
  'livebooks-cloud-session-app-refresh';

export function dispatchLivebooksCloudSessionAppRefresh(): void {
  document.dispatchEvent(
    new CustomEvent(LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT)
  );
}

/**
 * Opens the cloud sign-in page, or the cloud home when this desktop already holds API tokens
 * (no second browser login required for the desktop integration).
 */
export async function openLivebooksCloudSignIn(): Promise<void> {
  const { signedIn } = await getLivebooksCloudSessionSummary();
  if (signedIn) {
    showToast({
      type: 'success',
      message: t`Opening your LiveBooks Cloud account`,
      duration: 'short',
    });
    openLivebooksCloudHome();
    return;
  }
  ipc.openLink(livebooksCloudSignInUrl());
}

export function openLivebooksCloudSignUp(): void {
  ipc.openLink(livebooksCloudSignUpUrl());
}

export function openLivebooksCloudSubscribe(): void {
  ipc.openLink(livebooksCloudSubscribeUrl());
}

/** Opens signed-in cloud home (cookie session); user can use “Connect account to desktop app”. */
export function openLivebooksCloudHome(): void {
  ipc.openLink(livebooksCloudRootUrl());
}

export function openLivebooksCloudAccountSecurity(): void {
  ipc.openLink(livebooksCloudAccountSecurityUrl());
}

export async function signOutLivebooksCloud(): Promise<void> {
  await ipc.clearLivebooksCloudSession();
}

export type LivebooksCloudApiResult = {
  ok: boolean;
  status: number;
  data: unknown;
  etag?: string;
  /** ISO8601 from X-Subscription-Changed-At when the server subscription revision moved. */
  subscriptionChangedAt?: string;
};

/** Bearer-authenticated JSON call to LiveBooks Cloud (via main process). */
export async function livebooksCloudRequest(options: {
  method: string;
  path: string;
  body?: unknown;
  skipAuth?: boolean;
  headers?: Record<string, string>;
}): Promise<LivebooksCloudApiResult> {
  // Desktop-side guardrail: de-dupe identical in-flight calls and add a small per-endpoint cooldown
  // so repeated UI refreshes can't accidentally hammer the cloud.
  const method = options.method.toUpperCase();
  const key = `${method} ${options.path}`;
  const now = Date.now();

  const isHotPath =
    options.path.startsWith('/api/v1/books/') &&
    (options.path.includes('/plaid/import_batches') ||
      options.path.includes('/plaid_feeds') ||
      options.path.includes('/plaid/linked_accounts') ||
      options.path.includes('/plaid/statement_files') ||
      options.path.includes('/plaid/items/'));

  const cooldownMs = isHotPath ? 800 : 0;

  const root = globalThis as unknown as {
    __livebooksCloudRL?: {
      inflight: Map<string, Promise<LivebooksCloudApiResult>>;
      lastStartedAt: Map<string, number>;
    };
  };
  if (!root.__livebooksCloudRL) {
    root.__livebooksCloudRL = {
      inflight: new Map(),
      lastStartedAt: new Map(),
    };
  }
  const store = root.__livebooksCloudRL;

  const existing = store.inflight.get(key);
  if (existing) {
    return await existing;
  }

  const last = store.lastStartedAt.get(key) ?? 0;
  if (cooldownMs > 0 && now - last < cooldownMs) {
    return {
      ok: false,
      status: 429,
      data: {
        error: 'rate_limited',
        message: t`Please wait a moment and try again.`,
      },
    };
  }
  store.lastStartedAt.set(key, now);

  const p = (async () => {
    return (await ipc.livebooksCloudApi(options)) as LivebooksCloudApiResult;
  })();
  store.inflight.set(key, p);
  try {
    const result = await p;
    if (result.subscriptionChangedAt) {
      void import('src/utils/livebooksCloudSubscription').then(
        ({ onSubscriptionRevisionFromServer }) =>
          onSubscriptionRevisionFromServer(result.subscriptionChangedAt)
      );
    }
    return result;
  } finally {
    store.inflight.delete(key);
  }
}

export async function fetchLivebooksCloudSubscription(): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  return await ipc.livebooksCloudApi({
    method: 'GET',
    path: '/api/v1/me/subscription',
  });
}

export async function openLivebooksCloudBillingPortal(): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  etag?: string;
}> {
  const res = await ipc.livebooksCloudApi({
    method: 'POST',
    path: '/api/v1/me/billing_portal_session',
    body: {},
  });
  if (
    res.ok &&
    res.data &&
    typeof res.data === 'object' &&
    res.data !== null &&
    'url' in res.data
  ) {
    const url = (res.data as { url: unknown }).url;
    if (typeof url === 'string' && url.length > 0) {
      ipc.openLink(url);
    }
  }
  return res;
}

export function getLivebooksCloudOriginForDisplay(): string {
  return getLivebooksCloudOrigin();
}

/** User-facing copy when the cloud API cannot be reached (e.g. server stopped, wrong origin). */
export function livebooksCloudUnreachableUserMessage(): string {
  return t`Unable to connect to LiveBooks Cloud. Please disconnect and try again.`;
}
