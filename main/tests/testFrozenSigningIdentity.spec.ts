/**
 * enforce that the runtime mirror
 * (`main/frozenSigningIdentity.ts`) stays in lockstep with the
 * build-time source of truth (`build/signingIdentity.mjs`).
 *
 * Dropping out of lockstep would mean the packaged main process
 * compares `app.getName()` / `getBundleId()` against the wrong
 * constants and either spuriously refuses to boot a healthy build or
 * silently accepts a drifted one. Either failure mode invalidates
 * every user's `safeStorage` keychain slot.
 */

import test from 'tape';
import fs from 'fs';
import path from 'path';

function readConstant(source: string, name: string): string {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*['"]([^'"]+)['"]`);
  const match = source.match(re);
  if (!match) {
    throw new Error(`Could not find export const ${name} in source`);
  }
  return match[1];
}

test('frozen signing identity: build + runtime mirrors agree', (t) => {
  const root = path.join(__dirname, '..', '..');
  const buildSource = fs.readFileSync(
    path.join(root, 'build', 'signingIdentity.mjs'),
    'utf8'
  );
  const mainSource = fs.readFileSync(
    path.join(root, 'main', 'frozenSigningIdentity.ts'),
    'utf8'
  );

  for (const name of ['FROZEN_BUNDLE_ID', 'FROZEN_PRODUCT_NAME']) {
    const buildValue = readConstant(buildSource, name);
    const mainValue = readConstant(mainSource, name);
    t.equal(
      mainValue,
      buildValue,
      `${name} in main/frozenSigningIdentity.ts mirrors build/signingIdentity.mjs`
    );
  }

  t.end();
});

test('frozen signing identity: electron-builder config uses the source of truth', (t) => {
  const root = path.join(__dirname, '..', '..');
  const builderConfig = fs.readFileSync(
    path.join(root, 'electron-builder-config.mjs'),
    'utf8'
  );

  t.ok(
    /from\s+['"]\.\/build\/signingIdentity\.mjs['"]/.test(builderConfig),
    'electron-builder-config.mjs imports from build/signingIdentity.mjs'
  );
  t.ok(
    /productName:\s*FROZEN_PRODUCT_NAME\b/.test(builderConfig),
    'electron-builder-config.mjs uses FROZEN_PRODUCT_NAME for productName'
  );
  t.ok(
    /appId:\s*FROZEN_BUNDLE_ID\b/.test(builderConfig),
    'electron-builder-config.mjs uses FROZEN_BUNDLE_ID for appId'
  );

  t.end();
});
