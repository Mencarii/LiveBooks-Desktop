/**
 * Heuristics for cloud-sync folders that must not host live SQLite files.
 */

const CLOUD_FOLDER_MARKERS = [
  'Dropbox',
  'iCloud Drive',
  'iCloud',
  'OneDrive',
  'Google Drive',
  'Box Sync',
  'Box/',
] as const;

export function isCloudSyncFolderPath(dbPath: string): boolean {
  const normalized = dbPath.replace(/\\/g, '/');
  return CLOUD_FOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

export const CLOUD_FOLDER_DB_WARNING =
  'Storing company files in cloud sync folders (Dropbox, iCloud, OneDrive, etc.) can corrupt your database. Use a local folder and export backups instead.';
