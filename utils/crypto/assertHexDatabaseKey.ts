/**
 * Day-1 Phase 1.2 — single source of truth for the SQLCipher hex-key shape.
 *
 * Every PRAGMA / IPC / cloud-escrow boundary that touches the database key
 * MUST run the value through one of these helpers before doing anything
 * else with it. Re-exported from {@link backend/database/cipherProfile.ts}
 * so call sites can import from the canonical "utils/crypto" namespace.
 */

const HEX_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

export const HEX_KEY_LENGTH = 64;

export function isHexDatabaseKey64(value: unknown): value is string {
  return typeof value === 'string' && HEX_KEY_REGEX.test(value);
}

export function assertHexDatabaseKey64(
  value: unknown
): asserts value is string {
  if (!isHexDatabaseKey64(value)) {
    throw new Error(
      'Invalid database encryption key: expected 64 hexadecimal characters'
    );
  }
}
