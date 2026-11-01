// GAP-016 real HTTP+PostgreSQL proof. Mandatory HO approval: closing the
// general-purchase bypass of the Owner's value-threshold policy, and
// making HO approval Owner-only (self/unauthorized approval prevention).
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_hoqa_\d{8}$/);
assert.equal(process.env.HO_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { owner: 'qa-ho-owner', mgr: 'qa-ho-mgr', branch: 'qa-ho-branch', vendor: 'qa-ho-vendor', mat: 'qa-ho-mat' };
let cookieOwner, cookieMgr;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}

async function cleanup() {
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from purchase_orders where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from general_purchase_requests where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id=$1`, [ids.vendor]);
  await pool.query(`delete from vendors where id=$1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id=$1`, [ids.mat]);
  await pool.query(`delete from settings where key='indentValueThresholdTsh'`);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.owner, ids.mgr]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.owner, ids.mgr]]);
  await pool.query(`delete from branches where id=$1`, [ids.branch]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA HO Branch','0','0')`, [ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,status) values($1,'QA HO Owner','+255****0090','SUPER_ADMIN','Active')`, [ids.owner]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA HO Mgr','+255****0091','BRANCH_MANAGER',$2,'Active','{PURCHASE_ORDER,PURCHASE_INDENT}')`, [ids.mgr, ids.branch]);
  const tokenOwner = crypto.randomBytes(32).toString('hex'), tokenMgr = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenOwner), ids.owner]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenMgr), ids.mgr]);
  cookieOwner = `restaurant_session=${tokenOwner}`; cookieMgr = `restaurant_session=${tokenMgr}`;

  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA HO Mat','kg')`, [ids.mat]);
  await pool.query(`insert into vendors(id,name,phone_e164,status) values($1,'QA HO Vendor','+255****0092','APPROVED')`, [ids.vendor]);

  // Set a TSh 5000 value threshold.
  const setThreshold = await req(cookieOwner, 'POST', '/api/admin/settings/business-policy', { indentValueThresholdTsh: '5000.00' });
  check('(setup) Owner sets a TSh 5000 value threshold', setThreshold.status === 200, setThreshold.data);

  // (a) a general purchase BELOW the threshold succeeds directly, no request needed.
  const belowPo = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ itemDescription: 'Small item', qty: '1.000', rate: '1000.00' }] });
  check('(a) a below-threshold general purchase succeeds directly (201)', belowPo.status === 201, belowPo.data);

  // (b) a general purchase AT/ABOVE the threshold, with NO request id, is rejected (closing the bypass)
  const abovePoNoRequest = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ itemDescription: 'Big item', qty: '1.000', rate: '9000.00' }] });
  check('(b) an at/above-threshold general purchase with no approval request is rejected (400/409)', abovePoNoRequest.status === 400 || abovePoNoRequest.status === 409, abovePoNoRequest.data);

  // (c) submitting that same purchase for review creates a PENDING_APPROVAL request (gated=true)
  const submitRequest = await req(cookieMgr, 'POST', '/api/purchase/general-purchase-requests', { branchId: ids.branch, vendorId: ids.vendor, lines: [{ itemDescription: 'Big item', qty: '1.000', rate: '9000.00' }] });
  check('(c) submitting an at/above-threshold general purchase creates a PENDING_APPROVAL request', submitRequest.status === 201 && submitRequest.data.gated === true && submitRequest.data.request.status === 'PENDING_APPROVAL', submitRequest.data);
  const requestId = submitRequest.data.request.id;

  // (d) a non-Owner cannot approve the request (self/unauthorized approval prevention)
  const nonOwnerApprove = await req(cookieMgr, 'POST', `/api/purchase/general-purchase-requests/${requestId}/approve`, {});
  check('(d) a non-Owner (the same branch actor who submitted it) cannot approve (403)', nonOwnerApprove.status === 403, nonOwnerApprove.data);

  // (e) a PO still cannot be created while the request is only PENDING_APPROVAL
  const poWhilePending = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ itemDescription: 'Big item', qty: '1.000', rate: '9000.00' }], generalPurchaseRequestId: requestId });
  check('(e) a PO cannot be created while the request is still PENDING_APPROVAL (409)', poWhilePending.status === 409, poWhilePending.data);

  // (f) the Owner approves it
  const approve = await req(cookieOwner, 'POST', `/api/purchase/general-purchase-requests/${requestId}/approve`, {});
  check('(f) the Owner approves the request (200)', approve.status === 200 && approve.data.request.status === 'APPROVED', approve.data);

  // (g) the matching PO can now be created referencing the approved request
  const poAfterApproval = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ itemDescription: 'Big item', qty: '1.000', rate: '9000.00' }], generalPurchaseRequestId: requestId });
  check('(g) the matching PO is created once the request is APPROVED (201)', poAfterApproval.status === 201, poAfterApproval.data);

  // (h) the SAME approved request cannot be reused for a second PO (one-time consumption)
  const poReuse = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ itemDescription: 'Big item', qty: '1.000', rate: '9000.00' }], generalPurchaseRequestId: requestId });
  check('(h) the same request cannot authorize a second PO (409, one-time use)', poReuse.status === 409, poReuse.data);

  // (i) a request's lines must exactly match the PO's lines/value (no bait-and-switch after approval)
  const submitRequest2 = await req(cookieMgr, 'POST', '/api/purchase/general-purchase-requests', { branchId: ids.branch, vendorId: ids.vendor, lines: [{ itemDescription: 'Another big item', qty: '1.000', rate: '9500.00' }] });
  const requestId2 = submitRequest2.data.request.id;
  await req(cookieOwner, 'POST', `/api/purchase/general-purchase-requests/${requestId2}/approve`, {});
  const poMismatched = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ itemDescription: 'Another big item', qty: '1.000', rate: '9999.00' }], generalPurchaseRequestId: requestId2 });
  check('(i) a PO whose lines/value no longer match the approved request is rejected (409)', poMismatched.status === 409, poMismatched.data);

  // --- Indent-approval self/unauthorized-approval prevention ---
  const indentRes = await req(cookieMgr, 'POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.mat, qty: '1000.000' }] });
  check('(j-setup) indent raised', indentRes.status === 201, indentRes.data);
  const indentId = indentRes.data.indent.id;
  const submitIndent = await req(cookieMgr, 'POST', `/api/purchase/indents/${indentId}/submit`, {});
  check('(j-setup) indent submitted, routed to PENDING_APPROVAL (no rolling-average history exists yet -> fail-safe pending)', submitIndent.status === 200 && submitIndent.data.indent.status === 'PENDING_APPROVAL', submitIndent.data);

  // (k) a non-Owner (even the branch manager who raised it) cannot approve this PENDING_APPROVAL indent
  const nonOwnerIndentApprove = await req(cookieMgr, 'POST', `/api/purchase/indents/${indentId}/approve`, {});
  check('(k) a non-Owner cannot approve a PENDING_APPROVAL indent (403)', nonOwnerIndentApprove.status === 403, nonOwnerIndentApprove.data);

  // (l) the Owner can approve it
  const ownerIndentApprove = await req(cookieOwner, 'POST', `/api/purchase/indents/${indentId}/approve`, {});
  check('(l) the Owner can approve a PENDING_APPROVAL indent (200)', ownerIndentApprove.status === 200 && ownerIndentApprove.data.indent.status === 'APPROVED', ownerIndentApprove.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
