// Real HTTP + Postgres integration test for PURCHASE-1..4 (this pass):
// real bill file upload (Vercel Blob skipped here -- JSON-only smoke covers
// the bill-URL back-compat path is NOT what we test; we exercise the real
// multipart upload endpoint with a tiny valid PNG), vendor-return
// settlement, vendor invoice + real 3-way match, and payment approval/paid.
// Drives the full real flow through the existing HTTP endpoints exactly as
// a real user would: Indent -> submit -> approve -> PO -> receive (GRN) ->
// Quality Check (PARTIAL) -> register vendor return -> settle -> invoice ->
// approve payment -> mark paid.
require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = 'http://localhost:3000';
const ORIGIN = 'http://localhost:3000';
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { branch: 'qa-p1-branch', owner: 'qa-p1-owner', accounts: 'qa-p1-accounts', vendor: 'qa-p1-vendor', rice: 'qa-p1-rice' };
const ownerToken = crypto.randomBytes(32).toString('hex');
const accountsToken = crypto.randomBytes(32).toString('hex');

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: bodyObj ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
// 1x1 transparent PNG, valid signature + decodable by sharp.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function upload(path, fieldName, cookie) {
  const form = new FormData();
  form.append(fieldName, new Blob([TINY_PNG], { type: 'image/png' }), 'test.png');
  const res = await fetch(BASE + path, { method: 'POST', headers: { cookie, origin: ORIGIN }, body: form });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from audit_log where user_id in ($1,$2)`, [ids.owner, ids.accounts]);
  await pool.query(`delete from three_way_match where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_invoices where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from material_returns where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from grns where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from purchase_orders where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.rice]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from sessions where user_id in ($1,$2)`, [ids.owner, ids.accounts]);
  await pool.query(`delete from users where id in ($1,$2)`, [ids.owner, ids.accounts]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA Purchase-1 Branch','QAP1',0,0)`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Owner','+255000000777','SUPER_ADMIN',NULL,'Active','{}')`, [ids.owner]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(ownerToken), ids.owner]);
  const ownerCookie = `restaurant_session=${ownerToken}`;
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Accounts','+255000000778','ACCOUNTANT',$2,'Active','{ACCOUNTS_EXPENSES}')`, [ids.accounts, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(accountsToken), ids.accounts]);
  const accountsCookie = `restaurant_session=${accountsToken}`;

  await pool.query(`insert into vendors (id, name, phone_e164, email, tin) values ($1,'QA Vendor','+255000000779','v@qa.test','')`, [ids.vendor]);
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA Purchase-1 Rice','kg')`, [ids.rice]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // Indent -> submit -> approve (no rolling-average history -> PENDING_APPROVAL fail-safe path, which is fine; Owner approves anyway).
  const indent = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.rice, qty: '10.000' }] }, ownerCookie);
  check('indent create 201', indent.status === 201, indent.json);
  const indentId = indent.json?.indent?.id;
  const submit = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, ownerCookie);
  check('indent submit 200', submit.status === 200, submit.json);
  const approve = await req('POST', `/api/purchase/indents/${indentId}/approve`, {}, ownerCookie);
  check('indent approve 200 (Owner bypasses PURCHASE_INDENT grant check)', approve.status === 200 && approve.json?.indent?.status === 'APPROVED', approve.json);

  // Purchase Order against the approved indent, rate 50.00/kg -> PO total 500.00.
  const po = await req('POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.rice, qty: '10.000', rate: '50.00' }] }, ownerCookie);
  check('PO create 201', po.status === 201, po.json);
  const poId = po.json?.purchaseOrder?.id;

  // Real bill file upload (multipart, Vercel Blob).
  const billUpload = await upload(`/api/purchase/orders/${poId}/bill/upload`, 'bill', ownerCookie);
  check('bill upload 201', billUpload.status === 201, billUpload.json);
  check('bill billUploadedAt set, billBlobPathname non-empty', !!billUpload.json?.purchaseOrder?.billUploadedAt && !!billUpload.json?.purchaseOrder?.billBlobPathname, billUpload.json?.purchaseOrder);

  // Receive material -> GRN created.
  const receive = await req('POST', `/api/purchase/orders/${poId}/receive`, {}, ownerCookie);
  check('receive 201', receive.status === 201, receive.json);
  const grnId = receive.json?.grn?.id;
  const grnLineId = receive.json?.lines?.[0]?.id;
  check('GRN line id present', !!grnLineId, receive.json?.lines);

  // Quality Check: PARTIAL, 2.000 kg failed out of 10.000 received -> 8.000 accepted * 50.00 = 400.00 GRN accepted value.
  const quality = await req('POST', `/api/purchase/grns/${grnId}/quality`, { result: 'PARTIAL', lines: [{ id: grnLineId, qtyFailed: '2.000' }], note: 'Damaged on arrival' }, ownerCookie);
  check('quality PARTIAL 200', quality.status === 200, quality.json);

  // Vendor return claim auto-queued by the quality decision -> register it, then settle it.
  const returns = await req('POST', `/api/purchase/grns/${grnId}/returns`, {}, ownerCookie);
  check('vendor return register 200', returns.status === 200, returns.json);
  const claim = returns.json?.returns?.[0];
  check('claim expected refund 100.00 (2.000kg * 50.00)', claim?.refundAmountInr === '100.00', claim);
  check('claim moneyReceived false before settlement', claim?.moneyReceived === false, claim);

  const settle = await req('POST', `/api/purchase/material-returns/${claim?.id}/settle`, { settledAmountInr: '100.00', settledNote: 'Credit note CN-001' }, accountsCookie);
  check('settle 200 (ACCOUNTS_EXPENSES grant)', settle.status === 200, settle.json);
  check('settle persisted settledAmountInr 100.00 + settledAt set', settle.json?.return?.settledAmountInr === '100.00' && !!settle.json?.return?.settledAt, settle.json?.return);
  const settleAgain = await req('POST', `/api/purchase/material-returns/${claim?.id}/settle`, { settledAmountInr: '100.00' }, accountsCookie);
  check('settle twice -> 409 (once-only gate)', settleAgain.status === 409, settleAgain.json);
  const dbReturn = await pool.query(`select settled_amount_inr, settled_at, settled_by_id from material_returns where id = $1`, [claim?.id]);
  check('real DB: settlement persisted', dbReturn.rows[0]?.settled_amount_inr === '100.00' && !!dbReturn.rows[0]?.settled_at && dbReturn.rows[0]?.settled_by_id === ids.accounts, dbReturn.rows[0]);

  // Vendor invoice: vendor correctly invoiced only the accepted value (400.00) -> should match exactly.
  async function postInvoice(fields, cookie) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await fetch(`${BASE}/api/purchase/orders/${poId}/invoice`, { method: 'POST', headers: { cookie, origin: ORIGIN }, body: form });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  }
  const invoiceCreate = await postInvoice({ invoiceNumber: 'INV-QAP1-1', amount: '400.00' }, ownerCookie);
  check('invoice create 201 (matches PO/GRN exactly)', invoiceCreate.status === 201, invoiceCreate.json);
  check('invoice match.matched true', invoiceCreate.json?.match?.matched === true, invoiceCreate.json?.match);
  check('invoice poTotalInr 500.00 (informational), grnAcceptedTotalInr 400.00, invoiceAdjustedTotalInr 400.00', invoiceCreate.json?.match?.poTotalInr === '500.00' && invoiceCreate.json?.match?.grnAcceptedTotalInr === '400.00' && invoiceCreate.json?.match?.invoiceAdjustedTotalInr === '400.00', invoiceCreate.json?.match);
  check('invoice paymentStatus PENDING (matched)', invoiceCreate.json?.match?.paymentStatus === 'PENDING', invoiceCreate.json?.match);

  const invoiceAgain = await postInvoice({ invoiceNumber: 'INV-QAP1-2', amount: '1.00' }, ownerCookie);
  check('second invoice for same PO -> 409 (one invoice per PO)', invoiceAgain.status === 409, invoiceAgain.json);

  // Payment approval requires ACCOUNTS_EXPENSES (Owner would also pass; test the Accounts grant path).
  const approvePayment = await req('POST', `/api/purchase/orders/${poId}/three-way/approve`, {}, accountsCookie);
  check('approve payment 200', approvePayment.status === 200 && approvePayment.json?.match?.paymentStatus === 'APPROVED', approvePayment.json);
  const approveTwice = await req('POST', `/api/purchase/orders/${poId}/three-way/approve`, {}, accountsCookie);
  check('approve twice -> 409 (once-only)', approveTwice.status === 409, approveTwice.json);

  const markPaid = await req('POST', `/api/purchase/orders/${poId}/three-way/paid`, {}, accountsCookie);
  check('mark paid 200', markPaid.status === 200 && markPaid.json?.match?.paymentStatus === 'PAID', markPaid.json);
  const dbMatch = await pool.query(`select payment_status, approved_by_id, paid_by_id from three_way_match where po_id = $1`, [poId]);
  check('real DB: PAID, approved_by_id and paid_by_id are the Accounts user', dbMatch.rows[0]?.payment_status === 'PAID' && dbMatch.rows[0]?.approved_by_id === ids.accounts && dbMatch.rows[0]?.paid_by_id === ids.accounts, dbMatch.rows[0]);

  await cleanup();
  await pool.end();

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.label}` + (r.pass ? '' : ` :: ${JSON.stringify(r.extra)}`));
  console.log(`RESULT ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch(async (err) => { console.error(err); try { await cleanup(); await pool.end(); } catch {} process.exit(1); });
