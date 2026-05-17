import BetterSQLite3 from 'better-sqlite3';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import test from 'tape';
import {
  applyLegacyPassphraseKeyProfile,
  applyTargetCipherProfile,
  probeDatabaseCipherMode,
  verifyTargetCipherBackup,
} from '../cipherProfile';
import {
  ensureTargetCipherProfile,
  migratePlaintextToEncrypted,
} from '../migration';

const TEST_KEY = 'a'.repeat(64);

async function tempDbPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'livebooks-cipher-'));
  return path.join(dir, 'test.db');
}

test('probe: target profile after plaintext migration', async (t) => {
  const dbPath = await tempDbPath();
  const db = new BetterSQLite3(dbPath);
  db.exec('CREATE TABLE probe_t (id INTEGER)');
  db.close();

  await migratePlaintextToEncrypted(dbPath, TEST_KEY);

  t.equal(probeDatabaseCipherMode(dbPath, TEST_KEY), 'target');
  t.ok(verifyTargetCipherBackup(dbPath, TEST_KEY));
  t.end();
});

test('probe and upgrade: legacy passphrase key profile', async (t) => {
  const dbPath = await tempDbPath();
  const db = new BetterSQLite3(dbPath);
  applyLegacyPassphraseKeyProfile(db, TEST_KEY);
  db.exec('CREATE TABLE probe_t (id INTEGER)');
  db.close();

  t.equal(
    probeDatabaseCipherMode(dbPath, TEST_KEY),
    'legacy_passphrase_key',
    'detects legacy key= format'
  );

  const ok = await ensureTargetCipherProfile(dbPath, TEST_KEY);
  t.equal(ok, true);
  t.equal(
    probeDatabaseCipherMode(dbPath, TEST_KEY),
    'target',
    'upgraded to target profile'
  );

  const opened = new BetterSQLite3(dbPath, { readonly: true });
  applyTargetCipherProfile(opened, TEST_KEY);
  const row = opened.prepare('SELECT COUNT(*) AS c FROM probe_t').get() as {
    c: number;
  };
  t.equal(row.c, 0);
  opened.close();

  t.end();
});

test('ensureTargetCipherProfile: missing file is ok (new database)', async (t) => {
  const dbPath = await tempDbPath();
  await fs.remove(dbPath);
  const ok = await ensureTargetCipherProfile(dbPath, TEST_KEY);
  t.equal(ok, true);
  t.end();
});

test('probe: wrong key returns null', async (t) => {
  const dbPath = await tempDbPath();
  const db = new BetterSQLite3(dbPath);
  applyLegacyPassphraseKeyProfile(db, TEST_KEY);
  db.exec('CREATE TABLE probe_t (id INTEGER)');
  db.close();

  const wrongKey = 'b'.repeat(64);
  t.equal(probeDatabaseCipherMode(dbPath, wrongKey), null);
  t.end();
});
