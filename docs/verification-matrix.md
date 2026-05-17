# Day-1 verification matrix (Phase 6)

Tracks automated vs manual checks for the [Day-1 foundation plan](https://github.com/Mencarii/LiveBooks-Desktop). Run automated checks with:

```bash
yarn test:day1
```

Manual signing QA: [`signing-qa-runbook.md`](signing-qa-runbook.md).

---

## Automated (CI / local)

| Area     | Check                                     | Spec / command                                                                   |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Phase 0  | IPC `error.code` shaping                  | `fyo/demux/tests/testDatabaseDemuxErrorCode.spec.ts`                             |
| Phase 0  | HTTPS origin when packaged                | `utils/tests/testLivebooksCloudOrigin.spec.ts`                                   |
| Phase 1  | Hex key shape                             | `utils/crypto/tests/testAssertHexDatabaseKey.spec.ts`                            |
| Phase 1  | Test env key + local namespace resolution | `utils/tests/testDatabaseKeyStore.spec.ts`                                       |
| Phase 1  | Frozen signing identity mirror            | `main/tests/testFrozenSigningIdentity.spec.ts`                                   |
| Phase 1  | Cipher profile / boot probe types         | `backend/database/tests/testCipherProfile.spec.ts`, `testBootProbeTypes.spec.ts` |
| Phase 1b | Renderer cloud API denylist               | `utils/tests/testCloudApiDenylist.spec.ts`                                       |
| Phase 1b | Escrow + MFA API                          | `livebooks-cloud` `api_v1_escrow_mfa_test.rb`                                    |
| Phase 3  | UUID + C1 COA stability                   | `utils/ids/tests/testIds.spec.ts`                                                |
| Phase 4  | Outbox cap + clientSeq                    | `utils/sync/tests/testLocalMutationOutbox.spec.ts`                               |
| Phase 4  | DeviceId reconciliation                   | `utils/sync/tests/testSyncDeviceGuard.spec.ts`                                   |
| Phase 4  | LWW conflict resolution                   | `utils/sync/tests/testLwwConflict.spec.ts`                                       |
| Phase 4  | Cloud API backoff                         | `utils/sync/tests/testCloudApiBackoff.spec.ts`                                   |
| Phase 4  | Pro lapse outbox pause                    | `utils/sync/tests/testOutboxSyncControl.spec.ts`                                 |

---

## Manual (pre-GA)

| Area    | Check                                       | Runbook                                                               |
| ------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Phase 1 | Unsigned dev → signed staging keychain      | [`signing-qa-runbook.md`](signing-qa-runbook.md) § macOS A, Windows A |
| Phase 1 | Code-signing cert renewal                   | [`signing-qa-runbook.md`](signing-qa-runbook.md) § B                  |
| Phase 1 | Publish without signing secrets fails CI    | `.github/workflows/publish.yml` assert steps                          |
| Phase 2 | Full Recovery Mode + Pro MFA round-trip     | Staging Pro account + TOTP                                            |
| Phase 2 | Free backup safety modal                    | Create company as free user                                           |
| Phase 3 | UUID migration on copy of production ledger | Staging ledger + Plaid smoke                                          |
| Phase 4 | USB restore + deviceId chooser online       | Import `.db` from another machine; verify handshake UI                |
| Phase 4 | Dual-device offline edit + sync             | Two devices; LWW notification + `SyncConflictLog` row                 |
| Phase 4 | Pro lapse banner + resume reconcile         | Lapse Pro; renew; confirm outbox does not blind-flush                 |

---

## Phase 4 integration notes

- **Desktop:** `LocalMutation` / `SyncConflictLog` schemas; mutation logging in `dbHandler` + submit/cancel; `runSyncDeviceGuard` on init; `fetchWithCloudBackoff` on `LIVEBOOKS_CLOUD_API`.
- **Cloud (follow-up):** `GET /api/v1/books/:book_id/sync/watermark`, mutation ingest, `book_sync_snapshots` worker — desktop tolerates 404 on watermark until Rails ships.

---

## Sad-path spot checks (manual)

| Scenario                              | Expected                                       |
| ------------------------------------- | ---------------------------------------------- |
| Bricked DB from old `getOrCreate`     | Recovery prompt; never silent re-key           |
| Wrong cloud password in Recovery      | `invalid_credentials`; not “database password” |
| Two offline users, same OS login      | Isolated `local_{uuid}` keys                   |
| Packaged app + `http://` cloud origin | Boot fails loudly                              |
| `deviceId` mismatch while offline     | Writes allowed with `pending_reconciliation`   |
| Outbox cap (10k / 90d)                | `snapshot_required` pause; no destructive wipe |
