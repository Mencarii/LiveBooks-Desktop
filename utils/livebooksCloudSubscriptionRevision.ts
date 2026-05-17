/** Pure helpers for Phase 2.7 subscription revision detection (no fyo/ipc). */

export function parseSubscriptionChangedAtIso(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string' || !value.length) {
    return null;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return null;
  }
  return value;
}

export function isSubscriptionRevisionNewer(
  storedIso: string | null,
  serverIso: string | null
): boolean {
  const server = parseSubscriptionChangedAtIso(serverIso);
  if (!server) {
    return false;
  }
  const stored = parseSubscriptionChangedAtIso(storedIso);
  if (!stored) {
    return false;
  }
  return Date.parse(server) > Date.parse(stored);
}
