// GAP-019 real HTTP+PostgreSQL proof. Numbered debit notes, 1:1 with a
// materialReturns claim (GRN quality FAIL/PARTIAL), tax treatment
// deliberately deferred, ACCOUNTS_EXPENSES/Owner-only issue+cancel,
// permanent sequential numbering (never reused even after cancellation),
// at most one ACTIVE debit note per claim at a time.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_dn_qa_\d{8}$/);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { owner: 'qa-dn-owner', mgr: 'qa-dn-mgr', accounts: 'qa-dn-accounts', branch: 'qa-dn-branch', vendor: 'qa-dn-vendor', mat: 'qa-dn-mat' };
let cookieOwner, cookieMgr, cookieAccounts;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}

async function cleanup() {
  await pool.query(`delete from audit_log where user_id=any($1)`, [[ids.owner, ids.mgr, ids.accounts]]);
  await pool.query(`delete from debit_notes where branch_id=$1`, [ids.branch]);
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
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.owner, ids.mgr, ids.accounts]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.owner, ids.mgr, ids.accounts]]);
  await pool.query(`delete from branches where id=$1`, [ids.branch]);
}

async function makeClaim(suffix, qtyFailed, rate) {
  const indent = await req(cookieMgr, 'POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.mat, qty: '10.000' }] });
  const indentId = indent.data.indent.id;
  await req(cookieMgr, 'POST', `/api/purchase/indents/${indentId}/submit`, {});
  await req(cookieOwner, 'POST', `/api/purchase/indents/${indentId}/approve`, {});
  const po = await req(cookieMgr, 'POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.mat, qty: '10.000', rate }] });
  const poId = po.data.purchaseOrder.id;
  await req(cookieMgr, 'POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: '' });
  const receive = await req(cookieMgr, 'POST', `/api/purchase/orders/${poId}/receive`, {});
  const grnId = receive.data.grn.id;
  const grnLineId = receive.data.lines[0].id;
  await req(cookieMgr, 'POST', `/api/purchase/grns/${grnId}/quality`, { result: 'PARTIAL', lines: [{ id: grnLineId, qtyFailed }], note: `Damaged ${suffix}` });
  const register = await req(cookieMgr, 'POST', `/api/purchase/grns/${grnId}/returns`, {});
  return register.data.returns[0];
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA DN Branch','0','0')`, [ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,status) values($1,'QA DN Owner','+255****0130','SUPER_ADMIN','Active')`, [ids.owner]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA DN Mgr','+255****0131','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY}')`, [ids.mgr, ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA DN Accounts','+255****0132','ACCOUNTANT',$2,'Active','{ACCOUNTS_EXPENSES}')`, [ids.accounts, ids.branch]);
  const tokenOwner = crypto.randomBytes(32).toString('hex'), tokenMgr = crypto.randomBytes(32).toString('hex'), tokenAccounts = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenOwner), ids.owner]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenMgr), ids.mgr]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenAccounts), ids.accounts]);
  cookieOwner = `restaurant_session=${tokenOwner}`; cookieMgr = `restaurant_session=${tokenMgr}`; cookieAccounts = `restaurant_session=${tokenAccounts}`;

  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA DN Mat','kg')`, [ids.mat]);
  await pool.query(`insert into vendors(id,name,phone_e164,status) values($1,'QA DN Vendor','+255****0133','APPROVED')`, [ids.vendor]);

  const claim1 = await makeClaim('c1', '2.000', '50.00'); // refundAmountInr = 100.00
  const claim2 = await makeClaim('c2', '3.000', '50.00'); // refundAmountInr = 150.00

  // (a) a non-Accounts/non-Owner actor cannot issue a debit note
  const unauthorized = await req(cookieMgr, 'POST', `/api/purchase/material-returns/${claim1.id}/debit-notes`, { reasonNote: 'Should fail' });
  check('(a) a branch-manager without ACCOUNTS_EXPENSES cannot issue a debit note (403)', unauthorized.status === 403, unauthorized.data);

  // (b) Accounts issues a debit note; number is DN-###### and amount matches the claim's refundAmountInr exactly, tax field absent
  const issue1 = await req(cookieAccounts, 'POST', `/api/purchase/material-returns/${claim1.id}/debit-notes`, { reasonNote: 'Damaged on arrival' });
  check('(b) debit note issued (201), amount matches claim exactly, no tax field', issue1.status === 201 && issue1.data.debitNote.amountTsh === '100.00' && /^DN-\d{6}$/.test(issue1.data.debitNote.debitNoteNumber) && !('vatAmount' in issue1.data.debitNote) && !('taxRate' in issue1.data.debitNote), issue1.data);
  const noteId1 = issue1.data.debitNote.id, number1 = issue1.data.debitNote.debitNoteNumber;

  // (c) a second debit note against the SAME still-active claim is rejected (no double-issuance)
  const dupeIssue = await req(cookieAccounts, 'POST', `/api/purchase/material-returns/${claim1.id}/debit-notes`, { reasonNote: 'Should fail, already has an active one' });
  check('(c) issuing a second debit note while one is active is rejected (409)', dupeIssue.status === 409, dupeIssue.data);

  // (d) a non-Owner/non-Accounts actor cannot cancel
  const unauthorizedCancel = await req(cookieMgr, 'POST', `/api/purchase/debit-notes/${noteId1}/cancel`, {});
  check('(d) a branch-manager cannot cancel a debit note (403)', unauthorizedCancel.status === 403, unauthorizedCancel.data);

  // (e) Owner cancels it; cancelling again is rejected (once-only)
  const cancel1 = await req(cookieOwner, 'POST', `/api/purchase/debit-notes/${noteId1}/cancel`, { cancelledNote: 'Reissuing with corrected reason' });
  check('(e) Owner cancels the debit note (200)', cancel1.status === 200 && !!cancel1.data.debitNote.cancelledAt, cancel1.data);
  const cancelAgain = await req(cookieOwner, 'POST', `/api/purchase/debit-notes/${noteId1}/cancel`, {});
  check('(e2) cancelling an already-cancelled debit note is rejected (409, once-only)', cancelAgain.status === 409, cancelAgain.data);

  // (f) the claim now has NO active debit note -> a fresh one can be issued, with a DIFFERENT (never-reused) number
  const issue2 = await req(cookieAccounts, 'POST', `/api/purchase/material-returns/${claim1.id}/debit-notes`, { reasonNote: 'Reissued with corrected reason' });
  check('(f) a fresh debit note can be issued after cancellation (201), with a different number than the cancelled one', issue2.status === 201 && issue2.data.debitNote.debitNoteNumber !== number1, issue2.data);

  // (g) real-DB proof: the cancelled note's number is untouched/still present exactly as issued (permanent identity)
  const { rows: cancelledRows } = await pool.query('select debit_note_number, cancelled_at from debit_notes where id=$1', [noteId1]);
  check('(g) the cancelled debit note keeps its original number permanently', cancelledRows[0]?.debit_note_number === number1 && cancelledRows[0]?.cancelled_at !== null, cancelledRows);

  // (h) a second claim gets its own debit note with a sequentially-advancing number, exactly its own claim's refund amount
  const issue3 = await req(cookieAccounts, 'POST', `/api/purchase/material-returns/${claim2.id}/debit-notes`, { reasonNote: 'Damaged on arrival, batch 2' });
  check('(h) a second claim gets its own debit note, amount 150.00', issue3.status === 201 && issue3.data.debitNote.amountTsh === '150.00', issue3.data);

  // (i) numbers across all three issued notes are all distinct (no collision under sequence reuse)
  const allNumbers = [issue1.data.debitNote.debitNoteNumber, issue2.data.debitNote.debitNoteNumber, issue3.data.debitNote.debitNoteNumber];
  check('(i) all issued debit note numbers are distinct', new Set(allNumbers).size === 3, allNumbers);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
