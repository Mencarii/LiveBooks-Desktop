<template>
  <div
    class="flex-1 flex justify-center items-center bg-gray-25 dark:bg-gray-900"
    :class="{ 'pointer-events-none': uiState === 'recovering' }"
  >
    <div
      class="
        w-full w-form
        shadow-lg
        rounded-lg
        border
        dark:border-gray-800
        relative
        bg-white
        dark:bg-gray-875
        p-8
      "
    >
      <!-- pro_required -->
      <template v-if="uiState === 'pro_required'">
        <h1 class="text-2xl font-semibold dark:text-gray-25 mb-4">
          {{ t`LiveBooks Pro required` }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{
            t`Your company file is still on this computer. Subscribe to LiveBooks Pro and sign in with two-factor authentication to unlock it again, or restore from a backup you saved earlier.`
          }}
        </p>
        <div class="flex gap-4">
          <Button type="primary" @click="openSubscribe">
            {{ t`View Pro plans` }}
          </Button>
          <Button @click="selectBackup">
            {{ t`Restore from backup` }}
          </Button>
        </div>
      </template>

      <!-- offline -->
      <template v-else-if="uiState === 'offline'">
        <h1 class="text-2xl font-semibold dark:text-gray-25 mb-4">
          {{ t`You are offline` }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{
            t`Cloud recovery requires an internet connection. Connect to the network and try again, or restore from a local backup.`
          }}
        </p>
        <Button @click="selectBackup">
          {{ t`Restore from backup` }}
        </Button>
      </template>

      <!-- safe_storage_failed -->
      <template v-else-if="uiState === 'safe_storage_failed'">
        <h1 class="text-2xl font-semibold dark:text-gray-25 mb-4">
          {{ t`Secure storage unavailable` }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {{
            t`Your operating system is not exposing a secure keychain. LiveBooks cannot persist a recovered encryption key until keychain access is available.`
          }}
        </p>
      </template>

      <!-- backup_fallback -->
      <template v-else-if="uiState === 'backup_fallback'">
        <h1 class="text-2xl font-semibold dark:text-gray-25 mb-4">
          {{ t`Restore from backup` }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          {{
            t`Choose a backup file you exported from LiveBooks. If cloud unlock did not work, the backup must have been made while you could still open this company.`
          }}
        </p>
        <Button type="primary" @click="selectBackup">
          {{ t`Choose backup file` }}
        </Button>
      </template>

      <!-- default: explaining / authenticating / recovering / error states -->
      <template v-else>
        <div class="flex items-center gap-4 mb-6">
          <div
            class="
              w-12
              h-12
              rounded-full
              bg-yellow-100
              dark:bg-yellow-900
              flex
              items-center
              justify-center
            "
          >
            <feather-icon
              name="alert-triangle"
              class="w-6 h-6 text-yellow-600 dark:text-yellow-400"
            />
          </div>
          <div>
            <h1 class="text-2xl font-semibold dark:text-gray-25">
              {{ t`Sign in to unlock your books` }}
            </h1>
          </div>
        </div>

        <p class="text-gray-600 dark:text-gray-400 mb-4">
          {{
            t`Your company file is still on this computer. Enter your LiveBooks Cloud email, password, and authenticator code to open it again.`
          }}
        </p>

        <div class="mb-6">
          <button
            type="button"
            class="text-sm text-blue-600 dark:text-blue-400 underline"
            :aria-expanded="showWhyHelp"
            @click="showWhyHelp = !showWhyHelp"
          >
            {{
              showWhyHelp
                ? t`Hide why am I seeing this?`
                : t`Why am I seeing this?`
            }}
          </button>
          <ul
            v-show="showWhyHelp"
            class="
              text-gray-600
              dark:text-gray-400
              mt-3
              list-disc list-inside
              space-y-1
              text-sm
            "
          >
            <li>
              {{
                t`You moved to a new computer or reinstalled macOS or Windows.`
              }}
            </li>
            <li>
              {{ t`You updated LiveBooks Desktop after a major app release.` }}
            </li>
            <li>
              {{
                t`You switched from a developer build to the official signed app from our website.`
              }}
            </li>
          </ul>
        </div>

        <p class="text-sm text-gray-500 dark:text-gray-500 mb-6">
          <button
            type="button"
            class="text-blue-600 dark:text-blue-400 underline"
            @click="openAccountSecurity"
          >
            {{ t`Set up two-factor authentication on LiveBooks Cloud` }}
          </button>
        </p>

        <div
          v-if="uiState === 'rate_limited'"
          class="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
        >
          <p class="text-yellow-800 dark:text-yellow-300 text-sm">
            {{ t`Too many recovery attempts. Please try again in an hour.` }}
          </p>
        </div>

        <div
          v-if="uiState === 'no_escrow'"
          class="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
        >
          <p class="text-yellow-800 dark:text-yellow-300 text-sm">
            {{
              t`No backup key is on file for this account. Enable cloud backup in Settings after you regain access, or restore from a local backup.`
            }}
          </p>
        </div>

        <div
          v-if="uiState === 'recovery_key_mismatch'"
          class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
        >
          <p class="text-red-600 dark:text-red-400 text-sm">
            {{
              t`The recovered key does not open this database. The key on file may be stale; restore from a backup.`
            }}
          </p>
        </div>

        <div
          v-if="errorMessage"
          class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
        >
          <p class="text-red-600 dark:text-red-400 text-sm">
            {{ errorMessage }}
          </p>
        </div>

        <div class="space-y-4 mb-6">
          <div>
            <label
              for="email"
              class="
                block
                text-sm
                font-medium
                text-gray-700
                dark:text-gray-300
                mb-1
              "
            >
              {{ t`Email` }}
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              :disabled="uiState === 'recovering'"
              class="
                w-full
                px-3
                py-2
                border
                dark:border-gray-700
                rounded-lg
                bg-white
                dark:bg-gray-800
                text-gray-900
                dark:text-gray-100
              "
              :placeholder="t`your@email.com`"
            />
          </div>

          <div>
            <label
              for="password"
              class="
                block
                text-sm
                font-medium
                text-gray-700
                dark:text-gray-300
                mb-1
              "
            >
              {{ t`Password` }}
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              :disabled="uiState === 'recovering'"
              class="
                w-full
                px-3
                py-2
                border
                dark:border-gray-700
                rounded-lg
                bg-white
                dark:bg-gray-800
                text-gray-900
                dark:text-gray-100
              "
              :placeholder="t`Enter your password`"
              @keyup.enter="attemptRecovery"
            />
          </div>

          <div>
            <label
              for="totp"
              class="
                block
                text-sm
                font-medium
                text-gray-700
                dark:text-gray-300
                mb-1
              "
            >
              {{ t`Authenticator code` }}
            </label>
            <input
              id="totp"
              v-model="totpCode"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              :disabled="uiState === 'recovering'"
              class="
                w-full
                px-3
                py-2
                border
                dark:border-gray-700
                rounded-lg
                bg-white
                dark:bg-gray-800
                text-gray-900
                dark:text-gray-100
              "
              :placeholder="t`6-digit authenticator code`"
            />
          </div>
        </div>

        <div class="flex gap-4">
          <Button
            type="primary"
            :disabled="
              uiState === 'recovering' ||
              !email ||
              !password ||
              !totpCode.trim()
            "
            class="flex-1"
            @click="attemptRecovery"
          >
            {{
              uiState === 'recovering' ? t`Unlocking...` : t`Unlock my books`
            }}
          </Button>
          <Button :disabled="uiState === 'recovering'" @click="selectBackup">
            {{ t`Restore from Backup` }}
          </Button>
        </div>

        <hr class="my-6 dark:border-gray-700" />

        <p class="text-sm text-gray-500 dark:text-gray-500">
          {{
            t`Not using LiveBooks Cloud? Choose a backup file you saved earlier instead.`
          }}
        </p>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import FeatherIcon from 'src/components/FeatherIcon.vue';
import {
  openLivebooksCloudAccountSecurity,
  openLivebooksCloudSubscribe,
} from 'src/utils/livebooksCloud';
import { refreshLivebooksSubscription } from 'src/utils/livebooksCloudSubscription';
import { getSelectedFilePath } from 'src/utils/ui';
import { defineComponent } from 'vue';

export type RecoveryUiState =
  | 'explaining'
  | 'pro_required'
  | 'offline'
  | 'safe_storage_failed'
  | 'authenticating'
  | 'recovering'
  | 'no_escrow'
  | 'rate_limited'
  | 'recovery_key_mismatch'
  | 'backup_fallback';

export default defineComponent({
  name: 'RecoveryMode',
  components: {
    Button,
    FeatherIcon,
  },
  emits: ['recovery-complete', 'backup-selected'],
  data() {
    return {
      email: '',
      password: '',
      totpCode: '',
      errorMessage: '',
      dbPath: '' as string,
      uiState: 'explaining' as RecoveryUiState,
      showWhyHelp: false,
    };
  },
  async mounted() {
    let dbPath = '';
    try {
      dbPath = sessionStorage.getItem('recoveryDbPath') ?? '';
    } catch {
      dbPath = '';
    }
    if (!dbPath) {
      const stored = ipc.store.get('lastSelectedFilePath');
      if (typeof stored === 'string' && stored.length > 0) {
        dbPath = stored;
      }
    }
    this.dbPath = dbPath;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.uiState = 'offline';
      return;
    }

    const enc = await ipc.db.encryptionStatus(this.dbPath || undefined);
    if (!enc.available) {
      this.uiState = 'safe_storage_failed';
      return;
    }

    await refreshLivebooksSubscription(
      (
        await ipc.getLivebooksCloudSession()
      ).signedIn
    );
  },
  methods: {
    openSubscribe() {
      openLivebooksCloudSubscribe();
    },
    openAccountSecurity() {
      openLivebooksCloudAccountSecurity();
    },
    async attemptRecovery() {
      if (!this.email || !this.password) {
        return;
      }
      if (!this.dbPath) {
        this.errorMessage = t`Could not determine which database to recover. Please re-open the file from the database selector.`;
        return;
      }

      this.uiState = 'recovering';
      this.errorMessage = '';
      let succeeded = false;

      try {
        const result = await ipc.recoverySubmitAndRekey({
          dbPath: this.dbPath,
          email: this.email,
          password: this.password,
          totpCode: this.totpCode || undefined,
        });

        if (!result.ok) {
          this.uiState = this.mapErrorToUiState(result.error);
          this.errorMessage =
            result.message || this.translateRecoveryError(result.error);
          return;
        }

        succeeded = true;
        try {
          sessionStorage.removeItem('recoveryDbPath');
        } catch {
          // ignore
        }
        this.$emit('recovery-complete', {
          dbPath: this.dbPath,
          countryCode: result.countryCode ?? '',
        });
      } catch (error) {
        this.uiState = 'explaining';
        this.errorMessage =
          (error as Error).message ||
          t`Network error. Please check your connection and try again.`;
      } finally {
        if (!succeeded && this.uiState === 'recovering') {
          this.uiState = 'explaining';
        }
      }
    },
    mapErrorToUiState(code: string | undefined): RecoveryUiState {
      switch (code) {
        case 'no_key_escrowed':
          return 'no_escrow';
        case 'too_many_requests':
          return 'rate_limited';
        case 'recovery_key_mismatch':
          return 'recovery_key_mismatch';
        case 'safe_storage_unavailable':
          return 'safe_storage_failed';
        case 'subscription_required':
        case 'http_403':
          return 'pro_required';
        case 'mfa_not_configured':
        case 'totp_required':
          return 'explaining';
        default:
          return 'explaining';
      }
    },
    translateRecoveryError(code: string | undefined): string {
      switch (code) {
        case 'invalid_credentials':
          return t`We could not sign in to your LiveBooks Cloud account with that email and password. The local database itself is not affected — only your cloud credentials are checked here.`;
        case 'no_key_escrowed':
          return t`No backup key is on file for this account. Restore from a local backup instead.`;
        case 'too_many_requests':
          return t`Too many recovery attempts. Please try again in an hour.`;
        case 'safe_storage_unavailable':
          return t`Your operating system is not exposing a secure keychain. Sign in again after enabling keychain access.`;
        case 'recovery_key_mismatch':
          return t`The recovered key does not open this database. The key on file may be stale; restore from a backup.`;
        case 'totp_required':
          return t`Enter your authenticator code. Enable two-factor authentication on LiveBooks Cloud first if you have not already.`;
        case 'mfa_not_configured':
          return t`Two-factor authentication is not enabled on this cloud account. Open the account security page in your browser to set it up, then try again.`;
        case 'subscription_required':
          return t`Cloud key recovery requires LiveBooks Pro.`;
        case 'http_403':
          return t`Cloud key recovery requires LiveBooks Pro.`;
        default:
          return t`Recovery failed. Please check your LiveBooks Cloud sign-in and try again, or restore from a local backup.`;
      }
    },
    async selectBackup() {
      this.uiState = 'backup_fallback';
      const filePath = (await getSelectedFilePath())?.filePaths?.[0];
      if (filePath) {
        this.$emit('backup-selected', filePath);
      } else if (this.uiState === 'backup_fallback') {
        this.uiState = 'explaining';
      }
    },
  },
});
</script>
