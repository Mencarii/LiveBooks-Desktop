import test from 'tape';
import { resolveLwwConflict } from 'utils/sync/lwwConflict';

test('resolveLwwConflict picks newer updatedAt', (t) => {
  const r = resolveLwwConflict(
    {
      deviceId: 'local',
      updatedAt: '2026-01-01T00:00:00.000Z',
      payload: { schemaName: 'SalesInvoice', docName: 'a', name: 'a' },
    },
    {
      deviceId: 'remote',
      updatedAt: '2026-02-01T00:00:00.000Z',
      payload: { schemaName: 'SalesInvoice', docName: 'a', name: 'a' },
    }
  );
  t.equal(r.winner.deviceId, 'remote');
  t.equal(r.loser.deviceId, 'local');
  t.equal(r.conflict.resolution, 'lww');
  t.end();
});

test('resolveLwwConflict prefers higher rowVersion over updatedAt', (t) => {
  const r = resolveLwwConflict(
    {
      deviceId: 'local',
      updatedAt: '2026-06-01T00:00:00.000Z',
      rowVersion: 2,
      payload: { schemaName: 'SalesInvoice', docName: 'a' },
    },
    {
      deviceId: 'remote',
      updatedAt: '2026-01-01T00:00:00.000Z',
      rowVersion: 5,
      payload: { schemaName: 'SalesInvoice', docName: 'a' },
    }
  );
  t.equal(r.winner.deviceId, 'remote');
  t.end();
});

test('resolveLwwConflict uses server tiebreaker on equal timestamps', (t) => {
  const ts = '2026-03-01T12:00:00.000Z';
  const r = resolveLwwConflict(
    {
      deviceId: 'local',
      updatedAt: ts,
      payload: { schemaName: 'SalesInvoice', docName: 'x' },
    },
    {
      deviceId: 'remote',
      updatedAt: ts,
      payload: { schemaName: 'SalesInvoice', docName: 'x' },
    },
    'remote'
  );
  t.equal(r.winner.deviceId, 'remote');
  t.end();
});
