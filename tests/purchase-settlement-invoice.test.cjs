const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/purchase.ts');

test('computeThreeWayMatch: PO, GRN accepted value and invoice all agree -> matched', () => {
  const { computeThreeWayMatch } = load();
  const r = computeThreeWayMatch({
    poLines: [{ qty: '10.000', rate: '25.50' }],
    grnLines: [{ qtyReceived: '10.000', qtyFailed: '0.000', rateOrdered: '25.50' }],
    invoiceAmount: '255.00',
    taxAdjustmentInr: '0.00',
  });
  assert.equal(r.poTotalInr, '255.00');
  assert.equal(r.grnAcceptedTotalInr, '255.00');
  assert.equal(r.invoiceAdjustedTotalInr, '255.00');
  assert.equal(r.matched, true);
  assert.equal(r.mismatchReason, '');
});

test('computeThreeWayMatch: GRN accepted value correctly excludes failed quantity, and a vendor invoicing only the accepted amount matches', () => {
  const { computeThreeWayMatch } = load();
  const r = computeThreeWayMatch({
    poLines: [{ qty: '10.000', rate: '25.50' }],
    grnLines: [{ qtyReceived: '10.000', qtyFailed: '2.000', rateOrdered: '25.50' }], // 8 accepted
    invoiceAmount: '204.00', // vendor correctly invoiced only the accepted 8 units
    taxAdjustmentInr: '0.00',
  });
  assert.equal(r.grnAcceptedTotalInr, '204.00');
  assert.equal(r.poTotalInr, '255.00'); // informational only — a quality failure legitimately differs from PO total
  // GRN accepted value exactly matches the invoice -> matched, even though PO total differs (quality failure is expected, not locked).
  assert.equal(r.matched, true);
});

test('computeThreeWayMatch: a vendor who invoices the FULL PO amount despite a quality failure is correctly locked', () => {
  const { computeThreeWayMatch } = load();
  const r = computeThreeWayMatch({
    poLines: [{ qty: '10.000', rate: '25.50' }],
    grnLines: [{ qtyReceived: '10.000', qtyFailed: '2.000', rateOrdered: '25.50' }], // 8 accepted = 204.00
    invoiceAmount: '255.00', // vendor over-invoiced for the full 10 units, including the 2 that failed
    taxAdjustmentInr: '0.00',
  });
  assert.equal(r.matched, false);
  assert.match(r.mismatchReason, /GRN accepted value 204\.00 vs invoice \(adjusted\) 255\.00/);
});

test('computeThreeWayMatch: a tax adjustment can bring an otherwise-mismatched invoice into match', () => {
  const { computeThreeWayMatch } = load();
  const r = computeThreeWayMatch({
    poLines: [{ qty: '10.000', rate: '25.50' }],
    grnLines: [{ qtyReceived: '10.000', qtyFailed: '0.000', rateOrdered: '25.50' }],
    invoiceAmount: '260.00', // vendor over-billed by 5.00
    taxAdjustmentInr: '-5.00', // store correction brings it back to 255.00
  });
  assert.equal(r.invoiceAdjustedTotalInr, '255.00');
  assert.equal(r.matched, true);
});

test('computeThreeWayMatch: within the fixed paisa tolerance still matches', () => {
  const { computeThreeWayMatch } = load();
  const r = computeThreeWayMatch({
    poLines: [{ qty: '3.000', rate: '33.33' }], // 99.99
    grnLines: [{ qtyReceived: '3.000', qtyFailed: '0.000', rateOrdered: '33.33' }],
    invoiceAmount: '100.50', // 0.51 off, within the 1.00 tolerance
    taxAdjustmentInr: '0.00',
  });
  assert.equal(r.matched, true);
});

test('parseSettleInput requires a positive amount and caps note length', () => {
  const { parseSettleInput } = load();
  assert.throws(() => parseSettleInput({ settledAmountInr: '0' }), { status: 400 });
  assert.throws(() => parseSettleInput({ settledAmountInr: '-5' }), { status: 400 });
  assert.throws(() => parseSettleInput({ settledAmountInr: '10.00', settledNote: 'x'.repeat(501) }), { status: 400 });
  assert.throws(() => parseSettleInput({ settledAmountInr: '10.00', extra: 'nope' }), { status: 400 });
  const r = parseSettleInput({ settledAmountInr: '21.78', settledNote: 'Credit note #CN-1' });
  assert.equal(r.settledAmountInr, '21.78');
  assert.equal(r.settledNote, 'Credit note #CN-1');
});

test('assertReturnNotSettled is the once-only gate', () => {
  const { assertReturnNotSettled } = load();
  assert.doesNotThrow(() => assertReturnNotSettled(null));
  assert.throws(() => assertReturnNotSettled(new Date()), { status: 409 });
});

test('parseInvoiceInput requires a non-zero tax adjustment to carry a note', () => {
  const { parseInvoiceInput } = load();
  assert.throws(() => parseInvoiceInput({ invoiceNumber: 'INV-1', amount: '100.00', taxAdjustmentInr: '-5.00' }), { status: 400 });
  const r = parseInvoiceInput({ invoiceNumber: 'INV-1', amount: '100.00', taxAdjustmentInr: '-5.00', taxAdjustmentNote: 'Vendor VAT miscalculation' });
  assert.equal(r.taxAdjustmentInr, '-5.00');
  const noAdjustment = parseInvoiceInput({ invoiceNumber: 'INV-2', amount: '50.00' });
  assert.equal(noAdjustment.taxAdjustmentInr, '0.00');
});

test('parseInvoiceInput rejects a zero/negative amount', () => {
  const { parseInvoiceInput } = load();
  assert.throws(() => parseInvoiceInput({ invoiceNumber: 'INV-1', amount: '0' }), { status: 400 });
});
