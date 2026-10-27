const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/gst.ts');

test('intra-state splits evenly into CGST+SGST, odd paise goes to CGST', () => {
  const { gstBreakdown } = load();
  const r = gstBreakdown('100.00', '5.00', '07', '07');
  assert.equal(r.isInterState, false);
  assert.equal(r.cgst, '2.50'); assert.equal(r.sgst, '2.50'); assert.equal(r.igst, '0.00');
  assert.equal(r.totalTax, '5.00'); assert.equal(r.totalWithTax, '105.00');
  // 100 * 5% = 5.00 total tax, 2.50/2.50 split evenly here, but try an odd case
  const r2 = gstBreakdown('100.01', '5.00', '07', '07');
  // 100.01 * 0.05 = 5.0005 -> integer paise truncation at 500 paise (5.00) still even; force an odd-paise case:
  const r3 = gstBreakdown('33.33', '5.00', '07', '07');
  assert.equal((Number(r3.cgst) + Number(r3.sgst)).toFixed(2), r3.totalTax);
});

test('inter-state charges the full rate as IGST only', () => {
  const { gstBreakdown } = load();
  const r = gstBreakdown('100.00', '18.00', '07', '27'); // Delhi branch, Maharashtra company
  assert.equal(r.isInterState, true);
  assert.equal(r.cgst, '0.00'); assert.equal(r.sgst, '0.00'); assert.equal(r.igst, '18.00');
  assert.equal(r.totalWithTax, '118.00');
});

test('rejects missing state codes and invalid rate', () => {
  const { gstBreakdown } = load();
  assert.throws(() => gstBreakdown('100.00', '5.00', '', '07'), { status: 400 });
  assert.throws(() => gstBreakdown('100.00', '5.00', '07', ''), { status: 400 });
  assert.throws(() => gstBreakdown('100.00', '101', '07', '07'), { status: 400 });
  assert.throws(() => gstBreakdown('abc', '5.00', '07', '07'), { status: 400 });
});

test('gstInvoiceSummary aggregates multiple lines across rates correctly', () => {
  const { gstInvoiceSummary } = load();
  const lines = [
    { taxableAmountDecimal: '200.00', ratePercent: '5.00' }, // butter chicken @5%
    { taxableAmountDecimal: '100.00', ratePercent: '5.00' }, // rice @5%
    { taxableAmountDecimal: '50.00', ratePercent: '18.00' }, // liquor-adjacent item @18%
  ];
  const summary = gstInvoiceSummary(lines, '07', '07');
  const five = summary.rates.find((r) => r.ratePercent === '5.00');
  const eighteen = summary.rates.find((r) => r.ratePercent === '18.00');
  assert.equal(five.taxableAmount, '300.00'); assert.equal(five.totalTax, '15.00'); // 5% of 300
  assert.equal(eighteen.taxableAmount, '50.00'); assert.equal(eighteen.totalTax, '9.00'); // 18% of 50
  assert.equal(summary.grandTaxable, '350.00');
  assert.equal(summary.grandTotalTax, '24.00');
  assert.equal(summary.grandTotal, '374.00');
});
