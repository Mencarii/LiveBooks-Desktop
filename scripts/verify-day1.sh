#!/usr/bin/env bash
# Day-1 Phase 6 — automated verification slice (Phases 0–4, 1b, 2).
# Manual signing QA: docs/signing-qa-runbook.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export IS_TEST=true
export LIVEBOOKS_TEST_DB_KEY="${LIVEBOOKS_TEST_DB_KEY:-$(printf 'a%.0s' {1..64})}"

DAY1_DESKTOP_SPECS=(
  ./utils/tests/testCloudApiDenylist.spec.ts
  ./utils/tests/testLivebooksCloudOrigin.spec.ts
  ./utils/tests/testLivebooksCloudSubscriptionRevision.spec.ts
  ./utils/tests/testDatabaseKeyStore.spec.ts
  ./utils/crypto/tests/testAssertHexDatabaseKey.spec.ts
  ./fyo/demux/tests/testDatabaseDemuxErrorCode.spec.ts
  ./main/tests/testFrozenSigningIdentity.spec.ts
  ./backend/database/tests/testBootProbeTypes.spec.ts
  ./backend/database/tests/testCipherProfile.spec.ts
  ./utils/ids/tests/testIds.spec.ts
  ./utils/sync/tests/testLocalMutationOutbox.spec.ts
  ./utils/sync/tests/testSyncDeviceGuard.spec.ts
  ./utils/sync/tests/testLwwConflict.spec.ts
  ./utils/sync/tests/testCloudApiBackoff.spec.ts
  ./utils/sync/tests/testOutboxSyncControl.spec.ts
)

echo "==> LiveBooks Desktop Day-1 specs"
./scripts/runner.sh ./node_modules/.bin/tape "${DAY1_DESKTOP_SPECS[@]}" | ./node_modules/.bin/tap-spec

CLOUD_ROOT="$(cd "$ROOT/../livebooks-cloud" && pwd)"
if [[ -d "$CLOUD_ROOT/test" ]]; then
  echo "==> livebooks-cloud integration (escrow/MFA)"
  (cd "$CLOUD_ROOT" && bin/rails test test/integration/api_v1_escrow_mfa_test.rb)
else
  echo "==> skip livebooks-cloud (directory not found)"
fi

echo "==> Day-1 automated verification complete"
echo "Manual before GA: docs/signing-qa-runbook.md + docs/verification-matrix.md"
