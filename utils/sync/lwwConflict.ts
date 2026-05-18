/**
 * last-write-wins conflict resolution (pure).
 */

import type { SyncConflictRow } from 'utils/sync/types';

export type LwwDocRevision = {
  deviceId: string;
  updatedAt: string;
  rowVersion?: number;
  payload: Record<string, unknown>;
};

export type LwwResolution = {
  winner: LwwDocRevision;
  loser: LwwDocRevision;
  conflict: SyncConflictRow;
};

function parseUpdatedAt(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function revisionRowVersion(rev: LwwDocRevision): number {
  const v = rev.rowVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Pick the winning revision: higher `rowVersion` when both sides provide it,
 * else `updatedAt`; server tiebreaker prefers `serverPreferredDeviceId` when
 * timestamps are equal.
 */
export function resolveLwwConflict(
  local: LwwDocRevision,
  remote: LwwDocRevision,
  serverPreferredDeviceId?: string
): LwwResolution {
  const localVer = revisionRowVersion(local);
  const remoteVer = revisionRowVersion(remote);
  const hasVersionTiebreak =
    local.rowVersion !== undefined || remote.rowVersion !== undefined;

  if (hasVersionTiebreak && remoteVer !== localVer) {
    const winner = remoteVer > localVer ? remote : local;
    const loser = winner === remote ? local : remote;
    return buildResolution(winner, loser);
  }

  const localTs = parseUpdatedAt(local.updatedAt);
  const remoteTs = parseUpdatedAt(remote.updatedAt);

  let winner: LwwDocRevision;
  let loser: LwwDocRevision;

  if (remoteTs > localTs) {
    winner = remote;
    loser = local;
  } else if (localTs > remoteTs) {
    winner = local;
    loser = remote;
  } else if (
    serverPreferredDeviceId &&
    remote.deviceId === serverPreferredDeviceId
  ) {
    winner = remote;
    loser = local;
  } else {
    winner = local;
    loser = remote;
  }

  return buildResolution(winner, loser);
}

function buildResolution(
  winner: LwwDocRevision,
  loser: LwwDocRevision
): LwwResolution {
  return {
    winner,
    loser,
    conflict: {
      schemaName: String(winner.payload.schemaName ?? ''),
      docName: String(winner.payload.docName ?? winner.payload.name ?? ''),
      winnerDeviceId: winner.deviceId,
      loserDeviceId: loser.deviceId,
      winnerUpdatedAt: winner.updatedAt,
      loserUpdatedAt: loser.updatedAt,
      resolution: 'lww',
    },
  };
}
