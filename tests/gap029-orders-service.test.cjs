const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  const names = ['currencyRates', 'menuItems', 'branches', 'posOrderAttempts', 'posOrderLines', 'posOrders', 'posProductionTicketLines', 'posProductionTickets', 'posReceipts', 'posDrafts', 'posLifecycleActions', 'posLifecycleEvents', 'posDocuments', 'posDocumentRequests', 'settings', 'posPayments', 'posPaymentAllocations', 'posTokenSequences'];
  const tables = Object.fromEntries(names.map(name => [name, new Proxy({ name }, { get: (t, k) => k === '_table' ? name : { table: name, key: k } })]));
  const state = Object.fromEntries(names.map(n => [n, []]));
  Object.assign(state, { branches: [{ id: 'b', name: 'Branch', code: 'B1', address: 'Street', operatingConcept: 'CONVENTIONAL', vatRatePercent: '0.00' }], menuItems: [{ id: 'dish', branchId: 'b', name: 'Saved dish', price: '10.00', isActive: true, isSellable: true, vatRatePercent: '0.00', productCode: 'D', productionStation: 'KITCHEN' }], deductions: [] });
  const op = { sql: (parts, ...values) => ({ parts, values }), isNull: c => r => r[c.key] == null, eq: (c, v) => r => r[c.key] === v, ne: (c, v) => r => r[c.key] !== v, and: (...p) => r => p.filter(Boolean).every(f => f(r)), or: (...p) => r => p.filter(Boolean).some(f => f(r)), inArray: (c, v) => r => (Array.isArray(v) ? v : v._rows().map(row => Object.values(row)[0])).includes(r[c.key]), asc: c => ({ c, d: 1 }), desc: c => ({ c, d: -1 }) };
  const mocks = { 'drizzle-orm': op, './cogs': { computeOrderCogs: async () => ({ cogsAmount: '2.10', complete: true }) }, './production': { lockRecipeStock: async () => { }, readStockRecipe: async () => [], deductStock: async (_t, b, r, s) => { state.deductions.push(s); return { inventoryDeducted: [], semiFgDeducted: [] }; } }, './production-quantity': { directRequirements: (_b, _r, l) => l }, './shifts': { requireOperableShift: async () => ({ shiftRunId: 'shift' }) }, './whatsapp-triggers': { validOptionalPhone: v => v ?? '' } };
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const filename = path.join(__dirname, '../src/lib/server', `${name}.ts`), module = { exports: {} };
    const req = r => r.includes('/db/schema/') ? tables : Object.hasOwn(mocks, r) ? mocks[r] : r.startsWith('./') ? load(r.slice(2)) : r.startsWith('../') ? load(r) : require(r);
    vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`, { filename })(req, module, module.exports);
    return cache[name] = module.exports;
  }
  const queries = [];
  const tx = {
    select: projection => ({ from(table) { let pred = () => true, sort = [], max = Infinity, joined = false; const rows = () => { queries.push({ table: table._table, max, sort }); let rows = state[table._table].filter(pred).map(r => joined ? { ...state.menuItems.find(i => i.id === r.menuItemId), ...r } : { ...r }); for (const s of [...sort].reverse()) rows.sort((a, b) => (a[s.c.key] > b[s.c.key] ? 1 : a[s.c.key] < b[s.c.key] ? -1 : 0) * s.d); rows = rows.slice(0, max); return projection ? rows.map(r => Object.fromEntries(Object.entries(projection).map(([k, c]) => [k, r[c.key]]))) : rows; }; const q = { _rows: rows, where(p) { pred = p; return q; }, orderBy(...s) { sort = s; return q; }, limit(n) { max = n; return q; }, innerJoin() { joined = true; return q; }, then(a, b) { return Promise.resolve(rows()).then(a, b); } }; return q; } }),
    insert: table => ({ values: async values => { for (const r of Array.isArray(values) ? values : [values]) state[table._table].push({ revision: 1, createdAt: new Date('2026-11-04T09:00:00Z'), updatedAt: new Date(), ownerOnly: false, paymentCaptured: false, orderId: null, ...r }); } }),
    update: table => ({ set: values => ({ where(pred) { let done = false, changed = []; const run = () => { if (!done) { changed = state[table._table].filter(pred); for (const r of changed) Object.assign(r, values); done = true; } return changed; }; return { returning: async () => run(), then: (a, b) => Promise.resolve(run()).then(a, b) }; } }) }),
    execute: async query => {
      const text = query.parts.join('?');
      if (text.includes('nextval')) return { rows: [{ value: String(++state.sequence) }] };
      if (text.includes('pos_token_sequences')) {
        const [id, branchId, businessDate, channel] = query.values;
        let row = state.posTokenSequences.find(r => r.branchId === branchId && r.businessDate === businessDate && r.channel === channel);
        if (!row) { row = { id, branchId, businessDate, channel, lastValue: 1 }; state.posTokenSequences.push(row); }
        else row.lastValue += 1;
        return { rows: [{ last_value: row.lastValue }] };
      }
      return { rows: [] };
    },
  };
  state.sequence = 0;
  tx.transaction = async fn => { const saved = structuredClone(state); try { return await fn(tx); } catch (e) { for (const k of Object.keys(saved)) state[k] = saved[k]; throw e; } };
  const actor = { id: 'cashier', name: 'Actual collector', role: 'CASHIER', branchId: 'b', moduleAccess: ['POS_CASHIER'], status: 'Active' };
  return { state, tx, queries, actor, orders: load('pos-orders') };
}

test('TAKEAWAY orders get a sequential pickup token on order/receipt/KOT; DINE_IN never does; exact replay returns the identical token', async () => {
  const h = harness();
  const takeaway1 = await h.orders.createPosOrder(h.tx, h.actor, 'b', { channel: 'TAKEAWAY', tenderType: 'CASH', lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'ta-1' });
  assert.equal(takeaway1.order.pickupToken, 'T-1');
  assert.equal(takeaway1.receipt.pickupToken, 'T-1');
  assert.equal(takeaway1.tickets[0].pickupToken, 'T-1');
  assert.equal(h.state.posOrders.find(o => o.id === takeaway1.order.id).pickupToken, 'T-1', 'persisted on the order row');

  const takeaway2 = await h.orders.createPosOrder(h.tx, h.actor, 'b', { channel: 'TAKEAWAY', tenderType: 'CASH', lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'ta-2' });
  assert.equal(takeaway2.order.pickupToken, 'T-2', 'sequential, not reused');

  const dineIn = await h.orders.createPosOrder(h.tx, h.actor, 'b', { channel: 'DINE_IN', tableNo: 'T1', lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'di-1' });
  assert.equal(dineIn.order.pickupToken, '', 'dine-in tables never get a pickup token');

  // Exact-key replay returns the identical cached token, never allocates a new one.
  const replay = await h.orders.createPosOrder(h.tx, h.actor, 'b', { channel: 'TAKEAWAY', tenderType: 'CASH', lines: [{ menuItemId: 'dish', qty: 1 }], idempotencyKey: 'ta-1' });
  assert.equal(replay.order.pickupToken, 'T-1');
  assert.equal(h.state.posTokenSequences.find(r => r.branchId === 'b' && r.channel === 'TAKEAWAY').lastValue, 2, 'replay must not advance the counter');
});
