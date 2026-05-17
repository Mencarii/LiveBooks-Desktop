/**
 * Day-1 Phase 2.1 — linear boot probe before DB_CONNECT.
 *
 * Implements the P0–P5 matrix from the Day-1 plan without ever writing a
 * new SQLCipher key on the read path.
 */

import { app } from 'electron';
import fs from 'fs-extra';
import {
  adoptLocalKeyForCloudAccount,
  getDatabaseKeyOnly,
  hasEncryptedKeyBlobForAccount,
  isDatabaseKeyAvailable,
  migrateLegacyGlobalKeyIfPresent,
  resolveAccountKeyForDbPath,
} from 'utils/databaseKeyStore';
import databaseManager from './manager';
import { probeAsPlaintext } from './migration';
import type { BootProbeResult } from './bootProbeTypes';

export type RunBootProbeOptions = {
  countryCode?: string;
  /** Cloud user id (JWT sub) when signed in; supplied by main process. */
  cloudUserId?: string | null;
  /** Test harness only — allows LIVEBOOKS_TEST_DB_KEY. */
  allowTestEnvKey?: boolean;
};

function resolveAccountKeyForConnect(
  dbPath: string,
  cloudUserId: string | null | undefined
): string | null {
  if (cloudUserId) {
    migrateLegacyGlobalKeyIfPresent(cloudUserId);
  }
  const resolved = resolveAccountKeyForDbPath(dbPath, cloudUserId ?? undefined);
  if (resolved) {
    if (cloudUserId && resolved.startsWith('local_')) {
      adoptLocalKeyForCloudAccount(cloudUserId, resolved);
      return cloudUserId;
    }
    return resolved;
  }
  return cloudUserId ?? null;
}

async function fileExists(dbPath: string): Promise<boolean> {
  if (dbPath === ':memory:') {
    return true;
  }
  try {
    return await fs.pathExists(dbPath);
  } catch {
    return false;
  }
}

/**
 * Probe whether the on-disk database can be opened with the current OS
 * keychain context. Does not mint keys.
 */
export async function runDatabaseBootProbe(
  dbPath: string,
  options?: RunBootProbeOptions
): Promise<BootProbeResult> {
  const keyOpts = options?.allowTestEnvKey
    ? { allowTestEnvKey: true }
    : undefined;

  if (!(await fileExists(dbPath))) {
    return { code: 'DB_OPEN_FAILED' };
  }

  const isPlaintext = probeAsPlaintext(dbPath);

  // P0 — no safeStorage and file is not plaintext (needs a wrapped key).
  if (!isDatabaseKeyAvailable() && !isPlaintext) {
    return { code: 'KEYCHAIN_UNAVAILABLE' };
  }

  const accountKey = resolveAccountKeyForConnect(dbPath, options?.cloudUserId);
  const hadBlob =
    accountKey !== null && hasEncryptedKeyBlobForAccount(accountKey);
  const encryptionKey = accountKey
    ? getDatabaseKeyOnly(accountKey, keyOpts)
    : null;

  if (!encryptionKey) {
    // P1c — plaintext fixture in dev only.
    if (
      isPlaintext &&
      !app.isPackaged &&
      isDatabaseKeyAvailable() &&
      accountKey
    ) {
      return { code: 'PLAINTEXT_DEV_MIGRATE' };
    }

    // P1a / P1b — encrypted (or unreadable) file without a usable key.
    if (!isPlaintext || hadBlob) {
      return { code: 'KEYCHAIN_CORRUPTED' };
    }

    return { code: 'KEYCHAIN_CORRUPTED' };
  }

  if (isPlaintext && !app.isPackaged) {
    return { code: 'PLAINTEXT_DEV_MIGRATE' };
  }

  // P2 — verify the key opens the file (includes legacy cipher upgrade).
  try {
    const countryCode = await databaseManager.connectToDatabase(
      dbPath,
      options?.countryCode,
      encryptionKey
    );
    return { code: 'OK', countryCode };
  } catch {
    return { code: 'DB_OPEN_FAILED' };
  }
}
