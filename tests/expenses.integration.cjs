// Parent-run acceptance only. No dotenv/default DB fallback, migration or server startup.
// EXPENSES_INTEGRATION=1 PGHOST=127.0.0.1 PGPORT=5436
// PGDATABASE=restaurant_erp_workforce_qa_20261022 APP_ORIGIN=http://localhost:3030
// node tests/expenses.integration.cjs (supply PGUSER/PGPASSWORD privately).
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { Pool } = require('pg');
function guard() {
 assert.equal(process.env.EXPENSES_INTEGRATION, '1', 'Explicit disposable DB opt-in required');
 assert.equal(process.env.PGHOST, '127.0.0.1'); assert.equal(process.env.PGPORT, '5436');
 assert.match(process.env.PGDATABASE || '', /^restaurant_erp_workforce_qa_\d{8}$/);
 assert.equal(process.env.APP_ORIGIN, 'http://localhost:3030');
 assert.ok(process.env.PGUSER); assert.ok(process.env.PGPASSWORD);
}
async function run() {
 guard();
 const pool = new Pool({ host: process.env.PGHOST, port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false, options: '-c search_path=public' });
 const origin = process.env.APP_ORIGIN, marker = randomUUID(), branchIds = [randomUUID(), randomUUID()], userIds = [];
 const triggerName = 'expense_qa_fail_' + marker.replaceAll('-', '');
 const checks = []; let failure;
 const pass = name => { checks.push(name); console.log('PASS ' + name); };
 async function request(path, cookie, method = 'GET', input, expected = 200, suppliedOrigin = origin) {
  const response = await fetch(origin + path, { method, headers: { ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}), 'content-type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(30000) });
  const data = await response.json(); assert.equal(response.status, expected, path + ': ' + JSON.stringify(data)); return data;
 }
 async function identity(branchId, grants, role = 'ACCOUNTANT') {
  const id = randomUUID(), token = randomBytes(32).toString('hex'); userIds.push(id);
  await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)', [id, 'Expense QA ' + marker, '+919' + String(BigInt('0x' + randomBytes(6).toString('hex')) % BigInt(1000000000)).padStart(9, '0'), role, branchId, grants]);
  await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), id]);
  const cookie = 'restaurant_session=' + token;
  assert.equal((await request('/api/auth/me', cookie)).user.id, id, 'App must use this exact disposable database');
  return { id, cookie };
 }
 try {
  const target = await pool.query('select current_database() as name, inet_server_port() as port'); assert.equal(target.rows[0].name, process.env.PGDATABASE);
  for (const [i, id] of branchIds.entries()) await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$3,0,0)', [id, 'Expense QA ' + marker, 'EQ-' + i + '-' + marker]);
  const [a, b] = branchIds;
  const owner = await identity(null, [], 'SUPER_ADMIN'), acc = await identity(a, ['ACCOUNTS_EXPENSES']), other = await identity(b, ['ACCOUNTS_EXPENSES']), labor = await identity(a, ['PAYROLL']), denied = await identity(a, [], 'CASHIER');
  pass('HTTP identity binds all fixture sessions to the guarded QA database');
  // Read-only prerequisite: parent must provision/validate the approved COA.
  // This runner neither seeds accounts nor changes/deletes shared mappings.
  const byCode = Object.fromEntries((await pool.query('select id, code from ledger_accounts where branch_id is null')).rows.map(r => [r.code, r.id]));
  for (const code of ['2000', '5100', '5200', '5500']) assert.ok(byCode[code], `Parent must provision approved chart of accounts: ${code} missing`);
  pass('required expense/payroll chart-of-accounts rows already exist (read-only prerequisite)');
  const base = { branchId: a, date: '2024-02-29', category: 'RENT', amount: '123.45', description: 'QA premises rent', reference: 'QA-RENT-' + marker, idempotencyKey: 'expense-' + marker };
  const created = (await request('/api/accounts/expenses', acc.cookie, 'POST', base, 201)).expense;
  assert.equal(created.createdById, acc.id); assert.equal(created.status, 'POSTED'); assert.equal(created.amount, '123.45'); assert.equal('requestFingerprint' in created, false);
  const persisted = (await pool.query('select * from branch_expenses where id=$1', [created.id])).rows[0];
  assert.equal(persisted.branch_id, a); assert.equal(persisted.reference, base.reference); pass('expense POST persists real immutable fields and creator');
  const replay = (await request('/api/accounts/expenses', acc.cookie, 'POST', base, 201)).expense;
  assert.equal(replay.id, created.id);
  await request('/api/accounts/expenses', acc.cookie, 'POST', { ...base, description: base.description + ' ' }, 409);
  await request('/api/accounts/expenses', acc.cookie, 'POST', { ...base, amount: '123.4' }, 409);
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => request('/api/accounts/expenses', acc.cookie, 'POST', base, 201)));
  assert.ok(concurrent.every(row => row.expense.id === created.id));
  assert.equal(Number((await pool.query('select count(*) from branch_expenses where branch_id=$1 and created_by_id=$2 and idempotency_key=$3', [a, acc.id, base.idempotencyKey])).rows[0].count), 1);
  pass('exact and concurrent replay writes once; changed payload conflicts');
  const sameKeyOtherActor = (await request('/api/accounts/expenses', owner.cookie, 'POST', base, 201)).expense;
  const foreign = (await request('/api/accounts/expenses', other.cookie, 'POST', { ...base, branchId: b, amount: '50.10', category: 'UTILITIES' }, 201)).expense;
  assert.notEqual(sameKeyOtherActor.id, created.id); assert.notEqual(foreign.id, created.id); pass('idempotency keys are scoped to branch and actor');
  const own = await request('/api/accounts/expenses?month=2024-02', acc.cookie);
  assert.equal(own.expenses.length, 2); assert.ok(own.expenses.every(row => row.branchId === a));
  const all = await request('/api/accounts/expenses?month=2024-02', owner.cookie); assert.ok(all.expenses.some(row => row.id === foreign.id));
  await request('/api/accounts/expenses?month=2024-02&branchId=' + b, acc.cookie, 'GET', undefined, 403);
  await request('/api/accounts/expenses', acc.cookie, 'POST', { ...base, branchId: b }, 403);
  await request('/api/accounts/expenses/' + foreign.id + '/void', acc.cookie, 'POST', { reason: 'Foreign entry' }, 404);
  await request('/api/accounts/expenses?month=2024-02', labor.cookie, 'GET', undefined, 403);
  await request('/api/accounts/profit-loss?month=2024-02', denied.cookie, 'GET', undefined, 403);
  await request('/api/accounts/expenses?month=2024-02', '', 'GET', undefined, 401);
  await request('/api/accounts/expenses', acc.cookie, 'POST', { ...base, idempotencyKey: randomUUID() }, 403, null);
  await request('/api/accounts/expenses', acc.cookie, 'POST', { ...base, idempotencyKey: randomUUID() }, 403, 'http://evil.test');
  pass('branch, related-ID, grant, anonymous and same-origin boundaries enforced');
  const before = (await pool.query('select count(*) from branch_expenses where branch_id=any($1::text[])', [branchIds])).rows[0].count;
  for (const patch of [{ amount: '0' }, { amount: '1e4' }, { amount: '1.001' }, { amount: '1000000000' }, { date: '2023-02-29' }, { category: 'PAYROLL' }, { description: 'x' }, { reference: '' }, { status: 'VOID' }]) await request('/api/accounts/expenses', acc.cookie, 'POST', { ...base, ...patch, idempotencyKey: randomUUID() }, 400);
  await request('/api/accounts/expenses?month=2024-13', acc.cookie, 'GET', undefined, 400);
  await request('/api/accounts/profit-loss', acc.cookie, 'GET', undefined, 400);
  await request('/api/accounts/expenses', owner.cookie, 'POST', { ...base, branchId: randomUUID() }, 404);
  await request('/api/accounts/profit-loss?month=2024-02&branchId=' + randomUUID(), owner.cookie, 'GET', undefined, 404);
  assert.equal((await pool.query('select count(*) from branch_expenses where branch_id=any($1::text[])', [branchIds])).rows[0].count, before);
  pass('strict date/money/body and missing branch rejection leaves persisted state unchanged');
  const failBody = { ...base, reference: 'QA-FAIL-' + marker, idempotencyKey: randomUUID() };
  // Fail AFTER the SQL insert has run, not merely before validation, to prove a
  // real PostgreSQL rollback and that failed attempts cannot poison replay keys.
  await pool.query(`create function public.${triggerName}() returns trigger language plpgsql as $$ begin if NEW.reference = 'QA-FAIL-${marker}' then raise exception 'QA forced expense rollback'; end if; return NEW; end; $$`);
  await pool.query(`create trigger ${triggerName} after insert on public.branch_expenses for each row execute function public.${triggerName}()`);
  await request('/api/accounts/expenses', acc.cookie, 'POST', failBody, 503);
  assert.equal(Number((await pool.query('select count(*) from branch_expenses where branch_id=$1 and idempotency_key=$2', [a, failBody.idempotencyKey])).rows[0].count), 0);
  await pool.query(`drop trigger ${triggerName} on public.branch_expenses`); await pool.query(`drop function public.${triggerName}()`);
  const recovered = (await request('/api/accounts/expenses', acc.cookie, 'POST', failBody, 201)).expense;
  await request('/api/accounts/expenses/' + recovered.id + '/void', acc.cookie, 'POST', { reason: 'Rollback recovery fixture cleanup' });
  pass('forced post-insert database failure rolls back; same key retries cleanly after recovery');
  const voided = (await request('/api/accounts/expenses/' + sameKeyOtherActor.id + '/void', acc.cookie, 'POST', { reason: 'Duplicate entry corrected' })).expense;
  assert.equal(voided.status, 'VOID'); assert.equal(voided.voidedById, acc.id); assert.equal(voided.amount, '123.45'); assert.equal(voided.createdById, owner.id);
  await request('/api/accounts/expenses/' + sameKeyOtherActor.id + '/void', acc.cookie, 'POST', { reason: 'Second void refused' }, 409);
  const audited = (await pool.query('select * from branch_expenses where id=$1', [sameKeyOtherActor.id])).rows[0]; assert.equal(audited.void_reason, 'Duplicate entry corrected'); assert.ok(audited.voided_at); assert.equal(audited.amount, '123.45');
  assert.equal((await request('/api/accounts/expenses', owner.cookie, 'POST', base, 201)).expense.status, 'VOID');
  pass('void retains original row and immutable replay plus full actor/reason/time audit');
  // FINANCE-1: the posted expense and its void both carry a real balanced journal entry.
  const expenseJournal = (await pool.query("select * from journal_entries where reference_type='EXPENSE' and reference_id=$1", [sameKeyOtherActor.id])).rows;
  assert.equal(expenseJournal.length, 1); assert.equal(expenseJournal[0].amount, '123.45'); assert.equal(expenseJournal[0].debit_account_id, byCode['5100']); assert.equal(expenseJournal[0].credit_account_id, byCode['2000']);
  const voidJournal = (await pool.query("select * from journal_entries where reference_type='EXPENSE_VOID' and reference_id=$1", [sameKeyOtherActor.id])).rows;
  assert.equal(voidJournal.length, 1); assert.equal(voidJournal[0].amount, '123.45'); assert.equal(voidJournal[0].debit_account_id, byCode['2000']); assert.equal(voidJournal[0].credit_account_id, byCode['5100']);
  pass('posted expense and its void reversal each carry a real balanced FINANCE-1 journal entry (Rent Expense <-> Accounts Payable)');
  // Direct source-only fixture faithfully represents pre-journal legacy data.
  const legacyId = randomUUID();
  await pool.query(`insert into branch_expenses(id,branch_id,date,category,amount,description,reference,idempotency_key,request_fingerprint,created_by_id)
    values($1,$2,'2024-02-29','RENT','77.77','Legacy expense without journal',$3,$4,$5,$6)`,
    [legacyId, a, 'LEGACY-' + marker, 'legacy-' + marker, 'legacy-fixture-' + marker, acc.id]);
  const journalsBeforeLegacyVoid = (await pool.query('select * from journal_entries where branch_id=$1 order by id', [a])).rows;
  assert.equal((await pool.query('select id from journal_entries where reference_id=$1', [legacyId])).rowCount, 0);
  const legacyVoid = (await request('/api/accounts/expenses/' + legacyId + '/void', acc.cookie, 'POST', { reason: 'Legacy source-only correction' })).expense;
  assert.equal(legacyVoid.status, 'VOID'); assert.equal(legacyVoid.amount, '77.77');
  const persistedLegacy = (await pool.query('select status,amount,void_reason,voided_by_id,voided_at from branch_expenses where id=$1', [legacyId])).rows[0];
  assert.equal(persistedLegacy.status, 'VOID'); assert.equal(persistedLegacy.amount, '77.77');
  assert.equal(persistedLegacy.void_reason, 'Legacy source-only correction'); assert.equal(persistedLegacy.voided_by_id, acc.id); assert.ok(persistedLegacy.voided_at);
  assert.deepEqual((await pool.query('select * from journal_entries where branch_id=$1 order by id', [a])).rows, journalsBeforeLegacyVoid);
  await request('/api/accounts/expenses/' + legacyId + '/void', acc.cookie, 'POST', { reason: 'Duplicate legacy void refused' }, 409);
  assert.equal((await pool.query('select id from journal_entries where reference_id=$1', [legacyId])).rowCount, 0);
  pass('legacy source-only expense void persists audit without inventing any journal or changing ledger balances');
  let report = await request('/api/accounts/profit-loss?month=2024-02', labor.cookie);
  assert.equal(report.expenses.RENT, '123.45'); assert.equal(report.laborCost, '0.00'); assert.equal(report.totalOperatingExpenses, '123.45');
  // Revenue is now connected: with zero POS orders posted yet this month, it
  // must be a real "0.00" (not null/crash), and netProfit = revenue - opex.
  assert.equal(report.revenue, '0.00'); assert.equal(report.cogs, null); assert.equal(report.grossProfit, null);
  assert.equal(report.netProfit, '-123.45'); assert.equal(report.salesConnected, true);
  assert.equal((await request('/api/accounts/profit-loss?month=2024-03', acc.cookie)).totalOperatingExpenses, '0.00');
  const employee = (await request('/api/workforce/employees', owner.cookie, 'POST', { branchId: a, name: 'Expense labor QA ' + marker, employmentType: 'OFF_ROLL', rate: '100.25', joinedOn: '2024-02-29' }, 201)).employee;
  await request('/api/workforce/attendance', owner.cookie, 'POST', { employeeId: employee.id, date: '2024-02-29', status: 'PRESENT' });
  assert.equal((await request('/api/accounts/profit-loss?month=2024-02', acc.cookie)).laborCost, '0.00');
  await request('/api/workforce/payroll/finalize', owner.cookie, 'POST', { branchId: a, month: '2024-02' });
  report = await request('/api/accounts/profit-loss?month=2024-02', labor.cookie); assert.equal(report.laborCost, '100.25'); assert.equal(report.totalOperatingExpenses, '223.70');
  await request('/api/workforce/payroll/finalize', owner.cookie, 'POST', { branchId: a, month: '2024-02' });
  assert.equal((await request('/api/accounts/profit-loss?month=2024-02', acc.cookie)).laborCost, '100.25');
  const compiled = await request('/api/accounts/profit-loss?month=2024-02', owner.cookie); assert.equal(compiled.expenses.UTILITIES, '50.10'); assert.equal(compiled.totalOperatingExpenses, '273.80');
  pass('P&L excludes void/draft payroll; sums finalized labor once and supports Owner compiled reads');

  // Real completed POS sales connection — pure read-side aggregation, no
  // journal/ledger posting (FINANCE-1 remains separately out of scope).
  async function posOrder(branchId, totalAmount, { ownerOnly = false, status = 'COMPLETED', createdAt = '2024-02-15T10:00:00Z', cashierId = owner.id } = {}) {
   const id = randomUUID();
   await pool.query(`insert into pos_orders(id, branch_id, order_number, channel, subtotal, tax_amount, total_amount, tender_type, status, owner_only, cashier_id, created_at) values ($1,$2,$3,'DINE_IN',$4,'0.00',$4,'CASH',$5,$6,$7,$8)`,
    [id, branchId, 'QA-ORD-' + marker + '-' + id.slice(0, 6), totalAmount, status, ownerOnly, cashierId, createdAt]);
   return id;
  }
  const visibleOrderId = await posOrder(a, '500.00');
  const privateOrderId = await posOrder(a, '300.00', { ownerOnly: true });
  await posOrder(a, '999.00', { status: 'VOIDED' }); // excluded: not COMPLETED
  await posOrder(a, '1.00', { createdAt: '2024-03-02T10:00:00Z' }); // excluded: outside the February window
  await posOrder(b, '1000.00'); // different branch — must not leak into branch a's revenue

  const ownerReport = await request('/api/accounts/profit-loss?month=2024-02&branchId=' + a, owner.cookie);
  assert.equal(ownerReport.revenue, '800.00'); // Owner sees the actual total including the private order (500 + 300)
  assert.equal(ownerReport.totalOperatingExpenses, '223.70'); // branch A only: RENT 123.45 + finalized labor 100.25 (branch B's UTILITIES stays out of this branch-scoped view)
  assert.equal(ownerReport.netProfit, '576.30'); // 800.00 - 223.70, revenue minus opex only, never implying COGS was subtracted
  assert.equal(ownerReport.cogs, null); assert.equal(ownerReport.grossProfit, null); assert.equal(ownerReport.salesConnected, true);
  pass('Owner profit-loss revenue is a real sum of this branch/month completed POS sales, including owner-only orders');

  const accReport = await request('/api/accounts/profit-loss?month=2024-02', acc.cookie);
  assert.equal(accReport.revenue, '500.00'); // non-Owner: the owner-only private order is excluded, same privacy rule as /api/pos/orders
  assert.equal(accReport.netProfit, '276.30'); // 500.00 - 223.70
  pass('Non-Owner profit-loss revenue excludes an Owner-only private order, mirroring POS order-list privacy');

  const laborReport = await request('/api/accounts/profit-loss?month=2024-02', labor.cookie);
  assert.equal(laborReport.revenue, '500.00'); pass('A non-Owner PAYROLL-grant viewer also gets the privacy-filtered revenue figure');

  const branchBOwnerReport = await request('/api/accounts/profit-loss?month=2024-02&branchId=' + b, owner.cookie);
  assert.equal(branchBOwnerReport.revenue, '1000.00'); pass('Revenue is branch-scoped — branch A sales never leak into branch B\'s figure');

  const zeroSales = await request('/api/accounts/profit-loss?month=2024-05&branchId=' + a, owner.cookie);
  assert.equal(zeroSales.revenue, '0.00'); assert.equal(zeroSales.totalOperatingExpenses, '0.00'); assert.equal(zeroSales.netProfit, '0.00');
  assert.equal(zeroSales.salesConnected, true); pass('A branch/month with zero completed sales shows real revenue 0.00, not a null/crash');

  const posIds = (await pool.query('select id from pos_orders where branch_id=any($1::text[])', [branchIds])).rows.map(r => r.id);
  assert.ok(posIds.includes(visibleOrderId) && posIds.includes(privateOrderId));
 } catch (error) { failure = error; }
 let cleanup;
 try {
  cleanup = await pool.connect();
  await cleanup.query('BEGIN');
  await cleanup.query(`drop trigger if exists ${triggerName} on public.branch_expenses`);
  await cleanup.query(`drop function if exists public.${triggerName}()`);
  await cleanup.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id=any($1::text[]))', [branchIds]);
  await cleanup.query('delete from pos_orders where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from journal_entries where branch_id=any($1::text[])', [branchIds]);
  // Shared COA rows are parent-provisioned and deliberately retained.
  for (const table of ['branch_expenses', 'payroll_snapshots', 'payroll_runs', 'workforce_leaves', 'workforce_attendance', 'employee_compensation', 'employees']) await cleanup.query('delete from ' + table + ' where branch_id=any($1::text[])', [branchIds]);
  await cleanup.query('delete from sessions where user_id=any($1::text[])', [userIds]);
  await cleanup.query('delete from users where id=any($1::text[])', [userIds]);
  await cleanup.query('delete from branches where id=any($1::text[])', [branchIds]);
  await cleanup.query('COMMIT');
  assert.equal(Number((await cleanup.query('select count(*) from branch_expenses where branch_id=any($1::text[])', [branchIds])).rows[0].count), 0);
 } catch (cleanupError) {
  if (cleanup) await cleanup.query('ROLLBACK').catch(() => {});
  failure = failure ? new AggregateError([failure, cleanupError], 'Acceptance and cleanup failed') : cleanupError;
 } finally { cleanup?.release(); await pool.end(); }
 if (failure) throw failure;
 console.log('RESULT ' + checks.length + ' real expense HTTP/Postgres checks passed; fixtures cleaned');
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { guard };
