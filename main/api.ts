import fetch, { RequestInit } from 'node-fetch';
import {
  assertErpnextIntegrationRequestAllowed,
  sanitizeIntegrationRequestInit,
} from './validateIntegrationRequest';

/**
 * ERPNext / books_integration HTTP from renderer (IPC). Enforces URL shape, HTTPS when packaged,
 * no redirects, and safe headers.
 */
export async function sendAPIRequest(
  endpoint: string,
  options: RequestInit | undefined,
  requireHttps: boolean
): Promise<unknown> {
  const safeInit = sanitizeIntegrationRequestInit(options);
  assertErpnextIntegrationRequestAllowed(endpoint, safeInit, requireHttps);

  const res = await fetch(endpoint, {
    ...safeInit,
    redirect: 'manual',
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error('integration_redirect_forbidden');
  }

  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('integration_response_not_json');
  }
}
