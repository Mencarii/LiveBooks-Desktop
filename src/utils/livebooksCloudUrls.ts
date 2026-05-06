/**
 * LiveBooks Cloud web and API paths (see livebooks-cloud config/routes.rb).
 * Set `VITE_LIVEBOOKS_CLOUD_ORIGIN` (dev server / build) for a non-default API host.
 */

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getLivebooksCloudOrigin(): string {
  const env = import.meta.env as { VITE_LIVEBOOKS_CLOUD_ORIGIN?: string };
  const raw = String(
    env.VITE_LIVEBOOKS_CLOUD_ORIGIN ?? 'http://127.0.0.1:3000'
  ).trim();
  return trimTrailingSlash(raw || 'http://127.0.0.1:3000');
}

export function livebooksCloudSignInUrl(): string {
  return `${getLivebooksCloudOrigin()}/session/new`;
}

export function livebooksCloudSignUpUrl(): string {
  return `${getLivebooksCloudOrigin()}/registrations/new`;
}

export function livebooksCloudSubscribeUrl(): string {
  return `${getLivebooksCloudOrigin()}/subscribe`;
}

export function livebooksCloudRootUrl(): string {
  return `${getLivebooksCloudOrigin()}/`;
}
