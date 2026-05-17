/**
 * Thin wrapper around the renderer-side `Notification` Web API.
 *
 * - Permission is requested lazily; never on first paint.
 * - Notifications only fire when the LiveBooks window is hidden (`document.hidden`),
 *   so we don't double-notify a user who's already looking at the bank feed.
 * - Per-Plaid-Item rate limit of one notification every 5 minutes prevents
 *   spammy firings when a webhook flurry produces several batches in a row.
 */

const PER_ITEM_COOLDOWN_MS = 5 * 60 * 1000;
const lastNotifiedAt = new Map<string, number>();

function notificationsAvailable(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsAvailable()) {
    return 'denied';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export type NotifyNewBatchesArgs = {
  itemId: string;
  totalBatchesAdded: number;
  institutionName?: string | null;
};

/**
 * Fire one OS notification per Plaid item, rate-limited.
 * No-op when permission is not granted, the window is visible, or the
 * caller passes a non-positive count.
 */
export function notifyNewBatches(args: NotifyNewBatchesArgs): void {
  if (!notificationsAvailable()) {
    return;
  }
  if (Notification.permission !== 'granted') {
    return;
  }
  if (typeof document !== 'undefined' && !document.hidden) {
    return;
  }
  if (!args.itemId || !(args.totalBatchesAdded > 0)) {
    return;
  }

  const now = Date.now();
  const last = lastNotifiedAt.get(args.itemId) ?? 0;
  if (now - last < PER_ITEM_COOLDOWN_MS) {
    return;
  }
  lastNotifiedAt.set(args.itemId, now);

  const inst = args.institutionName?.trim() || 'Your bank';
  const noun = args.totalBatchesAdded === 1 ? 'batch' : 'batches';
  try {
    new Notification('LiveBooks: new bank data', {
      body: `${args.totalBatchesAdded} new ${noun} from ${inst} ready to review.`,
      tag: `livebooks-plaid-${args.itemId}`,
      silent: false,
    });
  } catch {
    // Some Electron builds throw if the notification system is unavailable
    // (e.g. headless test runners); swallow and keep the cooldown to avoid
    // hot-looping retries.
  }
}

/** Test/debug helper: clear the per-item cooldown map. */
export function resetDesktopNotificationCooldowns(): void {
  lastNotifiedAt.clear();
}
