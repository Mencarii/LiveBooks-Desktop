// ipcRenderer.send(...)
export enum IPC_MESSAGES {
  OPEN_MENU = 'open-menu',
  OPEN_SETTINGS = 'open-settings',
  OPEN_EXTERNAL = 'open-external',
  SHOW_ITEM_IN_FOLDER = 'show-item-in-folder',
  RELOAD_MAIN_WINDOW = 'reload-main-window',
  MINIMIZE_MAIN_WINDOW = 'minimize-main-window',
  MAXIMIZE_MAIN_WINDOW = 'maximize-main-window',
  ISMAXIMIZED_MAIN_WINDOW = 'ismaximized-main-window',
  ISMAXIMIZED_RESULT = 'ismaximized-result',
  ISFULLSCREEN_MAIN_WINDOW = 'isfullscreen-main-window',
  ISFULLSCREEN_RESULT = 'isfullscreen-result',
  CLOSE_MAIN_WINDOW = 'close-main-window',
}

// ipcRenderer.invoke(...)
export enum IPC_ACTIONS {
  GET_LIVEBOOKS_CLOUD_SESSION = 'get-livebooks-cloud-session',
  CLEAR_LIVEBOOKS_CLOUD_SESSION = 'clear-livebooks-cloud-session',
  LIVEBOOKS_CLOUD_API = 'livebooks-cloud-api',
  GET_OPEN_FILEPATH = 'open-dialog',
  GET_SAVE_FILEPATH = 'save-dialog',
  GET_DIALOG_RESPONSE = 'show-message-box',
  GET_ENV = 'get-env',
  SAVE_HTML_AS_PDF = 'save-html-as-pdf',
  PRINT_HTML_DOCUMENT = 'print-html-document',
  SAVE_DATA = 'save-data',
  SHOW_ERROR = 'show-error',
  SEND_ERROR = 'send-error',
  GET_LANGUAGE_MAP = 'get-language-map',
  CHECK_FOR_UPDATES = 'check-for-updates',
  CHECK_DB_ACCESS = 'check-db-access',
  SELECT_FILE = 'select-file',
  GET_CREDS = 'get-creds',
  GET_DB_LIST = 'get-db-list',
  GET_TEMPLATES = 'get-templates',
  INIT_LOYALTY_SCHEDULER = 'init-loyalty-scheduler',
  DELETE_FILE = 'delete-file',
  GET_DB_DEFAULT_PATH = 'get-db-default-path',
  // Database messages
  DB_CREATE = 'db-create',
  DB_CONNECT = 'db-connect',
  DB_CALL = 'db-call',
  DB_BEGIN_TRANSACTION = 'db-begin-transaction',
  DB_END_TRANSACTION = 'db-end-transaction',
  DB_BESPOKE = 'db-bespoke',
  DB_SCHEMA = 'db-schema',
  DB_ENCRYPTION_STATUS = 'db-encryption-status',
  /** boot matrix probe (P0–P5); returns { code, countryCode? }. */
  DB_BOOT_PROBE = 'db-boot-probe',
  /** push SQLCipher key to cloud escrow (main + Bearer only). */
  DESKTOP_KEY_ESCROW_PUSH = 'desktop-key-escrow-push',
  /** whether cloud holds an escrowed key for the signed-in user. */
  DESKTOP_KEY_ESCROW_STATUS = 'desktop-key-escrow-status',
  // main-process-only recovery channel. The renderer
  // sends credentials (and optionally a TOTP code); the main
  // process performs the cloud round-trip, persists the recovered key
  // into the OS keychain via setDatabaseKeyFromRecovery, and replies
  // with a success/failure status. NO key material crosses IPC.
  RECOVERY_SUBMIT_AND_REKEY = 'recovery-submit-and-rekey',
}

// ipcMain.send(...)
export enum IPC_CHANNELS {
  LOG_MAIN_PROCESS_ERROR = 'main-process-error',
  CONSOLE_LOG = 'console-log',
  LIVEBOOKS_CLOUD_SESSION_CHANGED = 'livebooks-cloud-session-changed',
}

export enum DB_CONN_FAILURE {
  INVALID_FILE = 'invalid-file',
  CANT_OPEN = 'cant-open',
  CANT_CONNECT = 'cant-connect',
}

// events
export enum CUSTOM_EVENTS {
  MAIN_PROCESS_ERROR = 'main-process-error',
  LOG_UNEXPECTED = 'log-unexpected',
}
