const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/production-quantity.ts');
const row = (over = {}) => ({ id: 'r', branchId: 'b', menuItemId: 'dish', componentType: 'RAW_MATERIAL', rawMaterialId: 'flour', componentMenuItemId: null, qtyPerUnit: '0.100', ...over });

test('quantities parse exactly, including the numeric(12,3) boundary', () => {
  const { quantity, decimal } = load();
  assert.equal(decimal(quantity('999999999.999')), '999999999.999');
  assert.equal(quantity('0.001'), 1n);
  for (const bad of [0.1, '0', '-1', '1e3', '1.0001', '1000000000', 'NaN', ' 1 ', undefined]) assert.throws(() => quantity(bad), { status: 400 });
});

test('requirements reject empty, corrupt, mismatched and self-referencing recipes', () => {
  const { directRequirements } = load();
  const demand = [{ menuItemId: 'dish', quantity: '1' }];
  for (const rows of [[], [row({ branchId: 'foreign' })], [row({ qtyPerUnit: '0' })], [row({ componentType: 'BAD' })], [row({ componentMenuItemId: 'both' })], [row({ componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'dish' })]]) assert.throws(() => directRequirements('b', rows, demand));
});

test('aggregate exact fractional requirements before rounding consumption upward once', () => {
  const { directRequirements, decimal } = load();
  const result = directRequirements('b', [row({ qtyPerUnit: '0.001' })], [{ menuItemId: 'dish', quantity: '0.100' }, { menuItemId: 'dish', quantity: '0.200' }]);
  assert.equal(decimal(result.raw.get('flour')), '0.001');
  assert.throws(() => directRequirements('b', [row({ qtyPerUnit: '9999999.999' })], [{ menuItemId: 'dish', quantity: '999999999.999' }]), { status: 409 });
});

test('production input normalizes quantity and enforces bounded identity and idempotency', () => {
  const { productionInput, assertProductionItem } = require('../src/lib/server/production-policy.ts');
  assert.deepEqual(productionInput({ menuItemId: 'gravy', quantity: '1.5', idempotencyKey: 'batch-1' }), { menuItemId: 'gravy', quantity: '1.500', idempotencyKey: 'batch-1' });
  for (const over of [{ quantity: 1 }, { quantity: '0' }, { idempotencyKey: '' }, { idempotencyKey: 'x'.repeat(129) }, { menuItemId: '' }]) assert.throws(() => productionInput({ menuItemId: 'gravy', quantity: '1', idempotencyKey: 'batch-1', ...over }), { status: 400 });
  const item = { branchId: 'b', isActive: true, isSemiFg: true };
  assert.doesNotThrow(() => assertProductionItem(item, 'b'));
  for (const invalid of [undefined, { ...item, branchId: 'other' }, { ...item, isActive: false }, { ...item, isSemiFg: false }]) assert.throws(() => assertProductionItem(invalid, 'b'));
});

test('direct requirements consume stocked Semi-FG, never embedded raw', () => {
  const { directRequirements, decimal } = load();
  const result = directRequirements('b', [row(), row({ id: 's', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'gravy', qtyPerUnit: '0.250' }), row({ menuItemId: 'gravy', rawMaterialId: 'tomato', qtyPerUnit: '2.000' })], [{ menuItemId: 'dish', quantity: '2.000' }]);
  assert.deepEqual([...result.raw].map(([id, qty]) => [id, decimal(qty)]), [['flour', '0.200']]);
  assert.deepEqual([...result.semiFg].map(([id, qty]) => [id, decimal(qty)]), [['gravy', '0.500']]);
});
