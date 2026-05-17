# LiveBooks Desktop

**Modern accounting for US small business**

Accounting built on **[Frappe Books](https://github.com/frappe/books)**, repackaged and extended for a **US audience**, with **bank feeds** and **reconciliation**.

[GitHub release (latest by date)](https://github.com/Mencarii/LiveBooks-Desktop/releases)  
Platforms  
[Publish](https://github.com/Mencarii/LiveBooks-Desktop/actions/workflows/publish.yml)

[Releases](https://github.com/Mencarii/LiveBooks-Desktop/releases) · [Contributing](.github/CONTRIBUTING.md) · [Upstream: Frappe Books](https://github.com/frappe/books)

**Pro Cloud Signup**: [mencarii.com](https://mencarii.com) (live bank feeds and more)

**Security & verification:** [`SECURITY.md`](SECURITY.md) · [`docs/verification-matrix.md`](docs/verification-matrix.md) · `yarn test:day1`

## About this repository

**[LiveBooks Desktop](https://github.com/Mencarii/LiveBooks-Desktop)** is a fork of [Frappe Books](https://github.com/frappe/books). We adapt terminology, defaults, and workflows for **US small businesses**, and ship **bank feeds** plus **bank reconciliation** on top of the upstream accounting core.

This project is released under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`), in line with upstream licensing expectations for this codebase. See **`LICENSE`** and **`NOTICE`** for legal detail.

**End users** (questions about using LiveBooks, not development): email **[ben.cheng@mencarii.com](mailto:ben.cheng@mencarii.com)**.

**Developers** (suggestions, patches, local forks): use [GitHub Issues](https://github.com/Mencarii/LiveBooks-Desktop/issues) and read **[Contributing](.github/CONTRIBUTING.md)**. Mencarii does not support unofficial or modified builds you run yourself; the AGPL allows you to tweak and self-host your own variant, but that is **at your own risk** and not a supported “LiveBooks” product unless we publish it.

---

## Features

Accounting core and many capabilities come from upstream; see **[frappe/books](https://github.com/frappe/books)** for the full upstream picture. LiveBooks adds US-oriented workflow plus:

- **Bank feeds**: **Pro cloud** – Connect accounts and import transactions for faster books.
- Reconciliation: Match bank activity to ledger entries.
- Dashboard: Overview of key financial data and performance metrics.
- Point of Sale: Integrated POS for retail sales.
- Works offline: Continue working without the internet; **optional cloud sync**.
- Double-entry accounting: Each transaction recorded across two accounts.

### Data philosophy

- **Local-first:** Your company ledger is a file on your machine, not a shared cloud database you must trust for every edit.
- **Encrypted by default:** Books use SQLCipher; the encryption key is generated locally and, when the OS allows, stored via Electron [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) (macOS Keychain / Windows DPAPI) — not as plaintext in app settings.
- **Cloud is additive:** Sign-in and Pro features (bank feeds, optional MFA-protected key recovery) layer on top; offline work remains possible without cloud dependency.
- **Distinct from upstream:** LiveBooks extends [Frappe Books](https://github.com/frappe/books) for US workflows and security boundaries documented in this repo — not a drop-in replacement for every upstream deployment pattern.

### Security posture (summary)

| Topic                | Behavior                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLCipher ledger     | 256-bit hex key; main process only ([`databaseKeyStore.ts`](utils/databaseKeyStore.ts))                                                                  |
| Per-account keys     | Namespaced by cloud user id or `local_{uuid}` for offline-created books                                                                                  |
| Connect vs create    | **No** auto re-key on decrypt failure — routes to Recovery Mode                                                                                          |
| Cloud session tokens | Encrypted via `safeStorage` when available; packaged builds refuse plaintext persistence ([`secureTokenStore.ts`](utils/secureTokenStore.ts))            |
| Sensitive cloud APIs | Escrow / MFA / recovery paths blocked from renderer IPC ([`cloudApiDenylist.ts`](utils/cloudApiDenylist.ts))                                             |
| Pro key backup       | MFA-gated retrieval; **not** zero-knowledge — see [`SECURITY.md`](SECURITY.md)                                                                           |
| Code signing         | Frozen bundle id `io.livebooks.desktop`; unsigned→signed install may require cloud recovery ([`docs/signing-qa-runbook.md`](docs/signing-qa-runbook.md)) |

Full threat model, IPC denylist, and breach response: **[`SECURITY.md`](SECURITY.md)**.

### Under the hood

- **Vue.js**: Reactive, component-based UI.
- **Electron**: Desktop packaging for Windows, macOS, and Linux.
- **SQLite** ([`better-sqlite3-multiple-ciphers`](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers)): Local-first ledger in an SQLite file on the machine. When encryption is enabled, the file is encrypted at rest; a per-device 256-bit key (64 hex characters) is generated locally and, when Electron [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) is available, that key material is encrypted before persistence via **electron-store** (see [`utils/databaseKeyStore.ts`](utils/databaseKeyStore.ts)). Opening the database applies the key in the main process before any ledger queries run.

**Handoff to accountants:** Use built-in **reports** (CSV/PDF and on-screen statements such as trial balance, profit and loss, balance sheet, and general ledger views)—the supported path for sharing financials with a CPA who does not use LiveBooks. Delivering a raw plaintext copy of the SQLite file is not the primary workflow.

---

### Install LiveBooks Desktop

Download the latest build for your platform from the **[LiveBooks Desktop releases](https://github.com/Mencarii/LiveBooks-Desktop/releases)** page.

---

## Development setup

### Prerequisites

- **Node.js** `v20.18.1` (recommended via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- **[Yarn classic](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable)** (v1)

### Clone and run

```bash
git clone https://github.com/Mencarii/LiveBooks-Desktop.git
cd LiveBooks-Desktop
yarn
```

Development mode (hot reload, etc.):

```bash
yarn dev
```

**First boot:** Electron starts immediately; the UI can take a few seconds while the dev server serves many files.

**Debug Electron main process:** Dev mode runs with `--inspect`. Connect a debugger to port **5858** (e.g. Chrome at `chrome://inspect`). See the [Electron main-process debugging guide](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process#external-debuggers).

### Build

```bash
yarn build
```

By default this targets your current OS and architecture. For other targets, see the _Building_ section in [electron.build/cli](https://www.electron.build/cli) (example: `yarn build --linux`).

### LiveBooks Cloud (release and CI)

- **API origin:** Set **`LIVEBOOKS_CLOUD_ORIGIN`** and **`VITE_LIVEBOOKS_CLOUD_ORIGIN`** to the same production base URL (no trailing slash) when producing binaries for end users. The [Publish](.github/workflows/publish.yml) workflow passes both from repository secret **`LIVEBOOKS_CLOUD_ORIGIN`**; if that secret is unset, the build still defaults to `http://127.0.0.1:3000` (suitable for local packaging only).
- **Auto-updates:** Prerelease channels are **off** by default (`electron-updater`). For internal QA builds that should consume GitHub prereleases, set environment variable **`LIVEBOOKS_UPDATER_ALLOW_PRERELEASE=1`** (or `true`) when launching the app or when wrapping the packaged binary.
- **Data encryption & session security:** See **Security posture** above. In **packaged** builds, refresh tokens are **not** written in plaintext when `safeStorage` is unavailable — you re-authenticate each launch. **Dev** (`yarn dev`) may use plaintext token fallback so contributors are not blocked.
- **Day-1 verification:** `yarn test:day1` runs automated checks; pre-GA signing QA is in [`docs/signing-qa-runbook.md`](docs/signing-qa-runbook.md).

---

## Contributing

See **[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)** for how to suggest changes, open issues, and submit pull requests.

---

## Upstream (Frappe Books)

Translation contributors, screenshots, install options (Homebrew, Flatpak), docs, and community channels for the original project are all maintained in the upstream repository—read **[github.com/frappe/books](https://github.com/frappe/books)** (especially its README).

---

## Contact

- **LiveBooks** (this fork): [GitHub Issues](https://github.com/Mencarii/LiveBooks-Desktop/issues).
