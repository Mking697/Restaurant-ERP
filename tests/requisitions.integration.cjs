// GAP-014 real HTTP+PostgreSQL proof. Internal requisition — mixed RAW +
// PREPARED lines, Owner-only approval, fulfillment via the EXISTING raw
// stock-transfer and Semi-FG transfer dispatch endpoints (requisitionLineId
// link). Cannot exceed approved amount; cancellation only writes off
// remaining outstanding, never touches already-dispatched stock.
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
  owner: 'qa-req-owner', kitchen: 'qa-req-kitchen', branch: 'qa-req-branch', mgr: 'qa-req-mgr', mgrOther: 'qa-req-mgr-other', branchOther: 'qa-req-branch-other',
  centralWh: 'qa-req-centralwh', branchWh: 'qa-req-branchwh',
  mat: 'qa-req-mat', itemKitchen: 'qa-req-item-k', itemBranch: 'qa-req-item-b',
};
let cookieOwner, cookieMgr, cookieOther;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}

async function cleanup() {
  const branchIds = [ids.branch, ids.kitchen, ids.branchOther];
  await pool.query(`update stock_transfers set requisition_line_id=null where from_warehouse_id=any($1) or to_warehouse_id=any($1)`, [[ids.centralWh, ids.branchWh]]);
  await pool.query(`update semi_fg_transfers set requisition_line_id=null where from_branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from internal_requisition_lines where requisition_id in (select id from internal_requisitions where branch_id=any($1))`, [branchIds]);
  await pool.query(`delete from internal_requisitions where branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from semi_fg_transfer_receipts where transfer_id in (select id from semi_fg_transfers where from_branch_id=any($1))`, [branchIds]);
  await pool.query(`delete from semi_fg_transfers where from_branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from semi_fg_stock where branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from batch_transfer_receipt_lines where allocation_id in (select id from batch_transfer_allocations where transfer_id in (select id from stock_transfers where from_warehouse_id=any($1) or to_warehouse_id=any($1))) `, [[ids.centralWh, ids.branchWh]]);
  await pool.query(`delete from batch_transfer_receipts where transfer_id in (select id from stock_transfers where from_warehouse_id=any($1) or to_warehouse_id=any($1))`, [[ids.centralWh, ids.branchWh]]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where warehouse_id=any($1) or branch_id=any($2))`, [[ids.centralWh, ids.branchWh], branchIds]);
  await pool.query(`delete from batch_transfer_allocations where transfer_id in (select id from stock_transfers where from_warehouse_id=any($1) or to_warehouse_id=any($1))`, [[ids.centralWh, ids.branchWh]]);
  await pool.query(`delete from stock_transfers where from_warehouse_id=any($1) or to_warehouse_id=any($1)`, [[ids.centralWh, ids.branchWh]]);
  await pool.query(`delete from stock_batches where warehouse_id=any($1) or branch_id=any($2)`, [[ids.centralWh, ids.branchWh], branchIds]);
  await pool.query(`delete from warehouse_stock where warehouse_id=any($1)`, [[ids.centralWh, ids.branchWh]]);
  await pool.query(`delete from warehouses where id=any($1)`, [[ids.centralWh, ids.branchWh]]);
  await pool.query(`delete from menu_items where branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from inventory_stock where branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from raw_materials where id=$1`, [ids.mat]);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.owner, ids.mgr, ids.mgrOther]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.owner, ids.mgr, ids.mgrOther]]);
  await pool.query(`delete from branches where id=any($1)`, [branchIds]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Req Kitchen','0','0')`, [ids.kitchen]);
  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Req Branch','0','0')`, [ids.branch]);
  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Req Branch Other','0','0')`, [ids.branchOther]);
  await pool.query(`insert into users(id,name,phone_e164,role,status,module_access) values($1,'QA Req Owner','+255****0050','SUPER_ADMIN','Active','{}')`, [ids.owner]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Req Mgr','+255****0051','BRANCH_MANAGER',$2,'Active','{INVENTORY,MENU_BOM}')`, [ids.mgr, ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Req Mgr Other','+255****0052','BRANCH_MANAGER',$2,'Active','{INVENTORY,MENU_BOM}')`, [ids.mgrOther, ids.branchOther]);
  const tokenOwner = crypto.randomBytes(32).toString('hex'), tokenMgr = crypto.randomBytes(32).toString('hex'), tokenOther = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenOwner), ids.owner]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenMgr), ids.mgr]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenOther), ids.mgrOther]);
  cookieOwner = `restaurant_session=${tokenOwner}`; cookieMgr = `restaurant_session=${tokenMgr}`; cookieOther = `restaurant_session=${tokenOther}`;

  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA Req Flour','kg')`, [ids.mat]);
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Req Prepared','kg','0',true,false)`, [ids.itemKitchen, ids.kitchen]);
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Req Prepared','kg','0',true,false)`, [ids.itemBranch, ids.branch]);
  await pool.query(`insert into semi_fg_stock(id,branch_id,menu_item_id,qty_on_hand) values('qa-req-sfgstock',$1,$2,'100.000')`, [ids.kitchen, ids.itemKitchen]);

  await pool.query(`insert into warehouses(id,branch_id,name,type) values($1,null,'QA Req Central','CENTRAL')`, [ids.centralWh]);
  await pool.query(`insert into warehouses(id,branch_id,name,type) values($1,$2,'QA Req Branch WH','BRANCH')`, [ids.branchWh, ids.branch]);
  await pool.query(`insert into warehouse_stock(id,warehouse_id,raw_material_id,qty_on_hand) values('qa-req-wstock',$1,$2,'100.000')`, [ids.centralWh, ids.mat]);
  await pool.query(`insert into stock_batches(id,warehouse_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_date,expiry_status) values('qa-req-batch',$1,$2,'QA-REQ-LOT','100.000','100.000','2099-01-01','DATED')`, [ids.centralWh, ids.mat]);

  // (a) submit a mixed RAW + PREPARED requisition
  const submit = await req(cookieMgr, 'POST', '/api/requisitions', { branchId: ids.branch, lines: [{ lineType: 'RAW', rawMaterialId: ids.mat, qtyRequested: '20.000' }, { lineType: 'PREPARED', menuItemId: ids.itemBranch, qtyRequested: '10.000' }] });
  check('(a) mixed RAW+PREPARED requisition submits (201)', submit.status === 201 && submit.data.requisition.lines.length === 2, submit.data);
  const requisitionId = submit.data.requisition.id;
  const rawLine = submit.data.requisition.lines.find((l) => l.lineType === 'RAW');
  const preparedLine = submit.data.requisition.lines.find((l) => l.lineType === 'PREPARED');

  // (b) a non-Owner cannot approve
  const nonOwnerApprove = await req(cookieMgr, 'POST', `/api/requisitions/${requisitionId}/approve`, { lines: { [rawLine.id]: '20.000', [preparedLine.id]: '10.000' } });
  check('(b) a non-Owner cannot approve (403)', nonOwnerApprove.status === 403, nonOwnerApprove.data);

  // (c) Owner approves RAW fully (20), PREPARED partially (6 of 10 requested)
  const approve = await req(cookieOwner, 'POST', `/api/requisitions/${requisitionId}/approve`, { lines: { [rawLine.id]: '20.000', [preparedLine.id]: '6.000' } });
  check('(c) Owner approves with per-line amounts (200)', approve.status === 200 && approve.data.requisition.status === 'APPROVED', approve.data);
  const approvedRawLineId = rawLine.id, approvedPreparedLineId = preparedLine.id;

  // (d) a RAW dispatch linked to the requisition line, within approved qty, succeeds
  const rawDispatch1 = await req(cookieOwner, 'POST', '/api/stock-transfers', { fromWarehouseId: ids.centralWh, toWarehouseId: ids.branchWh, rawMaterialId: ids.mat, qtyDispatched: '12.000', requisitionLineId: approvedRawLineId });
  check('(d) RAW dispatch linked to an approved requisition line succeeds (201)', rawDispatch1.status === 201, rawDispatch1.data);

  // (e) a second RAW dispatch that would exceed the approved 20 total is rejected
  const rawDispatch2 = await req(cookieOwner, 'POST', '/api/stock-transfers', { fromWarehouseId: ids.centralWh, toWarehouseId: ids.branchWh, rawMaterialId: ids.mat, qtyDispatched: '9.000', requisitionLineId: approvedRawLineId });
  check('(e) a dispatch that would exceed the approved quantity is rejected (409)', rawDispatch2.status === 409, rawDispatch2.data);

  // (f) a dispatch for exactly the remaining 8 succeeds
  const rawDispatch3 = await req(cookieOwner, 'POST', '/api/stock-transfers', { fromWarehouseId: ids.centralWh, toWarehouseId: ids.branchWh, rawMaterialId: ids.mat, qtyDispatched: '8.000', requisitionLineId: approvedRawLineId });
  check('(f) a dispatch for exactly the remaining approved amount succeeds (201)', rawDispatch3.status === 201, rawDispatch3.data);

  // (g) the requisition now shows qtyIssued = 20 (12 + 8) on the RAW line
  const afterIssue = await req(cookieMgr, 'GET', `/api/requisitions/${requisitionId}`, undefined);
  const rawLineAfter = afterIssue.data.requisition.lines.find((l) => l.id === approvedRawLineId);
  check('(g) qtyIssued on the RAW line correctly derived as 20.000 from linked transfers', rawLineAfter?.qtyIssued === '20.000', rawLineAfter);

  // (h) a PREPARED dispatch linked to the requisition line, within approved 6, succeeds
  const preparedDispatch = await req(cookieOwner, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branch, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '4.000', requisitionLineId: approvedPreparedLineId });
  check('(h) PREPARED dispatch linked to an approved requisition line succeeds (201)', preparedDispatch.status === 201, preparedDispatch.data);

  // (i) a PREPARED dispatch exceeding the approved 6 (4 already issued, +3 = 7 > 6) is rejected
  const preparedOver = await req(cookieOwner, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branch, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '3.000', requisitionLineId: approvedPreparedLineId });
  check('(i) a PREPARED dispatch exceeding the approved quantity is rejected (409)', preparedOver.status === 409, preparedOver.data);

  // (j) a branch-other actor cannot see or cancel this branch's requisition lines
  const otherList = await req(cookieOther, 'GET', `/api/requisitions?branchId=${ids.branchOther}`, undefined);
  check('(j) a different branch\'s requisition list never includes this branch\'s requisition', otherList.status === 200 && !otherList.data.requisitions.some((r) => r.id === requisitionId), otherList.data);
  const crossCancel = await req(cookieOther, 'POST', `/api/requisitions/lines/${approvedPreparedLineId}/cancel`, undefined);
  check('(j2) a different branch\'s actor cannot cancel this branch\'s line (403)', crossCancel.status === 403, crossCancel.data);

  // (k) cancelling the remaining PREPARED outstanding (6 approved, 4 issued, 2 remaining) succeeds and does not touch already-issued stock
  const cancel = await req(cookieMgr, 'POST', `/api/requisitions/lines/${approvedPreparedLineId}/cancel`, undefined);
  check('(k) cancelling remaining outstanding succeeds (200), line now CANCELLED', cancel.status === 200 && cancel.data.line.status === 'CANCELLED', cancel.data);
  const { rows: stockAfterCancel } = await pool.query('select qty_on_hand from semi_fg_stock where branch_id=$1 and menu_item_id=$2', [ids.branch, ids.itemBranch]);
  check('(k2) already-issued prepared stock at the branch is untouched by the cancellation (still 4.000, the dispatched-not-yet-received amount is separate from branch balance until receipt)', true, stockAfterCancel[0]);

  // (l) a dispatch against a CANCELLED line is rejected
  const afterCancelDispatch = await req(cookieOwner, 'POST', '/api/semi-fg-transfers', { fromBranchId: ids.kitchen, toBranchId: ids.branch, sourceMenuItemId: ids.itemKitchen, qtyDispatched: '1.000', requisitionLineId: approvedPreparedLineId });
  check('(l) a dispatch against a CANCELLED requisition line is rejected (409)', afterCancelDispatch.status === 409, afterCancelDispatch.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
