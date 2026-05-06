/**
 * Validates outbound integration (ERPNext) requests from the renderer via IPC.
 * Limits SSRF-style abuse to http(s) URLs whose path targets the books_integration API.
 */

import type { RequestInit } from 'node-fetch';

/** Frappe whitelisted app method prefix (see erpnextSync.ts URL construction). */
export const ERPNEXT_BOOKS_INTEGRATION_PATH =
  '/api/method/books_integration.api.';

const FORBIDDEN_HEADER_NAMES = new Set([
  'cookie',
  'cookie2',
  'host',
  'connection',
  'keep-alive',
  'proxy-authorization',
  'transfer-encoding',
]);

const ALLOWED_METHODS = new Set(['GET', 'POST', 'HEAD']);

function normalizeMethod(init: RequestInit | undefined): string {
  const m = init?.method ?? 'GET';
  return m.toUpperCase();
}

/**
 * Drop hop-by-hop and cookie headers; renderer must not override Host or inject cookies.
 */
export function sanitizeIntegrationRequestInit(
  init: RequestInit | undefined
): RequestInit | undefined {
  if (!init) {
    return undefined;
  }
  const headers = init.headers;
  if (headers === undefined) {
    return init;
  }

  const out: Record<string, string> = {};

  if (Array.isArray(headers)) {
    for (const pair of headers) {
      const [k, v] = pair;
      if (
        typeof k === 'string' &&
        typeof v === 'string' &&
        !FORBIDDEN_HEADER_NAMES.has(k.toLowerCase())
      ) {
        out[k] = v;
      }
    }
  } else if (typeof headers === 'object' && headers !== null) {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (
        typeof v === 'string' &&
        !FORBIDDEN_HEADER_NAMES.has(k.toLowerCase())
      ) {
        out[k] = v;
      }
    }
  }

  return { ...init, headers: out };
}

/**
 * @throws Error with a short code in message if the request is not allowed
 */
export function assertErpnextIntegrationRequestAllowed(
  endpoint: string,
  init: RequestInit | undefined,
  requireHttps: boolean
): URL {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    throw new Error('integration_url_invalid');
  }

  if (u.username !== '' || u.password !== '') {
    throw new Error('integration_url_userinfo_forbidden');
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('integration_url_scheme_forbidden');
  }

  if (requireHttps && u.protocol !== 'https:') {
    throw new Error('integration_url_https_required');
  }

  const method = normalizeMethod(init);
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error('integration_method_forbidden');
  }

  const pathKey = u.pathname + (u.search ?? '');
  if (!pathKey.includes(ERPNEXT_BOOKS_INTEGRATION_PATH)) {
    throw new Error('integration_path_forbidden');
  }

  return u;
}
