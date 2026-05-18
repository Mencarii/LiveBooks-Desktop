/**
 * document identity primitives.
 *
 * Generates v4 UUIDs without importing Node's `crypto` module (which
 * Vite externalizes in the renderer). Resolves the crypto API at
 * runtime so this works in the Electron renderer, main process, and
 * Vite dev server.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  if (typeof self !== 'undefined' && self.crypto) return self.crypto;
  if (typeof globalThis !== 'undefined' && globalThis.crypto)
    return globalThis.crypto;
  // Electron main process / older Node — dynamic require avoids Vite bundling
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto') as typeof import('crypto');
  return nodeCrypto as unknown as Crypto;
}

let _crypto: Crypto | undefined;
function getCrypto(): Crypto {
  if (!_crypto) _crypto = resolveCrypto();
  return _crypto;
}

function uuidV4(): string {
  const c = getCrypto();
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
}

/** Random v4 id for `name` on new rows (Tier A / B / C2). */
export function generateDocId(): string {
  return uuidV4();
}

export function isUuidDocId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Stable device id for sync ; not the legacy base36 random string. */
export function generateDeviceId(): string {
  return uuidV4();
}
