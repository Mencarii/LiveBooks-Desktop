/**
 * runtime mirror of `build/signingIdentity.mjs`.
 *
 * The `safeStorage`-backed SQLCipher key store is scoped to the app's
 * bundle id + code-signing identity. A silent change to either at build
 * time would brick every shipped user's keychain slot. We freeze the
 * values in `build/signingIdentity.mjs` (so electron-builder always
 * bakes the same identity) and mirror them here so the packaged main
 * process can fail loudly on boot when the running binary doesn't match
 * the frozen contract.
 *
 * The mirror is enforced by `main/tests/testFrozenSigningIdentity.spec.ts`
 * — if you change one constant without the other, the test fails.
 */

import { app } from 'electron';

export const FROZEN_BUNDLE_ID = 'io.livebooks.desktop';
export const FROZEN_PRODUCT_NAME = 'LiveBooks Desktop';

export type SigningIdentityCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'product_name_mismatch' | 'bundle_id_mismatch';
      expected: string;
      actual: string;
    };

/**
 * Returns the macOS bundle id when available, otherwise null. Electron
 * does not expose a stable cross-platform "bundle id" getter; on macOS
 * the canonical source is `app.getName()` *plus* the bundle's
 * `CFBundleIdentifier`, which `electron`'s typings don't surface
 * directly. We rely on `(app as any).getBundleId?.()` which is exposed
 * by Electron on darwin in practice and is undefined elsewhere.
 */
function readMacBundleId(): string | null {
  if (process.platform !== 'darwin') {
    return null;
  }
  const fn = (app as unknown as { getBundleId?: () => string }).getBundleId;
  if (typeof fn !== 'function') {
    return null;
  }
  try {
    const value = fn.call(app);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Verify that the running binary's product name and bundle id match the
 * frozen contract. Intended to be called once during main-process boot
 * in packaged builds only.
 */
export function verifyFrozenSigningIdentity(): SigningIdentityCheck {
  const productName = app.getName();
  if (productName !== FROZEN_PRODUCT_NAME) {
    return {
      ok: false,
      reason: 'product_name_mismatch',
      expected: FROZEN_PRODUCT_NAME,
      actual: productName,
    };
  }

  const macBundleId = readMacBundleId();
  if (macBundleId && macBundleId !== FROZEN_BUNDLE_ID) {
    return {
      ok: false,
      reason: 'bundle_id_mismatch',
      expected: FROZEN_BUNDLE_ID,
      actual: macBundleId,
    };
  }

  return { ok: true };
}

/**
 * Boot-time guard for packaged builds. A mismatch means the build
 * shipped with a different signing identity than the frozen contract,
 * which would invalidate every user's `safeStorage` slot. Throw rather
 * than continue and silently re-key.
 *
 * No-op for dev / test / unpackaged runs — those are expected to differ
 * (the dev branding sets a different product name on purpose).
 */
export function assertFrozenSigningIdentityForPackagedBuild(): void {
  if (!app.isPackaged) {
    return;
  }
  const result = verifyFrozenSigningIdentity();
  if (result.ok) {
    return;
  }
  throw new Error(
    `LiveBooks Desktop signing identity mismatch (${result.reason}): ` +
      `expected "${result.expected}", got "${result.actual}". ` +
      `This packaged build was produced with a different bundle id / ` +
      `product name than the frozen contract in ` +
      `build/signingIdentity.mjs. Refusing to boot — every user's OS ` +
      `keychain entry would be invalidated. Roll back the change or ` +
      `ship a documented re-key migration first.`
  );
}
