const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const load = () => require('../src/lib/server/repeat-orders.ts');

function memoryTx(seed = {}) {
  const { getTableName, getTableColumns } = require('drizzle-orm');
  const { PgDialect } = require('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const rows = structuredClone(seed);
  function matches(table, row, predicate) {
    if (!predicate) return true;
    const query = dialect.sqlToQuery(predicate);
    const columns = getTableColumns(table);
    const col = (name) => Object.keys(columns).find(k => columns[k].name === name);
    const eqChecks = [...query.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
    const inChecks = [...query.sql.matchAll(/"[^"]+"\."([^"]+)" in \(([^)]+)\)/g)];
    return eqChecks.every(([, column, index]) => row[col(column)] === query.params[Number(index) - 1])
      && inChecks.every(([, column, placeholders]) => {
        const indices = [...placeholders.matchAll(/\$(\d+)/g)].map(m => Number(m[1]) - 1);
        const values = indices.map(i => query.params[i]);
        return values.includes(row[col(column)]);
      });
  }
  return {
    rows,
    select(cols) {
      let table, predicate, limit, ordering;
      const chain = {
        from(value) { table = value; return chain; },
        where(value) { predicate = value; return chain; },
        orderBy(...xs) { ordering = xs; return chain; },
        limit(value) { limit = value; return chain; },
        then(resolve, reject) {
          const name = getTableName(table);
          let result = (rows[name] || []).filter(row => matches(table, row, predicate));
          if (ordering) result = [...result].sort((a, b) => b.createdAt - a.createdAt);
          result = limit ? result.slice(0, limit) : result;
          if (cols) result = result.map(r => Object.fromEntries(Object.keys(cols).map(k => [k, r[cols[k].name ?? k]])));
          return Promise.resolve(structuredClone(result)).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const owner = { role: 'SUPER_ADMIN' };
const manager = { role: 'BRANCH_MANAGER' };
const customer = { id: 'cust-1', phone: '712345678', name: 'Asha', status: 'ACTIVE' };
const branchId = 'branch-a';

function seedOrder(id, overrides = {}) {
  return { id, branchId, customerPhone: '712345678', orderNumber: id, channel: 'DINE_IN', totalAmount: '100.00', status: 'PAID', ownerOnly: false, createdAt: new Date(Date.now() - Math.random() * 1000), ...overrides };
}

test('recentOrdersForMember only returns this branch\'s PAID/COMPLETED orders for this exact phone, excluding hidden ones for a non-Owner', async () => {
  const { recentOrdersForMember } = load();
  const tx = memoryTx({
    customers: [customer],
    pos_orders: [
      seedOrder('o1'),
      seedOrder('o2', { branchId: 'branch-b' }), // different branch — excluded
      seedOrder('o3', { customerPhone: '799999999' }), // different customer — excluded
      seedOrder('o4', { status: 'OPEN' }), // not paid — excluded
      seedOrder('o5', { ownerOnly: true }), // hidden — excluded for a non-Owner
    ],
  });
  const asManager = await recentOrdersForMember(tx, manager, branchId, customer.id);
  assert.deepEqual(asManager.map(o => o.id).sort(), ['o1']);

  const asOwner = await recentOrdersForMember(tx, owner, branchId, customer.id);
  assert.deepEqual(asOwner.map(o => o.id).sort(), ['o1', 'o5'], 'the Owner alone sees the hidden order too');
});

test('repeatOrderPreview uses the CURRENT price, never the historical snapshot, and flags a changed price', async () => {
  const { repeatOrderPreview } = load();
  const tx = memoryTx({
    customers: [customer],
    pos_orders: [seedOrder('o1')],
    pos_order_lines: [{ id: 'l1', orderId: 'o1', menuItemId: 'm1', nameSnapshot: 'Burger', qty: 2, price: '100.00' }],
    menu_items: [{ id: 'm1', branchId, isActive: true, price: '120.00' }], // price went up since the sale
  });
  const preview = await repeatOrderPreview(tx, manager, branchId, customer.id, 'o1');
  assert.equal(preview.lines[0].available, true);
  assert.equal(preview.lines[0].currentPrice, '120.00');
  assert.equal(preview.lines[0].priceChanged, true);
  assert.equal(preview.lines[0].lineTotal, '240.00', 'uses CURRENT price * qty, not the frozen 100.00 snapshot');
  assert.equal(preview.previewTotal, '240.00');
  assert.equal(preview.anyPriceChanged, true);
  assert.equal(preview.anyUnavailable, false);
});

test('repeatOrderPreview flags a removed item and an inactive item, excluding both from the total', async () => {
  const { repeatOrderPreview } = load();
  const tx = memoryTx({
    customers: [customer],
    pos_orders: [seedOrder('o1')],
    pos_order_lines: [
      { id: 'l1', orderId: 'o1', menuItemId: 'm-gone', nameSnapshot: 'Discontinued', qty: 1, price: '50.00' },
      { id: 'l2', orderId: 'o1', menuItemId: 'm-inactive', nameSnapshot: 'Seasonal', qty: 1, price: '30.00' },
      { id: 'l3', orderId: 'o1', menuItemId: 'm-ok', nameSnapshot: 'Fries', qty: 3, price: '20.00' },
    ],
    menu_items: [
      { id: 'm-inactive', branchId, isActive: false, price: '30.00' },
      { id: 'm-ok', branchId, isActive: true, price: '20.00' },
    ],
  });
  const preview = await repeatOrderPreview(tx, manager, branchId, customer.id, 'o1');
  assert.equal(preview.lines.find(l => l.menuItemId === 'm-gone').reason, 'removed');
  assert.equal(preview.lines.find(l => l.menuItemId === 'm-inactive').reason, 'inactive');
  assert.equal(preview.lines.find(l => l.menuItemId === 'm-ok').available, true);
  assert.equal(preview.previewTotal, '60.00', 'only the still-available Fries line (3 x 20.00) counts');
  assert.equal(preview.anyUnavailable, true);
});

test('repeatOrderPreview gives the same generic 404 for a foreign-member order, a different-branch order, and a hidden order — never distinguishable', async () => {
  const { repeatOrderPreview } = load();
  const tx = memoryTx({
    customers: [customer],
    pos_orders: [
      seedOrder('foreign', { customerPhone: '799999999' }),
      seedOrder('other-branch', { branchId: 'branch-b' }),
      seedOrder('hidden', { ownerOnly: true }),
    ],
    pos_order_lines: [],
  });
  let msgs = [];
  for (const id of ['foreign', 'other-branch', 'hidden', 'does-not-exist']) {
    try { await repeatOrderPreview(tx, manager, branchId, customer.id, id); } catch (e) { msgs.push(e.message); }
  }
  assert.equal(msgs.length, 4);
  assert.ok(msgs.every(m => m === msgs[0]), 'identical message in every case — no detail leaked');
});

test('recentOrdersForMember throws for an unknown/non-ACTIVE member rather than silently returning an empty list', async () => {
  const { recentOrdersForMember } = load();
  const tx = memoryTx({ customers: [{ ...customer, status: 'MERGED' }], pos_orders: [] });
  await assert.rejects(() => recentOrdersForMember(tx, manager, branchId, customer.id), { status: 404 });
});
