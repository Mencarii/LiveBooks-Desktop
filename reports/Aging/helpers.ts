import { DateTime } from 'luxon';
import { Money } from 'pesa';

/** Calendar days from invoice date (start of day) to as-of date (start of day), inclusive-style diff. */
export function getInvoiceAgeDays(
  invoiceDateISO: string,
  asOfDateISO: string
): number {
  const inv = DateTime.fromISO(invoiceDateISO).startOf('day');
  const asOf = DateTime.fromISO(asOfDateISO).startOf('day');
  return Math.floor(asOf.diff(inv, 'days').days);
}

export const AGING_BUCKET_COUNT = 4;

/**
 * Buckets: under 31 days → 0, 31–60 → 1, 61–90 → 2, 91+ → 3 (invoice-date aging).
 */
export function getAgingBucketIndex(ageDays: number): 0 | 1 | 2 | 3 {
  if (ageDays < 31) {
    return 0;
  }
  if (ageDays < 61) {
    return 1;
  }
  if (ageDays < 91) {
    return 2;
  }
  return 3;
}

export function bucketAmountsFromOutstanding(
  outstanding: Money,
  ageDays: number
): Money[] {
  const idx = getAgingBucketIndex(ageDays);
  const buckets = Array.from({ length: AGING_BUCKET_COUNT }, (_, i) =>
    i === idx ? outstanding : outstanding.mul(0)
  );
  return buckets;
}

export function sumMoneyColumns(rows: Money[][], zero: Money): Money[] {
  return Array.from({ length: AGING_BUCKET_COUNT }, (_, col) =>
    rows.reduce((acc, row) => acc.add(row[col] ?? zero.mul(0)), zero.mul(0))
  );
}
