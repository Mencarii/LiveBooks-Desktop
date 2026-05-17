/**
 * Deployment environment for UI branding (Dev / Staging suffixes).
 *
 * Resolution order:
 * 1. LIVEBOOKS_APP_ENV (explicit)
 * 2. NODE_ENV=development (desktop dev runs)
 * 3. Cloud origin hostname heuristics (staging hosts only)
 */

export type LivebooksAppEnv = 'development' | 'staging' | 'production';

const STAGING_HOST_PATTERNS = [
  /^staging[.-]/i,
  /\.staging[.-]/i,
  /^stg[.-]/i,
  /\.stg[.-]/i,
  /-staging\./i,
  /-stg\./i,
];

export function normalizeLivebooksAppEnvVar(
  raw: string | undefined
): LivebooksAppEnv | null {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === 'development' || value === 'dev') {
    return 'development';
  }
  if (value === 'staging' || value === 'stage') {
    return 'staging';
  }
  if (value === 'production' || value === 'prod') {
    return 'production';
  }
  return null;
}

export function isStagingCloudOrigin(origin: string | undefined): boolean {
  if (!origin?.trim()) {
    return false;
  }
  try {
    const host = new URL(origin.trim()).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      return false;
    }
    return STAGING_HOST_PATTERNS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

export function resolveLivebooksAppEnv(options: {
  livebooksAppEnv?: string;
  nodeEnv?: string;
  cloudOrigin?: string;
}): LivebooksAppEnv {
  const fromEnvVar = normalizeLivebooksAppEnvVar(options.livebooksAppEnv);
  if (fromEnvVar) {
    return fromEnvVar;
  }

  if (options.nodeEnv === 'development') {
    return 'development';
  }

  if (isStagingCloudOrigin(options.cloudOrigin)) {
    return 'staging';
  }

  return 'production';
}

export function livebooksEnvLabelSuffix(appEnv: LivebooksAppEnv): string {
  switch (appEnv) {
    case 'development':
      return ' (Dev)';
    case 'staging':
      return ' (Staging)';
    default:
      return '';
  }
}

export function withLivebooksEnvSuffix(
  base: string,
  appEnv: LivebooksAppEnv
): string {
  const suffix = livebooksEnvLabelSuffix(appEnv);
  if (!suffix || base.endsWith(suffix)) {
    return base;
  }
  return `${base}${suffix}`;
}

/** Sidebar / window title base before Pro suffix. */
export const LIVEBOOKS_DESKTOP_PRODUCT_NAME = 'LiveBooks Desktop';

export function livebooksDesktopDisplayName(
  appEnv: LivebooksAppEnv,
  pro = false
): string {
  const base = pro
    ? `${LIVEBOOKS_DESKTOP_PRODUCT_NAME} Pro`
    : LIVEBOOKS_DESKTOP_PRODUCT_NAME;
  return withLivebooksEnvSuffix(base, appEnv);
}
