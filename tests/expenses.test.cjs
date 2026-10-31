const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/expenses.ts');
const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
const accountant = { id: 'accountant', role: 'ACCOUNTANT', branchId: 'branch-a', moduleAccess: ['ACCOUNTS_EXPENSES'] };
const input = () => ({ branchId: 'branch-a', date: '2024-02-29', category: 'RENT', amount: '123.45', description: 'February premises rent', reference: 'RENT-2024-02', idempotencyKey: 'expense-key-001' });
test('expense input accepts real dates and bounded paise strings; preserves exact replay identity', () => {
 const { parseExpense, expenseMonth } = load();
 const value = parseExpense(input());
 assert.equal(value.amount, '123.45'); assert.equal(value.date, '2024-02-29');
 assert.deepEqual(expenseMonth('2024-02'), { month: '2024-02', start: '2024-02-01', end: '2024-03-01' });
 for (const bad of ['2023-02-29', '2024-04-31', '2024-2-01', '2024-01-01T00:00:00Z']) assert.throws(() => parseExpense({ ...input(), date: bad }), { status: 400 });
 for (const bad of ['0', '-1', '1.001', '1e3', '1000000000', 20, ' 20 ', 'NaN']) assert.throws(() => parseExpense({ ...input(), amount: bad }), { status: 400 });
 for (const patch of [{ category: 'PAYROLL' }, { description: 'x' }, { description: '...' }, { reference: '' }, { idempotencyKey: '' }, { status: 'VOID' }]) assert.throws(() => parseExpense({ ...input(), ...patch }), { status: 400 });
 for (const bad of ['', '2024-13', '2024-2', null]) assert.throws(() => expenseMonth(bad), { status: 400 });
});
test('expense grants and branch membership gate reads and writes; payroll grant sees only P&L aggregates', () => {
 const { expenseScope, expensePermission } = load();
 assert.equal(expenseScope(owner, null), null); assert.equal(expenseScope(accountant, null), 'branch-a');
 assert.equal(expenseScope(owner, 'branch-a', true), 'branch-a');
 assert.throws(() => expenseScope(owner, null, true), { status: 400 });
 assert.throws(() => expenseScope(accountant, 'branch-b'), { status: 403 });
 assert.throws(() => expenseScope({ ...accountant, branchId: null }, null), { status: 403 });
 expensePermission(accountant); expensePermission(owner);
 const payroll = { ...accountant, moduleAccess: ['PAYROLL'] };
 expensePermission(payroll, true);
 assert.throws(() => expensePermission(payroll), { status: 403 });
 assert.throws(() => expensePermission({ ...accountant, moduleAccess: ['ACCOUNTS_PETTYCASH'] }, true), { status: 403 });
});
test('idempotent replay is exact payload only and void keeps immutable entry plus audit actor', () => {
 const { parseExpense, assertExpenseReplay, voidExpenseChanges } = load();
 const original = { ...parseExpense(input()), id: 'expense-1', status: 'POSTED', createdById: 'accountant' };
 assert.doesNotThrow(() => assertExpenseReplay(original, parseExpense({ ...input() })));
 const reordered = Object.fromEntries(Object.entries(input()).reverse());
 assert.doesNotThrow(() => assertExpenseReplay(original, parseExpense(reordered)));
 for (const patch of [{ amount: '123.40' }, { description: 'February premises rent ' }, { subcategory: '' }, { reference: 'OTHER-REF' }]) assert.throws(() => assertExpenseReplay(original, parseExpense({ ...input(), ...patch })), { status: 409 });
 const now = new Date('2026-10-22T00:00:00Z');
 const changes = voidExpenseChanges(original, { reason: 'Duplicate invoice entry' }, accountant, now);
 assert.deepEqual(changes, { status: 'VOID', voidReason: 'Duplicate invoice entry', voidedById: accountant.id, voidedAt: now });
 assert.equal(original.status, 'POSTED'); assert.equal(original.amount, '123.45');
 assert.notEqual(parseExpense({ ...input(), amount: '123.4' }).requestFingerprint, parseExpense({ ...input(), amount: '123.40' }).requestFingerprint);
 assert.throws(() => voidExpenseChanges({ ...original, status: 'VOID' }, { reason: 'Duplicate invoice entry' }, accountant), { status: 409 });
 for (const value of [{ reason: '' }, { reason: 'x' }, { reason: 'Valid reason', amount: '1' }]) assert.throws(() => voidExpenseChanges(original, value, accountant), { status: 400 });
});
test('expense-side P&L sums paise exactly, excludes voids, connects real revenue and never invents COGS/gross profit', () => {
 const { expenseProfitLoss } = load();
 const rows = [
  { category: 'RENT', amount: '100.10', status: 'POSTED' },
  { category: 'RENT', amount: '0.20', status: 'POSTED' },
  { category: 'OTHER', amount: '999.00', status: 'VOID' },
  { category: 'MARKETING', amount: '20.00', status: 'POSTED' },
 ];
 const report = expenseProfitLoss('2024-02', rows, [{ amount: '103.33' }, { amount: '99.99' }], '500.00');
 assert.deepEqual(report.expenses, { RENT: '100.30', UTILITIES: '0.00', MARKETING: '20.00', OTHER: '0.00' });
 assert.equal(report.laborCost, '203.32'); assert.equal(report.totalOperatingExpenses, '323.62');
 assert.equal(report.revenue, '500.00'); assert.equal(report.netProfit, '176.38');
 assert.equal(report.cogs, null); assert.equal(report.grossProfit, null);
 assert.equal(report.salesConnected, true); assert.match(report.notes.join(' '), /finalized/i); assert.match(report.notes.join(' '), /COGS/i);
 // Revenue below operating expenses correctly produces a negative net-of-opex figure, not a crash/clamp to zero.
 const loss = expenseProfitLoss('2024-02', rows, [{ amount: '103.33' }, { amount: '99.99' }], '100.00');
 assert.equal(loss.netProfit, '-223.62');
 assert.equal(expenseProfitLoss('2024-02', [], [], '0.00').totalOperatingExpenses, '0.00');
 // Zero completed sales for the month must show a real "0.00" revenue, never null/crash.
 const zeroSales = expenseProfitLoss('2024-02', [], [], '0.00');
 assert.equal(zeroSales.revenue, '0.00'); assert.equal(zeroSales.netProfit, '0.00');
 assert.throws(() => expenseProfitLoss('2024-02', [{ category: 'RENT', amount: 'NaN', status: 'POSTED' }], [], '0.00'));
});
test('expense-side P&L connects real COGS only when the caller passes it AND every order priced completely', () => {
 const { expenseProfitLoss } = load();
 const rows = [{ category: 'RENT', amount: '100.00', status: 'POSTED' }];
 // Connected: cogs provided and cogsComplete=true -> grossProfit and netProfit both reflect it.
 const connected = expenseProfitLoss('2024-02', rows, [], '500.00', '150.00', true);
 assert.equal(connected.cogs, '150.00'); assert.equal(connected.grossProfit, '350.00');
 assert.equal(connected.netProfit, '250.00'); // 500 - 150 - 100
 assert.equal(connected.cogsConnected, true);
 assert.match(connected.notes.join(' '), /COGS is connected/);
 // Incomplete: at least one order in the period couldn't be fully priced -> withheld, same pre-COGS fallback net.
 const incomplete = expenseProfitLoss('2024-02', rows, [], '500.00', '150.00', false);
 assert.equal(incomplete.cogs, null); assert.equal(incomplete.grossProfit, null);
 assert.equal(incomplete.netProfit, '400.00'); // 500 - 100, pre-COGS fallback, never the partial 150.00 subtracted
 assert.equal(incomplete.cogsConnected, false);
 // Omitted entirely (legacy caller, e.g. the plain expense list) behaves exactly like before COGS existed.
 const omitted = expenseProfitLoss('2024-02', rows, [], '500.00');
 assert.equal(omitted.cogs, null); assert.equal(omitted.grossProfit, null); assert.equal(omitted.netProfit, '400.00');
});
test('expense schema enforces scoped replay uniqueness, positive money and complete void audit', () => {
 const { getTableConfig } = require('drizzle-orm/pg-core');
 const { branchExpenses } = require('../src/db/schema/expenses.ts');
 const config = getTableConfig(branchExpenses);
 assert.equal(config.name, 'branch_expenses');
 const unique = config.indexes.find(index => index.config.name === 'expenses_branch_actor_key_unique');
 assert.equal(unique.config.unique, true);
 assert.deepEqual(unique.config.columns.map(c => c.name), ['branch_id', 'created_by_id', 'idempotency_key']);
 assert.ok(config.checks.some(check => check.name === 'expenses_amount_positive'));
 assert.ok(config.checks.some(check => check.name === 'expenses_void_audit'));
 assert.equal(branchExpenses.amount.getSQLType(), 'numeric(11, 2)');
});
test('integration runner fails closed before DB access unless explicitly bound to disposable loopback target', () => {
 const { guard } = require('./expenses.integration.cjs');
 const approved = { EXPENSES_INTEGRATION: '1', PGHOST: '127.0.0.1', PGPORT: '5436', PGDATABASE: 'restaurant_erp_workforce_qa_20261022', APP_ORIGIN: 'http://localhost:3030', PGUSER: 'qa-guard-only', PGPASSWORD: 'qa-guard-only' };
 const previous = Object.fromEntries(Object.keys(approved).map(key => [key, process.env[key]]));
 try {
  Object.assign(process.env, approved); assert.doesNotThrow(guard);
  for (const [key, value] of [['EXPENSES_INTEGRATION', ''], ['PGHOST', 'remote.invalid'], ['PGPORT', '5432'], ['PGDATABASE', 'restaurant_erp_local'], ['PGDATABASE', 'restaurant_erp_workforce_qa_20261022.evil'], ['APP_ORIGIN', 'https://restaurant-erp-tau.vercel.app'], ['PGUSER', ''], ['PGPASSWORD', '']]) {
   Object.assign(process.env, approved, { [key]: value }); assert.throws(guard);
  }
 } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
test('exported accounts routes reject anonymous reads and CSRF-less writes before any DB access', async () => {
 const Module = require('node:module'), path = require('node:path');
 const originalLoad = Module._load;
 Module._load = function(request, parent, isMain) {
  if (request === '@/db/client') return { db: { transaction: async fn => fn({ execute: async () => {} }) } };
  if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
 };
 const previous = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'http://localhost:3030';
 try {
  const expenses = require('../src/app/api/accounts/expenses/route.ts');
  const pnl = require('../src/app/api/accounts/profit-loss/route.ts');
  const voidRoute = require('../src/app/api/accounts/expenses/[id]/void/route.ts');
  const get = new Request('http://localhost:3030/api/accounts/expenses?month=2024-02');
  assert.equal((await expenses.GET(get)).status, 401); assert.equal((await pnl.GET(get)).status, 401);
  const post = origin => new Request(get.url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(input()) });
  assert.equal((await expenses.POST(post())).status, 403);
  assert.equal((await expenses.POST(post('http://localhost:3030'))).status, 401);
  assert.equal((await voidRoute.POST(post(), { params: Promise.resolve({ id: 'expense-1' }) })).status, 403);
  assert.equal((await voidRoute.POST(post('http://localhost:3030'), { params: Promise.resolve({ id: 'expense-1' }) })).status, 401);
 } finally { Module._load = originalLoad; if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; }
});
