const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/gstr.ts');

test('hsnSummary groups same HSN+rate across multiple lines and sums qty/taxable/tax', () => {
  const { hsnSummary } = load();
  const result = hsnSummary([
    { hsnSacCode: '2106', ratePercent: '5.00', qty: 2, lineTotalDecimal: '200.00', branchStateCode: '07', companyStateCode: '07' },
    { hsnSacCode: '2106', ratePercent: '5.00', qty: 1, lineTotalDecimal: '100.00', branchStateCode: '07', companyStateCode: '07' },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].hsnSacCode, '2106');
  assert.equal(result.rows[0].totalQty, 3);
  assert.equal(result.rows[0].taxableValue, '300.00');
  assert.equal(result.rows[0].cgst, '7.50');
  assert.equal(result.rows[0].sgst, '7.50');
  assert.equal(result.rows[0].igst, '0.00');
  assert.equal(result.rows[0].totalTax, '15.00');
  assert.equal(result.rows[0].totalValue, '315.00');
});

test('hsnSummary separates different HSN codes and different rates into distinct rows', () => {
  const { hsnSummary } = load();
  const result = hsnSummary([
    { hsnSacCode: '2106', ratePercent: '5.00', qty: 1, lineTotalDecimal: '100.00', branchStateCode: '07', companyStateCode: '07' },
    { hsnSacCode: '2106', ratePercent: '18.00', qty: 1, lineTotalDecimal: '100.00', branchStateCode: '07', companyStateCode: '07' },
    { hsnSacCode: '9963', ratePercent: '5.00', qty: 1, lineTotalDecimal: '100.00', branchStateCode: '07', companyStateCode: '07' },
  ]);
  assert.equal(result.rows.length, 3);
});

test('hsnSummary uses IGST for inter-state lines, not CGST+SGST', () => {
  const { hsnSummary } = load();
  const result = hsnSummary([{ hsnSacCode: '2106', ratePercent: '5.00', qty: 1, lineTotalDecimal: '100.00', branchStateCode: '07', companyStateCode: '27' }]);
  assert.equal(result.rows[0].igst, '5.00');
  assert.equal(result.rows[0].cgst, '0.00');
  assert.equal(result.rows[0].sgst, '0.00');
});

test('hsnSummary grand totals sum across all rows correctly', () => {
  const { hsnSummary } = load();
  const result = hsnSummary([
    { hsnSacCode: '2106', ratePercent: '5.00', qty: 1, lineTotalDecimal: '100.00', branchStateCode: '07', companyStateCode: '07' },
    { hsnSacCode: '9963', ratePercent: '18.00', qty: 1, lineTotalDecimal: '200.00', branchStateCode: '07', companyStateCode: '07' },
  ]);
  assert.equal(result.grandTaxableValue, '300.00');
  assert.equal(result.grandTotalTax, '41.00'); // 5.00 + 36.00
  assert.equal(result.grandTotalValue, '341.00');
});

test('hsnSummary treats missing HSN code as UNSPECIFIED, not dropped', () => {
  const { hsnSummary } = load();
  const result = hsnSummary([{ hsnSacCode: '', ratePercent: '5.00', qty: 1, lineTotalDecimal: '100.00', branchStateCode: '07', companyStateCode: '07' }]);
  assert.equal(result.rows[0].hsnSacCode, 'UNSPECIFIED');
});

test('hsnSummary empty input returns zero grand totals, no rows', () => {
  const { hsnSummary } = load();
  const result = hsnSummary([]);
  assert.deepEqual(result.rows, []);
  assert.equal(result.grandTaxableValue, '0.00');
  assert.equal(result.grandTotalTax, '0.00');
});
