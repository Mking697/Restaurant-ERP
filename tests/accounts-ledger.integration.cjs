// Parent-run acceptance only. No dotenv/default DB fallback, migration or server startup.
// ACCOUNTS_LEDGER_INTEGRATION=1 PGHOST=127.0.0.1 PGPORT=5436
// PGDATABASE=restaurant_erp_accounts_ledger_qa_20261028 APP_ORIGIN=http://localhost:3031
// node tests/accounts-ledger.integration.cjs (supply PGUSER/PGPASSWORD privately).
//
// Covers FINANCE-1: real double-entry journal postings for petty cash IN/OUT,
// accounts-expense posting + void reversal, finalized payroll and aggregator
// settlement — balanced, idempotent/replay-safe, immutable-audit.
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
 const origin = process.env.APP_ORIGIN, marker = randomUUID(), branchIds = [randomUUID(), randomUUID()], userIds = [], ledgerAccountIds = [], journalEntryIds = [], employeeIds = [];
 const checks = []; let failure;
 const pass = name => { checks.push(name); console.log('PASS ' + name); };
 async function request(path, cookie, method = 'GET', input, expected = 200, suppliedOrigin = origin) {
  const response = await fetch(origin + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}), 'content-type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(30000) });
  const data = await response.json(); assert.equal(response.status, expected, path + ': ' + JSON.stringify(data)); return data;
 }
 async function identity(branchId, grants, role = 'ACCOUNTANT') {
  const id = randomUUID(), token = randomBytes(32).toString('hex'); userIds.push(id);
  await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)', [id, 'Accounts Ledger QA ' + marker, '+2557' + String(BigInt('0x' + randomBytes(5).toString('hex')) % BigInt(100000000)).padStart(8, '0'), role, branchId, grants]);
  await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), id]);
  const cookie = 'restaurant_session=' + token;
  assert.equal((await request('/api/auth/me', cookie)).user.id, id, 'App must use this exact disposable database');
  return { id, cookie };
 }
 async function journalRows(referenceType, referenceId) {
  return (await pool.query('select * from journal_entries where reference_type=$1 and reference_id=$2 order by leg', [referenceType, referenceId])).rows;
 }
 try {
  const target = await pool.query('select current_database() as name'); assert.equal(target.rows[0].name, process.env.PGDATABASE);
  for (const [i, id] of branchIds.entries()) await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$3,0,0)', [id, 'Accounts Ledger QA ' + marker, 'ALQ-' + i + '-' + marker]);
  const [a, b] = branchIds;
  const owner = await identity(null, [], 'SUPER_ADMIN'), petty = await identity(a, ['PETTY_CASH']), recon = await identity(a, ['AGGREGATOR_RECON']), acc = await identity(a, ['ACCOUNTS_EXPENSES']), payroll = await identity(a, ['PAYROLL']), otherPetty = await identity(b, ['PETTY_CASH']), denied = await identity(a, [], 'CASHIER');
  pass('HTTP identity binds all fixture sessions to the guarded QA database');

  // --- Before seeding: a real event-posting attempt fails loudly, not silently ---
  await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1.00', description: 'Before seed' }, 409);
  assert.equal(Number((await pool.query('select count(*) from petty_cash_entries where branch_id=$1', [a])).rows[0].count), 0, 'rejected posting must not persist the source row either (same tx)');
  pass('a real event cannot post a journal (and is rejected whole) before the chart of accounts is seeded');

  // --- Seed the FINANCE-1 approved chart of accounts (12 accounts + legacy Petty Cash = 13) ---
  const seeded = await request('/api/accounts/balance-sheet', owner.cookie, 'POST', {});
  assert.equal(seeded.created.length, 13);
  assert.deepEqual(seeded.created.sort(), ['1000', '1010', '1020', '2000', '2100', '3000', '4000', '5000', '5100', '5200', '5300', '5400', '5500']);
  const byCode = Object.fromEntries((await pool.query('select id, code from ledger_accounts')).rows.map(r => [r.code, r.id]));
  for (const id of Object.values(byCode)) ledgerAccountIds.push(id);
  const reseed = await request('/api/accounts/balance-sheet', owner.cookie, 'POST', {});
  assert.equal(reseed.created.length, 0); // idempotent — codes already exist
  pass('seeding is idempotent and creates exactly the 12 approved FINANCE-1 accounts plus the pre-existing legacy Petty Cash row');

  // --- Event 1: Petty Cash IN -> Debit Cash, Credit Owner's Equity ---
  const in1 = (await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1000.00', description: 'HQ top-up' }, 201)).entry;
  journalEntryIds.push(...(await journalRows('PETTY_CASH_IN', in1.id)).map(r => r.id));
  let rows = await journalRows('PETTY_CASH_IN', in1.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].amount, '1000.00'); assert.equal(rows[0].debit_account_id, byCode['1000']); assert.equal(rows[0].credit_account_id, byCode['3000']);
  pass('petty cash IN posts Debit Cash / Credit Owner\'s Equity, balanced');

  // --- Event 2: Petty Cash OUT -> Debit Other Expense, Credit Cash ---
  const out1 = (await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'OUT', amount: '350.00', description: 'Milk and cleaning supplies' }, 201)).entry;
  journalEntryIds.push(...(await journalRows('PETTY_CASH_OUT', out1.id)).map(r => r.id));
  rows = await journalRows('PETTY_CASH_OUT', out1.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].amount, '350.00'); assert.equal(rows[0].debit_account_id, byCode['5400']); assert.equal(rows[0].credit_account_id, byCode['1000']);
  pass('petty cash OUT posts Debit Other Expense / Credit Cash, balanced');

  // --- Replay-safety at the DB level: the same (referenceType, referenceId, leg) can never be inserted twice ---
  await assert.rejects(() => pool.query('insert into journal_entries(id,branch_id,description,debit_account_id,credit_account_id,amount,reference_type,reference_id,leg,created_by_id) values($1,$2,$3,$4,$5,$6,$7,$8,0,$9)',
    [randomUUID(), a, 'duplicate attempt', byCode['5400'], byCode['1000'], '350.00', 'PETTY_CASH_OUT', out1.id, owner.id]), /duplicate key|unique/i);
  pass('journal_entries_posting_key_unique enforces replay safety at the database level, not just in application code');

  // --- Event 3: Accounts expense posting -> Debit mapped Expense account, Credit Accounts Payable; replay-safe via idempotencyKey ---
  const expenseInput = { branchId: a, date: '2024-02-29', category: 'RENT', amount: '500.00', description: 'QA premises rent', reference: 'QA-RENT-' + marker, idempotencyKey: 'expense-' + marker };
  const expense1 = (await request('/api/accounts/expenses', acc.cookie, 'POST', expenseInput, 201)).expense;
  journalEntryIds.push(...(await journalRows('EXPENSE', expense1.id)).map(r => r.id));
  rows = await journalRows('EXPENSE', expense1.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].amount, '500.00'); assert.equal(rows[0].debit_account_id, byCode['5100']); assert.equal(rows[0].credit_account_id, byCode['2000']);
  pass('posted branch expense debits the mapped Expense account and credits Accounts Payable');
  const replayExpense = (await request('/api/accounts/expenses', acc.cookie, 'POST', expenseInput, 201)).expense;
  assert.equal(replayExpense.id, expense1.id);
  assert.equal((await journalRows('EXPENSE', expense1.id)).length, 1, 'replaying the same idempotencyKey must not double-post');
  pass('replaying the exact same expense POST (same idempotencyKey/payload) never double-posts its journal entry');

  // --- Reversal: voiding posts an EXACT reversing entry, original journal row stays immutable ---
  const voided = (await request('/api/accounts/expenses/' + expense1.id + '/void', acc.cookie, 'POST', { reason: 'QA reversal check' })).expense;
  assert.equal(voided.status, 'VOID');
  journalEntryIds.push(...(await journalRows('EXPENSE_VOID', expense1.id)).map(r => r.id));
  const reversal = await journalRows('EXPENSE_VOID', expense1.id);
  assert.equal(reversal.length, 1); assert.equal(reversal[0].amount, '500.00');
  assert.equal(reversal[0].debit_account_id, byCode['2000']); assert.equal(reversal[0].credit_account_id, byCode['5100']); // swapped vs the original
  const originalStillThere = await journalRows('EXPENSE', expense1.id);
  assert.equal(originalStillThere.length, 1); assert.equal(originalStillThere[0].amount, '500.00'); // original row never mutated/deleted
  await request('/api/accounts/expenses/' + expense1.id + '/void', acc.cookie, 'POST', { reason: 'second void refused' }, 409);
  assert.equal((await journalRows('EXPENSE_VOID', expense1.id)).length, 1, 'a rejected second void must not post a second reversal');
  pass('voiding an expense posts an exact debit/credit-swapped reversal; the original journal row is never mutated; a second void is refused and does not double-reverse');

  // Post a second (non-voided) expense so the representative mix leaves a real net Accounts Payable balance.
  const expense2 = (await request('/api/accounts/expenses', acc.cookie, 'POST', { ...expenseInput, category: 'UTILITIES', amount: '120.00', idempotencyKey: 'expense2-' + marker }, 201)).expense;
  journalEntryIds.push(...(await journalRows('EXPENSE', expense2.id)).map(r => r.id));

  // --- Event 4: Finalized payroll -> Debit Salary Expense, Credit Accounts Payable; replay-safe via (branchId, month) uniqueness ---
  const employee = (await request('/api/workforce/employees', owner.cookie, 'POST', { branchId: a, name: 'Payroll QA ' + marker, employmentType: 'OFF_ROLL', rate: '200.00', joinedOn: '2024-02-29' }, 201)).employee;
  employeeIds.push(employee.id);
  await request('/api/workforce/attendance', owner.cookie, 'POST', { employeeId: employee.id, date: '2024-02-29', status: 'PRESENT' });
  const run1 = await request('/api/workforce/payroll/finalize', payroll.cookie, 'POST', { branchId: a, month: '2024-02' });
  assert.equal(run1.finalized, true);
  const runRow = (await pool.query('select id, total from (select pr.id, (select sum(amount) from payroll_snapshots where run_id=pr.id) as total from payroll_runs pr where pr.branch_id=$1 and pr.month=$2) t', [a, '2024-02'])).rows[0];
  journalEntryIds.push(...(await journalRows('PAYROLL_RUN', runRow.id)).map(r => r.id));
  rows = await journalRows('PAYROLL_RUN', runRow.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].amount, run1.total); assert.equal(rows[0].debit_account_id, byCode['5500']); assert.equal(rows[0].credit_account_id, byCode['2000']);
  pass('finalized payroll posts Debit Salary Expense / Credit Accounts Payable for the exact finalized total');
  const run2 = await request('/api/workforce/payroll/finalize', payroll.cookie, 'POST', { branchId: a, month: '2024-02' });
  assert.equal(run2.finalized, true); assert.equal(run2.total, run1.total);
  assert.equal((await journalRows('PAYROLL_RUN', runRow.id)).length, 1, 'replaying finalize on an already-finalized month must not double-post');
  pass('replaying payroll finalize for an already-finalized month never double-posts its journal entry');

  // --- Event 5: Aggregator settlement -> Debit Bank (net) + Debit Other Expense (fees), Credit Sales Revenue (gross), two balanced legs ---
  const order1 = (await request('/api/accounts/aggregator-orders', recon.cookie, 'POST', { branchId: a, channel: 'SWIGGY', orderValue: '500.00', commissionAmount: '75.00', adsAmount: '10.00', refundPenalty: '5.00', orderDate: '2024-02-15' }, 201)).order;
  assert.equal(order1.netPayout, '410.00');
  journalEntryIds.push(...(await journalRows('AGGREGATOR_ORDER', order1.id)).map(r => r.id));
  rows = await journalRows('AGGREGATOR_ORDER', order1.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].leg, 0); assert.equal(rows[0].amount, '410.00'); assert.equal(rows[0].debit_account_id, byCode['1020']); assert.equal(rows[0].credit_account_id, byCode['4000']);
  assert.equal(rows[1].leg, 1); assert.equal(rows[1].amount, '90.00'); assert.equal(rows[1].debit_account_id, byCode['5400']); assert.equal(rows[1].credit_account_id, byCode['4000']); // 75+10+5
  const debitTotal = (Number(rows[0].amount) + Number(rows[1].amount)).toFixed(2);
  assert.equal(debitTotal, '500.00'); // == order1.orderValue, debit totals equal credit totals for the whole event
  pass('aggregator settlement posts Debit Bank (net) + Debit Other Expense (commission+ads+refund) = Credit Sales Revenue (gross), balanced');

  const order2 = (await request('/api/accounts/aggregator-orders', recon.cookie, 'POST', { branchId: a, channel: 'ZOMATO', orderValue: '300.00', orderDate: '2024-02-20' }, 201)).order;
  journalEntryIds.push(...(await journalRows('AGGREGATOR_ORDER', order2.id)).map(r => r.id));
  rows = await journalRows('AGGREGATOR_ORDER', order2.id);
  assert.equal(rows.length, 1, 'a zero-fee settlement must not post a meaningless 0.00 second leg'); // no commission/ads/refund -> no leg 1
  assert.equal(rows[0].amount, '300.00'); assert.equal(rows[0].debit_account_id, byCode['1020']); assert.equal(rows[0].credit_account_id, byCode['4000']);
  pass('an aggregator settlement with zero commission/ads/refund posts a single balanced leg, never a spurious zero-amount row');

  // --- Branch isolation and grant/CSRF/auth boundaries (existing coverage, unaffected by FINANCE-1) ---
  await request('/api/accounts/petty-cash', otherPetty.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1.00', description: 'Cross-branch denied' }, 403);
  await request('/api/accounts/petty-cash', denied.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1.00', description: 'No grant' }, 403);
  await request('/api/accounts/petty-cash?' + new URLSearchParams({ branchId: a, month: new Date().toISOString().slice(0, 7) }), '', 'GET', undefined, 401);
  await request('/api/accounts/petty-cash', petty.cookie, 'POST', { branchId: a, entryType: 'IN', amount: '1.00', description: 'CSRF' }, 403, null);
  pass('petty cash branch isolation, missing grant and CSRF/auth boundaries still enforced with journal posting wired in');

  // --- Balance Sheet reflects the real representative mix of all 5 event types, Assets = Liabilities + Equity ---
  const sheet = await request('/api/accounts/balance-sheet?branchId=' + a, owner.cookie);
  assert.equal(sheet.seeded, true); assert.equal(sheet.balanced, true);
  // Cash: +1000 (petty IN) -350 (petty OUT) = 650.00
  assert.equal(sheet.assets.find(r => r.code === '1000').amountInr, '650.00');
  // Bank: 410.00 (order1 net) + 300.00 (order2 net) = 710.00
  assert.equal(sheet.assets.find(r => r.code === '1020').amountInr, '710.00');
  // Accounts Payable: +500 (expense1 RENT) -500 (void reversal) +120 (expense2 UTILITIES) +run total (payroll)
  const expectedAp = (500 - 500 + 120 + Number(run1.total)).toFixed(2);
  assert.equal(sheet.liabilities.find(r => r.code === '2000').amountInr, expectedAp);
  // Owner's Equity: +1000 (petty cash top-up)
  assert.equal(sheet.equity.find(r => r.code === '3000').amountInr, '1000.00');
  assert.equal(sheet.totals.asset, (Number(sheet.assets.find(r => r.code === '1000').amountInr) + Number(sheet.assets.find(r => r.code === '1020').amountInr)).toFixed(2));
  assert.equal(sheet.balanced, true, 'Assets must equal Liabilities + Equity after a representative mix of all 5 FINANCE-1 event types');
  pass('Balance Sheet is a real aggregation of the journals from all 5 event types and stays balanced (Assets = Liabilities + Equity)');
 } catch (error) { failure = error; }
 let cleanup;
 try {
  cleanup = await pool.connect();
  await cleanup.query('BEGIN');
  await cleanup.query('delete from journal_entries where branch_id=any($1::text[]) or id=any($2::text[])', [branchIds, journalEntryIds]);
  await cleanup.query('delete from ledger_accounts where id=any($1::text[])', [ledgerAccountIds]);
  await cleanup.query('delete from aggregator_orders where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from petty_cash_entries where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from branch_expenses where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from payroll_snapshots where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from payroll_runs where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from workforce_attendance where employee_id=any($1::text[])', [employeeIds]);
  await cleanup.query('delete from employee_compensation where employee_id=any($1::text[])', [employeeIds]);
  await cleanup.query('delete from employees where id=any($1::text[])', [employeeIds]);
  await cleanup.query('delete from sessions where user_id=any($1::text[])', [userIds]);
  await cleanup.query('delete from users where id=any($1::text[])', [userIds]);
  await cleanup.query('delete from branches where id=any($1::text[])', [branchIds]);
  await cleanup.query('COMMIT');
  assert.equal(Number((await cleanup.query('select count(*) from petty_cash_entries where branch_id=any($1::text[])', [branchIds])).rows[0].count), 0);
  assert.equal(Number((await cleanup.query('select count(*) from ledger_accounts')).rows[0].count), 0);
  assert.equal(Number((await cleanup.query('select count(*) from journal_entries')).rows[0].count), 0);
 } catch (cleanupError) {
  if (cleanup) await cleanup.query('ROLLBACK').catch(() => {});
  failure = failure ? new AggregateError([failure, cleanupError], 'Acceptance and cleanup failed') : cleanupError;
 } finally { cleanup?.release(); await pool.end(); }
 if (failure) throw failure;
 console.log('RESULT ' + checks.length + ' real accounts-ledger HTTP/Postgres checks passed; fixtures cleaned');
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { guard };
