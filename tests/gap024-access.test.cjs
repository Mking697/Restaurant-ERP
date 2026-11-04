const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { canOpenPath, isPersistedPath } = require('../src/lib/server/page-access.ts');
const { MODULE_KEYS } = require('../src/lib/moduleAccess.ts');
const { hasModule, validateGrants } = require('../src/lib/server/permissions.ts');
const { NAV_ITEMS } = require('../src/lib/nav.ts');
const { GUIDE_MODULES } = require('../src/lib/guide-content.ts');
const { getGuideExample } = require('../src/lib/guide-examples.ts');
const kitchen = { role: 'KITCHEN_STAFF', moduleAccess: ['POS_KITCHEN'] };
const cashier = { role: 'CASHIER', moduleAccess: ['POS_CASHIER'] };
const owner = { role: 'SUPER_ADMIN', moduleAccess: [] };

test('GAP-024 explicit kitchen grant is recognized and distinct from cashier authority', () => {
  assert.ok(MODULE_KEYS.includes('POS_KITCHEN'));
  assert.deepEqual(validateGrants(['POS_KITCHEN', 'POS_KITCHEN']), ['POS_KITCHEN']);
  assert.equal(hasModule(kitchen, 'POS_KITCHEN'), true);
  assert.equal(hasModule(kitchen, 'POS_CASHIER'), false);
  assert.equal(hasModule(cashier, 'POS_KITCHEN'), false);
  assert.equal(hasModule({ role: 'KITCHEN_STAFF', moduleAccess: [] }, 'POS_KITCHEN'), false);
});

test('GAP-024 protected kitchen page allows either explicit operational grant, never grants billing', () => {
  for (const user of [kitchen, cashier, owner]) {
    assert.equal(canOpenPath(user, '/kitchen'), true);
    assert.equal(canOpenPath(user, '/kitchen/detail'), true);
  }
  for (const user of [{ role: 'KITCHEN_STAFF', moduleAccess: [] }, { role: 'ACCOUNTANT', moduleAccess: ['OFFICIAL_SALES_REPORTS'] }]) assert.equal(canOpenPath(user, '/kitchen'), false);
  assert.equal(canOpenPath(kitchen, '/pos'), false);
  assert.equal(canOpenPath(kitchen, '/accounts'), false);
  assert.equal(isPersistedPath('/kitchen'), true);
});

test('GAP-024 kitchen navigation and bilingual guide use the dedicated grant and honest limitations', () => {
  const item = NAV_ITEMS.find(row => row.href === '/kitchen');
  assert.ok(item);
  assert.equal(item.module, 'POS_KITCHEN');
  const guide = GUIDE_MODULES.find(row => row.route === '/kitchen');
  assert.ok(guide);
  assert.equal(guide.module, 'POS_KITCHEN');
  assert.match(guide.what, /snapshot/i);
  for (const lang of ['en', 'hinglish']) {
    const example = getGuideExample('/kitchen', lang);
    assert.ok(example);
    assert.ok(example.steps.length >= 3);
    assert.match(example.result, /stock/i);
  }
});
