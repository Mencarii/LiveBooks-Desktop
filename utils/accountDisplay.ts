/** Row shape for Account list queries used in UI labels. */
export type AccountLabelRow = {
  name: string;
  accountName?: string | null;
};

/** Human-readable chart-of-accounts label; `name` stays the DB id (UUID). */
export function accountDisplayName(account: AccountLabelRow): string {
  const label = account.accountName?.trim();
  if (label) {
    return label;
  }
  return account.name;
}
