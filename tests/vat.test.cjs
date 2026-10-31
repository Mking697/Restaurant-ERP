const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/vat.ts');

test('vatBreakdown charges the full flat rate, no CGST/SGST/IGST split', () => {
  const { vatBreakdown } = load();
  const r = vatBreakdown('100.00', '18.00');
  assert.equal(r.ratePercent, '18.00');
  assert.equal(r.vatAmount, '18.00');
  assert.equal(r.totalWithTax, '118.00');
});

test('vatBreakdown rejects invalid rate or amount', () => {
  const { vatBreakdown } = load();
  assert.throws(() => vatBreakdown('100.00', '101'), { status: 400 });
  assert.throws(() => vatBreakdown('100.00', '-1'), { status: 400 });
  assert.throws(() => vatBreakdown('abc', '18.00'), { status: 400 });
});

test('vatBreakdown handles a zero-rated/exempt item explicitly', () => {
  const { vatBreakdown } = load();
  const r = vatBreakdown('100.00', '0.00');
  assert.equal(r.vatAmount, '0.00');
  assert.equal(r.totalWithTax, '100.00');
});

test('vatInvoiceSummary aggregates multiple lines across rates correctly', () => {
  const { vatInvoiceSummary } = load();
  const lines = [
    { taxableAmountDecimal: '200.00', ratePercent: '18.00' },
    { taxableAmountDecimal: '100.00', ratePercent: '18.00' },
    { taxableAmountDecimal: '50.00', ratePercent: '0.00' }, // zero-rated item
  ];
  const summary = vatInvoiceSummary(lines);
  const eighteen = summary.rates.find((r) => r.ratePercent === '18.00');
  const zero = summary.rates.find((r) => r.ratePercent === '0.00');
  assert.equal(eighteen.taxableAmount, '300.00'); assert.equal(eighteen.vatAmount, '54.00'); // 18% of 300
  assert.equal(zero.taxableAmount, '50.00'); assert.equal(zero.vatAmount, '0.00');
  assert.equal(summary.grandTaxable, '350.00');
  assert.equal(summary.grandTotalTax, '54.00');
  assert.equal(summary.grandTotal, '404.00');
});
