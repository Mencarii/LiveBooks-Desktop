import test from 'tape';
import {
  isSubscriptionRevisionNewer,
  parseSubscriptionChangedAtIso,
} from '../livebooksCloudSubscriptionRevision';

test('parseSubscriptionChangedAtIso accepts ISO strings', (t) => {
  const iso = '2026-05-16T12:00:00.123Z';
  t.equal(parseSubscriptionChangedAtIso(iso), iso);
  t.equal(parseSubscriptionChangedAtIso(''), null);
  t.equal(parseSubscriptionChangedAtIso('not-a-date'), null);
  t.end();
});

test('isSubscriptionRevisionNewer when server revision is ahead', (t) => {
  t.equal(
    isSubscriptionRevisionNewer(
      '2026-05-16T10:00:00.000Z',
      '2026-05-16T12:00:00.000Z'
    ),
    true
  );
  t.equal(
    isSubscriptionRevisionNewer(
      '2026-05-16T12:00:00.000Z',
      '2026-05-16T10:00:00.000Z'
    ),
    false
  );
  t.equal(isSubscriptionRevisionNewer(null, '2026-05-16T12:00:00.000Z'), false);
  t.equal(isSubscriptionRevisionNewer('2026-05-16T10:00:00.000Z', null), false);
  t.end();
});
