const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
// accounts-ledger.ts (like workforce.ts/expenses route files) imports schema
// via the "@/*" path alias, which plain `require` cannot resolve — resolve it
// to ../src for this whole file, same technique as expenses.test.cjs's route
// test, just applied file-wide since every test here touches @/ imports.
const Module = require('node:module'), path = require('node:path');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@/db/client') return { db: { transaction: async fn => fn({ execute: async () => {} }) } };
  if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
const load = () => require('../src/lib/server/accounts-ledger.ts');
const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
const pettyUser = { id: 'petty-user', role: 'ACCOUNTANT', branchId: 'branch-a', moduleAccess: ['PETTY_CASH'] };
const reconUser = { id: 'recon-user', role: 'ACCOUNTANT', branchId: 'branch-a', moduleAccess: ['AGGREGATOR_RECON'] };
const denied = { id: 'denied-user', role: 'CASHIER', branchId: 'branch-a', moduleAccess: [] };
const pettyInput = () => ({ branchId: 'branch-a', entryType: 'OUT', amount: '250.00', description: 'Milk and cleaning supplies', photoUrl: '' });
const aggInput = () => ({ branchId: 'branch-a', channel: 'SWIGGY', orderValue: '500.00', commissionAmount: '75.00', adsAmount: '10.00', refundPenalty: '0.00', orderDate: '2024-02-15' });

test('ledgerMonth/ledgerDate parse real calendar values and reject invalid ones', () => {
  const { ledgerMonth, ledgerDate } = load();
  const range = ledgerMonth('2024-02');
  assert.equal(range.month, '2024-02');
  assert.equal(range.start.toISOString(), '2024-02-01T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2024-03-01T00:00:00.000Z');
  for (const bad of ['', '2024-13', '2024-2', null, undefined, 20240201]) assert.throws(() => ledgerMonth(bad), { status: 400 });
  assert.equal(ledgerDate('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
  for (const bad of ['2023-02-29', '2024-04-31', '2024-2-01', '2024-01-01T00:00:00Z', '', null]) assert.throws(() => ledgerDate(bad), { status: 400 });
});
test('queryBranchId treats absent/empty query param as no filter, not a mismatch', () => {
  const { queryBranchId } = load();
  assert.equal(queryBranchId(null), null);
  assert.equal(queryBranchId(''), null);
  assert.equal(queryBranchId('branch-a'), 'branch-a');
});
test('petty cash input is allowlisted, requires positive amount and a real entryType', () => {
  const { parsePettyCashInput } = load();
  const value = parsePettyCashInput(pettyInput());
  assert.equal(value.amount, '250.00'); assert.equal(value.entryType, 'OUT');
  for (const patch of [{ entryType: 'TRANSFER' }, { amount: '0' }, { amount: '-5' }, { amount: '1.001' }, { description: 'x' }, { description: '' }, { extra: 'nope' }]) assert.throws(() => parsePettyCashInput({ ...pettyInput(), ...patch }), { status: 400 });
  assert.doesNotThrow(() => parsePettyCashInput({ ...pettyInput(), photoUrl: 'https://example.test/receipt.jpg' }));
});
test('aggregator input is allowlisted, server never trusts a client netPayout field', () => {
  const { parseAggregatorInput, AGGREGATOR_CHANNELS } = load();
  const value = parseAggregatorInput(aggInput());
  assert.deepEqual(AGGREGATOR_CHANNELS, ['SWIGGY', 'ZOMATO']);
  assert.equal(value.channel, 'SWIGGY'); assert.equal(value.orderValue, '500.00');
  assert.throws(() => parseAggregatorInput({ ...aggInput(), netPayout: '999.00' }), { status: 400 });
  for (const patch of [{ channel: 'UBER_EATS' }, { orderValue: '0' }, { orderValue: '-1' }, { orderDate: '2024-13-01' }]) assert.throws(() => parseAggregatorInput({ ...aggInput(), ...patch }), { status: 400 });
  const minimal = parseAggregatorInput({ branchId: 'branch-a', channel: 'ZOMATO', orderValue: '100.00', orderDate: '2024-02-15' });
  assert.equal(minimal.commissionAmount, '0.00'); assert.equal(minimal.adsAmount, '0.00'); assert.equal(minimal.refundPenalty, '0.00');
});
test('postPettyCashEntry derives balance from the sum of real rows and rejects a negative result', async () => {
  const { postPettyCashEntry } = load();
  let call = 0;
  function chain(rows) { const p = Promise.resolve(rows); p.limit = () => Promise.resolve(rows); return p; }
  const tx = {
    select: () => ({ from: () => ({ where: () => chain(++call % 2 === 1 ? [{ id: 'branch-a' }] : [{ totalIn: '100.00', totalOut: '90.00' }]) }) }),
    insert: () => ({ values: (v) => ({ returning: () => Promise.resolve([{ ...v }]) }) }),
  };
  const row = await postPettyCashEntry(tx, pettyUser, { ...pettyInput(), entryType: 'OUT', amount: '5.00' });
  assert.equal(row.balanceAfterInr, '5.00'); // 100 - 90 - 5
  await assert.rejects(() => postPettyCashEntry(tx, pettyUser, { ...pettyInput(), entryType: 'OUT', amount: '50.00' }), { status: 400 }); // would go to -40
  await assert.rejects(() => postPettyCashEntry(tx, denied, pettyInput()), { status: 403 });
  await assert.rejects(() => postPettyCashEntry(tx, { ...pettyUser, branchId: 'branch-b' }, pettyInput()), { status: 403 });
});
test('postAggregatorOrder always computes netPayout server-side, ignoring any client value', async () => {
  const { postAggregatorOrder } = load();
  function chain(rows) { const p = Promise.resolve(rows); p.limit = () => Promise.resolve(rows); return p; }
  const tx = {
    select: () => ({ from: () => ({ where: () => chain([{ id: 'branch-a' }]) }) }),
    insert: () => ({ values: (v) => ({ returning: () => Promise.resolve([{ ...v }]) }) }),
  };
  const row = await postAggregatorOrder(tx, reconUser, aggInput());
  assert.equal(row.netPayout, '415.00'); // 500 - 75 - 10 - 0
  await assert.rejects(() => postAggregatorOrder(tx, denied, aggInput()), { status: 403 });
});
test('seedLedgerAccounts is HQ-level (branchId null) and documents exactly 6 accounts', () => {
  const { SEED_LEDGER_ACCOUNTS } = load();
  assert.equal(SEED_LEDGER_ACCOUNTS.length, 6);
  assert.deepEqual(SEED_LEDGER_ACCOUNTS.map(a => a.code).sort(), ['1000', '1010', '2000', '3000', '4000', '5000']);
  assert.deepEqual(new Set(SEED_LEDGER_ACCOUNTS.map(a => a.type)), new Set(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']));
});
test('computeBalanceSheet reports honest zeros with seeded:false when no accounts exist, and real net per account otherwise', async () => {
  const { computeBalanceSheet } = load();
  const emptyTx = { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) };
  const empty = await computeBalanceSheet(emptyTx, 'branch-a');
  assert.equal(empty.seeded, false); assert.deepEqual(empty.totals, { asset: '0.00', liability: '0.00', equity: '0.00' }); assert.equal(empty.balanced, true);
  const accounts = [
    { id: 'cash', code: '1000', name: 'Cash', type: 'ASSET', branchId: null, isActive: true },
    { id: 'ap', code: '2000', name: 'Accounts Payable', type: 'LIABILITY', branchId: null, isActive: true },
    { id: 'eq', code: '3000', name: "Owner's Equity", type: 'EQUITY', branchId: null, isActive: true },
  ];
  const entries = [{ debitAccountId: 'cash', creditAccountId: 'eq', amount: '1000.00' }, { debitAccountId: 'cash', creditAccountId: 'ap', amount: '250.00' }];
  let call = 0;
  const seededTx = { select: () => ({ from: () => ({ where: () => Promise.resolve(call++ === 0 ? accounts : entries) }) }) };
  const result = await computeBalanceSheet(seededTx, 'branch-a');
  assert.equal(result.seeded, true);
  assert.equal(result.assets.find(r => r.code === '1000').amountInr, '1250.00');
  assert.equal(result.liabilities.find(r => r.code === '2000').amountInr, '250.00');
  assert.equal(result.equity.find(r => r.code === '3000').amountInr, '1000.00');
  assert.equal(result.totals.asset, '1250.00'); assert.equal(result.totals.liability, '250.00'); assert.equal(result.totals.equity, '1000.00');
  assert.equal(result.balanced, true);
});
test('accounts ledger tables keep their real column/index shape', () => {
  const { getTableConfig } = require('drizzle-orm/pg-core');
  const { pettyCashEntries, aggregatorOrders, ledgerAccounts, journalEntries } = require('../src/db/schema/accounts.ts');
  assert.equal(getTableConfig(pettyCashEntries).name, 'petty_cash_entries');
  assert.equal(getTableConfig(aggregatorOrders).name, 'aggregator_orders');
  const ledgerConfig = getTableConfig(ledgerAccounts);
  assert.equal(ledgerConfig.name, 'ledger_accounts');
  assert.equal(ledgerAccounts.code.isUnique, true); // unique() set directly on the code column
  assert.equal(getTableConfig(journalEntries).name, 'journal_entries');
});
test('exported accounts-ledger routes reject anonymous reads and CSRF-less writes before any DB access', async () => {
  const previous = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'http://localhost:3030';
  try {
    const pettyCash = require('../src/app/api/accounts/petty-cash/route.ts');
    const aggregator = require('../src/app/api/accounts/aggregator-orders/route.ts');
    const balanceSheet = require('../src/app/api/accounts/balance-sheet/route.ts');
    const get = (url) => new Request(url);
    assert.equal((await pettyCash.GET(get('http://localhost:3030/api/accounts/petty-cash?branchId=b&month=2024-02'))).status, 401);
    assert.equal((await aggregator.GET(get('http://localhost:3030/api/accounts/aggregator-orders?branchId=b&month=2024-02'))).status, 401);
    assert.equal((await balanceSheet.GET(get('http://localhost:3030/api/accounts/balance-sheet?branchId=b'))).status, 401);
    const post = (url, origin) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({}) });
    assert.equal((await pettyCash.POST(post('http://localhost:3030/api/accounts/petty-cash'))).status, 403);
    assert.equal((await pettyCash.POST(post('http://localhost:3030/api/accounts/petty-cash', 'http://localhost:3030'))).status, 401);
    assert.equal((await aggregator.POST(post('http://localhost:3030/api/accounts/aggregator-orders'))).status, 403);
    assert.equal((await balanceSheet.POST(post('http://localhost:3030/api/accounts/balance-sheet'))).status, 403);
    assert.equal((await balanceSheet.POST(post('http://localhost:3030/api/accounts/balance-sheet', 'http://localhost:3030'))).status, 401);
  } finally { if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; }
});
