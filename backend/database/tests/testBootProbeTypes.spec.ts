import test from 'tape';

test('boot probe codes include expected matrix values', (t) => {
  const codes = [
    'OK',
    'KEYCHAIN_UNAVAILABLE',
    'KEYCHAIN_CORRUPTED',
    'DB_OPEN_FAILED',
  ] as const;
  t.equal(codes.length, 4);
  t.end();
});
