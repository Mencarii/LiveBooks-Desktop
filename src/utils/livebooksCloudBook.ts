import type { Fyo } from 'fyo';
import {
  getLivebooksCloudSessionSummary,
  livebooksCloudRequest,
  livebooksCloudUnreachableUserMessage,
} from 'src/utils/livebooksCloud';
import type { LivebooksCloudApiResult } from 'src/utils/livebooksCloud';

export type CloudBookContext =
  | { ok: true; bookId: string }
  | {
      ok: false;
      reason:
        | 'not_signed_in'
        | 'no_instance'
        | 'api_error'
        | 'cloud_unreachable';
      message?: string;
    };

function isLivebooksCloudNetworkFailure(res: LivebooksCloudApiResult): boolean {
  if (res.status !== 0) {
    return false;
  }
  const d = res.data;
  return (
    d !== null &&
    typeof d === 'object' &&
    'error' in d &&
    (d as { error: unknown }).error === 'network_error'
  );
}

/**
 * Resolves the cloud book UUID for the open company using Frappe Books
 * `store.instanceId`. Creates the cloud book on first success when lookup returns 404.
 */
export async function ensureLivebooksCloudBookId(
  fyo: Fyo
): Promise<CloudBookContext> {
  const { signedIn } = await getLivebooksCloudSessionSummary();
  if (!signedIn) {
    return { ok: false, reason: 'not_signed_in' };
  }

  const instanceId = fyo.store.instanceId;
  if (!instanceId) {
    return { ok: false, reason: 'no_instance' };
  }

  const lookup = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/lookup?instance_id=${encodeURIComponent(instanceId)}`,
  });

  if (isLivebooksCloudNetworkFailure(lookup)) {
    return {
      ok: false,
      reason: 'cloud_unreachable',
      message: livebooksCloudUnreachableUserMessage(),
    };
  }

  if (lookup.ok && lookup.data && typeof lookup.data === 'object') {
    const id = (lookup.data as { book_id?: unknown }).book_id;
    if (typeof id === 'string' && id.length > 0) {
      return { ok: true, bookId: id };
    }
  }

  if (lookup.status === 404) {
    const companyName =
      (
        fyo.singles.AccountingSettings?.companyName as string | undefined
      )?.trim() || 'LiveBooks';
    const created = await livebooksCloudRequest({
      method: 'POST',
      path: '/api/v1/books',
      body: { instance_id: instanceId, name: companyName },
    });
    if (isLivebooksCloudNetworkFailure(created)) {
      return {
        ok: false,
        reason: 'cloud_unreachable',
        message: livebooksCloudUnreachableUserMessage(),
      };
    }
    if (
      created.ok &&
      created.data &&
      typeof created.data === 'object' &&
      typeof (created.data as { book_id?: unknown }).book_id === 'string'
    ) {
      return {
        ok: true,
        bookId: (created.data as { book_id: string }).book_id,
      };
    }
    const msg =
      created.data &&
      typeof created.data === 'object' &&
      'message' in created.data
        ? String((created.data as { message: unknown }).message)
        : undefined;
    return {
      ok: false,
      reason: 'api_error',
      message:
        msg ?? `Could not create cloud book (HTTP ${String(created.status)}).`,
    };
  }

  const msg =
    lookup.data && typeof lookup.data === 'object' && 'message' in lookup.data
      ? String((lookup.data as { message: unknown }).message)
      : undefined;
  return {
    ok: false,
    reason: 'api_error',
    message: msg ?? `Cloud book lookup failed (HTTP ${String(lookup.status)}).`,
  };
}

/**
 * Best-effort: revoke all Plaid Items for a company before local DB delete.
 * Skips when not signed in or the cloud book does not exist.
 */
export async function purgeCloudPlaidItemsForInstance(
  instanceId: string
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const { signedIn } = await getLivebooksCloudSessionSummary();
  if (!signedIn) {
    return { ok: true, skipped: true };
  }

  const lookup = await livebooksCloudRequest({
    method: 'GET',
    path: `/api/v1/books/lookup?instance_id=${encodeURIComponent(instanceId)}`,
  });

  if (lookup.status === 404) {
    return { ok: true, skipped: true };
  }

  if (isLivebooksCloudNetworkFailure(lookup)) {
    return {
      ok: false,
      error: livebooksCloudUnreachableUserMessage(),
    };
  }

  if (!lookup.ok || lookup.data == null || typeof lookup.data !== 'object') {
    const msg =
      lookup.data && typeof lookup.data === 'object' && 'message' in lookup.data
        ? String((lookup.data as { message: unknown }).message)
        : `Cloud book lookup failed (HTTP ${String(lookup.status)}).`;
    return { ok: false, error: msg };
  }

  const bookId = (lookup.data as { book_id?: unknown }).book_id;
  if (typeof bookId !== 'string' || bookId.length === 0) {
    return { ok: false, error: 'Cloud book lookup returned no book_id.' };
  }

  const purge = await livebooksCloudRequest({
    method: 'DELETE',
    path: `/api/v1/books/${encodeURIComponent(bookId)}/plaid/items`,
  });

  if (purge.ok || purge.status === 204) {
    return { ok: true };
  }

  const err =
    purge.data && typeof purge.data === 'object' && 'message' in purge.data
      ? String((purge.data as { message: unknown }).message)
      : `Plaid purge failed (HTTP ${String(purge.status)}).`;
  return { ok: false, error: err };
}
