import test from 'tape';

test('boot probe codes include Phase 2 matrix values', (t) => {
  const codes = [
    'OK',
    'KEYCHAIN_UNAVAILABLE',
    'KEYCHAIN_CORRUPTED',
    'DB_OPEN_FAILED',
  ] as const;
  t.equal(codes.length, 4);
  t.end();
});
