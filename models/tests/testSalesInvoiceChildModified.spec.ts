import { ModelNameEnum } from 'models/types';
import type { Invoice } from 'models/baseModels/Invoice/Invoice';
import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('SalesInvoice line edit bumps parent and child modified in DB', async (t) => {
  const sinv = (await fyo.doc.getDoc(
    ModelNameEnum.SalesInvoice,
    'SINV-1001'
  )) as Invoice;

  const parentBefore = await fyo.db.get(
    ModelNameEnum.SalesInvoice,
    sinv.name as string
  );
  const line = sinv.items?.[0];
  if (!line?.name) {
    t.fail('expected a line item on SINV-1001');
    return t.end();
  }
  const childBefore = await fyo.db.get(
    ModelNameEnum.SalesInvoiceItem,
    line.name as string
  );

  const prevQty = line.quantity ?? 0;
  await line.set('quantity', prevQty + 1);
  await sinv.sync();

  const parentAfter = await fyo.db.get(
    ModelNameEnum.SalesInvoice,
    sinv.name as string
  );
  const childAfter = await fyo.db.get(
    ModelNameEnum.SalesInvoiceItem,
    line.name as string
  );

  t.ok(
    String(parentAfter.modified) > String(parentBefore.modified),
    'parent modified increased'
  );
  t.ok(
    String(childAfter.modified) > String(childBefore.modified),
    'child modified increased'
  );
  t.end();
});

closeTestFyo(fyo, __filename);
