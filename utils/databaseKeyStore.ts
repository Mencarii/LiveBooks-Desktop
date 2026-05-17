/**
 * Day-1 Phase 1.1 — namespaced SQLCipher key store (main process only).
 *
 * Replaces the legacy +getOrCreateDatabaseKey+ design, which had two
 * critical bugs:
 *
 *   1. Decrypt failure was treated as "no key" and a *new* key was
 *      written, bricking the encrypted .db on disk.
 *   2. The global slot +dbEncryptionKey_encrypted+ meant two cloud users
 *      sharing one OS login clobbered each other's key.
 *
 * The new model:
 *
 *   * Keys live at +`dbEncryptionKey_${accountKey}_encrypted`+.
 *   * +accountKey+ is the cloud user id when signed in, or
 *     +`local_${uuid}`+ for unsigned-in books (per-book namespace).
 *   * Reads NEVER write. There is no +getOrCreate+. Decrypt failure
 *     returns +null+; the caller must surface +KEYCHAIN_CORRUPTED+ and
 *     route to /recovery.
 *   * +createDatabaseKeyForNewBook+ is the ONLY function that mints a new
 *     random key. It is reachable from +DB_CREATE+, never +DB_CONNECT+.
 *   * +setDatabaseKeyFromRecovery+ writes a key delivered by cloud
 *     escrow. Main process only.
 *
 * @see plan day-1_sync_foundation §1.1
 */

import crypto from 'crypto';
import { safeStorage } from 'electron';
import config from './config';
import {
  assertHexDatabaseKey64,
  isHexDatabaseKey64,
} from './crypto/assertHexDatabaseKey';
import { wipeSecretBuffer } from './crypto/secretBuffer';
import type { LocalBookKeyNamespace } from 'fyo/core/types';

/** Legacy global slot. Read-only after Phase 1 migration. */
const LEGACY_GLOBAL_KEY = 'dbEncryptionKey_encrypted';
const LOCAL_NAMESPACES_KEY = 'localBookKeyNamespaces';
const LOCAL_NAMESPACE_PREFIX = 'local_';

/**
 * CI/test bypass. Production code must NEVER set this and must NEVER
 * trust this value when +app.isPackaged+ is true; callers enforce that.
 */
const TEST_KEY_ENV = 'LIVEBOOKS_TEST_DB_KEY';

export type AccountKey = string;

export interface DatabaseKeyStoreOptions {
  /**
   * When true (test / dev only), allow +LIVEBOOKS_TEST_DB_KEY+ to satisfy
   * +getDatabaseKeyOnly+. Production code MUST NOT pass this.
   */
  allowTestEnvKey?: boolean;
}

function namespacedKey(accountKey: AccountKey): string {
  if (!accountKey || typeof accountKey !== 'string') {
    throw new Error('accountKey is required');
  }
  if (accountKey === 'encrypted') {
    // Defensive: prevents accidental collision with the legacy slot.
    throw new Error('accountKey "encrypted" is reserved');
  }
  return `dbEncryptionKey_${accountKey}_encrypted`;
}

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function generateRandomHexKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function readTestEnvKey(opts?: DatabaseKeyStoreOptions): string | null {
  if (!opts?.allowTestEnvKey) {
    return null;
  }
  const raw = process.env[TEST_KEY_ENV];
  if (typeof raw !== 'string') {
    return null;
  }
  if (!isHexDatabaseKey64(raw)) {
    return null;
  }
  return raw;
}

function readEncryptedString(slot: string): string | null {
  // electron-store typing is index-signature-aware after the ConfigMap
  // change; cast keeps the per-callsite ergonomic.
  const value = (config as unknown as { get: (k: string) => unknown }).get(
    slot
  );
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function writeEncryptedString(slot: string, base64Ciphertext: string): void {
  (config as unknown as { set: (k: string, v: string) => void }).set(
    slot,
    base64Ciphertext
  );
}

function deleteSlot(slot: string): void {
  (config as unknown as { delete: (k: string) => void }).delete(slot);
}

/**
 * Decrypt the namespaced SQLCipher key for +accountKey+ and return the
 * 64-hex string, or +null+ if no key is stored / decrypt fails / safeStorage
 * is unavailable.
 *
 * **Never** writes a new key. Decrypt failure means the OS keychain rolled
 * (e.g. signing identity changed) — the caller MUST surface
 * +KEYCHAIN_CORRUPTED+ and route to /recovery.
 */
export function getDatabaseKeyOnly(
  accountKey: AccountKey,
  opts?: DatabaseKeyStoreOptions
): string | null {
  const testKey = readTestEnvKey(opts);
  if (testKey) {
    return testKey;
  }

  if (!isEncryptionAvailable()) {
    return null;
  }

  const slot = namespacedKey(accountKey);
  const encrypted = readEncryptedString(slot);
  if (!encrypted) {
    return null;
  }

  let decrypted: string | null = null;
  try {
    const buffer = Buffer.from(encrypted, 'base64');
    decrypted = safeStorage.decryptString(buffer);
  } catch {
    return null;
  }

  if (!isHexDatabaseKey64(decrypted)) {
    // Stored value is corrupt or wrong shape; treat as missing without
    // overwriting (we never want a write on a read path).
    return null;
  }
  return decrypted;
}

/**
 * Persist a known-good 64-hex SQLCipher key for +accountKey+. Used by
 *
 *   * +createDatabaseKeyForNewBook+ (DB_CREATE only)
 *   * +setDatabaseKeyFromRecovery+ (cloud escrow)
 *   * +adoptLocalKeyForCloudAccount+ (sign-in migration)
 *
 * NOT exported as a primitive setter — the entry points above are the
 * only sanctioned write paths.
 */
function storeKeyForAccount(accountKey: AccountKey, hexKey: string): boolean {
  assertHexDatabaseKey64(hexKey);
  if (!isEncryptionAvailable()) {
    return false;
  }
  try {
    const cipher = safeStorage.encryptString(hexKey);
    writeEncryptedString(namespacedKey(accountKey), cipher.toString('base64'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Mint a new SQLCipher key for a brand-new database. Only legitimate at
 * +DB_CREATE+ or as the target side of a verified plaintext -> encrypted
 * migration (target migration code path documented in §1.3).
 */
export function createDatabaseKeyForNewBook(
  accountKey: AccountKey
): string | null {
  if (!isEncryptionAvailable()) {
    return null;
  }
  const hexKey = generateRandomHexKey();
  const ok = storeKeyForAccount(accountKey, hexKey);
  return ok ? hexKey : null;
}

/**
 * Persist a recovered key (from cloud escrow). +keyOrBuffer+ may be the
 * canonical 64-hex string OR a UTF-8 Buffer of the same. The Buffer form
 * is preferred so callers can wipe their copy after this returns.
 *
 * Returns true on success.
 */
export function setDatabaseKeyFromRecovery(
  accountKey: AccountKey,
  keyOrBuffer: string | Buffer
): boolean {
  let hexKey: string;
  let derivedFromBuffer = false;
  if (Buffer.isBuffer(keyOrBuffer)) {
    hexKey = keyOrBuffer.toString('utf8');
    derivedFromBuffer = true;
  } else {
    hexKey = keyOrBuffer;
  }

  if (!isHexDatabaseKey64(hexKey)) {
    return false;
  }

  const ok = storeKeyForAccount(accountKey, hexKey);

  if (derivedFromBuffer) {
    // Best-effort wipe of our derived Buffer. Caller is responsible for
    // wiping the input Buffer.
    try {
      wipeSecretBuffer(Buffer.from(hexKey, 'utf8'));
    } catch {
      // ignore
    }
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Local (unsigned-in) namespace mapping
// ---------------------------------------------------------------------------

function accountKeyFromBookEntry(entry: LocalBookKeyNamespace): string | null {
  const key =
    typeof entry.accountKey === 'string' && entry.accountKey.length > 0
      ? entry.accountKey
      : typeof entry.localNamespaceId === 'string' &&
        entry.localNamespaceId.length > 0
      ? entry.localNamespaceId
      : null;
  return key;
}

function readLocalNamespaceMap(): LocalBookKeyNamespace[] {
  const raw = (config as unknown as { get: (k: string) => unknown }).get(
    LOCAL_NAMESPACES_KEY
  );
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is LocalBookKeyNamespace =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as LocalBookKeyNamespace).dbPath === 'string' &&
      accountKeyFromBookEntry(entry as LocalBookKeyNamespace) !== null
  );
}

function writeLocalNamespaceMap(entries: LocalBookKeyNamespace[]): void {
  (config as unknown as { set: (k: string, v: unknown) => void }).set(
    LOCAL_NAMESPACES_KEY,
    entries
  );
}

/**
 * Allocate a fresh +local_{uuid}+ namespace for a new book created while
 * the user is signed out, persist the +dbPath+ → +localNamespaceId+
 * mapping, mint a key in that namespace, and return both.
 *
 * Critical: do NOT collapse multiple offline users on the same OS login
 * into a shared +local_default+ — see plan §"Trap" under 1.1.
 */
export function createLocalNamespaceForNewBook(dbPath: string): {
  localNamespaceId: AccountKey;
  hexKey: string;
} | null {
  if (!isEncryptionAvailable()) {
    return null;
  }
  const localNamespaceId = `${LOCAL_NAMESPACE_PREFIX}${crypto.randomUUID()}`;
  const hexKey = createDatabaseKeyForNewBook(localNamespaceId);
  if (!hexKey) {
    return null;
  }

  persistBookAccountKeyMapping(dbPath, localNamespaceId);
  return { localNamespaceId, hexKey };
}

/**
 * Record which +accountKey+ unlocks +dbPath+. Survives cloud sign-out so
 * the ledger can reopen without a live JWT.
 */
/**
 * Before clearing cloud session tokens, pin +dbPath+ → +cloudUserId+ so the
 * next signed-out +DB_CONNECT+ can still resolve the namespaced key.
 */
export function persistCloudBookMappingBeforeSignOut(
  cloudUserId: string,
  dbPath: string | null | undefined
): void {
  if (!dbPath || typeof dbPath !== 'string' || dbPath.length === 0) {
    return;
  }
  if (!hasEncryptedKeyBlobForAccount(cloudUserId)) {
    return;
  }
  persistBookAccountKeyMapping(dbPath, cloudUserId);
}

export function persistBookAccountKeyMapping(
  dbPath: string,
  accountKey: AccountKey
): void {
  const entries = readLocalNamespaceMap();
  const filtered = entries.filter((e) => e.dbPath !== dbPath);
  filtered.push({
    dbPath,
    accountKey,
    createdAt: new Date().toISOString(),
  });
  writeLocalNamespaceMap(filtered);
}

/**
 * Look up the +accountKey+ for +dbPath+ (local or cloud namespace).
 */
export function getAccountKeyForDbPath(dbPath: string): AccountKey | null {
  const entries = readLocalNamespaceMap();
  const found = entries.find((e) => e.dbPath === dbPath);
  return found ? accountKeyFromBookEntry(found) : null;
}

/** @deprecated use getAccountKeyForDbPath */
export function getLocalNamespaceForDbPath(dbPath: string): AccountKey | null {
  const key = getAccountKeyForDbPath(dbPath);
  return key?.startsWith(LOCAL_NAMESPACE_PREFIX) ? key : null;
}

/**
 * Resolve the +accountKey+ that owns +dbPath+'s SQLCipher key.
 *
 * Resolution order:
 *   1. Cloud user id when +cloudUserId+ is provided AND a namespaced key
 *      already exists for that user (covers signed-in connect).
 *   2. Persisted +dbPath+ → +accountKey+ mapping (covers signed-out connect
 *      after cloud adoption or disconnect).
 *   3. +null+ — caller decides whether to surface KEYCHAIN_CORRUPTED or
 *      kick off a +DB_CREATE+ flow.
 *
 * Note: this does NOT fall back to the legacy global slot. The migration
 * helper +migrateLegacyGlobalKeyIfPresent+ MUST be called explicitly at
 * sign-in to lift the global value into a namespaced slot.
 */
export function resolveAccountKeyForDbPath(
  dbPath: string,
  cloudUserId?: string
): AccountKey | null {
  if (cloudUserId && isEncryptionAvailable()) {
    const cloudSlot = namespacedKey(cloudUserId);
    if (readEncryptedString(cloudSlot)) {
      persistBookAccountKeyMapping(dbPath, cloudUserId);
      return cloudUserId;
    }
  }
  const mapped = getAccountKeyForDbPath(dbPath);
  if (mapped && hasEncryptedKeyBlobForAccount(mapped)) {
    return mapped;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/**
 * One-time migration: copy the legacy global +dbEncryptionKey_encrypted+
 * into a per-account namespace on first cloud sign-in.
 *
 *   * Idempotent: if a namespaced slot already exists, no-op.
 *   * Non-destructive: the legacy slot is left in place (a future migration
 *     can purge after we are certain all known installs have been lifted).
 *   * Returns true if a new namespaced slot was written.
 */
export function migrateLegacyGlobalKeyIfPresent(cloudUserId: string): boolean {
  if (!isEncryptionAvailable()) {
    return false;
  }
  const slot = namespacedKey(cloudUserId);
  if (readEncryptedString(slot)) {
    return false;
  }
  const legacy = readEncryptedString(LEGACY_GLOBAL_KEY);
  if (!legacy) {
    return false;
  }
  let hexKey: string | null = null;
  try {
    hexKey = safeStorage.decryptString(Buffer.from(legacy, 'base64'));
  } catch {
    return false;
  }
  if (!isHexDatabaseKey64(hexKey)) {
    return false;
  }
  return storeKeyForAccount(cloudUserId, hexKey);
}

/**
 * On first cloud sign-in for a book that was created offline:
 *
 *   1. Decrypt the +localNamespaceId+'s key.
 *   2. Re-encrypt it under +cloudUserId+'s namespace.
 *   3. Drop the local-namespace key slot and remap +localBookKeyNamespaces+
 *      entries to +cloudUserId+ (mapping is kept for signed-out reconnect).
 *
 * Returns true on success. Does nothing when the local key is missing,
 * already adopted, or safeStorage is unavailable.
 */
export function adoptLocalKeyForCloudAccount(
  cloudUserId: string,
  localNamespaceId: AccountKey
): boolean {
  if (!isEncryptionAvailable()) {
    return false;
  }
  if (!localNamespaceId.startsWith(LOCAL_NAMESPACE_PREFIX)) {
    return false;
  }

  const cloudSlot = namespacedKey(cloudUserId);
  if (readEncryptedString(cloudSlot)) {
    remapBookAccountKeys(localNamespaceId, cloudUserId);
    deleteSlot(namespacedKey(localNamespaceId));
    return true;
  }

  const localKey = getDatabaseKeyOnly(localNamespaceId);
  if (!localKey) {
    return false;
  }

  if (!storeKeyForAccount(cloudUserId, localKey)) {
    return false;
  }

  remapBookAccountKeys(localNamespaceId, cloudUserId);
  deleteSlot(namespacedKey(localNamespaceId));
  return true;
}

function remapBookAccountKeys(
  fromAccountKey: AccountKey,
  toAccountKey: AccountKey
): void {
  const entries = readLocalNamespaceMap();
  let changed = false;
  const updated = entries.map((entry) => {
    const current = accountKeyFromBookEntry(entry);
    if (current !== fromAccountKey) {
      return entry;
    }
    changed = true;
    return {
      dbPath: entry.dbPath,
      accountKey: toAccountKey,
      createdAt: entry.createdAt,
    };
  });
  if (changed) {
    writeLocalNamespaceMap(updated);
  }
}

// ---------------------------------------------------------------------------
// Status / capability checks
// ---------------------------------------------------------------------------

export function isDatabaseKeyAvailable(): boolean {
  return isEncryptionAvailable();
}

export function hasDatabaseKeyForAccount(accountKey: AccountKey): boolean {
  return getDatabaseKeyOnly(accountKey) !== null;
}

/** True when a namespaced ciphertext blob exists (decrypt may still fail). */
export function hasEncryptedKeyBlobForAccount(accountKey: AccountKey): boolean {
  return readEncryptedString(namespacedKey(accountKey)) !== null;
}

/**
 * DELETE a key. Used on account deletion only — never on connect failure.
 */
export function deleteDatabaseKeyForAccount(accountKey: AccountKey): void {
  deleteSlot(namespacedKey(accountKey));
}
