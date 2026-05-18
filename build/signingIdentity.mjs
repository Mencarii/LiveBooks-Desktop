/**
 * Frozen signing identity.
 *
 * macOS `safeStorage` (Keychain) and Windows `safeStorage` (DPAPI) entries
 * are scoped to the app's bundle id + code-signing identity. Changing
 * either after a release ships will roll every user's keychain slot,
 * which is **indistinguishable from a corrupted keychain** at runtime.
 * We surface that as `KEYCHAIN_CORRUPTED` and route to /recovery — never
 * silently re-key.
 *
 * To prevent accidental rolls, the values below are the single source
 * of truth shared by `electron-builder-config.mjs` (build-time) and
 * `main/frozenSigningIdentity.ts` (runtime assertion in packaged builds).
 *
 * **DO NOT CHANGE** these without:
 *   1. A documented re-key / migration path for users with encrypted DBs.
 *   2. Updating `main/frozenSigningIdentity.ts` to match.
 *   3. Updating the SECURITY.md "Code signing and OS keychain identity"
 *      section + Recovery Mode support copy.
 *   4. Bumping the release notes with the migration instructions.
 */

export const FROZEN_BUNDLE_ID = 'io.livebooks.desktop';
export const FROZEN_PRODUCT_NAME = 'LiveBooks Desktop';

/**
 * GitHub-published macOS notarization team id. Filled in from CI secret
 * `APPLE_TEAM_ID` at build time. We assert in the publish workflow that
 * the secret is present; the team id itself isn't a secret (it ships in
 * every notarized binary) but we don't pin it in the repo to keep
 * staging / personal builds friction-free.
 */
export const APPLE_TEAM_ID_ENV = 'APPLE_TEAM_ID';
