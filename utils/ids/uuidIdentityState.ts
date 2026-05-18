/**
 * schema migration version tracking.
 */

import { isUuidDocId } from 'utils/ids';
import type { Knex } from 'knex';

export const SCHEMA_MIGRATION_NONE = 'none';
export const SCHEMA_MIGRATION_COMPLETE = 'uuid_complete';
export const SCHEMA_MIGRATION_PARTIAL = 'uuid_partial';

const FIELD = 'schema_migration_version';

export async function getSchemaMigrationVersion(
  knex: Knex | undefined
): Promise<string> {
  if (!knex) {
    return SCHEMA_MIGRATION_NONE;
  }
  try {
    const row = (await knex('SingleValue')
      .where({ fieldname: FIELD })
      .first()) as { value?: string } | undefined;
    const value = row?.value;
    return typeof value === 'string' && value.length > 0
      ? value
      : SCHEMA_MIGRATION_NONE;
  } catch {
    return SCHEMA_MIGRATION_NONE;
  }
}

export async function setSchemaMigrationVersion(
  knex: Knex,
  version: string
): Promise<void> {
  const existing = (await knex('SingleValue')
    .where({ fieldname: FIELD })
    .first()) as Record<string, unknown> | undefined;
  if (existing) {
    await knex('SingleValue')
      .where({ fieldname: FIELD })
      .update({ value: version });
  } else {
    await knex('SingleValue').insert({
      fieldname: FIELD,
      value: version,
      parent: 'SystemSettings',
    });
  }
}

export async function isUuidIdentityComplete(
  knex: Knex | undefined
): Promise<boolean> {
  return (await getSchemaMigrationVersion(knex)) === SCHEMA_MIGRATION_COMPLETE;
}

/**
 * True when the ledger has no legacy string primary keys to migrate (new
 * DB_CREATE books, or empty / already-UUID data). Skips uuidIdentityMigration
 * backup + rewrite.
 */
export async function isGreenfieldUuidLedger(
  knex: Knex | undefined
): Promise<boolean> {
  if (!knex) {
    return true;
  }

  if (await isUuidIdentityComplete(knex)) {
    return true;
  }

  if (!(await knex.schema.hasTable('Account'))) {
    return true;
  }

  const accounts = (await knex('Account').select('name').limit(500)) as {
    name: string;
  }[];

  if (!accounts.length) {
    return true;
  }

  return accounts.every((row) => isUuidDocId(row.name));
}
