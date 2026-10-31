const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/shifts.ts');

// Exercise the real service without opening a DB connection. The small executor
// implements only the Drizzle operations used here; SQL predicates still come
// from Drizzle, so branch/status/run filters are evaluated rather than ignored.
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
const run = { id: 'run', branchId: 'branch', shiftDefinitionId: 'day', label: 'day', status: 'OPEN', startedAt: new Date('2026-10-27T00:00:00Z') };
const count = (multiple = 0) => ({ note10000Count: 0, note5000Count: 0, note2000Count: 0, note1000Count: 0, note500Count: 0, coinsInr: 100 * multiple });
const actor = { id: 'cashier' };

test('POS eligibility holds the branch shift lock before even checking opt-out configuration', async () => {
  const tx = memoryTx();
  let unlock;
  tx.execute = () => new Promise(resolve => { unlock = resolve; tx.events.push('lock'); });
  const pending = load().requireOperableShift(tx, 'branch');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(tx.events, ['lock']);
  unlock();
  assert.deepEqual(await pending, { shiftRunId: '', gated: false });
});

test('two consecutive closings carry counted incoming cash but never carry electronic receipts', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')], shift_runs: [run], pos_orders: [
    { branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '100.00' },
    { branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CARD', totalAmount: '250.00' },
    { branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'UPI', totalAmount: '75.00' },
  ] });
  const first = await load().endShiftAndHandover(tx, actor, 'branch', run.id, count(2));
  assert.equal(first.cashExpected, '100.00');
  assert.equal(first.shortageExcessInr, '100.00');
  await load().acceptHandover(tx, actor, 'branch', first.handover.id);
  tx.rows.pos_orders.push(...[
    ['CASH', '100.00'], ['CARD', '50.00'], ['UPI', '25.00'], ['OTHER', '10.00'],
  ].map(([tenderType, totalAmount]) => ({ branchId: 'branch', shiftRunId: first.toRun.id, status: 'COMPLETED', tenderType, totalAmount })));
  const second = await load().endShiftAndHandover(tx, actor, 'branch', first.toRun.id, count(3));
  assert.equal(second.cashExpected, '300.00', 'actual accepted 200 cash + new 100 sale, not prior expected 100');
  assert.equal(second.shortageExcessInr, '0.00');
  assert.equal(tx.rows.cash_drops[1].expectedCashInr, '300.00');
  assert.equal(second.handover.cashAmount, '300.00');
  assert.equal(second.handover.cardAmount, '50.00');
  assert.equal(second.handover.upiAmount, '25.00');
  assert.equal(second.handover.otherAmount, '10.00');
});

test('end response returns the persisted ENDED run and closing actor/time', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')], shift_runs: [run] });
  const result = await load().endShiftAndHandover(tx, actor, 'branch', run.id, count());
  assert.equal(result.fromRun.status, 'ENDED');
  assert.equal(result.fromRun.endedBy, actor.id);
  assert.ok(result.fromRun.endedAt instanceof Date);
  assert.deepEqual(result.fromRun, tx.rows.shift_runs[0]);
});

test('replacement definitions select the currently due window, not the first row', async () => {
  const now = load().currentIstTime();
  const [h, m] = now.split(':').map(Number);
  const opposite = (h * 60 + m + 720) % 1440;
  const later = `${String(Math.floor(opposite / 60)).padStart(2, '0')}:${String(opposite % 60).padStart(2, '0')}`;
  const tx = memoryTx({ branch_shifts: [definition('not-due', later, now), definition('due', now, later)], shift_runs: [run] });
  const result = await load().endShiftAndHandover(tx, actor, 'branch', run.id, count());
  assert.equal(result.toRun.shiftDefinitionId, 'due');
});

test('ending without active definitions fails before any write', async () => {
  const tx = memoryTx({ shift_runs: [run] });
  await assert.rejects(load().endShiftAndHandover(tx, actor, 'branch', run.id, count()), { status: 409 });
  assert.ok(!tx.events.some(event => /^(insert|update):/.test(event)));
});

test('foreign-branch run IDs and handover IDs fail closed without writes', async () => {
  const tx = memoryTx({ shift_runs: [run], shift_handovers: [{ id: 'handover', branchId: 'branch', toRunId: run.id, status: 'PENDING' }] });
  await assert.rejects(load().endShiftAndHandover(tx, actor, 'foreign', run.id, count()), { status: 404 });
  await assert.rejects(load().acceptHandover(tx, actor, 'foreign', 'handover'), { status: 404 });
  assert.ok(!tx.events.some(event => /^(insert|update):/.test(event)));
});

test('pending incoming handover denies POS and ending before writes', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')], shift_runs: [run], shift_handovers: [{ id: 'incoming', branchId: 'branch', toRunId: run.id, status: 'PENDING', cashAmount: '100.00' }] });
  await assert.rejects(load().requireOperableShift(tx, 'branch'), { status: 409 });
  await assert.rejects(load().endShiftAndHandover(tx, actor, 'branch', run.id, count()), { status: 409 });
  assert.ok(!tx.events.some(event => /^(insert|update):/.test(event)));
});

test('closing ignores foreign branch, other run, and non-completed receipts', async () => {
  const tx = memoryTx({ branch_shifts: [definition('day')], shift_runs: [run],
    shift_handovers: [{ id: 'foreign', branchId: 'foreign', toRunId: run.id, status: 'ACCEPTED', cashAmount: '900.00' }],
    pos_orders: [
      { branchId: 'foreign', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '800.00' },
      { branchId: 'branch', shiftRunId: 'old-run', status: 'COMPLETED', tenderType: 'CARD', totalAmount: '700.00' },
      { branchId: 'branch', shiftRunId: run.id, status: 'VOIDED', tenderType: 'UPI', totalAmount: '600.00' },
    ],
  });
  const result = await load().endShiftAndHandover(tx, actor, 'branch', run.id, count());
  assert.equal(result.cashExpected, '0.00');
  assert.equal(result.handover.cardAmount, '0.00');
  assert.equal(result.handover.upiAmount, '0.00');
});

test('a single shift must cover the full 24h (same start/end wraps the whole day)', () => {
  const { validateShiftDefinitions } = load();
  const result = validateShiftDefinitions([{ label: 'All Day', startTime: '09:00', endTime: '09:00' }]);
  assert.equal(result.length, 1);
});

test('two shifts must tile exactly 24h with zero gap/overlap, cyclic', () => {
  const { validateShiftDefinitions } = load();
  const result = validateShiftDefinitions([
    { label: 'Shift A', startTime: '09:00', endTime: '21:00' },
    { label: 'Shift B', startTime: '21:00', endTime: '09:00' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].endTime, result[1].startTime);
  assert.equal(result[1].endTime, result[0].startTime);
});

test('a gap between shifts is rejected', () => {
  const { validateShiftDefinitions } = load();
  assert.throws(() => validateShiftDefinitions([
    { label: 'Shift A', startTime: '09:00', endTime: '17:00' },
    { label: 'Shift B', startTime: '18:00', endTime: '09:00' },
  ]), { status: 400 });
});

test('an overlap between shifts is rejected', () => {
  const { validateShiftDefinitions } = load();
  assert.throws(() => validateShiftDefinitions([
    { label: 'Shift A', startTime: '09:00', endTime: '18:00' },
    { label: 'Shift B', startTime: '17:00', endTime: '09:00' },
  ]), { status: 400 });
});

test('three shifts covering less than 24h total are rejected even if individually chained', () => {
  const { validateShiftDefinitions } = load();
  assert.throws(() => validateShiftDefinitions([
    { label: 'A', startTime: '09:00', endTime: '15:00' },
    { label: 'B', startTime: '15:00', endTime: '20:00' },
    { label: 'C', startTime: '20:00', endTime: '23:00' },
  ]), { status: 400 });
});

test('invalid time formats, empty labels and empty/oversized lists are rejected', () => {
  const { validateShiftDefinitions } = load();
  assert.throws(() => validateShiftDefinitions([]), { status: 400 });
  assert.throws(() => validateShiftDefinitions([{ label: '', startTime: '09:00', endTime: '09:00' }]), { status: 400 });
  assert.throws(() => validateShiftDefinitions([{ label: 'A', startTime: '9:00', endTime: '09:00' }]), { status: 400 });
  assert.throws(() => validateShiftDefinitions([{ label: 'A', startTime: '24:00', endTime: '09:00' }]), { status: 400 });
  assert.throws(() => validateShiftDefinitions(Array.from({ length: 13 }, (_, i) => ({ label: `S${i}`, startTime: '00:00', endTime: '00:00' }))), { status: 400 });
});

test('three equal shifts (8h each) tile 24h cleanly', () => {
  const { validateShiftDefinitions } = load();
  const result = validateShiftDefinitions([
    { label: 'Morning', startTime: '06:00', endTime: '14:00' },
    { label: 'Evening', startTime: '14:00', endTime: '22:00' },
    { label: 'Night', startTime: '22:00', endTime: '06:00' },
  ]);
  assert.equal(result.length, 3);
});

test('currentIstTime formats as 24h HH:MM in Asia/Kolkata', () => {
  const { currentIstTime } = load();
  const t = currentIstTime(new Date('2026-01-15T03:30:00Z')); // 09:00 IST
  assert.equal(t, '09:00');
});
