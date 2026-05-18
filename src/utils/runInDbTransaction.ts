import { DatabaseError } from 'fyo/utils/errors';
import { BackendResponse } from 'utils/ipc/types';

function assertDbOk(response: BackendResponse): void {
  if (response.error?.name) {
    const { name, message, stack, code } = response.error;
    const err = new DatabaseError(`${name}\n${message}`);
    err.stack = stack;
    if (typeof code === 'string' && code.length > 0) {
      (err as DatabaseError & { code?: string }).code = code;
    }
    throw err;
  }
}

/**
 * Run renderer DB work inside one main-process knex transaction.
 * Network I/O must happen outside this helper (fetch/ack after commit).
 */
export async function runInDbTransaction<T>(fn: () => Promise<T>): Promise<T> {
  assertDbOk(await ipc.db.beginTransaction());
  try {
    const result = await fn();
    assertDbOk(await ipc.db.endTransaction(true));
    return result;
  } catch (error) {
    await ipc.db.endTransaction(false).catch(() => undefined);
    throw error;
  }
}
