import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { InvoiceAgingReport } from 'reports/Aging/InvoiceAgingReport';

export class AccountsReceivableAging extends InvoiceAgingReport {
  static title = t`Accounts Receivable Aging (invoice date)`;
  static reportName = 'accounts-receivable-aging';

  readonly invoiceSchema = ModelNameEnum.SalesInvoice;
  readonly partyFilterLabel = t`Customer`;
  readonly partyColumnLabel = t`Customer`;
}
