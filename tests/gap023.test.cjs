const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);

const policy = () => require('../src/lib/server/pos-order-policy.ts');

test('branch concept defaults to FAST_FOOD and accepts only the two explicit concepts', () => {
  const { branchConcept } = policy();
  assert.equal(branchConcept(undefined), 'FAST_FOOD');
  assert.equal(branchConcept(null), 'FAST_FOOD');
  assert.equal(branchConcept('FAST_FOOD'), 'FAST_FOOD');
  assert.equal(branchConcept('CONVENTIONAL'), 'CONVENTIONAL');
  assert.throws(() => branchConcept('HYBRID'), { status: 400 });
});

test('only conventional dine-in is production-first; all other channels stay payment-first', () => {
  const { orderFlow } = policy();
  assert.equal(orderFlow('CONVENTIONAL', 'DINE_IN'), 'PRODUCTION_FIRST');
  for (const channel of ['TAKEAWAY', 'SWIGGY', 'ZOMATO']) assert.equal(orderFlow('CONVENTIONAL', channel), 'PAYMENT_FIRST');
  for (const channel of ['DINE_IN', 'TAKEAWAY', 'SWIGGY', 'ZOMATO']) assert.equal(orderFlow('FAST_FOOD', channel), 'PAYMENT_FIRST');
});

test('ticket planning separates kitchen KOT from bar BOT without empty tickets', () => {
  const { productionTickets } = policy();
  assert.deepEqual(productionTickets([
    { orderLineId: 'l1', menuItemId: 'food', name: 'Burger', qty: 2, productionStation: 'KITCHEN' },
    { orderLineId: 'l2', menuItemId: 'drink', name: 'Mocktail', qty: 1, productionStation: 'BAR' },
    { orderLineId: 'l3', menuItemId: 'food2', name: 'Fries', qty: 1, productionStation: 'KITCHEN' },
  ]), [
    { station: 'KITCHEN', ticketType: 'KOT', lines: [{ orderLineId: 'l1', menuItemId: 'food', name: 'Burger', qty: 2 }, { orderLineId: 'l3', menuItemId: 'food2', name: 'Fries', qty: 1 }] },
    { station: 'BAR', ticketType: 'BOT', lines: [{ orderLineId: 'l2', menuItemId: 'drink', name: 'Mocktail', qty: 1 }] },
  ]);
});

test('idempotency keys and replay payloads are strict and JSON key-order independent', () => {
  const { idempotencyKey, sameReplayPayload } = policy();
  assert.equal(idempotencyKey('  checkout-123  '), 'checkout-123');
  for (const value of ['', 'x'.repeat(129), 123, undefined]) assert.throws(() => idempotencyKey(value), { status: 400 });
  assert.equal(sameReplayPayload({ b: 2, a: { y: 2, x: 1 } }, { a: { x: 1, y: 2 }, b: 2 }), true);
  assert.equal(sameReplayPayload({ lines: [{ qty: 1 }] }, { lines: [{ qty: 2 }] }), false);
});

test('POS mutations reject unknown fields and malformed line objects', () => {
  const { assertAllowedFields, parsePolicyLines } = policy();
  assert.doesNotThrow(() => assertAllowedFields({ lines: [], idempotencyKey: 'k' }, ['lines', 'idempotencyKey']));
  assert.throws(() => assertAllowedFields({ lines: [], idempotencyKey: 'k', ownerOnly: true }, ['lines', 'idempotencyKey']), { status: 400 });
  assert.deepEqual(parsePolicyLines([{ menuItemId: 'dish-1', qty: 2 }]), [{ menuItemId: 'dish-1', qty: 2 }]);
  assert.throws(() => parsePolicyLines([{ menuItemId: 'dish-1', qty: 2, price: '0.01' }]), { status: 400 });
  assert.throws(() => parsePolicyLines([{ menuItemId: ' ', qty: 2 }]), { status: 400 });
});

test('production-first dine-in requires a bounded table identity while payment-first does not', () => {
  const { tableNumber } = policy();
  assert.equal(tableNumber('  T-12  ', 'PRODUCTION_FIRST'), 'T-12');
  assert.equal(tableNumber(undefined, 'PAYMENT_FIRST'), '');
  assert.throws(() => tableNumber('', 'PRODUCTION_FIRST'), { status: 400 });
  assert.throws(() => tableNumber('x'.repeat(41), 'PRODUCTION_FIRST'), { status: 400 });
});
