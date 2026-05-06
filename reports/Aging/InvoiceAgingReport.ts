import { Fyo, t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import {
  bucketAmountsFromOutstanding,
  getInvoiceAgeDays,
  sumMoneyColumns,
} from 'reports/Aging/helpers';
import { ColumnField, ReportCell, ReportData, ReportRow } from 'reports/types';
import { Field, FieldTypeEnum, RawValue } from 'schemas/types';
import { QueryFilter } from 'utils/db/types';

type InvoiceRowRaw = {
  name: string;
  party: string;
  date: string;
  outstandingAmount: string | number;
};

type EnrichedInvoiceRow = InvoiceRowRaw & {
  ageDays: number;
  buckets: Money[];
  outstanding: Money;
};

export abstract class InvoiceAgingReport extends Report {
  loading = false;
  shouldRefresh = false;

  asOfDate?: string;
  party?: string;

  abstract readonly invoiceSchema:
    | ModelNameEnum.SalesInvoice
    | ModelNameEnum.PurchaseInvoice;

  abstract readonly partyFilterLabel: string;
  abstract readonly partyColumnLabel: string;

  constructor(fyo: Fyo) {
    super(fyo);
    this._setObservers();
  }

  _setObservers(): void {
    const listener = () => (this.shouldRefresh = true);
    this.fyo.doc.observer.on(`sync:${ModelNameEnum.SalesInvoice}`, listener);
    this.fyo.doc.observer.on(`sync:${ModelNameEnum.PurchaseInvoice}`, listener);
    this.fyo.doc.observer.on(`delete:${ModelNameEnum.SalesInvoice}`, listener);
    this.fyo.doc.observer.on(
      `delete:${ModelNameEnum.PurchaseInvoice}`,
      listener
    );
  }

  setDefaultFilters(): void {
    if (!this.asOfDate) {
      this.asOfDate = DateTime.now().toISODate();
    }
  }

  getFilters(): Field[] {
    return [
      {
        fieldtype: 'Date',
        label: t`As Of Date`,
        fieldname: 'asOfDate',
        placeholder: t`As Of Date`,
      },
      {
        fieldtype: 'Link',
        target: 'Party',
        label: this.partyFilterLabel,
        fieldname: 'party',
        placeholder: this.partyFilterLabel,
      },
    ];
  }

  getColumns(): ColumnField[] {
    return [
      {
        fieldname: 'idx',
        label: '#',
        fieldtype: 'Int',
        width: 0.45,
        align: 'right',
      },
      {
        fieldname: 'party',
        label: this.partyColumnLabel,
        fieldtype: 'Link',
        target: ModelNameEnum.Party,
        width: 1.5,
      },
      {
        fieldname: 'invoice',
        label: t`Invoice`,
        fieldtype: 'Link',
        target: this.invoiceSchema,
        width: 1,
      },
      {
        fieldname: 'date',
        label: t`Invoice Date`,
        fieldtype: 'Datetime',
        width: 1.15,
      },
      {
        fieldname: 'ageDays',
        label: t`Days`,
        fieldtype: 'Int',
        width: 0.55,
        align: 'right',
      },
      {
        fieldname: 'b0',
        label: t`1–30`,
        fieldtype: 'Currency',
        align: 'right',
        width: 1,
      },
      {
        fieldname: 'b1',
        label: t`31–60`,
        fieldtype: 'Currency',
        align: 'right',
        width: 1,
      },
      {
        fieldname: 'b2',
        label: t`61–90`,
        fieldtype: 'Currency',
        align: 'right',
        width: 1,
      },
      {
        fieldname: 'b3',
        label: t`91+`,
        fieldtype: 'Currency',
        align: 'right',
        width: 1,
      },
      {
        fieldname: 'outstanding',
        label: t`Outstanding`,
        fieldtype: 'Currency',
        align: 'right',
        width: 1.1,
      },
    ];
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  private _formatCell(
    raw: unknown,
    col: ColumnField,
    opts?: { bold?: boolean }
  ): ReportCell {
    const { fieldtype } = col;
    const align =
      col.align ??
      (fieldtype === FieldTypeEnum.Currency ||
      fieldtype === FieldTypeEnum.Int ||
      fieldtype === FieldTypeEnum.Float
        ? 'right'
        : 'left');
    const width = col.width ?? 1;

    if (raw === null || raw === undefined || raw === '') {
      return {
        rawValue: raw as RawValue,
        value: '',
        align,
        width,
        bold: opts?.bold,
      };
    }

    const value = String(this.fyo.format(raw as DocValue, col));
    return {
      rawValue: raw as RawValue,
      value,
      align,
      width,
      bold: opts?.bold,
    };
  }

  private _detailRow(inv: EnrichedInvoiceRow, seq: number): ReportRow {
    const cols = this.columns;
    const cells: ReportCell[] = [];
    for (const col of cols) {
      let raw: DocValue | number | string | Date | undefined;
      switch (col.fieldname) {
        case 'idx':
          raw = seq;
          break;
        case 'party':
          raw = inv.party;
          break;
        case 'invoice':
          raw = inv.name;
          break;
        case 'date':
          raw = new Date(inv.date);
          break;
        case 'ageDays':
          raw = inv.ageDays;
          break;
        case 'b0':
          raw = inv.buckets[0]?.float ?? 0;
          break;
        case 'b1':
          raw = inv.buckets[1]?.float ?? 0;
          break;
        case 'b2':
          raw = inv.buckets[2]?.float ?? 0;
          break;
        case 'b3':
          raw = inv.buckets[3]?.float ?? 0;
          break;
        case 'outstanding':
          raw = inv.outstanding.float;
          break;
        default:
          raw = '';
      }
      cells.push(this._formatCell(raw, col));
    }
    return { cells };
  }

  private _subtotalRow(
    partyId: string,
    bucketTotals: Money[],
    outstandingTotal: Money
  ): ReportRow {
    const cols = this.columns;
    const cells: ReportCell[] = [];
    const partyLabel = `${t`Total`} — ${partyId}`;
    for (const col of cols) {
      switch (col.fieldname) {
        case 'idx':
          cells.push(this._formatCell('', col, { bold: true }));
          break;
        case 'party':
          cells.push(
            this._formatCell(
              partyLabel,
              { ...col, fieldtype: FieldTypeEnum.Data } as ColumnField,
              { bold: true }
            )
          );
          break;
        case 'invoice':
        case 'date':
          cells.push(this._formatCell('', col, { bold: true }));
          break;
        case 'ageDays':
          cells.push(this._formatCell('', col, { bold: true }));
          break;
        case 'b0':
          cells.push(
            this._formatCell(bucketTotals[0]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'b1':
          cells.push(
            this._formatCell(bucketTotals[1]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'b2':
          cells.push(
            this._formatCell(bucketTotals[2]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'b3':
          cells.push(
            this._formatCell(bucketTotals[3]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'outstanding':
          cells.push(
            this._formatCell(outstandingTotal.float, col, { bold: true })
          );
          break;
        default:
          cells.push(this._formatCell('', col));
      }
    }
    return { cells, isGroup: true };
  }

  private _grandTotalRow(
    bucketTotals: Money[],
    outstandingTotal: Money
  ): ReportRow {
    const cols = this.columns;
    const cells: ReportCell[] = [];
    for (const col of cols) {
      switch (col.fieldname) {
        case 'idx':
          cells.push(this._formatCell('', col, { bold: true }));
          break;
        case 'party':
          cells.push(
            this._formatCell(
              t`Grand Total`,
              { ...col, fieldtype: FieldTypeEnum.Data } as ColumnField,
              { bold: true }
            )
          );
          break;
        case 'invoice':
        case 'date':
        case 'ageDays':
          cells.push(this._formatCell('', col, { bold: true }));
          break;
        case 'b0':
          cells.push(
            this._formatCell(bucketTotals[0]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'b1':
          cells.push(
            this._formatCell(bucketTotals[1]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'b2':
          cells.push(
            this._formatCell(bucketTotals[2]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'b3':
          cells.push(
            this._formatCell(bucketTotals[3]?.float ?? 0, col, { bold: true })
          );
          break;
        case 'outstanding':
          cells.push(
            this._formatCell(outstandingTotal.float, col, { bold: true })
          );
          break;
        default:
          cells.push(this._formatCell('', col));
      }
    }
    return { cells, isGroup: true };
  }

  async setReportData(): Promise<void> {
    this.loading = true;
    this.setDefaultFilters();

    const asOf = this.asOfDate!;
    const zeroStore = this.fyo.pesa(0).store;
    const filters: QueryFilter = {
      submitted: true,
      cancelled: false,
      outstandingAmount: ['!=', zeroStore],
    };

    if (this.party) {
      filters.party = this.party;
    }

    const raw = (await this.fyo.db.getAllRaw(this.invoiceSchema, {
      fields: ['name', 'party', 'date', 'outstandingAmount'],
      filters,
    })) as InvoiceRowRaw[];

    const zero = this.fyo.pesa(0);

    const enriched: EnrichedInvoiceRow[] = raw.map((r) => {
      const outstanding = this.fyo.pesa(r.outstandingAmount);
      const ageDays = getInvoiceAgeDays(String(r.date), asOf);
      const buckets = bucketAmountsFromOutstanding(outstanding, ageDays);
      return { ...r, ageDays, buckets, outstanding };
    });

    enriched.sort((a, b) => {
      const pc = (a.party ?? '').localeCompare(b.party ?? '');
      if (pc !== 0) {
        return pc;
      }
      return String(a.date).localeCompare(String(b.date));
    });

    const reportData: ReportData = [];
    let partyBatch: EnrichedInvoiceRow[] = [];
    let detailSeq = 0;

    const flushParty = () => {
      if (!partyBatch.length) {
        return;
      }
      const partyId = partyBatch[0].party;
      for (const inv of partyBatch) {
        detailSeq += 1;
        reportData.push(this._detailRow(inv, detailSeq));
      }
      const bucketTotals = sumMoneyColumns(
        partyBatch.map((r) => r.buckets),
        zero
      );
      const outstandingSum = partyBatch.reduce(
        (s, r) => s.add(r.outstanding),
        zero.mul(0)
      );
      reportData.push(this._subtotalRow(partyId, bucketTotals, outstandingSum));
      partyBatch = [];
    };

    for (const inv of enriched) {
      if (partyBatch.length && partyBatch[0].party !== inv.party) {
        flushParty();
      }
      partyBatch.push(inv);
    }
    flushParty();

    if (enriched.length) {
      const allBuckets = sumMoneyColumns(
        enriched.map((r) => r.buckets),
        zero
      );
      const grandOutstanding = enriched.reduce(
        (s, r) => s.add(r.outstanding),
        zero.mul(0)
      );
      reportData.push(this._grandTotalRow(allBuckets, grandOutstanding));
    }

    this.reportData = reportData;
    this.loading = false;
  }
}
