<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Bank Account Activity`">
      <Button type="secondary" :disabled="refreshing" @click="reload">{{
        refreshing ? t`Refreshing…` : t`Refresh`
      }}</Button>
      <Button
        v-if="accountKind === 'plaid' && bookId && !plaidAutoStageImportBatches"
        type="secondary"
        :disabled="manualPullBusy || refreshing"
        @click="pullPlaidBatchesNow"
      >
        {{ manualPullBusy ? t`Pulling…` : t`Pull bank feed` }}
      </Button>
      <Button
        v-if="accountKind === 'manual' || accountKind === 'plaid'"
        type="primary"
        @click="goImportBankFile"
      >
        {{ t`⤒ Upload file` }}
      </Button>
    </PageHeader>

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <div
        v-if="decodeError"
        class="text-sm text-red-600 dark:text-red-400 mb-2"
      >
        {{ decodeError }}
      </div>

      <div
        v-if="accountKind === 'unknown' && !decodeError"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        {{ t`Loading…` }}
      </div>

      <template v-else>
        <div
          v-if="accountKind !== 'unknown'"
          class="
            border border-gray-200
            dark:border-gray-700
            rounded-lg
            overflow-hidden
            bg-white
            dark:bg-gray-900
            mb-4
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
                summaryInstitutionCaption
              }}
              <span
                v-if="summaryConnectionHealth"
                class="inline-block w-2 h-2 rounded-full ms-2 align-middle"
                :class="{
                  'bg-emerald-500': summaryConnectionHealth === 'ok',
                  'bg-amber-500': summaryConnectionHealth === 'stale',
                  'bg-red-500': summaryConnectionHealth === 'broken',
                }"
                :title="
                  summaryConnectionHealth === 'ok'
                    ? t`Connection healthy`
                    : summaryConnectionHealth === 'stale'
                    ? t`No recent sync from your bank.`
                    : t`Connection broken — sign in again.`
                "
              />
              <span
                v-if="accountKind === 'manual'"
                class="
                  ms-2
                  text-xs
                  px-1.5
                  py-0.5
                  rounded
                  bg-gray-100
                  dark:bg-gray-800
                  text-gray-700
                  dark:text-gray-300
                  align-middle
                "
              >
                {{ t`Manual` }}
              </span>
              <span
                v-if="accountKind === 'plaid' && summaryPendingAtBank > 0"
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
                {{ t`${summaryPendingAtBank} pending at bank` }}
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
              <tr class="border-b dark:border-gray-800 last:border-0">
                <td class="p-3 text-start font-medium">
                  {{ summaryBankAccountName || accountTitle }}
                </td>
                <td class="p-3 text-start tabular-nums">
                  {{ summaryBankBalanceLabel ?? t`—` }}
                </td>
                <td class="p-3 text-start text-gray-600 dark:text-gray-400">
                  {{ summaryLastSyncLabel || t`—` }}
                </td>
                <td class="p-3 text-start">
                  <span
                    v-if="reviewBadgeCount > 0"
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
                    {{ reviewBadgeCount }}
                  </span>
                  <span v-else class="text-gray-500">0</span>
                </td>
                <td class="p-3 text-start">
                  {{ ledgerAccountLabel || accountTitle }}
                </td>
                <td class="p-3 text-start tabular-nums">
                  {{ glBalanceLabel || t`—` }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex border-b dark:border-gray-700 mb-4 gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="px-3 py-2 text-sm rounded-t border border-b-0 -mb-px"
            :class="
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400'
            "
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
            <span
              v-if="tab.id === 'review' && reviewBadgeCount > 0"
              class="
                ms-1
                text-xs
                px-1.5
                py-0.5
                rounded-full
                bg-amber-100
                text-amber-900
                dark:bg-amber-900/40 dark:text-amber-100
              "
            >
              {{ reviewBadgeCount }}
            </span>
          </button>
        </div>

        <!-- Plaid sign-in / book error -->
        <div
          v-if="accountKind === 'plaid' && bookError"
          class="text-sm text-red-600 mb-3"
        >
          {{ bookError }}
        </div>

        <div
          v-if="accountKind === 'plaid' && !bookError"
          class="
            mb-4
            rounded
            border border-slate-200
            dark:border-slate-600
            bg-slate-50
            dark:bg-slate-900/40
            p-3
            text-sm text-slate-800
            dark:text-slate-100
          "
        >
          {{
            t`Imported bank lines land in For Review first. Nothing posts to income or expense categories until you click Add or Match. If you turned off automatic staging in Bank Feed Settings, use Pull bank feed here.`
          }}
        </div>

        <div
          v-if="accountKind === 'plaid' && plaidCatchUpBlocked"
          class="
            mb-4
            border border-red-300
            dark:border-red-700
            bg-red-50
            dark:bg-red-900/20
            rounded
            p-3
            text-sm
          "
        >
          <div class="font-medium mb-1 text-red-900 dark:text-red-100">
            {{ t`Bank feed catch-up paused` }}
          </div>
          <div class="text-red-900 dark:text-red-100">
            {{ plaidCatchUpBlocked.message }}
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <Button type="secondary" @click="goImportBankFile">
              {{ t`Import CSV/OFX` }}
            </Button>
            <Button type="primary" @click="pullPlaidAnyway">
              {{ t`Pull anyway` }}
            </Button>
          </div>
        </div>

        <div
          v-if="accountKind === 'plaid' && plaidCatchUpWarning"
          class="mb-4 text-sm text-amber-800 dark:text-amber-200"
        >
          {{ plaidCatchUpWarning }}
        </div>

        <!-- Recent apply failures (Plaid only). -->
        <div
          v-if="accountKind === 'plaid' && recentApplyFailures.length"
          class="
            mb-4
            border border-amber-300
            dark:border-amber-700
            bg-amber-50
            dark:bg-amber-900/20
            rounded
            p-3
            text-sm
          "
        >
          <div class="font-medium mb-1 text-amber-900 dark:text-amber-100">
            {{
              t`We couldn't apply ${recentApplyFailures.length} recent batch(es).`
            }}
          </div>
          <ul
            class="list-disc ms-5 space-y-1 text-amber-900 dark:text-amber-100"
          >
            <li
              v-for="f in recentApplyFailures"
              :key="f.public_id + f.created_at"
            >
              <span class="font-mono text-xs"
                >{{ f.public_id.slice(0, 8) }}…</span
              >
              — {{ f.error_summary }}
            </li>
          </ul>
          <div class="mt-2 text-xs text-amber-900 dark:text-amber-200">
            {{
              t`Click Refresh to retry. If retries keep failing, contact support.`
            }}
          </div>
        </div>

        <!-- Retracted-after-matched warning (Plaid only). -->
        <div
          v-if="
            accountKind === 'plaid' &&
            visibleRetractedMatched.length &&
            !retractedBannerDismissed
          "
          class="
            mb-4
            border border-rose-300
            dark:border-rose-700
            bg-rose-50
            dark:bg-rose-900/20
            rounded
            p-3
            text-sm
            flex flex-col
            gap-2
          "
        >
          <div class="font-medium text-rose-900 dark:text-rose-100">
            {{
              t`Your bank retracted ${visibleRetractedMatched.length} transaction(s) you had already reconciled.`
            }}
          </div>
          <ul class="list-disc ms-5 space-y-1 text-rose-900 dark:text-rose-100">
            <li
              v-for="r in visibleRetractedMatched.slice(0, 5)"
              :key="r.externalId"
            >
              <span class="font-mono text-xs">{{ r.externalId }}</span>
              {{ r.statementName ? ' — ' + r.statementName : '' }}
            </li>
          </ul>
          <div class="text-xs text-rose-900 dark:text-rose-200">
            {{
              t`Open the matched record and decide whether to keep, void, or unreconcile it.`
            }}
          </div>
          <div class="flex justify-end">
            <Button type="secondary" @click="dismissRetractedBanner">
              {{ t`Dismiss` }}
            </Button>
          </div>
        </div>

        <!-- Unmapped Plaid sub-accounts banner -->
        <div
          v-if="accountKind === 'plaid' && hasUnmappedPendingBatches"
          class="
            mb-4
            border border-amber-300
            dark:border-amber-700
            bg-amber-50
            dark:bg-amber-900/20
            rounded
            p-3
            text-sm
            flex
            items-center
            justify-between
            gap-3
          "
        >
          <div class="text-amber-900 dark:text-amber-100">
            {{
              t`New transactions are waiting on a sub-account that isn't mapped yet. Map your Plaid sub-account to a bank account so they can show up here.`
            }}
          </div>
          <Button type="secondary" @click="goToBankFeedSettings">
            {{ t`Map accounts` }}
          </Button>
        </div>

        <!-- Auto-apply progress (one-shot, transient) -->
        <div
          v-if="autoApplyBusy"
          class="text-xs text-gray-600 dark:text-gray-400 mb-2"
        >
          {{ t`Syncing new transactions from your bank…` }}
        </div>

        <!-- For Review tab -->
        <div v-if="activeTab === 'review'">
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-3xl">
            {{
              t`Inbox of imported bank activity. Pick a category and Add it to your books, or Match it to an existing entry. Excluded items move to the Excluded tab and are hidden from your reports.`
            }}
          </p>

          <!-- Unified review table -->
          <div v-if="manualLoading" class="text-sm text-gray-600">
            {{ t`Loading transactions…` }}
          </div>
          <div v-else-if="manualError" class="text-sm text-red-600">
            {{ manualError }}
          </div>
          <div
            v-else-if="!manualLinesForReview.length"
            class="text-sm text-gray-600 dark:text-gray-300"
          >
            <template v-if="accountKind === 'manual'">
              {{
                t`No transactions to review. Click Upload file above to import CSV, QBO, or QFX.`
              }}
            </template>
            <template v-else>
              {{ t`Nothing pending for review for this account.` }}
            </template>
          </div>
          <table
            v-else
            class="min-w-full text-sm text-start border dark:border-gray-700"
          >
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="text-start p-2 border-b">{{ t`Date` }}</th>
                <th class="text-start p-2 border-b">{{ t`Description` }}</th>
                <th class="text-start p-2 border-b w-28">{{ t`Status` }}</th>
                <th class="text-start p-2 border-b">{{ t`Amount` }}</th>
                <th class="text-start p-2 border-b">{{ t`Category` }}</th>
                <th class="text-start p-2 border-b">{{ t`Actions` }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="line in manualLinesForReview"
                :key="manualLineKey(line)"
              >
                <td class="p-2 border-b dark:border-gray-800 whitespace-nowrap">
                  {{ line.date || '—' }}
                </td>
                <td class="p-2 border-b dark:border-gray-800 max-w-md">
                  {{ line.description || '—' }}
                </td>
                <td class="p-2 border-b dark:border-gray-800 text-xs">
                  <span
                    v-if="line.possibleDuplicate"
                    class="
                      inline-block
                      px-1.5
                      py-0.5
                      rounded
                      bg-amber-100
                      text-amber-900
                      dark:bg-amber-900/40 dark:text-amber-100
                    "
                  >
                    {{ t`Possible duplicate` }}
                  </span>
                  <span v-else class="text-gray-400">—</span>
                </td>
                <td
                  class="
                    p-2
                    border-b
                    dark:border-gray-800
                    text-start
                    tabular-nums
                  "
                  :class="
                    line.amountFloat > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : ''
                  "
                >
                  {{ manualAmountLabel(line) }}
                </td>
                <td class="p-2 border-b dark:border-gray-800">
                  <select
                    v-model="categorySelections[manualLineKey(line)]"
                    class="
                      border
                      rounded
                      px-1
                      py-0.5
                      text-xs
                      max-w-[14rem]
                      dark:bg-gray-900 dark:border-gray-700
                    "
                    :disabled="manualPendingRowKey === manualLineKey(line)"
                  >
                    <option value="">{{ t`Select category…` }}</option>
                    <optgroup
                      v-if="categoryOptions.expense.length"
                      :label="t`Expense`"
                    >
                      <option
                        v-for="acc in categoryOptions.expense"
                        :key="acc.name"
                        :value="acc.name"
                      >
                        {{ categoryLabel(acc) }}
                      </option>
                    </optgroup>
                    <optgroup
                      v-if="categoryOptions.income.length"
                      :label="t`Income`"
                    >
                      <option
                        v-for="acc in categoryOptions.income"
                        :key="acc.name"
                        :value="acc.name"
                      >
                        {{ categoryLabel(acc) }}
                      </option>
                    </optgroup>
                  </select>
                </td>
                <td class="p-2 border-b dark:border-gray-800 whitespace-nowrap">
                  <Button
                    v-if="matchCandidateFor(line)"
                    type="primary"
                    class="!text-xs !py-0.5"
                    :disabled="manualPendingRowKey === manualLineKey(line)"
                    @click="acceptMatch(line)"
                  >
                    {{ t`Match` }}
                  </Button>
                  <Button
                    type="primary"
                    class="!text-xs !py-0.5 ms-1"
                    :disabled="
                      manualPendingRowKey === manualLineKey(line) ||
                      !categorySelections[manualLineKey(line)]
                    "
                    @click="addLineToLedger(line)"
                  >
                    {{ t`Add` }}
                  </Button>
                  <span class="relative inline-block ms-1">
                    <button
                      type="button"
                      class="
                        text-gray-500
                        hover:text-gray-900
                        dark:text-gray-400 dark:hover:text-gray-100
                        rounded
                        px-1.5
                        py-0.5
                        border border-transparent
                        hover:border-gray-300
                        dark:hover:border-gray-700
                      "
                      :disabled="manualPendingRowKey === manualLineKey(line)"
                      @click="toggleKebab(manualLineKey(line))"
                    >
                      ⋮
                    </button>
                    <div
                      v-if="openKebabKey === manualLineKey(line)"
                      class="
                        absolute
                        z-10
                        right-0
                        mt-1
                        w-32
                        bg-white
                        dark:bg-gray-900
                        border border-gray-200
                        dark:border-gray-700
                        rounded
                        shadow
                        text-sm
                      "
                    >
                      <button
                        type="button"
                        class="
                          block
                          w-full
                          text-start
                          px-3
                          py-1.5
                          hover:bg-gray-50
                          dark:hover:bg-gray-800
                        "
                        @click="onSplit(line)"
                      >
                        {{ t`Split…` }}
                      </button>
                      <button
                        type="button"
                        class="
                          block
                          w-full
                          text-start
                          px-3
                          py-1.5
                          hover:bg-gray-50
                          dark:hover:bg-gray-800
                        "
                        @click="excludeManualLine(line)"
                      >
                        {{ t`Exclude` }}
                      </button>
                    </div>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Reviewed tab -->
        <div v-else-if="activeTab === 'reviewed'">
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-3xl">
            {{
              t`History of cleared transactions. Click Undo to send a row back to For Review. Reconciled rows are locked.`
            }}
          </p>
          <div v-if="manualLoading" class="text-sm text-gray-600">
            {{ t`Loading…` }}
          </div>
          <div
            v-else-if="!manualLinesReviewed.length"
            class="text-sm text-gray-600 dark:text-gray-300"
          >
            {{ t`No reviewed transactions yet.` }}
          </div>
          <table
            v-else
            class="min-w-full text-sm text-start border dark:border-gray-700"
          >
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="text-start p-2 border-b">{{ t`Date` }}</th>
                <th class="text-start p-2 border-b">{{ t`Description` }}</th>
                <th class="text-start p-2 border-b">{{ t`Amount` }}</th>
                <th class="text-start p-2 border-b">{{ t`Matched to` }}</th>
                <th class="text-start p-2 border-b">{{ t`Action` }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="line in manualLinesReviewed"
                :key="manualLineKey(line)"
              >
                <td class="p-2 border-b dark:border-gray-800 whitespace-nowrap">
                  {{ line.date || '—' }}
                </td>
                <td class="p-2 border-b dark:border-gray-800">
                  {{ line.description || '—' }}
                </td>
                <td
                  class="
                    p-2
                    border-b
                    dark:border-gray-800
                    text-start
                    tabular-nums
                  "
                  :class="
                    line.amountFloat > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : ''
                  "
                >
                  {{ manualAmountLabel(line) }}
                </td>
                <td class="p-2 border-b dark:border-gray-800 max-w-xs">
                  <span
                    v-if="line.matchedReferenceName"
                    class="font-mono text-xs"
                  >
                    {{ line.matchedReferenceType }} ·
                    {{ line.matchedReferenceName }}
                  </span>
                  <span v-else class="text-gray-500">—</span>
                </td>
                <td class="p-2 border-b dark:border-gray-800 whitespace-nowrap">
                  <Button
                    type="secondary"
                    :disabled="
                      manualPendingRowKey === manualLineKey(line) ||
                      line.statementStatus === 'Closed'
                    "
                    :title="
                      line.statementStatus === 'Closed'
                        ? t`This statement is reconciled. Reopen the reconciliation to undo.`
                        : ''
                    "
                    @click="undoManualLine(line)"
                  >
                    {{ t`Undo` }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Excluded tab -->
        <div v-else>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-3xl">
            {{
              t`Excluded transactions stay out of your ledger and reconciliation math. Restore brings a row back to For Review.`
            }}
          </p>
          <div v-if="manualLoading" class="text-sm text-gray-600">
            {{ t`Loading…` }}
          </div>
          <div
            v-else-if="!manualLinesExcluded.length"
            class="text-sm text-gray-600 dark:text-gray-300"
          >
            {{ t`No excluded transactions.` }}
          </div>
          <table
            v-else
            class="min-w-full text-sm text-start border dark:border-gray-700"
          >
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="text-start p-2 border-b">{{ t`Date` }}</th>
                <th class="text-start p-2 border-b">{{ t`Description` }}</th>
                <th class="text-start p-2 border-b">{{ t`Amount` }}</th>
                <th class="text-start p-2 border-b">{{ t`Reason` }}</th>
                <th class="text-start p-2 border-b">{{ t`Action` }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="line in manualLinesExcluded"
                :key="manualLineKey(line)"
                class="text-gray-500 dark:text-gray-500"
              >
                <td class="p-2 border-b whitespace-nowrap">
                  {{ line.date || '—' }}
                </td>
                <td class="p-2 border-b">{{ line.description || '—' }}</td>
                <td class="p-2 border-b text-start tabular-nums">
                  {{ manualAmountLabel(line) }}
                </td>
                <td class="p-2 border-b text-xs align-top">
                  <span
                    v-if="line.isPending"
                    class="
                      inline-block
                      me-1
                      mb-1
                      px-1.5
                      py-0.5
                      rounded
                      bg-amber-100
                      text-amber-900
                      dark:bg-amber-900/40 dark:text-amber-100
                      text-[10px]
                      font-medium
                      uppercase
                    "
                    :title="
                      t`Pending at your bank. It'll move into For Review once your bank posts it.`
                    "
                  >
                    {{ t`Pending at bank` }}
                  </span>
                  <span
                    v-else-if="line.ignoreReason === 'plaid_removed'"
                    class="
                      inline-block
                      me-1
                      mb-1
                      px-1.5
                      py-0.5
                      rounded
                      bg-blue-100
                      text-blue-900
                      dark:bg-blue-900/40 dark:text-blue-100
                      text-[10px]
                      font-medium
                      uppercase
                    "
                    :title="
                      t`Plaid later removed this transaction. Your books were not changed automatically — compare to your bank if amounts look off.`
                    "
                  >
                    {{ t`Plaid removed` }}
                  </span>
                  <span>{{
                    line.isPending
                      ? t`Awaiting posting`
                      : line.ignoreReason || '—'
                  }}</span>
                </td>
                <td class="p-2 border-b whitespace-nowrap">
                  <Button
                    v-if="!line.isPending"
                    type="secondary"
                    :disabled="manualPendingRowKey === manualLineKey(line)"
                    @click="restoreManualLine(line)"
                  >
                    {{ t`Restore` }}
                  </Button>
                  <span v-else class="text-xs text-gray-500 dark:text-gray-400">
                    {{ t`—` }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { showToast } from 'src/utils/interactive';
import { LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT } from 'src/utils/livebooksCloud';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  isManualBankAccount,
  loadManualFeedStatements,
  loadPlaidAccountMaps,
  type ManualFeedLine,
  type PlaidMapRow,
} from 'src/utils/bankFeedHelpers';
import {
  fetchPendingImportBatches,
  fetchPlaidFeedsWithStepUp,
  type ImportBatchListRow,
  type PlaidApplyFailureRow,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import {
  fetchPlaidLinkedAccounts,
  formatPlaidAccountLabel,
  type PlaidLinkedAccountRow,
} from 'src/utils/plaidLinkedAccountsApi';
import {
  applyPlaidBatch,
  applyPlaidBatchWithPayload,
  type PlaidApplyOutcome,
  type RetractedMatchedRow,
} from 'src/utils/plaidApply';
import { getLastSuccessfulPlaidApplyAt } from 'src/utils/plaidApplyBookmark';
import {
  evaluatePlaidCatchUp,
  oldestCreatedAt,
} from 'src/utils/plaidCatchUpGuard';
import { bulkFetchImportBatchPayloads } from 'src/utils/plaidBankFeedsApi';
import { promptTotpCode } from 'src/utils/promptTotpCode';
import {
  categorizeAndAddLine,
  findExactMatchCandidate,
  linkLineToReference,
  setLineStatus,
  undoLineMatch,
  type ReconcileCandidate,
} from 'src/utils/bankLineActions';
import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { isCredit } from 'models/helpers';
import { routeTo } from 'src/utils/ui';
import { accountDisplayName } from 'utils/accountDisplay';
import { defineComponent } from 'vue';

type MergedBatch = ImportBatchListRow & { itemId: string; itemLabel: string };

type CategoryOption = { name: string; accountName?: string };

export default defineComponent({
  name: 'BankAccountActivity',
  components: { PageHeader, Button },
  props: {
    accountName: { type: String, required: true },
  },
  data() {
    return {
      activeTab: 'review' as 'review' | 'reviewed' | 'excluded',
      refreshing: false,
      bookId: '' as string,
      bookError: '' as string,
      mergedBatches: [] as MergedBatch[],
      batchesLoading: false,
      batchesError: '' as string,
      itemLabels: {} as Record<string, string>,
      accountKind: 'unknown' as 'unknown' | 'plaid' | 'manual',
      manualLines: [] as ManualFeedLine[],
      manualLoading: false,
      manualError: '' as string,
      manualPendingRowKey: '' as string,
      decodeError: '' as string,
      autoApplyBusy: false,
      plaidAutoStageImportBatches: true,
      manualPullBusy: false,
      mappedPlaidAccountIds: new Set<string>() ,
      categoryOptions: { expense: [], income: [] } as {
        expense: CategoryOption[];
        income: CategoryOption[];
      },
      categorySelections: {} as Record<string, string>,
      candidatesByLineKey: {} as Record<string, ReconcileCandidate | null>,
      openKebabKey: '' as string,
      recentApplyFailures: [] as PlaidApplyFailureRow[],
      retractedMatched: [] as RetractedMatchedRow[],
      retractedBannerDismissed: false,
      boundCloudSessionRefresh: null as (() => void) | null,
      boundDocumentClick: null as ((e: MouseEvent) => void) | null,
      glBalanceLabel: '' as string,
      summaryBankAccountName: '' as string,
      summaryBankBalanceLabel: null as string | null,
      summaryLastSyncLabel: null as string | null,
      summaryInstitutionCaption: '' as string,
      summaryConnectionHealth: null as 'ok' | 'stale' | 'broken' | null,
      summaryPendingAtBank: 0,
      plaidFeedItemsCache: [] as PlaidFeedItemRow[],
      ledgerAccountLabel: '' as string,
      plaidCatchUpBlocked: null as {
        allow: false;
        reason: string;
        message: string;
      } | null,
      plaidCatchUpWarning: '' as string,
      plaidCatchUpOverride: false,
    };
  },
  computed: {
    accountTitle(): string {
      try {
        return decodeURIComponent(this.accountName);
      } catch {
        return this.accountName;
      }
    },
    tabs(): { id: 'review' | 'reviewed' | 'excluded'; label: string }[] {
      return [
        { id: 'review', label: t`For Review` },
        { id: 'reviewed', label: t`Reviewed` },
        { id: 'excluded', label: t`Excluded` },
      ];
    },
    manualLinesForReview(): ManualFeedLine[] {
      return this.manualLines.filter((l) => l.matchStatus === 'unmatched');
    },
    manualLinesReviewed(): ManualFeedLine[] {
      return this.manualLines.filter((l) => l.matchStatus === 'matched');
    },
    manualLinesExcluded(): ManualFeedLine[] {
      return this.manualLines.filter((l) => l.matchStatus === 'ignored');
    },
    reviewBadgeCount(): number {
      return this.manualLinesForReview.length;
    },
    hasUnmappedPendingBatches(): boolean {
      return this.mergedBatches.some((b) => this.isBatchUnmapped(b));
    },
    visibleRetractedMatched(): RetractedMatchedRow[] {
      return this.retractedMatched;
    },
  },
  watch: {
    accountName: {
      immediate: true,
      handler() {
        void this.bootstrap();
      },
    },
    '$route.query.tab': {
      immediate: true,
      handler(tab: unknown) {
        if (tab === 'review' || tab === 'reviewed' || tab === 'excluded') {
          this.activeTab = tab;
        }
      },
    },
  },
  mounted() {
    this.boundCloudSessionRefresh = () => {
      void this.bootstrap();
    };
    document.addEventListener(
      LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
      this.boundCloudSessionRefresh
    );
    this.boundDocumentClick = (e: MouseEvent) => {
      if (!this.openKebabKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      // Close the kebab if click is outside any kebab anchor.
      if (!target.closest('[data-kebab-anchor]') && !target.closest('button')) {
        this.openKebabKey = '';
      }
    };
    document.addEventListener('click', this.boundDocumentClick);
  },
  beforeUnmount() {
    if (this.boundCloudSessionRefresh) {
      document.removeEventListener(
        LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
        this.boundCloudSessionRefresh
      );
    }
    if (this.boundDocumentClick) {
      document.removeEventListener('click', this.boundDocumentClick);
    }
  },
  methods: {
    t,
    categoryLabel(acc: CategoryOption) {
      return accountDisplayName(acc);
    },
    async promptBankFeedTotp(): Promise<string | null> {
      return await promptTotpCode({
        title: t`Authenticator code`,
        detail: t`Enter your LiveBooks Cloud authenticator or backup code to download bank transactions.`,
      });
    },
    async loadLedgerAccountLabel() {
      try {
        const accountName = (await fyo.db.getValue(
          ModelNameEnum.Account,
          this.accountTitle,
          'accountName'
        )) as string | undefined;
        this.ledgerAccountLabel = accountDisplayName({
          name: this.accountTitle,
          accountName,
        });
      } catch {
        this.ledgerAccountLabel = this.accountTitle;
      }
    },
    async bootstrap() {
      this.bookError = '';
      this.bookId = '';
      this.mergedBatches = [];
      this.decodeError = '';
      this.openKebabKey = '';
      this.summaryBankAccountName = '';
      this.summaryBankBalanceLabel = null;
      this.summaryLastSyncLabel = null;
      this.summaryInstitutionCaption = '';
      this.summaryConnectionHealth = null;
      this.summaryPendingAtBank = 0;
      this.plaidFeedItemsCache = [];
      this.ledgerAccountLabel = '';

      try {
        decodeURIComponent(this.accountName);
      } catch {
        this.decodeError = t`We couldn't read this bank account from the URL.`;
        this.accountKind = 'unknown';
        return;
      }

      let maps: PlaidMapRow[] = [];
      try {
        maps = await loadPlaidAccountMaps();
      } catch {
        // Treat as Manual when Plaid maps can't be loaded so the page still works.
      }

      // Load category options once per bootstrap (they rarely change).
      await this.loadCategoryOptions();
      await this.loadLedgerAccountLabel();

      if (isManualBankAccount(this.accountTitle, maps)) {
        this.accountKind = 'manual';
        await this.loadManualLines();
        await this.refreshCandidates();
        await this.loadGlBalance();
        await this.loadActivitySummaryRow();
        return;
      }

      this.accountKind = 'plaid';
      const mine = maps.filter((m) => m.chartAccount === this.accountTitle);
      this.mappedPlaidAccountIds = new Set(
        maps.map((m) => `${m.plaidItemId}\x1f${m.plaidAccountId}`)
      );
      const ctx = await ensureLivebooksCloudBookId(fyo);
      if (!ctx.ok) {
        if (ctx.reason === 'not_signed_in') {
          this.bookError =
            t`Sign in to LiveBooks Cloud from the sidebar to load pending batches.`;
        } else {
          this.bookError =
            ctx.message ??
            t`Could not resolve your cloud book for this company file.`;
        }
        // Even without cloud, still show local lines.
        await this.loadManualLines();
        await this.refreshCandidates();
        await this.loadGlBalance();
        await this.loadActivitySummaryRow(mine);
        return;
      }
      this.bookId = ctx.bookId;
      this.plaidAutoStageImportBatches =
        fyo.config.get('plaidAutoStageImportBatches', true) !== false;
      await this.loadRecentFailures(mine);
      await this.loadBatchesForAccount(mine);
      // When enabled (default), stage Cloud import batches into For Review. GL only
      // updates when the user adds/matches in this UI. Can be turned off in Settings.
      if (this.plaidAutoStageImportBatches) {
        await this.autoApplyPendingBatches();
      }
      // Plaid-applied lines land in the same BankStatement(kind='feed_window')
      // staging table that manual CSV imports use, so reuse the same loader
      // to populate For Review / Reviewed / Excluded with real data.
      await this.loadManualLines();
      await this.refreshCandidates();
      await this.loadGlBalance();
      await this.loadActivitySummaryRow(mine);
    },
    async loadCategoryOptions() {
      try {
        const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'accountName', 'rootType'],
          filters: { isGroup: false, disabled: false },
        })) as { name: string; accountName?: string; rootType?: string }[];
        const expense: CategoryOption[] = [];
        const income: CategoryOption[] = [];
        for (const r of rows) {
          if (r.rootType === 'Expense') {
            expense.push({ name: r.name, accountName: r.accountName });
          } else if (r.rootType === 'Income') {
            income.push({ name: r.name, accountName: r.accountName });
          }
        }
        expense.sort((a, b) =>
          accountDisplayName(a).localeCompare(accountDisplayName(b))
        );
        income.sort((a, b) =>
          accountDisplayName(a).localeCompare(accountDisplayName(b))
        );
        this.categoryOptions = { expense, income };
      } catch {
        this.categoryOptions = { expense: [], income: [] };
      }
    },
    async loadManualLines() {
      this.manualLoading = true;
      this.manualError = '';
      try {
        const data = await loadManualFeedStatements(this.accountTitle);
        const lines = data.lines.slice();
        lines.sort((a, b) => {
          if (a.date === b.date) {
            return a.lineIdx - b.lineIdx;
          }
          return b.date.localeCompare(a.date);
        });
        this.manualLines = lines;
      } catch (e) {
        this.manualError =
          (e as Error).message || t`Couldn't load transactions.`;
      } finally {
        this.manualLoading = false;
      }
    },
    async refreshCandidates() {
      const next: Record<string, ReconcileCandidate | null> = {};
      for (const line of this.manualLinesForReview) {
        const cand = await findExactMatchCandidate(this.accountTitle, line);
        next[this.manualLineKey(line)] = cand;
      }
      this.candidatesByLineKey = next;
    },
    matchCandidateFor(line: ManualFeedLine): ReconcileCandidate | null {
      return this.candidatesByLineKey[this.manualLineKey(line)] ?? null;
    },
    manualLineKey(line: ManualFeedLine): string {
      return `${line.statementName}::${line.lineIdx}`;
    },
    manualAmountLabel(line: ManualFeedLine): string {
      return fyo.format(line.amountFloat, 'Currency');
    },
    goImportBankFile() {
      void routeTo({
        path: '/bank-statement-import',
        query: {
          bankAccount: encodeURIComponent(this.accountTitle),
          kind: 'feed_window',
          returnTo: 'activity',
        },
      });
    },
    async loadGlBalance() {
      this.glBalanceLabel = '';
      try {
        const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'rootType'],
          filters: {
            name: this.accountTitle,
            accountType: AccountTypeEnum.Bank,
            isGroup: false,
          },
        })) as { name: string; rootType?: string }[];
        const rootType = rows[0]?.rootType;
        const totals = await fyo.db.getTotalCreditAndDebit();
        const total = totals.find((x) => x.account === this.accountTitle);
        if (!total) {
          this.glBalanceLabel = fyo.format(0, 'Currency');
          return;
        }
        const td = Number(total.totalDebit ?? 0);
        const tc = Number(total.totalCredit ?? 0);
        let v = td - tc;
        if (rootType && isCredit(rootType)) {
          v = tc - td;
        }
        this.glBalanceLabel = fyo.format(v, 'Currency');
      } catch {
        this.glBalanceLabel = '';
      }
    },
    toggleKebab(key: string) {
      this.openKebabKey = this.openKebabKey === key ? '' : key;
    },
    async addLineToLedger(line: ManualFeedLine) {
      const key = this.manualLineKey(line);
      const category = this.categorySelections[key] ?? '';
      if (!category) {
        showToast({
          type: 'error',
          message: t`Pick a category before adding to the ledger.`,
        });
        return;
      }
      if (this.manualPendingRowKey) {
        return;
      }
      this.manualPendingRowKey = key;
      try {
        const result = await categorizeAndAddLine({
          bankAccount: this.accountTitle,
          categoryAccount: category,
          line,
        });
        if (!result.ok) {
          showToast({ type: 'error', message: result.error });
          return;
        }
        showToast({
          type: 'success',
          message: t`Added to ledger as ${result.journalEntryName}.`,
          duration: 'short',
        });
        await this.loadManualLines();
        await this.refreshCandidates();
      } finally {
        this.manualPendingRowKey = '';
      }
    },
    async acceptMatch(line: ManualFeedLine) {
      const cand = this.matchCandidateFor(line);
      if (!cand) {
        return;
      }
      const key = this.manualLineKey(line);
      if (this.manualPendingRowKey) {
        return;
      }
      this.manualPendingRowKey = key;
      try {
        const result = await linkLineToReference({
          line,
          refType: cand.referenceType,
          refName: cand.referenceName,
        });
        if (!result.ok) {
          showToast({ type: 'error', message: result.error });
          return;
        }
        showToast({
          type: 'success',
          message: t`Matched to ${cand.referenceType} ${cand.referenceName}.`,
          duration: 'short',
        });
        await this.loadManualLines();
        await this.refreshCandidates();
      } finally {
        this.manualPendingRowKey = '';
      }
    },
    onSplit() {
      this.openKebabKey = '';
      showToast({
        type: 'info',
        message: t`Split is coming soon. For now, Add the full amount and create offsetting entries manually.`,
      });
    },
    async excludeManualLine(line: ManualFeedLine) {
      this.openKebabKey = '';
      const key = this.manualLineKey(line);
      if (this.manualPendingRowKey) {
        return;
      }
      this.manualPendingRowKey = key;
      try {
        const result = await setLineStatus({
          line,
          status: 'ignored',
          ignoreReason: 'user_excluded',
        });
        if (!result.ok) {
          showToast({ type: 'error', message: result.error });
          return;
        }
        await this.loadManualLines();
      } finally {
        this.manualPendingRowKey = '';
      }
    },
    async restoreManualLine(line: ManualFeedLine) {
      const key = this.manualLineKey(line);
      if (this.manualPendingRowKey) {
        return;
      }
      if (line.isPending) {
        showToast({
          type: 'info',
          message: t`This transaction is still pending at your bank. It'll move into For Review once the bank posts it.`,
          duration: 'short',
        });
        return;
      }
      this.manualPendingRowKey = key;
      try {
        const result = await setLineStatus({ line, status: 'unmatched' });
        if (!result.ok) {
          showToast({ type: 'error', message: result.error });
          return;
        }
        await this.loadManualLines();
        await this.refreshCandidates();
      } finally {
        this.manualPendingRowKey = '';
      }
    },
    async undoManualLine(line: ManualFeedLine) {
      const key = this.manualLineKey(line);
      if (this.manualPendingRowKey) {
        return;
      }
      this.manualPendingRowKey = key;
      try {
        const result = await undoLineMatch(line);
        if (!result.ok) {
          showToast({
            type: 'error',
            message: result.error,
            duration: result.locked ? 'long' : 'short',
          });
          return;
        }
        showToast({
          type: 'success',
          message: t`Moved back to For Review.`,
          duration: 'short',
        });
        await this.loadManualLines();
        await this.refreshCandidates();
      } finally {
        this.manualPendingRowKey = '';
      }
    },
    async loadRecentFailures(
      maps: { plaidItemId: string; plaidAccountId: string }[]
    ) {
      this.recentApplyFailures = [];
      this.plaidFeedItemsCache = [];
      if (!this.bookId || !maps.length) {
        return;
      }
      const { payload } = await fetchPlaidFeedsWithStepUp(this.bookId);
      if (!payload || !Array.isArray(payload.items)) {
        return;
      }
      this.plaidFeedItemsCache = payload.items;
      const ourItemIds = new Set(maps.map((m) => m.plaidItemId));
      const accum: PlaidApplyFailureRow[] = [];
      for (const it of payload.items) {
        if (!ourItemIds.has(it.item_id)) {
          continue;
        }
        for (const f of it.recent_apply_failures ?? []) {
          accum.push(f);
        }
      }
      accum.sort((a, b) => b.created_at.localeCompare(a.created_at));
      this.recentApplyFailures = accum.slice(0, 5);
    },
    async loadBatchesForAccount(
      maps: { plaidItemId: string; plaidAccountId: string }[]
    ) {
      if (!this.bookId) {
        return;
      }
      this.batchesLoading = true;
      this.batchesError = '';
      const seen = new Set<string>();
      const out: MergedBatch[] = [];
      try {
        for (const m of maps) {
          this.ensureItemLabel(m.plaidItemId);
          const { batches, error } = await fetchPendingImportBatches(
            this.bookId,
            m.plaidItemId,
            {
              plaidAccountId: m.plaidAccountId,
              limit: 30,
              promptTotp: () => this.promptBankFeedTotp(),
            }
          );
          if (error) {
            this.batchesError = error;
            this.mergedBatches = [];
            return;
          }
          for (const b of batches) {
            if (seen.has(b.public_id)) {
              continue;
            }
            seen.add(b.public_id);
            out.push({
              ...b,
              itemId: m.plaidItemId,
              itemLabel: this.itemLabels[m.plaidItemId] ?? m.plaidItemId,
            });
          }
        }
        this.mergedBatches = out;
      } finally {
        this.batchesLoading = false;
      }
    },
    ensureItemLabel(itemId: string) {
      if (this.itemLabels[itemId] || !this.bookId) {
        return;
      }
      this.itemLabels = { ...this.itemLabels, [itemId]: itemId };
    },
    isBatchUnmapped(b: MergedBatch): boolean {
      const aid = b.plaid_account_id;
      if (!aid) {
        return false;
      }
      return !this.mappedPlaidAccountIds.has(`${b.itemId}\x1f${aid}`);
    },
    /**
     * Apply every pending Plaid batch whose Plaid sub-account is mapped, then
     * leave the unmapped ones alone. Failures are reported via the existing
     * `recentApplyFailures` banner; we don't bubble per-batch toasts because
     * this runs implicitly when the user lands on the page.
     */
    async ensurePlaidCatchUpAllowed(): Promise<boolean> {
      if (this.plaidCatchUpOverride) {
        return true;
      }
      const last = await getLastSuccessfulPlaidApplyAt(fyo);
      const decision = evaluatePlaidCatchUp({
        lastSuccessfulPlaidApplyAt: last,
        oldestPendingCreatedAt: oldestCreatedAt(
          this.mergedBatches.map((b) => b.created_at)
        ),
        pendingBatchCount: this.mergedBatches.length,
      });
      if (!decision.allow) {
        this.plaidCatchUpBlocked = decision;
        this.plaidCatchUpWarning = '';
        return false;
      }
      this.plaidCatchUpBlocked = null;
      this.plaidCatchUpWarning = decision.warning ?? '';
      return true;
    },
    async pullPlaidAnyway() {
      this.plaidCatchUpOverride = true;
      this.plaidCatchUpBlocked = null;
      await this.pullPlaidBatchesNow();
    },
    async autoApplyPendingBatches() {
      if (!this.bookId || !this.mergedBatches.length) {
        return;
      }
      if (!(await this.ensurePlaidCatchUpAllowed())) {
        return;
      }
      const applicable = this.mergedBatches.filter(
        (b) => !this.isBatchUnmapped(b)
      );
      if (!applicable.length) {
        return;
      }
      this.autoApplyBusy = true;
      const fresh: RetractedMatchedRow[] = [];
      try {
        // Bulk-fetch payloads in chunks of 30 (server cap) so a long-offline
        // catch-up does one POST instead of N GETs.
        const BULK_CAP = 30;
        for (let i = 0; i < applicable.length; i += BULK_CAP) {
          const slice = applicable.slice(i, i + BULK_CAP);
          const ids = slice.map((b) => b.public_id);
          const itemIdByPublicId = new Map(
            slice.map((b) => [b.public_id, b.itemId])
          );
          const { batches, error } = await bulkFetchImportBatchPayloads(
            this.bookId,
            ids,
            { promptTotp: () => this.promptBankFeedTotp() }
          );
          if (error || !batches.length) {
            // Fall back to per-batch fetch so a transient bulk failure doesn't
            // strand the whole catch-up window.
            for (const b of slice) {
              const outcome = await applyPlaidBatch(
                this.bookId,
                b.public_id,
                b.itemId
              );
              this.collectRetractedFromOutcome(outcome, fresh);
            }
            continue;
          }
          const found = new Set(batches.map((r) => r.public_id));
          for (const row of batches) {
            const itemId = itemIdByPublicId.get(row.public_id);
            if (!itemId) {
              continue;
            }
            const outcome = await applyPlaidBatchWithPayload(
              this.bookId,
              row.public_id,
              itemId,
              row.payload
            );
            this.collectRetractedFromOutcome(outcome, fresh);
          }
          // Anything bulk_show didn't return: best-effort per-batch fetch.
          for (const b of slice) {
            if (found.has(b.public_id)) {
              continue;
            }
            const outcome = await applyPlaidBatch(
              this.bookId,
              b.public_id,
              b.itemId
            );
            this.collectRetractedFromOutcome(outcome, fresh);
          }
        }
      } finally {
        this.autoApplyBusy = false;
      }
      if (fresh.length) {
        // Merge into a per-externalId-deduped list so a re-run of an applied
        // batch doesn't grow the banner forever.
        const seen = new Set(this.retractedMatched.map((r) => r.externalId));
        const merged = this.retractedMatched.slice();
        for (const r of fresh) {
          if (seen.has(r.externalId)) {
            continue;
          }
          seen.add(r.externalId);
          merged.push(r);
        }
        this.retractedMatched = merged;
        this.retractedBannerDismissed = false;
      }
    },
    collectRetractedFromOutcome(
      outcome: PlaidApplyOutcome,
      sink: RetractedMatchedRow[]
    ) {
      if (outcome.ok && outcome.retractedMatched.length) {
        for (const r of outcome.retractedMatched) {
          sink.push(r);
        }
      }
    },
    dismissRetractedBanner() {
      this.retractedBannerDismissed = true;
    },
    async pullPlaidBatchesNow() {
      if (!this.bookId || this.accountKind !== 'plaid') {
        return;
      }
      if (!(await this.ensurePlaidCatchUpAllowed())) {
        return;
      }
      this.manualPullBusy = true;
      try {
        const maps = await loadPlaidAccountMaps();
        const mine = maps.filter((m) => m.chartAccount === this.accountTitle);
        this.mappedPlaidAccountIds = new Set(
          maps.map((m) => `${m.plaidItemId}\x1f${m.plaidAccountId}`)
        );
        await this.loadRecentFailures(mine);
        await this.loadBatchesForAccount(mine);
        await this.autoApplyPendingBatches();
        await this.loadManualLines();
        await this.refreshCandidates();
        await this.loadGlBalance();
        await this.loadActivitySummaryRow(mine);
        showToast({
          type: 'success',
          message: t`Bank feed updates applied to For Review.`,
          duration: 'short',
        });
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message || t`Pull failed.`,
        });
      } finally {
        this.manualPullBusy = false;
      }
    },
    goToBankFeedSettings() {
      void routeTo('/bank-feeds/settings');
    },
    async reload() {
      if (this.refreshing) {
        return;
      }
      this.refreshing = true;
      try {
        await this.bootstrap();
      } finally {
        this.refreshing = false;
      }
    },
    async loadActivitySummaryRow(mine?: PlaidMapRow[]) {
      if (this.accountKind === 'manual') {
        this.summaryBankAccountName =
          this.ledgerAccountLabel || this.accountTitle;
        this.summaryBankBalanceLabel = null;
        this.summaryLastSyncLabel = null;
        this.summaryInstitutionCaption = t`Manual banks`;
        this.summaryConnectionHealth = null;
        this.summaryPendingAtBank = 0;
        return;
      }
      if (this.accountKind !== 'plaid') {
        return;
      }
      const maps = mine ?? [];
      if (!maps.length || !this.bookId) {
        this.summaryBankAccountName =
          this.ledgerAccountLabel || this.accountTitle;
        this.summaryBankBalanceLabel = null;
        this.summaryLastSyncLabel = null;
        this.summaryInstitutionCaption = !this.bookId
          ? t`Plaid connection`
          : '';
        this.summaryConnectionHealth = null;
        this.summaryPendingAtBank = 0;
        return;
      }
      const m0 = maps[0];
      const feedItem = this.plaidFeedItemsCache.find(
        (i) => i.item_id === m0.plaidItemId
      );
      const institution =
        feedItem &&
        feedItem.institution_name &&
        feedItem.institution_name.trim()
          ? feedItem.institution_name.trim()
          : feedItem?.item_id ?? m0.plaidItemId;
      this.summaryInstitutionCaption = institution;
      this.summaryConnectionHealth = feedItem?.health ?? null;
      this.summaryPendingAtBank = feedItem?.last_pending_dropped_count ?? 0;
      const lastSync =
        feedItem?.last_sync_at != null
          ? this.formatActivityLocalTimestamp(feedItem.last_sync_at)
          : null;
      let bankName = this.accountTitle;
      let bankBal: string | null = null;
      try {
        const { accounts } = await fetchPlaidLinkedAccounts(
          this.bookId,
          m0.plaidItemId
        );
        const acc = accounts.find((a) => a.account_id === m0.plaidAccountId);
        if (acc) {
          bankName = formatPlaidAccountLabel(acc);
          bankBal = this.formatActivityBankBalance(acc);
        }
      } catch {
        /* keep fallback */
      }
      this.summaryBankAccountName = bankName;
      this.summaryBankBalanceLabel = bankBal;
      this.summaryLastSyncLabel = lastSync;
    },
    formatActivityLocalTimestamp(iso: string | null): string | null {
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
    formatActivityBankBalance(acc: PlaidLinkedAccountRow): string | null {
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
  },
});
</script>
