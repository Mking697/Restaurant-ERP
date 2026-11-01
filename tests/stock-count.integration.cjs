// GAP-007: real HTTP+PostgreSQL proof of the formal, approval-gated
// physical stock count — DRAFT (blind, system expectedQty hidden) ->
// SUBMITTED (counter's physicalQty) -> APPROVED (a DIFFERENT user posts a
// signed stock_movements delta against the CURRENT balance, never an
// overwrite) or REJECTED. Parent-run only against a disposable QA DB.
// PGHOST=127.0.0.1 PGPORT=5436 PGDATABASE=restaurant_erp_count_qa_YYYYMMDD
// COUNT_QA_DATABASE=<same> BASE_URL=http://127.0.0.1:<port>
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Must target the local Docker Postgres host only');
assert.equal(process.env.PGPORT, '5436', 'Must target the local Docker Postgres port only');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_count_qa_\d{8}$/, 'Disposable QA DB name required, never the shared dev DB');
assert.equal(process.env.COUNT_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:', 'QA app must be loopback-only');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branchA: 'qa-cnt-branch-a', branchB: 'qa-cnt-branch-b',
  owner: 'qa-cnt-owner', managerA: 'qa-cnt-manager-a', managerA2: 'qa-cnt-manager-a2', cashierA: 'qa-cnt-cashier-a', managerB: 'qa-cnt-manager-b',
  rice: 'qa-cnt-mat-rice', oil: 'qa-cnt-mat-oil', vendor: 'qa-cnt-vendor',
};
const cookies = {};
async function actorCookie(id) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(token), id]);
  return `restaurant_session=${token}`;
}
async function req(method, path, bodyObj, actor) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(60000), headers: { 'content-type': 'application/json', origin: BASE, ...(actor ? { cookie: cookies[actor] } : {}) }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}
async function stockOf(branchId, materialId) {
  const { rows } = await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2', [branchId, materialId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}

async function cleanup() {
  await pool.query(`delete from stock_count_lines where count_id in (select id from stock_counts where branch_id = any($1))`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from stock_counts where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from stock_movements where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id = any($1))`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from stock_batches where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from inventory_stock where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.rice, ids.oil]]);
  await pool.query(`delete from sessions where user_id = any($1)`, [[ids.owner, ids.managerA, ids.managerA2, ids.cashierA, ids.managerB]]);
  await pool.query(`delete from users where id = any($1)`, [[ids.owner, ids.managerA, ids.managerA2, ids.cashierA, ids.managerB]]);
  await pool.query(`delete from branches where id = any($1)`, [[ids.branchA, ids.branchB]]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Count A','0','0'),($2,$2,'QA Count B','0','0')`, [ids.branchA, ids.branchB]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values
    ($1,'QA Count Owner','+255710000001','SUPER_ADMIN',null,'Active','{}'),
    ($2,'QA Count Manager A','+255710000002','BRANCH_MANAGER',$6,'Active','{INVENTORY}'),
    ($3,'QA Count Manager A2','+255710000003','BRANCH_MANAGER',$6,'Active','{INVENTORY}'),
    ($4,'QA Count Cashier A','+255710000004','CASHIER',$6,'Active','{INVENTORY}'),
    ($5,'QA Count Manager B','+255710000005','BRANCH_MANAGER',$7,'Active','{INVENTORY}')`,
    [ids.owner, ids.managerA, ids.managerA2, ids.cashierA, ids.managerB, ids.branchA, ids.branchB]);
  for (const id of [ids.owner, ids.managerA, ids.managerA2, ids.cashierA, ids.managerB]) cookies[id] = await actorCookie(id);

  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA Count Rice','kg'),($2,'QA Count Oil','l')`, [ids.rice, ids.oil]);
  await pool.query(`insert into vendors(id,name,phone_e164) values($1,'QA Count Vendor',$1)`, [ids.vendor]);
  await pool.query(`insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,'5.000')`, ['qa-cnt-stock-rice', ids.branchA, ids.rice]);
  await pool.query(`insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,'10.000')`, ['qa-cnt-stock-oil', ids.branchA, ids.oil]);
  // GAP-006 invariant: real stock always has a matching stockBatches lot —
  // seed one here too (DATED, far future) so the count's approve-time
  // batch debit has real lot stock to draw from, same as a real GRN credit
  // would have left behind.
  await pool.query(`insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_date,expiry_status) values
    ($1,$2,$3,'QA-SEED-RICE','5.000','5.000','2099-01-01','DATED'),
    ($4,$2,$5,'QA-SEED-OIL','10.000','10.000','2099-01-01','DATED')`,
    ['qa-cnt-batch-rice', ids.branchA, ids.rice, 'qa-cnt-batch-oil', ids.oil]);

  // (a) cross-branch denial: Manager B cannot start a count in branch A
  const crossBranch = await req('POST', '/api/inventory/counts', { branchId: ids.branchA, rawMaterialIds: [ids.rice] }, ids.managerB);
  check('(a) cross-branch start denied (403)', crossBranch.status === 403, crossBranch.data);

  // (b) start a count, blind — expectedQty must be hidden in the DRAFT response
  const start = await req('POST', '/api/inventory/counts', { branchId: ids.branchA, rawMaterialIds: [ids.rice, ids.oil] }, ids.managerA);
  check('(b) count starts in DRAFT, expectedQty hidden (blind count)', start.status === 201 && start.data.stockCount.status === 'DRAFT' && start.data.stockCount.lines.every((l) => l.expectedQty === null), start.data);
  const countId = start.data.stockCount.id;

  // (c) a GRN-equivalent movement happens DURING the count (between cutoff and approval) — a real receipt lands
  await pool.query(`update inventory_stock set qty_on_hand = '8.000' where branch_id=$1 and raw_material_id=$2`, [ids.branchA, ids.rice]); // simulates +3 received mid-count

  // (d) submit with zero count on oil (real zero, unit precision on rice)
  const submit = await req('POST', `/api/inventory/counts/${countId}/submit`, { lines: [{ rawMaterialId: ids.rice, physicalQty: '0.000' }, { rawMaterialId: ids.oil, physicalQty: '0' }] }, ids.managerA);
  check('(d) submit succeeds, status SUBMITTED', submit.status === 200 && submit.data.stockCount.status === 'SUBMITTED', submit.data);

  // (e) the submitter cannot approve their own count — hard rule, even though managerA has reviewer role
  const selfApprove = await req('POST', `/api/inventory/counts/${countId}/approve`, {}, ids.managerA);
  check('(e) self-approval denied (403) even for a reviewer-role user', selfApprove.status === 403, selfApprove.data);

  // (f) a non-reviewer role (cashier) cannot approve either
  const cashierApprove = await req('POST', `/api/inventory/counts/${countId}/approve`, {}, ids.cashierA);
  check('(f) non-reviewer role cannot approve (403)', cashierApprove.status === 403, cashierApprove.data);

  // (g) approval by a DIFFERENT manager succeeds. Expected rice snapshot was 5
  // (cutoff), physical 0 -> delta -5. But current balance is now 8 (the +3
  // mid-count receipt from step c) -> approved result must be 8 - 5 = 3, NOT
  // 0 (an overwrite would have erased the +3 receipt).
  const approve = await req('POST', `/api/inventory/counts/${countId}/approve`, {}, ids.managerA2);
  check('(g) approval by a different manager succeeds (200), status APPROVED', approve.status === 200 && approve.data.stockCount.status === 'APPROVED', approve.data);
  check('(g2) rice balance after approval is 3.000 (8 current - 5 cutoff-delta), movement-during-count preserved, not overwritten to 0', (await stockOf(ids.branchA, ids.rice)) === '3.000', await stockOf(ids.branchA, ids.rice));
  check('(g3) oil balance after approval is 0.000 (zero count honored exactly, unit precision)', (await stockOf(ids.branchA, ids.oil)) === '0.000', await stockOf(ids.branchA, ids.oil));

  // (h) repeated approval is rejected, not double-posted
  const reapprove = await req('POST', `/api/inventory/counts/${countId}/approve`, {}, ids.managerA2);
  check('(h) repeated approval rejected (409), no double post', reapprove.status === 409, reapprove.data);
  check('(h2) rice balance still exactly 3.000 after the rejected re-approval attempt', (await stockOf(ids.branchA, ids.rice)) === '3.000', await stockOf(ids.branchA, ids.rice));

  // (i) a stock_movements PHYSICAL_COUNT_ADJUST row was posted exactly once for rice (-5 delta)
  const movements = await pool.query(`select qty_delta from stock_movements where branch_id=$1 and raw_material_id=$2 and movement_type='PHYSICAL_COUNT_ADJUST'`, [ids.branchA, ids.rice]);
  check('(i) exactly one PHYSICAL_COUNT_ADJUST ledger row posted for rice, delta -5.000', movements.rows.length === 1 && movements.rows[0].qty_delta === '-5.000', movements.rows);

  // (j) reject flow: a second count, submitted then rejected, posts nothing
  const start2 = await req('POST', '/api/inventory/counts', { branchId: ids.branchA, rawMaterialIds: [ids.oil] }, ids.cashierA);
  const countId2 = start2.data.stockCount.id;
  await req('POST', `/api/inventory/counts/${countId2}/submit`, { lines: [{ rawMaterialId: ids.oil, physicalQty: '99.000' }] }, ids.cashierA);
  const reject = await req('POST', `/api/inventory/counts/${countId2}/reject`, { reviewNote: 'Recount — implausible jump from 0 to 99' }, ids.managerA);
  check('(j) reject succeeds (200), status REJECTED', reject.status === 200 && reject.data.stockCount.status === 'REJECTED', reject.data);
  check('(j2) oil balance unchanged by the rejected count (still 0.000)', (await stockOf(ids.branchA, ids.oil)) === '0.000', await stockOf(ids.branchA, ids.oil));

  // (k) cross-branch denial on read too
  const readForeign = await req('GET', `/api/inventory/counts/${countId}`, undefined, ids.managerB);
  check('(k) cross-branch read denied (403)', readForeign.status === 403, readForeign.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
