/**
 * Day-1 Phase 0.4 — cloud origin resolution (pure; testable without Electron).
 */

const DEV_DEFAULT_ORIGIN = 'http://127.0.0.1:3000';

export function trimCloudOrigin(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Resolve LIVEBOOKS_CLOUD_ORIGIN for main-process HTTP.
 *
 * Packaged builds require https:// and an explicit origin env var.
 */
export function resolveLivebooksCloudOrigin(
  envOrigin: string | undefined,
  isPackaged: boolean,
  devDefault = DEV_DEFAULT_ORIGIN
): string {
  const raw = envOrigin?.trim();
  if (raw) {
    const origin = trimCloudOrigin(raw);
    if (isPackaged && !origin.startsWith('https://')) {
      throw new Error(
        `LIVEBOOKS_CLOUD_ORIGIN must use https:// in packaged builds, got: ${origin}`
      );
    }
    return origin;
  }
  if (isPackaged) {
    throw new Error(
      'LIVEBOOKS_CLOUD_ORIGIN is required (https://...) in packaged builds.'
    );
  }
  return devDefault;
}
