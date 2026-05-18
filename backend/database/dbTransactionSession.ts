import type { Knex } from 'knex';
import type DatabaseCore from './core';

/**
 * Holds a knex transaction open across multiple IPC DB_CALLs (renderer apply path).
 */
export class DbTransactionSession {
  #release: (() => void) | null = null;
  #reject: ((err: Error) => void) | null = null;
  #promise: Promise<void> | null = null;

  get active(): boolean {
    return this.#release !== null;
  }

  begin(db: DatabaseCore): void {
    if (this.active) {
      throw new Error('Database transaction already active');
    }
    const knex = db.knex;
    if (!knex) {
      throw new Error('Database not connected');
    }

    let release!: () => void;
    let reject!: (err: Error) => void;
    const gate = new Promise<void>((res, rej) => {
      release = res;
      reject = rej;
    });
    this.#release = release;
    this.#reject = reject;

    this.#promise = knex.transaction(async (trx) => {
      const prior = db.knex!;
      db.knex = trx as Knex;
      try {
        await gate;
      } finally {
        db.knex = prior;
      }
    });
  }

  async commit(): Promise<void> {
    if (!this.#release) {
      throw new Error('No active database transaction');
    }
    const release = this.#release;
    this.#release = null;
    this.#reject = null;
    release();
    await this.#promise;
    this.#promise = null;
  }

  async rollback(): Promise<void> {
    if (!this.#reject) {
      throw new Error('No active database transaction');
    }
    const reject = this.#reject;
    this.#release = null;
    this.#reject = null;
    reject(new Error('TRANSACTION_ROLLBACK'));
    try {
      await this.#promise;
    } catch {
      // knex rolls back when the transaction callback throws
    }
    this.#promise = null;
  }
}
