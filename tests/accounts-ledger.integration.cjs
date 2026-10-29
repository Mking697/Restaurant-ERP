// Parent-run acceptance only. No dotenv/default DB fallback, migration or server startup.
// ACCOUNTS_LEDGER_INTEGRATION=1 PGHOST=127.0.0.1 PGPORT=5436
// PGDATABASE=restaurant_erp_accounts_ledger_qa_20261028 APP_ORIGIN=http://localhost:3031
// node tests/accounts-ledger.integration.cjs (supply PGUSER/PGPASSWORD privately).
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { Pool } = require('pg');
function guard() {
 assert.equal(process.env.ACCOUNTS_LEDGER_INTEGRATION, '1', 'Explicit disposable DB opt-in required');
 assert.equal(process.env.PGHOST, '127.0.0.1'); assert.equal(process.env.PGPORT, '5436');
 assert.match(process.env.PGDATABASE || '', /^restaurant_erp_accounts_ledger_qa_\d{8}$/);
 assert.equal(process.env.APP_ORIGIN, 'http://localhost:3031');
 assert.ok(process.env.PGUSER); assert.ok(process.env.PGPASSWORD);
}
async function run() {
 guard();
 const pool = new Pool({ host: process.env.PGHOST, port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false, options: '-c search_path=public' });
 const origin = process.env.APP_ORIGIN, marker = randomUUID(), branchIds = [randomUUID(), randomUUID()], userIds = [], ledgerAccountIds = [], journalEntryIds = [];
 const checks = []; let failure;
 const pass = name => { checks.push(name); console.log('PASS ' + name); };
 async function request(path, cookie, method = 'GET', input, expected = 200, suppliedOrigin = origin) {
  const response = await fetch(origin + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}), 'content-type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(30000) });
  const data = await response.json(); assert.equal(response.status, expected, path + ': ' + JSON.stringify(data)); return data;
 }
 async function identity(branchId, grants, role = 'ACCOUNTANT') {
  const id = randomUUID(), token = randomBytes(32).toString('hex'); userIds.push(id);
  await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)', [id, 'Accounts Ledger QA ' + marker, '+919' + String(BigInt('0x' + randomBytes(6).toString('hex')) % BigInt(1000000000)).padStart(9, '0'), role, branchId, grants]);
  await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), id]);
  const cookie = 'restaurant_session=' + token;
  assert.equal((await request('/api/auth/me', cookie)).user.id, id, 'App must use this exact disposable database');
  return { id, cookie };
 }
 try {
  const target = await pool.query('select current_database() as name'); assert.equal(target.rows[0].name, process.env.PGDATABASE);
  for (const [i, id] of branchIds.entries()) await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$3,0,0)', [id, 'Accounts Ledger QA ' + marker, 'ALQ-' + i + '-' + marker]);
  const [a, b] = branchIds;
  const owner = await identity(null, [], 'SUPER_ADMIN'), petty = await identity(a, ['PETTY_CASH']), recon = await identity(a, ['AGGREGATOR_RECON']), otherPetty = await identity(b, ['PETTY_CASH']), denied = await identity(a, [], 'CASHIER');
  pass('HTTP identity binds all fixture sessions to the guarded QA database');

  // --- Petty Cash: running balance across multiple entries, OUT-below-zero 400 ---
  const in1 = (await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1000.00', description: 'HQ top-up' }, 201)).entry;
  assert.equal(in1.balanceAfterInr, '1000.00'); assert.equal(in1.loggedById, petty.id);
  const out1 = (await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'OUT', amount: '350.00', description: 'Milk and cleaning supplies' }, 201)).entry;
  assert.equal(out1.balanceAfterInr, '650.00');
  const out2 = (await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'OUT', amount: '650.00', description: 'Gas refill' }, 201)).entry;
  assert.equal(out2.balanceAfterInr, '0.00');
  await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'OUT', amount: '0.01', description: 'Would go negative' }, 400);
  assert.equal(Number((await pool.query('select count(*) from petty_cash_entries where branch_id=$1', [a])).rows[0].count), 3);
  pass('petty cash running balance is derived from real rows; OUT that would go negative is rejected and not persisted');
  const month = new Date().toISOString().slice(0, 7);
  const ledgerGet = await request('/api/accounts/petty-cash?' + new URLSearchParams({ branchId: a, month }), petty.cookie);
  assert.equal(ledgerGet.entries.length, 3); assert.equal(ledgerGet.currentBalance, '0.00');
  await request('/api/accounts/petty-cash?' + new URLSearchParams({ branchId: b, month }), petty.cookie, 'GET', undefined, 403);
  await request('/api/accounts/petty-cash', otherPetty.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1.00', description: 'Cross-branch denied' }, 403);
  await request('/api/accounts/petty-cash', denied.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1.00', description: 'No grant' }, 403);
  await request('/api/accounts/petty-cash?' + new URLSearchParams({ branchId: a, month }), '', 'GET', undefined, 401);
  await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1.00', description: 'CSRF' }, 403, null);
  pass('petty cash branch isolation, missing grant and CSRF/auth boundaries enforced');

  // --- Aggregator Recon: server-computed netPayout ---
  const order1 = (await request('/api/accounts/aggregator-orders', recon.cookie, 'POST', { branchId: a, channel: 'SWIGGY', orderValue: '500.00', commissionAmount: '75.00', adsAmount: '10.00', refundPenalty: '5.00', orderDate: '2024-02-15' }, 201)).order;
  assert.equal(order1.netPayout, '410.00'); // never trust a client netPayout — this one wasn't even sent
  const order2 = (await request('/api/accounts/aggregator-orders', recon.cookie, 'POST', { branchId: a, channel: 'ZOMATO', orderValue: '300.00', netPayout: '999999.00', orderDate: '2024-02-20' }, 400));
  assert.match(order2.error, /Unexpected field/);
  const order3 = (await request('/api/accounts/aggregator-orders', recon.cookie, 'POST', { branchId: a, channel: 'ZOMATO', orderValue: '300.00', orderDate: '2024-02-20' }, 201)).order;
  assert.equal(order3.netPayout, '300.00'); assert.equal(order3.commissionAmount, '0.00');
  const recon2 = await request('/api/accounts/aggregator-orders?' + new URLSearchParams({ branchId: a, month: '2024-02' }), recon.cookie);
  assert.equal(recon2.orders.length, 2); assert.equal(recon2.totals.netPayout, '710.00'); assert.equal(recon2.totals.orderValue, '800.00');
  await request('/api/accounts/aggregator-orders', petty.cookie, 'POST', { branchId: a, channel: 'SWIGGY', orderValue: '1.00', orderDate: '2024-02-01' }, 403);
  await request('/api/accounts/aggregator-orders?' + new URLSearchParams({ branchId: b, month: '2024-02' }), recon.cookie, 'GET', undefined, 403);
  pass('aggregator netPayout is always server-computed, an explicit netPayout field is rejected, totals and grant scoping are correct');

  // --- Balance Sheet: real zero state before seeding ---
  const zero = await request('/api/accounts/balance-sheet?branchId=' + a, petty.cookie);
  assert.equal(zero.seeded, false); assert.deepEqual(zero.totals, { asset: '0.00', liability: '0.00', equity: '0.00' }); assert.equal(zero.balanced, true);
  assert.equal(Number((await pool.query('select count(*) from ledger_accounts')).rows[0].count), 0, 'GET must never seed as a side effect');
  await request('/api/accounts/balance-sheet?branchId=' + a, denied.cookie, 'GET', undefined, 403);
  await request('/api/accounts/balance-sheet', owner.cookie, 'GET', undefined, 400); // Owner omitting branchId has no scope to aggregate
  await request('/api/accounts/balance-sheet', petty.cookie, 'POST', {}, 403); // seeding is Owner-only
  pass('balance sheet reports honest real zeros (seeded:false) before any ledger account exists, never fabricating a balance');

  const seeded = await request('/api/accounts/balance-sheet', owner.cookie, 'POST', {});
  assert.equal(seeded.created.length, 6); assert.deepEqual(seeded.created.sort(), ['1000', '1010', '2000', '3000', '4000', '5000']);
  const accountRows = await pool.query('select id, code from ledger_accounts where code=any($1::text[])', [seeded.created]);
  for (const row of accountRows.rows) ledgerAccountIds.push(row.id);
  const reseed = await request('/api/accounts/balance-sheet', owner.cookie, 'POST', {});
  assert.equal(reseed.created.length, 0); // idempotent — codes already exist
  assert.equal(Number((await pool.query('select count(*) from ledger_accounts')).rows[0].count), 6);
  pass('seeding is idempotent: exactly the 6 documented HQ-level accounts, re-seeding creates nothing new');

  const afterSeed = await request('/api/accounts/balance-sheet?branchId=' + a, petty.cookie);
  assert.equal(afterSeed.seeded, true); assert.deepEqual(afterSeed.totals, { asset: '0.00', liability: '0.00', equity: '0.00' }); assert.equal(afterSeed.balanced, true);
  assert.equal(afterSeed.assets.length, 2); // Cash + Petty Cash
  pass('balance sheet after seeding but before any journal entry still reports real zeros, not a fabricated balance');

  const byCode = Object.fromEntries((await pool.query('select id, code from ledger_accounts')).rows.map(r => [r.code, r.id]));
  async function journal(branchId, debitCode, creditCode, amount) {
   const id = randomUUID(); journalEntryIds.push(id);
   await pool.query('insert into journal_entries(id,branch_id,description,debit_account_id,credit_account_id,amount,reference_type,reference_id,created_by_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
     [id, branchId, 'QA journal ' + marker, byCode[debitCode], byCode[creditCode], amount, 'QA_FIXTURE', marker, owner.id]);
  }
  await journal(a, '1000', '3000', '10000.00'); // Owner invests cash: debit Cash, credit Owner's Equity
  await journal(a, '1000', '2000', '2500.00'); // Vendor credit received as cash: debit Cash, credit Accounts Payable
  const bookedOtherBranch = await journal(b, '1000', '3000', '999999.00').then(() => true); // isolation control row on branch b
  const branchA = await request('/api/accounts/balance-sheet?branchId=' + a, owner.cookie);
  assert.equal(branchA.seeded, true);
  assert.equal(branchA.assets.find(r => r.code === '1000').amountInr, '12500.00');
  assert.equal(branchA.liabilities.find(r => r.code === '2000').amountInr, '2500.00');
  assert.equal(branchA.equity.find(r => r.code === '3000').amountInr, '10000.00');
  assert.equal(branchA.totals.asset, '12500.00'); assert.equal(branchA.totals.liability, '2500.00'); assert.equal(branchA.totals.equity, '10000.00');
  assert.equal(branchA.balanced, true);
  const branchB = await request('/api/accounts/balance-sheet?branchId=' + b, otherPetty.cookie);
  assert.equal(branchB.assets.find(r => r.code === '1000').amountInr, '999999.00'); // branch isolation — branch A's journals never leak into branch B
  assert.ok(bookedOtherBranch);
  pass('balance sheet is a real aggregation of journal entries per branch — Assets = Liabilities + Equity, and branches never leak into each other');
 } catch (error) { failure = error; }
 let cleanup;
 try {
  cleanup = await pool.connect();
  await cleanup.query('BEGIN');
  await cleanup.query('delete from journal_entries where id=any($1::text[])', [journalEntryIds]);
  await cleanup.query('delete from ledger_accounts where id=any($1::text[])', [ledgerAccountIds]);
  await cleanup.query('delete from aggregator_orders where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from petty_cash_entries where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from sessions where user_id=any($1::text[])', [userIds]);
  await cleanup.query('delete from users where id=any($1::text[])', [userIds]);
  await cleanup.query('delete from branches where id=any($1::text[])', [branchIds]);
  await cleanup.query('COMMIT');
  assert.equal(Number((await cleanup.query('select count(*) from petty_cash_entries where branch_id=any($1::text[])', [branchIds])).rows[0].count), 0);
  assert.equal(Number((await cleanup.query('select count(*) from ledger_accounts')).rows[0].count), 0);
 } catch (cleanupError) {
  if (cleanup) await cleanup.query('ROLLBACK').catch(() => {});
  failure = failure ? new AggregateError([failure, cleanupError], 'Acceptance and cleanup failed') : cleanupError;
 } finally { cleanup?.release(); await pool.end(); }
 if (failure) throw failure;
 console.log('RESULT ' + checks.length + ' real accounts-ledger HTTP/Postgres checks passed; fixtures cleaned');
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { guard };
