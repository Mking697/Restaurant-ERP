const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const loadExpenses = () => require('../src/lib/server/expenses.ts');
const loadShifts = () => require('../src/lib/server/shifts.ts');

const input = () => ({ branchId: 'b', date: '2026-11-04', category: 'OTHER', subcategory: '', amount: '20000', description: 'Cash top-up for supplies', reference: 'REF-1', idempotencyKey: 'abcdefgh' });

test('parseExpense accepts an omitted/empty/CASH/NON_CASH paymentMethod, rejects any other value, and never accepts a client-supplied shiftRunId', () => {
  const { parseExpense } = loadExpenses();
  assert.equal(parseExpense(input()).paymentMethod, '', 'omitted defaults to unspecified/legacy');
  assert.equal(parseExpense({ ...input(), paymentMethod: '' }).paymentMethod, '');
  assert.equal(parseExpense({ ...input(), paymentMethod: 'CASH' }).paymentMethod, 'CASH');
  assert.equal(parseExpense({ ...input(), paymentMethod: 'NON_CASH' }).paymentMethod, 'NON_CASH');
  assert.throws(() => parseExpense({ ...input(), paymentMethod: 'BANK_TRANSFER' }), { status: 400 });
  assert.throws(() => parseExpense({ ...input(), paymentMethod: 'cash' }), { status: 400 }, 'case-sensitive, no fuzzy matching');
  // A client attempting to directly supply shiftRunId is rejected outright —
  // the field does not even exist in the allowed-fields list, so there is
  // no backdated/foreign/closed-run bypass surface at all.
  assert.throws(() => parseExpense({ ...input(), shiftRunId: 'some-other-run' }), { status: 400 });
});

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
const run = { id: 'run', branchId: 'branch', shiftDefinitionId: 'day', label: 'day', status: 'OPEN', startedAt: new Date('2026-11-04T06:00:00Z') };
const count = (multiple = 0) => ({ note10000Count: 0, note5000Count: 0, note2000Count: 0, note1000Count: 0, note500Count: 0, coinsInr: 100 * multiple });
const actor = { id: 'cashier' };
const cashExpense = (amount, status = 'POSTED') => ({ id: 'exp-' + Math.random(), branchId: 'branch', date: '2026-11-04', category: 'OTHER', amount, status, paymentMethod: 'CASH', shiftRunId: run.id, createdById: 'accountant' });

test('the TSh 20,000 cash-expense example closes with ZERO shortage — expected cash correctly drops by the real drawer outflow', async () => {
  const tx = memoryTx({
    branch_shifts: [definition('day')], shift_runs: [run],
    pos_orders: [{ branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '100000.00' }],
    branch_expenses: [cashExpense('20000.00')],
  });
  const result = await loadShifts().endShiftAndHandover(tx, actor, 'branch', run.id, count(800)); // counted 80,000
  assert.equal(result.cashExpected, '80000.00', '100,000 cash sales - 20,000 real drawer cash expense');
  assert.equal(result.shortageExcessInr, '0.00');
});

test('a NON_CASH (bank/card) expense never reduces expected cash, even at the same amount', async () => {
  const nonCash = { ...cashExpense('20000.00'), paymentMethod: 'NON_CASH', shiftRunId: '' };
  const tx = memoryTx({
    branch_shifts: [definition('day')], shift_runs: [run],
    pos_orders: [{ branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '100000.00' }],
    branch_expenses: [nonCash],
  });
  const result = await loadShifts().endShiftAndHandover(tx, actor, 'branch', run.id, count(1000)); // counted 100,000 — the full cash sale, untouched
  assert.equal(result.cashExpected, '100000.00', 'a non-cash expense never touches the physical drawer');
  assert.equal(result.shortageExcessInr, '0.00');
});

test('a VOIDed cash expense is excluded live — never double-subtracted, never silently re-credited', async () => {
  const tx = memoryTx({
    branch_shifts: [definition('day')], shift_runs: [run],
    pos_orders: [{ branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '100000.00' }],
    branch_expenses: [cashExpense('20000.00', 'VOID')],
  });
  const result = await loadShifts().endShiftAndHandover(tx, actor, 'branch', run.id, count(1000)); // counted 100,000 — voided expense never left the drawer
  assert.equal(result.cashExpected, '100000.00', 'a voided cash expense is treated as if it never happened');
});

test('cash expenses linked to a DIFFERENT run (not this close) never affect this close', async () => {
  const tx = memoryTx({
    branch_shifts: [definition('day')], shift_runs: [run],
    pos_orders: [{ branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '100000.00' }],
    branch_expenses: [{ ...cashExpense('999999.00'), shiftRunId: 'some-other-run' }],
  });
  const result = await loadShifts().endShiftAndHandover(tx, actor, 'branch', run.id, count(1000));
  assert.equal(result.cashExpected, '100000.00');
});

test('multiple real cash expenses in the same run all reduce expected cash, summed exactly', async () => {
  const tx = memoryTx({
    branch_shifts: [definition('day')], shift_runs: [run],
    pos_orders: [{ branchId: 'branch', shiftRunId: run.id, status: 'COMPLETED', tenderType: 'CASH', totalAmount: '100000.00' }],
    branch_expenses: [cashExpense('20000.00'), cashExpense('5000.50')],
  });
  const result = await loadShifts().endShiftAndHandover(tx, actor, 'branch', run.id, count(749.995));
  assert.equal(result.cashExpected, '74999.50', '100000 - 20000 - 5000.50');
});
