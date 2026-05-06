import test from 'tape';
import { pesa } from 'pesa';
import {
  AGING_BUCKET_COUNT,
  bucketAmountsFromOutstanding,
  getAgingBucketIndex,
  getInvoiceAgeDays,
  sumMoneyColumns,
} from 'reports/Aging/helpers';

test('getInvoiceAgeDays same calendar day is 0', (t) => {
  t.equal(
    getInvoiceAgeDays('2024-06-15T10:00:00.000', '2024-06-15'),
    0,
    'same day'
  );
  t.end();
});

test('getInvoiceAgeDays 30-day span', (t) => {
  t.equal(
    getInvoiceAgeDays('2024-06-01T08:00:00.000', '2024-06-30'),
    29,
    'Jun 1 start to Jun 30 start is 29 days'
  );
  t.equal(
    getInvoiceAgeDays('2024-06-01', '2024-07-01'),
    30,
    'full month boundary'
  );
  t.end();
});

test('getAgingBucketIndex boundaries', (t) => {
  t.equal(getAgingBucketIndex(-5), 0, 'negative folds into first bucket');
  t.equal(getAgingBucketIndex(0), 0);
  t.equal(getAgingBucketIndex(30), 0);
  t.equal(getAgingBucketIndex(31), 1);
  t.equal(getAgingBucketIndex(60), 1);
  t.equal(getAgingBucketIndex(61), 2);
  t.equal(getAgingBucketIndex(90), 2);
  t.equal(getAgingBucketIndex(91), 3);
  t.end();
});

test('bucketAmountsFromOutstanding places full amount in one bucket', (t) => {
  const m = pesa(100);
  const b = bucketAmountsFromOutstanding(m, 45);
  t.equal(b.length, AGING_BUCKET_COUNT);
  t.ok(b[1]!.float > 99 && b[1]!.float < 101, 'bucket 31–60 holds amount');
  t.equal(b[0]!.float + b[2]!.float + b[3]!.float, 0, 'other buckets zero');
  t.end();
});

test('sumMoneyColumns aggregates columns', (t) => {
  const z = pesa(0);
  const a = bucketAmountsFromOutstanding(pesa(10), 10);
  const b = bucketAmountsFromOutstanding(pesa(20), 40);
  const sum = sumMoneyColumns([a, b], z);
  t.equal(sum[0]!.float, 10, '1–30 bucket');
  t.equal(sum[1]!.float, 20, '31–60 bucket');
  t.end();
});
