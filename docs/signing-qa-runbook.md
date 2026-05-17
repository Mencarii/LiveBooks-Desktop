# Phase 1.6 — Code signing QA runbook (pre-GA manual)

Use this checklist before each GA-grade release. It implements the matrix in [`SECURITY.md`](../SECURITY.md). Record pass/fail, build numbers, and cert fingerprints in your release notes.

**Prerequisites**

- Staging Apple Developer ID + notarization credentials in CI (or local export matching `publish.yml`)
- Windows Authenticode cert (`WIN_CSC_LINK`) for staging
- A **Pro** LiveBooks Cloud account with MFA enabled and a key escrowed (after Phase 1b)
- One encrypted company file (`.books`) created on the build under test

---

## macOS

### A. Unsigned dev → signed staging (same machine)

1. Build and run **unsigned** Electron dev (`yarn dev` or unsigned packaged dev build).
2. Create or open a company file; confirm it opens (key in dev keychain slot).
3. Close the app.
4. Install the **signed staging** build (`io.livebooks.desktop`, same frozen id as production).
5. Launch signed build; open the same company file.

| Step           | Expected                                                        |
| -------------- | --------------------------------------------------------------- |
| Boot           | `KEYCHAIN_CORRUPTED` or Recovery Mode — not a silent new key    |
| Recovery Mode  | “Security context changed” copy (not “wrong database password”) |
| Cloud recovery | Pro + TOTP → key restored → file reopens                        |
| Post-recovery  | No second recovery prompt on next launch                        |

### B. Apple cert renewal (same team id)

1. Notarize a build with the **current** cert; verify recovery round-trip (A.5–A.7).
2. Renew Apple Developer ID; notarize next staging build with **new** cert (same `APPLE_TEAM_ID`).
3. Install over the previous staging build; repeat open + recovery.

| Outcome                  | Action                                                   |
| ------------------------ | -------------------------------------------------------- |
| Keychain entries survive | Note “survived renewal” in release notes                 |
| Recovery required        | Document in release notes; confirm MFA escrow path works |

### C. Frozen identity drift guard

1. Temporarily change `productName` in `electron-builder-config.mjs` without updating `build/signingIdentity.mjs`.
2. Produce a packaged build and launch.

| Expected                                                                          |
| --------------------------------------------------------------------------------- |
| App exits before keystore/DB code (`assertFrozenSigningIdentityForPackagedBuild`) |

---

## Windows

### D. Unsigned dev → Authenticode signed (same machine)

Same flow as macOS A, using DPAPI instead of macOS Keychain. Expect `KEYCHAIN_CORRUPTED` → Recovery Mode → MFA escrow recovery → DB opens.

### E. Authenticode cert renewal

Repeat macOS B on Windows. Record whether DPAPI entries survived publisher renewal.

---

## CI / release engineering

### F. Missing signing secrets

1. Run the publish workflow with signing secrets removed from one job matrix entry.

| Expected                                                                         |
| -------------------------------------------------------------------------------- |
| Job fails at “Assert … signing identity secrets are present” before `yarn build` |

---

## Sign-off template

```
Release: ___________
Tester: ___________
Date: ___________

[ ] macOS A — unsigned → signed
[ ] macOS B — cert renewal
[ ] macOS C — frozen identity guard
[ ] Windows D — unsigned → signed
[ ] Windows E — cert renewal
[ ] CI F — missing secrets fail-fast

Notes:
```

---

## Support copy spot-check

While in Recovery Mode, confirm:

- Headline references **security context** / OS / signing — not “database password”
- Form label is **LiveBooks Cloud** credentials
- `invalid_credentials` is described as cloud email/password, not SQLCipher password
