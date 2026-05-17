import ChartOfAccounts from 'src/pages/ChartOfAccounts.vue';
import CommonForm from 'src/pages/CommonForm/CommonForm.vue';
import Dashboard from 'src/pages/Dashboard/Dashboard.vue';
import GetStarted from 'src/pages/GetStarted.vue';
import RecoveryMode from 'src/pages/RecoveryMode.vue';
import BankFeedHub from 'src/pages/BankFeedHub.vue';
import BankAccountActivity from 'src/pages/BankAccountActivity.vue';
import BankFeedSettings from 'src/pages/BankFeedSettings.vue';
import BankReconcile from 'src/pages/BankReconcile.vue';
import BankReconcileHub from 'src/pages/BankReconcileHub.vue';
import BankStatementImport from 'src/pages/BankStatementImport.vue';
import ImportListsHub from 'src/pages/ImportListsHub.vue';
import ImportWizard from 'src/pages/ImportWizard.vue';
import ListView from 'src/pages/ListView/ListView.vue';
import PrintView from 'src/pages/PrintView/PrintView.vue';
import ReportPrintView from 'src/pages/PrintView/ReportPrintView.vue';
import QuickEditForm from 'src/pages/QuickEditForm.vue';
import Report from 'src/pages/Report.vue';
import Settings from 'src/pages/Settings/Settings.vue';
import TemplateBuilder from 'src/pages/TemplateBuilder/TemplateBuilder.vue';
import CustomizeForm from 'src/pages/CustomizeForm/CustomizeForm.vue';
import POS from 'src/pages/POS/POS.vue';
import type { HistoryState } from 'vue-router';
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { historyState } from './utils/refs';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Dashboard,
  },
  {
    path: '/get-started',
    component: GetStarted,
  },
  {
    path: '/recovery',
    name: 'Recovery Mode',
    component: RecoveryMode,
  },
  {
    path: `/edit/:schemaName/:name`,
    name: `CommonForm`,
    components: {
      default: CommonForm,
      edit: QuickEditForm,
    },
    props: {
      default: (route) => ({
        schemaName: route.params.schemaName,
        name: route.params.name,
      }),
      edit: (route) => route.query,
    },
  },
  {
    path: '/list/:schemaName/:pageTitle?',
    name: 'ListView',
    components: {
      default: ListView,
      edit: QuickEditForm,
    },
    props: {
      default: (route) => {
        const { schemaName } = route.params;
        const pageTitle = route.params.pageTitle ?? '';

        const filters = {};
        const filterString = route.query.filters;
        if (typeof filterString === 'string') {
          Object.assign(filters, JSON.parse(filterString));
        }

        return {
          schemaName,
          filters,
          pageTitle,
        };
      },
      edit: (route) => route.query,
    },
  },
  {
    path: '/print/:schemaName/:name',
    name: 'PrintView',
    component: PrintView,
    props: true,
  },
  {
    path: '/report-print/:reportName',
    name: 'ReportPrintView',
    component: ReportPrintView,
    props: true,
  },
  {
    path: '/report/:reportClassName',
    name: 'Report',
    component: Report,
    props: true,
  },
  {
    path: '/chart-of-accounts',
    name: 'Chart Of Accounts',
    components: {
      default: ChartOfAccounts,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
  {
    path: '/import-lists',
    name: 'Import Lists',
    component: ImportListsHub,
  },
  {
    path: '/import-wizard',
    name: 'Import Wizard',
    component: ImportWizard,
  },
  {
    path: '/bank-feeds',
    name: 'Bank feeds',
    component: BankFeedHub,
  },
  {
    path: '/bank-feeds/settings',
    name: 'Bank Feed Settings',
    component: BankFeedSettings,
  },
  {
    path: '/bank-feeds/activity/:accountName',
    name: 'Bank Account Activity',
    component: BankAccountActivity,
    props: true,
  },
  {
    path: '/reconcile',
    name: 'Reconcile Hub',
    component: BankReconcileHub,
  },
  {
    path: '/bank-statement-import',
    name: 'Bank Statement Import',
    component: BankStatementImport,
  },
  {
    path: '/bank-reconcile/:name',
    name: 'Bank Reconcile',
    component: BankReconcile,
    props: true,
  },
  {
    path: '/template-builder/:name',
    name: 'Template Builder',
    component: TemplateBuilder,
    props: true,
  },
  {
    path: '/customize-form',
    name: 'Customize Form',
    component: CustomizeForm,
  },
  {
    path: '/settings',
    name: 'Settings',
    components: {
      default: Settings,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
  {
    path: '/pos',
    name: 'Point of Sale',
    components: {
      default: POS,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
];

const router = createRouter({ routes, history: createWebHistory() });

router.afterEach(({ fullPath }) => {
  const state = history.state as HistoryState;
  historyState.forward = !!state.forward;
  historyState.back = !!state.back;

  if (fullPath.includes('index.html')) {
    return;
  }

  localStorage.setItem('lastRoute', fullPath);
});

export default router;
