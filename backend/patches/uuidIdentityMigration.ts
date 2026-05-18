/**
 * 3.4 — atomic UUID identity migration.
 *
 * Runs once per ledger file inside a single SQLite transaction. Preserves
 * PlaidBankAccountMap row PKs; rewrites chartAccount FKs when Account names
 * become UUIDs.
 */

import { generateDocId, isUuidDocId } from 'utils/ids';
import {
  SCHEMA_MIGRATION_COMPLETE,
  SCHEMA_MIGRATION_NONE,
  SCHEMA_MIGRATION_PARTIAL,
  getSchemaMigrationVersion,
  isGreenfieldUuidLedger,
  setSchemaMigrationVersion,
} from 'utils/ids/uuidIdentityState';
import { probeDatabaseCipherMode } from '../database/cipherProfile';
import { getSchemas } from '../../schemas';
import type { SchemaMap } from '../../schemas/types';
import { DatabaseManager } from '../database/manager';
import type { Knex } from 'knex';

const TIER_A_UUID_TABLES = [
  'AccountingLedgerEntry',
  'StockLedgerEntry',
  'BankStatement',
  'IntegrationErrorLog',
  'ItemEnquiry',
] as const;

const TIER_B_NUMBER_SERIES = [
  'SalesInvoice',
  'PurchaseInvoice',
  'SalesQuote',
  'Payment',
  'JournalEntry',
  'StockMovement',
  'Shipment',
  'PurchaseReceipt',
  'PricingRule',
] as const;

const TIER_C_MASTER = ['Item', 'Party'] as const;

const PLAID_MAP_TABLE = 'PlaidBankAccountMap';

type AccountRow = {
  name: string;
  parentAccount: string | null;
  rootType: string | null;
};

/**
 * Confirm the encryption key opens the ledger file. When the patch runs, the
 * manager already holds an open Knex connection (verified at connect time);
 * opening a second read-only handle can spuriously fail under SQLCipher/WAL.
 */
async function assertEncryptionKeyOpensLedger(
  dm: DatabaseManager,
  dbPath: string,
  encryptionKey: string
): Promise<void> {
  if (dm.db?.knex) {
    await dm.db.knex.raw('SELECT 1');
    return;
  }

  if (probeDatabaseCipherMode(dbPath, encryptionKey) === null) {
    throw new Error(
      'Cannot run UUID migration: database key does not open the ledger file.'
    );
  }
}

async function execute(dm: DatabaseManager) {
  const knex = dm.db?.knex;
  const dbPath = dm.db?.dbPath;
  if (!knex || !dbPath || dbPath === ':memory:') {
    return;
  }

  const version = await getSchemaMigrationVersion(knex);
  if (version === SCHEMA_MIGRATION_COMPLETE) {
    return;
  }
  if (version === SCHEMA_MIGRATION_PARTIAL) {
    throw new Error(
      'UUID identity migration was interrupted. Restore from the pre-migration backup in livebooks_backups/ before opening this file again.'
    );
  }

  if (version !== SCHEMA_MIGRATION_NONE) {
    return;
  }

  if (await isGreenfieldUuidLedger(knex)) {
    await setSchemaMigrationVersion(knex, SCHEMA_MIGRATION_COMPLETE);
    return;
  }

  const encryptionKey = dm.encryptionKey;
  if (encryptionKey) {
    await assertEncryptionKeyOpensLedger(dm, dbPath, encryptionKey);
  }

  const backupPath = await dm.createVerifiedPreMigrationBackup();
  if (!backupPath && !process.env.IS_TEST) {
    throw new Error(
      'Cannot run UUID migration: a verified pre-migration backup in livebooks_backups/ is required.'
    );
  }

  const countryCode =
    (
      (await knex('SingleValue')
        .where({ fieldname: 'countryCode' })
        .first()) as { value?: string } | undefined
    )?.value ?? 'us';

  const schemaMap = getSchemas(countryCode, []);

  await setSchemaMigrationVersion(knex, SCHEMA_MIGRATION_PARTIAL);

  try {
    await knex.transaction(async (trx) => {
      const accountMap = await migrateAccounts(trx);
      await rewriteAccountLinkColumns(trx, schemaMap, accountMap);
      await migrateTierA(trx);
      await migrateTierB(trx);
      await migrateTierCMaster(trx);
      await migratePlaidChartAccounts(trx, accountMap);
      await setSchemaMigrationVersion(trx, SCHEMA_MIGRATION_COMPLETE);
    });
  } catch (err) {
    throw err;
  }
}

async function migrateAccounts(trx: Knex): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const hasAccountName = await trx.schema.hasColumn('Account', 'accountName');
  if (!hasAccountName) {
    await trx.schema.alterTable('Account', (table) => {
      table.string('accountName');
    });
  }

  const rows = (await trx('Account').select(
    'name',
    'parentAccount',
    'rootType',
    'accountName'
  )) as (AccountRow & { accountName?: string | null })[];

  for (const row of rows) {
    if (isUuidDocId(row.name)) {
      map.set(row.name, row.name);
      continue;
    }
    // Existing ledgers: assign fresh UUIDs (C2). Greenfield COA uses
    // systemAccountId() in createCOA for deterministic C1 seeds.
    map.set(row.name, generateDocId());
  }

  for (const row of rows) {
    const newParent = row.parentAccount
      ? map.get(row.parentAccount) ?? row.parentAccount
      : null;
    const updates: { parentAccount: string | null; accountName?: string } = {
      parentAccount: newParent,
    };
    if (oldNameNeedsDisplay(row) && !row.accountName?.trim()) {
      updates.accountName = row.name;
    }
    await trx('Account').where({ name: row.name }).update(updates);
  }

  for (const row of rows) {
    const newName = map.get(row.name)!;
    await trx('Account').where({ name: row.name }).update({ name: newName });
  }

  return map;
}

function oldNameNeedsDisplay(row: { name: string }): boolean {
  return !isUuidDocId(row.name);
}

async function rewriteAccountLinkColumns(
  trx: Knex,
  schemaMap: SchemaMap,
  accountMap: Map<string, string>
): Promise<void> {
  for (const schemaName of Object.keys(schemaMap)) {
    const schema = schemaMap[schemaName];
    if (!schema || schema.isAbstract) {
      continue;
    }
    const table = schema.name;
    if (table === 'Account' || table === PLAID_MAP_TABLE) {
      continue;
    }
    if (!(await trx.schema.hasTable(table))) {
      continue;
    }
    for (const field of schema.fields) {
      if (field.fieldtype !== 'Link' || field.target !== 'Account') {
        continue;
      }
      const col = field.fieldname;
      if (!(await trx.schema.hasColumn(table, col))) {
        continue;
      }
      for (const [oldName, newName] of accountMap) {
        if (oldName === newName) {
          continue;
        }
        await trx(table)
          .where(col, oldName)
          .update({ [col]: newName });
      }
    }
  }
}

async function migrateTierA(trx: Knex): Promise<void> {
  for (const table of TIER_A_UUID_TABLES) {
    if (!(await trx.schema.hasTable(table))) {
      continue;
    }
    const rows = (await trx(table).select('name')) as { name: string }[];
    for (const row of rows) {
      if (isUuidDocId(row.name)) {
        continue;
      }
      const newName = generateDocId();
      await renamePrimaryKey(trx, table, row.name, newName);
    }
  }
}

async function migrateTierB(trx: Knex): Promise<void> {
  for (const table of TIER_B_NUMBER_SERIES) {
    if (!(await trx.schema.hasTable(table))) {
      continue;
    }
    const hasDocNum = await trx.schema.hasColumn(table, 'documentNumber');
    const rows = (await trx(table).select('name')) as { name: string }[];
    for (const row of rows) {
      if (isUuidDocId(row.name)) {
        continue;
      }
      const newName = generateDocId();
      if (hasDocNum) {
        await trx(table)
          .where({ name: row.name })
          .update({ documentNumber: row.name });
      }
      await renamePrimaryKey(trx, table, row.name, newName);
    }
  }
}

async function migrateTierCMaster(trx: Knex): Promise<void> {
  for (const table of TIER_C_MASTER) {
    if (!(await trx.schema.hasTable(table))) {
      continue;
    }
    const rows = (await trx(table).select('name')) as { name: string }[];
    for (const row of rows) {
      if (isUuidDocId(row.name)) {
        continue;
      }
      const newName = generateDocId();
      await renamePrimaryKey(trx, table, row.name, newName);
    }
  }
}

async function migratePlaidChartAccounts(
  trx: Knex,
  accountMap: Map<string, string>
): Promise<void> {
  if (!(await trx.schema.hasTable(PLAID_MAP_TABLE))) {
    return;
  }
  const hasChart = await trx.schema.hasColumn(PLAID_MAP_TABLE, 'chartAccount');
  if (!hasChart) {
    return;
  }
  for (const [oldName, newName] of accountMap) {
    if (oldName === newName) {
      continue;
    }
    await trx(PLAID_MAP_TABLE)
      .where({ chartAccount: oldName })
      .update({ chartAccount: newName });
  }
}

/**
 * Rename PK and child `parent` / cross-doc Link references.
 */
async function renamePrimaryKey(
  trx: Knex,
  table: string,
  oldName: string,
  newName: string
): Promise<void> {
  const tableRows = (await trx('sqlite_master')
    .where({ type: 'table' })
    .whereNot('name', 'like', 'sqlite_%')
    .select('name')) as { name: string }[];
  const tableNames = tableRows.map((r) => r.name);

  for (const t of tableNames) {
    if (t === table) {
      continue;
    }
    if (await trx.schema.hasColumn(t, 'parent')) {
      await trx(t).where({ parent: oldName }).update({ parent: newName });
    }
    if (await trx.schema.hasColumn(t, 'referenceName')) {
      await trx(t)
        .where({ referenceName: oldName })
        .update({ referenceName: newName });
    }
  }

  await trx(table).where({ name: oldName }).update({ name: newName });
}

export default { execute };
