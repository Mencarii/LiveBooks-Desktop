<template>
  <div
    v-if="paused"
    class="
      mb-4
      rounded-lg
      border border-amber-300
      dark:border-amber-700
      bg-amber-50
      dark:bg-amber-950/40
      px-4
      py-3
      text-sm text-amber-950
      dark:text-amber-100
    "
  >
    <p class="font-medium mb-2">
      {{
        t`Bank sync paused. Please verify your identity to resume downloading transactions.`
      }}
    </p>
    <div class="flex flex-col sm:flex-row gap-2 sm:items-end">
      <input
        v-model="totpCode"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        class="
          flex-1
          rounded
          border border-amber-300
          dark:border-amber-600
          bg-white
          dark:bg-gray-900
          px-3
          py-2
          text-sm
        "
        :placeholder="t`Authenticator or backup code`"
        :disabled="busy"
        @keyup.enter="verify"
      />
      <Button
        type="primary"
        :disabled="busy || !totpCode.trim()"
        @click="verify"
      >
        {{ t`Verify and resume` }}
      </Button>
    </div>
    <p v-if="errorMessage" class="mt-2 text-red-700 dark:text-red-300 text-xs">
      {{ errorMessage }}
    </p>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import { postMfaStepUp } from 'src/utils/plaidBankFeedsApi';
import {
  bankSyncMfaPausedState,
  setBankSyncMfaPaused,
} from 'src/utils/plaidBankSyncMfaGate';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PlaidBankSyncMfaBanner',
  components: { Button },
  emits: ['verified'],
  data() {
    return {
      totpCode: '',
      busy: false,
      errorMessage: '',
    };
  },
  computed: {
    paused(): boolean {
      return bankSyncMfaPausedState.value;
    },
  },
  methods: {
    async verify() {
      const code = this.totpCode.trim();
      if (!code) {
        return;
      }
      this.busy = true;
      this.errorMessage = '';
      try {
        const up = await postMfaStepUp(code);
        if (!up.ok) {
          this.errorMessage =
            up.error ?? t`Invalid code. Try again or use a backup code.`;
          return;
        }
        setBankSyncMfaPaused(false);
        this.totpCode = '';
        this.$emit('verified');
      } finally {
        this.busy = false;
      }
    },
  },
});
</script>
