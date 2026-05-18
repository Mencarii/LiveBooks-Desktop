import test from 'tape';
import { DatabaseError } from 'fyo/utils/errors';

/**
 * Mirrors fyo/demux/db.ts #handleDBCall error shaping .
 */
function databaseErrorFromBackendResponse(error: {
  name: string;
  message: string;
  stack?: string;
  code?: string;
}): DatabaseError & { code?: string } {
  const { name, message, stack, code } = error;
  const dberror = new DatabaseError(`${name}\n${message}`) as DatabaseError & {
    code?: string;
  };
  dberror.stack = stack;
  if (typeof code === 'string' && code.length > 0) {
    dberror.code = code;
  }
  return dberror;
}

test('backend DatabaseError code survives demux shaping', (t) => {
  const err = databaseErrorFromBackendResponse({
    name: 'DatabaseError',
    message: 'keychain slot unreadable',
    stack: 'at test',
    code: 'KEYCHAIN_CORRUPTED',
  });
  t.equal(err.code, 'KEYCHAIN_CORRUPTED');
  t.match(err.message, /keychain/);
  t.end();
});

test('demux omits code when backend payload has none', (t) => {
  const err = databaseErrorFromBackendResponse({
    name: 'DatabaseError',
    message: 'generic failure',
  });
  t.equal(err.code, undefined);
  t.end();
});
