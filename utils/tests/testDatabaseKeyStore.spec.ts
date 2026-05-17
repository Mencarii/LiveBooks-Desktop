import crypto from 'crypto';
import test from 'tape';
import config from 'utils/config';
import {
  adoptLocalKeyForCloudAccount,
  getAccountKeyForDbPath,
  getDatabaseKeyOnly,
  getLocalNamespaceForDbPath,
  persistBookAccountKeyMapping,
  resolveAccountKeyForDbPath,
} from 'utils/databaseKeyStore';

const TEST_HEX = 'b'.repeat(64);

test('getDatabaseKeyOnly uses LIVEBOOKS_TEST_DB_KEY when allowed', (t) => {
  const prev = process.env.LIVEBOOKS_TEST_DB_KEY;
  process.env.LIVEBOOKS_TEST_DB_KEY = TEST_HEX;
  try {
    const key = getDatabaseKeyOnly('user_test_1', { allowTestEnvKey: true });
    t.equal(key, TEST_HEX);
  } finally {
    if (prev === undefined) {
      delete process.env.LIVEBOOKS_TEST_DB_KEY;
    } else {
      process.env.LIVEBOOKS_TEST_DB_KEY = prev;
    }
  }
  t.end();
});

test('getDatabaseKeyOnly ignores test env without allowTestEnvKey', (t) => {
  const prev = process.env.LIVEBOOKS_TEST_DB_KEY;
  process.env.LIVEBOOKS_TEST_DB_KEY = TEST_HEX;
  try {
    const key = getDatabaseKeyOnly('user_test_2');
    // Without safeStorage in tape/Node, expect null — never the test key.
    t.equal(key, null);
  } finally {
    if (prev === undefined) {
      delete process.env.LIVEBOOKS_TEST_DB_KEY;
    } else {
      process.env.LIVEBOOKS_TEST_DB_KEY = prev;
    }
  }
  t.end();
});

test('adoptLocalKeyForCloudAccount rejects non-local namespace ids', (t) => {
  t.notOk(adoptLocalKeyForCloudAccount('cloud-user-1', 'cloud-user-2'));
  t.notOk(adoptLocalKeyForCloudAccount('cloud-user-1', 'local_default'));
  t.end();
});

test('resolveAccountKeyForDbPath returns local mapping when present', (t) => {
  const dbPath = `/tmp/day1-test-${Date.now()}.books`;
  const localId = `local_${crypto.randomUUID()}`;
  const prev = config.get('localBookKeyNamespaces');
  const entries = Array.isArray(prev) ? [...prev] : [];
  entries.push({
    dbPath,
    localNamespaceId: localId,
    createdAt: new Date().toISOString(),
  });
  config.set('localBookKeyNamespaces', entries);
  config.set(
    `dbEncryptionKey_${localId}_encrypted`,
    'fake-ciphertext-for-resolve-test'
  );
  try {
    t.equal(getLocalNamespaceForDbPath(dbPath), localId);
    t.equal(getAccountKeyForDbPath(dbPath), localId);
    t.equal(resolveAccountKeyForDbPath(dbPath), localId);
    t.equal(resolveAccountKeyForDbPath(dbPath, 'other-cloud-user'), localId);
  } finally {
    config.set(
      'localBookKeyNamespaces',
      entries.filter((e: { dbPath: string }) => e.dbPath !== dbPath)
    );
    config.delete(`dbEncryptionKey_${localId}_encrypted`);
  }
  t.end();
});

test('resolveAccountKeyForDbPath finds cloud account after disconnect (no JWT)', (t) => {
  const dbPath = `/tmp/day1-cloud-map-${Date.now()}.books`;
  const cloudUserId = `user_${Date.now()}`;
  const prev = config.get('localBookKeyNamespaces');
  const entries = Array.isArray(prev) ? [...prev] : [];
  try {
    persistBookAccountKeyMapping(dbPath, cloudUserId);
    const slot = `dbEncryptionKey_${cloudUserId}_encrypted`;
    config.set(slot, 'fake-ciphertext-for-resolve-test');
    t.equal(getAccountKeyForDbPath(dbPath), cloudUserId);
    t.equal(resolveAccountKeyForDbPath(dbPath), cloudUserId);
    t.equal(
      resolveAccountKeyForDbPath(dbPath, 'other-cloud-user'),
      cloudUserId
    );
  } finally {
    config.set(
      'localBookKeyNamespaces',
      entries.filter((e: { dbPath: string }) => e.dbPath !== dbPath)
    );
    config.delete(`dbEncryptionKey_${cloudUserId}_encrypted`);
  }
  t.end();
});
