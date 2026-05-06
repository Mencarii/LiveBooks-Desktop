import { app } from 'electron';
import fs from 'fs';
import { getDisplayAppVersion, getSemverWithoutVPrefix } from './appVersion';
import { MAC_DEV_APP_LABEL } from './macDevBranding';

/**
 * macOS About window for packaged and dev builds.
 * Do not set `credits` here: AppKit loads centered `Credits.html` from the app bundle
 * (`electron-builder` extraFiles, or dev script copies it into Electron.app/Resources).
 * Call from app `ready` on darwin only.
 */
export function configureMacAboutPanel(
  iconPath: string,
  isDevelopment: boolean
): void {
  const applicationName = isDevelopment
    ? MAC_DEV_APP_LABEL
    : 'LiveBooks Desktop';

  const about: Parameters<typeof app.setAboutPanelOptions>[0] = {
    applicationName,
    applicationVersion: getDisplayAppVersion(),
    /** Overrides host bundle version (otherwise dev shows Electron, e.g. 22.3.27). */
    version: getSemverWithoutVPrefix(),
    copyright:
      'Copyright © LiveBooks\nGNU Affero General Public License v3.0 only',
  };

  if (fs.existsSync(iconPath)) {
    about.iconPath = iconPath;
  }

  app.setAboutPanelOptions(about);
}
