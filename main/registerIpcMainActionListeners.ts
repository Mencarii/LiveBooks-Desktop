import {
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions,
  app,
  dialog,
  ipcMain,
} from 'electron';
import fetch from 'node-fetch';
import { fetchWithCloudBackoff } from './cloudApiFetchWithBackoff';
import { autoUpdater } from 'electron-updater';
import { constants } from 'fs';
import fs from 'fs-extra';
import path from 'path';
import config from 'utils/config';
import { isRendererDenylistedCloudPath } from 'utils/cloudApiDenylist';
import {
  getSecureToken,
  hasSecureToken,
  setSecureToken,
} from 'utils/secureTokenStore';
import {
  adoptLocalKeyForCloudAccount,
  createDatabaseKeyForNewBook,
  createLocalNamespaceForNewBook,
  getDatabaseKeyOnly,
  getAccountKeyForDbPath,
  getLocalNamespaceForDbPath,
  persistBookAccountKeyMapping,
  persistCloudBookMappingBeforeSignOut,
  isDatabaseKeyAvailable,
  migrateLegacyGlobalKeyIfPresent,
  resolveAccountKeyForDbPath,
  setDatabaseKeyFromRecovery,
} from 'utils/databaseKeyStore';
import { wipeSecretBuffer } from 'utils/crypto/secretBuffer';
import { isHexDatabaseKey64 } from 'utils/crypto/assertHexDatabaseKey';
import { SelectFileOptions, SelectFileReturn } from 'utils/types';
import databaseManager from '../backend/database/manager';
import { emitMainProcessError } from '../backend/helpers';
import { runDatabaseBootProbe } from '../backend/database/bootProbe';
import type { BootProbeCodeWithDev } from '../backend/database/bootProbeTypes';
import { verifyDatabaseOpensWithHexKey } from '../backend/database/cipherProfile';
import { migratePlaintextToEncrypted } from '../backend/database/migration';
import { Main } from '../main';
import { DatabaseMethod } from '../utils/db/types';
import {
  broadcastLivebooksCloudSession,
  clearLivebooksCloudSessionFromStore,
  getLivebooksCloudOriginMain,
  getLivebooksCloudUserIdMain,
  isLivebooksCloudSignedIn,
} from './livebooksCloudBridge';
import { IPC_ACTIONS } from '../utils/messages';
import { getUrlAndTokenString, sendError } from './contactMothership';
import { getLanguageMap } from './getLanguageMap';
import { getTemplates } from './getPrintTemplates';
import { printHtmlDocument } from './printHtmlDocument';
import {
  getConfigFilesWithModified,
  getErrorHandledReponse,
  isNetworkError,
  setAndGetCleanedConfigFiles,
} from './helpers';
import { saveHtmlAsPdf } from './saveHtmlAsPdf';
import { initLoyaltyExpiryJob } from './initSheduler';

type LivebooksCloudApiResult = {
  ok: boolean;
  status: number;
  data: unknown;
  etag?: string;
  subscriptionChangedAt?: string;
};

/**
 * Resolve the +accountKey+ owning the SQLCipher key for +dbPath+ on
 * +DB_CONNECT+ (resolution order: cloud user id, then local namespace map).
 */
function resolveAccountKeyForConnect(dbPath: string): string | null {
  const cloudUserId = getLivebooksCloudUserIdMain();
  if (cloudUserId) {
    migrateLegacyGlobalKeyIfPresent(cloudUserId);
  }
  const resolved = resolveAccountKeyForDbPath(dbPath, cloudUserId ?? undefined);
  if (resolved) {
    if (cloudUserId && resolved.startsWith('local_')) {
      // Sign-in happened after the offline book was created; lift the
      // local key into the cloud namespace exactly once.
      adoptLocalKeyForCloudAccount(cloudUserId, resolved);
      return cloudUserId;
    }
    return resolved;
  }
  return cloudUserId ?? null;
}

function buildKeychainCorruptedError(): Error {
  const error = new Error(
    'Database encryption key mismatch. Recovery mode required.'
  );
  (error as Error & { code: string }).code = 'KEYCHAIN_CORRUPTED';
  return error;
}

function buildKeychainUnavailableError(): Error {
  const error = new Error(
    'OS keychain is unavailable; cannot read or write database keys.'
  );
  (error as Error & { code: string }).code = 'KEYCHAIN_UNAVAILABLE';
  return error;
}

function buildBootProbeError(code: BootProbeCodeWithDev): Error {
  if (code === 'KEYCHAIN_UNAVAILABLE') {
    return buildKeychainUnavailableError();
  }
  if (code === 'KEYCHAIN_CORRUPTED') {
    return buildKeychainCorruptedError();
  }
  const error = new Error(`Database boot probe failed: ${code}`);
  (error as Error & { code: string }).code = code;
  return error;
}

type LivebooksCloudTokenPair = { access_token: string; refresh_token: string };

let livebooksCloudRefreshInFlight: Promise<LivebooksCloudTokenPair | null> | null =
  null;

async function readJsonBody(
  res: import('node-fetch').Response
): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function refreshLivebooksCloudTokens(
  origin: string
): Promise<LivebooksCloudTokenPair | null> {
  if (livebooksCloudRefreshInFlight) {
    return await livebooksCloudRefreshInFlight;
  }

  livebooksCloudRefreshInFlight = (async () => {
    const refresh = getSecureToken('livebooksCloudRefreshToken');
    if (typeof refresh !== 'string' || refresh.length === 0) {
      return null;
    }

    try {
      const res = await fetch(`${origin}/api/v1/sessions/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refresh }),
      } as import('node-fetch').RequestInit);

      const data = await readJsonBody(res);
      if (!res.ok || !data || typeof data !== 'object') {
        return null;
      }

      const at = (data as { access_token?: unknown }).access_token;
      const rt = (data as { refresh_token?: unknown }).refresh_token;
      if (
        typeof at === 'string' &&
        at.length > 0 &&
        typeof rt === 'string' &&
        rt.length > 0
      ) {
        setSecureToken('livebooksCloudAccessToken', at);
        setSecureToken('livebooksCloudRefreshToken', rt);
        return { access_token: at, refresh_token: rt };
      }
      return null;
    } catch {
      return null;
    } finally {
      livebooksCloudRefreshInFlight = null;
    }
  })();

  return await livebooksCloudRefreshInFlight;
}

export default function registerIpcMainActionListeners(main: Main) {
  ipcMain.handle(IPC_ACTIONS.CHECK_DB_ACCESS, async (_, filePath: string) => {
    try {
      await fs.access(filePath, constants.W_OK | constants.R_OK);
    } catch (err) {
      return false;
    }

    return true;
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_DB_DEFAULT_PATH,
    async (_, companyName: string) => {
      let root: string;
      try {
        root = app.getPath('documents');
      } catch {
        root = app.getPath('userData');
      }

      if (main.isDevelopment) {
        root = 'dbs';
      }

      const dbsPath = path.join(root, 'Frappe Books');
      const backupPath = path.join(dbsPath, 'livebooks_backups');
      await fs.ensureDir(backupPath);

      let dbFilePath = path.join(dbsPath, `${companyName}.books.db`);

      if (await fs.pathExists(dbFilePath)) {
        const option = await dialog.showMessageBox({
          type: 'question',
          title: 'File Exists',
          message: `Filename already exists. Do you want to overwrite the existing file or create a new one?`,
          buttons: ['Overwrite', 'New'],
        });

        if (option.response === 1) {
          const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '');

          dbFilePath = path.join(
            dbsPath,
            `${companyName}_${timestamp}.books.db`
          );

          await dialog.showMessageBox({
            type: 'info',
            message: `New file: ${path.basename(dbFilePath)}`,
          });
        }
      }

      return dbFilePath;
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_OPEN_FILEPATH,
    async (_, options: OpenDialogOptions) => {
      return await dialog.showOpenDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_SAVE_FILEPATH,
    async (_, options: SaveDialogOptions) => {
      return await dialog.showSaveDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_DIALOG_RESPONSE,
    async (_, options: MessageBoxOptions) => {
      if (main.isDevelopment || main.isLinux) {
        Object.assign(options, { icon: main.icon });
      }

      return await dialog.showMessageBox(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SHOW_ERROR,
    (_, { title, content }: { title: string; content: string }) => {
      return dialog.showErrorBox(title, content);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SAVE_HTML_AS_PDF,
    async (
      _,
      html: string,
      savePath: string,
      width: number,
      height: number
    ) => {
      return await saveHtmlAsPdf(html, savePath, app, width, height);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.PRINT_HTML_DOCUMENT,
    async (_, html: string, width: number, height: number) => {
      return await printHtmlDocument(html, app, width, height);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SAVE_DATA,
    async (_, data: string, savePath: string) => {
      return await fs.writeFile(savePath, data, { encoding: 'utf-8' });
    }
  );

  ipcMain.handle(IPC_ACTIONS.SEND_ERROR, async (_, bodyJson: string) => {
    await sendError(bodyJson, main);
  });

  ipcMain.handle(IPC_ACTIONS.CHECK_FOR_UPDATES, async () => {
    if (main.isDevelopment || main.checkedForUpdate || !main.updaterEnabled) {
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      if (isNetworkError(error as Error)) {
        return;
      }

      emitMainProcessError(error);
    }
    main.checkedForUpdate = true;
  });

  ipcMain.handle(IPC_ACTIONS.GET_LANGUAGE_MAP, async (_, code: string) => {
    const obj = { languageMap: {}, success: true, message: '' };
    try {
      obj.languageMap = await getLanguageMap(code);
    } catch (err) {
      obj.success = false;
      obj.message = (err as Error).message;
    }

    return obj;
  });

  ipcMain.handle(
    IPC_ACTIONS.SELECT_FILE,
    async (_, options: SelectFileOptions): Promise<SelectFileReturn> => {
      const response: SelectFileReturn = {
        name: '',
        filePath: '',
        success: false,
        data: Buffer.from('', 'utf-8'),
        canceled: false,
      };
      const { filePaths, canceled } = await dialog.showOpenDialog(
        main.mainWindow!,
        { ...options, properties: ['openFile'] }
      );

      response.filePath = filePaths?.[0];
      response.canceled = canceled;

      if (!response.filePath) {
        return response;
      }

      response.success = true;
      if (canceled) {
        return response;
      }

      response.name = path.basename(response.filePath);
      response.data = await fs.readFile(response.filePath);
      return response;
    }
  );

  ipcMain.handle(IPC_ACTIONS.GET_CREDS, () => {
    return getUrlAndTokenString();
  });

  ipcMain.handle(IPC_ACTIONS.DELETE_FILE, async (_, filePath: string) => {
    return getErrorHandledReponse(async () => await fs.unlink(filePath));
  });

  ipcMain.handle(IPC_ACTIONS.GET_DB_LIST, async () => {
    const files = await setAndGetCleanedConfigFiles();
    return await getConfigFilesWithModified(files);
  });

  ipcMain.handle(IPC_ACTIONS.GET_ENV, async () => {
    let version = app.getVersion();
    if (main.isDevelopment) {
      const packageJson = await fs.readFile('package.json', 'utf-8');
      version = (JSON.parse(packageJson) as { version: string }).version;
    }

    return {
      isDevelopment: main.isDevelopment,
      appEnv: main.appEnv,
      platform: process.platform,
      version,
      telemetryEnabled: main.telemetryEnabled,
      updaterEnabled: main.updaterEnabled,
    };
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_TEMPLATES,
    async (_, posPrintWidth?: number) => {
      return getTemplates(posPrintWidth);
    }
  );

  ipcMain.handle(IPC_ACTIONS.INIT_LOYALTY_SCHEDULER, async () => {
    return initLoyaltyExpiryJob();
  });

  ipcMain.handle(IPC_ACTIONS.GET_LIVEBOOKS_CLOUD_SESSION, () => {
    return { signedIn: isLivebooksCloudSignedIn() };
  });

  ipcMain.handle(IPC_ACTIONS.CLEAR_LIVEBOOKS_CLOUD_SESSION, async () => {
    const cloudUserId = getLivebooksCloudUserIdMain();
    const lastDbPath = config.get('lastSelectedFilePath');
    if (cloudUserId) {
      persistCloudBookMappingBeforeSignOut(cloudUserId, lastDbPath);
    }
    const origin = getLivebooksCloudOriginMain();
    const refresh = getSecureToken('livebooksCloudRefreshToken');
    if (typeof refresh === 'string' && refresh.length > 0) {
      try {
        await fetch(`${origin}/api/v1/sessions`, {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {
        /* still clear local session */
      }
    }
    clearLivebooksCloudSessionFromStore();
    broadcastLivebooksCloudSession(main, false);
  });

  ipcMain.handle(
    IPC_ACTIONS.LIVEBOOKS_CLOUD_API,
    async (
      _,
      payload: {
        method: string;
        path: string;
        body?: unknown;
        skipAuth?: boolean;
        headers?: Record<string, string>;
      }
    ) => {
      const { method, path, body, skipAuth, headers: extraHeaders } = payload;
      if (!path.startsWith('/api/')) {
        return {
          ok: false,
          status: 0,
          data: { error: 'invalid_path' as const },
        } as LivebooksCloudApiResult;
      }
      // Escrow / MFA / recovery paths are main-process
      // only. The renderer must never carry raw SQLCipher keys, TOTP
      // codes, or recovery grants over the IPC boundary.
      if (isRendererDenylistedCloudPath(path)) {
        return {
          ok: false,
          status: 403,
          data: {
            error: 'forbidden_in_renderer' as const,
            message:
              'This endpoint is only callable from the main process. ' +
              'Use the dedicated IPC channel (e.g. RECOVERY_SUBMIT_AND_REKEY).',
          },
        } as LivebooksCloudApiResult;
      }

      try {
        const origin = getLivebooksCloudOriginMain();

        const makeHeaders = (accessToken?: string): Record<string, string> => {
          const headers: Record<string, string> = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          };
          if (
            !skipAuth &&
            typeof accessToken === 'string' &&
            accessToken.length > 0
          ) {
            headers.Authorization = `Bearer ${accessToken}`;
          }
          if (extraHeaders) {
            for (const [k, v] of Object.entries(extraHeaders)) {
              if (v !== undefined && v !== '') {
                headers[k] = v;
              }
            }
          }
          return headers;
        };

        const makeInit = (headers: Record<string, string>): RequestInit => {
          const init: RequestInit = { method, headers };
          if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
            init.body = JSON.stringify(body);
          }
          return init;
        };

        const access0 = skipAuth
          ? undefined
          : getSecureToken('livebooksCloudAccessToken');
        const accessToken0 = typeof access0 === 'string' ? access0 : undefined;
        const { response: res0 } = await fetchWithCloudBackoff(
          `${origin}${path}`,
          makeInit(
            makeHeaders(accessToken0)
          ) as import('node-fetch').RequestInit
        );
        const data0 = await readJsonBody(res0);
        const etag0 = res0.headers.get('etag') ?? undefined;
        const subscriptionChangedAt0 =
          res0.headers.get('x-subscription-changed-at') ?? undefined;

        // Access JWTs are intentionally short-lived on the server; auto-refresh + retry once on 401.
        const eligibleForRefresh =
          !skipAuth &&
          res0.status === 401 &&
          !path.startsWith('/api/v1/sessions/') &&
          hasSecureToken('livebooksCloudRefreshToken');

        if (!eligibleForRefresh) {
          return {
            ok: res0.ok,
            status: res0.status,
            data: data0,
            etag: etag0,
            subscriptionChangedAt: subscriptionChangedAt0,
          };
        }

        const refreshed = await refreshLivebooksCloudTokens(origin);
        if (!refreshed) {
          const staleCloudUserId = getLivebooksCloudUserIdMain();
          const lastDbPath = config.get('lastSelectedFilePath');
          if (staleCloudUserId) {
            persistCloudBookMappingBeforeSignOut(staleCloudUserId, lastDbPath);
          }
          clearLivebooksCloudSessionFromStore();
          broadcastLivebooksCloudSession(main, false);
          return {
            ok: res0.ok,
            status: res0.status,
            data: data0,
            etag: etag0,
            subscriptionChangedAt: subscriptionChangedAt0,
          };
        }

        broadcastLivebooksCloudSession(main, true);
        const { response: res1 } = await fetchWithCloudBackoff(
          `${origin}${path}`,
          makeInit(
            makeHeaders(refreshed.access_token)
          ) as import('node-fetch').RequestInit
        );
        const data1 = await readJsonBody(res1);
        const etag1 = res1.headers.get('etag') ?? undefined;
        const subscriptionChangedAt1 =
          res1.headers.get('x-subscription-changed-at') ??
          subscriptionChangedAt0;
        return {
          ok: res1.ok,
          status: res1.status,
          data: data1,
          etag: etag1,
          subscriptionChangedAt: subscriptionChangedAt1,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          status: 0,
          data: {
            error: 'network_error' as const,
            message,
          },
        } as LivebooksCloudApiResult;
      }
    }
  );

  /**
   * Database Related Actions
   */

  ipcMain.handle(
    IPC_ACTIONS.DB_CREATE,
    async (_, dbPath: string, countryCode: string) => {
      return await getErrorHandledReponse(async () => {
        if (!isDatabaseKeyAvailable()) {
          throw buildKeychainUnavailableError();
        }

        // DB_CREATE is the ONLY legitimate path that
        // mints a fresh random key. We branch on cloud session:
        //   * Signed-in: store under +cloudUserId+ (sub of the access JWT).
        //   * Signed-out: allocate a fresh +local_{uuid}+ namespace per
        //     dbPath so two unsigned-in users can't clobber each other.
        const cloudUserId = getLivebooksCloudUserIdMain();
        let encryptionKey: string | null = null;
        if (cloudUserId) {
          migrateLegacyGlobalKeyIfPresent(cloudUserId);
          encryptionKey =
            getDatabaseKeyOnly(cloudUserId) ??
            createDatabaseKeyForNewBook(cloudUserId);
        } else {
          const allocated = createLocalNamespaceForNewBook(dbPath);
          encryptionKey = allocated?.hexKey ?? null;
        }

        if (!encryptionKey) {
          throw buildKeychainUnavailableError();
        }

        const created = await databaseManager.createNewDatabase(
          dbPath,
          countryCode,
          encryptionKey
        );
        if (cloudUserId) {
          persistBookAccountKeyMapping(dbPath, cloudUserId);
        }
        return created;
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_BOOT_PROBE,
    async (_, dbPath: string, countryCode?: string) => {
      return await getErrorHandledReponse(async () => {
        const probe = await runDatabaseBootProbe(dbPath, {
          countryCode,
          cloudUserId: getLivebooksCloudUserIdMain(),
          allowTestEnvKey: main.isTest,
        });

        if (probe.code === 'PLAINTEXT_DEV_MIGRATE') {
          const accountKey = resolveAccountKeyForConnect(dbPath);
          const encryptionKey = accountKey
            ? getDatabaseKeyOnly(accountKey, { allowTestEnvKey: main.isTest })
            : null;
          if (encryptionKey && !app.isPackaged) {
            await migratePlaintextToEncrypted(dbPath, encryptionKey);
            const cc = await databaseManager.connectToDatabase(
              dbPath,
              countryCode,
              encryptionKey
            );
            return { code: 'OK' as const, countryCode: cc };
          }
          throw buildKeychainCorruptedError();
        }

        if (probe.code !== 'OK') {
          throw buildBootProbeError(probe.code);
        }

        return { code: probe.code, countryCode: probe.countryCode };
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CONNECT,
    async (_, dbPath: string, countryCode?: string) => {
      return await getErrorHandledReponse(async () => {
        // linear boot probe (no probeAsPlaintext in
        // production; plaintext migration is dev-only inside bootProbe).
        const probe = await runDatabaseBootProbe(dbPath, {
          countryCode,
          cloudUserId: getLivebooksCloudUserIdMain(),
          allowTestEnvKey: main.isTest,
        });

        if (probe.code === 'PLAINTEXT_DEV_MIGRATE') {
          const accountKey = resolveAccountKeyForConnect(dbPath);
          const encryptionKey = accountKey
            ? getDatabaseKeyOnly(accountKey, { allowTestEnvKey: main.isTest })
            : null;
          if (!encryptionKey) {
            throw buildKeychainCorruptedError();
          }
          await migratePlaintextToEncrypted(dbPath, encryptionKey);
          return await databaseManager.connectToDatabase(
            dbPath,
            countryCode,
            encryptionKey
          );
        }

        if (probe.code === 'OK') {
          return probe.countryCode ?? countryCode ?? '';
        }

        throw buildBootProbeError(probe.code);
      });
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_ENCRYPTION_STATUS, (_, dbPath?: string) => {
    const cloudUserId = getLivebooksCloudUserIdMain();
    let hasKey = false;
    if (cloudUserId) {
      hasKey = getDatabaseKeyOnly(cloudUserId) !== null;
    } else if (typeof dbPath === 'string' && dbPath.length > 0) {
      const accountKey = getAccountKeyForDbPath(dbPath);
      hasKey = accountKey !== null && getDatabaseKeyOnly(accountKey) !== null;
    }
    return {
      available: isDatabaseKeyAvailable(),
      hasKey,
    };
  });

  ipcMain.handle(
    IPC_ACTIONS.DB_CALL,
    async (_, method: DatabaseMethod, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.call(method, ...args);
      });
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_BEGIN_TRANSACTION, async () => {
    return await getErrorHandledReponse(() => {
      databaseManager.beginTransaction();
    });
  });

  ipcMain.handle(IPC_ACTIONS.DB_END_TRANSACTION, async (_, commit = true) => {
    return await getErrorHandledReponse(async () => {
      await databaseManager.endTransaction(commit !== false);
    });
  });

  ipcMain.handle(
    IPC_ACTIONS.DB_BESPOKE,
    async (_, method: string, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.callBespoke(method, ...args);
      });
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_SCHEMA, async () => {
    return await getErrorHandledReponse(() => {
      return databaseManager.getSchemaMap();
    });
  });

  // ----------------------------------------------------------------------
  // cloud key escrow (main process + Bearer only)
  // ----------------------------------------------------------------------

  ipcMain.handle(
    IPC_ACTIONS.DESKTOP_KEY_ESCROW_STATUS,
    async (): Promise<{
      ok: boolean;
      escrowed?: boolean;
      mfa_enabled?: boolean;
      error?: string;
    }> => {
      if (!hasSecureToken('livebooksCloudAccessToken')) {
        return { ok: false, error: 'not_signed_in' };
      }
      let origin: string;
      try {
        origin = getLivebooksCloudOriginMain();
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      const access = getSecureToken('livebooksCloudAccessToken');
      if (!access) {
        return { ok: false, error: 'not_signed_in' };
      }
      try {
        const res = await fetch(`${origin}/api/v1/me/encrypted_desktop_key`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${access}`,
          },
        } as import('node-fetch').RequestInit);
        const data = await readJsonBody(res);
        if (!res.ok) {
          return { ok: false, error: `http_${res.status}` };
        }
        const row =
          data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : {};
        const escrowed = row.escrowed === true;
        const mfaEnabled = row.mfa_enabled === true;
        return { ok: true, escrowed, mfa_enabled: mfaEnabled };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DESKTOP_KEY_ESCROW_PUSH,
    async (
      _,
      dbPath: string,
      totpCode?: string
    ): Promise<{
      ok: boolean;
      escrowed_at?: string;
      error?: string;
      message?: string;
    }> => {
      if (!hasSecureToken('livebooksCloudAccessToken')) {
        return { ok: false, error: 'not_signed_in' };
      }
      if (!isDatabaseKeyAvailable()) {
        return {
          ok: false,
          error: 'safe_storage_unavailable',
          message: 'OS keychain is unavailable.',
        };
      }

      const accountKey = resolveAccountKeyForConnect(dbPath);
      const hexKey = accountKey ? getDatabaseKeyOnly(accountKey) : null;
      if (!hexKey) {
        return {
          ok: false,
          error: 'no_local_key',
          message: 'No local encryption key is available for this database.',
        };
      }

      let origin: string;
      try {
        origin = getLivebooksCloudOriginMain();
      } catch (err) {
        return {
          ok: false,
          error: 'invalid_origin',
          message: (err as Error).message,
        };
      }

      const access = getSecureToken('livebooksCloudAccessToken');
      if (!access) {
        return { ok: false, error: 'not_signed_in' };
      }

      if (!dbPath || !fs.existsSync(dbPath)) {
        return {
          ok: false,
          error: 'db_not_found',
          message: 'Company database file was not found on disk.',
        };
      }

      if (!verifyDatabaseOpensWithHexKey(dbPath, hexKey)) {
        const probeErr = new Error(
          `Escrow push aborted: key from safeStorage does not open ${dbPath}`
        );
        emitMainProcessError(probeErr);
        return {
          ok: false,
          error: 'escrow_key_probe_failed',
          message:
            'Your local encryption key could not open this company file. ' +
            'Cloud backup was not updated. Restore from a local backup or contact support.',
        };
      }

      let res: import('node-fetch').Response;
      let data: unknown;
      try {
        res = await fetch(`${origin}/api/v1/me/encrypted_desktop_key`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access}`,
          },
          body: JSON.stringify({
            encryption_key: hexKey,
            ...(totpCode?.trim() ? { totp_code: totpCode.trim() } : {}),
          }),
        } as import('node-fetch').RequestInit);
        data = await readJsonBody(res);
      } catch (err) {
        return {
          ok: false,
          error: 'network_error',
          message: (err as Error).message,
        };
      }

      if (!res.ok) {
        const obj =
          data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : {};
        return {
          ok: false,
          error:
            typeof obj.error === 'string' ? obj.error : `http_${res.status}`,
          message:
            typeof obj.message === 'string'
              ? obj.message
              : `Escrow store failed (HTTP ${res.status}).`,
        };
      }

      const escrowedAt =
        data &&
        typeof data === 'object' &&
        typeof (data as { escrowed_at?: unknown }).escrowed_at === 'string'
          ? (data as { escrowed_at: string }).escrowed_at
          : new Date().toISOString();

      config.set('livebooksCloudKeyEscrowedAt', escrowedAt);
      return { ok: true, escrowed_at: escrowedAt };
    }
  );

  // ----------------------------------------------------------------------
  // RECOVERY_SUBMIT_AND_REKEY
  //
  // Renderer hands us credentials. We do the cloud round-trip, persist the
  // returned key into the OS keychain under the right namespaced slot,
  // wipe our in-memory copies, and reconnect the database to verify.
  //
  // Cloud path: +/api/v1/me/escrow_key_retrieval+ with mandatory +totpCode+.
  // ----------------------------------------------------------------------

  ipcMain.handle(
    IPC_ACTIONS.RECOVERY_SUBMIT_AND_REKEY,
    async (
      _,
      payload: {
        dbPath: string;
        countryCode?: string;
        email: string;
        password: string;
        totpCode?: string;
      }
    ): Promise<{
      ok: boolean;
      error?: string;
      message?: string;
      countryCode?: string;
    }> => {
      const { dbPath, countryCode, email, password, totpCode } = payload ?? {};
      if (!dbPath || !email || !password) {
        return {
          ok: false,
          error: 'invalid_request',
          message: 'dbPath, email, and password are required.',
        };
      }
      if (!isDatabaseKeyAvailable()) {
        return {
          ok: false,
          error: 'safe_storage_unavailable',
          message:
            'OS keychain is unavailable; cannot persist a recovered key.',
        };
      }

      let origin: string;
      try {
        origin = getLivebooksCloudOriginMain();
      } catch (err) {
        return {
          ok: false,
          error: 'invalid_origin',
          message: (err as Error).message,
        };
      }

      const totp = totpCode?.trim() ?? '';
      if (!totp) {
        return {
          ok: false,
          error: 'totp_required',
          message:
            'Enter the authenticator code from your LiveBooks Cloud account. Enable 2FA at your cloud account security page if you have not already.',
        };
      }

      const accessToken = getSecureToken('livebooksCloudAccessToken');
      const recoveryPath = '/api/v1/me/escrow_key_retrieval';
      const recoveryHeaders: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        recoveryHeaders.Authorization = `Bearer ${accessToken}`;
      }
      const recoveryBody: Record<string, string> = { totp_code: totp };
      if (!accessToken) {
        recoveryBody.email = email;
        recoveryBody.password = password;
      }

      let res: import('node-fetch').Response;
      let data: unknown = null;
      try {
        res = await fetch(`${origin}${recoveryPath}`, {
          method: 'POST',
          headers: recoveryHeaders,
          body: JSON.stringify(recoveryBody),
        } as import('node-fetch').RequestInit);
        data = await readJsonBody(res);
      } catch (err) {
        return {
          ok: false,
          error: 'network_error',
          message: (err as Error).message,
        };
      }

      if (!res.ok) {
        const obj =
          (data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : {}) ?? {};
        let errorCode =
          typeof obj.error === 'string' ? obj.error : `http_${res.status}`;
        if (res.status === 429) {
          errorCode = 'too_many_requests';
        }
        return {
          ok: false,
          error: errorCode,
          message:
            typeof obj.message === 'string'
              ? obj.message
              : `Recovery failed (HTTP ${res.status}).`,
        };
      }

      const obj =
        (data && typeof data === 'object'
          ? (data as Record<string, unknown>)
          : {}) ?? {};
      const recoveredKey =
        typeof obj.encryption_key === 'string' ? obj.encryption_key : null;
      const userIdFromCloud =
        typeof obj.user_id === 'string'
          ? obj.user_id
          : typeof obj.user_id === 'number'
          ? String(obj.user_id)
          : null;

      if (!recoveredKey || !isHexDatabaseKey64(recoveredKey)) {
        return {
          ok: false,
          error: 'recovery_payload_invalid',
          message:
            'Cloud returned an invalid encryption key. Please contact support.',
        };
      }

      // Persist the recovered key under the right namespaced slot. Prefer
      // the cloud user id from the payload; fall back to JWT +sub+ or the
      // local namespace mapping for the dbPath.
      const accountKey =
        userIdFromCloud ??
        getLivebooksCloudUserIdMain() ??
        getLocalNamespaceForDbPath(dbPath);

      if (!accountKey) {
        return {
          ok: false,
          error: 'no_account_key',
          message:
            'Could not determine which account this key belongs to. Sign in to LiveBooks Cloud and try again.',
        };
      }

      // Store via Buffer so we can wipe immediately. The String form is
      // unfortunately also held in +obj.encryption_key+; V8 may keep it
      // alive; V8 may retain the original string from IPC JSON.parse.
      const keyBuffer = Buffer.from(recoveredKey, 'utf8');
      let stored = false;
      try {
        stored = setDatabaseKeyFromRecovery(accountKey, keyBuffer);
      } finally {
        wipeSecretBuffer(keyBuffer);
      }

      if (!stored) {
        return {
          ok: false,
          error: 'keychain_write_failed',
          message: 'Could not persist the recovered key to the OS keychain.',
        };
      }

      // Verify by re-reading and reconnecting. If the key doesn't open
      // the encrypted .db (e.g. cloud holds a stale key) we surface
      // Surface +recovery_key_mismatch+ when the recovered key cannot open the db.
      const persistedKey = getDatabaseKeyOnly(accountKey);
      if (!persistedKey) {
        return {
          ok: false,
          error: 'keychain_read_failed',
          message: 'Stored a key but could not read it back.',
        };
      }

      try {
        const resolvedCountry = await databaseManager.connectToDatabase(
          dbPath,
          countryCode,
          persistedKey
        );

        const recoveryGrant =
          typeof obj.recovery_grant === 'string' ? obj.recovery_grant : null;
        const tokenForGrant =
          accessToken ?? getSecureToken('livebooksCloudAccessToken');
        if (recoveryGrant && tokenForGrant) {
          try {
            await fetch(`${origin}/api/v1/me/recovery_grants/consume`, {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenForGrant}`,
              },
              body: JSON.stringify({ recovery_grant: recoveryGrant }),
            } as import('node-fetch').RequestInit);
          } catch {
            // Non-fatal: desk is unlocked; grant consume is bookkeeping for sync.
          }
        }

        return { ok: true, countryCode: resolvedCountry };
      } catch (err) {
        return {
          ok: false,
          error: 'recovery_key_mismatch',
          message:
            (err as Error).message ??
            'Cloud-recovered key does not open this database. Restore from a backup.',
        };
      }
    }
  );
}
