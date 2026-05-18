import test from 'tape';
import { evaluatePlaidCatchUp } from 'src/utils/plaidCatchUpGuard';

test('evaluatePlaidCatchUp allows continuous backlog after long idle', (t) => {
  const last = '2025-01-01T00:00:00.000Z';
  const oldest = '2025-01-01T12:00:00.000Z';
  const nowMs = Date.parse('2025-08-01T00:00:00.000Z');
  const decision = evaluatePlaidCatchUp({
    lastSuccessfulPlaidApplyAt: last,
    oldestPendingCreatedAt: oldest,
    pendingBatchCount: 3,
    nowMs,
  });
  t.ok(decision.allow);
  t.end();
});

test('evaluatePlaidCatchUp blocks when gap exceeds one day', (t) => {
  const decision = evaluatePlaidCatchUp({
    lastSuccessfulPlaidApplyAt: '2025-01-01T00:00:00.000Z',
    oldestPendingCreatedAt: '2025-01-05T00:00:00.000Z',
    pendingBatchCount: 1,
    nowMs: Date.parse('2025-02-01T00:00:00.000Z'),
  });
  t.notOk(decision.allow);
  if (!decision.allow) {
    t.equal(decision.reason, 'gap_detected');
  }
  t.end();
});

test('evaluatePlaidCatchUp blocks extreme idle with no pending batches', (t) => {
  const decision = evaluatePlaidCatchUp({
    lastSuccessfulPlaidApplyAt: '2020-01-01T00:00:00.000Z',
    oldestPendingCreatedAt: null,
    pendingBatchCount: 0,
    nowMs: Date.parse('2026-01-01T00:00:00.000Z'),
  });
  t.notOk(decision.allow);
  if (!decision.allow) {
    t.equal(decision.reason, 'extreme_idle');
  }
  t.end();
});
