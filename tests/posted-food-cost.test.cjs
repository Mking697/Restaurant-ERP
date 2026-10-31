const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const load = () => require('../src/app/api/reports/_aggregation.ts').postedFoodCost;
const order = (totalAmount, cogsAmount, cogsComplete = true) => ({ totalAmount, cogsAmount, cogsComplete });
test('posted cost sums saved amounts exactly and rounds percent half-up', () => {
  assert.deepEqual(load()([order('1.00', '0.10'), order('2.00', '0.20')]), { actualCogsInr: '0.30', actualFoodCostPercent: '10.00', actualReason: null });
  assert.equal(load()([order('32.00', '0.01')]).actualFoodCostPercent, '0.03');
});
test('posted cost withholds incomplete, legacy missing and empty periods', () => {
  for (const rows of [[], [order('100.00', '5.00', false)], [order('100.00', null)], [order('100.00', '5.00'), order('100.00', '0.00', false)]]) {
    const result = load()(rows);
    assert.equal(result.actualCogsInr, null);
    assert.equal(result.actualFoodCostPercent, null);
    assert.ok(result.actualReason);
  }
});
test('zero cost is genuine when complete; zero revenue has no percentage', () => {
  assert.equal(load()([order('100.00', '0.00')]).actualFoodCostPercent, '0.00');
  assert.deepEqual(load()([order('0.00', '5.00')]), { actualCogsInr: '5.00', actualFoodCostPercent: null, actualReason: 'No positive completed-sale revenue' });
});
test('posted money above safe Number integer range remains exact', () => {
  assert.equal(load()([order('9999999999999999.99', '9999999999999999.98')]).actualCogsInr, '9999999999999999.98');
  assert.equal(load()([order('9999999999999999.99', '9999999999999999.98')]).actualFoodCostPercent, '100.00');
});
