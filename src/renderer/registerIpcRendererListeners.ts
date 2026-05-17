import { t } from 'fyo';
import { handleError } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { syncDocumentsToERPNext } from 'src/utils/erpnextSync';
import { dispatchLivebooksCloudSessionAppRefresh } from 'src/utils/livebooksCloud';
import { refreshLivebooksSubscription } from 'src/utils/livebooksCloudSubscription';

export default function registerIpcRendererListeners() {
  ipc.registerMainProcessErrorListener(
    (_, error: unknown, more?: Record<string, unknown>) => {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (!more) {
        more = {};
      }

      if (typeof more !== 'object') {
        more = { more };
      }

      more.isMainProcess = true;
      more.notifyUser ??= true;

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      handleError(true, error, more, !!more.notifyUser);
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  ipc.registerTriggerFrontendActionListener(async () => {
    await syncDocumentsToERPNext(fyo);
  });

  ipc.registerConsoleLogListener((_, ...stuff: unknown[]) => {
    if (!fyo.store.isDevelopment) {
      return;
    }

    if (fyo.store.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(...stuff);
    }
  });

  ipc.registerLivebooksCloudSessionListener((_, payload: unknown) => {
    const signedIn =
      payload !== null &&
      typeof payload === 'object' &&
      'signedIn' in payload &&
      (payload as { signedIn: unknown }).signedIn === true;
    if (signedIn) {
      showToast({
        type: 'success',
        message: t`LiveBooks Cloud account connected`,
        duration: 'short',
      });
    }
    dispatchLivebooksCloudSessionAppRefresh();
    void refreshLivebooksSubscription(signedIn);
    // Follow-up refresh: API calls right after handoff can race the main-process
    // token write or the local Rails server waking up; retry so sidebar/bank UI
    // clears "Cannot reach LiveBooks Cloud" without a full app restart.
    if (signedIn) {
      window.setTimeout(() => {
        dispatchLivebooksCloudSessionAppRefresh();
        void refreshLivebooksSubscription(true);
      }, 750);
    }
  });

  document.addEventListener('visibilitychange', () => {
    const { visibilityState } = document;
    if (visibilityState === 'visible' && !fyo.telemetry.started) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fyo.telemetry.start();
    }

    if (visibilityState !== 'hidden') {
      return;
    }

    fyo.telemetry.stop();
  });
}
