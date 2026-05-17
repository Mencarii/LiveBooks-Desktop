import type {
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron';
import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { ConfigMap } from 'fyo/core/types';
import config from 'utils/config';
import type { DatabaseMethod } from 'utils/db/types';
import type { BackendResponse } from 'utils/ipc/types';
import { IPC_ACTIONS, IPC_CHANNELS, IPC_MESSAGES } from 'utils/messages';
import type {
  ConfigFilesWithModified,
  Creds,
  LanguageMap,
  SelectFileOptions,
  SelectFileReturn,
  TemplateFile,
} from 'utils/types';

type IPCRendererListener = Parameters<typeof ipcRenderer.on>[1];
const ipc = {
  desktop: true,

  getZoomFactor() {
    return webFrame.getZoomFactor();
  },

  reloadWindow() {
    return ipcRenderer.send(IPC_MESSAGES.RELOAD_MAIN_WINDOW);
  },

  minimizeWindow() {
    return ipcRenderer.send(IPC_MESSAGES.MINIMIZE_MAIN_WINDOW);
  },

  toggleMaximize() {
    return ipcRenderer.send(IPC_MESSAGES.MAXIMIZE_MAIN_WINDOW);
  },

  isMaximized() {
    return new Promise((resolve) => {
      ipcRenderer.send(IPC_MESSAGES.ISMAXIMIZED_MAIN_WINDOW);
      ipcRenderer.once(
        IPC_MESSAGES.ISMAXIMIZED_RESULT,
        (_event, isMaximized) => {
          resolve(isMaximized);
        }
      );
    });
  },

  isFullscreen() {
    return new Promise((resolve) => {
      ipcRenderer.send(IPC_MESSAGES.ISFULLSCREEN_MAIN_WINDOW);
      ipcRenderer.once(
        IPC_MESSAGES.ISFULLSCREEN_RESULT,
        (_event, isFullscreen) => {
          resolve(isFullscreen);
        }
      );
    });
  },

  closeWindow() {
    return ipcRenderer.send(IPC_MESSAGES.CLOSE_MAIN_WINDOW);
  },

  async getCreds() {
    return (await ipcRenderer.invoke(IPC_ACTIONS.GET_CREDS)) as Creds;
  },

  async getLanguageMap(code: string) {
    return (await ipcRenderer.invoke(IPC_ACTIONS.GET_LANGUAGE_MAP, code)) as {
      languageMap: LanguageMap;
      success: boolean;
      message: string;
    };
  },

  async getTemplates(posTemplateWidth?: number): Promise<TemplateFile[]> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_TEMPLATES,
      posTemplateWidth
    )) as TemplateFile[];
  },

  async initScheduler(time: string) {
    await ipcRenderer.invoke(IPC_ACTIONS.INIT_SHEDULER, time);
  },

  async selectFile(options: SelectFileOptions): Promise<SelectFileReturn> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.SELECT_FILE,
      options
    )) as SelectFileReturn;
  },

  async getSaveFilePath(options: SaveDialogOptions) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_SAVE_FILEPATH,
      options
    )) as SaveDialogReturnValue;
  },

  async getOpenFilePath(options: OpenDialogOptions) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_OPEN_FILEPATH,
      options
    )) as OpenDialogReturnValue;
  },

  async checkDbAccess(filePath: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.CHECK_DB_ACCESS,
      filePath
    )) as boolean;
  },

  async checkForUpdates() {
    await ipcRenderer.invoke(IPC_ACTIONS.CHECK_FOR_UPDATES);
  },

  openLink(link: string) {
    ipcRenderer.send(IPC_MESSAGES.OPEN_EXTERNAL, link);
  },

  async deleteFile(filePath: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.DELETE_FILE,
      filePath
    )) as BackendResponse;
  },

  async saveData(data: string, savePath: string) {
    await ipcRenderer.invoke(IPC_ACTIONS.SAVE_DATA, data, savePath);
  },

  showItemInFolder(filePath: string) {
    ipcRenderer.send(IPC_MESSAGES.SHOW_ITEM_IN_FOLDER, filePath);
  },

  async makePDF(
    html: string,
    savePath: string,
    width: number,
    height: number
  ): Promise<boolean> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.SAVE_HTML_AS_PDF,
      html,
      savePath,
      width,
      height
    )) as boolean;
  },

  async printDocument(
    html: string,
    width: number,
    height: number
  ): Promise<boolean> {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.PRINT_HTML_DOCUMENT,
      html,
      width,
      height
    )) as boolean;
  },

  async getDbList() {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_DB_LIST
    )) as ConfigFilesWithModified[];
  },

  async getDbDefaultPath(companyName: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_DB_DEFAULT_PATH,
      companyName
    )) as string;
  },

  async getEnv() {
    return (await ipcRenderer.invoke(IPC_ACTIONS.GET_ENV)) as {
      isDevelopment: boolean;
      appEnv: 'development' | 'staging' | 'production';
      platform: string;
      version: string;
    };
  },

  openExternalUrl(url: string) {
    ipcRenderer.send(IPC_MESSAGES.OPEN_EXTERNAL, url);
  },

  async showError(title: string, content: string) {
    await ipcRenderer.invoke(IPC_ACTIONS.SHOW_ERROR, { title, content });
  },

  async sendError(body: string) {
    await ipcRenderer.invoke(IPC_ACTIONS.SEND_ERROR, body);
  },

  async sendAPIRequest(endpoint: string, options: RequestInit | undefined) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.SEND_API_REQUEST,
      endpoint,
      options
    )) as Promise<
      {
        [key: string]: string | number | boolean | Date | object | object[];
      }[]
    >;
  },

  async getLivebooksCloudSession() {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.GET_LIVEBOOKS_CLOUD_SESSION
    )) as { signedIn: boolean };
  },

  async clearLivebooksCloudSession() {
    await ipcRenderer.invoke(IPC_ACTIONS.CLEAR_LIVEBOOKS_CLOUD_SESSION);
  },

  async livebooksCloudApi(payload: {
    method: string;
    path: string;
    body?: unknown;
    skipAuth?: boolean;
    headers?: Record<string, string>;
  }) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.LIVEBOOKS_CLOUD_API,
      payload
    )) as { ok: boolean; status: number; data: unknown; etag?: string };
  },

  /**
   * Day-1 Phase 2.2 — main-process recovery loop. The renderer never
   * sees the recovered SQLCipher key. This call:
   *   1. POSTs to +/api/v1/me/escrow_key_retrieval+ (TOTP required).
   *   2. Persists the returned key into the OS keychain via
   *      +setDatabaseKeyFromRecovery+.
   *   3. Reconnects the database to verify the key opens the file.
   *   4. Returns +{ ok: true }+ or +{ ok: false, error, message }+.
   */
  async recoverySubmitAndRekey(payload: {
    dbPath: string;
    countryCode?: string;
    email: string;
    password: string;
    totpCode?: string;
  }) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.RECOVERY_SUBMIT_AND_REKEY,
      payload
    )) as {
      ok: boolean;
      error?: string;
      message?: string;
      countryCode?: string;
    };
  },

  registerLivebooksCloudSessionListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.LIVEBOOKS_CLOUD_SESSION_CHANGED, listener);
  },

  registerMainProcessErrorListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.LOG_MAIN_PROCESS_ERROR, listener);
  },

  registerTriggerFrontendActionListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.TRIGGER_ERPNEXT_SYNC, listener);
  },

  registerConsoleLogListener(listener: IPCRendererListener) {
    ipcRenderer.on(IPC_CHANNELS.CONSOLE_LOG, listener);
  },

  db: {
    async getSchema() {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_SCHEMA
      )) as BackendResponse;
    },

    async create(dbPath: string, countryCode?: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_CREATE,
        dbPath,
        countryCode
      )) as BackendResponse;
    },

    async connect(dbPath: string, countryCode?: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_CONNECT,
        dbPath,
        countryCode
      )) as BackendResponse;
    },

    async bootProbe(dbPath: string, countryCode?: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_BOOT_PROBE,
        dbPath,
        countryCode
      )) as BackendResponse;
    },

    async call(method: DatabaseMethod, ...args: unknown[]) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_CALL,
        method,
        ...args
      )) as BackendResponse;
    },

    async bespoke(method: string, ...args: unknown[]) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_BESPOKE,
        method,
        ...args
      )) as BackendResponse;
    },

    async encryptionStatus(dbPath?: string) {
      return (await ipcRenderer.invoke(
        IPC_ACTIONS.DB_ENCRYPTION_STATUS,
        dbPath
      )) as { available: boolean; hasKey: boolean };
    },
  },

  async desktopKeyEscrowPush(dbPath: string, totpCode?: string) {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.DESKTOP_KEY_ESCROW_PUSH,
      dbPath,
      totpCode
    )) as {
      ok: boolean;
      escrowed_at?: string;
      error?: string;
      message?: string;
    };
  },

  async desktopKeyEscrowStatus() {
    return (await ipcRenderer.invoke(
      IPC_ACTIONS.DESKTOP_KEY_ESCROW_STATUS
    )) as { ok: boolean; escrowed?: boolean; error?: string };
  },

  store: {
    get<K extends keyof ConfigMap>(key: K) {
      return config.get(key);
    },

    set<K extends keyof ConfigMap>(key: K, value: ConfigMap[K]) {
      return config.set(key, value);
    },

    delete(key: keyof ConfigMap) {
      return config.delete(key);
    },
  },
} as const;

contextBridge.exposeInMainWorld('ipc', ipc);
export type IPC = typeof ipc;
