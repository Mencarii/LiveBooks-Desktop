import { CUSTOM_EVENTS } from 'utils/messages';
import { UnexpectedLogObject } from 'utils/types';
import { App as VueApp, createApp, nextTick } from 'vue';
import App from './App.vue';
import Badge from './components/Badge.vue';
import FeatherIcon from './components/FeatherIcon.vue';
import { handleError, sendError } from './errorHandling';
import { fyo } from './initFyo';
import { outsideClickDirective } from './renderer/helpers';
import registerIpcRendererListeners from './renderer/registerIpcRendererListeners';
import router from './router';
import { stringifyCircular } from './utils';
import {
  markRendererAppStart,
  markRendererMounted,
} from './utils/bootPerformance';
import { setLanguageMap } from './utils/language';
import { runWhenIdle } from './utils/runWhenIdle';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  markRendererAppStart();
  const language = fyo.config.get('language') as string;
  if (language) {
    await setLanguageMap(language);
  }
  fyo.store.language = language || 'English';

  registerIpcRendererListeners();
  const {
    isDevelopment,
    appEnv,
    platform,
    version,
    telemetryEnabled,
    updaterEnabled,
  } = await ipc.getEnv();

  fyo.store.isDevelopment = isDevelopment;
  fyo.store.appEnv = appEnv;
  fyo.store.appVersion = version;
  fyo.store.platform = platform;
  fyo.store.telemetryEnabled = telemetryEnabled;
  fyo.store.updaterEnabled = updaterEnabled;
  const platformName = getPlatformName(platform);

  setOnWindow(isDevelopment);

  const app = createApp({
    template: '<App/>',
  });
  app.config.unwrapInjectedRef = true;
  setErrorHandlers(app);

  app.use(router);
  app.component('App', App);
  app.component('FeatherIcon', FeatherIcon);
  app.component('Badge', Badge);
  app.directive('on-outside-click', outsideClickDirective);
  app.mixin({
    computed: {
      fyo() {
        return fyo;
      },
      platform() {
        return platformName;
      },
    },
    methods: {
      t: fyo.t,
      T: fyo.T,
    },
  });

  app.mount('#app-mount');
  await nextTick();
  markRendererMounted();
  runWhenIdle(() => {
    if (fyo.store.telemetryEnabled) {
      void fyo.telemetry.logOpened();
    }
  });
})();

function setErrorHandlers(app: VueApp) {
  // Browsers surface a handful of benign or actionable-by-the-user-only
  // events through window.onerror with no Error object attached. Reporting
  // these as if they were app crashes spams "Report Error" toasts on the
  // dashboard (most often: ResizeObserver layout-loop notifications when a
  // hidden chart re-mounts after re-activation).
  function isBenignWindowError(message: unknown): boolean {
    if (typeof message !== 'string') {
      return false;
    }

    const text = message.toLowerCase();
    return (
      text.includes('resizeobserver loop') ||
      text === 'script error.' ||
      text === 'script error'
    );
  }

  window.onerror = (message, source, lineno, colno, error) => {
    if (!error && isBenignWindowError(message)) {
      if (fyo.store.isDevelopment) {
        // eslint-disable-next-line no-console
        console.warn('[renderer] suppressed benign window.onerror', {
          message,
          source,
          lineno,
          colno,
        });
      }
      return;
    }

    error = error ?? new Error('triggered in window.onerror');
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    handleError(true, error, { message, source, lineno, colno });
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    let error: Error;
    if (event.reason instanceof Error) {
      error = event.reason;
    } else {
      error = new Error(String(event.reason));
    }

    // eslint-disable-next-line no-console
    handleError(true, error).catch((err) => console.error(err));
  };

  window.addEventListener(CUSTOM_EVENTS.LOG_UNEXPECTED, (event) => {
    const details = (event as CustomEvent)?.detail as UnexpectedLogObject;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    sendError(details);
  });

  app.config.errorHandler = (err, vm, info) => {
    const more: Record<string, unknown> = {
      info,
    };

    if (vm) {
      const { fullPath, params } = vm.$route;
      more.fullPath = fullPath;
      more.params = stringifyCircular(params ?? {});
      more.props = stringifyCircular(vm.$props ?? {}, true, true);
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    handleError(false, err as Error, more);
    // eslint-disable-next-line no-console
    console.error(err, vm, info);
  };
}

function setOnWindow(isDevelopment: boolean) {
  if (!isDevelopment) {
    return;
  }

  // @ts-ignore
  window.router = router;
  // @ts-ignore
  window.fyo = fyo;
}

function getPlatformName(platform: string) {
  switch (platform) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'Mac';
    case 'linux':
      return 'Linux';
    default:
      return 'Linux';
  }
}
