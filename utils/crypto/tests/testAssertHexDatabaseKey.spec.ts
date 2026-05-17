import test from 'tape';
import {
  assertHexDatabaseKey64,
  isHexDatabaseKey64,
  HEX_KEY_LENGTH,
} from 'utils/crypto/assertHexDatabaseKey';

const VALID_KEY = 'a'.repeat(64);

test('isHexDatabaseKey64 accepts 64 hex chars', (t) => {
  t.ok(isHexDatabaseKey64(VALID_KEY));
  t.notOk(isHexDatabaseKey64('abc'));
  t.notOk(isHexDatabaseKey64('g'.repeat(64)));
  t.equal(HEX_KEY_LENGTH, 64);
  t.end();
});

test('assertHexDatabaseKey64 throws on invalid shape', (t) => {
  t.throws(() => assertHexDatabaseKey64('short'), /64 hexadecimal/);
  t.doesNotThrow(() => assertHexDatabaseKey64(VALID_KEY));
  t.end();
});
