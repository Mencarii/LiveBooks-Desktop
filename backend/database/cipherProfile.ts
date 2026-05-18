import BetterSQLite3 from 'better-sqlite3';

const HEX_KEY_REGEX = /^[0-9a-f]{64}$/i;

export function assertValidHexDatabaseKey(hexKey: string): void {
  if (!HEX_KEY_REGEX.test(hexKey)) {
    throw new Error(
      'Invalid database encryption key: expected 64 hexadecimal characters'
    );
  }
}

/** Escape a value embedded in a single-quoted SQLite PRAGMA string. */
export function sqliteSingleQuotedPragmaValue(value: string): string {
  return value.replace(/'/g, "''");
}

export type DatabaseCipherProbe =
  | 'target'
  | 'legacy_passphrase_key'
  | 'legacy_sqlcipher_passphrase'
  | 'legacy_sqleet_hexkey';

export interface SqlitePragmaDb {
  pragma: (statement: string) => unknown;
}

/**
 * Canonical LiveBooks on-disk profile: SQLCipher-compatible settings with a raw
 * 256-bit key (hexkey — no passphrase KDF on the 64-char hex string).
 */
export function applyTargetCipherProfile(
  db: SqlitePragmaDb,
  hexKey: string
): void {
  assertValidHexDatabaseKey(hexKey);
  const escaped = sqliteSingleQuotedPragmaValue(hexKey);
  db.pragma("cipher = 'sqlcipher'");
  db.pragma('legacy = 4');
  db.pragma(`hexkey = '${escaped}'`);
}

/** Earlier builds: default cipher (sqleet) with passphrase-style `key`. */
export function applyLegacyPassphraseKeyProfile(
  db: SqlitePragmaDb,
  hexKey: string
): void {
  assertValidHexDatabaseKey(hexKey);
  const escaped = sqliteSingleQuotedPragmaValue(hexKey);
  db.pragma(`key = '${escaped}'`);
}

export function applyLegacySqlCipherPassphraseProfile(
  db: SqlitePragmaDb,
  hexKey: string
): void {
  assertValidHexDatabaseKey(hexKey);
  const escaped = sqliteSingleQuotedPragmaValue(hexKey);
  db.pragma("cipher = 'sqlcipher'");
  db.pragma('legacy = 4');
  db.pragma(`key = '${escaped}'`);
}

export function applyLegacySqleetHexKeyProfile(
  db: SqlitePragmaDb,
  hexKey: string
): void {
  assertValidHexDatabaseKey(hexKey);
  const escaped = sqliteSingleQuotedPragmaValue(hexKey);
  db.pragma("cipher = 'sqleet'");
  db.pragma(`hexkey = '${escaped}'`);
}

const PROBE_ORDER: {
  mode: DatabaseCipherProbe;
  apply: (db: SqlitePragmaDb, hexKey: string) => void;
}[] = [
  { mode: 'target', apply: applyTargetCipherProfile },
  { mode: 'legacy_passphrase_key', apply: applyLegacyPassphraseKeyProfile },
  {
    mode: 'legacy_sqlcipher_passphrase',
    apply: applyLegacySqlCipherPassphraseProfile,
  },
  { mode: 'legacy_sqleet_hexkey', apply: applyLegacySqleetHexKeyProfile },
];

function probeWithProfile(
  dbPath: string,
  apply: (db: SqlitePragmaDb) => void
): boolean {
  if (dbPath === ':memory:') {
    return false;
  }

  let db: BetterSQLite3.Database | undefined;
  try {
    db = new BetterSQLite3(dbPath, { readonly: true });
    apply(db);
    db.pragma('user_version');
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

/**
 * Detect how an on-disk database is encrypted (or return null if the key does not match).
 */
export function probeDatabaseCipherMode(
  dbPath: string,
  hexKey: string
): DatabaseCipherProbe | null {
  assertValidHexDatabaseKey(hexKey);

  if (dbPath === ':memory:') {
    return 'target';
  }

  for (const { mode, apply } of PROBE_ORDER) {
    if (probeWithProfile(dbPath, (db) => apply(db, hexKey))) {
      return mode;
    }
  }

  return null;
}

/**
 * Verify that +hexKey+ opens +dbPath+ (any supported cipher profile) before
 * cloud escrow upload. Uses a short-lived readonly connection.
 */
export function verifyDatabaseOpensWithHexKey(
  dbPath: string,
  hexKey: string
): boolean {
  if (dbPath === ':memory:') {
    return true;
  }

  const mode = probeDatabaseCipherMode(dbPath, hexKey);
  if (!mode) {
    return false;
  }

  const profile = PROBE_ORDER.find((p) => p.mode === mode);
  if (!profile) {
    return false;
  }

  let db: BetterSQLite3.Database | undefined;
  try {
    db = new BetterSQLite3(dbPath, { readonly: true });
    profile.apply(db, hexKey);
    const row = db.prepare('SELECT count(*) AS c FROM sqlite_master').get() as {
      c: number;
    };
    return typeof row?.c === 'number';
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

/**
 * Verify a on-disk backup opens with the canonical target cipher profile.
 * Prefer this over {@link probeDatabaseCipherMode} for post-copy backups:
 * the file was produced from an already-unlocked target-profile database.
 */

export function verifyTargetCipherBackup(
  dbPath: string,
  hexKey: string
): boolean {
  if (dbPath === ':memory:') {
    return true;
  }

  assertValidHexDatabaseKey(hexKey);

  let db: BetterSQLite3.Database | undefined;
  try {
    db = new BetterSQLite3(dbPath, { readonly: true });
    applyTargetCipherProfile(db, hexKey);
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

const LEGACY_OPEN_PROFILES: Record<
  Exclude<DatabaseCipherProbe, 'target'>,
  (db: SqlitePragmaDb, hexKey: string) => void
> = {
  legacy_passphrase_key: applyLegacyPassphraseKeyProfile,
  legacy_sqlcipher_passphrase: applyLegacySqlCipherPassphraseProfile,
  legacy_sqleet_hexkey: applyLegacySqleetHexKeyProfile,
};

/**
 * Re-encrypt an already-unlocked database to the canonical target profile in place.
 * Caller must have verified `from` via {@link probeDatabaseCipherMode}.
 */
export function upgradeUnlockedDatabaseToTargetProfile(
  db: SqlitePragmaDb,
  from: Exclude<DatabaseCipherProbe, 'target'>,
  hexKey: string
): void {
  assertValidHexDatabaseKey(hexKey);
  LEGACY_OPEN_PROFILES[from](db, hexKey);
  db.pragma('user_version');
  db.pragma("cipher = 'sqlcipher'");
  db.pragma('legacy = 4');
  const escaped = sqliteSingleQuotedPragmaValue(hexKey);
  db.pragma(`hexrekey = '${escaped}'`);
}
