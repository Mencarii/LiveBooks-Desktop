import { app } from 'electron';
import { CUSTOM_EVENTS, IPC_CHANNELS } from 'utils/messages';
import { Main } from '../main';

function sendRendererMainProcessError(
  main: Main,
  error: unknown,
  more?: unknown
) {
  const wc = main.mainWindow?.webContents;
  if (!wc) {
    // No window yet; last-resort logging for main-process errors.
    // eslint-disable-next-line no-console -- fallback when webContents unavailable
    console.error(error, more ?? '');
    return;
  }
  wc.send(IPC_CHANNELS.LOG_MAIN_PROCESS_ERROR, error, more);
}

export default function registerProcessListeners(main: Main) {
  if (main.isDevelopment) {
    if (process.platform === 'win32') {
      process.on('message', (data) => {
        if (data === 'graceful-exit') {
          app.quit();
        }
      });
    } else {
      process.on('SIGTERM', () => {
        app.quit();
      });
    }
  }

  process.on(CUSTOM_EVENTS.MAIN_PROCESS_ERROR, (error, more) => {
    sendRendererMainProcessError(main, error, more);
  });

  process.on('unhandledRejection', (error) => {
    sendRendererMainProcessError(main, error);
  });

  process.on('uncaughtException', (error) => {
    sendRendererMainProcessError(main, error);
    setTimeout(() => process.exit(1), 10000);
  });
}
