const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/vat-summary.ts');

test('vatSummary groups same productCode+rate across multiple lines and sums qty/taxable/tax', () => {
  const { vatSummary } = load();
  const result = vatSummary([
    { productCode: 'DISH-01', ratePercent: '18.00', qty: 2, lineTotalDecimal: '200.00' },
    { productCode: 'DISH-01', ratePercent: '18.00', qty: 1, lineTotalDecimal: '100.00' },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].productCode, 'DISH-01');
  assert.equal(result.rows[0].totalQty, 3);
  assert.equal(result.rows[0].taxableValue, '300.00');
  assert.equal(result.rows[0].vatAmount, '54.00');
  assert.equal(result.rows[0].totalValue, '354.00');
});

test('vatSummary separates different product codes and different rates into distinct rows', () => {
  const { vatSummary } = load();
  const result = vatSummary([
    { productCode: 'DISH-01', ratePercent: '18.00', qty: 1, lineTotalDecimal: '100.00' },
    { productCode: 'DISH-01', ratePercent: '0.00', qty: 1, lineTotalDecimal: '100.00' },
    { productCode: 'DISH-02', ratePercent: '18.00', qty: 1, lineTotalDecimal: '100.00' },
  ]);
  assert.equal(result.rows.length, 3);
});

test('vatSummary grand totals sum across all rows correctly', () => {
  const { vatSummary } = load();
  const result = vatSummary([
    { productCode: 'DISH-01', ratePercent: '18.00', qty: 1, lineTotalDecimal: '100.00' },
    { productCode: 'DISH-02', ratePercent: '18.00', qty: 1, lineTotalDecimal: '200.00' },
  ]);
  assert.equal(result.grandTaxableValue, '300.00');
  assert.equal(result.grandTotalTax, '54.00'); // 18.00 + 36.00
  assert.equal(result.grandTotalValue, '354.00');
});

test('vatSummary treats missing product code as UNSPECIFIED, not dropped', () => {
  const { vatSummary } = load();
  const result = vatSummary([{ productCode: '', ratePercent: '18.00', qty: 1, lineTotalDecimal: '100.00' }]);
  assert.equal(result.rows[0].productCode, 'UNSPECIFIED');
});

test('vatSummary empty input returns zero grand totals, no rows', () => {
  const { vatSummary } = load();
  const result = vatSummary([]);
  assert.deepEqual(result.rows, []);
  assert.equal(result.grandTaxableValue, '0.00');
  assert.equal(result.grandTotalTax, '0.00');
});
