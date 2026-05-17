/**
 * Day-1 Phase 4 — run deviceId reconciliation after DB connect.
 */

import type { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import {
  getLivebooksCloudSessionSummary,
  livebooksCloudRequest,
} from 'src/utils/livebooksCloud';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  reconcileDeviceIds,
  resolveLedgerDeviceId,
} from 'utils/sync/syncDeviceGuard';
import type { SyncDeviceSnapshot } from 'utils/sync/types';

export type { SyncDeviceSnapshot };

export async function fetchSyncWatermark(
  fyo: Fyo,
  deviceId: string
): Promise<number | null> {
  const book = await ensureLivebooksCloudBookId(fyo);
  if (!book.ok) {
    return null;
  }

  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${encodeURIComponent(
      book.bookId
    )}/sync/watermark?device_id=${encodeURIComponent(deviceId)}`,
  });

  if (!res.ok || !res.data || typeof res.data !== 'object') {
    return null;
  }

  const seq = (res.data as { client_seq?: unknown }).client_seq;
  return typeof seq === 'number' ? seq : null;
}

export async function runSyncDeviceGuard(
  fyo: Fyo
): Promise<SyncDeviceSnapshot> {
  const machineDeviceId = fyo.store.deviceId;
  const ledgerFromSettings = (await fyo.getValue(
    ModelNameEnum.SystemSettings,
    'ledgerDeviceId'
  )) as string | undefined;

  const mutationRows = (await fyo.db.getAllRaw(ModelNameEnum.LocalMutation, {
    fields: ['deviceId'],
    orderBy: 'clientSeq',
    order: 'desc',
    limit: 1,
  })) as { deviceId?: string }[];

  const legacyInstanceId = (await fyo.getValue(
    ModelNameEnum.SystemSettings,
    'instanceId'
  )) as string | undefined;

  const ledgerDeviceId = resolveLedgerDeviceId({
    ledgerDeviceId: ledgerFromSettings,
    mutations: mutationRows,
    legacyInstanceId,
  });

  const { signedIn } = await getLivebooksCloudSessionSummary();
  let cloudReachable = false;
  if (signedIn) {
    const ping = await livebooksCloudRequest({
      method: 'GET',
      path: '/api/v1/me',
      skipAuth: false,
    });
    cloudReachable = ping.status !== 0;
  }

  const result = reconcileDeviceIds({
    ledgerDeviceId,
    machineDeviceId,
    cloudReachable,
  });

  if (!ledgerFromSettings && result.status === 'matched') {
    const systemSettings = await fyo.doc.getDoc(ModelNameEnum.SystemSettings);
    await systemSettings.setAndSync('ledgerDeviceId', machineDeviceId);
  }

  let serverWatermark: number | null = null;
  if (result.requiresHandshake) {
    serverWatermark = await fetchSyncWatermark(fyo, machineDeviceId);
  }

  const snapshot: SyncDeviceSnapshot = {
    status: result.status,
    ledgerDeviceId: result.ledgerDeviceId,
    machineDeviceId: result.machineDeviceId,
    requiresHandshake: result.requiresHandshake,
    serverWatermark,
  };

  fyo.store.syncDevice = snapshot;
  return snapshot;
}

/** Apply user choice after online device mismatch (Continue as this computer). */
export async function adoptMachineAsLedgerDevice(fyo: Fyo): Promise<void> {
  const systemSettings = await fyo.doc.getDoc(ModelNameEnum.SystemSettings);
  await systemSettings.setAndSync('ledgerDeviceId', fyo.store.deviceId);
  fyo.store.syncDevice = {
    status: 'matched',
    ledgerDeviceId: fyo.store.deviceId,
    machineDeviceId: fyo.store.deviceId,
    requiresHandshake: false,
    serverWatermark: null,
  };
}
