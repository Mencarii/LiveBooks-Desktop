import { app } from 'electron';
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer';
import { Main } from '../main';
import { emitMainProcessError } from 'backend/helpers';
import { configureMacAboutPanel } from './configureMacAboutPanel';
import { rendererLog } from './helpers';
import {
  consumeArgvLivebooksDeepLink,
  flushPendingLivebooksDeepLink,
  registerLivebooksDefaultProtocol,
  startLivebooksDevHandoffServer,
} from './livebooksCloudBridge';
import { configureMacDevelopmentShell } from './setupMacDevelopmentShell';

export default function registerAppLifecycleListeners(main: Main) {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (main.mainWindow === null) {
      main.createWindow().catch((err) => emitMainProcessError(err));
    }
  });

  app.on('ready', () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('io.livebooks.desktop');
    }

    registerLivebooksDefaultProtocol();
    startLivebooksDevHandoffServer();

    if (process.platform === 'darwin') {
      configureMacAboutPanel(main.icon, main.isDevelopment);
      configureMacDevelopmentShell();
    }

    if (main.isDevelopment) {
      installDevTools(main).catch((err) => emitMainProcessError(err));
    }

    main
      .createWindow()
      .then(() => {
        consumeArgvLivebooksDeepLink();
        flushPendingLivebooksDeepLink();
      })
      .catch((err) => emitMainProcessError(err));
  });
}

async function installDevTools(main: Main) {
  try {
    await installExtension(VUEJS3_DEVTOOLS);
  } catch (e) {
    rendererLog(main, 'Vue Devtools failed to install', e);
  }
}
