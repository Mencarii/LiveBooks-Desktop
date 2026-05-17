/**
 * Plaid batch apply path: turns a server-side `PlaidImportBatch` into local
 * `BankStatement(kind='feed_window', source='plaid_transactions_window')` rows.
 *
 * Single-device idempotency anchors:
 *   - per-batch: `BankStatement.cloudStatementId == publicId`
 *   - per-row:   `BankStatementLine.externalId == "plaid:<transaction_id>"`
 *
 * Crash safety: a `PlaidBatchApplyJournal` row is upserted before mutating the
 * local DB and transitioned through `applying -> ack_pending -> deleted` so a
 * background recovery sweep ({@link plaidApplyRecovery}) can replay or finish
 * acking after a crash. Replay is safe because of the per-row externalId upsert
 * and server-side ack idempotency (`PlaidImportBatchesController#ack`).
 *
 * Pending Plaid txns (when included in payloads via the cloud feature flag) are
 * stamped `isPending=true` + `matchStatus=ignored:plaid_pending` so the user
 * cannot reconcile them. A `removed` row pointing at a pending line is treated
 * as the normal pending->posted swap and the local row is deleted silently;
 * a `removed` for an already-`matched` row is surfaced via the
 * `retractedMatched` outcome and the existing apply-failure channel.
 */

import { fyo } from 'src/initFyo';
import {
  ackImportBatch,
  fetchImportBatchPayload,
  reportPlaidApplyFailed,
} from 'src/utils/plaidBankFeedsApi';
import { ModelNameEnum } from 'models/types';
import type { Doc } from 'fyo/model/doc';

const EXTERNAL_ID_PREFIX = 'plaid:';

export type RetractedMatchedRow = {
  externalId: string;
  bankAccount: string;
  statementName: string;
};

export type PlaidApplyOutcome =
  | {
      ok: true;
      appliedCount: number;
      excludedCount: number;
      removedCount: number;
      pendingCount: number;
      retractedMatchedCount: number;
      retractedMatched: RetractedMatchedRow[];
    }
  | {
      ok: false;
      reason:
        | 'needs_mapping'
        | 'currency_mismatch'
        | 'apply_error'
        | 'already_inflight';
      message: string;
      code?: string;
    };

type PlaidPayloadRow = {
  id?: unknown;
  date?: unknown;
  amount?: unknown;
  currency?: unknown;
  name?: unknown;
  pending?: unknown;
  removed?: unknown;
  account_id?: unknown;
  delta_kind?: unknown;
};

type NormalizedTx = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  name: string;
  accountId: string;
  isPending: boolean;
  deltaKind: string;
};

type RemovedTx = {
  id: string;
  accountId: string;
};

type GroupedRows = {
  byAccount: Map<string, NormalizedTx[]>;
  removedByAccount: Map<string, RemovedTx[]>;
  unmappedAccountIds: Set<string>;
};

type ApplyAccumulator = {
  applied: number;
  excluded: number;
  removed: number;
  pending: number;
  retractedMatched: RetractedMatchedRow[];
};

function isStringNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function safeString(v: unknown): string {
  if (typeof v === 'string') {
    return v;
  }
  if (v == null) {
    return '';
  }
  return String(v);
}

function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function normalizeDate(raw: unknown): string {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  return '';
}

/** Stable, non-crypto content hash used purely for dedupe noise (parallel to manual CSV import). */
function contentHashOf(parts: (string | number)[]): string {
  const s = parts.map((p) => String(p)).join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `plaid_h${(h >>> 0).toString(16)}`;
}

function externalIdFor(plaidTransactionId: string): string {
  return `${EXTERNAL_ID_PREFIX}${plaidTransactionId}`;
}

async function loadPayload(
  bookId: string,
  publicId: string
): Promise<{
  payload: Record<string, unknown> | null;
  error?: string;
  status: number;
}> {
  const { payload, error, status } = await fetchImportBatchPayload(
    bookId,
    publicId
  );
  if (error) {
    return { payload: null, error, status };
  }
  if (!payload || typeof payload !== 'object') {
    return { payload: null, error: 'Empty payload', status };
  }
  return { payload: payload as Record<string, unknown>, status };
}

function groupRows(
  payload: Record<string, unknown>,
  mapping: Map<string, string>,
  expectedCurrency: string | null
): { grouped: GroupedRows; currencyMismatch: string | null } {
  const out: GroupedRows = {
    byAccount: new Map(),
    removedByAccount: new Map(),
    unmappedAccountIds: new Set(),
  };
  const txs = Array.isArray(payload.transactions) ? payload.transactions : [];
  let currencyMismatch: string | null = null;

  for (const raw of txs) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const o = raw as PlaidPayloadRow;
    const accountId = isStringNonEmpty(o.account_id) ? o.account_id : '';
    if (!accountId) {
      continue;
    }
    const id = isStringNonEmpty(o.id) ? o.id : '';
    if (!id) {
      continue;
    }
    if (!mapping.has(accountId)) {
      out.unmappedAccountIds.add(accountId);
      continue;
    }

    if (o.removed === true) {
      const list = out.removedByAccount.get(accountId) ?? [];
      list.push({ id, accountId });
      out.removedByAccount.set(accountId, list);
      continue;
    }

    const cur = isStringNonEmpty(o.currency) ? o.currency : 'USD';
    if (expectedCurrency && cur !== expectedCurrency && !currencyMismatch) {
      currencyMismatch = cur;
    }

    const amount = parseAmount(o.amount);
    const date = normalizeDate(o.date);
    if (amount == null || !date) {
      continue;
    }

    const list = out.byAccount.get(accountId) ?? [];
    list.push({
      id,
      date,
      amount,
      currency: cur,
      name: safeString(o.name).trim(),
      accountId,
      isPending: o.pending === true,
      deltaKind: isStringNonEmpty(o.delta_kind) ? o.delta_kind : '',
    });
    out.byAccount.set(accountId, list);
  }

  return { grouped: out, currencyMismatch };
}

/** Inbound Plaid rows (non-removed, parseable) whose account_id is not in the local map. */
function countUnmappedInboundTransactions(
  payload: Record<string, unknown>,
  mapping: Map<string, string>
): number {
  const txs = Array.isArray(payload.transactions) ? payload.transactions : [];
  let n = 0;
  for (const raw of txs) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const o = raw as PlaidPayloadRow;
    const accountId = isStringNonEmpty(o.account_id) ? o.account_id : '';
    if (!accountId) {
      continue;
    }
    if (!isStringNonEmpty(o.id)) {
      continue;
    }
    if (mapping.has(accountId)) {
      continue;
    }
    if (o.removed === true) {
      continue;
    }
    const amount = parseAmount(o.amount);
    const date = normalizeDate(o.date);
    if (amount == null || !date) {
      continue;
    }
    n += 1;
  }
  return n;
}

function hasMappedPlaidActivity(
  grouped: GroupedRows,
  mapping: Map<string, string>
): boolean {
  if (grouped.byAccount.size > 0) {
    return true;
  }
  for (const accountId of grouped.removedByAccount.keys()) {
    if (mapping.has(accountId)) {
      return true;
    }
  }
  return false;
}

async function loadAccountMapping(
  itemId: string
): Promise<Map<string, string>> {
  const rows = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
    filters: { plaidItemId: itemId },
    fields: ['plaidAccountId', 'chartAccount'],
  })) as { plaidAccountId: string; chartAccount: string }[];
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.plaidAccountId && r.chartAccount) {
      out.set(r.plaidAccountId, r.chartAccount);
    }
  }
  return out;
}

async function findExistingStatement(
  bankAccount: string,
  publicId: string
): Promise<string | null> {
  const rows = (await fyo.db.getAll(ModelNameEnum.BankStatement, {
    filters: { bankAccount, cloudStatementId: publicId },
    fields: ['name'],
    limit: 1,
  })) as { name: string }[];
  return rows[0]?.name ?? null;
}

async function upsertStatementForAccount(opts: {
  bankAccount: string;
  publicId: string;
  itemId: string;
  txs: NormalizedTx[];
}): Promise<Doc> {
  const existingName = await findExistingStatement(
    opts.bankAccount,
    opts.publicId
  );
  if (existingName) {
    return await fyo.doc.getDoc(ModelNameEnum.BankStatement, existingName);
  }

  const dates = opts.txs.map((t) => t.date).filter((d) => !!d);
  dates.sort();
  const fromDate = dates[0] || new Date().toISOString().slice(0, 10);
  const toDate = dates[dates.length - 1] || fromDate;

  const doc = fyo.doc.getNewDoc(ModelNameEnum.BankStatement);
  await doc.set('bankAccount', opts.bankAccount);
  await doc.set('fromDate', fromDate);
  await doc.set('toDate', toDate);
  await doc.set('importedAt', new Date());
  await doc.set('source', 'plaid_transactions_window');
  await doc.set('kind', 'feed_window');
  await doc.set('status', 'Open');
  await doc.set('cloudStatementId', opts.publicId);
  await doc.set('plaidItemId', opts.itemId);
  return doc;
}

function existingExternalIds(doc: Doc): Set<string> {
  const lines = (doc.lines ?? []) as Array<Record<string, unknown>>;
  const out = new Set<string>();
  for (const ln of lines) {
    const eid = ln.externalId;
    if (typeof eid === 'string' && eid.length > 0) {
      out.add(eid);
    }
  }
  return out;
}

function findLineRowByExternalId(
  stmt: Doc,
  externalId: string
): Record<string, unknown> | null {
  const lines = (stmt.lines ?? []) as Array<Record<string, unknown>>;
  const row = lines.find((ln) => ln.externalId === externalId);
  return row ?? null;
}

function numericAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  return Number(raw ?? 0) || 0;
}

async function applyOneAccount(opts: {
  bankAccount: string;
  publicId: string;
  itemId: string;
  txs: NormalizedTx[];
  removed: RemovedTx[];
  expectedCurrency: string | null;
  acc: ApplyAccumulator;
}): Promise<void> {
  const stmt = await upsertStatementForAccount({
    bankAccount: opts.bankAccount,
    publicId: opts.publicId,
    itemId: opts.itemId,
    txs: opts.txs,
  });
  const seenIds = existingExternalIds(stmt);

  for (const tx of opts.txs) {
    const externalId = externalIdFor(tx.id);

    let matchStatus: 'unmatched' | 'ignored' = 'unmatched';
    let ignoreReason = '';

    if (tx.isPending) {
      matchStatus = 'ignored';
      ignoreReason = 'plaid_pending';
    } else if (
      opts.expectedCurrency &&
      tx.currency &&
      tx.currency !== opts.expectedCurrency
    ) {
      matchStatus = 'ignored';
      ignoreReason = `apply_failed:currency_mismatch:${tx.currency}`;
    }

    // Plaid: positive amount = outflow.
    // BankStatementLine.amount: inflow positive, outflow negative.
    const ledgerSignedAmount = -1 * tx.amount;
    const description = tx.name || '(no description)';
    const txDateKey = (tx.date || '').slice(0, 10);
    const nextHash = contentHashOf([
      tx.date,
      description,
      ledgerSignedAmount,
      tx.accountId,
    ]);

    const existingRow = findLineRowByExternalId(stmt, externalId);
    if (existingRow) {
      const wasPending = existingRow.isPending === true;

      if (wasPending && !tx.isPending) {
        // Pending -> posted upgrade for the same transaction_id. Promote in place.
        existingRow.date = tx.date;
        existingRow.description = description;
        existingRow.amount = fyo.pesa(ledgerSignedAmount);
        existingRow.bankReference = tx.id;
        existingRow.matchStatus = matchStatus;
        existingRow.ignoreReason = ignoreReason;
        existingRow.contentHash = nextHash;
        existingRow.possibleDuplicate = false;
        existingRow.isPending = false;
        existingRow.pendingPlaidTransactionId = '';
        if (tx.deltaKind) {
          existingRow.plaidDeltaKind = tx.deltaKind;
        }
        opts.acc.pending = Math.max(0, opts.acc.pending - 1);
        if (matchStatus === 'ignored') {
          opts.acc.excluded += 1;
        } else {
          opts.acc.applied += 1;
        }
        continue;
      }

      if (!wasPending && existingRow.matchStatus !== 'unmatched') {
        // Already reconciled or ignored by user; do not overwrite.
        continue;
      }

      const prevAmt = numericAmount(existingRow.amount);
      const prevDesc =
        typeof existingRow.description === 'string'
          ? existingRow.description
          : '';
      const prevDate =
        typeof existingRow.date === 'string'
          ? existingRow.date.slice(0, 10)
          : '';
      const prevIgnore =
        typeof existingRow.ignoreReason === 'string'
          ? existingRow.ignoreReason
          : '';
      const prevDelta =
        typeof existingRow.plaidDeltaKind === 'string'
          ? existingRow.plaidDeltaKind
          : '';
      const changed =
        prevAmt !== ledgerSignedAmount ||
        prevDesc !== description ||
        prevDate !== txDateKey ||
        String(existingRow.matchStatus) !== matchStatus ||
        prevIgnore !== ignoreReason ||
        Boolean(existingRow.isPending) !== tx.isPending ||
        prevDelta !== tx.deltaKind;

      if (changed) {
        existingRow.date = tx.date;
        existingRow.description = description;
        existingRow.amount = fyo.pesa(ledgerSignedAmount);
        existingRow.bankReference = tx.id;
        existingRow.matchStatus = matchStatus;
        existingRow.ignoreReason = ignoreReason;
        existingRow.contentHash = nextHash;
        existingRow.possibleDuplicate = false;
        existingRow.isPending = tx.isPending;
        existingRow.pendingPlaidTransactionId = tx.isPending ? tx.id : '';
        if (tx.deltaKind) {
          existingRow.plaidDeltaKind = tx.deltaKind;
        }
      }
      continue;
    }

    if (seenIds.has(externalId)) {
      continue;
    }

    await stmt.append('lines', {
      date: tx.date,
      description,
      amount: fyo.pesa(ledgerSignedAmount),
      bankReference: tx.id,
      externalId,
      matchStatus,
      ignoreReason,
      possibleDuplicate: false,
      contentHash: nextHash,
      isPending: tx.isPending,
      pendingPlaidTransactionId: tx.isPending ? tx.id : '',
      plaidDeltaKind: tx.deltaKind || '',
    });
    seenIds.add(externalId);

    if (tx.isPending) {
      opts.acc.pending += 1;
    } else if (matchStatus === 'ignored') {
      opts.acc.excluded += 1;
    } else {
      opts.acc.applied += 1;
    }
  }

  if (opts.removed.length) {
    const lines = (stmt.lines ?? []) as Array<Record<string, unknown>>;
    const indexByExternalId = new Map<string, number>();
    lines.forEach((ln, idx) => {
      const eid = ln.externalId;
      if (typeof eid === 'string') {
        indexByExternalId.set(eid, idx);
      }
    });

    const indicesToDelete: number[] = [];
    for (const r of opts.removed) {
      const idx = indexByExternalId.get(externalIdFor(r.id));
      if (idx == null) {
        continue;
      }
      const target = lines[idx];
      if (!target) {
        continue;
      }
      if (target.isPending === true) {
        // Pending -> removed: this is the normal pending->posted swap.
        // Drop the local pending row silently; the posted row arrives in
        // a subsequent batch under a different transaction_id.
        indicesToDelete.push(idx);
        opts.acc.pending = Math.max(0, opts.acc.pending - 1);
        continue;
      }
      if (target.matchStatus === 'matched') {
        // Plaid retracted a row the user already reconciled.
        // Leave it in place; surface via outcome banner + apply-failure log.
        opts.acc.retractedMatched.push({
          externalId:
            typeof target.externalId === 'string'
              ? target.externalId
              : externalIdFor(r.id),
          bankAccount: opts.bankAccount,
          statementName: typeof stmt.name === 'string' ? stmt.name : '',
        });
        continue;
      }
      target.matchStatus = 'ignored';
      target.ignoreReason = 'plaid_removed';
      opts.acc.removed += 1;
    }

    // Delete pending->posted swaps in descending order so indices stay valid.
    indicesToDelete.sort((a, b) => b - a);
    for (const idx of indicesToDelete) {
      await stmt.remove('lines', idx);
    }
  }

  await stmt.sync();
}

// ---------------------------------------------------------------------------
// Per-batch apply journal
// ---------------------------------------------------------------------------

export type JournalPhase = 'applying' | 'ack_pending';

const inflightPublicIds = new Set<string>();

async function getJournalDoc(publicId: string): Promise<Doc | null> {
  const exists = await fyo.db.exists(
    ModelNameEnum.PlaidBatchApplyJournal,
    publicId
  );
  if (!exists) {
    return null;
  }
  return await fyo.doc.getDoc(ModelNameEnum.PlaidBatchApplyJournal, publicId);
}

async function upsertJournalApplying(opts: {
  publicId: string;
  bookId: string;
  itemId: string;
}): Promise<number> {
  const now = new Date();
  const existing = await getJournalDoc(opts.publicId);
  if (existing) {
    const prev = Number(existing.attemptCount ?? 0) || 0;
    const next = prev + 1;
    await existing.set('phase', 'applying');
    await existing.set('attemptCount', next);
    await existing.set('updatedAt', now);
    await existing.sync();
    return next;
  }

  const doc = fyo.doc.getNewDoc(ModelNameEnum.PlaidBatchApplyJournal);
  await doc.set('name', opts.publicId);
  await doc.set('bookId', opts.bookId);
  await doc.set('itemId', opts.itemId);
  await doc.set('phase', 'applying');
  await doc.set('attemptCount', 1);
  await doc.set('appliedCount', 0);
  await doc.set('excludedCount', 0);
  await doc.set('removedCount', 0);
  await doc.set('startedAt', now);
  await doc.set('updatedAt', now);
  await doc.sync();
  return 1;
}

async function transitionJournalToAckPending(opts: {
  publicId: string;
  appliedCount: number;
  excludedCount: number;
  removedCount: number;
}): Promise<void> {
  const existing = await getJournalDoc(opts.publicId);
  if (!existing) {
    return;
  }
  await existing.set('phase', 'ack_pending');
  await existing.set('appliedCount', opts.appliedCount);
  await existing.set('excludedCount', opts.excludedCount);
  await existing.set('removedCount', opts.removedCount);
  await existing.set('updatedAt', new Date());
  await existing.sync();
}

export async function deleteApplyJournal(publicId: string): Promise<void> {
  const existing = await getJournalDoc(publicId);
  if (!existing) {
    return;
  }
  await existing.delete();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a single Plaid import batch by `publicId`. Fetches the payload
 * itself; for the bulk-fetch path that already has the payload in hand,
 * use {@link applyPlaidBatchWithPayload}.
 */
export async function applyPlaidBatch(
  bookId: string,
  publicId: string,
  itemId: string
): Promise<PlaidApplyOutcome> {
  if (inflightPublicIds.has(publicId)) {
    return {
      ok: false,
      reason: 'already_inflight',
      message: 'Apply already running for this batch.',
      code: 'already_inflight',
    };
  }
  if (!itemId) {
    const message = 'Missing Plaid item id for apply.';
    await reportPlaidApplyFailed(bookId, publicId, {
      message,
      code: 'missing_item_id',
    });
    return {
      ok: false,
      reason: 'apply_error',
      message,
      code: 'missing_item_id',
    };
  }

  const { payload, error, status } = await loadPayload(bookId, publicId);
  if (error || !payload) {
    if (status === 404) {
      // Cloud has purged this batch; whatever externalId upserts already
      // landed remain valid. Drop any orphan journal row and return cleanly.
      await deleteApplyJournal(publicId).catch(() => undefined);
      return {
        ok: false,
        reason: 'apply_error',
        message: 'Batch not found on the server.',
        code: 'cloud_purged',
      };
    }
    const msg = error || 'Empty payload';
    await reportPlaidApplyFailed(bookId, publicId, {
      message: msg,
      code: 'payload_unavailable',
    });
    return {
      ok: false,
      reason: 'apply_error',
      message: msg,
      code: 'payload_unavailable',
    };
  }

  return applyPlaidBatchWithPayload(bookId, publicId, itemId, payload);
}

/**
 * Apply a Plaid import batch when the payload is already in memory (e.g. the
 * caller already fetched it via `bulkFetchImportBatchPayloads`). Carries the
 * full journal + ack lifecycle.
 */
export async function applyPlaidBatchWithPayload(
  bookId: string,
  publicId: string,
  itemId: string,
  payload: Record<string, unknown>
): Promise<PlaidApplyOutcome> {
  if (inflightPublicIds.has(publicId)) {
    return {
      ok: false,
      reason: 'already_inflight',
      message: 'Apply already running for this batch.',
      code: 'already_inflight',
    };
  }
  if (!itemId) {
    const message = 'Missing Plaid item id for apply.';
    await reportPlaidApplyFailed(bookId, publicId, {
      message,
      code: 'missing_item_id',
    });
    return {
      ok: false,
      reason: 'apply_error',
      message,
      code: 'missing_item_id',
    };
  }

  inflightPublicIds.add(publicId);
  try {
    const expectedCurrency = fyo.singles.SystemSettings?.currency || null;

    let mapping: Map<string, string>;
    try {
      mapping = await loadAccountMapping(itemId);
    } catch (e) {
      const message = (e as Error).message || 'Failed to load account mapping.';
      await reportPlaidApplyFailed(bookId, publicId, {
        message,
        code: 'mapping_load_failed',
      });
      return {
        ok: false,
        reason: 'apply_error',
        message,
        code: 'mapping_load_failed',
      };
    }

    const { grouped, currencyMismatch } = groupRows(
      payload,
      mapping,
      expectedCurrency
    );

    const unmappedInbound = countUnmappedInboundTransactions(payload, mapping);
    const hasMapped = hasMappedPlaidActivity(grouped, mapping);
    if (unmappedInbound > 0 && !hasMapped) {
      // Don't journal here: there is no local mutation yet so nothing to recover.
      return {
        ok: false,
        reason: 'needs_mapping',
        message:
          'Map all Plaid sub-accounts to your chart of accounts before applying.',
        code: 'needs_mapping',
      };
    }

    if (
      currencyMismatch &&
      expectedCurrency &&
      currencyMismatch !== expectedCurrency &&
      grouped.byAccount.size > 0
    ) {
      // Per D4 we still apply rows but mark the off-currency ones as ignored.
      // The outer mismatch is informational; per-row exclusion happens inside applyOneAccount.
    }

    // Open a journal row before mutating local state.
    try {
      await upsertJournalApplying({ publicId, bookId, itemId });
    } catch (e) {
      const message =
        (e as Error).message || 'Failed to write apply journal entry.';
      await reportPlaidApplyFailed(bookId, publicId, {
        message,
        code: 'journal_write_failed',
      });
      return {
        ok: false,
        reason: 'apply_error',
        message,
        code: 'journal_write_failed',
      };
    }

    const acc: ApplyAccumulator = {
      applied: 0,
      excluded: unmappedInbound,
      removed: 0,
      pending: 0,
      retractedMatched: [],
    };

    try {
      for (const [accountId, txs] of grouped.byAccount) {
        const bankAccount = mapping.get(accountId)!;
        const removed = grouped.removedByAccount.get(accountId) ?? [];
        await applyOneAccount({
          bankAccount,
          publicId,
          itemId,
          txs,
          removed,
          expectedCurrency,
          acc,
        });
      }
      // Process removed rows for accounts that had no new txns this batch.
      for (const [accountId, removed] of grouped.removedByAccount) {
        if (grouped.byAccount.has(accountId)) {
          continue;
        }
        const bankAccount = mapping.get(accountId);
        if (!bankAccount) {
          continue;
        }
        await applyOneAccount({
          bankAccount,
          publicId,
          itemId,
          txs: [],
          removed,
          expectedCurrency,
          acc,
        });
      }
    } catch (e) {
      const message = (e as Error).message || 'Apply failed.';
      await reportPlaidApplyFailed(bookId, publicId, {
        message,
        code: 'apply_error',
      });
      // Leave journal in 'applying' so the recovery sweep retries.
      return {
        ok: false,
        reason: 'apply_error',
        message,
        code: 'apply_error',
      };
    }

    // Local mutations done; transition journal to ack_pending so a crash
    // between here and the ack call only requires the ack to be retried.
    try {
      await transitionJournalToAckPending({
        publicId,
        appliedCount: acc.applied,
        excludedCount: acc.excluded,
        removedCount: acc.removed,
      });
    } catch (e) {
      const message =
        (e as Error).message || 'Failed to update apply journal entry.';
      await reportPlaidApplyFailed(bookId, publicId, {
        message,
        code: 'journal_transition_failed',
      });
      // Apply succeeded; ack will still be attempted, but recovery may also retry.
    }

    // Surface retracted-matched rows via the existing apply-failure channel
    // so support sees the same signal the user does in the banner.
    for (const r of acc.retractedMatched) {
      await reportPlaidApplyFailed(bookId, publicId, {
        message: `Plaid retracted reconciled row ${r.externalId} on ${r.bankAccount}.`,
        code: 'retracted_after_match',
      }).catch(() => undefined);
    }

    const ack = await ackImportBatch(bookId, publicId, {
      applied_count: acc.applied,
      excluded_count: acc.excluded,
    });
    if (!ack.ok) {
      const message = ack.error || 'Server-side ack failed after local apply.';
      await reportPlaidApplyFailed(bookId, publicId, {
        message,
        code: 'ack_failed',
      });
      // Leave journal in 'ack_pending' so the recovery sweep retries the ack.
      return { ok: false, reason: 'apply_error', message, code: 'ack_failed' };
    }

    await deleteApplyJournal(publicId).catch(() => undefined);

    return {
      ok: true,
      appliedCount: acc.applied,
      excludedCount: acc.excluded,
      removedCount: acc.removed,
      pendingCount: acc.pending,
      retractedMatchedCount: acc.retractedMatched.length,
      retractedMatched: acc.retractedMatched,
    };
  } finally {
    inflightPublicIds.delete(publicId);
  }
}

/** Test/recovery helper: returns a snapshot of the in-process apply mutex. */
export function inflightApplyPublicIds(): ReadonlySet<string> {
  return inflightPublicIds;
}
