const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const helpers = () => require('../src/app/menu/menu-ui-helpers.ts');
test('batch quantities normalize to at most three decimals without floating point drift', () => {
  const { normalizeQuantity } = helpers();
  assert.equal(normalizeQuantity('2.5', '10'), '0.25');
  assert.equal(normalizeQuantity('1', '3'), '0.333');
  assert.equal(normalizeQuantity('0.010', '1'), '0.01');
  for (const [qty, yieldQty] of [['0','1'], ['1','0'], ['NaN','1'], ['0.001','100'], ['1e3','1']]) assert.throws(() => normalizeQuantity(qty, yieldQty));
});
