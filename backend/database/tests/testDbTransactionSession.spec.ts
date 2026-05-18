import DatabaseCore from 'backend/database/core';
import { DbTransactionSession } from 'backend/database/dbTransactionSession';
import test from 'tape';

test('DbTransactionSession commits batched writes', async (t) => {
  const db = new DatabaseCore(':memory:');
  db.connect();
  await db.knex!.schema.createTable('txn_test', (table) => {
    table.string('name').primary();
    table.integer('value');
  });

  const session = new DbTransactionSession();
  session.begin(db);
  await db.knex!('txn_test').insert({ name: 'a', value: 1 });
  await session.commit();

  const rows = (await db.knex!('txn_test')) as { name: string }[];
  t.equal(rows.length, 1);
  await db.close();
  t.end();
});

test('DbTransactionSession rolls back on rollback()', async (t) => {
  const db = new DatabaseCore(':memory:');
  db.connect();
  await db.knex!.schema.createTable('txn_test2', (table) => {
    table.string('name').primary();
  });

  const session = new DbTransactionSession();
  session.begin(db);
  await db.knex!('txn_test2').insert({ name: 'gone' });
  await session.rollback();

  const rows = (await db.knex!('txn_test2')) as { name: string }[];
  t.equal(rows.length, 0);
  await db.close();
  t.end();
});
