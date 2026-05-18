<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Bank Feed`">
      <Button type="secondary" @click="goSettings">{{ t`Settings` }}</Button>
    </PageHeader>
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

      <PlaidBankSyncMfaBanner @verified="onBankSyncMfaVerified" />

      <div
        v-if="accountsLoading || feedsLoading"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        {{ t`Loading accounts…` }}
      </div>
      <div v-else class="space-y-6">
        <div
          v-for="bank in bankTables"
          :key="bank.itemId"
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
              {{
                bank.bankName
              }}
              <span
                v-if="bank.health"
                class="inline-block w-2 h-2 rounded-full ms-2 align-middle"
                :class="{
                  'bg-emerald-500': bank.health === 'ok',
                  'bg-amber-500': bank.health === 'stale',
                  'bg-red-500': bank.health === 'broken',
                }"
                :title="
                  bank.health === 'ok'
                    ? t`Connection healthy`
                    : bank.health === 'stale'
                    ? t`No recent sync from your bank.`
                    : t`Connection broken — sign in again.`
                "
              />
              <span
                v-if="bank.kind === 'plaid' && bank.pendingAtBank > 0"
                class="
                  ms-2
                  text-xs
                  px-1.5
                  py-0.5
                  rounded
                  bg-blue-100
                  dark:bg-blue-900/40
                  text-blue-700
                  dark:text-blue-100
                  align-middle
                "
                :title="
                  t`Transactions Plaid sent us that are still pending at the bank. They'll arrive once they post.`
                "
              >
                {{ t`${bank.pendingAtBank} pending at bank` }}
              </span>
            </caption>
            <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
              <tr>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Bank account name` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Bank account balance` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Last sync` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`To review` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Ledger name` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Ledger balance` }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in bank.rows"
                :key="row.bankAccountId"
                class="
                  cursor-pointer
                  hover:bg-gray-50
                  dark:hover:bg-gray-800/80
                  border-b
                  dark:border-gray-800
                  last:border-0
                "
                @click="
                  row.ledgerName ? openActivity(row.ledgerName) : undefined
                "
              >
                <td class="p-3 text-start font-medium">
                  {{ row.bankAccountName }}
                </td>
                <td class="p-3 text-start tabular-nums">
                  {{ row.bankBalanceLabel ?? t`—` }}
                </td>
                <td class="p-3 text-start text-gray-600 dark:text-gray-400">
                  {{ row.lastSyncLabel || t`—` }}
                </td>
                <td class="p-3 text-start">
                  <span
                    v-if="row.toReviewCount > 0"
                    class="
                      text-xs
                      font-medium
                      px-2
                      py-0.5
                      rounded-full
                      bg-amber-100
                      text-amber-900
                      dark:bg-amber-900/40 dark:text-amber-100
                    "
                  >
                    {{ row.toReviewCount }}
                  </span>
                  <span v-else class="text-gray-500">0</span>
                </td>
                <td class="p-3 text-start">
                  {{ row.ledgerAccountLabel ?? t`—` }}
                </td>
                <td class="p-3 text-start tabular-nums">
                  {{ row.ledgerBalanceLabel ?? t`—` }}
                </td>
              </tr>
              <tr v-if="bank.rows.length === 0">
                <td
                  class="p-3 text-sm text-gray-600 dark:text-gray-400"
                  colspan="6"
                >
                  {{ t`No bank accounts were returned for this connection.` }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
  openLivebooksCloudAccountSecurity,
} from 'src/utils/livebooksCloud';
import { promptTotpCode } from 'src/utils/promptTotpCode';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  exchangePlaidPublicToken,
  requestPlaidLinkToken,
} from 'src/utils/plaidLinkApi';
import { openPlaidLinkModal } from 'src/utils/plaidLinkClient';
import {
  feedItemById,
  isManualBankAccount,
  loadAllBankCoaAccounts,
  loadPlaidAccountMaps,
  manualPendingCountFor,
  type BankCoaAccount,
  type PlaidMapRow,
} from 'src/utils/bankFeedHelpers';
import {
  ackImportBatch,
  fetchImportBatchPayload,
  fetchPendingImportBatches,
  fetchPlaidFeedsWithStepUp,
  type ImportBatchListRow,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import {
  ensureNotificationPermission,
  notifyNewBatches,
} from 'src/utils/desktopNotifications';
import {
  fetchPlaidLinkedAccounts,
  formatPlaidAccountLabel as formatPlaidLinkedRowLabel,
  type PlaidLinkedAccountRow,
} from 'src/utils/plaidLinkedAccountsApi';
import PlaidBankSyncMfaBanner from 'src/components/PlaidBankSyncMfaBanner.vue';
import { isBankSyncMfaPaused } from 'src/utils/plaidBankSyncMfaGate';
import { routeTo } from 'src/utils/ui';
import { isCredit } from 'models/helpers';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import { accountDisplayName } from 'utils/accountDisplay';
import { defineComponent } from 'vue';

type TxRow = {
  date?: string;
  amount?: string;
  currency?: string;
  name?: string;
  account_id?: string;
};

type PreviewState = {
  loading: boolean;
  error?: string;
  rows?: TxRow[];
};

type BankTableRow = {
  bankAccountId: string;
  bankAccountName: string;
  bankBalanceLabel: string | null;
  lastSyncLabel: string | null;
  toReviewCount: number;
  ledgerName: string | null;
  ledgerAccountLabel: string | null;
  ledgerBalanceLabel: string | null;
};

type BankTable = {
  itemId: string;
  bankName: string;
  lastSyncLabel: string | null;
  loginRequired: boolean;
  pendingAtBank: number;
  health: 'ok' | 'stale' | 'broken' | null;
  rows: BankTableRow[];
  kind: 'plaid' | 'manual';
};

export default defineComponent({
  name: 'BankFeedHub',
  components: { PageHeader, Button, PlaidBankSyncMfaBanner },
  data() {
    return {
      bookId: '' as string,
      bookError: '' as string,
      plaidLinkBusy: false,
      feedsLoading: false,
      feedsError: '' as string,
      feedItems: [] as PlaidFeedItemRow[],
      feedsEtag: undefined as string | undefined,
      expandedItemId: null as string | null,
      batchesForExpanded: [] as ImportBatchListRow[],
      batchListLoading: false,
      batchListError: '' as string,
      previewByBatch: {} as Record<string, PreviewState>,
      pollTimer: null as ReturnType<typeof setTimeout> | null,
      boundVisibility: null as (() => void) | null,
      boundCloudSessionRefresh: null as (() => void) | null,
      lastPendingByItem: {} as Record<string, number>,
      notificationPermissionRequested: false,
      chartBankAccounts: [] as {
        name: string;
        accountName?: string;
        rootType?: string;
      }[],
      manualBankAccounts: [] as BankCoaAccount[],
      toReviewByAccount: {} as Record<string, number>,
      linkedAccountsByItem: {} as Record<string, PlaidLinkedAccountRow[]>,
      linkedAccountsError: {} as Record<string, string>,
      linkedAccountsLoading: {} as Record<string, boolean>,
      linkedAccountsFetched: {} as Record<string, boolean>,
      // Last server-known feed_version per Plaid item; we use this to skip
      // /accounts/get refetches when nothing has changed for a given item.
      lastFeedVersionByItem: {} as Record<string, number>,
      chartSelections: {} as Record<string, string>,
      resolvedChartByPlaid: {} as Record<string, string>,
      plaidMapsFlat: [] as PlaidMapRow[],
      totalsByAccount: {} as Record<
        string,
        { totalDebit: number; totalCredit: number }
      >,
      accountsLoading: false,
    };
  },
  computed: {
    pollIntervalMs(): number {
      const any =
        this.feedItems.some(
          (i) =>
            i.pending_import_batches_count > 0 || i.sync_suggested === true
        ) ?? false;
      return any ? 30_000 : 90_000;
    },
    feedByItem(): Record<string, PlaidFeedItemRow> {
      return feedItemById(this.feedItems);
    },
    ledgerByName(): Record<
      string,
      { rootType?: string; accountName?: string }
    > {
      const out: Record<string, { rootType?: string; accountName?: string }> =
        {};
      for (const a of this.chartBankAccounts) {
        out[a.name] = { rootType: a.rootType, accountName: a.accountName };
      }
      for (const a of this.manualBankAccounts) {
        out[a.name] = { rootType: a.rootType, accountName: a.accountName };
      }
      return out;
    },
    bankTables(): BankTable[] {
      const tables: BankTable[] = [];
      for (const it of this.feedItems) {
        const bankName =
          (it.institution_name && it.institution_name.trim()) || it.item_id;
        const lastSyncLabel = this.formatLocalTimestamp(it.last_sync_at);
        const linked = this.linkedAccountsByItem[it.item_id] ?? [];
        const rows: BankTableRow[] = linked.map((acc) => {
          const bankBalanceLabel = this.formatBankBalance(acc);
          const ledgerName = this.ledgerNameForPlaidAccount(
            it.item_id,
            acc.account_id
          );
          const toReviewCount = ledgerName
            ? this.toReviewByAccount[ledgerName] ?? 0
            : 0;
          const ledgerRootType = ledgerName ? this.ledgerByName[ledgerName]?.rootType : undefined;
          const ledgerBalanceLabel = ledgerName
            ? this.balanceFor(ledgerName, ledgerRootType)
            : null;
          return {
            bankAccountId: acc.account_id,
            bankAccountName: formatPlaidLinkedRowLabel(acc),
            bankBalanceLabel,
            lastSyncLabel,
            toReviewCount,
            ledgerName,
            ledgerAccountLabel: ledgerName
              ? accountDisplayName({
                name: ledgerName,
                accountName: this.ledgerByName[ledgerName]?.accountName,
              })
              : null,
            ledgerBalanceLabel,
          };
        });
        rows.sort((a, b) => a.bankAccountName.localeCompare(b.bankAccountName));
        tables.push({
          itemId: it.item_id,
          bankName,
          lastSyncLabel,
          loginRequired: it.item_login_required === true,
          pendingAtBank: it.last_pending_dropped_count ?? 0,
          health: it.health ?? null,
          rows,
          kind: 'plaid',
        });
      }
      const manualRows: BankTableRow[] = [];
      for (const acc of this.manualBankAccounts) {
        const ledgerRootType = this.ledgerByName[acc.name]?.rootType;
        manualRows.push({
          bankAccountId: acc.name,
          bankAccountName: accountDisplayName(acc),
          bankBalanceLabel: null,
          lastSyncLabel: null,
          toReviewCount: this.toReviewByAccount[acc.name] ?? 0,
          ledgerName: acc.name,
          ledgerAccountLabel: accountDisplayName(acc),
          ledgerBalanceLabel: this.balanceFor(acc.name, ledgerRootType),
        });
      }
      manualRows.sort((a, b) =>
        a.bankAccountName.localeCompare(b.bankAccountName)
      );
      if (manualRows.length > 0) {
        tables.push({
          itemId: 'manual',
          bankName: t`Manual Banks`,
          lastSyncLabel: null,
          loginRequired: false,
          pendingAtBank: 0,
          health: null,
          rows: manualRows,
          kind: 'manual',
        });
      }
      tables.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'plaid' ? -1 : 1;
        }
        return a.bankName.localeCompare(b.bankName);
      });
      return tables;
    },
  },
  mounted() {
    void this.bootstrapAccounts();
    void this.bootstrapFeeds();
    this.boundVisibility = () => {
      this.onVisibility();
    };
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.boundCloudSessionRefresh = () => {
      this.clearPoll();
      void this.bootstrapAccounts();
      void this.bootstrapFeeds();
    };
    document.addEventListener(
      LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
      this.boundCloudSessionRefresh
    );
  },
  beforeUnmount() {
    if (this.boundVisibility) {
      document.removeEventListener('visibilitychange', this.boundVisibility);
    }
    if (this.boundCloudSessionRefresh) {
      document.removeEventListener(
        LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
        this.boundCloudSessionRefresh
      );
    }
    this.clearPoll();
  },
  methods: {
    t,
    goSettings() {
      void routeTo('/bank-feeds/settings');
    },
    async bootstrapAccounts() {
      this.accountsLoading = true;
      try {
        this.plaidMapsFlat = await loadPlaidAccountMaps();
        const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'accountName', 'rootType'],
          filters: {
            accountType: AccountTypeEnum.Bank,
            isGroup: false,
            disabled: false,
          },
        })) as { name: string; rootType?: string }[];
        this.chartBankAccounts = rows;
        const totals = await fyo.db.getTotalCreditAndDebit();
        const map: Record<string, { totalDebit: number; totalCredit: number }> =
          {};
        for (const row of totals) {
          const acc = row.account;
          map[acc] = {
            totalDebit: Number(row.totalDebit ?? 0),
            totalCredit: Number(row.totalCredit ?? 0),
          };
        }
        this.totalsByAccount = map;
        await this.loadManualSection();
      } finally {
        this.accountsLoading = false;
      }
    },
    async loadManualSection() {
      const all = await loadAllBankCoaAccounts();
      const manual = all.filter((a) =>
        isManualBankAccount(a.name, this.plaidMapsFlat)
      );
      this.manualBankAccounts = manual;
      const counts: Record<string, number> = {};
      for (const a of all) {
        try {
          counts[a.name] = await manualPendingCountFor(a.name);
        } catch {
          counts[a.name] = 0;
        }
      }
      this.toReviewByAccount = counts;
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
    openActivity(accountName: string) {
      void routeTo(
        `/bank-feeds/activity/${encodeURIComponent(accountName)}`
      );
    },
    async promptPlaidTotp(): Promise<string | null> {
      return await promptTotpCode({
        title: t`Authenticator code`,
        detail: t`Enter your LiveBooks Cloud authenticator or backup code to link a bank account.`,
      });
    },
    async requestLinkTokenWithStepUp(
      bookId: string,
      itemId?: string
    ): Promise<{ linkToken?: string; error?: string; totpCode?: string }> {
      let totpCode: string | undefined;
      let res = await requestPlaidLinkToken(
        bookId,
        itemId ? { itemId } : undefined
      );
      if (res.mfaNotConfigured) {
        showToast({
          type: 'warning',
          message: t`Set up two-factor authentication on LiveBooks Cloud before linking a bank.`,
          duration: 'long',
        });
        openLivebooksCloudAccountSecurity();
        return { error: res.error };
      }
      if (res.needsTotp) {
        const code = await this.promptPlaidTotp();
        if (!code) {
          return { error: t`Authenticator code required.` };
        }
        totpCode = code;
        res = await requestPlaidLinkToken(bookId, {
          ...(itemId ? { itemId } : {}),
          totpCode,
        });
      }
      if (res.error || !res.linkToken) {
        return { error: res.error ?? t`Could not start Plaid Link.` };
      }
      return { linkToken: res.linkToken, totpCode };
    },
    async linkBankWithPlaid(itemId?: string) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: this.msgSignInCloud(),
        });
        return;
      }
      if (this.plaidLinkBusy) {
        return;
      }
      const bookId = this.bookId;
      this.plaidLinkBusy = true;
      try {
        const { linkToken, error: tokenErr, totpCode } =
          await this.requestLinkTokenWithStepUp(
            bookId,
            itemId
          );
        if (tokenErr || !linkToken) {
          showToast({
            type: 'error',
            message: tokenErr ?? t`Could not start Plaid Link.`,
          });
          return;
        }
        let plaidTotp = totpCode;
        const outcome = await openPlaidLinkModal({
          linkToken,
          onSuccess: async (publicToken) => {
            let ex = await exchangePlaidPublicToken(
              bookId,
              publicToken,
              plaidTotp
            );
            if (ex.mfaNotConfigured) {
              openLivebooksCloudAccountSecurity();
              throw new Error(
                ex.error ??
                  t`Set up two-factor authentication on LiveBooks Cloud first.`
              );
            }
            if (ex.needsTotp) {
              const code = await this.promptPlaidTotp();
              if (!code) {
                throw new Error(t`Authenticator code required.`);
              }
              plaidTotp = code;
              ex = await exchangePlaidPublicToken(
                bookId,
                publicToken,
                plaidTotp
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
            await this.bootstrapAccounts();
          },
        });
        if (outcome === 'exit') {
          /* user closed Plaid without finishing */
        }
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      } finally {
        this.plaidLinkBusy = false;
      }
    },
    msgSignInCloud() {
      return t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`;
    },
    msgCloudBookResolve() {
      return t`Could not resolve your cloud book for this company file.`;
    },
    msgEmptyPayload() {
      return t`Empty payload`;
    },
    msgAckFailed() {
      return t`Ack failed`;
    },
    msgNotMapped() {
      return t`Not mapped`;
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
    ledgerNameForPlaidAccount(itemId: string, plaidAccountId: string): string | null {
      const k = this.selKey(itemId, plaidAccountId);
      const mapped = this.resolvedChartByPlaid[k];
      if (mapped) {
        return mapped;
      }
      const fallback = this.plaidMapsFlat.find(
        (m) => m.plaidItemId === itemId && m.plaidAccountId === plaidAccountId
      )?.chartAccount;
      return fallback ?? null;
    },
    selKey(itemId: string, plaidAccountId: string) {
      return `${itemId}\x1f${plaidAccountId}`;
    },
    labelForPlaid(acc: PlaidLinkedAccountRow) {
      return formatPlaidLinkedRowLabel(acc);
    },
    chartAccountForTx(tx: TxRow): string {
      if (!this.expandedItemId || !tx.account_id) {
        return '—';
      }
      const k = this.selKey(this.expandedItemId, tx.account_id);
      return this.resolvedChartByPlaid[k] ?? this.msgNotMapped();
    },
    async loadChartBankAccountsForMaps() {
      this.chartBankAccounts = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'rootType'],
        filters: {
          accountType: AccountTypeEnum.Bank,
          isGroup: false,
          disabled: false,
        },
      })) as { name: string; rootType?: string }[];
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
    async prefetchLinkedForAllItems() {
      // Only fetch /accounts/get for items whose feed_version has changed since
      // we last fetched them (or that have never been fetched). This keeps idle
      // polling cheap once everything is steady-state.
      const targets = this.feedItems.filter((r) => {
        if (r.item_login_required) {
          return false;
        }
        const lastVersion = this.lastFeedVersionByItem[r.item_id];
        const currentVersion = r.feed_version ?? 0;
        if (lastVersion === undefined) {
          return true;
        }
        return lastVersion !== currentVersion;
      });

      const stillKnown = new Set(this.feedItems.map((r) => r.item_id));
      for (const id of Object.keys(this.linkedAccountsByItem)) {
        if (!stillKnown.has(id)) {
          delete this.linkedAccountsByItem[id];
          delete this.linkedAccountsError[id];
          delete this.linkedAccountsLoading[id];
          delete this.linkedAccountsFetched[id];
          delete this.lastFeedVersionByItem[id];
        }
      }

      await Promise.all(
        targets.map(async (r) => {
          await this.loadLinkedAccountsForItem(r.item_id);
          this.lastFeedVersionByItem = {
            ...this.lastFeedVersionByItem,
            [r.item_id]: r.feed_version ?? 0,
          };
        })
      );
    },
    async savePlaidMapping(itemId: string, acc: PlaidLinkedAccountRow) {
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
          message: t`"${chart}" is already mapped to Plaid account ${ownerLabel}. Each ledger account can only be linked to one Plaid sub-account.`,
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
        this.plaidMapsFlat = await loadPlaidAccountMaps();
        showToast({ type: 'success', message: t`Mapping saved.` });
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      }
    },
    onVisibility() {
      if (!document.hidden) {
        void this.refreshFeeds(false);
      }
    },
    clearPoll() {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
    },
    schedulePoll() {
      this.clearPoll();
      this.pollTimer = setTimeout(() => {
        if (!document.hidden && !isBankSyncMfaPaused()) {
          void this.refreshFeeds(true);
        }
        this.schedulePoll();
      }, this.pollIntervalMs);
    },
    onBankSyncMfaVerified() {
      void this.refreshFeeds(false);
    },
    async bootstrapFeeds() {
      const ctx = await ensureLivebooksCloudBookId(fyo);
      if (!ctx.ok) {
        if (ctx.reason === 'not_signed_in') {
          this.bookId = '';
          this.bookError = this.msgSignInCloud();
        } else {
          this.bookError = ctx.message ?? this.msgCloudBookResolve();
        }
        return;
      }
      this.bookError = '';
      this.bookId = ctx.bookId;
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      this.schedulePoll();
    },
    async refreshFeeds(
      useEtag: boolean
    ): Promise<{ notModified: boolean; fetchFailed: boolean }> {
      if (!this.bookId) {
        return { notModified: false, fetchFailed: false };
      }
      this.feedsLoading = !useEtag;
      this.feedsError = '';
      const res = await fetchPlaidFeedsWithStepUp(this.bookId, {
        ifNoneMatch: useEtag ? this.feedsEtag : undefined,
        // Background polls pause and show PlaidBankSyncMfaBanner instead of a modal.
        promptTotp: useEtag ? null : () => this.promptPlaidTotp(),
      });
      this.feedsLoading = false;
      if (res.error) {
        this.feedsError = res.error;
        return { notModified: false, fetchFailed: true };
      }
      if (res.notModified) {
        return { notModified: true, fetchFailed: false };
      }
      if (res.payload) {
        const items = res.payload.items ?? [];
        this.detectAndNotifyNewBatches(items);
        this.feedItems = items;
        if (res.etag) {
          this.feedsEtag = res.etag;
        }
        await this.prefetchLinkedForAllItems();
      }
      return { notModified: false, fetchFailed: false };
    },
    /**
     * Compare the new poll's pending counts against the previous snapshot per
     * Plaid item; if any item's pending grew, fire one OS notification (the
     * helper rate-limits and gates on `document.hidden`).
     */
    detectAndNotifyNewBatches(items: PlaidFeedItemRow[]) {
      const next: Record<string, number> = {};
      let anyGrew = false;
      const grew: Array<{ item: PlaidFeedItemRow; delta: number }> = [];
      for (const it of items) {
        const cur = it.pending_import_batches_count ?? 0;
        next[it.item_id] = cur;
        const prev = this.lastPendingByItem[it.item_id];
        if (prev !== undefined && cur > prev) {
          anyGrew = true;
          grew.push({ item: it, delta: cur - prev });
        }
      }
      // First poll establishes a baseline without notifying.
      if (Object.keys(this.lastPendingByItem).length === 0) {
        this.lastPendingByItem = next;
        return;
      }
      this.lastPendingByItem = next;

      if (!anyGrew) {
        return;
      }
      if (!this.notificationPermissionRequested) {
        this.notificationPermissionRequested = true;
        void ensureNotificationPermission();
      }
      for (const { item, delta } of grew) {
        notifyNewBatches({
          itemId: item.item_id,
          totalBatchesAdded: delta,
          institutionName: item.institution_name,
        });
      }
    },
    async toggleItem(itemId: string) {
      if (this.expandedItemId === itemId) {
        this.expandedItemId = null;
        this.batchesForExpanded = [];
        this.batchListError = '';
        return;
      }
      this.expandedItemId = itemId;
      await this.loadBatchesForItem(itemId);
    },
    async loadBatchesForItem(itemId: string) {
      if (!this.bookId) {
        return;
      }
      this.batchListLoading = true;
      this.batchListError = '';
      const { batches, error } = await fetchPendingImportBatches(
        this.bookId,
        itemId,
        { limit: 20, promptTotp: () => this.promptPlaidTotp() }
      );
      this.batchListLoading = false;
      if (error) {
        this.batchListError = error;
        this.batchesForExpanded = [];
        return;
      }
      this.batchesForExpanded = batches;
      this.previewByBatch = {};
    },
    previewFor(publicId: string): PreviewState | undefined {
      return this.previewByBatch[publicId];
    },
    async loadPayload(publicId: string) {
      if (!this.bookId) {
        return;
      }
      this.previewByBatch = {
        ...this.previewByBatch,
        [publicId]: { loading: true },
      };
      const { payload, error } = await fetchImportBatchPayload(
        this.bookId,
        publicId,
        { promptTotp: () => this.promptPlaidTotp() }
      );
      if (error || !payload || typeof payload !== 'object') {
        this.previewByBatch = {
          ...this.previewByBatch,
          [publicId]: { loading: false, error: error ?? this.msgEmptyPayload() },
        };
        return;
      }
      const txs = (payload as { transactions?: unknown }).transactions;
      const rows: TxRow[] = [];
      if (Array.isArray(txs)) {
        for (const r of txs) {
          if (!r || typeof r !== 'object') {
            continue;
          }
          const o = r as Record<string, unknown>;
          if (o.removed === true) {
            continue;
          }
          rows.push({
            date: typeof o.date === 'string' ? o.date : undefined,
            amount: typeof o.amount === 'string' ? o.amount : String(o.amount ?? ''),
            currency: typeof o.currency === 'string' ? o.currency : undefined,
            name: typeof o.name === 'string' ? o.name : String(o.name ?? ''),
            account_id:
              typeof o.account_id === 'string' ? o.account_id : undefined,
          });
        }
      }
      this.previewByBatch = {
        ...this.previewByBatch,
        [publicId]: { loading: false, rows },
      };
    },
    async ackBatch(publicId: string) {
      if (!this.bookId) {
        return;
      }
      const { ok, error } = await ackImportBatch(this.bookId, publicId);
      if (!ok) {
        this.feedsError = error ?? this.msgAckFailed();
        return;
      }
      if (this.expandedItemId) {
        await this.loadBatchesForItem(this.expandedItemId);
      }
      await this.refreshFeeds(false);
      const next = { ...this.previewByBatch };
      delete next[publicId];
      this.previewByBatch = next;
    },
  },
});
</script>
