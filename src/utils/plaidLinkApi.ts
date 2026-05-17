import { livebooksCloudRequest } from 'src/utils/livebooksCloud';

function messageFromCloudResponse(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.length > 0) {
      return o.message;
    }
    if (typeof o.error === 'string' && o.error.length > 0) {
      return o.error;
    }
  }
  return `HTTP ${String(status)}`;
}

export async function requestPlaidLinkToken(
  bookId: string,
  options?: { itemId?: string; totpCode?: string }
): Promise<{
  linkToken?: string;
  error?: string;
  needsTotp?: boolean;
  mfaNotConfigured?: boolean;
}> {
  const body: Record<string, string> = {};
  if (options?.itemId) {
    body.item_id = options.itemId;
  }
  if (options?.totpCode) {
    body.totp_code = options.totpCode;
  }
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(bookId)}/plaid/link_token`,
    body: Object.keys(body).length ? body : {},
  });
  if (!res.ok) {
    const err = messageFromCloudResponse(res.data, res.status);
    const code =
      res.data && typeof res.data === 'object'
        ? (res.data as { error?: string }).error
        : undefined;
    const needsTotp = res.status === 401 && code === 'totp_required';
    const mfaNotConfigured =
      res.status === 403 && code === 'mfa_not_configured';
    return { error: err, needsTotp, mfaNotConfigured };
  }
  if (!res.data || typeof res.data !== 'object') {
    return { error: messageFromCloudResponse(res.data, res.status) };
  }
  const linkToken = (res.data as { link_token?: unknown }).link_token;
  if (typeof linkToken !== 'string' || linkToken.length === 0) {
    return { error: messageFromCloudResponse(res.data, res.status) };
  }
  return { linkToken };
}

export async function exchangePlaidPublicToken(
  bookId: string,
  publicToken: string,
  totpCode?: string
): Promise<{
  ok: boolean;
  error?: string;
  needsTotp?: boolean;
  mfaNotConfigured?: boolean;
}> {
  const body: Record<string, string> = { public_token: publicToken };
  if (totpCode) {
    body.totp_code = totpCode;
  }
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(bookId)}/plaid/exchange`,
    body,
  });
  if (!res.ok) {
    const err = messageFromCloudResponse(res.data, res.status);
    const code =
      res.data && typeof res.data === 'object'
        ? (res.data as { error?: string }).error
        : undefined;
    const needsTotp = res.status === 401 && code === 'totp_required';
    const mfaNotConfigured =
      res.status === 403 && code === 'mfa_not_configured';
    return { ok: false, error: err, needsTotp, mfaNotConfigured };
  }
  return { ok: true };
}
