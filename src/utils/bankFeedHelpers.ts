import { fyo } from 'src/initFyo';
import type { PlaidFeedItemRow } from 'src/utils/plaidBankFeedsApi';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
export type PlaidMapRow = {
  plaidItemId: string;
  plaidAccountId: string;
  chartAccount: string;
  plaidDisplayLabel?: string;
};

export type BankCoaAccount = {
  name: string;
  accountName?: string;
  rootType?: string;
};

export type ManualFeedLine = {
  statementName: string;
  statementStatus: 'Open' | 'Closed';
  lineName: string;
  lineIdx: number;
  date: string;
  description: string;
  amountFloat: number;
  bankReference: string;
  externalId: string;
  matchStatus: 'unmatched' | 'matched' | 'ignored';
  matchedReferenceType: string;
  matchedReferenceName: string;
  ignoreReason: string;
  contentHash: string;
  possibleDuplicate: boolean;
  isPending: boolean;
  pendingPlaidTransactionId: string;
  plaidDeltaKind: string;
};

export type ManualFeedData = {
  statementNames: string[];
  lines: ManualFeedLine[];
};

export async function loadPlaidAccountMaps(): Promise<PlaidMapRow[]> {
  return (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
    fields: [
      'plaidItemId',
      'plaidAccountId',
      'chartAccount',
      'plaidDisplayLabel',
    ],
  })) as PlaidMapRow[];
}

export function mapsByChartAccount(
  maps: PlaidMapRow[]
): Record<string, PlaidMapRow[]> {
  const out: Record<string, PlaidMapRow[]> = {};
  for (const m of maps) {
    if (!m.chartAccount) {
      continue;
    }
    if (!out[m.chartAccount]) {
      out[m.chartAccount] = [];
    }
    out[m.chartAccount].push(m);
  }
  return out;
}

export function feedItemById(
  items: PlaidFeedItemRow[]
): Record<string, PlaidFeedItemRow> {
  const by: Record<string, PlaidFeedItemRow> = {};
  for (const it of items) {
    by[it.item_id] = it;
  }
  return by;
}

export function pendingCountForChartAccount(
  chartAccount: string,
  maps: PlaidMapRow[],
  feedByItem: Record<string, PlaidFeedItemRow>
): number {
  let n = 0;
  for (const m of maps) {
    if (m.chartAccount !== chartAccount) {
      continue;
    }
    const row = feedByItem[m.plaidItemId];
    if (!row?.pending_import_batches_by_plaid_account_id) {
      continue;
    }
    n += row.pending_import_batches_by_plaid_account_id[m.plaidAccountId] ?? 0;
  }
  return n;
}

export function lastSyncedForChartAccount(
  chartAccount: string,
  maps: PlaidMapRow[],
  feedByItem: Record<string, PlaidFeedItemRow>
): string | null {
  let best: string | null = null;
  for (const m of maps) {
    if (m.chartAccount !== chartAccount) {
      continue;
    }
    const at = feedByItem[m.plaidItemId]?.last_sync_at;
    if (!at) {
      continue;
    }
    if (!best || at > best) {
      best = at;
    }
  }
  return best;
}

export function isPlaidConnected(
  chartAccount: string,
  maps: PlaidMapRow[]
): boolean {
  return maps.some((m) => m.chartAccount === chartAccount);
}

export function isManualBankAccount(
  accountName: string,
  plaidMaps: PlaidMapRow[]
): boolean {
  return !plaidMaps.some((m) => m.chartAccount === accountName);
}

export async function loadAllBankCoaAccounts(): Promise<BankCoaAccount[]> {
  return (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name', 'accountName', 'rootType'],
    filters: {
      accountType: AccountTypeEnum.Bank,
      isGroup: false,
      disabled: false,
    },
  })) as BankCoaAccount[];
}

function normalizeDate(raw: unknown): string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      return '';
    }
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'string') {
    return raw.slice(0, 10);
  }
  return '';
}

function normalizeAmount(raw: unknown): number {
  if (raw && typeof raw === 'object' && 'float' in raw) {
    const v = (raw as { float: unknown }).float;
    return typeof v === 'number' ? v : Number(v ?? 0);
  }
  if (typeof raw === 'number') {
    return raw;
  }
  return Number(raw ?? 0) || 0;
}

function normalizeMatchStatus(raw: unknown): ManualFeedLine['matchStatus'] {
  if (raw === 'matched' || raw === 'ignored') {
    return raw;
  }
  return 'unmatched';
}

export async function loadManualFeedStatements(
  accountName: string
): Promise<ManualFeedData> {
  const stmts = (await fyo.db.getAll(ModelNameEnum.BankStatement, {
    fields: ['name', 'kind', 'status'],
    filters: { bankAccount: accountName },
  })) as { name: string; kind?: string | null; status?: string | null }[];

  const feedStatements = stmts.filter((s) => s.kind === 'feed_window');
  const feedNames = feedStatements.map((s) => s.name);

  const lines: ManualFeedLine[] = [];
  for (const stmtRow of feedStatements) {
    try {
      const doc = await fyo.doc.getDoc(
        ModelNameEnum.BankStatement,
        stmtRow.name
      );
      const status: 'Open' | 'Closed' =
        stmtRow.status === 'Closed' ? 'Closed' : 'Open';
      const docLines = (doc.lines ?? []) as Array<Record<string, unknown>>;
      docLines.forEach((ln, idx) => {
        lines.push({
          statementName: stmtRow.name,
          statementStatus: status,
          lineName: typeof ln.name === 'string' ? ln.name : '',
          lineIdx: idx,
          date: normalizeDate(ln.date),
          description: typeof ln.description === 'string' ? ln.description : '',
          amountFloat: normalizeAmount(ln.amount),
          bankReference:
            typeof ln.bankReference === 'string' ? ln.bankReference : '',
          externalId: typeof ln.externalId === 'string' ? ln.externalId : '',
          matchStatus: normalizeMatchStatus(ln.matchStatus),
          matchedReferenceType:
            typeof ln.matchedReferenceType === 'string'
              ? ln.matchedReferenceType
              : '',
          matchedReferenceName:
            typeof ln.matchedReferenceName === 'string'
              ? ln.matchedReferenceName
              : '',
          ignoreReason:
            typeof ln.ignoreReason === 'string' ? ln.ignoreReason : '',
          contentHash: typeof ln.contentHash === 'string' ? ln.contentHash : '',
          possibleDuplicate: Boolean(ln.possibleDuplicate),
          isPending: ln.isPending === true,
          pendingPlaidTransactionId:
            typeof ln.pendingPlaidTransactionId === 'string'
              ? ln.pendingPlaidTransactionId
              : '',
          plaidDeltaKind:
            typeof ln.plaidDeltaKind === 'string' ? ln.plaidDeltaKind : '',
        });
      });
    } catch {
      // Skip statements that fail to load; surfaced as a missing row, not a crash.
    }
  }

  return { statementNames: feedNames, lines };
}

export async function manualPendingCountFor(
  accountName: string
): Promise<number> {
  const { lines } = await loadManualFeedStatements(accountName);
  return lines.filter((l) => l.matchStatus === 'unmatched').length;
}

/** Stable key for duplicate detection: posting date + rounded amount. */
export function feedDateAmountKey(date: string, amount: number): string {
  const r = Math.round(amount * 1e6) / 1e6;
  return `${date.slice(0, 10)}\t${r}`;
}

/** All date+amount keys already present in feed_window staging for this bank account. */
export async function loadExistingDateAmountKeysForFeed(
  accountName: string
): Promise<Set<string>> {
  const { lines } = await loadManualFeedStatements(accountName);
  const keys = new Set<string>();
  for (const ln of lines) {
    if (!ln.date) {
      continue;
    }
    keys.add(feedDateAmountKey(ln.date, ln.amountFloat));
  }
  return keys;
}
