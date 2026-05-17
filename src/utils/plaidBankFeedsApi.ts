import { t } from 'fyo';
import { livebooksCloudRequest } from 'src/utils/livebooksCloud';
import { promptTotpCode } from 'src/utils/promptTotpCode';

function cloudErrorCode(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error: unknown }).error;
    return typeof err === 'string' ? err : undefined;
  }
  return undefined;
}

export type PlaidApplyFailureRow = {
  public_id: string;
  error_summary: string;
  created_at: string;
};

export type PlaidFeedItemRow = {
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  sync_suggested: boolean;
  last_webhook_at: string | null;
  last_sync_at: string | null;
  feed_version: number;
  item_login_required: boolean;
  pending_expiration_at?: string | null;
  accounts_changed?: boolean;
  user_permission_revoked_at?: string | null;
  pending_import_batches_count: number;
  pending_import_batches_by_plaid_account_id: Record<string, number>;
  /** Plaid `account_id`s with feed paused (still linked at Plaid until institution is removed). */
  feed_disconnected_account_ids?: string[];
  last_pending_dropped_count?: number;
  health?: 'ok' | 'stale' | 'broken';
  recent_apply_failures?: PlaidApplyFailureRow[];
};

export type PlaidFeedsPayload = { items: PlaidFeedItemRow[] };

export type ImportBatchListRow = {
  public_id: string;
  created_at: string;
  has_more_hint?: boolean;
  cursor_after?: string | null;
  plaid_account_id?: string;
  acked_at?: string;
};

export type ImportBatchesListPayload = {
  delivery_status: string;
  batches: ImportBatchListRow[];
};

export type PromptTotpFn = () => Promise<string | null>;

export async function postMfaStepUp(
  totpCode: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: '/api/v1/me/mfa/step_up',
    body: { totp_code: totpCode },
  });
  if (res.ok) {
    return { ok: true };
  }
  const err =
    res.data &&
    typeof res.data === 'object' &&
    'message' in res.data &&
    typeof (res.data as { message: unknown }).message === 'string'
      ? (res.data as { message: string }).message
      : `HTTP ${String(res.status)}`;
  return { ok: false, error: err };
}

let stepUpInFlight: Promise<boolean> | null = null;

async function ensureMfaStepUp(promptTotp: PromptTotpFn): Promise<boolean> {
  if (stepUpInFlight) {
    return stepUpInFlight;
  }
  stepUpInFlight = (async () => {
    const code = await promptTotp();
    if (!code) {
      return false;
    }
    const up = await postMfaStepUp(code);
    return up.ok;
  })();
  try {
    return await stepUpInFlight;
  } finally {
    stepUpInFlight = null;
  }
}

const defaultPromptTotp: PromptTotpFn = async () =>
  promptTotpCode({
    title: t`Authenticator code`,
    detail: t`Enter your LiveBooks Cloud authenticator or backup code to view bank feed status.`,
  });

export async function fetchPlaidFeeds(
  bookId: string,
  options?: { ifNoneMatch?: string }
): Promise<{
  notModified: boolean;
  etag?: string;
  payload: PlaidFeedsPayload | null;
  error?: string;
  totpRequired?: boolean;
}> {
  const headers: Record<string, string> = {};
  if (options?.ifNoneMatch) {
    headers['If-None-Match'] = options.ifNoneMatch;
  }
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid_feeds`,
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (res.status === 304) {
    return {
      notModified: true,
      etag: options?.ifNoneMatch ?? res.etag,
      payload: null,
    };
  }
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const code = cloudErrorCode(res.data);
    const totpRequired = res.status === 401 && code === 'totp_required';
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { notModified: false, payload: null, error: err, totpRequired };
  }
  return {
    notModified: false,
    etag: res.etag,
    payload: res.data as PlaidFeedsPayload,
  };
}

/** Fetches Plaid feed metadata; prompts once for MFA step-up when the 30-minute window expired. */
export async function fetchPlaidFeedsWithStepUp(
  bookId: string,
  options?: { ifNoneMatch?: string; promptTotp?: PromptTotpFn }
): Promise<{
  notModified: boolean;
  etag?: string;
  payload: PlaidFeedsPayload | null;
  error?: string;
}> {
  const promptTotp = options?.promptTotp ?? defaultPromptTotp;
  let res = await fetchPlaidFeeds(bookId, options);
  if (!res.totpRequired) {
    return res;
  }
  const stepped = await ensureMfaStepUp(promptTotp);
  if (!stepped) {
    return {
      notModified: false,
      payload: null,
      error: res.error ?? t`Authenticator code required.`,
    };
  }
  res = await fetchPlaidFeeds(bookId, options);
  return res;
}

export async function fetchPendingImportBatches(
  bookId: string,
  itemId: string,
  opts?: { plaidAccountId?: string; limit?: number }
): Promise<{ batches: ImportBatchListRow[]; error?: string }> {
  const q = new URLSearchParams({
    item_id: itemId,
    delivery_status: 'pending',
  });
  if (opts?.plaidAccountId) {
    q.set('plaid_account_id', opts.plaidAccountId);
  }
  if (opts?.limit != null) {
    q.set('limit', String(opts.limit));
  }
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid/import_batches?${q.toString()}`,
  });
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { batches: [], error: err };
  }
  const body = res.data as ImportBatchesListPayload;
  return { batches: body.batches ?? [] };
}

export async function fetchImportBatchPayload(
  bookId: string,
  publicId: string
): Promise<{ payload: unknown; error?: string; status: number }> {
  const res = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/${bookId}/plaid/import_batches/${encodeURIComponent(
      publicId
    )}`,
  });
  if (!res.ok) {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { payload: null, error: err, status: res.status };
  }
  return { payload: res.data, status: res.status };
}

export type BulkImportBatchPayloadRow = {
  public_id: string;
  payload: Record<string, unknown>;
};

/**
 * Fetch payloads for up to 30 PlaidImportBatch public_ids in a single round trip.
 * Mirrors the cloud `POST /api/v1/books/:book_id/plaid/import_batches/bulk_show` endpoint.
 */
export async function bulkFetchImportBatchPayloads(
  bookId: string,
  publicIds: string[]
): Promise<{
  batches: BulkImportBatchPayloadRow[];
  error?: string;
  status: number;
}> {
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(
      bookId
    )}/plaid/import_batches/bulk_show`,
    body: { public_ids: publicIds },
  });
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { batches: [], error: err, status: res.status };
  }
  const body = res.data as { batches?: BulkImportBatchPayloadRow[] };
  return { batches: body.batches ?? [], status: res.status };
}

export async function bulkAckImportBatches(
  bookId: string,
  acks: Array<{
    public_id: string;
    applied_count?: number;
    excluded_count?: number;
  }>
): Promise<{ ok: boolean; error?: string; status: number }> {
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(
      bookId
    )}/plaid/import_batches/bulk_ack`,
    body: { acks },
  });
  if (!res.ok) {
    return {
      ok: false,
      error: `Bulk ack failed (HTTP ${String(res.status)})`,
      status: res.status,
    };
  }
  return { ok: true, status: res.status };
}

/**
 * Clears ack on recent import batches for one Plaid Item so the desktop can fetch
 * and apply them again from Cloud-held payloads (recovery after local deletes).
 * Does not pull new history from Plaid beyond what Cloud already stored.
 */
export async function reopenAckedPlaidImportBatches(
  bookId: string,
  itemId: string,
  opts?: { days?: number }
): Promise<{
  ok: boolean;
  reopenedCount?: number;
  days?: number;
  error?: string;
}> {
  const body: Record<string, number> = {};
  if (opts?.days != null) {
    body.days = Math.max(1, Math.min(90, Math.floor(opts.days)));
  }
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(
      bookId
    )}/plaid/items/${encodeURIComponent(itemId)}/import_batches/reopen`,
    body: Object.keys(body).length ? body : undefined,
  });
  if (!res.ok) {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { ok: false, error: err };
  }
  const data = res.data as
    | { reopened_count?: unknown; days?: unknown }
    | undefined;
  const reopenedCount =
    typeof data?.reopened_count === 'number' ? data.reopened_count : 0;
  const days = typeof data?.days === 'number' ? data.days : opts?.days ?? 30;
  return { ok: true, reopenedCount, days };
}

export async function ackImportBatch(
  bookId: string,
  publicId: string,
  audit?: { applied_count?: number; excluded_count?: number }
): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, number> = {};
  if (audit?.applied_count != null) {
    body.applied_count = Math.max(0, Math.floor(audit.applied_count));
  }
  if (audit?.excluded_count != null) {
    body.excluded_count = Math.max(0, Math.floor(audit.excluded_count));
  }
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${bookId}/plaid/import_batches/${encodeURIComponent(
      publicId
    )}/ack`,
    body,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: `Ack failed (HTTP ${String(res.status)})`,
    };
  }
  return { ok: true };
}

/** Stop automatic imports for one Plaid sub-account. Removes the institution Item once every sub-account is disconnected. */
export async function disconnectPlaidAccountFeed(
  bookId: string,
  itemId: string,
  plaidAccountId: string
): Promise<{ ok: boolean; error?: string; itemRemoved?: boolean }> {
  const res = await livebooksCloudRequest({
    method: 'DELETE',
    path: `/api/v1/books/${encodeURIComponent(
      bookId
    )}/plaid/items/${encodeURIComponent(itemId)}/accounts/${encodeURIComponent(
      plaidAccountId
    )}`,
  });
  if (res.status === 404) {
    return {
      ok: false,
      error: t`Plaid connection not found (it may already be disconnected).`,
    };
  }
  if (!res.ok) {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { ok: false, error: err };
  }
  const itemRemoved =
    res.data &&
    typeof res.data === 'object' &&
    (res.data as { item_removed?: unknown }).item_removed === true;
  return { ok: true, itemRemoved };
}

/** Resume cloud ingest for a sub-account after the user maps it again. */
export async function enablePlaidAccountFeed(
  bookId: string,
  itemId: string,
  plaidAccountId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${encodeURIComponent(
      bookId
    )}/plaid/items/${encodeURIComponent(itemId)}/accounts/${encodeURIComponent(
      plaidAccountId
    )}/enable_feed`,
  });
  if (res.status === 404) {
    return {
      ok: false,
      error: t`Plaid connection not found (it may already be disconnected).`,
    };
  }
  if (!res.ok) {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { ok: false, error: err };
  }
  return { ok: true };
}

/** Remove the Plaid Item server-side (token revoked at Plaid); local maps must be cleared separately. */
export async function removePlaidItem(
  bookId: string,
  itemId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await livebooksCloudRequest({
    method: 'DELETE',
    path: `/api/v1/books/${encodeURIComponent(
      bookId
    )}/plaid/items/${encodeURIComponent(itemId)}`,
  });
  if (res.status === 404) {
    return {
      ok: false,
      error: t`Plaid connection not found (it may already be disconnected).`,
    };
  }
  if (!res.ok) {
    const err =
      res.data &&
      typeof res.data === 'object' &&
      'message' in res.data &&
      typeof (res.data as { message: unknown }).message === 'string'
        ? (res.data as { message: string }).message
        : `HTTP ${String(res.status)}`;
    return { ok: false, error: err };
  }
  return { ok: true };
}

export async function reportPlaidApplyFailed(
  bookId: string,
  publicId: string,
  body: { message: string; code?: string }
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, string> = { message: body.message };
  if (body.code) {
    payload.code = body.code;
  }
  const res = await livebooksCloudRequest({
    method: 'POST',
    path: `/api/v1/books/${bookId}/plaid/import_batches/${encodeURIComponent(
      publicId
    )}/apply_failed`,
    body: payload,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: `apply_failed report HTTP ${String(res.status)}`,
    };
  }
  return { ok: true };
}
