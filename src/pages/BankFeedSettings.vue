<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Bank Feed Settings`" />

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <div v-if="bookError" class="text-red-600 dark:text-red-400 text-sm mb-4">
        {{ bookError }}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 class="text-base font-medium dark:text-gray-100">
          {{ t`Plaid` }}
        </h2>
        <Button
          type="primary"
          :disabled="plaidLinkBusy || !bookId"
          @click="linkBankWithPlaid()"
        >
          {{ t`Connect Banks via Plaid` }}
        </Button>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-5xl">
        {{
          t`Map each Plaid bank account to a ledger account. Each ledger account can only be linked to one Plaid sub-account — accounts already in use are shown as disabled in the dropdown. Disconnect Feed pauses automatic imports for that sub-account (mapping stays visible but disabled until you reactivate). Disconnecting the last sub-account removes the whole institution from Plaid until you connect the bank again. Use Reactivate feed to turn imports back on for a paused sub-account. Use Reconnect bank when Plaid requires login again for the whole link.`
        }}
      </p>

      <div
        class="
          mb-4
          rounded-lg
          border border-amber-300
          dark:border-amber-700
          bg-amber-50
          dark:bg-amber-900/20
          p-3
          text-sm text-amber-950
          dark:text-amber-100
          max-w-5xl
        "
      >
        {{
          t`Important: your ledger lives in this company file on this computer only. Using the same LiveBooks Cloud login on another computer without the same database will show different books. Keep one canonical copy of your company file, or migrate it intentionally before switching machines.`
        }}
      </div>

      <div
        v-if="bookId"
        class="
          mb-4
          max-w-5xl
          rounded-lg
          border border-gray-200
          dark:border-gray-700
          p-3
          text-sm
        "
      >
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="mt-1 rounded border-gray-400 dark:border-gray-600"
            :checked="plaidAutoStageImportBatches"
            @change="togglePlaidAutoStage"
          />
          <span class="text-gray-700 dark:text-gray-200">
            {{
              t`Automatically stage new Plaid batches into Bank Account Activity (For Review). If you turn this off, open each account and use Pull bank feed. Categories are never posted automatically.`
            }}
          </span>
        </label>
      </div>

      <div v-if="feedsLoading" class="text-sm text-gray-600 dark:text-gray-400">
        {{ t`Loading feeds…` }}
      </div>
      <div
        v-else-if="feedsError"
        class="text-sm text-red-600 dark:text-red-400"
      >
        {{ feedsError }}
      </div>
      <div
        v-else-if="feedItems.length === 0"
        class="text-sm text-gray-600 dark:text-gray-400 mb-6"
      >
        {{
          t`No Plaid connections yet. Use Connect Banks via Plaid to link an institution.`
        }}
      </div>
      <div v-else class="space-y-6">
        <div
          v-for="row in feedItems"
          :key="row.item_id"
          class="
            border border-gray-200
            dark:border-gray-700
            rounded-lg
            overflow-hidden
            bg-white
            dark:bg-gray-900
          "
        >
          <table class="min-w-full text-sm text-start">
            <caption
              class="
                text-start
                px-3
                py-2.5
                text-sm
                font-semibold
                text-gray-900
                dark:text-gray-100
                bg-gray-50
                dark:bg-gray-800
                border-b border-gray-200
                dark:border-gray-700
              "
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  {{ row.institution_name || row.item_id }}
                  <span
                    v-if="row.health"
                    class="inline-block w-2 h-2 rounded-full ms-2 align-middle"
                    :class="{
                      'bg-emerald-500': row.health === 'ok',
                      'bg-amber-500': row.health === 'stale',
                      'bg-red-500': row.health === 'broken',
                    }"
                    :title="
                      row.health === 'ok'
                        ? t`Connection healthy`
                        : row.health === 'stale'
                        ? t`No recent sync from your bank.`
                        : t`Connection broken — sign in again.`
                    "
                  />
                  <span
                    class="
                      block
                      text-xs
                      font-normal
                      text-gray-600
                      dark:text-gray-400
                      mt-1
                    "
                  >
                    {{ t`Last sync` }}:
                    {{
                      formatLocalTimestamp(row.last_sync_at) ||
                      row.last_sync_at ||
                      t`—`
                    }}
                    · {{ t`Feed version` }}: {{ row.feed_version }}
                  </span>
                  <span
                    v-if="row.ingest_paused_at"
                    class="
                      block
                      text-xs
                      font-normal
                      text-amber-700
                      dark:text-amber-300
                      mt-1
                    "
                  >
                    {{
                      t`Bank feeds paused — acknowledge old import batches in Desktop to resume.`
                    }}
                  </span>
                </div>
                <Button
                  type="secondary"
                  class="shrink-0 !text-xs self-start"
                  :disabled="!bookId || refreshItemBusy[row.item_id]"
                  @click.stop="refreshPlaidInstitution(row.item_id)"
                >
                  {{
                    refreshItemBusy[row.item_id] ? t`Refreshing…` : t`Refresh`
                  }}
                </Button>
              </div>
            </caption>
            <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
              <tr>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Bank account name` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Ledger name` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Actions` }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr class="bg-gray-50/80 dark:bg-gray-900/40">
                <td
                  colspan="3"
                  class="
                    p-3
                    border-b
                    dark:border-gray-700
                    align-top
                    text-xs text-gray-700
                    dark:text-gray-300
                  "
                >
                  <div
                    class="
                      flex flex-col
                      lg:flex-row lg:items-start lg:justify-between
                      gap-3
                    "
                  >
                    <p class="max-w-3xl">
                      {{
                        t`Deleted imported lines by mistake? Re-queue batches LiveBooks Cloud still has (typically within 90 days). This replays saved imports — it does not fetch brand-new bank history from Plaid or undo journals you posted. Then open Bank Account Activity for each mapped ledger account.`
                      }}
                    </p>
                    <Button
                      type="secondary"
                      class="shrink-0 !text-xs self-start"
                      :disabled="!bookId || reopenImportBusy[row.item_id]"
                      @click.stop="confirmReopenImportBatches(row)"
                    >
                      {{
                        reopenImportBusy[row.item_id]
                          ? t`Re-fetching…`
                          : t`Re-fetch missing data`
                      }}
                    </Button>
                  </div>
                </td>
              </tr>
              <tr v-if="row.item_login_required">
                <td
                  class="p-3 text-sm text-amber-800 dark:text-amber-200"
                  colspan="7"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <span>
                      {{
                        t`This connection needs re-authentication with Plaid (login required).`
                      }}
                    </span>
                    <Button
                      type="secondary"
                      :disabled="plaidLinkBusy || !bookId"
                      @click.stop="linkBankWithPlaid(row.item_id)"
                    >
                      {{ t`Reconnect bank` }}
                    </Button>
                  </div>
                </td>
              </tr>
              <tr v-else-if="linkedAccountsLoading[row.item_id]">
                <td
                  class="p-3 text-sm text-gray-600 dark:text-gray-400"
                  colspan="7"
                >
                  {{ t`Loading Plaid accounts…` }}
                </td>
              </tr>
              <tr v-else-if="linkedAccountsError[row.item_id]">
                <td class="p-3 text-sm text-red-600" colspan="7">
                  {{ linkedAccountsError[row.item_id] }}
                </td>
              </tr>
              <tr
                v-else-if="
                  linkedAccountsFetched[row.item_id] &&
                  !linkedAccountsByItem[row.item_id]?.length
                "
              >
                <td
                  class="p-3 text-sm text-gray-600 dark:text-gray-400"
                  colspan="7"
                >
                  {{
                    t`No Plaid accounts were returned. Use Refresh for this institution or reconnect the bank if login is required.`
                  }}
                </td>
              </tr>
              <template v-else>
                <tr
                  v-for="acc in linkedAccountsByItem[row.item_id] || []"
                  :key="acc.account_id"
                  class="
                    border-b
                    dark:border-gray-800
                    last:border-0
                    hover:bg-gray-50
                    dark:hover:bg-gray-800/80
                  "
                  :class="{
                    'cursor-pointer':
                      !!plaidRowLedgerName(row, acc) &&
                      !isPlaidAccountFeedDisconnected(row, acc),
                    'opacity-80': isPlaidAccountFeedDisconnected(row, acc),
                  }"
                  @click="
                    plaidRowLedgerName(row, acc) &&
                    !isPlaidAccountFeedDisconnected(row, acc)
                      ? openManualActivity(plaidRowLedgerName(row, acc)!)
                      : undefined
                  "
                >
                  <td class="p-3 text-start font-medium">
                    <span>{{ labelForPlaid(acc) }}</span>
                    <span
                      v-if="isPlaidAccountFeedDisconnected(row, acc)"
                      class="
                        block
                        text-xs
                        font-normal
                        text-amber-800
                        dark:text-amber-200
                        mt-0.5
                      "
                    >
                      {{ t`Feed paused — reactivate to import again` }}
                    </span>
                  </td>
                  <td class="p-3 text-start" @click.stop>
                    <div class="flex flex-col gap-1 max-w-xs">
                      <select
                        v-model="
                          chartSelections[selKey(row.item_id, acc.account_id)]
                        "
                        :disabled="isPlaidAccountFeedDisconnected(row, acc)"
                        class="
                          border
                          rounded
                          px-2
                          py-1
                          w-full
                          text-sm
                          dark:bg-gray-900 dark:border-gray-700
                          disabled:opacity-60 disabled:cursor-not-allowed
                        "
                      >
                        <option value="">{{ t`Select bank account…` }}</option>
                        <option
                          v-for="coa in chartBankAccounts"
                          :key="coa.name"
                          :value="coa.name"
                          :disabled="
                            isChartAccountTakenByOther(
                              row.item_id,
                              acc.account_id,
                              coa.name
                            )
                          "
                        >
                          {{
                            chartOptionLabel(
                              row.item_id,
                              acc.account_id,
                              coa.name
                            )
                          }}
                        </option>
                      </select>
                    </div>
                  </td>
                  <td class="p-3 text-start" @click.stop>
                    <div class="flex flex-wrap items-center gap-2">
                      <Button
                        type="secondary"
                        class="!px-2 !py-1 text-xs"
                        :disabled="isPlaidAccountFeedDisconnected(row, acc)"
                        @click="savePlaidMapping(row.item_id, acc)"
                      >
                        {{ t`Save Mapping` }}
                      </Button>
                      <Button
                        v-if="!isPlaidAccountFeedDisconnected(row, acc)"
                        type="secondary"
                        class="!px-2 !py-1 text-xs"
                        :disabled="!bookId"
                        @click="confirmDisconnectPlaid(row, acc)"
                      >
                        {{ t`Disconnect Feed` }}
                      </Button>
                      <Button
                        v-if="isPlaidAccountFeedDisconnected(row, acc)"
                        type="secondary"
                        class="!px-2 !py-1 text-xs"
                        :disabled="
                          !bookId ||
                          reactivateFeedBusy[
                            selKey(row.item_id, acc.account_id)
                          ]
                        "
                        @click="reactivatePlaidAccountFeed(row, acc)"
                      >
                        {{ t`Reactivate feed` }}
                      </Button>
                      <DropdownWithActions
                        v-if="plaidRowLedgerName(row, acc)"
                        :actions="plaidAccountLifecycleActions(row, acc)"
                      />
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex items-center justify-between mt-10 mb-2">
        <h2 class="text-base font-medium dark:text-gray-100">
          {{ t`Manual` }}
        </h2>
        <Button v-if="!manualPanelOpen" type="primary" @click="openManualPanel">
          {{ t`+ Add Manual Bank` }}
        </Button>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-300 mt-1 mb-4 max-w-5xl">
        {{
          t`Track accounts you update by uploading CSV statements. Use this for any bank or credit card you do not connect with Plaid.`
        }}
      </p>

      <div
        v-if="manualPanelOpen"
        class="
          border border-gray-200
          dark:border-gray-700
          rounded-lg
          p-4
          bg-white
          dark:bg-gray-900
          mb-4
        "
        @keydown.esc="closeManualPanel"
      >
        <h3 class="text-sm font-medium mb-3 dark:text-gray-100">
          {{ t`New manual bank` }}
        </h3>
        <div class="space-y-3 max-w-md">
          <div>
            <label class="block text-sm font-medium mb-1 dark:text-gray-200">
              {{ t`Type` }}
            </label>
            <div
              class="
                inline-flex
                border
                rounded
                overflow-hidden
                dark:border-gray-700
              "
            >
              <button
                type="button"
                class="px-3 py-1 text-sm"
                :class="
                  manualForm.kind === 'bank'
                    ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'
                "
                @click="manualForm.kind = 'bank'"
              >
                {{ t`Bank` }}
              </button>
              <button
                type="button"
                class="px-3 py-1 text-sm border-s dark:border-gray-700"
                :class="
                  manualForm.kind === 'credit_card'
                    ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'
                "
                @click="manualForm.kind = 'credit_card'"
              >
                {{ t`Credit card` }}
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1 dark:text-gray-200">
              {{ t`Account name` }}
            </label>
            <input
              ref="manualNameInput"
              v-model="manualForm.accountName"
              type="text"
              class="
                border
                rounded
                px-2
                py-1
                w-full
                dark:bg-gray-900 dark:border-gray-700
              "
              :placeholder="t`e.g. Chase CSV — Checking`"
              @keydown.enter="trySaveManual"
              @input="manualNameError = ''"
            />
            <p v-if="manualNameError" class="mt-1 text-xs text-red-600">
              {{ manualNameError }}
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1 dark:text-gray-200">
                {{ t`Opening balance` }}
              </label>
              <input
                v-model="manualForm.openingBalance"
                type="text"
                inputmode="decimal"
                class="
                  border
                  rounded
                  px-2
                  py-1
                  w-full
                  dark:bg-gray-900 dark:border-gray-700
                "
                :placeholder="t`0.00`"
                @keydown.enter="trySaveManual"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1 dark:text-gray-200">
                {{ t`As of` }}
              </label>
              <input
                v-model="manualForm.openingDate"
                type="date"
                class="
                  border
                  rounded
                  px-2
                  py-1
                  w-full
                  dark:bg-gray-900 dark:border-gray-700
                "
                @keydown.enter="trySaveManual"
              />
            </div>
          </div>
          <p
            v-if="manualNegativeHint"
            class="text-xs text-amber-700 dark:text-amber-300"
          >
            {{ t`This account will start with a negative balance.` }}
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <Button
              type="secondary"
              :disabled="manualSaving"
              @click="closeManualPanel"
            >
              {{ t`Cancel` }}
            </Button>
            <Button
              type="primary"
              :disabled="!canSaveManual || manualSaving"
              @click="trySaveManual"
            >
              {{ manualSaving ? t`Saving…` : t`Save` }}
            </Button>
          </div>
        </div>
      </div>

      <div
        v-if="manualLoading"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        {{ t`Loading manual banks…` }}
      </div>
      <div
        v-else-if="manualBanks.length === 0"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        {{ t`No manual banks yet. Add one to start uploading CSV statements.` }}
      </div>
      <div
        v-else
        class="
          border border-gray-200
          dark:border-gray-700
          rounded-lg
          overflow-hidden
          bg-white
          dark:bg-gray-900
        "
      >
        <table class="min-w-full text-sm text-start">
          <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
            <tr>
              <th class="text-start p-3 border-b dark:border-gray-700">
                {{ t`Account Name` }}
              </th>
              <th class="text-start p-3 border-b dark:border-gray-700">
                {{ t`Actions` }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in manualBanks"
              :key="m.name"
              class="
                cursor-pointer
                hover:bg-gray-50
                dark:hover:bg-gray-800/80
                border-b
                dark:border-gray-800
                last:border-0
              "
              @click="openManualActivity(m.name)"
            >
              <td class="p-3 text-start font-medium">
                {{ manualBankLabel(m) }}
              </td>

              <td class="p-3 text-start" @click.stop>
                <DropdownWithActions
                  :actions="manualBankLifecycleActions(m.name)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import type { Action } from 'fyo/model/types';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showDialog, showToast } from 'src/utils/interactive';
import {
  openLivebooksCloudAccountSecurity,
} from 'src/utils/livebooksCloud';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  exchangePlaidPublicTokenWithStepUp,
  requestPlaidLinkTokenWithStepUp,
} from 'src/utils/plaidLinkApi';
import { openPlaidLinkModal } from 'src/utils/plaidLinkClient';
import {
  isManualBankAccount,
  loadAllBankCoaAccounts,
  loadPlaidAccountMaps,
  manualPendingCountFor,
  type BankCoaAccount,
  type PlaidMapRow,
} from 'src/utils/bankFeedHelpers';
import {
  enablePlaidAccountFeed,
  fetchPlaidFeedsWithStepUp,
  promptPlaidMfaTotp,
  reopenAckedPlaidImportBatches,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import {
  fetchPlaidLinkedAccounts,
  formatPlaidAccountLabel as formatPlaidLinkedRowLabel,
  type PlaidLinkedAccountRow,
} from 'src/utils/plaidLinkedAccountsApi';
import { routeTo } from 'src/utils/ui';
import {
  archiveBankAccount,
  countLedgerRowsForAccount,
  deleteEmptyBankAccount,
  disconnectPlaidAccountFeedLocalAndRemote,
  ledgerSignedBalanceForAccount,
} from 'src/utils/bankAccountSettings';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import { isCredit } from 'models/helpers';
import { accountDisplayName } from 'utils/accountDisplay';
import { defineComponent, nextTick } from 'vue';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const MANUAL_BANK_PARENT_FALLBACKS = ['Bank Accounts'];
const CREDIT_CARD_PARENT_FALLBACKS = [
  'Credit Cards',
  'Current Liabilities',
  'Liabilities',
];
const OPENING_BALANCE_EQUITY_NAME = 'Opening Balance Equity';

export default defineComponent({
  name: 'BankFeedSettings',
  components: { PageHeader, Button, DropdownWithActions },
  data() {
    return {
      bookId: '' as string,
      bookError: '' as string,
      refreshItemBusy: {} as Record<string, boolean>,
      reopenImportBusy: {} as Record<string, boolean>,
      plaidAutoStageImportBatches: true,
      plaidLinkBusy: false,
      feedsLoading: false,
      feedsError: '' as string,
      feedItems: [] as PlaidFeedItemRow[],
      feedsEtag: undefined as string | undefined,
      chartBankAccounts: [] as {
        name: string;
        accountName?: string;
        rootType?: string;
      }[],
      totalsByAccount: {} as Record<
        string,
        { totalDebit: number; totalCredit: number }
      >,
      linkedAccountsByItem: {} as Record<string, PlaidLinkedAccountRow[]>,
      linkedAccountsError: {} as Record<string, string>,
      linkedAccountsLoading: {} as Record<string, boolean>,
      linkedAccountsFetched: {} as Record<string, boolean>,
      chartSelections: {} as Record<string, string>,
      resolvedChartByPlaid: {} as Record<string, string>,
      manualPanelOpen: false,
      manualSaving: false,
      manualNameError: '' as string,
      manualLoading: false,
      manualBankCoaAccounts: [] as BankCoaAccount[],
      manualPlaidMaps: [] as PlaidMapRow[],
      manualToReviewCounts: {} as Record<string, number>,
      manualLedgerRowCounts: {} as Record<string, number>,
      plaidLedgerRowCounts: {} as Record<string, number>,
      reactivateFeedBusy: {} as Record<string, boolean>,
      manualForm: {
        kind: 'bank' as 'bank' | 'credit_card',
        accountName: '',
        openingBalance: '0',
        openingDate: todayIsoDate(),
      },
    };
  },
  computed: {
    manualBanks(): {
      name: string;
      accountName?: string;
      rootType?: string;
      toReviewCount: number;
    }[] {
      const out: {
        name: string;
        accountName?: string;
        rootType?: string;
        toReviewCount: number;
      }[] = [];
      for (const a of this.manualBankCoaAccounts) {
        if (!isManualBankAccount(a.name, this.manualPlaidMaps)) {
          continue;
        }
        out.push({
          name: a.name,
          accountName: a.accountName,
          rootType: a.rootType,
          toReviewCount: this.manualToReviewCounts[a.name] ?? 0,
        });
      }
      out.sort((x, y) =>
        accountDisplayName(x).localeCompare(accountDisplayName(y))
      );
      return out;
    },
    manualBalanceFloat(): number | null {
      const raw = this.manualForm.openingBalance.trim().replace(/,/g, '');
      if (raw === '') {
        return 0;
      }
      const n = Number.parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    },
    manualNegativeHint(): boolean {
      return (
        this.manualForm.kind === 'bank' &&
        (this.manualBalanceFloat ?? 0) < 0
      );
    },
    canSaveManual(): boolean {
      const name = this.manualForm.accountName.trim();
      return (
        !!name &&
        !!this.manualForm.openingDate &&
        this.manualBalanceFloat !== null &&
        !this.manualNameError
      );
    },
  },
  mounted() {
    this.syncPlaidDesktopPreferences();
    void this.bootstrap();
  },
  methods: {
    plaidMfaPromptTotp() {
      return promptPlaidMfaTotp(
        t`Enter your LiveBooks Cloud authenticator or backup code to continue.`
      );
    },
    plaidLinkPromptTotp() {
      return promptPlaidMfaTotp(
        t`Enter your LiveBooks Cloud authenticator or backup code to link a bank account.`
      );
    },
    manualBankLabel(m: { name: string; accountName?: string }) {
      return accountDisplayName(m);
    },
    t,
    syncPlaidDesktopPreferences() {
      this.plaidAutoStageImportBatches =
        fyo.config.get('plaidAutoStageImportBatches', true) !== false;
    },
    togglePlaidAutoStage(ev: Event) {
      const input = ev.target as HTMLInputElement | null;
      if (!input) {
        return;
      }
      const v = !!input.checked;
      this.plaidAutoStageImportBatches = v;
      void fyo.config.set('plaidAutoStageImportBatches', v);
    },
    async bootstrap() {
      const ctx = await ensureLivebooksCloudBookId(fyo);
      if (!ctx.ok) {
        this.bookId = '';
        this.bookError =
          ctx.reason === 'not_signed_in'
            ? t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`
            : (ctx.message ?? t`Could not resolve your cloud book for this company file.`);
        await this.loadChartBankAccountsForMaps();
        await this.loadManualSection();
        return;
      }
      this.bookError = '';
      this.bookId = ctx.bookId;
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async loadChartBankAccountsForMaps() {
      this.chartBankAccounts = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'accountName', 'rootType'],
        filters: {
          accountType: AccountTypeEnum.Bank,
          isGroup: false,
          disabled: false,
        },
      })) as { name: string; rootType?: string }[];
    },
    async loadTotalsByAccount() {
      try {
        const totals = await fyo.db.getTotalCreditAndDebit();
        const map: Record<
          string,
          { totalDebit: number; totalCredit: number }
        > = {};
        for (const row of totals) {
          map[row.account] = {
            totalDebit: Number(row.totalDebit ?? 0),
            totalCredit: Number(row.totalCredit ?? 0),
          };
        }
        this.totalsByAccount = map;
      } catch {
        this.totalsByAccount = {};
      }
    },
    balanceFor(name: string, rootType?: string): string {
      const total = this.totalsByAccount[name];
      if (!total) {
        return fyo.format(0, 'Currency');
      }
      const { totalCredit, totalDebit } = total;
      const rt = rootType as Parameters<typeof isCredit>[0] | undefined;
      let v = totalDebit - totalCredit;
      if (rt && isCredit(rt)) {
        v = totalCredit - totalDebit;
      }
      return fyo.format(v, 'Currency');
    },
    ledgerBalanceLabelForName(
      ledgerName: string | null | undefined,
      rootType?: string
    ): string {
      if (!ledgerName) {
        return t`—`;
      }
      const rt =
        rootType ??
        this.chartBankAccounts.find((c) => c.name === ledgerName)?.rootType;
      return this.balanceFor(ledgerName, rt);
    },
    formatLocalTimestamp(iso: string | null): string | null {
      if (!iso) {
        return null;
      }
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        return iso;
      }
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    },
    formatBankBalance(acc: PlaidLinkedAccountRow): string | null {
      const b = acc.balances ?? undefined;
      const current =
        b && typeof b === 'object' ? (b ).current : undefined;
      const available =
        b && typeof b === 'object'
          ? (b ).available
          : undefined;
      const v =
        typeof current === 'number'
          ? current
          : typeof available === 'number'
            ? available
            : null;
      return v == null ? null : fyo.format(v, 'Currency');
    },
    ledgerNameForPlaidAccount(
      itemId: string,
      plaidAccountId: string
    ): string | null {
      const k = this.selKey(itemId, plaidAccountId);
      const mapped =
        this.chartSelections[k] || this.resolvedChartByPlaid[k];
      if (mapped) {
        return mapped;
      }
      const fallback = this.manualPlaidMaps.find(
        (m) => m.plaidItemId === itemId && m.plaidAccountId === plaidAccountId
      )?.chartAccount;
      return fallback ?? null;
    },
    plaidRowLedgerName(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): string | null {
      return this.ledgerNameForPlaidAccount(row.item_id, acc.account_id);
    },
    plaidRowToReview(row: PlaidFeedItemRow, acc: PlaidLinkedAccountRow): number {
      const ledger = this.plaidRowLedgerName(row, acc);
      if (!ledger) {
        return 0;
      }
      return this.manualToReviewCounts[ledger] ?? 0;
    },
    plaidFeedDisconnectedIds(row: PlaidFeedItemRow): Set<string> {
      return new Set(
        (row.feed_disconnected_account_ids ?? []).map((id) => String(id))
      );
    },
    isPlaidAccountFeedDisconnected(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): boolean {
      return this.plaidFeedDisconnectedIds(row).has(acc.account_id);
    },
    /** Sub-accounts at this institution that still receive Plaid imports (not in paused list). */
    activePlaidFeedCount(row: PlaidFeedItemRow): number {
      const linked = this.linkedAccountsByItem[row.item_id] ?? [];
      const disc = this.plaidFeedDisconnectedIds(row);
      return linked.filter((a) => !disc.has(a.account_id)).length;
    },
    /** True if disconnecting this row would remove the whole Plaid Item (last active sub-account). */
    disconnectingWouldRemoveEntireInstitution(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): boolean {
      if (this.isPlaidAccountFeedDisconnected(row, acc)) {
        return false;
      }
      return this.activePlaidFeedCount(row) === 1;
    },
    institutionDisplayName(row: PlaidFeedItemRow): string {
      return row.institution_name?.trim() || row.item_id;
    },
    plaidLedgerBalanceLabel(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): string {
      const name = this.plaidRowLedgerName(row, acc);
      if (!name) {
        return t`—`;
      }
      const rt = this.chartBankAccounts.find((c) => c.name === name)?.rootType;
      return this.ledgerBalanceLabelForName(name, rt);
    },
    async confirmDisconnectPlaid(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`,
        });
        return;
      }
      const accLabel = this.labelForPlaid(acc);
      const instName = this.institutionDisplayName(row);
      const removesWholeLink =
        this.disconnectingWouldRemoveEntireInstitution(row, acc);
      const confirmed = (await showDialog({
        type: 'warning',
        title: removesWholeLink
          ? t`Disconnect entire bank from Plaid?`
          : t`Disconnect feed?`,
        detail: removesWholeLink
          ? t`"${accLabel}" is the last sub-account still receiving automatic imports under ${instName}. Disconnecting it removes the whole institution from Plaid and stops all feeds for this bank until you connect it again. Your ledger accounts and history stay in the books.`
          : t`This pauses automatic imports for ${accLabel}. Other linked accounts under ${instName} can keep syncing. Your ledger history does not change — you can upload CSVs if you like.`,
        buttons: [
          {
            label: t`Cancel`,
            action: () => false,
            isEscape: true,
          },
          {
            label: removesWholeLink
              ? t`Disconnect institution`
              : t`Disconnect feed`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!confirmed) {
        return;
      }
      const res = await disconnectPlaidAccountFeedLocalAndRemote(
        this.bookId,
        row.item_id,
        acc.account_id,
        { promptTotp: () => this.plaidMfaPromptTotp() }
      );
      if (!res.ok) {
        showToast({ type: 'error', message: res.error });
        return;
      }
      showToast({
        type: 'success',
        message: res.itemRemoved
          ? t`Bank institution disconnected from Plaid. You can still use manual CSV uploads.`
          : t`Feed disconnected for this account. Other accounts at this institution may keep syncing.`,
      });
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async reactivatePlaidAccountFeed(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`,
        });
        return;
      }
      const k = this.selKey(row.item_id, acc.account_id);
      this.reactivateFeedBusy = { ...this.reactivateFeedBusy, [k]: true };
      try {
        const en = await enablePlaidAccountFeed(
          this.bookId,
          row.item_id,
          acc.account_id,
          { promptTotp: () => this.plaidMfaPromptTotp() }
        );
        if (!en.ok) {
          showToast({ type: 'error', message: en.error ?? t`Could not reactivate feed.` });
          return;
        }
        showToast({
          type: 'success',
          message: t`Feed reactivated. Imports will resume on the next sync.`,
        });
        await this.refreshFeeds(false);
        await this.loadManualSection({ quiet: true });
      } finally {
        const next = { ...this.reactivateFeedBusy };
        delete next[k];
        this.reactivateFeedBusy = next;
      }
    },
    async confirmReopenImportBatches(row: PlaidFeedItemRow) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`,
        });
        return;
      }
      const instName = this.institutionDisplayName(row);
      const confirmed = (await showDialog({
        type: 'info',
        title: t`Re-fetch missing bank data?`,
        detail: t`This re-opens recently acknowledged imports for ${instName} so this computer can download them again if rows were deleted locally. Data must still exist on LiveBooks Cloud (typically within 90 days). It does not request new history from the bank.`,
        buttons: [
          {
            label: t`Cancel`,
            action: () => false,
            isEscape: true,
          },
          {
            label: t`Re-fetch`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!confirmed) {
        return;
      }
      this.reopenImportBusy = { ...this.reopenImportBusy, [row.item_id]: true };
      try {
        const res = await reopenAckedPlaidImportBatches(
          this.bookId,
          row.item_id,
          { days: 30, promptTotp: () => this.plaidMfaPromptTotp() }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            message: res.error ?? t`Re-fetch failed.`,
          });
          return;
        }
        if ((res.reopenedCount ?? 0) === 0) {
          showToast({
            type: 'info',
            message: t`Nothing to re-fetch in the last ${String(
              res.days ?? 30
            )} days, or those batches were already deleted from LiveBooks Cloud.`,
          });
        } else {
          showToast({
            type: 'success',
            message: t`Re-opened ${String(
              res.reopenedCount
            )} batch(es). Open Bank Account Activity for each mapped account to merge them into For Review.`,
          });
        }
        await this.refreshFeeds(false);
        await this.loadManualSection({ quiet: true });
      } finally {
        const next = { ...this.reopenImportBusy };
        delete next[row.item_id];
        this.reopenImportBusy = next;
      }
    },
    async confirmArchiveManualBank(accountName: string) {
      const n = await countLedgerRowsForAccount(accountName);
      if (n === 0) {
        showToast({
          type: 'info',
          message: t`This account has no ledger history — use Delete account instead.`,
        });
        await this.loadManualSection({ quiet: true });
        return;
      }
      const bal = await ledgerSignedBalanceForAccount(accountName);
      const detail = t`Archiving hides this account from your daily bank feeds and most pickers, but keeps your historical reports accurate. Unreviewed feed lines for this account will be marked excluded.`;
      const detailEmphasis =
        bal != null && Math.abs(bal) > 0.005
          ? t`Note: This account still has a ${fyo.format(
              bal,
              'Currency'
            )} balance in your books. You may want to record a transfer to your new bank before archiving.`
          : undefined;
      const ok = (await showDialog({
        type: 'warning',
        title: t`Archive this account?`,
        detail,
        detailEmphasis,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: t`Archive account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const ar = await archiveBankAccount(accountName);
      if (!ar.ok) {
        showToast({ type: 'error', message: ar.error });
        return;
      }
      showToast({ type: 'success', message: t`Account archived.` });
      await this.loadChartBankAccountsForMaps();
      await this.loadManualSection();
    },
    async refreshPlaidInstitution(itemId: string) {
      if (!this.bookId || this.refreshItemBusy[itemId]) {
        return;
      }
      this.refreshItemBusy = { ...this.refreshItemBusy, [itemId]: true };
      try {
        await this.refreshFeeds(false, {
          linkedPrefetch: 'single',
          singleItemId: itemId,
        });
      } finally {
        const next = { ...this.refreshItemBusy };
        delete next[itemId];
        this.refreshItemBusy = next;
      }
    },
    async refreshFeeds(
      useEtag: boolean,
      options?: {
        linkedPrefetch?: 'all' | 'single';
        singleItemId?: string;
      }
    ) {
      if (!this.bookId) {
        return;
      }
      const linkedPrefetch = options?.linkedPrefetch ?? 'all';
      const singleItemId = options?.singleItemId;
      if (linkedPrefetch === 'single' && !singleItemId) {
        return;
      }
      this.feedsLoading = !useEtag && linkedPrefetch === 'all';
      this.feedsError = '';
      const res = await fetchPlaidFeedsWithStepUp(this.bookId, {
        ifNoneMatch: useEtag ? this.feedsEtag : undefined,
      });
      this.feedsLoading = false;
      if (res.error) {
        this.feedsError = res.error;
        return;
      }
      if (res.notModified) {
        if (linkedPrefetch === 'single' && singleItemId) {
          await this.loadLinkedAccountsForItem(singleItemId);
          await this.hydratePlaidLedgerTxCounts();
        }
        return;
      }
      if (res.payload) {
        this.feedItems = res.payload.items ?? [];
        if (res.etag) {
          this.feedsEtag = res.etag;
        }
        if (linkedPrefetch === 'all') {
          this.linkedAccountsByItem = {};
          this.linkedAccountsError = {};
          this.linkedAccountsLoading = {};
          this.linkedAccountsFetched = {};
          await this.prefetchLinkedForAllItems();
        } else {
          await this.loadLinkedAccountsForItem(singleItemId!);
          await this.hydratePlaidLedgerTxCounts();
        }
      }
    },
    async prefetchLinkedForAllItems() {
      await Promise.all(
        this.feedItems
          .filter((r) => !r.item_login_required)
          .map((r) => this.loadLinkedAccountsForItem(r.item_id))
      );
      await this.hydratePlaidLedgerTxCounts();
    },
    async hydratePlaidLedgerTxCounts() {
      const names = new Set<string>();
      for (const row of this.feedItems) {
        for (const acc of this.linkedAccountsByItem[row.item_id] ?? []) {
          const ledger = this.ledgerNameForPlaidAccount(
            row.item_id,
            acc.account_id
          );
          if (ledger) {
            names.add(ledger);
          }
        }
      }
      const next: Record<string, number> = {};
      for (const ledger of names) {
        try {
          next[ledger] = await countLedgerRowsForAccount(ledger);
        } catch {
          next[ledger] = 0;
        }
      }
      this.plaidLedgerRowCounts = next;
    },
    plaidAccountLifecycleActions(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): Action[] {
      const ledger = this.plaidRowLedgerName(row, acc);
      if (!ledger) {
        return [];
      }
      const n = this.plaidLedgerRowCounts[ledger] ?? 0;
      if (n === 0) {
        return [
          {
            label: t`Delete account`,
            action: async () => {
              await this.confirmDeletePlaidMappedAccount(row, acc, ledger);
            },
          } as Action,
        ];
      }
      return [
        {
          label: t`Archive account`,
          action: async () => {
            await this.confirmArchivePlaidMappedAccount(row, acc, ledger);
          },
        } as Action,
      ];
    },
    manualBankLifecycleActions(accountName: string): Action[] {
      const n = this.manualLedgerRowCounts[accountName] ?? 0;
      if (n === 0) {
        return [
          {
            label: t`Delete account`,
            action: async () => {
              await this.confirmDeleteManualBank(accountName);
            },
          } as Action,
        ];
      }
      return [
        {
          label: t`Archive account`,
          action: async () => {
            await this.confirmArchiveManualBank(accountName);
          },
        } as Action,
      ];
    },
    async confirmDeletePlaidMappedAccount(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow,
      accountName: string
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`,
        });
        return;
      }
      const n = await countLedgerRowsForAccount(accountName);
      if (n > 0) {
        showToast({
          type: 'error',
          message: t`This account has ledger history and cannot be deleted. Archive it instead.`,
        });
        await this.hydratePlaidLedgerTxCounts();
        return;
      }
      const instName = this.institutionDisplayName(row);
      const removesWholeLink =
        this.disconnectingWouldRemoveEntireInstitution(row, acc);
      const ok = (await showDialog({
        type: 'warning',
        title: removesWholeLink
          ? t`Delete account and disconnect bank from Plaid?`
          : t`Delete this account?`,
        detail: removesWholeLink
          ? t`This removes "${accountName}" from your books. It is the last sub-account still syncing under ${instName}, so LiveBooks will also disconnect the entire institution from Plaid until you connect the bank again.`
          : t`This removes "${accountName}" from your books and pauses automatic imports for this Plaid sub-account. Other linked accounts under ${instName} can keep syncing.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: removesWholeLink
              ? t`Delete and disconnect institution`
              : t`Delete account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const disc = await disconnectPlaidAccountFeedLocalAndRemote(
        this.bookId,
        row.item_id,
        acc.account_id,
        { promptTotp: () => this.plaidMfaPromptTotp() }
      );
      if (!disc.ok) {
        showToast({ type: 'error', message: disc.error });
        return;
      }
      const del = await deleteEmptyBankAccount(accountName);
      if (!del.ok) {
        showToast({ type: 'error', message: del.error });
        await this.loadChartBankAccountsForMaps();
        await this.refreshFeeds(false);
        await this.loadManualSection();
        return;
      }
      showToast({
        type: 'success',
        message: disc.itemRemoved
          ? t`Account deleted and bank institution disconnected from Plaid.`
          : t`Account deleted. Other accounts at this bank may keep syncing.`,
      });
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async confirmArchivePlaidMappedAccount(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow,
      accountName: string
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`,
        });
        return;
      }
      const n = await countLedgerRowsForAccount(accountName);
      if (n === 0) {
        showToast({
          type: 'info',
          message: t`This account has no ledger history — use Delete account instead.`,
        });
        await this.hydratePlaidLedgerTxCounts();
        return;
      }
      const instName = this.institutionDisplayName(row);
      const removesWholeLink =
        this.disconnectingWouldRemoveEntireInstitution(row, acc);
      const bal = await ledgerSignedBalanceForAccount(accountName);
      const detail = removesWholeLink
        ? t`Archiving hides "${accountName}" from your daily bank feeds and most pickers, but keeps your historical reports accurate. Unreviewed feed lines for this account will be marked excluded. This is the last sub-account still syncing under ${instName}; archiving will also disconnect the entire institution from Plaid until you connect the bank again.`
        : t`Archiving hides "${accountName}" from your daily bank feeds and most pickers, but keeps your historical reports accurate. Unreviewed feed lines for this account will be marked excluded. Automatic imports for this Plaid sub-account stop; other linked accounts under ${instName} can keep syncing.`;
      const detailEmphasis =
        bal != null && Math.abs(bal) > 0.005
          ? t`Note: This account still has a ${fyo.format(
              bal,
              'Currency'
            )} balance in your books. You may want to record a transfer to your new bank before archiving.`
          : undefined;
      const ok = (await showDialog({
        type: 'warning',
        title: removesWholeLink
          ? t`Archive account and disconnect bank from Plaid?`
          : t`Archive this account?`,
        detail,
        detailEmphasis,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: removesWholeLink
              ? t`Archive and disconnect institution`
              : t`Archive account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const disc = await disconnectPlaidAccountFeedLocalAndRemote(
        this.bookId,
        row.item_id,
        acc.account_id,
        { promptTotp: () => this.plaidMfaPromptTotp() }
      );
      if (!disc.ok) {
        showToast({ type: 'error', message: disc.error });
        return;
      }
      const ar = await archiveBankAccount(accountName);
      if (!ar.ok) {
        showToast({ type: 'error', message: ar.error });
        await this.loadChartBankAccountsForMaps();
        await this.refreshFeeds(false);
        await this.loadManualSection();
        return;
      }
      showToast({
        type: 'success',
        message: disc.itemRemoved
          ? t`Account archived and bank institution disconnected from Plaid.`
          : t`Account archived. Other accounts at this bank may keep syncing.`,
      });
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async confirmDeleteManualBank(accountName: string) {
      const n = await countLedgerRowsForAccount(accountName);
      if (n > 0) {
        showToast({
          type: 'error',
          message: t`This account has ledger history and cannot be deleted. Archive it instead.`,
        });
        await this.loadManualSection({ quiet: true });
        return;
      }
      const ok = (await showDialog({
        type: 'warning',
        title: t`Delete this account?`,
        detail: t`This permanently removes "${accountName}" and its manual feed data from your books.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: t`Delete account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const del = await deleteEmptyBankAccount(accountName);
      if (!del.ok) {
        showToast({ type: 'error', message: del.error });
        return;
      }
      showToast({ type: 'success', message: t`Account deleted.` });
      await this.loadChartBankAccountsForMaps();
      await this.loadManualSection();
    },
    async hydrateMappingsForItem(itemId: string) {
      const maps = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
        filters: { plaidItemId: itemId },
        fields: ['plaidAccountId', 'chartAccount'],
      })) as { plaidAccountId: string; chartAccount: string }[];
      const nextSel = { ...this.chartSelections };
      const nextRes = { ...this.resolvedChartByPlaid };
      for (const m of maps) {
        const k = this.selKey(itemId, m.plaidAccountId);
        nextSel[k] = m.chartAccount;
        nextRes[k] = m.chartAccount;
      }
      this.chartSelections = nextSel;
      this.resolvedChartByPlaid = nextRes;
    },
    async loadLinkedAccountsForItem(itemId: string) {
      if (!this.bookId) {
        return;
      }
      this.linkedAccountsLoading = {
        ...this.linkedAccountsLoading,
        [itemId]: true,
      };
      this.linkedAccountsError = { ...this.linkedAccountsError, [itemId]: '' };
      const { accounts, error } = await fetchPlaidLinkedAccounts(
        this.bookId,
        itemId
      );
      this.linkedAccountsLoading = {
        ...this.linkedAccountsLoading,
        [itemId]: false,
      };
      this.linkedAccountsFetched = {
        ...this.linkedAccountsFetched,
        [itemId]: true,
      };
      if (error) {
        this.linkedAccountsError = {
          ...this.linkedAccountsError,
          [itemId]: error,
        };
        this.linkedAccountsByItem = {
          ...this.linkedAccountsByItem,
          [itemId]: [],
        };
        return;
      }
      this.linkedAccountsByItem = {
        ...this.linkedAccountsByItem,
        [itemId]: accounts,
      };
      await this.hydrateMappingsForItem(itemId);
    },
    selKey(itemId: string, plaidAccountId: string) {
      return `${itemId}\x1f${plaidAccountId}`;
    },
    labelForPlaid(acc: PlaidLinkedAccountRow) {
      return formatPlaidLinkedRowLabel(acc);
    },
    /**
     * Returns the saved PlaidBankAccountMap row that already claims `chartName`,
     * if any, *excluding* the row owned by `(itemId, plaidAccountId)`. Used to
     * enforce the 1:1 rule between a ledger account and a Plaid sub-account.
     */
    chartAccountOwnerOther(
      itemId: string,
      plaidAccountId: string,
      chartName: string
    ): PlaidMapRow | null {
      if (!chartName) {
        return null;
      }
      for (const m of this.manualPlaidMaps) {
        if (m.chartAccount !== chartName) {
          continue;
        }
        if (m.plaidItemId === itemId && m.plaidAccountId === plaidAccountId) {
          continue;
        }
        return m;
      }
      return null;
    },
    isChartAccountTakenByOther(
      itemId: string,
      plaidAccountId: string,
      chartName: string
    ): boolean {
      return this.chartAccountOwnerOther(itemId, plaidAccountId, chartName) !== null;
    },
    chartOptionLabel(
      itemId: string,
      plaidAccountId: string,
      chartName: string
    ): string {
      const coa = this.chartBankAccounts.find((c) => c.name === chartName);
      const label = coa ? accountDisplayName(coa) : chartName;
      const owner = this.chartAccountOwnerOther(itemId, plaidAccountId, chartName);
      if (!owner) {
        return label;
      }
      const ownerLabel = owner.plaidDisplayLabel || owner.plaidAccountId;
      return t`${label} — already mapped to ${ownerLabel}`;
    },
    async savePlaidMapping(itemId: string, acc: PlaidLinkedAccountRow) {
      const row = this.feedItems.find((r) => r.item_id === itemId);
      if (row && this.isPlaidAccountFeedDisconnected(row, acc)) {
        showToast({
          type: 'error',
          message: t`Reactivate this feed before saving or changing the mapping.`,
        });
        return;
      }
      const key = this.selKey(itemId, acc.account_id);
      const chart = this.chartSelections[key];
      if (!chart) {
        showToast({
          type: 'error',
          message: t`Choose a chart of accounts bank account before saving.`,
        });
        return;
      }
      const conflicting = (await fyo.db.getAll(
        ModelNameEnum.PlaidBankAccountMap,
        {
          filters: { chartAccount: chart },
          fields: ['plaidItemId', 'plaidAccountId', 'plaidDisplayLabel'],
        }
      )) as {
        plaidItemId: string;
        plaidAccountId: string;
        plaidDisplayLabel?: string;
      }[];
      const conflict = conflicting.find(
        (r) =>
          !(r.plaidItemId === itemId && r.plaidAccountId === acc.account_id)
      );
      if (conflict) {
        const ownerLabel =
          conflict.plaidDisplayLabel || conflict.plaidAccountId;
        showToast({
          type: 'error',
          message: t`"${chart}" is already mapped to Plaid account ${ownerLabel}. Each ledger account can only be linked to one Plaid sub-account — pick a different ledger or unmap the other Plaid account first.`,
        });
        return;
      }
      const label = formatPlaidLinkedRowLabel(acc);
      const existing = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
        filters: { plaidItemId: itemId, plaidAccountId: acc.account_id },
        fields: ['name'],
        limit: 1,
      })) as { name: string }[];
      try {
        if (existing.length > 0) {
          const doc = await fyo.doc.getDoc(
            ModelNameEnum.PlaidBankAccountMap,
            existing[0].name
          );
          await doc.set('chartAccount', chart);
          await doc.set('plaidDisplayLabel', label);
          await doc.sync();
        } else {
          const doc = fyo.doc.getNewDoc(ModelNameEnum.PlaidBankAccountMap);
          await doc.set('plaidItemId', itemId);
          await doc.set('plaidAccountId', acc.account_id);
          await doc.set('plaidDisplayLabel', label);
          await doc.set('chartAccount', chart);
          await doc.sync();
        }
        this.resolvedChartByPlaid = {
          ...this.resolvedChartByPlaid,
          [key]: chart,
        };
        this.manualPlaidMaps = await loadPlaidAccountMaps();
        await this.loadManualSection({ quiet: true });
        await this.hydratePlaidLedgerTxCounts();
        showToast({ type: 'success', message: t`Mapping saved.` });
        const en = await enablePlaidAccountFeed(
          this.bookId,
          itemId,
          acc.account_id,
          { promptTotp: () => this.plaidMfaPromptTotp() }
        );
        if (!en.ok) {
          showToast({
            type: 'warning',
            message: en.error ?? t`The cloud could not resume automatic imports for this account (use Refresh for this institution).`,
          });
        }
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      }
    },
    async linkBankWithPlaid(itemId?: string) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`,
        });
        return;
      }
      if (this.plaidLinkBusy) {
        return;
      }
      const bookId = this.bookId;
      this.plaidLinkBusy = true;
      try {
        const { linkToken, error: tokenErr, mfaNotConfigured } =
          await requestPlaidLinkTokenWithStepUp(bookId, {
            itemId,
            promptTotp: () => this.plaidLinkPromptTotp(),
          });
        if (mfaNotConfigured) {
          showToast({
            type: 'warning',
            message: t`Set up two-factor authentication on LiveBooks Cloud before linking a bank.`,
            duration: 'long',
          });
          openLivebooksCloudAccountSecurity();
          return;
        }
        if (tokenErr || !linkToken) {
          showToast({
            type: 'error',
            message: tokenErr ?? t`Could not start Plaid Link.`,
          });
          return;
        }
        await openPlaidLinkModal({
          linkToken,
          onSuccess: async (publicToken) => {
            const ex = await exchangePlaidPublicTokenWithStepUp(
              bookId,
              publicToken,
              { promptTotp: () => this.plaidLinkPromptTotp() }
            );
            if (ex.mfaNotConfigured) {
              openLivebooksCloudAccountSecurity();
              throw new Error(
                ex.error ??
                  t`Set up two-factor authentication on LiveBooks Cloud first.`
              );
            }
            if (!ex.ok) {
              throw new Error(ex.error ?? t`Could not save bank connection.`);
            }
            showToast({
              type: 'success',
              message: t`Bank linked. Accounts will appear below after a short sync.`,
            });
            await this.refreshFeeds(false);
            await this.prefetchLinkedForAllItems();
          },
        });
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      } finally {
        this.plaidLinkBusy = false;
      }
    },
    goUploadCsv() {
      void routeTo({ path: '/import-wizard', query: { type: 'Payment' } });
    },
    async loadManualSection(opts?: { quiet?: boolean }) {
      if (!opts?.quiet) {
        this.manualLoading = true;
      }
      try {
        this.manualPlaidMaps = await loadPlaidAccountMaps();
        this.manualBankCoaAccounts = await loadAllBankCoaAccounts();
        const reviewCounts: Record<string, number> = {};
        const ledgerCounts: Record<string, number> = {};
        for (const a of this.manualBankCoaAccounts) {
          if (!isManualBankAccount(a.name, this.manualPlaidMaps)) {
            continue;
          }
          try {
            reviewCounts[a.name] = await manualPendingCountFor(a.name);
          } catch {
            reviewCounts[a.name] = 0;
          }
          try {
            ledgerCounts[a.name] = await countLedgerRowsForAccount(a.name);
          } catch {
            ledgerCounts[a.name] = 0;
          }
        }
        this.manualToReviewCounts = reviewCounts;
        this.manualLedgerRowCounts = ledgerCounts;
        await this.loadTotalsByAccount();
      } finally {
        if (!opts?.quiet) {
          this.manualLoading = false;
        }
      }
    },
    openManualPanel() {
      this.manualForm = {
        kind: 'bank',
        accountName: '',
        openingBalance: '0',
        openingDate: todayIsoDate(),
      };
      this.manualNameError = '';
      this.manualPanelOpen = true;
      void nextTick(() => {
        const el = this.$refs.manualNameInput as HTMLInputElement | undefined;
        if (el && typeof el.focus === 'function') {
          el.focus();
        }
      });
    },
    closeManualPanel() {
      if (this.manualSaving) {
        return;
      }
      this.manualPanelOpen = false;
      this.manualNameError = '';
    },
    openManualActivity(accountName: string) {
      void routeTo(
        `/bank-feeds/activity/${encodeURIComponent(accountName)}`
      );
    },
    async trySaveManual() {
      if (!this.canSaveManual || this.manualSaving) {
        return;
      }
      const name = this.manualForm.accountName.trim();
      this.manualNameError = '';
      try {
        const exists = await fyo.db.exists(ModelNameEnum.Account, name);
        if (exists) {
          this.manualNameError = t`An account with this name already exists.`;
          return;
        }
      } catch {
        // If the existence check fails for any reason, fall through; the
        // sync below will surface the duplicate error in a toast.
      }
      this.manualSaving = true;
      let createdAccountName: string | null = null;
      try {
        const isCreditCard = this.manualForm.kind === 'credit_card';
        const rootType = isCreditCard ? 'Liability' : 'Asset';
        const fallbacks = isCreditCard
          ? CREDIT_CARD_PARENT_FALLBACKS
          : MANUAL_BANK_PARENT_FALLBACKS;
        const parentAccount = await this.resolveAccountParent(
          rootType,
          fallbacks
        );
        const accountDoc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
          name,
          parentAccount: parentAccount ?? undefined,
          isGroup: false,
          rootType,
          accountType: AccountTypeEnum.Bank,
        });
        await accountDoc.sync();
        createdAccountName = name;

        const balance = this.manualBalanceFloat ?? 0;
        if (balance !== 0) {
          try {
            await this.postOpeningEntry({
              accountName: name,
              kind: this.manualForm.kind,
              amount: Math.abs(balance),
              isNegative: balance < 0,
              date: this.manualForm.openingDate,
            });
          } catch (e) {
            const msg = (e as Error).message;
            showToast({
              type: 'error',
              message: t`Bank account created, but the opening balance could not be posted: ${msg}`,
            });
          }
        }

        showToast({
          type: 'success',
          message: t`Manual bank added.`,
        });
        this.manualPanelOpen = false;
        await this.loadManualSection();
        this.openManualActivity(name);
      } catch (e) {
        showToast({
          type: 'error',
          message: createdAccountName
            ? (e as Error).message
            : t`Couldn't save the bank account. Please try again.`,
        });
      } finally {
        this.manualSaving = false;
      }
    },
    async resolveAccountParent(
      rootType: 'Asset' | 'Liability',
      preferredNames: string[]
    ): Promise<string | null> {
      for (const candidate of preferredNames) {
        try {
          const ok = fyo.db.exists(ModelNameEnum.Account, candidate);
          if (ok) {
            return candidate;
          }
        } catch {
          // Continue searching.
        }
      }
      try {
        const groups = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name'],
          filters: { rootType, isGroup: true },
          limit: 1,
        })) as { name: string }[];
        if (groups.length > 0) {
          return groups[0].name;
        }
      } catch {
        // Fall through to returning null.
      }
      return null;
    },
    async resolveOpeningEquityAccount(): Promise<string> {
      try {
        const ok = await fyo.db.exists(
          ModelNameEnum.Account,
          OPENING_BALANCE_EQUITY_NAME
        );
        if (ok) {
          return OPENING_BALANCE_EQUITY_NAME;
        }
      } catch {
        // Fall through.
      }
      try {
        const equityAccounts = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name'],
          filters: {
            accountType: AccountTypeEnum.Equity,
            isGroup: false,
          },
          limit: 1,
        })) as { name: string }[];
        if (equityAccounts.length > 0) {
          return equityAccounts[0].name;
        }
      } catch {
        // Fall through to creating one.
      }
      const equityParent = await this.resolveAccountParent('Equity', [
        'Equity',
      ]);
      const created = fyo.doc.getNewDoc(ModelNameEnum.Account, {
        name: OPENING_BALANCE_EQUITY_NAME,
        parentAccount: equityParent ?? undefined,
        isGroup: false,
        rootType: 'Equity',
        accountType: AccountTypeEnum.Equity,
      });
      await created.sync();
      return OPENING_BALANCE_EQUITY_NAME;
    },
    async postOpeningEntry(opts: {
      accountName: string;
      kind: 'bank' | 'credit_card';
      amount: number;
      isNegative: boolean;
      date: string;
    }) {
      const equityAccount = await this.resolveOpeningEquityAccount();
      const entryType = opts.kind === 'credit_card' ? 'Credit Card Entry' : 'Bank Entry';
      const jvDoc = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
        entryType,
        date: opts.date,
      });
      const debitFirst =
        opts.kind === 'bank' ? !opts.isNegative : opts.isNegative;
      const amount = fyo.pesa(opts.amount);
      const zero = fyo.pesa(0);
      if (debitFirst) {
        await jvDoc.append('accounts', {
          account: opts.accountName,
          debit: amount,
          credit: zero,
        });
        await jvDoc.append('accounts', {
          account: equityAccount,
          debit: zero,
          credit: amount,
        });
      } else {
        await jvDoc.append('accounts', {
          account: opts.accountName,
          debit: zero,
          credit: amount,
        });
        await jvDoc.append('accounts', {
          account: equityAccount,
          debit: amount,
          credit: zero,
        });
      }
      const synced = await jvDoc.sync();
      await synced.submit();
    },
  },
});
</script>
