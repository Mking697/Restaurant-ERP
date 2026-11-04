const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);

test('legacy direct-insert order default stays COMPLETED; new lifecycle writers explicitly choose OPEN or PAID', () => {
  const { posOrders } = require('../src/db/schema/pos.ts');
  assert.equal(posOrders.status.default, 'COMPLETED', 'retain legacy default and avoid using newly added PAID enum inside its migration transaction');
});
