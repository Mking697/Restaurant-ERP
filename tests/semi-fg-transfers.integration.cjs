// GAP-013 real HTTP+PostgreSQL proof. Branch-to-branch prepared Semi-FG
// transfer. Name-matched destination identity (zero/multiple matches fails
// closed), full idempotent partial-receive flow, duplicate receipt never
// double-credits, cross-location isolation.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_cutting_qa_\d{8}$/);
assert.equal(process.env.CUTTING_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  kitchen: 'qa-sfgx-kitchen', branchB: 'qa-sfgx-branch-b', branchC: 'qa-sfgx-branch-c',
  mgrKitchen: 'qa-sfgx-mgr-k', mgrB: 'qa-sfgx-mgr-b', mgrC: 'qa-sfgx-mgr-c',
  itemKitchen: 'qa-sfgx-item-k', itemB: 'qa-sfgx-item-b', itemC1: 'qa-sfgx-item-c1', itemC2: 'qa-sfgx-item-c2', itemCWrongUnit: 'qa-sfgx-item-c-wrongunit',
};
let cookieK, cookieB, cookieC;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}
async function stockOf(branchId, menuItemId) {
  const { rows } = await pool.query('select qty_on_hand from semi_fg_stock where branch_id=$1 and menu_item_id=$2', [branchId, menuItemId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}

async function cleanup() {
  const branchIds = [ids.kitchen, ids.branchB, ids.branchC];
  await pool.query(`delete from semi_fg_transfer_receipts where transfer_id in (select id from semi_fg_transfers where from_branch_id=any($1))`, [branchIds]);
  await pool.query(`delete from semi_fg_transfers where from_branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from semi_fg_stock where branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from menu_items where branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.mgrKitchen, ids.mgrB, ids.mgrC]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.mgrKitchen, ids.mgrB, ids.mgrC]]);
  await pool.query(`delete from branches where id=any($1)`, [branchIds]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Base Kitchen','0','0')`, [ids.kitchen]);
  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Branch B','0','0')`, [ids.branchB]);
  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Branch C','0','0')`, [ids.branchC]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Kitchen Mgr','+255****0040','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.mgrKitchen, ids.kitchen]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Branch B Mgr','+255****0041','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.mgrB, ids.branchB]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Branch C Mgr','+255****0042','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.mgrC, ids.branchC]);
  const tokenK = crypto.randomBytes(32).toString('hex'), tokenB = crypto.randomBytes(32).toString('hex'), tokenC = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenK), ids.mgrKitchen]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenB), ids.mgrB]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenC), ids.mgrC]);
  cookieK = `restaurant_session=${tokenK}`; cookieB = `restaurant_session=${tokenB}`; cookieC = `restaurant_session=${tokenC}`;

  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Cut Chicken','pcs','0',true,false)`, [ids.itemKitchen, ids.kitchen]);
  await pool.query(`insert into semi_fg_stock(id,branch_id,menu_item_id,qty_on_hand) values('qa-sfgx-stock-k',$1,$2,'50.000')`, [ids.kitchen, ids.itemKitchen]);

  // (a) zero destination match (no item named "QA Cut Chicken" at branch B yet) fails closed
  const noMatch = await req(cookieK, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branchB, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '10.000' });
  check('(a) zero destination name-match fails closed (409)', noMatch.status === 409, noMatch.data);

  // create the matching item at branch B
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Cut Chicken','pcs','0',true,false)`, [ids.itemB, ids.branchB]);

  // (b) multiple destination matches at branch C fails closed
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Cut Chicken','pcs','0',true,false)`, [ids.itemC1, ids.branchC]);
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Cut Chicken','pcs','0',true,false)`, [ids.itemC2, ids.branchC]);
  const multiMatch = await req(cookieK, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branchC, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '10.000' });
  check('(b) multiple destination name-matches fails closed (409)', multiMatch.status === 409, multiMatch.data);
  await pool.query(`delete from menu_items where id=any($1)`, [[ids.itemC1, ids.itemC2]]);

  // (c) output unit mismatch fails closed
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Cut Chicken','kg','0',true,false)`, [ids.itemCWrongUnit, ids.branchC]);
  const unitMismatch = await req(cookieK, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branchC, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '10.000' });
  check('(c) output unit mismatch (pcs vs kg) fails closed (409)', unitMismatch.status === 409, unitMismatch.data);
  await pool.query(`delete from menu_items where id=$1`, [ids.itemCWrongUnit]);

  // (d) a branch-B manager cannot dispatch FROM the kitchen branch (cross-location isolation)
  const crossDispatch = await req(cookieB, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branchB, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '10.000' });
  check('(d) a branch-B actor cannot dispatch claiming the kitchen as fromBranchId (403)', crossDispatch.status === 403, crossDispatch.data);

  // (e) real dispatch: kitchen -> branch B, 20 pcs
  const dispatch = await req(cookieK, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branchB, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '20.000' });
  check('(e) real dispatch succeeds (201), destMenuItemId resolved to the name-matched branch-B item', dispatch.status === 201 && dispatch.data.semiFgTransfer.destMenuItemId === ids.itemB, dispatch.data);
  const transferId = dispatch.data.semiFgTransfer.id;
  check('(e2) source stock debited by exactly 20', (await stockOf(ids.kitchen, ids.itemKitchen)) === '30.000', await stockOf(ids.kitchen, ids.itemKitchen));

  // (f) a branch-C manager cannot receive a transfer addressed to branch B
  const crossReceive = await req(cookieC, 'POST', `/api/semi-fg-transfers/${transferId}/receive`, { qtyReceived: '20.000' });
  check('(f) a branch-C actor cannot receive a transfer addressed to branch B (403)', crossReceive.status === 403, crossReceive.data);

  // (g) partial receipt: branch B receives only 15 of the 20 dispatched
  const partial = await req(cookieB, 'POST', `/api/semi-fg-transfers/${transferId}/receive`, { qtyReceived: '15.000' });
  check('(g) partial receipt succeeds (200), variance = 5', partial.status === 200 && partial.data.variance === '5.000', partial.data);
  check('(g2) destination stock credited with exactly the received 15', (await stockOf(ids.branchB, ids.itemB)) === '15.000', await stockOf(ids.branchB, ids.itemB));

  // (h) duplicate receipt callback with the SAME request replays, no double-credit
  const replay = await req(cookieB, 'POST', `/api/semi-fg-transfers/${transferId}/receive`, { qtyReceived: '15.000' });
  check('(h) duplicate receipt with the same request replays (200, replayed:true)', replay.status === 200 && replay.data.replayed === true, replay.data);
  check('(h2) destination stock unchanged by the replay (still 15)', (await stockOf(ids.branchB, ids.itemB)) === '15.000', await stockOf(ids.branchB, ids.itemB));

  // (i) a duplicate receipt with a DIFFERENT request is rejected
  const conflict = await req(cookieB, 'POST', `/api/semi-fg-transfers/${transferId}/receive`, { qtyReceived: '20.000' });
  check('(i) a duplicate receipt with a different qty is rejected (409)', conflict.status === 409, conflict.data);

  // (j) qtyReceived cannot exceed qtyDispatched on a fresh transfer
  const dispatch2 = await req(cookieK, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branchB, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '5.000' });
  const overReceive = await req(cookieB, 'POST', `/api/semi-fg-transfers/${dispatch2.data.semiFgTransfer.id}/receive`, { qtyReceived: '9.000' });
  check('(j) qtyReceived exceeding qtyDispatched is rejected (400)', overReceive.status === 400, overReceive.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
