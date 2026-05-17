/**
 * Day-1 Phase 1.2 — main-process Buffer helpers for SQLCipher hex keys.
 *
 * Goals (see plan §"Threat model — cloud escrow"):
 *   * Minimize the time a database key spends as a JS String. V8 strings
 *     are reference-counted and may persist in heap snapshots indefinitely;
 *     Node Buffers can at least be zero-filled before being released.
 *   * Provide a single +withHexKeyBuffer+ scope so the wipe always runs in
 *     +finally+ even if the consumer throws.
 *
 * IMPORTANT: there is NO way to fully scrub a hex key from V8 once IPC
 * +JSON.parse+ touches it. These helpers limit *additional* lifetime,
 * they do not promise a perfect RAM scrub.
 */

import { assertHexDatabaseKey64 } from './assertHexDatabaseKey';

/**
 * Build a Buffer from a wire-format hex key. Validates the shape and never
 * returns a Buffer for an invalid key.
 */
export function hexKeyFromWire(hexKey: unknown): Buffer {
  assertHexDatabaseKey64(hexKey);
  return Buffer.from(hexKey, 'utf8');
}

/**
 * Zero-fill a secret Buffer in place. No-op for already-released buffers.
 */
export function wipeSecretBuffer(buf: Buffer | null | undefined): void {
  if (!buf) {
    return;
  }
  try {
    buf.fill(0);
  } catch {
    // Buffer may have been detached / released; nothing to wipe.
  }
}

/**
 * Run +fn+ with a Buffer containing the hex key, then zero-fill the buffer.
 * The key is wiped even if +fn+ throws.
 *
 *   await withHexKeyBuffer(hex, async (keyBuf) => {
 *     await persistKey(keyBuf);
 *   });
 *
 * The Buffer MUST NOT escape the callback's lifetime (do not store a
 * reference to it, do not return it). After +withHexKeyBuffer+ returns,
 * the underlying memory is zeroed.
 */
export async function withHexKeyBuffer<T>(
  hexKey: unknown,
  fn: (keyBuf: Buffer) => Promise<T> | T
): Promise<T> {
  const keyBuf = hexKeyFromWire(hexKey);
  try {
    return await fn(keyBuf);
  } finally {
    wipeSecretBuffer(keyBuf);
  }
}

/**
 * Synchronous variant for the rare paths (PRAGMA application) that cannot
 * be async without leaking abstractions.
 */
export function withHexKeyBufferSync<T>(
  hexKey: unknown,
  fn: (keyBuf: Buffer) => T
): T {
  const keyBuf = hexKeyFromWire(hexKey);
  try {
    return fn(keyBuf);
  } finally {
    wipeSecretBuffer(keyBuf);
  }
}
