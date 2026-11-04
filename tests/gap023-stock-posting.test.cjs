const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const load = (file, deps) => {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(name => Object.hasOwn(deps, name) ? deps[name] : require(name), module, module.exports);
  return module.exports;
};

test('each added POS dispatch posts its own ledger event while retaining the order source identity', async () => {
  const rows = new Map();
  const stockMovements = { idempotencyKey: {} };
  const quantities = { decimal: n => `${n / 1000n}.${String(n % 1000n).padStart(3, '0')}` };
  const { postStockMovement } = load('src/lib/server/stock-ledger.ts', {
    '../../db/schema/stock-ledger': { stockMovements }, './production-quantity': quantities,
  });
  const tx = { insert: () => ({ values: row => ({ onConflictDoNothing: async () => { if (!rows.has(row.idempotencyKey)) rows.set(row.idempotencyKey, row); } }) }) };
  const original = { branchId: 'b', rawMaterialId: 'flour', qtyDelta: -250n, movementType: 'PRODUCTION_CONSUME', sourceType: 'POS_ORDER', sourceId: 'order-1', actorId: 'cashier' };
  const addition = { ...original, qtyDelta: -1000n, sourceEventId: 'order-1:ADD_LINES:add-1' };
  await postStockMovement(tx, original);
  await postStockMovement(tx, addition);
  await postStockMovement(tx, addition);
  assert.equal(rows.size, 2, 'original and added dispatch must not share a dedupe identity; exact replay stays one event');
  assert.deepEqual([...rows.values()].map(r => r.qtyDelta), ['-0.250', '-1.000']);
  assert.deepEqual([...rows.values()].map(r => r.sourceId), ['order-1', 'order-1']);
});
