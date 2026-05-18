# Patch immutability

After a release tag ships, **never edit** the `execute` body of an existing patch file under `backend/patches/`.

## Fixing a bad patch

1. Add a new patch file with a new `name` (e.g. `fixFoo_v1_0_1`).
2. Register it in `backend/patches/index.ts` with an appropriate `version` guard inside `execute`.
3. Make `execute` idempotent (check column/state before mutating).

## CI

`scripts/verify-patch-immutability.sh` compares patch blobs at the latest release tag to `main` and fails if any file present at the tag changed (new files are allowed).
