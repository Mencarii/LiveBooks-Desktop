#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${PATCH_IMMUTABILITY_TAG:-}"
if [[ -z "$TAG" ]]; then
  TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
fi

if [[ -z "$TAG" ]]; then
  echo "No release tag found; skipping patch immutability check."
  exit 0
fi

PATCH_DIR="backend/patches"
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG not found; skipping patch immutability check."
  exit 0
fi

echo "Checking patch immutability vs tag $TAG …"
FAILED=0

while IFS= read -r -d '' file; do
  rel="${file#./}"
  if ! git cat-file -e "$TAG:$rel" 2>/dev/null; then
    continue
  fi
  old_hash="$(git show "$TAG:$rel" | shasum -a 256 | awk '{print $1}')"
  new_hash="$(shasum -a 256 <"$rel" | awk '{print $1}')"
  if [[ "$old_hash" != "$new_hash" ]]; then
    echo "CHANGED: $rel (immutable after $TAG)"
    FAILED=1
  fi
done < <(find "$PATCH_DIR" -type f \( -name '*.ts' -o -name '*.js' \) -print0)

if [[ "$FAILED" -ne 0 ]]; then
  echo "Patch immutability check failed. Add a new patch name instead of editing shipped bodies."
  exit 1
fi

echo "Patch immutability check passed."
