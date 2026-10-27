const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const owner = { role: 'SUPER_ADMIN', moduleAccess: [] };
const staff = { role: 'BRANCH_MANAGER', moduleAccess: ['POS_CASHIER', 'OFFICIAL_SALES_REPORTS'] };
test('operational sales summary never discloses actual/private totals to non-Owner even with official-report access', () => {
  const { salesSummaryFor } = require('../src/lib/server/order-visibility.ts');
  assert.deepEqual(salesSummaryFor(staff, { actualTotal: '1000.00', visibleTotal: '500.00' }), { visibleTotal: '500.00' });
  assert.deepEqual(salesSummaryFor(owner, { actualTotal: '1000.01', visibleTotal: '500.00' }), { actualTotal: '1000.01', visibleTotal: '500.00', privateTotal: '500.01' });
});
test('only Owner bypasses operational order SQL filter', () => {
  const { operationalOrderVisibility } = require('../src/lib/server/order-visibility.ts');
  const { PgDialect } = require('drizzle-orm/pg-core');
  assert.equal(operationalOrderVisibility(owner), undefined);
  const query = new PgDialect().sqlToQuery(operationalOrderVisibility(staff));
  assert.match(query.sql, /owner_only/);
  assert.deepEqual(query.params, [false]);
});
test('official unfiltered accounting access is separate from ordinary POS page access', () => {
  const { canOpenPath } = require('../src/lib/server/page-access.ts');
  const { MODULE_KEYS } = require('../src/lib/moduleAccess.ts');
  assert.ok(MODULE_KEYS.includes('OFFICIAL_SALES_REPORTS'));
  assert.equal(canOpenPath({ role: 'CASHIER', moduleAccess: ['POS_CASHIER'] }, '/accounts'), false);
  assert.equal(canOpenPath({ role: 'ACCOUNTANT', moduleAccess: ['OFFICIAL_SALES_REPORTS'] }, '/accounts'), true);
  assert.equal(canOpenPath(owner, '/accounts'), true);
});

test('privacy change rejects coercion, unknown fields and missing reason', () => {
  const { parseVisibilityChange } = require('../src/lib/server/order-visibility.ts');
  assert.deepEqual(parseVisibilityChange({ ownerOnly: true, reason: '  Confidential client  ' }), { ownerOnly: true, reason: 'Confidential client' });
  for (const value of [{ ownerOnly: 'false', reason: 'test' }, { ownerOnly: false }, { ownerOnly: true, reason: 'x' }, { ownerOnly: true, reason: 'test', totalAmount: '0' }]) assert.throws(() => parseVisibilityChange(value), { status: 400 });
});
