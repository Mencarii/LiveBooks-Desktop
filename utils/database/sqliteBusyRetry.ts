const SQLITE_BUSY_PATTERN = /SQLITE_BUSY|database is locked/i;

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_MS = 50;

export function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: unknown }).code;
  if (code === 'SQLITE_BUSY') {
    return true;
  }
  return SQLITE_BUSY_PATTERN.test(error.message);
}

export async function withSqliteBusyRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isSqliteBusyError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
