/**
 * Day-1 Phase 2.7 — subscription staleness polling for desktop.
 *
 * Polls +GET /api/v1/me/subscription+ on launch and every 24 hours while the
 * app is open. When the server bumps +subscription_changed_at+ (Stripe webhooks),
 * any authenticated API response can trigger an immediate re-poll so Pro UI
 * and entitlements stay in sync without restarting the app.
 */

import { fyo } from 'src/initFyo';
import {
  dispatchLivebooksCloudSessionAppRefresh,
  fetchLivebooksCloudSubscription,
} from 'src/utils/livebooksCloud';
import {
  isSubscriptionRevisionNewer,
  parseSubscriptionChangedAtIso,
} from 'utils/livebooksCloudSubscriptionRevision';
import {
  completeOutboxReconcile,
  onProEntitlementChanged,
} from 'utils/sync/outboxSyncState';

export {
  isSubscriptionRevisionNewer,
  parseSubscriptionChangedAtIso,
} from 'utils/livebooksCloudSubscriptionRevision';

export type LivebooksSubscriptionSnapshot = {
  signedIn: boolean;
  reachable: boolean;
  status: string | null;
  inGracePeriod: boolean;
  proEntitled: boolean;
  /** ISO timestamp of last successful poll. */
  polledAt: string | null;
};

const PRO_STATUSES = new Set(['active', 'trialing']);
const CONFIG_SUBSCRIPTION_CHANGED_AT = 'livebooksCloudSubscriptionChangedAt';

let snapshot: LivebooksSubscriptionSnapshot = {
  signedIn: false,
  reachable: false,
  status: null,
  inGracePeriod: false,
  proEntitled: false,
  polledAt: null,
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let visibilityListener: (() => void) | null = null;
let visibilityDebounce: ReturnType<typeof setTimeout> | null = null;
const POLL_MS = 24 * 60 * 60 * 1000;

const listeners = new Set<(s: LivebooksSubscriptionSnapshot) => void>();

function notify(): void {
  for (const fn of listeners) {
    fn(snapshot);
  }
}

function parseSubscriptionPayload(data: unknown): {
  status: string | null;
  inGracePeriod: boolean;
  subscriptionChangedAt: string | null;
} {
  if (!data || typeof data !== 'object') {
    return { status: null, inGracePeriod: false, subscriptionChangedAt: null };
  }
  const obj = data as {
    status?: unknown;
    in_grace_period?: unknown;
    subscription_changed_at?: unknown;
  };
  const status = typeof obj.status === 'string' ? obj.status : null;
  const subscriptionChangedAt =
    typeof obj.subscription_changed_at === 'string'
      ? obj.subscription_changed_at
      : null;
  return {
    status,
    inGracePeriod: obj.in_grace_period === true,
    subscriptionChangedAt,
  };
}

function getStoredSubscriptionChangedAt(): string | null {
  return parseSubscriptionChangedAtIso(
    fyo.config.get(CONFIG_SUBSCRIPTION_CHANGED_AT, null) as string | null
  );
}

function setStoredSubscriptionChangedAt(iso: string | null): void {
  fyo.config.set(CONFIG_SUBSCRIPTION_CHANGED_AT, iso);
}

function rememberSubscriptionChangedAt(serverIso: string | null): void {
  const parsed = parseSubscriptionChangedAtIso(serverIso);
  if (parsed) {
    setStoredSubscriptionChangedAt(parsed);
  }
}

function clearStoredSubscriptionChangedAt(): void {
  setStoredSubscriptionChangedAt(null);
}

let refreshInFlight: Promise<LivebooksSubscriptionSnapshot> | null = null;

/**
 * When the server reports a newer +subscription_changed_at+ than we last saw
 * (via API header or subscription JSON), re-poll entitlement and refresh UI.
 */
export async function onSubscriptionRevisionFromServer(
  serverIso: string | null | undefined
): Promise<void> {
  const server = parseSubscriptionChangedAtIso(serverIso ?? null);
  if (!server) {
    return;
  }

  const stored = getStoredSubscriptionChangedAt();
  if (!stored) {
    rememberSubscriptionChangedAt(server);
    return;
  }

  if (!isSubscriptionRevisionNewer(stored, server)) {
    return;
  }

  rememberSubscriptionChangedAt(server);

  const { signedIn } = await ipc.getLivebooksCloudSession();
  if (!signedIn) {
    return;
  }

  await refreshLivebooksSubscription(true);
  dispatchLivebooksCloudSessionAppRefresh();
}

export function isProEntitledStatus(
  status: string | null,
  inGracePeriod: boolean
): boolean {
  if (!status) {
    return false;
  }
  if (PRO_STATUSES.has(status)) {
    return true;
  }
  if (status === 'past_due' && inGracePeriod) {
    return true;
  }
  return false;
}

export function getLivebooksSubscriptionSnapshot(): LivebooksSubscriptionSnapshot {
  return { ...snapshot };
}

export function subscribeLivebooksSubscription(
  listener: (s: LivebooksSubscriptionSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export async function refreshLivebooksSubscription(
  signedIn: boolean
): Promise<LivebooksSubscriptionSnapshot> {
  if (refreshInFlight) {
    return await refreshInFlight;
  }

  refreshInFlight = refreshLivebooksSubscriptionInner(signedIn);
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function refreshLivebooksSubscriptionInner(
  signedIn: boolean
): Promise<LivebooksSubscriptionSnapshot> {
  if (!signedIn) {
    const prevPro = snapshot.proEntitled;
    clearStoredSubscriptionChangedAt();
    snapshot = {
      signedIn: false,
      reachable: false,
      status: null,
      inGracePeriod: false,
      proEntitled: false,
      polledAt: new Date().toISOString(),
    };
    if (prevPro) {
      onProEntitlementChanged(false);
    }
    notify();
    return snapshot;
  }

  try {
    const res = await fetchLivebooksCloudSubscription();
    const { status, inGracePeriod, subscriptionChangedAt } =
      parseSubscriptionPayload(res.data);
    if (subscriptionChangedAt) {
      rememberSubscriptionChangedAt(subscriptionChangedAt);
    }
    const prevPro = snapshot.proEntitled;
    const nextPro = isProEntitledStatus(status, inGracePeriod);
    snapshot = {
      signedIn: true,
      reachable: res.status !== 0,
      status,
      inGracePeriod,
      proEntitled: nextPro,
      polledAt: new Date().toISOString(),
    };
    if (prevPro !== nextPro) {
      onProEntitlementChanged(nextPro);
      if (nextPro && !prevPro) {
        completeOutboxReconcile();
      }
    }
  } catch {
    const prevPro = snapshot.proEntitled;
    snapshot = {
      signedIn: true,
      reachable: false,
      status: null,
      inGracePeriod: false,
      proEntitled: false,
      polledAt: new Date().toISOString(),
    };
    if (prevPro) {
      onProEntitlementChanged(false);
    }
  }

  notify();
  return snapshot;
}

function scheduleVisibilitySubscriptionRefresh(): void {
  if (visibilityDebounce) {
    clearTimeout(visibilityDebounce);
  }
  visibilityDebounce = setTimeout(() => {
    visibilityDebounce = null;
    void (async () => {
      const session = await ipc.getLivebooksCloudSession();
      if (!session.signedIn) {
        return;
      }
      await refreshLivebooksSubscription(true);
    })();
  }, 400);
}

/** Start 24h polling after an initial refresh. */
export async function startLivebooksSubscriptionPolling(): Promise<void> {
  const { signedIn } = await ipc.getLivebooksCloudSession();
  await refreshLivebooksSubscription(signedIn);

  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    void (async () => {
      const session = await ipc.getLivebooksCloudSession();
      await refreshLivebooksSubscription(session.signedIn);
    })();
  }, POLL_MS);

  if (visibilityListener) {
    document.removeEventListener('visibilitychange', visibilityListener);
  }
  visibilityListener = () => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    scheduleVisibilitySubscriptionRefresh();
  };
  document.addEventListener('visibilitychange', visibilityListener);
}

export function stopLivebooksSubscriptionPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (visibilityDebounce) {
    clearTimeout(visibilityDebounce);
    visibilityDebounce = null;
  }
  if (visibilityListener) {
    document.removeEventListener('visibilitychange', visibilityListener);
    visibilityListener = null;
  }
}
