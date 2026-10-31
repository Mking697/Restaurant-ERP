const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);

test('POS schema defaults uncaptured cost to incomplete, never complete zero', () => {
  const { getTableConfig } = require('drizzle-orm/pg-core');
  const { posOrders } = require('../src/db/schema/pos.ts');
  const columns = getTableConfig(posOrders).columns;
  assert.equal(columns.find(c => c.name === 'cogs_complete').default, false);
  assert.equal(columns.find(c => c.name === 'cogs_complete').notNull, true);
});
