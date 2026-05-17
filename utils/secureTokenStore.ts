/**
 * Day-1 Phase 1.4 — refresh / access token storage policy.
 *
 *   * If +safeStorage+ is available, tokens are stored encrypted under
 *     +<key>_encrypted+ (base64). Existing plaintext entries are
 *     transparently upgraded on first read.
 *
 *   * If +safeStorage+ is unavailable AND the app is packaged, we REFUSE
 *     to write a plaintext fallback. Persisting refresh tokens in
 *     plaintext on disk is a permanent leak we won't accept in production
 *     just to spare the user a re-authentication. Instead, the user must
 *     re-authenticate each launch and Settings shows a "Secure storage
 *     unavailable" warning badge (UI added in Phase 2.3).
 *
 *   * In dev / unpackaged builds plaintext fallback is allowed so
 *     contributors aren't blocked when running the app without code
 *     signing.
 */

import { app, safeStorage } from 'electron';
import config from './config';

const TOKEN_KEYS = [
  'livebooksCloudAccessToken',
  'livebooksCloudRefreshToken',
] as const;

type TokenKey = typeof TOKEN_KEYS[number];

function encryptedKey(key: TokenKey): string {
  return `${key}_encrypted`;
}

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function plaintextFallbackAllowed(): boolean {
  // app.isPackaged reflects whether this is a real install vs `npm run dev`.
  // Tests run unpackaged with safeStorage stubbed, so they retain the
  // legacy fallback behavior they rely on.
  let packaged = false;
  try {
    packaged = app.isPackaged;
  } catch {
    packaged = false;
  }
  return !packaged;
}

export function getSecureToken(key: TokenKey): string | null {
  if (isEncryptionAvailable()) {
    const encrypted = config.get(encryptedKey(key));
    if (encrypted) {
      try {
        const buffer = Buffer.from(encrypted, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        config.delete(encryptedKey(key));
        return null;
      }
    }
  }

  const plaintext = config.get(key);
  if (typeof plaintext === 'string' && plaintext.length > 0) {
    if (isEncryptionAvailable()) {
      // Migrate the legacy plaintext slot into the encrypted slot.
      setSecureToken(key, plaintext);
      config.delete(key);
      return plaintext;
    }
    if (!plaintextFallbackAllowed()) {
      // Day-1 Phase 1.4: refuse to surface the plaintext token in
      // packaged builds even if a legacy install left one on disk.
      // Drop the legacy slot so we never trust it again.
      config.delete(key);
      return null;
    }
    return plaintext;
  }

  return null;
}

export function setSecureToken(key: TokenKey, value: string): void {
  if (isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(value);
      config.set(encryptedKey(key), encrypted.toString('base64'));
      config.delete(key);
      return;
    } catch {
      // Fall through to the unavailable-encryption branch.
    }
  }

  if (!plaintextFallbackAllowed()) {
    // Day-1 Phase 1.4 — in packaged builds without OS keychain support,
    // skip persistence entirely. The user will be prompted to sign in
    // again on next launch; that is preferable to a plaintext token on
    // disk. Settings (Phase 2.3) surfaces the warning badge.
    config.delete(encryptedKey(key));
    config.delete(key);
    return;
  }

  config.set(key, value);
}

export function deleteSecureToken(key: TokenKey): void {
  config.delete(key);
  config.delete(encryptedKey(key));
}

export function deleteAllSecureTokens(): void {
  for (const key of TOKEN_KEYS) {
    deleteSecureToken(key);
  }
}

export function hasSecureToken(key: TokenKey): boolean {
  const token = getSecureToken(key);
  return typeof token === 'string' && token.length > 0;
}

/**
 * True when refresh-token persistence is silently degraded — used by the
 * Settings UI to show the "Secure storage unavailable" badge. Returns
 * false in dev because plaintext fallback is allowed there.
 */
export function isSecureStorageDegraded(): boolean {
  return !isEncryptionAvailable() && !plaintextFallbackAllowed();
}
