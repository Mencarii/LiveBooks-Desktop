import BetterSQLite3 from 'better-sqlite3';
import fs from 'fs-extra';
import { DatabaseError } from 'fyo/utils/errors';
import path from 'path';
import { DatabaseDemuxBase, DatabaseMethod } from 'utils/db/types';
import { getMapFromList } from 'utils/index';
import { Version } from 'utils/version';
import { getSchemas } from '../../schemas';
import { databaseMethodSet, unlinkIfExists } from '../helpers';
import patches from '../patches';
import { BespokeQueries } from './bespoke';
import {
  applyTargetCipherProfile,
  probeDatabaseCipherMode,
} from './cipherProfile';
import DatabaseCore from './core';
import { DbTransactionSession } from './dbTransactionSession';
import { ensureTargetCipherProfile } from './migration';
import {
  SCHEMA_MIGRATION_COMPLETE,
  SCHEMA_MIGRATION_NONE,
  SCHEMA_MIGRATION_PARTIAL,
  getSchemaMigrationVersion,
  isGreenfieldUuidLedger,
  setSchemaMigrationVersion,
} from 'utils/ids/uuidIdentityState';
import { runPatches } from './runPatch';
import { BespokeFunction, Patch, RawCustomField } from './types';

export class DatabaseManager extends DatabaseDemuxBase {
  db?: DatabaseCore;
  rawCustomFields: RawCustomField[] = [];
  encryptionKey?: string;
  readonly #dbTransaction = new DbTransactionSession();

  get #isInitialized(): boolean {
    return this.db !== undefined && this.db.knex !== undefined;
  }

  getSchemaMap() {
    if (this.#isInitialized) {
      return this.db?.schemaMap ?? getSchemas('-', this.rawCustomFields);
    }

    return getSchemas('-', this.rawCustomFields);
  }

  async createNewDatabase(
    dbPath: string,
    countryCode: string,
    encryptionKey?: string
  ) {
    await unlinkIfExists(dbPath);
    return await this.connectToDatabase(dbPath, countryCode, encryptionKey);
  }

  async connectToDatabase(
    dbPath: string,
    countryCode?: string,
    encryptionKey?: string
  ) {
    this.encryptionKey = encryptionKey;
    countryCode = await this._connect(dbPath, countryCode, encryptionKey);
    await this.#migrate();
    await this.#assertUuidMigrationNotPartial();
    return countryCode;
  }

  async _connect(dbPath: string, countryCode?: string, encryptionKey?: string) {
    if (encryptionKey && dbPath !== ':memory:') {
      const ok = await ensureTargetCipherProfile(dbPath, encryptionKey);
      if (!ok) {
        const error = new Error(
          'Database encryption key mismatch. Recovery mode required.'
        );
        (error as Error & { code: string }).code = 'KEYCHAIN_CORRUPTED';
        throw error;
      }
    }

    countryCode ??= await DatabaseCore.getCountryCode(dbPath, encryptionKey);
    this.db = new DatabaseCore(dbPath, encryptionKey);
    this.db.connect();
    await this.setRawCustomFields();
    const schemaMap = getSchemas(countryCode, this.rawCustomFields);
    this.db.setSchemaMap(schemaMap);
    return countryCode;
  }

  async setRawCustomFields() {
    try {
      this.rawCustomFields = (await this.db?.knex?.(
        'CustomField'
      )) as RawCustomField[];
    } catch {}
  }

  async #assertUuidMigrationNotPartial(): Promise<void> {
    if (!this.db?.knex) {
      return;
    }
    const version = await getSchemaMigrationVersion(this.db.knex);
    if (version === SCHEMA_MIGRATION_PARTIAL) {
      const error = new Error(
        'UUID identity migration did not complete. Restore the pre-migration backup from livebooks_backups/ before opening this company file.'
      );
      (error as Error & { code: string }).code = 'UUID_MIGRATION_PARTIAL';
      throw error;
    }
  }

  async #migrate(): Promise<void> {
    if (!this.#isInitialized) {
      return;
    }

    const isFirstRun = await this.#getIsFirstRun();
    if (isFirstRun) {
      await this.db!.migrate();
      await this.#seedGreenfieldUuidIdentity();
    }

    await this.#executeMigration();
  }

  /** New books use UUID COA from setup; no legacy migration or backup needed. */
  async #seedGreenfieldUuidIdentity(): Promise<void> {
    const knex = this.db?.knex;
    if (!knex) {
      return;
    }

    await setSchemaMigrationVersion(knex, SCHEMA_MIGRATION_COMPLETE);
  }

  /** Repair books that failed uuidIdentityMigration before greenfield skip existed. */
  async #ensureGreenfieldUuidIdentitySeeded(): Promise<void> {
    const knex = this.db?.knex;
    if (!knex) {
      return;
    }

    if (!(await isGreenfieldUuidLedger(knex))) {
      return;
    }

    const version = await getSchemaMigrationVersion(knex);
    if (version === SCHEMA_MIGRATION_NONE) {
      await setSchemaMigrationVersion(knex, SCHEMA_MIGRATION_COMPLETE);
    }
  }

  async #executeMigration() {
    await this.#ensureGreenfieldUuidIdentitySeeded();

    const version = await this.#getAppVersion();
    const patches = await this.#getPatchesToExecute(version);

    const hasPatches = !!patches.pre.length || !!patches.post.length;
    if (hasPatches) {
      await this.#createBackup();
    }

    await runPatches(patches.pre, this, version);
    await this.db!.migrate({
      pre: async () => {
        if (hasPatches) {
          return;
        }

        await this.#createBackup();
      },
    });
    await runPatches(patches.post, this, version);
  }

  async #getPatchesToExecute(
    version: string
  ): Promise<{ pre: Patch[]; post: Patch[] }> {
    if (this.db === undefined) {
      return { pre: [], post: [] };
    }

    const query = (await this.db.knex!('PatchRun').select()) as {
      name: string;
      version?: string;
      failed?: boolean;
    }[];

    const runPatchesMap = getMapFromList(query, 'name');
    const uuidMigrationState = await getSchemaMigrationVersion(this.db.knex);
    /**
     * A patch is run only if:
     * - it hasn't run and was added in a future version
     *    i.e. app version is before patch added version
     * - it ran but failed in some other version (i.e fixed)
     * - uuidIdentityMigration failed earlier but migration never completed
     */
    const greenfieldUuid = await isGreenfieldUuidLedger(this.db.knex);

    const filtered = patches
      .filter((p) => {
        if (
          p.name === 'uuidIdentityMigration' &&
          (uuidMigrationState === SCHEMA_MIGRATION_COMPLETE || greenfieldUuid)
        ) {
          return false;
        }

        const exec = runPatchesMap[p.name];
        if (!exec && Version.lte(version, p.version)) {
          return true;
        }

        if (exec?.failed && exec?.version !== version) {
          return true;
        }

        if (
          exec?.failed &&
          p.name === 'uuidIdentityMigration' &&
          uuidMigrationState === SCHEMA_MIGRATION_NONE
        ) {
          return true;
        }

        return false;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return {
      pre: filtered.filter((p) => p.patch.beforeMigrate),
      post: filtered.filter((p) => !p.patch.beforeMigrate),
    };
  }

  beginTransaction(): void {
    if (!this.db?.knex) {
      throw new DatabaseError('Database not connected');
    }
    this.#dbTransaction.begin(this.db);
  }

  async endTransaction(commit = true): Promise<void> {
    if (commit) {
      await this.#dbTransaction.commit();
    } else {
      await this.#dbTransaction.rollback();
    }
  }

  async call(method: DatabaseMethod, ...args: unknown[]) {
    if (!this.#isInitialized) {
      return;
    }

    if (!databaseMethodSet.has(method)) {
      return;
    }

    // @ts-ignore
    const response = await this.db[method](...args);
    if (method === 'close') {
      delete this.db;
    }

    return response;
  }

  async callBespoke(method: string, ...args: unknown[]): Promise<unknown> {
    if (!this.#isInitialized) {
      return;
    }

    if (!BespokeQueries.hasOwnProperty(method)) {
      throw new DatabaseError(`invalid bespoke db function ${method}`);
    }

    const queryFunction: BespokeFunction =
      BespokeQueries[method as keyof BespokeFunction];
    return await queryFunction(this.db!, ...args);
  }

  async #getIsFirstRun(): Promise<boolean> {
    const knex = this.db?.knex;
    if (!knex) {
      return true;
    }

    const query = await knex('sqlite_master').where({
      type: 'table',
      name: 'PatchRun',
    });
    return !query.length;
  }

  /** verified backup before UUID migration (also used by patch runner). */
  async createVerifiedPreMigrationBackup(): Promise<string | null> {
    return await this.#createBackup();
  }

  async #createBackup(): Promise<string | null> {
    const { dbPath } = this.db ?? {};
    if (!dbPath || process.env.IS_TEST) {
      return null;
    }

    const backupPath = await this.#getBackupFilePath();
    if (!backupPath) {
      return null;
    }

    // SQLite3MultipleCiphers >= 1.8.6 rejects the SQLite Online Backup API
    // when source and target use different cipher profiles, and the destination
    // opened by `better-sqlite3`'s `.backup()` has no cipher applied. Instead,
    // checkpoint the live writer and copy the encrypted database file
    // byte-for-byte. The copy preserves the existing cipher metadata so the
    // backup opens with the same hexkey, which the post-copy probe verifies.
    await fs.ensureDir(path.dirname(backupPath));
    await this.#checkpointAndCopyDatabase(dbPath, backupPath);

    // backup encryption invariant: a backup file MUST
    // open with the same encryption profile as the source. Use the full
    // cipher probe (not target-only) so copies taken while the writer is
    // open still verify when the on-disk profile matches the live connection.
    if (this.encryptionKey) {
      try {
        const mode = probeDatabaseCipherMode(backupPath, this.encryptionKey);
        if (mode === null) {
          await fs.remove(backupPath).catch(() => undefined);
          throw new DatabaseError(
            `Backup verification failed: ${path.basename(backupPath)} ` +
              `did not open with the active encryption key. The unverified ` +
              `backup file has been removed.`
          );
        }
      } catch (err) {
        if (err instanceof DatabaseError) {
          throw err;
        }
        // Probe failure (I/O etc.) — be conservative and delete.
        await fs.remove(backupPath).catch(() => undefined);
        throw new DatabaseError(
          `Backup verification could not run for ${path.basename(
            backupPath
          )}: ` + `${(err as Error).message ?? String(err)}`
        );
      }
    }

    return backupPath;
  }

  #sanitizePathSegment(name: string): string {
    const cleaned = name
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, 200);
  }

  #getDbBaseName(dbPath: string): string {
    let fileName = path.parse(dbPath).name;
    if (fileName.endsWith('.books')) {
      fileName = fileName.slice(0, -6);
    }
    return fileName;
  }

  async #getCompanyBackupSegment(): Promise<string> {
    const knex = this.db?.knex;
    const { dbPath } = this.db ?? {};
    if (!dbPath || dbPath === ':memory:') {
      return 'unknown_company';
    }

    try {
      if (knex) {
        const query = await knex('SingleValue')
          .select('value')
          .where({ fieldname: 'companyName', parent: 'AccountingSettings' });
        const raw = (query[0] as { value?: string } | undefined)?.value?.trim();
        if (raw) {
          const safe = this.#sanitizePathSegment(raw);
          if (safe) {
            return safe;
          }
        }
      }
    } catch {
      /* use file name */
    }

    const fallback = this.#sanitizePathSegment(this.#getDbBaseName(dbPath));
    return fallback || 'unknown_company';
  }

  async #getNextBackupIndex(
    backupFolder: string,
    companySegment: string
  ): Promise<number> {
    await fs.ensureDir(backupFolder);
    const names = await fs.readdir(backupFolder).catch(() => [] as string[]);
    const escaped = companySegment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escaped}-backup(\\d+)\\.db$`);
    let max = 0;
    for (const name of names) {
      const m = name.match(re);
      if (m) {
        max = Math.max(max, parseInt(m[1], 10));
      }
    }
    return max + 1;
  }

  async #checkpointAndCopyDatabase(
    dbPath: string,
    backupPath: string
  ): Promise<void> {
    // Best-effort: flush any pending WAL contents into the main DB file so
    // the byte-for-byte copy is consistent. Harmless when journal_mode is
    // "delete" (the project default) — SQLite simply reports a no-op.
    try {
      await this.db?.knex?.raw('PRAGMA wal_checkpoint(FULL)');
      await this.db?.knex?.raw('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* checkpoint is advisory; copy still proceeds */
    }

    await fs.copyFile(dbPath, backupPath);

    // Do not copy -wal/-shm/-journal onto the backup: a standalone open of the
    // main file must not pick up a mismatched sidecar (breaks SQLCipher verify).
    for (const sidecar of ['-wal', '-shm', '-journal']) {
      await fs.remove(`${backupPath}${sidecar}`).catch(() => undefined);
    }
  }

  async #getBackupFilePath() {
    const { dbPath } = this.db ?? {};
    if (dbPath === ':memory:' || !dbPath) {
      return null;
    }

    const companySegment = await this.#getCompanyBackupSegment();
    const backupRoot = path.join(path.dirname(dbPath), 'livebooks_backups');
    const backupFolder = path.join(backupRoot, companySegment);
    const next = await this.#getNextBackupIndex(backupFolder, companySegment);
    const backupFile = `${companySegment}-backup${next}.db`;
    return path.join(backupFolder, backupFile);
  }

  async #getAppVersion(): Promise<string> {
    const knex = this.db?.knex;
    if (!knex) {
      return '0.0.0';
    }

    const query = await knex('SingleValue')
      .select('value')
      .where({ fieldname: 'version', parent: 'SystemSettings' });
    const value = (query[0] as undefined | { value: string })?.value;
    return value || '0.0.0';
  }

  getDriver() {
    const { dbPath } = this.db ?? {};
    if (!dbPath) {
      return null;
    }

    const rawDb = BetterSQLite3(dbPath, { readonly: true });
    if (this.encryptionKey) {
      applyTargetCipherProfile(rawDb, this.encryptionKey);
    }
    return rawDb;
  }
}

export default new DatabaseManager();
