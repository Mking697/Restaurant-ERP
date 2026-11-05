const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const load = () => require('../src/lib/server/shifts.ts');

// Same minimal in-memory executor as tests/shifts.test.cjs (duplicated per
// that file's own established per-test-file convention).
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
        const row = { status: name === 'shift_handovers' ? 'PENDING' : 'OPEN', startedAt: new Date(), ...value };
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
const definition = (id, startTime = '00:00', endTime = '00:00') => ({ id, branchId: 'branch', label: id, startTime, endTime, isActive: true });
const count = (multiple = 0) => ({ note10000Count: 0, note5000Count: 0, note2000Count: 0, note1000Count: 0, note500Count: 0, coinsInr: 100 * multiple });
const cashier = { id: 'cashier', role: 'CASHIER' };
const manager = { id: 'manager', role: 'BRANCH_MANAGER' };
const owner = { id: 'owner', role: 'SUPER_ADMIN' };

test('a Branch Manager can record an opening float for a first shift; it is immutable and used as the close baseline with no incoming handover', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')] });
  const run = await load().startFirstShift(tx, manager, 'branch', { openingFloatInr: '50000', openingFloatReference: "Owner's cash box" });
  assert.equal(run.openingFloatInr, '50000.00');
  assert.equal(run.openingFloatReference, "Owner's cash box");
  assert.equal(run.openingFloatRecordedBy, manager.id);
  assert.ok(run.openingFloatRecordedAt);

  // No incoming accepted handover exists for this very first run — the
  // recorded opening float becomes the expected-cash baseline, not 0.
  tx.rows.pos_orders = [{ branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '10000.00' }];
  const ended = await load().endShiftAndHandover(tx, manager, 'branch', run.id, count(600));
  assert.equal(ended.cashExpected, '60000.00', 'opening float 50000 + 10000 cash sales');
  assert.equal(ended.shortageExcessInr, '0.00');
});

test('a plain Cashier cannot record an opening float, but can still start a shift normally without one', async () => {
  const txDenied = memoryTx({ branch_shifts: [definition('day')] });
  await assert.rejects(load().startFirstShift(txDenied, cashier, 'branch', { openingFloatInr: '50000' }), { status: 403 });
  assert.ok(!txDenied.events.some(e => e.startsWith('insert:')), 'rejected opening float attempt writes nothing');

  const txOk = memoryTx({ branch_shifts: [definition('day')] });
  const run = await load().startFirstShift(txOk, cashier, 'branch');
  assert.equal(run.openingFloatInr, null, 'unaffected default: no opening float recorded');
  assert.equal(run.openingFloatReference, '');
  assert.equal(run.openingFloatRecordedBy, null);
});

test('an Owner may also record an opening float for any branch; negative/invalid amounts are rejected', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')] });
  const run = await load().startFirstShift(tx, owner, 'branch', { openingFloatInr: '0' });
  assert.equal(run.openingFloatInr, '0.00', 'an explicit zero is a deliberate, recorded entry — distinct from "not provided"');
  assert.equal(run.openingFloatRecordedBy, owner.id);

  const txNeg = memoryTx({ branch_shifts: [definition('day')] });
  await assert.rejects(load().startFirstShift(txNeg, manager, 'branch', { openingFloatInr: '-500' }), { status: 400 });
  const txBad = memoryTx({ branch_shifts: [definition('day')] });
  await assert.rejects(load().startFirstShift(txBad, manager, 'branch', { openingFloatInr: 'not-a-number' }), { status: 400 });
});

test('a float can never be recorded twice: the second shift-start attempt for an already-open branch is rejected before any write', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')] });
  await load().startFirstShift(tx, manager, 'branch', { openingFloatInr: '50000' });
  const writesBefore = tx.events.filter(e => e.startsWith('insert:')).length;
  await assert.rejects(load().startFirstShift(tx, manager, 'branch', { openingFloatInr: '99999' }), { status: 409 });
  assert.equal(tx.events.filter(e => e.startsWith('insert:')).length, writesBefore, 'the rejected duplicate attempt writes nothing');
  assert.equal(tx.rows.shift_runs.length, 1);
  assert.equal(tx.rows.shift_runs[0].openingFloatInr, '50000.00', 'the original float is untouched');
});

test('a later run (with a real incoming handover) ignores its own openingFloatInr and uses the carried-forward drawer balance instead', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')] });
  const first = await load().startFirstShift(tx, manager, 'branch', { openingFloatInr: '50000' });
  tx.rows.pos_orders = [{ branchId: 'branch', shiftRunId: first.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '0.00' }];
  const ended = await load().endShiftAndHandover(tx, manager, 'branch', first.id, count(500));
  await load().acceptHandover(tx, manager, 'branch', ended.handover.id);
  // The second run's own openingFloatInr is null (never set); its baseline
  // must come from the accepted handover (50000), not fall back to 0.
  assert.ok(tx.rows.shift_runs[1].openingFloatInr == null);
  const secondEnd = await load().endShiftAndHandover(tx, manager, 'branch', ended.toRun.id, count(500));
  assert.equal(secondEnd.cashExpected, '50000.00');
});
