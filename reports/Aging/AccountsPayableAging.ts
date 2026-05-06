import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { InvoiceAgingReport } from 'reports/Aging/InvoiceAgingReport';

export class AccountsPayableAging extends InvoiceAgingReport {
  static title = t`Accounts Payable Aging (invoice date)`;
  static reportName = 'accounts-payable-aging';

  readonly invoiceSchema = ModelNameEnum.PurchaseInvoice;
  readonly partyFilterLabel = t`Supplier`;
  readonly partyColumnLabel = t`Supplier`;
}
