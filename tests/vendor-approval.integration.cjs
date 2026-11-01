// GAP-015 real HTTP+PostgreSQL proof. Approved vendor onboarding and
// enforcement — a DRAFT/SUSPENDED vendor is rejected inside the SAME
// locked transaction that would create a Purchase Order (never a separate
// pre-check a race could slip through); Owner-only approve/suspend;
// optional single branch/category scope restriction; historical POs keep
// their own vendorId regardless of later status changes.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_vendor_qa_\d{8}$/);
assert.equal(process.env.VENDOR_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  owner: 'qa-vendor-owner', mgr: 'qa-vendor-mgr',
  branchA: 'qa-vendor-brancha', branchB: 'qa-vendor-branchb',
  mat: 'qa-vendor-mat',
  vDraft: 'qa-vendor-draft', vApproved: 'qa-vendor-approved', vBranchScoped: 'qa-vendor-branchscoped', vCategoryScoped: 'qa-vendor-catscoped', vSuspended: 'qa-vendor-suspended',
};
let cookieOwner, cookieMgr;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}

async function cleanup() {
  const vendorIds = [ids.vDraft, ids.vApproved, ids.vBranchScoped, ids.vCategoryScoped, ids.vSuspended];
  const branchIds = [ids.branchA, ids.branchB];
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where vendor_id=any($1))`, [vendorIds]);
  await pool.query(`delete from purchase_orders where vendor_id=any($1)`, [vendorIds]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where raised_by_id=$1)`, [ids.owner]);
  await pool.query(`delete from indents where raised_by_id=$1`, [ids.owner]);
  await pool.query(`delete from vendor_review_events where vendor_id=any($1)`, [vendorIds]);
  await pool.query(`delete from vendor_rates where vendor_id=any($1)`, [vendorIds]);
  await pool.query(`delete from vendors where id=any($1)`, [vendorIds]);
  await pool.query(`delete from inventory_stock where branch_id=any($1)`, [branchIds]);
  await pool.query(`delete from raw_materials where id=$1`, [ids.mat]);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.owner, ids.mgr]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.owner, ids.mgr]]);
  await pool.query(`delete from branches where id=any($1)`, [branchIds]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Vendor Branch A','0','0')`, [ids.branchA]);
  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Vendor Branch B','0','0')`, [ids.branchB]);
  await pool.query(`insert into users(id,name,phone_e164,role,status) values($1,'QA Vendor Owner','+255****0070','SUPER_ADMIN','Active')`, [ids.owner]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Vendor Mgr','+255****0071','BRANCH_MANAGER',$2,'Active','{PURCHASE_ORDER}')`, [ids.mgr, ids.branchA]);
  const tokenOwner = crypto.randomBytes(32).toString('hex'), tokenMgr = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenOwner), ids.owner]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenMgr), ids.mgr]);
  cookieOwner = `restaurant_session=${tokenOwner}`; cookieMgr = `restaurant_session=${tokenMgr}`;

  await pool.query(`insert into raw_materials(id,name,unit,category) values($1,'QA Vendor Mat','kg','Vegetables')`, [ids.mat]);
  await pool.query(`insert into vendors(id,name,phone_e164) values($1,'QA Vendor Draft','+255****0080')`, [ids.vDraft]);
  await pool.query(`insert into vendors(id,name,phone_e164) values($1,'QA Vendor Approved','+255****0081')`, [ids.vApproved]);
  await pool.query(`insert into vendors(id,name,phone_e164) values($1,'QA Vendor BranchScoped','+255****0082')`, [ids.vBranchScoped]);
  await pool.query(`insert into vendors(id,name,phone_e164) values($1,'QA Vendor CatScoped','+255****0083')`, [ids.vCategoryScoped]);
  await pool.query(`insert into vendors(id,name,phone_e164) values($1,'QA Vendor Suspended','+255****0084')`, [ids.vSuspended]);

  // (a) a freshly created (DRAFT) vendor cannot be used for a general PO
  const draftPo = await req(cookieOwner, 'POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vDraft, isGeneralPurchase: true, lines: [{ itemDescription: 'Misc', qty: '1.000', rate: '1000.00' }] });
  check('(a) a DRAFT vendor cannot be used on a new general PO (409)', draftPo.status === 409, draftPo.data);

  // (b) a non-Owner cannot approve a vendor
  const nonOwnerApprove = await req(cookieMgr, 'POST', `/api/purchase/vendors/${ids.vApproved}/approve`, { branchId: null, category: null });
  check('(b) a non-Owner cannot approve a vendor (403)', nonOwnerApprove.status === 403, nonOwnerApprove.data);

  // (c) Owner approves a vendor unrestricted
  const approveUnrestricted = await req(cookieOwner, 'POST', `/api/purchase/vendors/${ids.vApproved}/approve`, { branchId: null, category: null, reason: 'QA trusted vendor' });
  check('(c) Owner approves a vendor unrestricted (200)', approveUnrestricted.status === 200 && approveUnrestricted.data.vendor.status === 'APPROVED', approveUnrestricted.data);

  // (d) the now-APPROVED unrestricted vendor can be used for a general PO
  const generalPo = await req(cookieOwner, 'POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vApproved, isGeneralPurchase: true, lines: [{ itemDescription: 'Misc', qty: '1.000', rate: '1000.00' }] });
  check('(d) an unrestricted APPROVED vendor succeeds on a general PO (201)', generalPo.status === 201, generalPo.data);

  // (e) Owner approves a vendor restricted to branch B only
  const approveBranchScoped = await req(cookieOwner, 'POST', `/api/purchase/vendors/${ids.vBranchScoped}/approve`, { branchId: ids.branchB, category: null });
  check('(e) Owner approves a vendor restricted to one branch (200)', approveBranchScoped.status === 200 && approveBranchScoped.data.vendor.approvedBranchId === ids.branchB, approveBranchScoped.data);

  // (f) that branch-restricted vendor is rejected for a PO at branch A
  const branchMismatchPo = await req(cookieOwner, 'POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vBranchScoped, isGeneralPurchase: true, lines: [{ itemDescription: 'Misc', qty: '1.000', rate: '1000.00' }] });
  check('(f) a branch-restricted vendor is rejected for a PO at a different branch (409)', branchMismatchPo.status === 409, branchMismatchPo.data);

  // (g) Owner approves a vendor restricted to category "Vegetables" only
  const approveCategoryScoped = await req(cookieOwner, 'POST', `/api/purchase/vendors/${ids.vCategoryScoped}/approve`, { branchId: null, category: 'Vegetables' });
  check('(g) Owner approves a vendor restricted to one category (200)', approveCategoryScoped.status === 200 && approveCategoryScoped.data.vendor.approvedCategory === 'Vegetables', approveCategoryScoped.data);

  // (h) that category-restricted vendor succeeds on a raw-material PO whose category matches (via an APPROVED indent)
  const indentRes = await req(cookieOwner, 'POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.mat, qty: '5.000' }] });
  check('(h-setup) indent raised', indentRes.status === 201, indentRes.data);
  const indentId = indentRes.data.indent.id;
  await req(cookieOwner, 'POST', `/api/purchase/indents/${indentId}/submit`, {});
  await req(cookieOwner, 'POST', `/api/purchase/indents/${indentId}/approve`, {});
  const matchedCategoryPo = await req(cookieOwner, 'POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vCategoryScoped, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.mat, qty: '5.000', rate: '1200.00' }] });
  check('(h) a category-restricted vendor succeeds on a PO matching that category (201)', matchedCategoryPo.status === 201, matchedCategoryPo.data);

  // (i) a general PO (no raw-material category at all) is unaffected by the category restriction on a DIFFERENT vendor — proving category-check only applies when categories exist
  const generalPoOnCategoryVendor = await req(cookieOwner, 'POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vCategoryScoped, isGeneralPurchase: true, lines: [{ itemDescription: 'Misc', qty: '1.000', rate: '500.00' }] });
  check('(i) a general purchase (no category) succeeds even for a category-restricted vendor', generalPoOnCategoryVendor.status === 201, generalPoOnCategoryVendor.data);

  // (j) Owner approves then suspends a vendor; the suspended vendor is immediately rejected for a NEW PO, but a prior PO created while it was approved keeps its vendorId unchanged
  await req(cookieOwner, 'POST', `/api/purchase/vendors/${ids.vSuspended}/approve`, { branchId: null, category: null });
  const poBeforeSuspend = await req(cookieOwner, 'POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vSuspended, isGeneralPurchase: true, lines: [{ itemDescription: 'Misc', qty: '1.000', rate: '800.00' }] });
  check('(j-setup) a PO is created while the vendor is still approved', poBeforeSuspend.status === 201, poBeforeSuspend.data);
  const poId = poBeforeSuspend.data.purchaseOrder.id;
  const suspend = await req(cookieOwner, 'POST', `/api/purchase/vendors/${ids.vSuspended}/suspend`, { reason: 'QA found a quality issue' });
  check('(j) Owner suspends the vendor (200)', suspend.status === 200 && suspend.data.vendor.status === 'SUSPENDED', suspend.data);
  const poAfterSuspend = await req(cookieOwner, 'POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vSuspended, isGeneralPurchase: true, lines: [{ itemDescription: 'Misc', qty: '1.000', rate: '800.00' }] });
  check('(j2) a NEW PO against the now-SUSPENDED vendor is rejected (409)', poAfterSuspend.status === 409, poAfterSuspend.data);
  const { rows: poRows } = await pool.query('select vendor_id from purchase_orders where id=$1', [poId]);
  check('(j3) the PO created BEFORE suspension still shows the same vendorId, untouched by the later suspension', poRows[0]?.vendor_id === ids.vSuspended, poRows[0]);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
