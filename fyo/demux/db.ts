import { DatabaseError, NotImplemented } from 'fyo/utils/errors';
import { SchemaMap } from 'schemas/types';
import { DatabaseDemuxBase, DatabaseMethod } from 'utils/db/types';
import { withSqliteBusyRetry } from 'utils/database/sqliteBusyRetry';
import { BackendResponse } from 'utils/ipc/types';

export class DatabaseDemux extends DatabaseDemuxBase {
  #isElectron = false;
  constructor(isElectron: boolean) {
    super();
    this.#isElectron = isElectron;
  }

  async #handleDBCall(func: () => Promise<BackendResponse>): Promise<unknown> {
    const response = await withSqliteBusyRetry(func);

    if (response.error?.name) {
      const { name, message, stack, code } = response.error;
      const dberror = new DatabaseError(`${name}\n${message}`);
      dberror.stack = stack;
      // Preserve main-process error.code (e.g. KEYCHAIN_CORRUPTED) so the
      // renderer can route to /recovery instead of treating every failure as
      // a generic DatabaseError. See
      if (typeof code === 'string' && code.length > 0) {
        (dberror as DatabaseError & { code?: string }).code = code;
      }

      throw dberror;
    }

    return response.data;
  }

  async getSchemaMap(): Promise<SchemaMap> {
    if (!this.#isElectron) {
      throw new NotImplemented();
    }

    return (await this.#handleDBCall(async () => {
      return await ipc.db.getSchema();
    })) as SchemaMap;
  }

  async createNewDatabase(
    dbPath: string,
    countryCode?: string
  ): Promise<string> {
    if (!this.#isElectron) {
      throw new NotImplemented();
    }

    return (await this.#handleDBCall(async () => {
      return ipc.db.create(dbPath, countryCode);
    })) as string;
  }

  async connectToDatabase(
    dbPath: string,
    countryCode?: string
  ): Promise<string> {
    if (!this.#isElectron) {
      throw new NotImplemented();
    }

    return (await this.#handleDBCall(async () => {
      return ipc.db.connect(dbPath, countryCode);
    })) as string;
  }

  async call(method: DatabaseMethod, ...args: unknown[]): Promise<unknown> {
    if (!this.#isElectron) {
      throw new NotImplemented();
    }

    return await this.#handleDBCall(async () => {
      return await ipc.db.call(method, ...args);
    });
  }

  async callBespoke(method: string, ...args: unknown[]): Promise<unknown> {
    if (!this.#isElectron) {
      throw new NotImplemented();
    }

    return await this.#handleDBCall(async () => {
      return await ipc.db.bespoke(method, ...args);
    });
  }
}
