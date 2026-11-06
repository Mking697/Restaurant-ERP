const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real service/policy/VAT code; isolate only DB and IO dependencies.
function harness() {
  const tables = Object.fromEntries(['currencyRates', 'menuItems', 'branches', 'posOrderAttempts', 'posOrderLines', 'posOrders', 'posProductionTicketLines', 'posProductionTickets', 'posReceipts'].map(name => {
    const table = new Proxy({ name }, { get: (target, key) => key === 'name' ? target.name : { table: name, key } });
    return [name, table];
  }));

  const state = { branches: [{ id: 'b', name: 'Branch', operatingConcept: 'CONVENTIONAL', vatRatePercent: '0.00' }], menuItems: [{ id: 'dish', branchId: 'b', name: 'Dish', price: '10.00', isActive: true, isSellable: true, vatRatePercent: '0.00', productCode: 'D', productionStation: 'KITCHEN' }], posOrders: [], posOrderAttempts: [], posOrderLines: [], posProductionTickets: [], posProductionTicketLines: [], posReceipts: [], deductions: [], cogsCalls: [], cogs: { cogsAmount: '2.10', complete: true }, shift: 'opening-shift' };
  const evaluate = (column, row) => row[column.key];
  const mocks = {
    'drizzle-orm': { eq: (column, value) => row => evaluate(column, row) === value, and: (...predicates) => row => predicates.every(predicate => predicate(row)), inArray: (column, values) => row => values.includes(evaluate(column, row)) },

    './cogs': { computeOrderCogs: async (_tx, branchId, lines) => { state.cogsCalls.push({ branchId, lines }); return { ...state.cogs }; } },
    './production': { lockRecipeStock: async () => {}, readStockRecipe: async () => [], deductStock: async (_tx, branchId, required, reference) => { state.deductions.push({ branchId, required, reference }); return { inventoryDeducted: [], semiFgDeducted: [] }; } },
    './production-quantity': { directRequirements: (_branch, _recipes, lines) => lines },
    './shifts': { requireOperableShift: async () => ({ shiftRunId: state.shift }) },
    './accounts-ledger': { postPosSaleJournal: async () => null },
    // GAP-025 documents are isolated here; its real service runs in gap025-service.
    './pos-documents': { issueFinalPosDocument: async () => ({ document: null, unavailableReason: 'Isolated legacy harness' }) },
    // GAP-026 payment capture is isolated here; its real service runs in gap026-service.
    './pos-payments': { capturePosPayment: async () => ({ payment: null }) },
    // GAP-029 pickup-token allocation is isolated here; its real service runs in gap029-service/gap029-orders-service.
    './pos-tokens': { allocatePickupToken: async (_tx, _branchId, channel) => (channel === 'TAKEAWAY' ? 'T-TEST' : '') },
    './whatsapp-triggers': { validOptionalPhone: value => value ?? '' },
  };
  function load(name) {
    const filename = path.join(__dirname, '../src/lib/server', `${name}.ts`);
    const module = { exports: {} };
    const localRequire = request => {
      if (request.includes('/db/schema/')) return tables;
      if (Object.hasOwn(mocks, request)) return mocks[request];
      if (request === './pos-order-policy' || request === './vat' || request === './permissions') return load(request.slice(2));
      if (request === '../moduleAccess') return load(request);
      return require(request);
    };
    vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`, { filename })(localRequire, module, module.exports);
    return module.exports;
  }
  const tx = {
    select: () => ({ from(table) {
      let predicate = () => true;
      let joined = false;
      const rows = () => state[table.name].filter(predicate).map(row => joined ? { ...state.menuItems.find(item => item.id === row.menuItemId), ...row } : { ...row });
      const query = { where(p) { predicate = p; return query; }, innerJoin() { joined = true; return query; }, limit: async n => rows().slice(0, n), then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); } };
      return query;
    } }),
    insert: table => ({ values: async values => { state[table.name].push(...(Array.isArray(values) ? values : [values]).map(row => ({ ...row }))); } }),
    update: table => ({ set: values => ({ where: async predicate => { for (const row of state[table.name].filter(predicate)) Object.assign(row, values); } }) }),
  };
  const service = load('pos-orders');
  const actor = { id: 'cashier', role: 'CASHIER', branchId: 'b', moduleAccess: ['POS_CASHIER'], status: 'Active' };
  const create = (key = 'create', extra = {}) => service.createPosOrder(tx, actor, 'b', { channel: 'DINE_IN', tableNo: 'T1', lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: key, ...extra });
  return { state, tx, service, actor, create };
}

test('added dispatches provide unique event identities without losing order linkage', async () => {
  const h = harness();
  const created = await h.create();
  for (const key of ['add-1', 'add-2']) {
    const input = { lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: key };
    await h.service.addPosOrderLines(h.tx, h.actor, created.order.id, input);
    await h.service.addPosOrderLines(h.tx, h.actor, created.order.id, input);
  }
  assert.equal(h.state.deductions.length, 3);
  assert.deepEqual(h.state.deductions.map(d => d.reference.id), [created.order.id, created.order.id, created.order.id]);
  assert.equal(h.state.deductions[1].reference.eventId, `${created.order.id}:ADD_LINES:add-1`);
  assert.equal(h.state.deductions[2].reference.eventId, `${created.order.id}:ADD_LINES:add-2`);
});

test('conventional opening dispatch snapshots COGS before payment', async () => {
  const h = harness();
  await h.create();
  const order = h.state.posOrders[0];
  assert.equal(order.cogsAmount, '2.10');
  assert.equal(order.cogsComplete, true);
  assert.equal(order.status, 'OPEN');
  assert.equal(h.state.posReceipts.length, 0);
  assert.equal(h.state.deductions.length, 1);
  assert.equal(h.state.cogsCalls.length, 1);
});

test('additive dispatch snapshots only new-line COGS and retains incompleteness', async () => {
  for (const [initialComplete, addedComplete] of [[true, true], [false, true], [true, false]]) {
    const h = harness();
    h.state.cogs.complete = initialComplete;
    const created = await h.create();
    h.state.cogs = { cogsAmount: '3.20', complete: addedComplete };
    h.state.branches[0].operatingConcept = 'FAST_FOOD';
    await h.service.addPosOrderLines(h.tx, h.actor, created.order.id, { lines: [{ menuItemId: 'dish', qty: 2 }], idempotencyKey: 'add' });
    assert.equal(h.state.posOrders[0].cogsAmount, '5.30');
    assert.equal(h.state.posOrders[0].cogsComplete, initialComplete && addedComplete);
    assert.equal(h.state.cogsCalls.length, 2);
    assert.deepEqual(h.state.cogsCalls[1].lines, [{ menuItemId: 'dish', qty: 2 }]);
    assert.equal(h.state.deductions.length, 2);
    assert.equal(h.state.posOrders[0].shiftRunId, 'opening-shift');
  }
});

test('settlement preserves dispatched COGS despite later recipe/rate changes, without re-deduction', async () => {
  const h = harness();
  const created = await h.create();
  h.state.cogs = { cogsAmount: '99.99', complete: false };
  h.state.branches[0].operatingConcept = 'FAST_FOOD';
  const input = { tenderType: 'CASH', idempotencyKey: 'settle' };
  await h.service.settlePosOrder(h.tx, h.actor, created.order.id, input);
  assert.equal(h.state.posOrders[0].cogsAmount, '2.10');
  assert.equal(h.state.posOrders[0].cogsComplete, true);
  assert.equal(h.state.cogsCalls.length, 1);
  assert.equal(h.state.deductions.length, 1);
  assert.equal(h.state.posReceipts.length, 1);
  await h.service.settlePosOrder(h.tx, h.actor, created.order.id, input);
  assert.equal(h.state.posReceipts.length, 1);
  await assert.rejects(h.service.settlePosOrder(h.tx, h.actor, created.order.id, { ...input, idempotencyKey: 'another' }), error => error.status === 409);
  assert.equal(h.state.posReceipts.length, 1);
});

test('settlement attributes collection to the currently operable shift', async () => {
  const h = harness();
  const created = await h.create();
  h.state.shift = 'collection-shift';
  await h.service.settlePosOrder(h.tx, h.actor, created.order.id, { tenderType: 'UPI', idempotencyKey: 'collect' });
  assert.equal(h.state.posOrders[0].shiftRunId, 'collection-shift');
});

test('billing and additive totals use exact decimal money even above float-safe cents', async () => {
  const h = harness();
  h.state.menuItems[0].price = '9999999999.99';
  const lines = Array.from({ length: 50 }, () => ({ menuItemId: 'dish', qty: 499 }));
  const created = await h.create('large', { lines });
  const order = h.state.posOrders[0];
  // Arithmetic stress test, deliberately beyond the database order-column limit.
  assert.equal(order.subtotal, '249499999999750.50');
  assert.equal(order.totalAmount, order.subtotal);
  h.state.menuItems[0].price = '0.01';
  await h.service.addPosOrderLines(h.tx, h.actor, created.order.id, { lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'cent' });
  assert.equal(order.subtotal, '249499999999750.51');
  assert.equal(order.totalAmount, order.subtotal);
  const settled = await h.service.settlePosOrder(h.tx, h.actor, created.order.id, { tenderType: 'CASH', idempotencyKey: 'pay' });
  assert.equal(settled.receipt.subtotal, settled.receipt.vat.grandTaxable);
  assert.equal(settled.receipt.totalAmount, settled.receipt.vat.grandTotal);
});

test('all FAST_FOOD and non-dine-in channels remain payment-first with one dispatch and receipt', async () => {
  for (const concept of ['FAST_FOOD', 'CONVENTIONAL']) {
    for (const channel of ['DINE_IN', 'TAKEAWAY', 'SWIGGY', 'ZOMATO']) {
      if (concept === 'CONVENTIONAL' && channel === 'DINE_IN') continue;
      const h = harness();
      h.state.branches[0].operatingConcept = concept;
      const input = { channel, tenderType: 'CASH' };
      const created = await h.create('paid', input);
      assert.equal(created.order.status, 'PAID');
      assert.equal(h.state.posReceipts.length, 1);
      assert.equal(h.state.deductions.length, 1);
      assert.equal(h.state.posOrders[0].cogsAmount, '2.10');
      assert.equal(h.state.posOrders[0].cogsComplete, true);
      assert.equal(h.state.posProductionTickets.length, 1);
      assert.equal((await h.create('paid', input)).replayed, true);
      assert.equal(h.state.posReceipts.length, 1);
      assert.equal(h.state.deductions.length, 1);
      await assert.rejects(h.service.addPosOrderLines(h.tx, h.actor, created.order.id, { lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'no-add' }), error => error.status === 409);
    }
  }
});

test('live visibility blocks hidden CREATE replay and hidden mutations, including cached responses', async () => {
  const h = harness();
  const first = await h.create('first');
  const add = { lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'added' };
  await h.service.addPosOrderLines(h.tx, h.actor, first.order.id, add);
  h.state.posOrders[0].ownerOnly = true;
  const before = JSON.stringify(h.state);
  await assert.rejects(h.create('first'), error => error.status === 404);
  await assert.rejects(h.service.addPosOrderLines(h.tx, h.actor, first.order.id, add), error => error.status === 404);
  await assert.rejects(h.service.addPosOrderLines(h.tx, h.actor, first.order.id, { ...add, idempotencyKey: 'new-add' }), error => error.status === 404);
  await assert.rejects(h.service.settlePosOrder(h.tx, h.actor, first.order.id, { tenderType: 'CASH', idempotencyKey: 'pay' }), error => error.status === 404);
  assert.equal(JSON.stringify(h.state), before);
  const owner = { ...h.actor, role: 'SUPER_ADMIN', id: 'owner', branchId: null, moduleAccess: [] };
  await h.service.addPosOrderLines(h.tx, owner, first.order.id, { ...add, idempotencyKey: 'owner-add' });
  await h.service.settlePosOrder(h.tx, owner, first.order.id, { tenderType: 'CASH', idempotencyKey: 'owner-pay' });
  assert.equal(h.state.posOrders[0].status, 'PAID');

  const second = await h.create('second');
  const pay = { tenderType: 'CASH', idempotencyKey: 'cashier-pay' };
  await h.service.settlePosOrder(h.tx, h.actor, second.order.id, pay);
  h.state.posOrders[1].ownerOnly = true;
  await assert.rejects(h.service.settlePosOrder(h.tx, h.actor, second.order.id, pay), error => error.status === 404);
});

test('exported mutations enforce live module and branch authorization before replay or writes', async () => {
  for (const denied of [{ moduleAccess: [] }, { branchId: 'another-branch' }]) {
    const h = harness();
    const created = await h.create('auth');
    const add = { lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'auth-add' };
    await h.service.addPosOrderLines(h.tx, h.actor, created.order.id, add);
    const pay = { tenderType: 'CASH', idempotencyKey: 'auth-pay' };
    await h.service.settlePosOrder(h.tx, h.actor, created.order.id, pay);
    Object.assign(h.actor, denied);
    const before = JSON.stringify(h.state);
    await assert.rejects(h.create('auth'), error => error.status === 403);
    await assert.rejects(h.create('auth-new'), error => error.status === 403);
    await assert.rejects(h.service.addPosOrderLines(h.tx, h.actor, created.order.id, add), error => error.status === 403);
    await assert.rejects(h.service.settlePosOrder(h.tx, h.actor, created.order.id, pay), error => error.status === 403);
    assert.equal(JSON.stringify(h.state), before);
  }
});

for (const action of ['ADD_LINES', 'SETTLE']) {
  test(`${action} rejects an idempotency key used on another order`, async () => {
    const h = harness();
    const first = await h.create('first');
    const second = await h.create('second');
    const input = action === 'ADD_LINES' ? { lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'mutation' } : { tenderType: 'CASH', idempotencyKey: 'mutation' };
    const mutate = action === 'ADD_LINES' ? h.service.addPosOrderLines : h.service.settlePosOrder;
    await mutate(h.tx, h.actor, first.order.id, input);
    const before = JSON.stringify(h.state);
    await assert.rejects(mutate(h.tx, h.actor, second.order.id, input), error => error.status === 409);
    assert.equal(JSON.stringify(h.state), before);
    const replay = await mutate(h.tx, h.actor, first.order.id, input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.order.id, first.order.id);
  });
}
