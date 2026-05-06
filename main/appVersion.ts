import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Semantic version for About / UI — from package.json, not the Electron runtime version.
 * Prefixed with `v` for display (e.g. v1.0.0).
 */
export function getDisplayAppVersion(): string {
  const raw = readAppPackageVersion();
  if (raw) {
    return raw.startsWith('v') ? raw : `v${raw}`;
  }
  const fallback = app.getVersion();
  return fallback.startsWith('v') ? fallback : `v${fallback}`;
}

/**
 * Semver without a leading `v` for macOS About `version` (parenthetical line).
 * Prefer package.json so this never echoes Electron’s runtime version in dev.
 */
export function getSemverWithoutVPrefix(): string {
  const raw = readAppPackageVersion();
  if (raw) {
    return raw.replace(/^v/i, '');
  }
  return getDisplayAppVersion().replace(/^v/i, '');
}

function readAppPackageVersion(): string | undefined {
  if (app.isPackaged) {
    try {
      const pkgPath = path.join(app.getAppPath(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        version?: string;
      };
      return pkg.version;
    } catch {
      return undefined;
    }
  }

  const candidates = [
    path.join(__dirname, '..', '..', 'package.json'),
    path.join(__dirname, '..', 'package.json'),
  ];
  for (const pkgPath of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        version?: string;
      };
      if (pkg.version) {
        return pkg.version;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
