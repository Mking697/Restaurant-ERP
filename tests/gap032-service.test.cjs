const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// ---------------------------------------------------------------------------
// GAP-032 (generalized, no real delivery provider — see gaps.md): proves the
// EXISTING fulfillment-vs-payment separation (GAP-023/024/025/026) already
// satisfies this gap's acceptance for a dispatched-before-paid order —
// dine-in OPEN today, equally applicable to any future online channel once
// GAP-030/031 unblock. Net-new here: the direct unit proof on
// readPosCollectionTenders (shift cash exclusion) and the end-to-end
// double-settle/no-re-deduction proof below; everything else already has
// coverage in gap023/024/025/026-service.test.cjs.
// ---------------------------------------------------------------------------

function collectionsHarness() {
  const names = ['posOrders', 'posPayments', 'posPaymentAllocations', 'posDocuments', 'posReceipts'];
  const tables = Object.fromEntries(names.map(name => [name, new Proxy({ name }, { get: (t, k) => k === '_table' ? name : { table: name, key: k } })]));
  const state = Object.fromEntries(names.map(n => [n, []]));
  const op = { eq: (c, v) => r => r[c.key] === v, and: (...p) => r => p.every(f => f(r)), inArray: (c, v) => r => v.includes(r[c.key]) };
  const req = r => r.includes('/db/schema/') ? tables : r === 'drizzle-orm' ? op : r === '../moduleAccess' ? load(r) : r.startsWith('./') ? load(r.slice(2)) : require(r);
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const filename = path.join(__dirname, '../src/lib/server', `${name}.ts`), module = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`, { filename })(req, module, module.exports);
    return cache[name] = module.exports;
  }
  const tx = { select: () => ({ from(table) { let pred = () => true; const rows = () => state[table._table].filter(pred); const q = { where(p) { pred = p; return q; }, then(a, b) { return Promise.resolve(rows()).then(a, b); } }; return q; } }) };
  return { state, tx, readPosCollectionTenders: load('pos-collections').readPosCollectionTenders };
}

test('readPosCollectionTenders excludes OPEN (unpaid, dispatched) orders from shift cash entirely — never treated as cashier cash', async () => {
  const h = collectionsHarness();
  h.state.posOrders.push(
    { id: 'open-1', branchId: 'b', shiftRunId: 'shift', status: 'OPEN', tenderType: '', totalAmount: '500.00', paymentCaptured: false },
    { id: 'paid-legacy', branchId: 'b', shiftRunId: 'shift', status: 'PAID', tenderType: 'CASH', totalAmount: '100.00', paymentCaptured: false },
    { id: 'paid-captured', branchId: 'b', shiftRunId: 'shift', status: 'PAID', tenderType: 'CASH', totalAmount: '200.00', tenderCurrencyCode: 'INR', fxRateToInr: '1.000000', tenderCurrencyAmount: '200.00', paymentCaptured: true },
  );
  h.state.posPayments.push({ id: 'p1', branchId: 'b', orderId: 'paid-captured', receiptId: 'r1', receiptNumber: 'RCP-1', amount: '200.00', tenderType: 'CASH', tenderCurrencyCode: 'INR', tenderCurrencyAmount: '200.00', fxRateToInr: '1.000000', collectorId: 'c', collectorName: 'Cashier', shiftRunId: 'shift', collectedAt: new Date(), sourceAction: 'CREATE', finalDocumentId: null, finalDocumentNumber: null });
  h.state.posPaymentAllocations.push({ id: 'a1', paymentId: 'p1', orderId: 'paid-captured', receiptId: 'r1', finalDocumentId: null, amount: '200.00' });
  h.state.posReceipts.push({ id: 'r1', orderId: 'paid-captured', branchId: 'b', receiptNumber: 'RCP-1' });

  const tenders = await h.readPosCollectionTenders(h.tx, 'b', 'shift');
  const amounts = tenders.map(t => t.totalAmount).sort();
  assert.deepEqual(amounts, ['100.00', '200.00'], 'the OPEN order (500.00) must never appear in shift cash tenders');
  assert.ok(tenders.every(t => t.totalAmount !== '500.00'), 'unpaid dispatched order amount never counted as cash');
  assert.ok(tenders.every(t => t.tenderType === 'CASH'));
});

function ordersHarness() {
  const names = ['currencyRates', 'menuItems', 'branches', 'posOrderAttempts', 'posOrderLines', 'posOrders', 'posProductionTicketLines', 'posProductionTickets', 'posReceipts', 'posDrafts', 'posLifecycleActions', 'posLifecycleEvents', 'posDocuments', 'posDocumentRequests', 'settings', 'posPayments', 'posPaymentAllocations', 'posTokenSequences'];
  const tables = Object.fromEntries(names.map(name => [name, new Proxy({ name }, { get: (t, k) => k === '_table' ? name : { table: name, key: k } })]));
  const state = Object.fromEntries(names.map(n => [n, []]));
  Object.assign(state, { branches: [{ id: 'b', name: 'Branch', code: 'B1', address: 'Street', operatingConcept: 'CONVENTIONAL', vatRatePercent: '0.00' }], menuItems: [{ id: 'dish', branchId: 'b', name: 'Saved dish', price: '10.00', isActive: true, isSellable: true, vatRatePercent: '0.00', productCode: 'D', productionStation: 'KITCHEN' }], deductions: [], cogsCalls: 0 });
  const op = { sql: (parts, ...values) => ({ parts, values }), isNull: c => r => r[c.key] == null, eq: (c, v) => r => r[c.key] === v, ne: (c, v) => r => r[c.key] !== v, and: (...p) => r => p.filter(Boolean).every(f => f(r)), or: (...p) => r => p.filter(Boolean).some(f => f(r)), inArray: (c, v) => r => (Array.isArray(v) ? v : v._rows().map(row => Object.values(row)[0])).includes(r[c.key]), asc: c => ({ c, d: 1 }), desc: c => ({ c, d: -1 }) };
  const mocks = { 'drizzle-orm': op, './cogs': { computeOrderCogs: async () => { state.cogsCalls++; return { cogsAmount: '2.10', complete: true }; } }, './production': { lockRecipeStock: async () => { }, readStockRecipe: async () => [], deductStock: async (_t, b, r, s) => { state.deductions.push(s); return { inventoryDeducted: [], semiFgDeducted: [] }; } }, './production-quantity': { directRequirements: (_b, _r, l) => l }, './shifts': { requireOperableShift: async () => ({ shiftRunId: 'shift' }) }, './whatsapp-triggers': { validOptionalPhone: v => v ?? '' } };
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const filename = path.join(__dirname, '../src/lib/server', `${name}.ts`), module = { exports: {} };
    const req = r => r.includes('/db/schema/') ? tables : Object.hasOwn(mocks, r) ? mocks[r] : r.startsWith('./') ? load(r.slice(2)) : r.startsWith('../') ? load(r) : require(r);
    vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`, { filename })(req, module, module.exports);
    return cache[name] = module.exports;
  }
  const tx = {
    select: projection => ({ from(table) { let pred = () => true, sort = [], max = Infinity, joined = false; const rows = () => { let rows = state[table._table].filter(pred).map(r => joined ? { ...state.menuItems.find(i => i.id === r.menuItemId), ...r } : { ...r }); for (const s of [...sort].reverse()) rows.sort((a, b) => (a[s.c.key] > b[s.c.key] ? 1 : a[s.c.key] < b[s.c.key] ? -1 : 0) * s.d); rows = rows.slice(0, max); return projection ? rows.map(r => Object.fromEntries(Object.entries(projection).map(([k, c]) => [k, r[c.key]]))) : rows; }; const q = { _rows: rows, where(p) { pred = p; return q; }, orderBy(...s) { sort = s; return q; }, limit(n) { max = n; return q; }, innerJoin() { joined = true; return q; }, then(a, b) { return Promise.resolve(rows()).then(a, b); } }; return q; } }),
    insert: table => ({ values: async values => { for (const r of Array.isArray(values) ? values : [values]) state[table._table].push({ revision: 1, createdAt: new Date('2026-11-04T09:00:00Z'), updatedAt: new Date(), ownerOnly: false, paymentCaptured: false, orderId: null, ...r }); } }),
    update: table => ({ set: values => ({ where(pred) { let done = false, changed = []; const run = () => { if (!done) { changed = state[table._table].filter(pred); for (const r of changed) Object.assign(r, values); done = true; } return changed; }; return { returning: async () => run(), then: (a, b) => Promise.resolve(run()).then(a, b) }; } }) }),
    execute: async query => {
      const text = query.parts.join('?');
      if (text.includes('nextval')) return { rows: [{ value: String(++state.sequence) }] };
      if (text.includes('pos_token_sequences')) return { rows: [{ last_value: 0 }] };
      return { rows: [] };
    },
  };
  state.sequence = 0;
  tx.transaction = async fn => { const saved = structuredClone(state); try { return await fn(tx); } catch (e) { for (const k of Object.keys(saved)) state[k] = saved[k]; throw e; } };
  const actor = { id: 'cashier', name: 'Actual collector', role: 'CASHIER', branchId: 'b', moduleAccess: ['POS_CASHIER'], status: 'Active' };
  return { state, tx, actor, orders: load('pos-orders'), payments: load('pos-payments'), collections: load('pos-collections') };
}

test('a dine-in order dispatched OPEN never counts as cash until settled; settling it once posts exactly one payment, excludes it from pre-settlement shift cash, and rejects a second settle attempt without re-deducting stock/COGS', async () => {
  const h = ordersHarness();
  const opened = await h.tx.transaction(tx => h.orders.createPosOrder(tx, h.actor, 'b', { channel: 'DINE_IN', tableNo: 'T1', lines: [{ menuItemId: 'dish', qty: 2 }], idempotencyKey: 'open-1' }));
  assert.equal(opened.order.status, 'OPEN');
  assert.equal(h.state.deductions.length, 1, 'stock is deducted once, at dispatch time');
  assert.equal(h.state.cogsCalls, 1, 'COGS is captured once, at dispatch time');

  // Before settlement, the OPEN order must be fully excluded from shift cash.
  const tendersBefore = await h.collections.readPosCollectionTenders(h.tx, 'b', 'shift');
  assert.equal(tendersBefore.length, 0, 'an unpaid dispatched order contributes no shift cash at all');

  const list = await h.payments.listPosPayments(h.tx, h.actor, {});
  const openSummary = list.orders.find(o => o.id === opened.order.id);
  assert.equal(openSummary.coverage, 'OPEN');
  assert.equal(openSummary.outstandingAmount, '20.00', 'unpaid amount is shown, distinct from fulfillment status');

  const settled = await h.tx.transaction(tx => h.orders.settlePosOrder(tx, h.actor, opened.order.id, { tenderType: 'CASH', idempotencyKey: 'settle-1' }));
  assert.equal(settled.order.status, 'PAID');
  assert.equal(h.state.posPayments.length, 1, 'exactly one payment posted');
  assert.equal(h.state.deductions.length, 1, 'settlement never re-deducts stock');
  assert.equal(h.state.cogsCalls, 1, 'settlement never recaptures COGS');

  // Now that it is paid, shift cash includes it exactly once.
  const tendersAfter = await h.collections.readPosCollectionTenders(h.tx, 'b', 'shift');
  assert.deepEqual(tendersAfter.map(t => t.totalAmount), ['20.00']);

  // A second, different settlement attempt on an already-PAID order must be rejected, not double-posted.
  await assert.rejects(
    h.tx.transaction(tx => h.orders.settlePosOrder(tx, h.actor, opened.order.id, { tenderType: 'CASH', idempotencyKey: 'settle-2' })),
    e => e.status === 409
  );
  assert.equal(h.state.posPayments.length, 1, 'repeated settlement cannot double-post a second payment');
  assert.equal(h.state.deductions.length, 1, 'rejected repeat settlement never re-deducts stock');

  // The exact same settlement retried with the ORIGINAL idempotency key safely replays the same result.
  const replay = await h.tx.transaction(tx => h.orders.settlePosOrder(tx, h.actor, opened.order.id, { tenderType: 'CASH', idempotencyKey: 'settle-1' }));
  assert.equal(replay.replayed, true);
  assert.equal(h.state.posPayments.length, 1, 'exact-key replay never posts a second payment');
});
