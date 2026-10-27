// Parent-run only: migrated disposable QA DB + app bound to that exact DB.
// PGDATABASE=restaurant_erp_recipe_qa_YYYYMMDD SHIFTS_QA_DATABASE=<same>
// BASE_URL=http://127.0.0.1:<dedicated-port> node tests/shift-handover.integration.cjs
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_(recipe|semi_fg|shifts)_qa_\d{8}$/);
assert.equal(process.env.SHIFTS_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:' && target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash);
const pool = new Pool({ host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
const id = () => randomUUID();
const a = id(), b = id(), owner = id(), admin = id(), cashier = id(), dishCash = id(), dishCard = id();
const branchIds = [a, b], userIds = [owner, admin, cashier], menuIds = [dishCash, dishCard];
const rawCash = id(), rawCard = id(), rawLegacy = id(), legacyId = id();
const token = () => randomBytes(32).toString('hex');
const ot = token(), at = token(), ct = token();
const cookie = t => 'restaurant_session=' + t;
let checks = 0;
function pass(name) { checks++; console.log('PASS ' + name); }
async function request(path, t = ot, method = 'GET', input, expected = 200) {
  const response = await fetch(target.origin + path, { method, headers: { origin: target.origin, 'content-type': 'application/json', ...(t ? { cookie: cookie(t) } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const data = await response.json();
  if (expected !== null) assert.equal(response.status, expected, path + ': ' + JSON.stringify(data));
  else assert.ok([200, 201].includes(response.status), path + ': ' + JSON.stringify(data));
  return data;
}
const order = (menuItemId, tenderType, branchId = a) => ({ branchId, channel: 'DINE_IN', tenderType, lines: [{ menuItemId, qty: 1 }] });
const shiftsPayload = (branchId = a) => ({ branchId, shifts: [{ label: 'Shift A', startTime: '00:00', endTime: '12:00' }, { label: 'Shift B', startTime: '12:00', endTime: '00:00' }] });
async function withRecipe(menuItemId, branchId, rawMaterialId) {
  await pool.query('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,1000)', [id(), branchId, rawMaterialId]);
  await pool.query('insert into bom_recipes(id,branch_id,menu_item_id,component_type,raw_material_id,qty_per_unit) values($1,$2,$3,$4,$5,$6)', [id(), branchId, menuItemId, 'RAW_MATERIAL', rawMaterialId, '0.100']);
}

(async () => {
  try {
    assert.equal((await pool.query('select current_database() db')).rows[0].db, process.env.SHIFTS_QA_DATABASE);
    for (const branch of branchIds) await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0)', [branch, 'Shift QA ' + branch]);
    for (const [uid, role, grants, t] of [[owner, 'SUPER_ADMIN', [], ot], [admin, 'BRANCH_MANAGER', ['SHIFT_MANAGEMENT'], at], [cashier, 'CASHIER', ['POS_CASHIER', 'CASH_DROP'], ct]]) {
      await pool.query('insert into users(id,name,phone_e164,role,branch_id,password_hash,module_access) values($1,$2,$3,$4,$5,$6,$7)', [uid, 'Shift QA ' + uid, '+919' + String(BigInt('0x' + uid.replaceAll('-', '').slice(0, 12)) % 1000000000n).padStart(9, '0'), role, role === 'SUPER_ADMIN' ? null : a, 'qa-no-password-login', grants]);
      await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(t).digest('hex'), uid]);
    }
    assert.equal((await request('/api/auth/me')).user.id, owner);
    for (const [mid, price] of [[dishCash, '100.00'], [dishCard, '250.00']]) await pool.query("insert into menu_items(id,branch_id,name,price,is_semi_fg,is_sellable,output_unit) values($1,$2,$1,$3,false,true,'portion')", [mid, a, price]);
    await pool.query("insert into raw_materials(id,name,unit) values($1,$2,'kg'),($3,$4,'kg')", [rawCash, 'Shift QA raw ' + rawCash, rawCard, 'Shift QA raw ' + rawCard]);
    await withRecipe(dishCash, a, rawCash);
    await withRecipe(dishCard, a, rawCard);

    // Branch b has NO shifts configured at all — legacy/opt-out branch, POS
    // must keep working exactly as before shift management existed.
    await pool.query("insert into menu_items(id,branch_id,name,price,is_semi_fg,is_sellable,output_unit) values($1,$2,$1,'50.00',false,true,'portion')", [legacyId, b]);
    await pool.query("insert into raw_materials(id,name,unit) values($1,$2,'kg')", [rawLegacy, 'Shift QA raw ' + rawLegacy]);
    await withRecipe(legacyId, b, rawLegacy);
    const legacySale = await request('/api/pos/orders', ot, 'POST', order(legacyId, 'CASH', b), 201);
    assert.equal((await pool.query('select shift_run_id from pos_orders where id=$1', [legacySale.order.id])).rows[0].shift_run_id, '');
    pass('a branch with zero configured shifts sells normally with an empty shiftRunId (purely additive)');

    await request('/api/branch-shifts', ct, 'POST', shiftsPayload(), 403);
    await pool.query("update users set module_access=array['POS_CASHIER','CASH_DROP','SHIFT_MANAGEMENT']::text[] where id=$1", [cashier]);
    await request('/api/branch-shifts', ct, 'POST', shiftsPayload(), 403);
    await pool.query("update users set module_access=array['POS_CASHIER','CASH_DROP']::text[] where id=$1", [cashier]);
    pass('cashier cannot configure windows even with an explicit SHIFT_MANAGEMENT grant');
    await request('/api/branch-shifts?branchId=' + b, at, 'GET', undefined, 403);
    await request('/api/branch-shifts', at, 'POST', shiftsPayload(b), 403);
    await request('/api/shift-runs?branchId=' + b, ct, 'GET', undefined, 403);
    await request('/api/shift-runs', ct, 'POST', { branchId: b }, 403);
    await request('/api/pos/orders', ct, 'POST', order(legacyId, 'CASH', b), 403);
    pass('branch-scoped admin/cashier cannot read or mutate another branch shift state or sell there');
    const csrf = await fetch(target.origin + '/api/branch-shifts', { method: 'POST', headers: { cookie: cookie(at), origin: 'http://evil.test', 'content-type': 'application/json' }, body: JSON.stringify(shiftsPayload()) });
    assert.equal(csrf.status, 403); pass('CSRF rejected on branch-shifts POST');
    await request('/api/branch-shifts', at, 'POST', { branchId: a, shifts: [{ label: 'A', startTime: '09:00', endTime: '17:00' }, { label: 'B', startTime: '18:00', endTime: '09:00' }] }, 400);
    pass('a gap between shift windows is rejected (continuity enforced)');

    await request('/api/shift-runs', ct, 'POST', { branchId: a }, 400);
    pass('cannot start a shift before any windows are configured');
    const created = await request('/api/branch-shifts', at, 'POST', shiftsPayload(), 201);
    assert.equal(created.shifts.length, 2);
    pass('valid continuous 2-shift config saved');

    const started = await request('/api/shift-runs', ct, 'POST', { branchId: a }, 201);
    const runA = started.run;
    assert.equal(runA.status, 'OPEN');
    await request('/api/shift-runs', ct, 'POST', { branchId: a }, 409);
    pass('a second shift cannot be started while one is already open');

    const cashSale = await request('/api/pos/orders', ct, 'POST', order(dishCash, 'CASH'), 201);
    const cardSale = await request('/api/pos/orders', ct, 'POST', order(dishCard, 'CARD'), 201);
    assert.equal((await pool.query('select shift_run_id from pos_orders where id=$1', [cashSale.order.id])).rows[0].shift_run_id, runA.id);
    pass('POS orders during the open run are tagged with that run\'s shiftRunId');

    const upiSale = await request('/api/pos/orders', ct, 'POST', order(dishCash, 'UPI'), 201);
    assert.equal((await pool.query('select shift_run_id from pos_orders where id=$1', [upiSale.order.id])).rows[0].shift_run_id, runA.id);
    const status = await request('/api/shift-runs?branchId=' + a, ct);
    assert.equal(status.run.id, runA.id);
    assert.equal(status.pendingHandover, null);
    pass('no handover pending while the run is still open');

    // Count exactly 100 in notes — matches the single CASH sale (₹100), zero
    // shortage expected.
    const endResult = await request('/api/shift-runs/' + runA.id + '/end', ct, 'POST', { branchId: a, note100Count: 1, note50Count: 0, note20Count: 0, note10Count: 0, note200Count: 0, note500Count: 0, coinsInr: 0 }, 201);
    assert.equal(endResult.handover.cashAmount, '100.00');
    assert.equal(endResult.handover.cardAmount, '250.00');
    assert.equal(endResult.handover.upiAmount, '100.00');
    assert.equal(endResult.fromRun.status, 'ENDED');
    assert.equal(endResult.fromRun.endedBy, cashier);
    assert.ok(endResult.fromRun.endedAt);
    assert.equal(endResult.cashExpected, '100.00');
    assert.equal(endResult.shortageExcessInr, '0.00');
    pass('ending a shift computes cash/card/UPI totals correctly and reports zero shortage when the blind count matches');

    const runB = endResult.toRun;
    assert.notEqual(runB.id, runA.id);
    assert.notEqual(runB.label, runA.label);
    pass('ending a shift immediately opens the next shift in the cycle (no gap)');

    await request('/api/pos/orders', ct, 'POST', order(dishCash, 'CASH'), 409);
    pass('POS orders are blocked on the new run until its handover is accepted');
    await request('/api/shift-runs/' + runB.id + '/end', ct, 'POST', { branchId: a, note100Count: 0, note50Count: 0, note20Count: 0, note10Count: 0, note200Count: 0, note500Count: 0, coinsInr: 0 }, 409);
    pass('cannot end a shift whose own incoming handover is still pending acceptance');

    await request('/api/shift-runs/' + runB.id + '/end', ct, 'POST', { branchId: b }, 403);
    await request('/api/shift-handovers/' + endResult.handover.id + '/accept', ct, 'POST', { branchId: b }, 403);
    await request('/api/shift-runs/' + runB.id + '/end', ot, 'POST', { branchId: b }, 404);
    await request('/api/shift-handovers/' + endResult.handover.id + '/accept', ot, 'POST', { branchId: b }, 404);
    assert.equal((await pool.query('select status from shift_handovers where id=$1', [endResult.handover.id])).rows[0].status, 'PENDING');
    pass('foreign branch end/accept attempts cannot change the real run or handover, including Owner using a mismatched branch');

    await request('/api/shift-handovers/' + randomUUID() + '/accept', ct, 'POST', { branchId: a }, 404);
    pass('accepting a nonexistent handover id fails closed');

    const accepted = await request('/api/shift-handovers/' + endResult.handover.id + '/accept', ct, 'POST', { branchId: a }, 200);
    assert.equal(accepted.handover.status, 'ACCEPTED');
    pass('accepting the pending handover unblocks the new run');

    await request('/api/shift-handovers/' + endResult.handover.id + '/accept', ct, 'POST', { branchId: a }, 404);
    pass('accepting an already-accepted handover a second time fails closed (not double-processed)');

    const afterAccept = await request('/api/pos/orders', ct, 'POST', order(dishCash, 'CASH'), 201);
    assert.equal((await pool.query('select shift_run_id from pos_orders where id=$1', [afterAccept.order.id])).rows[0].shift_run_id, runB.id);
    pass('POS orders now tag the accepted new run');

    await request('/api/pos/orders', ct, 'POST', order(dishCash, 'UPI'), 201);
    const secondEnd = await request('/api/shift-runs/' + runB.id + '/end', ct, 'POST', { branchId: a, note100Count: 2 }, 201);
    assert.equal(secondEnd.cashExpected, '200.00');
    assert.equal(secondEnd.shortageExcessInr, '0.00');
    assert.equal(secondEnd.handover.cashAmount, '200.00');
    assert.equal(secondEnd.handover.cardAmount, '0.00', 'prior CARD receipts are not carried into this run');
    assert.equal(secondEnd.handover.upiAmount, '100.00', 'only this run UPI receipts, not incoming UPI');
    assert.equal(secondEnd.toRun.shiftDefinitionId, runA.shiftDefinitionId, 'unchanged cycle wraps to original definition');
    const secondDrop = (await pool.query('select expected_cash_inr,counted_cash_inr,shortage_excess_inr from cash_drops where id=$1', [secondEnd.handover.closingCashDropId])).rows[0];
    assert.deepEqual(secondDrop, { expected_cash_inr: '200.00', counted_cash_inr: '200.00', shortage_excess_inr: '0.00' });
    pass('second consecutive shift carries accepted physical cash once, excludes prior electronic receipts, and persists the correct reconciliation');

    async function postResult(path, input) {
      const response = await fetch(target.origin + path, { method: 'POST', headers: { cookie: cookie(ct), origin: target.origin, 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(60000) });
      return { status: response.status, data: await response.json() };
    }
    const accepts = await Promise.all([0, 1].map(() => postResult('/api/shift-handovers/' + secondEnd.handover.id + '/accept', { branchId: a })));
    assert.deepEqual(accepts.map(r => r.status).sort(), [200, 404]);
    assert.equal((await pool.query('select status,accepted_by from shift_handovers where id=$1', [secondEnd.handover.id])).rows[0].accepted_by, cashier);
    pass('concurrent acceptance requests produce exactly one acceptance and one closed failure');

    // Historical definitions are preserved, not deleted, when reconfiguring —
    // FK from shift_runs to branch_shifts must survive a later edit. Put the
    // currently-due replacement SECOND to catch a first-row fallback bug.
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const [hour, minute] = now.split(':').map(Number);
    const opposite = (hour * 60 + minute + 720) % 1440;
    const later = `${String(Math.floor(opposite / 60)).padStart(2, '0')}:${String(opposite % 60).padStart(2, '0')}`;
    const replacements = await request('/api/branch-shifts', at, 'POST', { branchId: a, shifts: [{ label: 'Not Due', startTime: later, endTime: now }, { label: 'Due Now', startTime: now, endTime: later }] }, 201);
    const oldDefStillThere = (await pool.query('select is_active from branch_shifts where id=$1', [runA.shiftDefinitionId])).rows[0];
    assert.equal(oldDefStillThere.is_active, false);
    assert.equal((await pool.query('select count(*)::int n from shift_runs where id=$1', [runA.id])).rows[0].n, 1);
    pass('reconfiguring shift windows soft-deactivates old definitions instead of deleting them; past runs stay intact');

    // All HTTP mutations already share auth.locked()'s global advisory lock;
    // this checks valid serialized outcomes, not a previously reproducible race.
    const runC = secondEnd.toRun;
    const raced = await Promise.all([
      postResult('/api/pos/orders', order(dishCash, 'CASH')),
      postResult('/api/shift-runs/' + runC.id + '/end', { branchId: a, note100Count: 2 }),
      postResult('/api/shift-runs/' + runC.id + '/end', { branchId: a, note100Count: 2 }),
    ]);
    const sale = raced[0], endings = raced.slice(1);
    assert.ok([201, 409].includes(sale.status), JSON.stringify(sale));
    assert.deepEqual(endings.map(r => r.status).sort(), [201, 404]);
    const closed = endings.find(r => r.status === 201).data;
    assert.equal(closed.fromRun.status, 'ENDED');
    assert.equal(closed.toRun.shiftDefinitionId, replacements.shifts[1].id);
    assert.equal(closed.cashExpected, sale.status === 201 ? '300.00' : '200.00');
    assert.equal(closed.shortageExcessInr, sale.status === 201 ? '-100.00' : '0.00');
    if (sale.status === 201) assert.equal((await pool.query('select shift_run_id from pos_orders where id=$1', [sale.data.order.id])).rows[0].shift_run_id, runC.id);
    const closing = (await pool.query('select expected_cash_inr,shortage_excess_inr from cash_drops where shift_run_id=$1', [runC.id])).rows;
    assert.equal(closing.length, 1);
    assert.equal(closing[0].expected_cash_inr, closed.cashExpected);
    assert.equal(closing[0].shortage_excess_inr, closed.shortageExcessInr);
    assert.equal((await pool.query('select count(*)::int n from shift_handovers where from_run_id=$1', [runC.id])).rows[0].n, 1);
    assert.equal((await pool.query("select count(*)::int n from shift_runs where branch_id=$1 and status='OPEN'", [a])).rows[0].n, 1);
    await request('/api/pos/orders', ct, 'POST', order(dishCash, 'CASH'), 409);
    pass('concurrent sale/two closes reconcile any successful sale, create one closing and one pending successor, and use the due replacement window');

    await request('/api/shift-handovers/' + closed.handover.id + '/accept', ct, 'POST', { branchId: a }, 200);
    await request('/api/shift-runs/' + closed.toRun.id + '/end', ct, 'POST', { branchId: a, coinsInr: 0.001 }, 400);
    const coinClosing = await request('/api/shift-runs/' + closed.toRun.id + '/end', ct, 'POST', { branchId: a, note100Count: 2, coinsInr: 0.5 }, 201);
    assert.equal(coinClosing.cashExpected, '200.00');
    assert.equal(coinClosing.handover.cashAmount, '200.50');
    assert.equal(coinClosing.shortageExcessInr, '0.50');
    pass('closing accepts paise-valued coins, rejects excess precision, and reconciles against carried cash');

    console.log('RESULT ' + checks + ' real HTTP/Postgres checks passed');
  } finally {
    await pool.query('delete from shift_handovers where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from shift_runs where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from branch_shifts where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id=any($1::text[]))', [branchIds]);
    await pool.query('delete from cash_drops where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from pos_orders where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from bom_recipes where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from inventory_stock where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from raw_materials where id=any($1::text[])', [[rawCash, rawCard, rawLegacy]]);
    await pool.query('delete from menu_items where branch_id=any($1::text[])', [branchIds]);
    await pool.query('delete from sessions where user_id=any($1::text[])', [userIds]);
    await pool.query('delete from users where id=any($1::text[])', [userIds]);
    await pool.query('delete from branches where id=any($1::text[])', [branchIds]);
    await pool.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
