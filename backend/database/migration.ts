import BetterSQLite3 from 'better-sqlite3';
import fs from 'fs-extra';
import {
  applyTargetCipherProfile,
  assertValidHexDatabaseKey,
  DatabaseCipherProbe,
  probeDatabaseCipherMode,
  sqliteSingleQuotedPragmaValue,
  upgradeUnlockedDatabaseToTargetProfile,
} from './cipherProfile';

export function isNotADatabaseError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const message = err.message.toLowerCase();
  return (
    message.includes('file is not a database') ||
    message.includes('file is encrypted') ||
    message.includes('sqliteerror: file is not a database')
  );
}

export function probeAsPlaintext(dbPath: string): boolean {
  try {
    const db = new BetterSQLite3(dbPath, { readonly: true });
    try {
      db.pragma('user_version');
      db.close();
      return true;
    } catch {
      db.close();
      return false;
    }
  } catch {
    return false;
  }
}

export async function migratePlaintextToEncrypted(
  dbPath: string,
  encryptionKey: string
): Promise<void> {
  assertValidHexDatabaseKey(encryptionKey);
  const backupPath = `${dbPath}.bak`;

  await fs.copyFile(dbPath, backupPath);

  try {
    const db = new BetterSQLite3(dbPath);
    try {
      const escaped = sqliteSingleQuotedPragmaValue(encryptionKey);
      db.pragma("cipher = 'sqlcipher'");
      db.pragma('legacy = 4');
      db.pragma(`hexrekey = '${escaped}'`);
    } finally {
      db.close();
    }

    await fs.unlink(backupPath);
  } catch (error) {
    // eslint-disable-next-line no-console -- migration rollback must log to stderr
    console.error(
      'Encryption migration failed! Rolling back to backup.',
      error
    );

    if (await fs.pathExists(dbPath)) {
      await fs.unlink(dbPath);
    }
    await fs.rename(backupPath, dbPath);

    throw error;
  }
}

export async function migrateEncryptedCipherProfile(
  dbPath: string,
  from: Exclude<DatabaseCipherProbe, 'target'>,
  hexKey: string
): Promise<void> {
  assertValidHexDatabaseKey(hexKey);
  const backupPath = `${dbPath}.bak`;

  await fs.copyFile(dbPath, backupPath);

  try {
    const db = new BetterSQLite3(dbPath);
    try {
      upgradeUnlockedDatabaseToTargetProfile(db, from, hexKey);
    } finally {
      db.close();
    }

    const verified = probeDatabaseCipherMode(dbPath, hexKey);
    if (verified !== 'target') {
      throw new Error('Cipher profile migration did not produce target format');
    }

    await fs.unlink(backupPath);
  } catch (error) {
    // eslint-disable-next-line no-console -- migration rollback must log to stderr
    console.error(
      'Cipher profile migration failed! Rolling back to backup.',
      error
    );

    if (await fs.pathExists(dbPath)) {
      await fs.unlink(dbPath);
    }
    await fs.rename(backupPath, dbPath);

    throw error;
  }
}

/**
 * Ensure the file on disk uses the canonical cipher profile, upgrading legacy
 * formats when needed. Returns false if the key does not match any known profile.
 */
export async function ensureTargetCipherProfile(
  dbPath: string,
  hexKey: string
): Promise<boolean> {
  if (dbPath === ':memory:') {
    return true;
  }

  // Fresh DB_CREATE path: file was removed before connect; cipher is applied on open.
  if (!(await fs.pathExists(dbPath))) {
    return true;
  }

  const mode = probeDatabaseCipherMode(dbPath, hexKey);
  if (mode === null) {
    return false;
  }

  if (mode !== 'target') {
    await migrateEncryptedCipherProfile(dbPath, mode, hexKey);
  }

  return true;
}

export function rekeyDatabase(
  dbPath: string,
  oldKey: string,
  newKey: string
): void {
  assertValidHexDatabaseKey(oldKey);
  assertValidHexDatabaseKey(newKey);

  const db = new BetterSQLite3(dbPath);

  try {
    applyTargetCipherProfile(db, oldKey);
    db.pragma('user_version');
    const escaped = sqliteSingleQuotedPragmaValue(newKey);
    db.pragma(`hexrekey = '${escaped}'`);
  } finally {
    db.close();
  }
}
