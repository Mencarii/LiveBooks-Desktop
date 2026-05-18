/** Boot probe result codes (P0–P5 matrix). */

export type BootProbeCode =
  | 'OK'
  | 'KEYCHAIN_UNAVAILABLE'
  | 'KEYCHAIN_CORRUPTED'
  | 'DB_OPEN_FAILED';

/** Dev-only: plaintext ledger on disk; caller may run target migration. */
export type BootProbeCodeWithDev = BootProbeCode | 'PLAINTEXT_DEV_MIGRATE';

export interface BootProbeResult {
  code: BootProbeCodeWithDev;
  countryCode?: string;
}
