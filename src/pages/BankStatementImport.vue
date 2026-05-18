<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="pageTitle" />
    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
        max-w-4xl
        space-y-6
      "
    >
      <section
        v-if="fromReconcile"
        class="border rounded-lg p-4 dark:border-gray-700 space-y-3"
      >
        <h2 class="text-sm font-medium">{{ t`Statement setup` }}</h2>
        <p class="text-xs text-gray-600 dark:text-gray-400">
          {{
            t`Enter the period end and closing balance from your bank PDF. After you import CSV lines below, the reconcile workbench compares line totals to this balance.`
          }}
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">{{
              t`Statement end date`
            }}</label>
            <input
              v-model="setupToDate"
              type="date"
              class="
                border
                rounded
                px-2
                py-1
                w-full
                max-w-md
                dark:bg-gray-900 dark:border-gray-700
              "
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">{{
              t`Ending balance`
            }}</label>
            <input
              v-model="setupEndingBalance"
              type="text"
              inputmode="decimal"
              class="
                border
                rounded
                px-2
                py-1
                w-full
                max-w-md
                dark:bg-gray-900 dark:border-gray-700
              "
              :placeholder="t`e.g. 5200.00`"
            />
          </div>
        </div>
      </section>

      <div
        v-if="reconcileBanner"
        class="
          rounded-lg
          border border-amber-200
          bg-amber-50
          dark:bg-amber-900/20 dark:border-amber-800
          p-3
          text-sm text-amber-950
          dark:text-amber-100
        "
      >
        {{ reconcileBanner }}
      </div>
      <section
        v-if="cloudBookId && !fromReconcile"
        class="border rounded-lg p-4 dark:border-gray-700"
      >
        <h2 class="text-sm font-medium mb-2">
          {{ t`Plaid statements (cloud)` }}
        </h2>
        <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
          {{
            t`Sync stores official PDFs from Plaid in LiveBooks Cloud (book owner). Use period dates when importing lines from your own CSV export.`
          }}
        </p>
        <Button class="me-2" type="secondary" @click="loadCloudFiles">
          {{ t`Refresh list` }}
        </Button>
        <Button type="secondary" @click="syncCloudStatements">
          {{ t`Sync from Plaid` }}
        </Button>
        <p
          v-if="cloudMsg"
          class="text-xs mt-2 text-gray-700 dark:text-gray-300"
        >
          {{ cloudMsg }}
        </p>
        <ul v-if="cloudFiles.length" class="mt-3 text-xs space-y-1 font-mono">
          <li v-for="f in cloudFiles" :key="f.id">
            {{ f.statement_id }} · {{ f.period_start }} → {{ f.period_end }} ·
            PDF: {{ f.pdf ? t`yes` : t`no` }}
          </li>
        </ul>
      </section>

      <div>
        <label class="block text-sm font-medium mb-1">{{
          t`Bank account`
        }}</label>
        <select
          v-model="bankAccount"
          :disabled="bankAccountLocked"
          class="
            border
            rounded
            px-2
            py-1
            w-full
            max-w-md
            dark:bg-gray-900 dark:border-gray-700
          "
        >
          <option value="">{{ t`Select…` }}</option>
          <option v-for="a in bankAccounts" :key="a.name" :value="a.name">
            {{ accountLabel(a) }}
          </option>
        </select>
      </div>

      <div>
        <Button type="secondary" @click="pickFile">{{
          t`Upload bank file`
        }}</Button>
        <span v-if="fileName" class="ms-2 text-sm">{{ fileName }}</span>
      </div>

      <!-- First rows preview (CSV bank feed): above column mapping -->
      <div v-if="isFeedCsvMapping && matrixSampleRows.length" class="space-y-2">
        <h2 class="text-sm font-medium">{{ t`Your file (first rows)` }}</h2>
        <div
          class="
            max-h-40
            overflow-auto
            border
            dark:border-gray-700
            rounded
            text-xs
          "
        >
          <table class="min-w-full text-start">
            <thead>
              <tr>
                <th
                  v-for="(h, i) in headers"
                  :key="'sh' + i"
                  class="text-start p-1 border-b"
                >
                  {{ h || '(' + i + ')' }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in matrixSampleRows" :key="'sr' + ri">
                <td
                  v-for="(cell, ci) in row"
                  :key="'sc' + ri + '-' + ci"
                  class="p-1 border-b text-start"
                >
                  {{ cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="fileKind === 'ofx' && ofxParsed.length" class="space-y-2">
        <h2 class="text-sm font-medium">{{ t`Preview` }}</h2>
        <p class="text-xs text-gray-600 dark:text-gray-400">
          {{ t`${ofxParsed.length} transaction(s) ready to import.` }}
        </p>
      </div>

      <div v-if="headers.length && fileKind === 'csv'" class="space-y-2">
        <h2 class="text-sm font-medium">{{ t`Column mapping` }}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <label>{{ t`Which column is the Date?` }}</label>
            <select
              v-model="idxDate"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option v-for="(h, i) in headers" :key="'d' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Which column is the Description?` }}</label>
            <select
              v-model="idxDesc"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option v-for="(h, i) in headers" :key="'s' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Which column is the Amount?` }}</label>
            <select
              v-model="idxAmount"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">
                {{ t`— use debit/credit (advanced) —` }}
              </option>
              <option v-for="(h, i) in headers" :key="'a' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
        </div>
        <button
          v-if="isFeedCsvMapping"
          type="button"
          class="text-xs text-blue-600 dark:text-blue-400 underline"
          @click="showAdvancedCsv = !showAdvancedCsv"
        >
          {{
            showAdvancedCsv
              ? t`Hide debit/credit and reference columns`
              : t`Show debit/credit and reference columns`
          }}
        </button>
        <div
          v-if="!isFeedCsvMapping || showAdvancedCsv"
          class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
        >
          <div>
            <label>{{ t`Debit column (optional)` }}</label>
            <select
              v-model="idxDebit"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">{{ t`—` }}</option>
              <option v-for="(h, i) in headers" :key="'db' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Credit column (optional)` }}</label>
            <select
              v-model="idxCredit"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">{{ t`—` }}</option>
              <option v-for="(h, i) in headers" :key="'cr' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Reference column (optional)` }}</label>
            <select
              v-model="idxRef"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">{{ t`—` }}</option>
              <option v-for="(h, i) in headers" :key="'r' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div
        v-if="!previewRows.length && previewSkippedSummary && fileName"
        class="text-sm text-amber-800 dark:text-amber-200"
      >
        {{ t`Nothing new to import.` }} {{ previewSkippedSummary }}
      </div>

      <div v-if="fileKind === 'csv' && previewRows.length">
        <h2 class="text-sm font-medium mb-2">
          {{ t`Preview` }} ({{ previewRows.length }})
        </h2>
        <p
          v-if="previewSkippedSummary"
          class="text-xs text-amber-700 dark:text-amber-300 mb-2"
        >
          {{ previewSkippedSummary }}
        </p>
        <div
          class="
            max-h-48
            overflow-auto
            border
            dark:border-gray-700
            rounded
            text-xs
          "
        >
          <table class="min-w-full text-start">
            <thead>
              <tr>
                <th class="text-start p-1 border-b">{{ t`Date` }}</th>
                <th class="text-start p-1 border-b">{{ t`Description` }}</th>
                <th class="text-start p-1 border-b">{{ t`Amount` }}</th>
                <th
                  v-if="
                    isFeedWindow && previewRows.some((r) => r.possibleDuplicate)
                  "
                  class="text-start p-1 border-b"
                >
                  {{ t`Note` }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in previewRows.slice(0, 15)" :key="i">
                <td class="p-1 border-b text-start">{{ r.date }}</td>
                <td class="p-1 border-b text-start">{{ r.description }}</td>
                <td class="p-1 border-b text-start">{{ r.amount }}</td>
                <td
                  v-if="
                    isFeedWindow && previewRows.some((x) => x.possibleDuplicate)
                  "
                  class="
                    p-1
                    border-b
                    text-start text-amber-800
                    dark:text-amber-200
                  "
                >
                  {{ r.possibleDuplicate ? t`Possible duplicate` : '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Button type="primary" :disabled="!canSave" @click="saveStatement">
        {{
          isFeedWindow && !fromReconcile
            ? t`Import transactions`
            : t`Save statement`
        }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT } from 'src/utils/livebooksCloud';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import { promptPlaidMfaTotp } from 'src/utils/plaidBankFeedsApi';
import {
  fetchCloudStatementFiles,
  syncCloudStatementFiles,
  type CloudStatementFileRow,
} from 'src/utils/plaidStatementFilesApi';
import { selectTextFile } from 'src/utils/ui';
import { routeTo } from 'src/utils/ui';
import {
  feedDateAmountKey,
  loadExistingDateAmountKeysForFeed,
} from 'src/utils/bankFeedHelpers';
import { parseOfxBankFile, type OfxParsedRow } from 'src/utils/ofxBankImport';
import { parseCSV } from 'utils/csvParser';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { accountDisplayName } from 'utils/accountDisplay';
import { defineComponent } from 'vue';

const RECON_HINT_KEY = 'lbReconcileStatementHint';

type Row = {
  date: string;
  description: string;
  amount: number;
  ref: string;
  hash: string;
  possibleDuplicate: boolean;
};

type CsvMapTemplate = {
  idxDate: number;
  idxDesc: number;
  idxAmount: number;
  idxDebit: number;
  idxCredit: number;
  idxRef: number;
  headerSignature: string;
};

function csvMapKey(bankAccount: string): string {
  return `lbCsvMap:${bankAccount}`;
}

function headerSignatureFor(headers: string[]): string {
  return headers
    .map((h) => (h ?? '').trim().toLowerCase())
    .join('||');
}

function readCsvTemplate(bankAccount: string): CsvMapTemplate | null {
  if (!bankAccount) {
    return null;
  }
  try {
    const raw = localStorage.getItem(csvMapKey(bankAccount));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CsvMapTemplate>;
    if (
      typeof parsed.idxDate !== 'number' ||
      typeof parsed.idxDesc !== 'number' ||
      typeof parsed.idxAmount !== 'number' ||
      typeof parsed.idxDebit !== 'number' ||
      typeof parsed.idxCredit !== 'number' ||
      typeof parsed.idxRef !== 'number' ||
      typeof parsed.headerSignature !== 'string'
    ) {
      return null;
    }
    return parsed as CsvMapTemplate;
  } catch {
    return null;
  }
}

function writeCsvTemplate(bankAccount: string, template: CsvMapTemplate) {
  if (!bankAccount) {
    return;
  }
  try {
    localStorage.setItem(csvMapKey(bankAccount), JSON.stringify(template));
  } catch {
    // localStorage may be full or disabled; ignore.
  }
}

function parseRowDate(raw: string): string {
  if (!raw) {
    return '';
  }
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return '';
}

export default defineComponent({
  name: 'BankStatementImport',
  components: { PageHeader, Button },
  data() {
    return {
      bankAccount: '',
      bankAccounts: [] as { name: string; accountName?: string }[],
      matrix: [] as string[][],
      fileName: '',
      idxDate: 0,
      idxDesc: 1,
      idxAmount: -1,
      idxDebit: -1,
      idxCredit: -1,
      idxRef: -1,
      cloudBookId: '' as string,
      cloudFiles: [] as CloudStatementFileRow[],
      cloudMsg: '' as string,
      fromReconcile: false,
      reconcileBanner: '' as string,
      setupToDate: '' as string,
      setupEndingBalance: '' as string,
      kindFromRoute: '' as '' | 'feed_window' | 'month_end',
      returnTo: '' as '' | 'activity',
      duplicateCount: 0,
      invalidDateCount: 0,
      existingDateAmountKeys: new Set<string>(),
      fileKind: '' as '' | 'csv' | 'ofx',
      ofxParsed: [] as OfxParsedRow[],
      showAdvancedCsv: false,
      boundCloudSessionRefresh: null as (() => void) | null,
    };
  },
  computed: {
    isFeedWindow(): boolean {
      return this.kindFromRoute === 'feed_window';
    },
    bankAccountLocked(): boolean {
      return this.returnTo === 'activity' && this.kindFromRoute === 'feed_window';
    },
    isFeedCsvMapping(): boolean {
      return (
        this.isFeedWindow &&
        !this.fromReconcile &&
        this.fileKind === 'csv' &&
        this.headers.length > 0
      );
    },
    matrixSampleRows(): string[][] {
      if (!this.isFeedCsvMapping || this.matrix.length < 2) {
        return [];
      }
      return this.matrix.slice(1, 4);
    },
    pageTitle(): string {
      if (this.fromReconcile) {
        return t`Import bank statement`;
      }
      if (this.isFeedCsvMapping) {
        return t`Match your columns for ${this.bankAccount || '…'}`;
      }
      return t`Import bank statement`;
    },
    headers(): string[] {
      return this.matrix[0] ?? [];
    },
    previewBundle(): {
      rows: Row[];
      duplicateCount: number;
      invalidDateCount: number;
      possibleDupCount: number;
    } {
      return this.computeRows();
    },
    previewRows(): Row[] {
      return this.previewBundle.rows;
    },
    previewSkippedSummary(): string {
      const parts: string[] = [];
      if (this.previewBundle.duplicateCount > 0) {
        parts.push(
          t`${this.previewBundle.duplicateCount} duplicate(s) skipped.`
        );
      }
      if (this.previewBundle.invalidDateCount > 0) {
        parts.push(
          t`${this.previewBundle.invalidDateCount} row(s) with invalid dates skipped.`
        );
      }
      if (
        this.isFeedWindow &&
        this.previewBundle.possibleDupCount > 0
      ) {
        parts.push(
          t`${this.previewBundle.possibleDupCount} row(s) will be marked as possible duplicates.`
        );
      }
      return parts.join(' ');
    },
    reconcileSetupComplete(): boolean {
      if (!this.fromReconcile) {
        return true;
      }
      if (!this.bankAccount || !this.setupToDate.trim()) {
        return false;
      }
      const raw = this.setupEndingBalance.trim().replace(/,/g, '');
      const ending = Number.parseFloat(raw);
      return Number.isFinite(ending);
    },
    canSave(): boolean {
      if (!this.bankAccount || !this.reconcileSetupComplete) {
        return false;
      }
      if (this.fileKind === 'ofx') {
        return this.ofxParsed.length > 0;
      }
      return this.matrix.length > 1 && this.previewRows.length > 0;
    },
  },
  watch: {
    bankAccount: {
      handler() {
        void this.refreshExistingDupKeys();
        if (this.fromReconcile) {
          this.loadReconcileSetupForCurrentBank();
        }
      },
    },
    setupToDate() {
      if (this.fromReconcile) {
        this.refreshReconcileBannerAndPersist();
      }
    },
    setupEndingBalance() {
      if (this.fromReconcile) {
        this.refreshReconcileBannerAndPersist();
      }
    },
  },
  async mounted() {
    await this.loadBankAccounts();
    this.applyRouteQuery();
    const ctx = await ensureLivebooksCloudBookId(fyo);
    if (ctx.ok) {
      this.cloudBookId = ctx.bookId;
      await this.loadCloudFiles();
    }
    this.boundCloudSessionRefresh = () => {
      void this.refreshCloudBookContext();
    };
    document.addEventListener(
      LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
      this.boundCloudSessionRefresh
    );
  },
  beforeUnmount() {
    if (this.boundCloudSessionRefresh) {
      document.removeEventListener(
        LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
        this.boundCloudSessionRefresh
      );
    }
  },
  methods: {
    t,
    accountLabel(a: { name: string; accountName?: string }) {
      return accountDisplayName(a);
    },
    applyRouteQuery() {
      const q = this.$route.query as Record<string, unknown>;
      if (typeof q.bankAccount === 'string' && q.bankAccount) {
        try {
          const dec = decodeURIComponent(q.bankAccount);
          if (this.bankAccounts.some((a) => a.name === dec)) {
            this.bankAccount = dec;
          }
        } catch {
          // Ignore malformed encoding.
        }
      }
      if (q.fromReconcile === '1' || q.fromReconcile === 1) {
        this.fromReconcile = true;
      }
      if (q.kind === 'feed_window') {
        this.kindFromRoute = 'feed_window';
      } else if (q.kind === 'month_end') {
        this.kindFromRoute = 'month_end';
      }
      if (q.returnTo === 'activity') {
        this.returnTo = 'activity';
      }
      void this.refreshExistingDupKeys();
      if (this.fromReconcile) {
        this.loadReconcileSetupForCurrentBank();
      }
    },
    todayIso(): string {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },
    loadReconcileSetupForCurrentBank() {
      if (!this.fromReconcile) {
        return;
      }
      if (!this.bankAccount) {
        this.setupToDate = this.todayIso();
        this.setupEndingBalance = '';
        this.refreshReconcileBannerAndPersist();
        return;
      }
      try {
        const raw = sessionStorage.getItem(RECON_HINT_KEY);
        if (raw) {
          const o = JSON.parse(raw) as {
            bankAccount?: string;
            toDate?: string;
            endingBalance?: number;
          };
          if (o.bankAccount === this.bankAccount) {
            this.setupToDate = o.toDate
              ? String(o.toDate).slice(0, 10)
              : this.todayIso();
            this.setupEndingBalance =
              o.endingBalance != null ? String(o.endingBalance) : '';
            this.refreshReconcileBannerAndPersist();
            return;
          }
        }
      } catch {
        /* ignore */
      }
      this.setupToDate = this.todayIso();
      this.setupEndingBalance = '';
      this.refreshReconcileBannerAndPersist();
    },
    refreshReconcileBannerAndPersist() {
      if (!this.fromReconcile) {
        this.reconcileBanner = '';
        return;
      }
      if (!this.bankAccount) {
        this.reconcileBanner = t`Select a bank account below. Then enter the statement end date and closing balance from your PDF before saving.`;
        return;
      }
      if (!this.setupToDate.trim()) {
        this.reconcileBanner = t`Enter the statement end date from your PDF.`;
        return;
      }
      const rawBal = this.setupEndingBalance.trim().replace(/,/g, '');
      const ending = Number.parseFloat(rawBal);
      if (!Number.isFinite(ending)) {
        this.reconcileBanner = t`Enter the closing balance from your PDF (for example 5200.00).`;
        return;
      }
      const bal = fyo.format(ending, 'Currency');
      const dt = this.setupToDate.slice(0, 10);
      this.reconcileBanner = `${t`Period ending`} ${dt}. ${t`PDF closing balance`} ${bal}.`;
      try {
        sessionStorage.setItem(
          RECON_HINT_KEY,
          JSON.stringify({
            bankAccount: this.bankAccount,
            toDate: this.setupToDate,
            endingBalance: ending,
          })
        );
      } catch {
        /* ignore quota */
      }
    },
    async refreshExistingDupKeys() {
      if (!this.bankAccount || this.kindFromRoute !== 'feed_window') {
        this.existingDateAmountKeys = new Set();
        return;
      }
      try {
        this.existingDateAmountKeys = await loadExistingDateAmountKeysForFeed(
          this.bankAccount
        );
      } catch {
        this.existingDateAmountKeys = new Set();
      }
    },
    async loadBankAccounts() {
      const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'accountName'],
        filters: { accountType: AccountTypeEnum.Bank, isGroup: false },
      })) as { name: string; accountName?: string }[];
      this.bankAccounts = rows;
    },
    async refreshCloudBookContext() {
      this.cloudBookId = '';
      this.cloudFiles = [];
      this.cloudMsg = '';
      const ctx = await ensureLivebooksCloudBookId(fyo);
      if (ctx.ok) {
        this.cloudBookId = ctx.bookId;
        await this.loadCloudFiles();
      }
    },
    async loadCloudFiles() {
      if (!this.cloudBookId) {
        return;
      }
      this.cloudMsg = '';
      const { files, error } = await fetchCloudStatementFiles(this.cloudBookId);
      if (error) {
        this.cloudMsg = error;
        return;
      }
      this.cloudFiles = files;
    },
    async syncCloudStatements() {
      if (!this.cloudBookId) {
        return;
      }
      this.cloudMsg = t`Syncing…`;
      const { ok, error, data } = await syncCloudStatementFiles(
        this.cloudBookId,
        undefined,
        {
          promptTotp: () =>
            promptPlaidMfaTotp(
              t`Enter your LiveBooks Cloud authenticator or backup code to sync bank statements.`
            ),
        }
      );
      if (!ok) {
        this.cloudMsg = error ?? t`Sync failed`;
        showToast({ type: 'error', message: this.cloudMsg });
        return;
      }
      const created =
        data && typeof data === 'object' && 'created' in data
          ? Number((data as { created: unknown }).created)
          : 0;
      this.cloudMsg = t`Done. New files: ${String(created)}`;
      showToast({ type: 'success', message: this.cloudMsg });
      await this.loadCloudFiles();
    },
    async pickFile() {
      const { text, name } = await selectTextFile([
        {
          name: 'Bank files',
          extensions: ['csv', 'txt', 'qbo', 'qfx', 'ofx'],
        },
      ]);
      if (!text) {
        return;
      }
      this.fileName = name || '';
      const lower = (name || '').toLowerCase();
      const isOfx = /\.(qbo|qfx|ofx)$/i.test(lower);
      if (isOfx) {
        const parsed = parseOfxBankFile(text);
        if (!parsed.ok) {
          showToast({ type: 'error', message: parsed.error });
          return;
        }
        this.fileKind = 'ofx';
        this.ofxParsed = parsed.rows;
        this.matrix = [];
        this.showAdvancedCsv = false;
      } else {
        this.fileKind = 'csv';
        this.ofxParsed = [];
        this.matrix = parseCSV(text);
        const cached = readCsvTemplate(this.bankAccount);
        const sig = headerSignatureFor(this.headers);
        if (cached && cached.headerSignature === sig) {
          this.idxDate = cached.idxDate;
          this.idxDesc = cached.idxDesc;
          this.idxAmount = cached.idxAmount;
          this.idxDebit = cached.idxDebit;
          this.idxCredit = cached.idxCredit;
          this.idxRef = cached.idxRef;
        } else {
          this.guessColumns();
        }
      }
      await this.refreshExistingDupKeys();
    },
    guessColumns() {
      const h = this.headers.map((x) => x.toLowerCase());
      const find = (pred: (s: string) => boolean) =>
        h.findIndex((s) => pred(s));
      const d = find((s) => s.includes('date'));
      const s = find((s) => s.includes('desc') || s.includes('memo') || s.includes('narration'));
      const a = find((s) => s === 'amount' || s.includes('net'));
      const db = find((s) => s.includes('debit'));
      const cr = find((s) => s.includes('credit'));
      const rf = find((s) => s.includes('ref') || s.includes('check'));
      if (d >= 0) {
        this.idxDate = d;
      }
      if (s >= 0) {
        this.idxDesc = s;
      }
      if (a >= 0) {
        this.idxAmount = a;
      }
      if (db >= 0) {
        this.idxDebit = db;
      }
      if (cr >= 0) {
        this.idxCredit = cr;
      }
      if (rf >= 0) {
        this.idxRef = rf;
      }
    },
    rowAmount(cols: string[]): number {
      const ia = Number(this.idxAmount);
      if (ia >= 0) {
        const v = cols[ia]?.replace(/,/g, '') ?? '0';
        return Number.parseFloat(v) || 0;
      }
      const idb = Number(this.idxDebit);
      const icr = Number(this.idxCredit);
      const d =
        idb >= 0
          ? Number.parseFloat((cols[idb] ?? '0').replace(/,/g, '')) || 0
          : 0;
      const c =
        icr >= 0
          ? Number.parseFloat((cols[icr] ?? '0').replace(/,/g, '')) || 0
          : 0;
      return d - c;
    },
    computeRows(): {
      rows: Row[];
      duplicateCount: number;
      invalidDateCount: number;
      possibleDupCount: number;
    } {
      if (this.matrix.length < 2) {
        return {
          rows: [],
          duplicateCount: 0,
          invalidDateCount: 0,
          possibleDupCount: 0,
        };
      }
      const dataRows = this.matrix.slice(1);
      const out: Row[] = [];
      const di = Number(this.idxDate);
      const dsi = Number(this.idxDesc);
      const ri = Number(this.idxRef);
      let invalidDateCount = 0;
      let duplicateCount = 0;
      const feed = this.kindFromRoute === 'feed_window';

      if (feed) {
        const seenDateAmt = new Set<string>();
        for (const cols of dataRows) {
          if (!cols.length) {
            continue;
          }
          const dateRaw = cols[di] ?? '';
          const desc = cols[dsi] ?? '';
          const amt = this.rowAmount(cols);
          const ref = ri >= 0 ? (cols[ri] ?? '').trim() : '';
          const date = parseRowDate(dateRaw);
          if (!date) {
            invalidDateCount += 1;
            continue;
          }
          const hash = simpleHash([date, desc, String(amt), ref].join('|'));
          const dk = feedDateAmountKey(date, amt);
          const possibleDuplicate =
            this.existingDateAmountKeys.has(dk) || seenDateAmt.has(dk);
          seenDateAmt.add(dk);
          out.push({
            date,
            description: desc,
            amount: amt,
            ref,
            hash,
            possibleDuplicate,
          });
        }
        const possibleDupCount = out.filter((r) => r.possibleDuplicate).length;
        return {
          rows: out,
          duplicateCount: 0,
          invalidDateCount,
          possibleDupCount,
        };
      }

      const seen = new Set<string>();
      for (const cols of dataRows) {
        if (!cols.length) {
          continue;
        }
        const dateRaw = cols[di] ?? '';
        const desc = cols[dsi] ?? '';
        const amt = this.rowAmount(cols);
        const ref = ri >= 0 ? (cols[ri] ?? '').trim() : '';
        const date = parseRowDate(dateRaw);
        if (!date) {
          invalidDateCount += 1;
          continue;
        }
        const hash = simpleHash([date, desc, String(amt), ref].join('|'));
        if (seen.has(hash)) {
          duplicateCount += 1;
          continue;
        }
        seen.add(hash);
        out.push({
          date,
          description: desc,
          amount: amt,
          ref,
          hash,
          possibleDuplicate: false,
        });
      }
      return {
        rows: out,
        duplicateCount,
        invalidDateCount,
        possibleDupCount: 0,
      };
    },
    buildOfxSaveRows(): Row[] {
      const seenDateAmt = new Set<string>();
      const out: Row[] = [];
      for (const r of this.ofxParsed) {
        const ref = r.fitid || '';
        const hash = simpleHash(
          [r.date, r.description, String(r.amount), ref].join('|')
        );
        const dk = feedDateAmountKey(r.date, r.amount);
        const possibleDuplicate =
          this.existingDateAmountKeys.has(dk) || seenDateAmt.has(dk);
        seenDateAmt.add(dk);
        out.push({
          date: r.date,
          description: r.description,
          amount: r.amount,
          ref,
          hash,
          possibleDuplicate,
        });
      }
      return out;
    },
    buildRows(): Row[] {
      return this.computeRows().rows;
    },
    saveCsvTemplate() {
      if (!this.bankAccount || !this.headers.length) {
        return;
      }
      writeCsvTemplate(this.bankAccount, {
        idxDate: Number(this.idxDate),
        idxDesc: Number(this.idxDesc),
        idxAmount: Number(this.idxAmount),
        idxDebit: Number(this.idxDebit),
        idxCredit: Number(this.idxCredit),
        idxRef: Number(this.idxRef),
        headerSignature: headerSignatureFor(this.headers),
      });
    },
    async saveStatement() {
      if (this.fromReconcile) {
        this.refreshReconcileBannerAndPersist();
      }
      if (!this.reconcileSetupComplete) {
        showToast({
          type: 'error',
          message: t`Enter the statement end date and closing balance from your PDF.`,
        });
        return;
      }
      await this.refreshExistingDupKeys();
      let rows: Row[];
      let duplicateCount = 0;
      let invalidDateCount = 0;
      if (this.fileKind === 'ofx') {
        rows = this.buildOfxSaveRows();
      } else {
        const bundle = this.computeRows();
        rows = bundle.rows;
        duplicateCount = bundle.duplicateCount;
        invalidDateCount = bundle.invalidDateCount;
      }
      this.duplicateCount = duplicateCount;
      this.invalidDateCount = invalidDateCount;
      if (!rows.length) {
        if (duplicateCount > 0 && !this.isFeedWindow) {
          showToast({
            type: 'info',
            message: t`Nothing new to import. All rows are already on file.`,
          });
        } else {
          showToast({ type: 'error', message: t`No rows to import.` });
        }
        return;
      }
      const dates = rows.map((r) => r.date).sort();
      const isFeed = this.kindFromRoute === 'feed_window';
      const doc = fyo.doc.getNewDoc(ModelNameEnum.BankStatement);
      await doc.set('bankAccount', this.bankAccount);
      await doc.set('fromDate', dates[0]);
      await doc.set('toDate', dates[dates.length - 1]);
      await doc.set('importedAt', new Date());
      await doc.set(
        'source',
        this.fileKind === 'ofx' ? 'manual_ofx' : 'manual_csv'
      );
      await doc.set('sourceFilename', this.fileName || '');
      await doc.set('kind', isFeed ? 'feed_window' : 'month_end');
      await doc.set('status', 'Open');
      for (const r of rows) {
        await doc.append('lines', {
          date: r.date,
          description: r.description,
          amount: fyo.pesa(r.amount),
          bankReference: r.ref,
          matchStatus: 'unmatched',
          contentHash: r.hash,
          possibleDuplicate: Boolean(r.possibleDuplicate),
        });
      }
      try {
        await doc.sync();
      } catch (e) {
        showToast({
          type: 'error',
          message:
            (e as Error).message ||
            t`Couldn't save the statement. Please try again.`,
        });
        return;
      }
      if (this.fileKind === 'csv') {
        this.saveCsvTemplate();
      }
      if (isFeed && this.returnTo === 'activity' && this.bankAccount) {
        showToast({
          type: 'success',
          message: t`Success! ${rows.length} transactions imported.`,
        });
        try {
          await routeTo(
            `/bank-feeds/activity/${encodeURIComponent(
              this.bankAccount
            )}?tab=review`
          );
        } catch {
          showToast({
            type: 'info',
            message: t`Saved. You can navigate back to the bank feed.`,
          });
        }
        return;
      }
      const skipped: string[] = [];
      if (duplicateCount > 0) {
        skipped.push(t`${duplicateCount} duplicate(s) skipped.`);
      }
      if (invalidDateCount > 0) {
        skipped.push(t`${invalidDateCount} row(s) with invalid dates skipped.`);
      }
      const summary = skipped.length
        ? `${t`Imported ${rows.length} transaction(s).`} ${skipped.join(' ')}`
        : t`Imported ${rows.length} transaction(s).`;
      showToast({ type: 'success', message: summary });
      try {
        if (this.bankAccount) {
          await routeTo(
            `/bank-reconcile/${encodeURIComponent(this.bankAccount)}`
          );
        } else {
          await routeTo('/reconcile');
        }
      } catch {
        showToast({
          type: 'info',
          message: t`Saved. You can navigate back to the bank feed.`,
        });
      }
    },
  },
});

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}`;
}
</script>
