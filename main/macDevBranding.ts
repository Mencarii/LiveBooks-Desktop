import type { LivebooksAppEnv } from 'utils/livebooksAppEnv';
import { livebooksDesktopDisplayName } from 'utils/livebooksAppEnv';

/** @deprecated Use livebooksDesktopDisplayName(appEnv) — kept for imports during transition. */
export const MAC_DEV_APP_LABEL = livebooksDesktopDisplayName('development');

export function macShellAppLabel(appEnv: LivebooksAppEnv): string {
  return livebooksDesktopDisplayName(appEnv);
}
