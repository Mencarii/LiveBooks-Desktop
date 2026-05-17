/**
 * Bank statement line "apply" actions used by the For Review / Reviewed tabs:
 *   - categorizeAndAddLine: creates a real JournalEntry between the bank account and a chosen
 *     income/expense account, then marks the line `matched` with a back-reference.
 *   - linkLineToReference: matches a line to an existing Payment/JournalEntry (no new ledger doc).
 *   - undoLineMatch: voids/cancels the underlying doc and reverts the line to `unmatched`.
 *
 * Reconcile lock: until a real Reconciliation model exists we treat
 * `BankStatement.status === 'Closed'` as the lock; the caller is expected to check this
 * before calling `undoLineMatch`.
 */

import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import type { Doc } from 'fyo/model/doc';
import type { ManualFeedLine } from 'src/utils/bankFeedHelpers';

export type CategorizeOutcome =
  | { ok: true; journalEntryName: string }
  | { ok: false; error: string };

export type LinkOutcome = { ok: true } | { ok: false; error: string };

export type UndoOutcome =
  | { ok: true }
  | { ok: false; error: string; locked?: boolean };

async function getStatementDoc(line: ManualFeedLine): Promise<Doc> {
  return await fyo.doc.getDoc(ModelNameEnum.BankStatement, line.statementName);
}

function findLineDoc(
  stmt: Doc,
  line: ManualFeedLine
): Record<string, unknown> | null {
  const docLines = (stmt.lines ?? []) as Array<Record<string, unknown>>;
  if (line.lineName) {
    const byName = docLines.find((l) => l.name === line.lineName);
    if (byName) {
      return byName;
    }
  }
  return docLines[line.lineIdx] ?? null;
}

/**
 * Creates a JournalEntry that posts the bank account on one side and the chosen
 * category account on the other, then marks the bank statement line as matched.
 *
 * Sign convention: BankStatementLine.amount is "inflow positive, outflow negative".
 *   inflow  → debit bank, credit category
 *   outflow → credit bank, debit category
 */
export async function categorizeAndAddLine(opts: {
  bankAccount: string;
  categoryAccount: string;
  line: ManualFeedLine;
  description?: string;
}): Promise<CategorizeOutcome> {
  const amountFloat = opts.line.amountFloat;
  if (!Number.isFinite(amountFloat) || amountFloat === 0) {
    return { ok: false, error: 'Cannot categorize a zero-amount line.' };
  }
  if (!opts.categoryAccount) {
    return { ok: false, error: 'Pick a category before adding to the ledger.' };
  }

  const inflow = amountFloat > 0;
  const absAmount = Math.abs(amountFloat);
  const amount = fyo.pesa(absAmount);
  const zero = fyo.pesa(0);

  try {
    const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
      entryType: 'Bank Entry',
      date: opts.line.date,
      userRemark: opts.description ?? opts.line.description ?? '',
      referenceNumber: opts.line.bankReference ?? '',
    });

    if (inflow) {
      await jv.append('accounts', {
        account: opts.bankAccount,
        debit: amount,
        credit: zero,
      });
      await jv.append('accounts', {
        account: opts.categoryAccount,
        debit: zero,
        credit: amount,
      });
    } else {
      await jv.append('accounts', {
        account: opts.categoryAccount,
        debit: amount,
        credit: zero,
      });
      await jv.append('accounts', {
        account: opts.bankAccount,
        debit: zero,
        credit: amount,
      });
    }

    const synced = await jv.sync();
    await synced.submit();

    const stmt = await getStatementDoc(opts.line);
    const target = findLineDoc(stmt, opts.line);
    if (!target) {
      return {
        ok: false,
        error:
          'Created the ledger entry, but could not find the bank line to mark it matched.',
      };
    }
    target.matchStatus = 'matched';
    target.matchedReferenceType = ModelNameEnum.JournalEntry;
    target.matchedReferenceName = synced.name ?? jv.name ?? '';
    target.ignoreReason = '';
    await stmt.sync();
    return {
      ok: true,
      journalEntryName: target.matchedReferenceName as string,
    };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message || 'Failed to add to ledger.',
    };
  }
}

export async function linkLineToReference(opts: {
  line: ManualFeedLine;
  refType: string;
  refName: string;
}): Promise<LinkOutcome> {
  try {
    const stmt = await getStatementDoc(opts.line);
    const target = findLineDoc(stmt, opts.line);
    if (!target) {
      return { ok: false, error: 'Bank line not found.' };
    }
    target.matchStatus = 'matched';
    target.matchedReferenceType = opts.refType;
    target.matchedReferenceName = opts.refName;
    target.ignoreReason = '';
    await stmt.sync();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Failed to link.' };
  }
}

export async function setLineStatus(opts: {
  line: ManualFeedLine;
  status: 'unmatched' | 'matched' | 'ignored';
  ignoreReason?: string;
}): Promise<LinkOutcome> {
  try {
    const stmt = await getStatementDoc(opts.line);
    const target = findLineDoc(stmt, opts.line);
    if (!target) {
      return { ok: false, error: 'Bank line not found.' };
    }
    target.matchStatus = opts.status;
    if (opts.status === 'ignored') {
      target.ignoreReason = opts.ignoreReason ?? '';
    } else {
      target.ignoreReason = '';
    }
    if (opts.status !== 'matched') {
      target.matchedReferenceType = '';
      target.matchedReferenceName = '';
    }
    await stmt.sync();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message || 'Failed to update line.',
    };
  }
}

/**
 * Reverts a matched line: voids/cancels the linked JournalEntry/Payment and
 * sets the line back to `unmatched`. Refuses if the parent statement is `Closed`
 * (our reconcile-lock proxy until a Reconciliation model exists).
 */
export async function undoLineMatch(
  line: ManualFeedLine
): Promise<UndoOutcome> {
  if (line.statementStatus === 'Closed') {
    return {
      ok: false,
      locked: true,
      error:
        'This statement is reconciled. Reopen the reconciliation before undoing.',
    };
  }
  if (line.matchStatus !== 'matched') {
    // Treat as success — already in target state.
    return { ok: true };
  }
  try {
    const refType = line.matchedReferenceType;
    const refName = line.matchedReferenceName;
    if (refType && refName) {
      try {
        const refDoc = await fyo.doc.getDoc(refType, refName);
        if (refDoc.cancelled !== true && typeof refDoc.cancel === 'function') {
          await refDoc.cancel();
        } else if (typeof refDoc.delete === 'function') {
          await refDoc.delete();
        }
      } catch {
        // Underlying doc already gone or cannot be cancelled — fall through and
        // still flip the bank line so the user is unblocked.
      }
    }
    const stmt = await getStatementDoc(line);
    const target = findLineDoc(stmt, line);
    if (!target) {
      return { ok: false, error: 'Bank line not found.' };
    }
    target.matchStatus = 'unmatched';
    target.matchedReferenceType = '';
    target.matchedReferenceName = '';
    target.ignoreReason = '';
    await stmt.sync();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Undo failed.' };
  }
}

export type ReconcileCandidate = {
  referenceType: string;
  referenceName: string;
  date?: string;
  debit?: unknown;
  credit?: unknown;
};

export async function findExactMatchCandidate(
  bankAccount: string,
  line: ManualFeedLine
): Promise<ReconcileCandidate | null> {
  if (!bankAccount || !line.date) {
    return null;
  }
  try {
    const candidates = await (
      fyo.db as unknown as {
        getBankReconcileCandidates: (
          bankAccount: string,
          date: string,
          amount: number,
          limit: number
        ) => Promise<ReconcileCandidate[]>;
      }
    ).getBankReconcileCandidates(
      bankAccount,
      line.date,
      Math.abs(line.amountFloat),
      1
    );
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}
