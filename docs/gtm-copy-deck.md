# LiveBooks GTM copy deck (Phase 7)

Use this for [mencarii.com](https://mencarii.com), support articles, and sales one-pagers. **Do not** claim full zero-knowledge for Pro cloud key backup — see [`SECURITY.md`](../SECURITY.md).

**Landing:** copy is implemented in `mencarii_landing/index.html` (hero, `#security`, pricing, FAQ).

---

## Landing headline options

1. **Local-first accounting with OS keychain–bound encryption**
2. **Your ledger stays on your machine — SQLCipher-encrypted, sync when you choose**
3. **US small-business books that work offline; Pro adds bank feeds and MFA-protected recovery**

Avoid: “We never can access your data,” “zero-knowledge cloud backup,” “military-grade” without specifics.

---

## Subhead / value prop

LiveBooks Desktop stores your company file as a **SQLCipher-encrypted SQLite database** on your computer. Encryption keys are wrapped with your operating system’s secure storage (macOS Keychain, Windows DPAPI). Optional **LiveBooks Cloud Pro** adds bank feeds, subscription billing, and **MFA-protected cloud key recovery** if you lose access to this device after an OS reinstall or signed-app upgrade.

---

## Feature matrix

| Capability                          | Free | Pro                                         |
| ----------------------------------- | ---- | ------------------------------------------- |
| Local SQLCipher ledger              | Yes  | Yes                                         |
| OS keychain–bound encryption key    | Yes  | Yes                                         |
| Offline work                        | Yes  | Yes                                         |
| Export reports (CPA handoff)        | Yes  | Yes                                         |
| Live bank feeds (Plaid)             | —    | Yes                                         |
| Cloud MFA key recovery (escrow)     | —    | Yes (opt-in; requires MFA on cloud account) |
| Multi-device sync (mutation outbox) | —    | Planned                                     |

---

## Support / FAQ snippets

**I got a new computer — how do I open my books?**

1. Install LiveBooks Desktop from [GitHub Releases](https://github.com/Mencarii/LiveBooks-Desktop/releases).
2. Sign in to the same LiveBooks Cloud account.
3. If you enabled **Cloud backup (Pro)** and MFA, use **Recovery Mode** with your cloud email, password, and authenticator code. The app restores your encryption key through the main process — we never show the raw key in the browser UI.

**Why does Recovery Mode say “Security context changed”?**

Your OS ties encryption keys to the app’s code-signing identity. Common triggers: new Mac/PC, first launch of the **signed** app after developing on an **unsigned** build, or a renewed code-signing certificate. This is not a wrong “database password” — LiveBooks does not use a separate database password.

**Is my key safe in the cloud?**

Pro backup uses **envelope encryption** on our servers (Lockbox). We can decrypt and return your key only after **Pro subscription + MFA step-up** on each retrieval, and we email you on every retrieval. This is **not** zero-knowledge escrow; it is a safety net you opt into.

**What if I’m not on Pro?**

Your data remains on this device only. Export backups regularly. A reminder appears when you create a company without Pro.

---

## README / open-source positioning

- Fork of [Frappe Books](https://github.com/frappe/books), US-focused workflow.
- **Data philosophy:** encrypted by default on disk; cloud is additive for Pro features.
- Security details: [`SECURITY.md`](../SECURITY.md)
- Verification: [`verification-matrix.md`](verification-matrix.md)

---

## Legal / product sign-off checklist

- [ ] No “zero-knowledge” headline unless product changes to true ZK escrow
- [ ] Pro matrix matches shipped API (`encrypted_desktop_key`, MFA, escrow retrieval)
- [ ] Support macros distinguish security-context change vs wrong password
- [ ] Staging site reviewed before GA
