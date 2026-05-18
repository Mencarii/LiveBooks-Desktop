# Hard DELETE inventory (v2 soft-delete prep)

Documented paths that **physically remove rows** today. v2 should move these to `deleted_at` / tombstones where business data is affected.

| Path                                  | Operation                                                        |
| ------------------------------------- | ---------------------------------------------------------------- |
| `fyo/core/dbHandler.ts`               | `delete`, `deleteAll`                                            |
| `fyo/model/doc.ts`                    | `delete`, `#deleteChildren` (via sync)                           |
| `backend/database/core.ts`            | `#runDeleteOtherChildren`, `delete`                              |
| `src/utils/localMutationRetention.ts` | `pruneStaleLocalMutations` (LocalMutation only)                  |
| `src/utils/plaidApply.ts`             | pending line `stmt.remove('lines')` on Plaid pending→posted swap |
| `backend/patches/**`                  | migration cleanup (acceptable)                                   |

Outbox / sync meta tables (`LocalMutation`, `PatchRun`, `SingleValue`) may continue hard deletes when retention policies require it.
