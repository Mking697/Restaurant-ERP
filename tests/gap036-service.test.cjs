const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const loadShifts = () => require('../src/lib/server/shifts.ts');

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
    async execute() { events.push('lock'); },
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
    insert(table) {
      return { values(value) {
        const name = getTableName(table);
        const row = { status: name === 'shift_handovers' || name === 'ho_cash_dispatches' ? 'PENDING' : 'OPEN', startedAt: new Date(), ...value };
        (rows[name] ||= []).push(row); events.push('insert:' + name);
        return { returning: async () => structuredClone([row]), then: resolve => Promise.resolve().then(resolve) };
      } };
    },
    update(table) {
      return { set(value) { return { where(predicate) {
        const changed = (rows[getTableName(table)] || []).filter(row => matches(table, row, predicate));
        changed.forEach(row => Object.assign(row, value)); events.push('update:' + getTableName(table));
        return { returning: async () => structuredClone(changed), then: resolve => Promise.resolve().then(resolve) };
      } }; } };
    },
  };
  return tx;
}
const definition = (id) => ({ id, branchId: 'branch', label: id, startTime: '00:00', endTime: '00:00', isActive: true });
const run = { id: 'run', branchId: 'branch', shiftDefinitionId: 'day', label: 'day', status: 'OPEN', startedAt: new Date('2026-11-04T06:00:00Z') };
const count = (multiple = 0) => ({ note10000Count: 0, note5000Count: 0, note2000Count: 0, note1000Count: 0, note500Count: 0, coinsInr: 100 * multiple });
const owner = { id: 'owner', role: 'SUPER_ADMIN' };
const manager = { id: 'manager', role: 'BRANCH_MANAGER' };
const seed100k = () => ({ branch_shifts: [definition('day')], shift_runs: [{ ...run }], pos_orders: [{ branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '100000.00' }] });

test('dispatching to HO ends the run WITHOUT opening a next run, and computes the exact dispatched/retained split', async () => {
  const tx = memoryTx(seed100k());
  const result = await loadShifts().dispatchShiftCashToHo(tx, manager, 'branch', run.id, count(1000), '10000.00'); // count 100,000, retain 10,000
  assert.equal(result.dispatch.countedCashInr, '100000.00');
  assert.equal(result.dispatch.retainedFloatInr, '10000.00');
  assert.equal(result.dispatch.dispatchedAmountInr, '90000.00');
  assert.equal(result.dispatch.status, 'PENDING');
  assert.equal(result.shortageExcessInr, '0.00');
  assert.equal(tx.rows.shift_runs.find(r => r.id === run.id).status, 'ENDED');
  assert.equal(tx.rows.shift_runs.length, 1, 'no next run was ever created — exactly the opposite of endShiftAndHandover');
  assert.equal(tx.rows.shift_handovers, undefined, 'no shiftHandovers row either — this is a distinct HO custody path');
});

test('retained float defaults to 0 (full count dispatched) when omitted', async () => {
  const tx = memoryTx(seed100k());
  const result = await loadShifts().dispatchShiftCashToHo(tx, manager, 'branch', run.id, count(1000), undefined);
  assert.equal(result.dispatch.retainedFloatInr, '0.00');
  assert.equal(result.dispatch.dispatchedAmountInr, '100000.00');
});

test('retained float above the counted total is rejected (400) — cannot retain more than exists', async () => {
  const tx = memoryTx(seed100k());
  await assert.rejects(() => loadShifts().dispatchShiftCashToHo(tx, manager, 'branch', run.id, count(1000), '999999.00'), { status: 400 });
});

test('double dispatch is rejected — the run is already ENDED after the first', async () => {
  const tx = memoryTx(seed100k());
  await loadShifts().dispatchShiftCashToHo(tx, manager, 'branch', run.id, count(1000), '0');
  await assert.rejects(() => loadShifts().dispatchShiftCashToHo(tx, manager, 'branch', run.id, count(1000), '0'), { status: 404 });
});

test('a dispatch is accepted only by SUPER_ADMIN, never by the dispatching actor, and never twice', async () => {
  const tx = memoryTx(seed100k());
  const { dispatch } = await loadShifts().dispatchShiftCashToHo(tx, manager, 'branch', run.id, count(1000), '0');

  // Non-owner (even a different branch manager) is rejected outright.
  await assert.rejects(() => loadShifts().acceptHoCashDispatch(tx, { id: 'other-manager', role: 'BRANCH_MANAGER' }, dispatch.id, undefined), { status: 403 });

  // The SAME actor who dispatched cannot also accept, even as SUPER_ADMIN.
  await assert.rejects(() => loadShifts().acceptHoCashDispatch(tx, { id: manager.id, role: 'SUPER_ADMIN' }, dispatch.id, undefined), { status: 403 });

  const accepted = await loadShifts().acceptHoCashDispatch(tx, owner, dispatch.id, undefined);
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.acceptedAmountInr, dispatch.dispatchedAmountInr, 'no amount supplied defaults to exactly what was dispatched');
  assert.equal(accepted.discrepancyInr, '0.00');

  // Retry is rejected — already ACCEPTED, not PENDING.
  await assert.rejects(() => loadShifts().acceptHoCashDispatch(tx, owner, dispatch.id, undefined), { status: 404 });
});

test('a real discrepancy (HO counted a different amount) is recorded as a signed difference, custody still accepted', async () => {
  const tx = memoryTx(seed100k());
  const { dispatch } = await loadShifts().dispatchShiftCashToHo(tx, manager, 'branch', run.id, count(1000), '0'); // dispatched 100,000.00
  const accepted = await loadShifts().acceptHoCashDispatch(tx, owner, dispatch.id, '99500.00'); // HO counted 500 short
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.acceptedAmountInr, '99500.00');
  assert.equal(accepted.discrepancyInr, '-500.00');
});

test('accepting an unknown/foreign dispatch id is rejected (404)', async () => {
  const tx = memoryTx(seed100k());
  await assert.rejects(() => loadShifts().acceptHoCashDispatch(tx, owner, 'no-such-dispatch', undefined), { status: 404 });
});

test('the ordinary NEXT_SHIFT handover path is completely unaffected — still opens a next run as before', async () => {
  const tx = memoryTx(seed100k());
  const result = await loadShifts().endShiftAndHandover(tx, manager, 'branch', run.id, count(1000));
  assert.equal(result.handover.cashAmount, '100000.00');
  assert.equal(result.toRun.label, 'day'); // single 24h "day" definition cycles back to itself
  assert.equal(tx.rows.shift_runs.length, 2, 'a next run WAS opened, unlike the HO dispatch path');
});
