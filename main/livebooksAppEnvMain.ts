import { app } from 'electron';
import type { LivebooksAppEnv } from 'utils/livebooksAppEnv';
import {
  livebooksDesktopDisplayName,
  resolveLivebooksAppEnv,
} from 'utils/livebooksAppEnv';
import { getLivebooksCloudOriginMain } from './livebooksCloudBridge';

export function resolveLivebooksAppEnvMain(): LivebooksAppEnv {
  let cloudOrigin: string | undefined;
  try {
    cloudOrigin = getLivebooksCloudOriginMain();
  } catch {
    cloudOrigin = process.env.LIVEBOOKS_CLOUD_ORIGIN;
  }

  return resolveLivebooksAppEnv({
    livebooksAppEnv: process.env.LIVEBOOKS_APP_ENV,
    nodeEnv: process.env.NODE_ENV,
    cloudOrigin,
  });
}

/** Window / About panel display name. Never changes frozen productName on packaged builds. */
export function livebooksDesktopShellDisplayName(
  appEnv: LivebooksAppEnv,
  pro = false
): string {
  return livebooksDesktopDisplayName(appEnv, pro);
}

/**
 * macOS dev runs may set app name for menu bar; packaged builds keep frozen name.
 */
export function applyMacShellDisplayName(appEnv: LivebooksAppEnv): void {
  if (!app.isPackaged && appEnv === 'development') {
    app.setName(livebooksDesktopShellDisplayName(appEnv));
  }
}
