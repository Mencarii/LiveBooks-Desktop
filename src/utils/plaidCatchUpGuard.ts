/**
 * Continuity-based Plaid catch-up guard (desktop).
 * Avoids flat calendar idle blocks that would strand valid cloud backlog.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WARN_CATCHUP_MS = 150 * ONE_DAY_MS;
const EXTREME_IDLE_MS = 180 * ONE_DAY_MS;
const CONTINUITY_SLACK_MS = ONE_DAY_MS;

export type PlaidCatchUpBlockReason = 'gap_detected' | 'extreme_idle';

export type PlaidCatchUpDecision =
  | { allow: true; warning?: string }
  | { allow: false; reason: PlaidCatchUpBlockReason; message: string };

export function evaluatePlaidCatchUp(opts: {
  lastSuccessfulPlaidApplyAt: string | null | undefined;
  oldestPendingCreatedAt: string | null | undefined;
  pendingBatchCount: number;
  nowMs?: number;
}): PlaidCatchUpDecision {
  const nowMs = opts.nowMs ?? Date.now();
  const lastRaw = opts.lastSuccessfulPlaidApplyAt;
  const lastMs =
    typeof lastRaw === 'string' && lastRaw.length > 0
      ? Date.parse(lastRaw)
      : Number.NaN;

  if (Number.isNaN(lastMs)) {
    return { allow: true };
  }

  const idleMs = nowMs - lastMs;

  if (opts.pendingBatchCount === 0 && idleMs > EXTREME_IDLE_MS) {
    return {
      allow: false,
      reason: 'extreme_idle',
      message:
        'Bank feed has been idle for more than 180 days with no pending batches. Import a CSV or OFX file to catch up, or use Pull anyway after reviewing your books.',
    };
  }

  const oldestRaw = opts.oldestPendingCreatedAt;
  if (typeof oldestRaw === 'string' && oldestRaw.length > 0) {
    const oldestMs = Date.parse(oldestRaw);
    if (!Number.isNaN(oldestMs) && oldestMs - lastMs > CONTINUITY_SLACK_MS) {
      return {
        allow: false,
        reason: 'gap_detected',
        message:
          'A gap was detected between your last successful bank feed apply and the oldest pending batch. Import CSV/OFX for the missing period, or use Pull anyway after confirming cloud data is complete.',
      };
    }
  }

  if (idleMs > WARN_CATCHUP_MS) {
    return {
      allow: true,
      warning: 'Large catch-up in progress; this may take a few minutes.',
    };
  }

  return { allow: true };
}

export function oldestCreatedAt(
  createdAts: (string | null | undefined)[]
): string | null {
  let oldest: string | null = null;
  for (const raw of createdAts) {
    if (typeof raw !== 'string' || !raw) {
      continue;
    }
    if (oldest === null || raw < oldest) {
      oldest = raw;
    }
  }
  return oldest;
}
