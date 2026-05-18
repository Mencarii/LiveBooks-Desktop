<template>
  <div
    id="app"
    class="
      dark:bg-gray-900
      h-screen
      flex flex-col
      font-sans
      overflow-hidden
      antialiased
      relative
    "
    :dir="languageDirection"
    :language="language"
  >
    <WindowsTitleBar
      v-if="platform === 'Windows'"
      :db-path="dbPath"
      :company-name="companyName"
    />
    <!-- Main Contents -->
    <Desk
      v-if="activeScreen === 'Desk'"
      class="flex-1"
      :dark-mode="darkMode"
      @change-db-file="showDbSelector"
    />
    <DatabaseSelector
      v-if="activeScreen === 'DatabaseSelector'"
      ref="databaseSelector"
      @new-database="newDatabase"
      @file-selected="fileSelected"
    />
    <SetupWizard
      v-if="activeScreen === 'SetupWizard'"
      ref="setupWizard"
      @setup-complete="setupComplete"
      @setup-canceled="showDbSelector"
    />
    <RecoveryMode
      v-if="activeScreen === 'RecoveryMode'"
      @recovery-complete="onRecoveryComplete"
      @backup-selected="onRecoveryBackupSelected"
    />
    <FreeUserBackupSafetyModal
      :open="showFreeBackupSafetyModal"
      @dismiss="showFreeBackupSafetyModal = false"
      @exported="showFreeBackupSafetyModal = false"
    />
    <LoadingWorkspaceOverlay :open="loadingWorkspace" />

    <!-- Render target for toasts -->
    <div
      id="toast-container"
      class="absolute bottom-0 flex flex-col items-end mb-3 pe-6"
      style="width: 100%; pointer-events: none"
    ></div>
  </div>
</template>
<script lang="ts">
import { RTL_LANGUAGES } from 'fyo/utils/consts';
import { ModelNameEnum } from 'models/types';
import { systemLanguageRef } from 'src/utils/refs';
import { defineComponent, nextTick, provide, ref, Ref } from 'vue';
import WindowsTitleBar from './components/WindowsTitleBar.vue';
import { handleErrorWithDialog } from './errorHandling';
import { fyo } from './initFyo';
import DatabaseSelector from './pages/DatabaseSelector.vue';
import Desk from './pages/Desk.vue';
import RecoveryMode from './pages/RecoveryMode.vue';
import FreeUserBackupSafetyModal from './components/FreeUserBackupSafetyModal.vue';
import LoadingWorkspaceOverlay from './components/LoadingWorkspaceOverlay.vue';
import {
  recordDatabaseOpenForBackupReminder,
  shouldShowFreeBackupSafetyNet,
} from './utils/freeBackupSafetyNet';
import {
  getLivebooksSubscriptionSnapshot,
  startLivebooksSubscriptionPolling,
} from './utils/livebooksCloudSubscription';
import SetupWizard from './pages/SetupWizard/SetupWizard.vue';
import setupInstance from './setup/setupInstance';
import { SetupWizardOptions } from './setup/types';
import './styles/index.css';
import { connectToDatabase, dbErrorActionSymbols } from './utils/db';
import { initializeInstance } from './utils/initialization';
import * as injectionKeys from './utils/injectionKeys';
import { showDialog } from './utils/interactive';
import { updateConfigFiles } from './utils/misc';
import {
  markSetInitialScreenEnd,
  markSetInitialScreenStart,
  markSplashDismissed,
  markWorkspaceReady,
} from './utils/bootPerformance';
import { updatePrintTemplates } from './utils/printTemplates';
import { Search } from './utils/search';
import { Shortcuts } from './utils/shortcuts';
import { routeTo } from './utils/ui';
import { useKeys } from './utils/vueUtils';
import { setDarkMode } from 'src/utils/theme';
import {
  dismissBootSplash,
  isBootSplashVisible,
  setBootSplashSubtitle,
  waitForNextPaint,
} from './bootSplash';
import { runWhenIdle } from './utils/runWhenIdle';

enum Screen {
  Desk = 'Desk',
  DatabaseSelector = 'DatabaseSelector',
  SetupWizard = 'SetupWizard',
  RecoveryMode = 'RecoveryMode',
}

export default defineComponent({
  name: 'App',
  components: {
    Desk,
    SetupWizard,
    DatabaseSelector,
    RecoveryMode,
    FreeUserBackupSafetyModal,
    LoadingWorkspaceOverlay,
    WindowsTitleBar,
  },
  setup() {
    const keys = useKeys();
    const searcher: Ref<null | Search> = ref(null);
    const shortcuts = new Shortcuts(keys);
    const languageDirection = ref(
      getLanguageDirection(systemLanguageRef.value)
    );

    provide(injectionKeys.keysKey, keys);
    provide(injectionKeys.searcherKey, searcher);
    provide(injectionKeys.shortcutsKey, shortcuts);
    provide(injectionKeys.languageDirectionKey, languageDirection);

    const databaseSelector = ref<InstanceType<typeof DatabaseSelector> | null>(
      null
    );

    return {
      keys,
      searcher,
      shortcuts,
      languageDirection,
      databaseSelector,
    };
  },
  data() {
    return {
      activeScreen: null,
      dbPath: '',
      companyName: '',
      darkMode: false,
      showFreeBackupSafetyModal: false,
      loadingWorkspace: false,
    } as {
      activeScreen: null | Screen;
      dbPath: string;
      companyName: string;
      darkMode: boolean | undefined;
      showFreeBackupSafetyModal: boolean;
      loadingWorkspace: boolean;
    };
  },
  computed: {
    language(): string {
      return systemLanguageRef.value;
    },
  },
  watch: {
    language(value: string) {
      this.languageDirection = getLanguageDirection(value);
    },
  },
  async mounted() {
    markSetInitialScreenStart();
    const splashStarted = Date.now();
    let pendingDbPath: string | null = null;
    try {
      pendingDbPath = this.prepareInitialScreen();
    } catch {
      if (this.activeScreen === null) {
        this.activeScreen = Screen.DatabaseSelector;
      }
    } finally {
      if (!pendingDbPath) {
        await nextTick();
        await waitForNextPaint();
        await dismissBootSplash(0, splashStarted);
        markSplashDismissed();
        markSetInitialScreenEnd();
      }
      if (this.activeScreen === null) {
        this.activeScreen = Screen.DatabaseSelector;
      }
    }

    if (pendingDbPath) {
      setBootSplashSubtitle('Loading your workspace…');
      try {
        await this.fileSelected(pendingDbPath);
      } catch (error) {
        await handleErrorWithDialog(error, undefined, true, true);
        await this.showDbSelector();
      } finally {
        await dismissBootSplash(0, splashStarted);
        markSplashDismissed();
        markSetInitialScreenEnd();
      }
    }

    runWhenIdle(() => {
      void startLivebooksSubscriptionPolling();
    });
    const darkMode = !!fyo.singles.SystemSettings?.darkMode;
    setDarkMode(darkMode);
    this.darkMode = darkMode;
  },
  methods: {
    prepareInitialScreen(): string | null {
      const lastSelectedFilePath = fyo.config.get('lastSelectedFilePath', null);
      this.activeScreen = Screen.DatabaseSelector;

      if (
        typeof lastSelectedFilePath !== 'string' ||
        !lastSelectedFilePath.length
      ) {
        return null;
      }

      return lastSelectedFilePath;
    },
    async setSearcher(): Promise<void> {
      this.searcher = new Search(fyo);
      await this.searcher.initializeKeywords();
    },
    async setDesk(filePath: string): Promise<void> {
      const openCount = recordDatabaseOpenForBackupReminder();
      if (
        !this.showFreeBackupSafetyModal &&
        !getLivebooksSubscriptionSnapshot().proEntitled &&
        shouldShowFreeBackupSafetyNet(openCount)
      ) {
        this.showFreeBackupSafetyModal = true;
      }
      this.activeScreen = Screen.Desk;
      await this.setDeskRoute();
      if (fyo.store.telemetryEnabled) {
        await fyo.telemetry.start(true);
      }
      this.dbPath = filePath;
      this.companyName = (await fyo.getValue(
        ModelNameEnum.AccountingSettings,
        'companyName'
      )) as string;
      updateConfigFiles(fyo);
      runWhenIdle(() => {
        void ipc.initLoyaltyExpiryJob();
      });
      if (fyo.store.updaterEnabled) {
        runWhenIdle(() => {
          void ipc.checkForUpdates();
        });
      }
      runWhenIdle(() => {
        void this.setSearcher();
      });
    },
    newDatabase() {
      this.activeScreen = Screen.SetupWizard;
    },
    async fileSelected(filePath: string): Promise<void> {
      const showWorkspaceOverlay =
        this.activeScreen !== Screen.Desk && !isBootSplashVisible();
      if (showWorkspaceOverlay) {
        this.loadingWorkspace = true;
      }

      try {
        await this.openSelectedDatabase(filePath);
      } finally {
        if (showWorkspaceOverlay) {
          this.loadingWorkspace = false;
        }
      }
    },
    async openSelectedDatabase(filePath: string): Promise<void> {
      fyo.config.set('lastSelectedFilePath', filePath);
      if (filePath !== ':memory:' && !(await ipc.checkDbAccess(filePath))) {
        await showDialog({
          title: this.t`Cannot open file`,
          type: 'error',
          detail: this
            .t`LiveBooks Desktop does not have access to the selected file: ${filePath}`,
        });

        fyo.config.set('lastSelectedFilePath', null);
        this.activeScreen = Screen.DatabaseSelector;
        return;
      }

      try {
        await this.showSetupWizardOrDesk(filePath);
      } catch (error) {
        await handleErrorWithDialog(error, undefined, true, true);
        await this.showDbSelector();
      }
    },
    async setupComplete(setupWizardOptions: SetupWizardOptions): Promise<void> {
      const wizard = this.$refs.setupWizard as
        | { loading?: boolean }
        | undefined;
      try {
        const companyName = setupWizardOptions.companyName;
        const filePath = await ipc.getDbDefaultPath(companyName);
        await setupInstance(filePath, setupWizardOptions, fyo);
        fyo.config.set('lastSelectedFilePath', filePath);
        if (!getLivebooksSubscriptionSnapshot().proEntitled) {
          this.showFreeBackupSafetyModal = true;
        }
        await this.setDesk(filePath);
      } catch (error) {
        if (wizard) {
          wizard.loading = false;
        }
        await handleErrorWithDialog(error, undefined, true, true);
        this.activeScreen = Screen.SetupWizard;
      }
    },
    async showSetupWizardOrDesk(filePath: string): Promise<void> {
      const { countryCode, error, actionSymbol } = await connectToDatabase(
        this.fyo,
        filePath
      );

      if (!countryCode && error && actionSymbol) {
        return await this.handleConnectionFailed(error, actionSymbol);
      }

      const setupComplete = await fyo.getValue(
        ModelNameEnum.AccountingSettings,
        'setupComplete'
      );

      if (!setupComplete) {
        this.activeScreen = Screen.SetupWizard;
        return;
      }

      await initializeInstance(filePath, false, countryCode, fyo);
      await updatePrintTemplates(fyo);

      await this.setDesk(filePath);
    },
    async handleConnectionFailed(error: Error, actionSymbol: symbol) {
      // keychain corruption / unavailability MUST
      // surface the RecoveryMode screen. Never fall through to a generic
      // dialog (which used to silently re-key via getOrCreateDatabaseKey
      // on next open). RecoveryMode lives at the App-screen level rather
      // than under the router because <router-view> is only mounted
      // inside Desk, and Desk is unreachable until the DB is open.
      if (actionSymbol === dbErrorActionSymbols.RecoveryRequired) {
        this.activeScreen = Screen.RecoveryMode;
        return;
      }

      await this.showDbSelector();

      if (actionSymbol === dbErrorActionSymbols.CancelSelection) {
        return;
      }

      if (actionSymbol === dbErrorActionSymbols.SelectFile) {
        await this.databaseSelector?.existingDatabase();
        return;
      }

      throw error;
    },
    /**
     * RecoveryMode succeeded. The main process has
     * already persisted the recovered SQLCipher key into the OS keychain
     * AND verified that the key opens the .db (via
     * +databaseManager.connectToDatabase+ inside the IPC handler). All we
     * need to do here is resume the normal post-connect flow.
     */
    async onRecoveryComplete(payload: {
      dbPath: string;
      countryCode?: string;
    }) {
      const { dbPath, countryCode } = payload;
      try {
        if (countryCode) {
          await initializeInstance(dbPath, false, countryCode, fyo);
          fyo.config.set('lastSelectedFilePath', dbPath);
          await this.setDesk(dbPath);
        } else {
          await this.fileSelected(dbPath);
        }
      } catch (err) {
        await handleErrorWithDialog(err, undefined, true, true);
        await this.showDbSelector();
      }
    },
    async onRecoveryBackupSelected(filePath: string) {
      await this.fileSelected(filePath);
    },
    async setDeskRoute(): Promise<void> {
      const { onboardingComplete } = await fyo.doc.getDoc('GetStarted');
      const { hideGetStarted } = await fyo.doc.getDoc('SystemSettings');

      let route = '/get-started';
      if (hideGetStarted || onboardingComplete) {
        route = localStorage.getItem('lastRoute') || '/';
      }

      await routeTo(route);
      await nextTick();
      await waitForNextPaint();
      markWorkspaceReady();
    },
    async showDbSelector(): Promise<void> {
      localStorage.clear();
      fyo.config.set('lastSelectedFilePath', null);
      fyo.telemetry.stop();
      await fyo.purgeCache();
      this.activeScreen = Screen.DatabaseSelector;
      this.dbPath = '';
      this.searcher = null;
      this.companyName = '';
    },
  },
});

function getLanguageDirection(language: string): 'rtl' | 'ltr' {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}
</script>
