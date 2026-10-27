const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const source = fs.readFileSync(path.join(__dirname, '../src/app/api/shift-runs/[id]/end/route.ts'), 'utf8');
const compiled = ts.transpileModule(source + '\nexport { coinAmount, count };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsUnderTest = {};
vm.runInNewContext(compiled, { exports: exportsUnderTest, require: () => ({ HttpError }) });
test('shift closing accepts bounded paise coin amounts but only whole note counts', () => {
  for (const [value, expected] of [[undefined, 0], [0, 0], [0.5, 0.5], ['12.25', 12.25], [100000, 100000]]) assert.equal(exportsUnderTest.coinAmount(value), expected);
  for (const value of [-1, 0.001, 'NaN', Infinity, 100000.01, {}, true, '1e2']) assert.throws(() => exportsUnderTest.coinAmount(value), { status: 400 });
  assert.equal(exportsUnderTest.count(2, 'notes'), 2);
  for (const value of [-1, 1.5, 100001, Infinity]) assert.throws(() => exportsUnderTest.count(value, 'notes'), { status: 400 });
});
