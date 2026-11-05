const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));

// Note: getCustomerWithConsent (the only function that calls isOptedOut) is
// intentionally NOT exercised here — it needs a real whatsapp_opt_outs read,
// covered instead by the real-DB smoke check in docs/gap038-verification.md.
const load = () => require('../src/lib/server/customers.ts');

function memoryTx(seed = []) {
  const { getTableName, getTableColumns } = require('drizzle-orm');
  const { PgDialect } = require('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const rows = { customers: [...seed] };
  function matches(table, row, predicate) {
    if (!predicate) return true;
    const query = dialect.sqlToQuery(predicate);
    const columns = getTableColumns(table);
    const eqChecks = [...query.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
    const neChecks = [...query.sql.matchAll(/"[^"]+"\."([^"]+)" <> \$(\d+)/g)];
    const col = (name) => Object.keys(columns).find(k => columns[k].name === name);
    return eqChecks.every(([, column, index]) => row[col(column)] === query.params[Number(index) - 1])
      && neChecks.every(([, column, index]) => row[col(column)] !== query.params[Number(index) - 1]);
  }
  return {
    rows,
    select() {
      let table, predicate, limit;
      const chain = {
        from(value) { table = value; return chain; },
        where(value) { predicate = value; return chain; },
        limit(value) { limit = value; return chain; },
        then(resolve, reject) {
          const result = rows[getTableName(table)].filter(row => matches(table, row, predicate));
          return Promise.resolve(structuredClone(limit ? result.slice(0, limit) : result)).then(resolve, reject);
        },
      };
      return chain;
    },
    insert(table) {
      return { values(value) {
        const name = getTableName(table);
        if (rows[name].some(r => r.phone === value.phone)) { const err = new Error('duplicate'); err.code = '23505'; throw err; }
        const row = { status: 'ACTIVE', mergedIntoId: null, createdAt: new Date(), updatedAt: new Date(), ...value };
        rows[name].push(row);
        return { returning: async () => structuredClone([row]) };
      } };
    },
    update(table) {
      return { set(value) { return { where(predicate) {
        const changed = rows[getTableName(table)].filter(row => matches(table, row, predicate));
        changed.forEach(row => Object.assign(row, value));
        return { returning: async () => structuredClone(changed) };
      } }; } };
    },
  };
}

const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null };
const managerA = { id: 'manager-a', role: 'BRANCH_MANAGER', branchId: 'branch-a' };
const managerB = { id: 'manager-b', role: 'BRANCH_MANAGER', branchId: 'branch-b' };
const cashier = { id: 'cashier', role: 'CASHIER', branchId: 'branch-a' };

test('findOrCreateCustomer creates once and returns the SAME record for a repeat phone (no duplicate identity)', async () => {
  const { findOrCreateCustomer } = load();
  const tx = memoryTx();
  const first = await findOrCreateCustomer(tx, managerA, 'branch-a', { phone: '712345678', name: 'Asha' });
  assert.equal(first.created, true);
  const second = await findOrCreateCustomer(tx, managerB, 'branch-b', { phone: '0712345678', name: 'Asha Again' }); // same person, different variant/branch
  assert.equal(second.created, false);
  assert.equal(second.customer.id, first.customer.id, 'resolves to the SAME member, not a second one');
  assert.equal(tx.rows.customers.length, 1);
});

test('findOrCreateCustomer survives a genuine insert race (23505) by re-reading instead of erroring', async () => {
  const { findOrCreateCustomer } = load();
  const tx = memoryTx();
  // Simulate another request having already inserted between our read and insert.
  tx.rows.customers.push({ id: 'won-the-race', phone: '722222222', name: 'Existing', createdBranchId: 'branch-a', createdBy: 'someone-else', status: 'ACTIVE', mergedIntoId: null });
  const originalSelect = tx.select.bind(tx);
  let selectCount = 0;
  tx.select = (...args) => { selectCount++; const chain = originalSelect(...args); if (selectCount === 1) { const origThen = chain.then.bind(chain); chain.then = (resolve) => origThen(() => resolve([])); } return chain; };
  const result = await findOrCreateCustomer(tx, managerA, 'branch-a', { phone: '722222222', name: 'Existing Again' });
  assert.equal(result.created, false);
  assert.equal(result.customer.id, 'won-the-race');
});

test('a plain name edit requires the registering branch Manager or the Owner — a different branch Manager or a cashier is rejected', async () => {
  const { findOrCreateCustomer, updateCustomerName } = load();
  const tx = memoryTx();
  const { customer } = await findOrCreateCustomer(tx, managerA, 'branch-a', { phone: '733333333', name: 'Bilal' });

  await assert.rejects(() => updateCustomerName(tx, managerB, customer.id, 'New Name'), { status: 403 });
  await assert.rejects(() => updateCustomerName(tx, cashier, customer.id, 'New Name'), { status: 403 });

  const updated = await updateCustomerName(tx, managerA, customer.id, 'Bilal Renamed');
  assert.equal(updated.name, 'Bilal Renamed');

  const byOwner = await updateCustomerName(tx, owner, customer.id, 'Bilal Owner Renamed');
  assert.equal(byOwner.name, 'Bilal Owner Renamed');
});

test('mergeCustomers folds one record into another exactly once; rejects self-merge, double-merge, and merge-into-merged', async () => {
  const { findOrCreateCustomer, mergeCustomers } = load();
  const tx = memoryTx();
  const { customer: dup1 } = await findOrCreateCustomer(tx, managerA, 'branch-a', { phone: '744444444', name: 'Dup One' });
  const { customer: dup2 } = await findOrCreateCustomer(tx, managerA, 'branch-a', { phone: '745555555', name: 'Dup Two' });

  await assert.rejects(() => mergeCustomers(tx, managerA, dup1.id, dup1.id), { status: 400 }, 'cannot merge into itself');

  const merged = await mergeCustomers(tx, managerA, dup1.id, dup2.id);
  assert.equal(merged.status, 'MERGED');
  assert.equal(merged.mergedIntoId, dup2.id);

  await assert.rejects(() => mergeCustomers(tx, managerA, dup1.id, dup2.id), { status: 409 }, 'already-merged record cannot be merged again');

  const { customer: dup3 } = await findOrCreateCustomer(tx, managerA, 'branch-a', { phone: '746666666', name: 'Dup Three' });
  await assert.rejects(() => mergeCustomers(tx, managerA, dup3.id, dup1.id), { status: 409 }, 'cannot merge INTO an already-merged record');
});

test('mergeCustomers requires edit authority on BOTH sides — a cross-branch Manager cannot merge records they did not register', async () => {
  const { findOrCreateCustomer, mergeCustomers } = load();
  const tx = memoryTx();
  const { customer: a } = await findOrCreateCustomer(tx, managerA, 'branch-a', { phone: '747777777', name: 'A' });
  const { customer: b } = await findOrCreateCustomer(tx, managerB, 'branch-b', { phone: '748888888', name: 'B' });
  await assert.rejects(() => mergeCustomers(tx, managerA, a.id, b.id), { status: 403 }, 'manager A cannot touch branch B\'s record');
  const merged = await mergeCustomers(tx, owner, a.id, b.id); // Owner can merge across branches
  assert.equal(merged.status, 'MERGED');
});
