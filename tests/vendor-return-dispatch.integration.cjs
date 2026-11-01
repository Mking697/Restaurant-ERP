// GAP-018 real HTTP+PostgreSQL proof. Physical purchase-return lifecycle:
// dispatch (quantity/reason/evidence) and vendor acknowledgment layered on
// top of the EXISTING materialReturns money-claim (GRN quality
// FAIL/PARTIAL), with partial dispatch, duplicate/over-dispatch
// prevention, and Owner-only cancellation of the remaining undispatched
// quantity that never touches an already-dispatched row.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_vrd_qa_\d{8}$/);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { owner: 'qa-vrd-owner', mgr: 'qa-vrd-mgr', branch: 'qa-vrd-branch', vendor: 'qa-vrd-vendor', mat: 'qa-vrd-mat' };
let cookieOwner, cookieMgr;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}

async function cleanup() {
  await pool.query(`delete from audit_log where user_id=any($1)`, [[ids.owner, ids.mgr]]);
  await pool.query(`delete from material_return_dispatches where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from material_returns where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from grns where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from purchase_orders where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id=$1 or raw_material_id=$2)`, [ids.branch, ids.mat]);
  await pool.query(`delete from stock_batches where branch_id=$1 or raw_material_id=$2`, [ids.branch, ids.mat]);
  await pool.query(`delete from stock_movements where branch_id=$1 or raw_material_id=$2`, [ids.branch, ids.mat]);
  await pool.query(`delete from inventory_stock where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id=$1`, [ids.vendor]);
  await pool.query(`delete from vendors where id=$1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id=$1`, [ids.mat]);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.owner, ids.mgr]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.owner, ids.mgr]]);
  await pool.query(`delete from branches where id=$1`, [ids.branch]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA VRD Branch','0','0')`, [ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,status) values($1,'QA VRD Owner','+255****0120','SUPER_ADMIN','Active')`, [ids.owner]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA VRD Mgr','+255****0121','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY}')`, [ids.mgr, ids.branch]);
  const tokenOwner = crypto.randomBytes(32).toString('hex'), tokenMgr = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenOwner), ids.owner]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenMgr), ids.mgr]);
  cookieOwner = `restaurant_session=${tokenOwner}`; cookieMgr = `restaurant_session=${tokenMgr}`;

  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA VRD Mat','kg')`, [ids.mat]);
  await pool.query(`insert into vendors(id,name,phone_e164,status) values($1,'QA VRD Vendor','+255****0122','APPROVED')`, [ids.vendor]);

  // Full flow: Indent -> submit -> approve -> PO -> receive -> quality PARTIAL (2kg of 10kg fails) -> claim auto-created.
  const indent = await req(cookieMgr, 'POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.mat, qty: '10.000' }] });
  const indentId = indent.data.indent.id;
  await req(cookieMgr, 'POST', `/api/purchase/indents/${indentId}/submit`, {});
  await req(cookieOwner, 'POST', `/api/purchase/indents/${indentId}/approve`, {});
  const po = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.mat, qty: '10.000', rate: '50.00' }] });
  const poId = po.data.purchaseOrder.id;
  await req(cookieMgr, 'POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: '' });
  const receive = await req(cookieMgr, 'POST', `/api/purchase/orders/${poId}/receive`, {});
  const grnId = receive.data.grn.id;
  const grnLineId = receive.data.lines[0].id;
  const quality = await req(cookieMgr, 'POST', `/api/purchase/grns/${grnId}/quality`, { result: 'PARTIAL', lines: [{ id: grnLineId, qtyFailed: '2.000' }], note: 'Damaged' });
  check('(setup) quality PARTIAL recorded, 2kg failed', quality.status === 200, quality.data);

  const register = await req(cookieMgr, 'POST', `/api/purchase/grns/${grnId}/returns`, {});
  check('(setup) vendor return claim registered', register.status === 200, register.data);
  const claim = register.data.returns?.[0];
  check('(setup) claim auto-created for 2.000 kg', claim?.qtyReturned === '2.000', claim);
  const claimId = claim.id;

  // (a) dispatching more than the claimed quantity is rejected
  const overDispatch = await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claimId}/dispatches`, { qtyDispatched: '3.000', reasonNote: 'Sending back to vendor' });
  check('(a) a dispatch exceeding the claimed quantity is rejected (409)', overDispatch.status === 409, overDispatch.data);

  // (b) a partial dispatch (1.2 of 2.0 kg) succeeds
  const dispatch1 = await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claimId}/dispatches`, { qtyDispatched: '1.200', reasonNote: 'First trip back to vendor' });
  check('(b) a partial dispatch succeeds (201), remainingQty 0.800', dispatch1.status === 201 && dispatch1.data.remainingQty === '0.800', dispatch1.data);
  const dispatchId1 = dispatch1.data.dispatch.id;

  // (c) a second dispatch for the remaining 0.8 succeeds (sum == claimed exactly)
  const dispatch2 = await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claimId}/dispatches`, { qtyDispatched: '0.800', reasonNote: 'Second trip, remainder' });
  check('(c) a second dispatch for exactly the remainder succeeds (201), remainingQty 0.000', dispatch2.status === 201 && dispatch2.data.remainingQty === '0.000', dispatch2.data);

  // (d) a third dispatch (now fully dispatched) is rejected
  const dispatch3 = await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claimId}/dispatches`, { qtyDispatched: '0.001', reasonNote: 'Should fail' });
  check('(d) a dispatch once fully claimed is dispatched is rejected (409)', dispatch3.status === 409, dispatch3.data);

  // (e) vendor acknowledgment of the first dispatch succeeds; a second ack on the same dispatch is rejected (once-only)
  const ack1 = await req(cookieMgr, 'POST', `/api/purchase/material-return-dispatches/${dispatchId1}/acknowledge`, {});
  check('(e) vendor acknowledgment succeeds (200)', ack1.status === 200 && !!ack1.data.dispatch.vendorAcknowledgedAt, ack1.data);
  const ackAgain = await req(cookieMgr, 'POST', `/api/purchase/material-return-dispatches/${dispatchId1}/acknowledge`, {});
  check('(e2) a second acknowledgment on the same dispatch is rejected (409, once-only)', ackAgain.status === 409, ackAgain.data);

  // (f) with the claim now fully dispatched, cancel-remaining is rejected (nothing left to cancel)
  const cancelFullyDispatched = await req(cookieOwner, 'POST', `/api/purchase/material-returns/${claimId}/cancel-remaining`, {});
  check('(f) cancel-remaining on a fully-dispatched claim is rejected (409)', cancelFullyDispatched.status === 409, cancelFullyDispatched.data);

  // --- A second claim to prove cancel-remaining on a PARTIALLY dispatched claim ---
  const indent2 = await req(cookieMgr, 'POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.mat, qty: '10.000' }] });
  const indentId2 = indent2.data.indent.id;
  await req(cookieMgr, 'POST', `/api/purchase/indents/${indentId2}/submit`, {});
  await req(cookieOwner, 'POST', `/api/purchase/indents/${indentId2}/approve`, {});
  const po2 = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId: indentId2, lines: [{ rawMaterialId: ids.mat, qty: '10.000', rate: '50.00' }] });
  const poId2 = po2.data.purchaseOrder.id;
  await req(cookieMgr, 'POST', `/api/purchase/orders/${poId2}/bill`, { pdfUrl: '' });
  const receive2 = await req(cookieMgr, 'POST', `/api/purchase/orders/${poId2}/receive`, {});
  const grnId2 = receive2.data.grn.id;
  const grnLineId2 = receive2.data.lines[0].id;
  await req(cookieMgr, 'POST', `/api/purchase/grns/${grnId2}/quality`, { result: 'PARTIAL', lines: [{ id: grnLineId2, qtyFailed: '4.000' }], note: 'Damaged' });
  const listClaims2 = await req(cookieMgr, 'GET', `/api/purchase/material-returns?branchId=${ids.branch}`, undefined);
  const claim2 = listClaims2.data.returns.find((r) => r.grnId === grnId2);
  const claimId2 = claim2.id;
  await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claimId2}/dispatches`, { qtyDispatched: '1.000', reasonNote: 'Partial dispatch' });

  // (g) a non-Owner cannot cancel the remaining undispatched quantity
  const nonOwnerCancel = await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claimId2}/cancel-remaining`, {});
  check('(g) a non-Owner cannot cancel the remaining quantity (403)', nonOwnerCancel.status === 403, nonOwnerCancel.data);

  // (h) the Owner cancels the remaining 3.0 kg
  const ownerCancel = await req(cookieOwner, 'POST', `/api/purchase/material-returns/${claimId2}/cancel-remaining`, { remainingCancelledNote: 'Vendor said discard the rest' });
  check('(h) the Owner cancels the remaining quantity (200), cancelledQty 3.000', ownerCancel.status === 200 && ownerCancel.data.cancelledQty === '3.000' && !!ownerCancel.data.return.remainingCancelledAt, ownerCancel.data);

  // (i) a further dispatch against a remaining-cancelled claim is rejected, but the already-dispatched 1.0 kg row is untouched
  const dispatchAfterCancel = await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claimId2}/dispatches`, { qtyDispatched: '0.500', reasonNote: 'Should fail' });
  check('(i) a dispatch after cancel-remaining is rejected (409)', dispatchAfterCancel.status === 409, dispatchAfterCancel.data);
  const { rows: dispatchRows } = await pool.query('select qty_dispatched from material_return_dispatches where material_return_id=$1', [claimId2]);
  check('(i2) the already-dispatched 1.000 kg row is untouched by the cancellation', dispatchRows.length === 1 && dispatchRows[0].qty_dispatched === '1.000', dispatchRows);

  // (j) cancelling an already-cancelled claim is rejected (once-only)
  const cancelAgain = await req(cookieOwner, 'POST', `/api/purchase/material-returns/${claimId2}/cancel-remaining`, {});
  check('(j) cancelling an already-cancelled claim is rejected (409, once-only)', cancelAgain.status === 409, cancelAgain.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
