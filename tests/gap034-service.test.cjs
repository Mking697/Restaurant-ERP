const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const load = () => require('../src/lib/server/shift-summary.ts');

// Same minimal in-memory executor as tests/shifts.test.cjs.
function memoryTx(seed = {}) {
  const { getTableName, getTableColumns } = require('drizzle-orm');
  const { PgDialect } = require('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const rows = structuredClone(seed), events = [];
  function matches(table, row, predicate) {
    if (!predicate) return true;
    const query = dialect.sqlToQuery(predicate);
    const columns = getTableColumns(table);
    return [...query.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)].every(([, column, index]) => {
      const key = Object.keys(columns).find(k => columns[k].name === column);
      return row[key] === query.params[Number(index) - 1];
    });
  }
  const tx = {
    rows, events,
    select() {
      let table, predicate, limit;
      const chain = {
        from(value) { table = value; return chain; },
        where(value) { predicate = value; return chain; },
        orderBy() { return chain; },
        limit(value) { limit = value; return chain; },
        then(resolve, reject) {
          events.push('read:' + getTableName(table));
          const result = (rows[getTableName(table)] || []).filter(row => matches(table, row, predicate));
          return Promise.resolve(structuredClone(limit ? result.slice(0, limit) : result)).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return tx;
}

const cashier = { id: 'cashier', role: 'CASHIER', branchId: 'branch' };
const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null };

test('no open run: an empty-but-honest summary, never an error, with pending orders still correctly totaled', async () => {
  const tx = memoryTx({ pos_orders: [
    { id: 'o1', branchId: 'branch', orderNumber: 'ORD-1', channel: 'DINE_IN', tableNo: 'T1', totalAmount: '100.00', status: 'OPEN', shiftRunId: '', ownerOnly: false, createdAt: new Date('2026-11-04T09:00:00Z') },
  ] });
  const summary = await load().liveShiftSummary(tx, cashier, 'branch');
  assert.equal(summary.run, null);
  assert.deepEqual(summary.collectedTenders, { cash: '0.00', card: '0.00', upi: '0.00', other: '0.00' });
  assert.equal(summary.completed.count, 0);
  assert.equal(summary.pendingOrders.visibleTotal, '100.00');
  assert.equal(summary.pendingOrders.orders.length, 1);
});

test('an open run: actual collected tenders (this run only), completed count, and pending orders carried over from an earlier run are all distinguished', async () => {
  const tx = memoryTx({
    shift_runs: [{ id: 'run-2', branchId: 'branch', label: 'Shift B', status: 'OPEN', startedAt: new Date('2026-11-04T12:00:00Z') }],
    pos_orders: [
      // Paid/completed THIS run — counted in collectedTenders and completed.
      { id: 'o1', branchId: 'branch', orderNumber: 'ORD-1', channel: 'TAKEAWAY', tableNo: '', totalAmount: '50.00', status: 'PAID', shiftRunId: 'run-2', tenderType: 'CASH', ownerOnly: false, createdAt: new Date() },
      { id: 'o2', branchId: 'branch', orderNumber: 'ORD-2', channel: 'TAKEAWAY', tableNo: '', totalAmount: '30.00', status: 'COMPLETED', shiftRunId: 'run-2', tenderType: 'CARD', ownerOnly: false, createdAt: new Date() },
      // Still OPEN, dispatched under an EARLIER run (run-1) that already ended — carried over, not counted as cash.
      { id: 'o3', branchId: 'branch', orderNumber: 'ORD-3', channel: 'DINE_IN', tableNo: 'T2', totalAmount: '75.00', status: 'OPEN', shiftRunId: 'run-1', ownerOnly: false, createdAt: new Date() },
      // A completed order from a DIFFERENT (earlier) run must not count toward THIS run's completed total.
      { id: 'o4', branchId: 'branch', orderNumber: 'ORD-4', channel: 'TAKEAWAY', tableNo: '', totalAmount: '999.00', status: 'PAID', shiftRunId: 'run-1', tenderType: 'CASH', ownerOnly: false, createdAt: new Date() },
      // A VOIDED order must never appear as pending or collected.
      { id: 'o5', branchId: 'branch', orderNumber: 'ORD-5', channel: 'TAKEAWAY', tableNo: '', totalAmount: '500.00', status: 'VOIDED', shiftRunId: 'run-2', ownerOnly: false, createdAt: new Date() },
    ],
  });
  const summary = await load().liveShiftSummary(tx, cashier, 'branch');
  assert.equal(summary.run.id, 'run-2');
  assert.equal(summary.collectedTenders.cash, '50.00');
  assert.equal(summary.collectedTenders.card, '30.00');
  assert.equal(summary.collectedTenders.upi, '0.00');
  assert.equal(summary.completed.count, 2, 'only this run\'s own completed orders');
  assert.equal(summary.completed.visibleTotal, '80.00');
  assert.equal(summary.pendingOrders.orders.length, 1);
  assert.equal(summary.pendingOrders.orders[0].id, 'o3');
  assert.equal(summary.pendingOrders.orders[0].shiftRunId, 'run-1', 'carried over from an earlier, already-ended run');
  assert.equal(summary.pendingOrders.visibleTotal, '75.00');
});

test('visibility: a non-Owner never sees an ownerOnly order or its amount, in either completed or pending totals; the Owner sees actual vs visible split', async () => {
  const tx = memoryTx({
    shift_runs: [{ id: 'run-1', branchId: 'branch', label: 'Shift A', status: 'OPEN', startedAt: new Date() }],
    pos_orders: [
      { id: 'secret-open', branchId: 'branch', orderNumber: 'ORD-S1', channel: 'DINE_IN', tableNo: 'T9', totalAmount: '1000.00', status: 'OPEN', shiftRunId: 'run-1', ownerOnly: true, createdAt: new Date() },
      { id: 'public-open', branchId: 'branch', orderNumber: 'ORD-P1', channel: 'DINE_IN', tableNo: 'T1', totalAmount: '50.00', status: 'OPEN', shiftRunId: 'run-1', ownerOnly: false, createdAt: new Date() },
    ],
  });
  const asCashier = await load().liveShiftSummary(tx, cashier, 'branch');
  assert.equal(asCashier.visibilityScope, 'access-filtered');
  assert.equal(asCashier.pendingOrders.orders.length, 1);
  assert.equal(asCashier.pendingOrders.visibleTotal, '50.00');
  assert.equal(asCashier.pendingOrders.actualTotal, undefined, 'a non-Owner never sees the actual/private split');
  assert.ok(!JSON.stringify(asCashier).includes('secret-open'));

  const asOwner = await load().liveShiftSummary(tx, owner, 'branch');
  assert.equal(asOwner.visibilityScope, 'actual');
  assert.equal(asOwner.pendingOrders.orders.length, 2);
  assert.equal(asOwner.pendingOrders.visibleTotal, '50.00');
  assert.equal(asOwner.pendingOrders.actualTotal, '1050.00');
  assert.equal(asOwner.pendingOrders.privateTotal, '1000.00');
});

test('a missing branch selection is rejected 400, not silently defaulted', async () => {
  const tx = memoryTx({});
  await assert.rejects(load().liveShiftSummary(tx, owner, null), { status: 400 });
});
