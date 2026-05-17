<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Reconcile`" />
    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-3xl">
        {{
          t`Summary of each bank account: where you left off, your last statement balance, and the ledger total. Open
        Reconcile to match the app to your bank PDF.`
        }}
      </p>

      <div v-if="loading" class="text-sm text-gray-600 dark:text-gray-400">
        {{ t`Loading accounts…` }}
      </div>
      <template v-else>
        <div
          v-for="tbl in institutionTables"
          :key="tbl.groupKey"
          class="
            mb-4
            last:mb-0
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
                tbl.caption
              }}
            </caption>
            <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
              <tr>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Bank account` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Ledger account` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Last reconciled` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Last statement balance` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Ledger balance` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Status` }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in tbl.rows"
                :key="row.name"
                role="button"
                tabindex="0"
                class="
                  cursor-pointer
                  hover:bg-gray-50
                  dark:hover:bg-gray-800/80
                  border-b
                  dark:border-gray-800
                  last:border-0
                "
                @click="goReconcile(row.name)"
                @keydown.enter.prevent="goReconcile(row.name)"
                @keydown.space.prevent="goReconcile(row.name)"
              >
                <td
                  class="
                    p-3
                    text-start
                    font-medium
                    text-gray-900
                    dark:text-gray-100
                  "
                >
                  {{ row.bankAccountLabel }}
                </td>
                <td class="p-3 text-start text-gray-700 dark:text-gray-300">
                  {{ row.ledgerAccountLabel }}
                </td>
                <td class="p-3 text-start text-gray-600 dark:text-gray-400">
                  {{ row.lastReconciledLabel || t`—` }}
                </td>
                <td
                  class="
                    p-3
                    text-start
                    tabular-nums
                    text-gray-700
                    dark:text-gray-300
                  "
                >
                  {{ row.lastStatementBalanceLabel }}
                </td>
                <td class="p-3 text-start tabular-nums">
                  {{ row.ledgerBalanceLabel }}
                </td>
                <td class="p-3 text-start">
                  <span
                    class="
                      inline-flex
                      rounded-full
                      px-2
                      py-0.5
                      text-xs
                      font-medium
                    "
                    :class="row.statusPillClass"
                  >
                    {{ row.statusLabel }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="institutionTables.length === 0"
          class="
            text-sm text-gray-600
            dark:text-gray-400
            border border-gray-200
            dark:border-gray-700
            rounded-lg
            p-4
            bg-white
            dark:bg-gray-900
          "
        >
          {{
            t`No bank or credit-card accounts yet. Add one in Chart of Accounts to start reconciling.`
          }}
        </p>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { isCredit } from 'models/helpers';
import { routeTo } from 'src/utils/ui';
import { lastReconcileFor, readDraft } from 'src/utils/reconcileStore';
import {
  feedItemById,
  loadPlaidAccountMaps,
  mapsByChartAccount,
  type PlaidMapRow,
} from 'src/utils/bankFeedHelpers';
import { fetchPlaidFeedsWithStepUp } from 'src/utils/plaidBankFeedsApi';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import { accountDisplayName } from 'utils/accountDisplay';
import { defineComponent } from 'vue';

type HubRow = {
  name: string;
  bankAccountLabel: string;
  ledgerAccountLabel: string;
  groupKey: string;
  institutionCaption: string;
  rootType?: string;
  ledgerBalanceLabel: string;
  lastReconciledLabel: string | null;
  lastStatementBalanceLabel: string;
  statusLabel: string;
  statusPillClass: string;
};

type InstitutionTable = {
  groupKey: string;
  caption: string;
  rows: HubRow[];
};

function reconcileDraftInProgress(account: string): boolean {
  const d = readDraft(account);
  if (!d) {
    return false;
  }
  if (d.toDate) {
    return true;
  }
  if (d.endingBalance != null && typeof d.endingBalance === 'number') {
    return true;
  }
  if (d.checked && Object.keys(d.checked).length > 0) {
    return true;
  }
  return false;
}

function primaryPlaidMap(
  chartAccount: string,
  byChart: Record<string, PlaidMapRow[]>
): PlaidMapRow | null {
  const list = byChart[chartAccount];
  if (!list?.length) {
    return null;
  }
  return list[0];
}

export default defineComponent({
  name: 'BankReconcileHub',
  components: { PageHeader },
  data() {
    return {
      loading: false,
      institutionTables: [] as InstitutionTable[],
    };
  },
  mounted() {
    void this.load();
  },
  methods: {
    t,
    goReconcile(accountName: string) {
      void routeTo(
        `/bank-reconcile/${encodeURIComponent(accountName)}`
      );
    },
    formatToDate(iso: string | null): string | null {
      if (!iso) {
        return null;
      }
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        return iso.slice(0, 10);
      }
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }).format(d);
    },
    async load() {
      this.loading = true;
      try {
        const reconcilable = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'accountName', 'rootType'],
          filters: {
            accountType: AccountTypeEnum.Bank,
            isGroup: false,
            disabled: false,
          },
        })) as { name: string; accountName?: string; rootType?: string }[];

        const plaidMaps = await loadPlaidAccountMaps();
        const byChart = mapsByChartAccount(plaidMaps);

        const feedCtx = await ensureLivebooksCloudBookId(fyo);
        const feedByItem =
          feedCtx.ok
            ? feedItemById(
              (await fetchPlaidFeedsWithStepUp(feedCtx.bookId)).payload?.items ?? []
            )
            : {};

        const totals = await fyo.db.getTotalCreditAndDebit();
        const totalsByAccount: Record<
          string,
          { totalDebit: number; totalCredit: number }
        > = {};
        for (const row of totals) {
          totalsByAccount[row.account] = {
            totalDebit: Number(row.totalDebit ?? 0),
            totalCredit: Number(row.totalCredit ?? 0),
          };
        }

        const rows: HubRow[] = reconcilable.map((b) => {
          const totalsRow = totalsByAccount[b.name];
          let ledgerVal = 0;
          if (totalsRow) {
            const { totalCredit, totalDebit } = totalsRow;
            ledgerVal = totalDebit - totalCredit;
            const rt = b.rootType as Parameters<typeof isCredit>[0] | undefined;
            if (rt && isCredit(rt)) {
              ledgerVal = totalCredit - totalDebit;
            }
          }
          const closed = lastReconcileFor(b.name);
          const inProgress = reconcileDraftInProgress(b.name);
          let statusLabel: string;
          let statusPillClass: string;
          if (inProgress) {
            statusLabel = t`In progress`;
            statusPillClass =
              'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
          } else if (closed) {
            statusLabel = t`Balanced`;
            statusPillClass =
              'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-100';
          } else {
            statusLabel = t`Ready`;
            statusPillClass =
              'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
          }

          const map = primaryPlaidMap(b.name, byChart);
          let groupKey: string;
          let institutionCaption: string;
          let bankAccountLabel: string;

          if (map) {
            const feed = feedByItem[map.plaidItemId];
            const instName = feed?.institution_name?.trim();
            institutionCaption = instName || t`Bank feed`;
            if (feed?.institution_id) {
              groupKey = `inst:${feed.institution_id}`;
            } else if (instName) {
              groupKey = `name:${instName}`;
            } else {
              groupKey = `item:${map.plaidItemId}`;
            }
            const label = map.plaidDisplayLabel?.trim();
            bankAccountLabel = label || accountDisplayName(b);
          } else {
            groupKey = 'manual';
            institutionCaption = t`Manual Banks`;
            bankAccountLabel = accountDisplayName(b);
          }

          return {
            name: b.name,
            bankAccountLabel,
            ledgerAccountLabel: accountDisplayName(b),
            groupKey,
            institutionCaption,
            rootType: b.rootType,
            ledgerBalanceLabel: fyo.format(ledgerVal, 'Currency'),
            lastReconciledLabel: closed
              ? this.formatToDate(closed.toDate)
              : null,
            lastStatementBalanceLabel: closed
              ? fyo.format(closed.endingBalance, 'Currency')
              : t`—`,
            statusLabel,
            statusPillClass,
          };
        });

        const bucket: Record<
          string,
          { caption: string; rows: HubRow[] }
        > = {};
        for (const row of rows) {
          if (!bucket[row.groupKey]) {
            bucket[row.groupKey] = {
              caption: row.institutionCaption,
              rows: [],
            };
          }
          bucket[row.groupKey].rows.push(row);
        }

        this.institutionTables = Object.entries(bucket)
          .map(([groupKey, g]) => ({
            groupKey,
            caption: g.caption,
            rows: g.rows.sort((a, b) => {
              const byBank = a.bankAccountLabel.localeCompare(
                b.bankAccountLabel
              );
              if (byBank !== 0) {
                return byBank;
              }
              return a.ledgerAccountLabel.localeCompare(b.ledgerAccountLabel);
            }),
          }))
          .sort((a, b) => a.caption.localeCompare(b.caption));
      } finally {
        this.loading = false;
      }
    },
  },
});
</script>
