import { Fyo, t } from 'fyo';

type Conn = {
  countryCode: string;
  error?: Error;
  actionSymbol?: typeof dbErrorActionSymbols[keyof typeof dbErrorActionSymbols];
};

export const dbErrorActionSymbols = {
  SelectFile: Symbol('select-file'),
  CancelSelection: Symbol('cancel-selection'),
  RecoveryRequired: Symbol('recovery-required'),
} as const;

const dbErrors = {
  DirectoryDoesNotExist: 'directory does not exist',
  UnableToAcquireConnection: 'Unable to acquire a connection',
} as const;

const KEYCHAIN_ERROR_CODES = new Set([
  'KEYCHAIN_CORRUPTED',
  'KEYCHAIN_UNAVAILABLE',
]);

function getErrorCode(error: Error): string | undefined {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function isKeychainRecoveryError(error: Error): boolean {
  const code = getErrorCode(error);
  if (code && KEYCHAIN_ERROR_CODES.has(code)) {
    return true;
  }
  return error.message?.includes('KEYCHAIN_CORRUPTED') ?? false;
}

export async function connectToDatabase(
  fyo: Fyo,
  dbPath: string,
  countryCode?: string
): Promise<Conn> {
  try {
    return { countryCode: await fyo.db.connectToDatabase(dbPath, countryCode) };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    return {
      countryCode: '',
      error,
      actionSymbol: await handleDatabaseConnectionError(error, dbPath),
    };
  }
}

export async function handleDatabaseConnectionError(
  error: Error,
  dbPath: string
) {
  // Day-1 Phase 0.1 / 0.3: keychain failures must route to /recovery.
  // We MUST NOT silently re-key the encrypted .db (the legacy
  // `getOrCreateDatabaseKey` bug); that is what bricks customer data.
  if (isKeychainRecoveryError(error)) {
    try {
      sessionStorage.setItem('recoveryDbPath', dbPath);
    } catch {
      // sessionStorage may be unavailable in some test harnesses; the
      // recovery page falls back to fyo.config.lastSelectedFilePath.
    }
    return dbErrorActionSymbols.RecoveryRequired;
  }

  const message = error.message;
  if (typeof message !== 'string') {
    throw error;
  }

  if (message.includes(dbErrors.DirectoryDoesNotExist)) {
    return await handleDirectoryDoesNotExist(dbPath);
  }

  if (message.includes(dbErrors.UnableToAcquireConnection)) {
    return await handleUnableToAcquireConnection(dbPath);
  }

  throw error;
}

async function handleUnableToAcquireConnection(dbPath: string) {
  return await showDbErrorDialog(
    t`Could not connect to database file ${dbPath}, please select the file manually`
  );
}

async function handleDirectoryDoesNotExist(dbPath: string) {
  return await showDbErrorDialog(
    t`Directory for database file ${dbPath} does not exist, please select the file manually`
  );
}

async function showDbErrorDialog(detail: string) {
  const { showDialog } = await import('src/utils/interactive');
  return showDialog({
    type: 'error',
    title: t`Cannot Open File`,
    detail,
    buttons: [
      {
        label: t`Select File`,
        action() {
          return dbErrorActionSymbols.SelectFile;
        },
        isPrimary: true,
      },
      {
        label: t`Cancel`,
        action() {
          return dbErrorActionSymbols.CancelSelection;
        },
        isEscape: true,
      },
    ],
  });
}
