// GAP-017 real HTTP+PostgreSQL proof. Auditable vendor payment records:
// real evidence (amount/date/method/reference/actor), full-payment-only
// enforcement, idempotent replay, and the existing APPROVED-only gate
// preserved (payment still cannot bypass the quality/3-way-mismatch lock).
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_vpay_qa_\d{8}$/);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { owner: 'qa-vpay-owner', branch: 'qa-vpay-branch', vendor: 'qa-vpay-vendor', mat: 'qa-vpay-mat' };
let cookieOwner;
async function req(method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie: cookieOwner }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}

async function cleanup() {
  await pool.query(`delete from audit_log where user_id=$1`, [ids.owner]);
  await pool.query(`delete from vendor_payments where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from three_way_match_grns where match_id in (select id from three_way_match where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from three_way_match where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from vendor_invoices where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from grns where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from purchase_orders where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id=$1`, [ids.vendor]);
  await pool.query(`delete from vendors where id=$1`, [ids.vendor]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id=$1 or raw_material_id=$2)`, [ids.branch, ids.mat]);
  await pool.query(`delete from stock_batches where branch_id=$1 or raw_material_id=$2`, [ids.branch, ids.mat]);
  await pool.query(`delete from stock_movements where branch_id=$1 or raw_material_id=$2`, [ids.branch, ids.mat]);
  await pool.query(`delete from inventory_stock where branch_id=$1 or raw_material_id=$2`, [ids.branch, ids.mat]);
  await pool.query(`delete from raw_materials where id=$1`, [ids.mat]);
  await pool.query(`delete from sessions where user_id=$1`, [ids.owner]);
  await pool.query(`delete from users where id=$1`, [ids.owner]);
  await pool.query(`delete from branches where id=$1`, [ids.branch]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA VPay Branch','0','0')`, [ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,status) values($1,'QA VPay Owner','+255****0110','SUPER_ADMIN','Active')`, [ids.owner]);
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(token), ids.owner]);
  cookieOwner = `restaurant_session=${token}`;
  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA VPay Mat','kg')`, [ids.mat]);
  await pool.query(`insert into vendors(id,name,phone_e164,status) values($1,'QA VPay Vendor','+255****0111','APPROVED')`, [ids.vendor]);

  // Full flow: Indent -> submit -> approve -> PO -> receive -> quality PASS -> invoice -> approve payment.
  const indent = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.mat, qty: '10.000' }] });
  const indentId = indent.data.indent.id;
  await req('POST', `/api/purchase/indents/${indentId}/submit`, {});
  await req('POST', `/api/purchase/indents/${indentId}/approve`, {});
  const po = await req('POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.mat, qty: '10.000', rate: '50.00' }] });
  const poId = po.data.purchaseOrder.id;
  await req('POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: '' });
  const receive = await req('POST', `/api/purchase/orders/${poId}/receive`, {});
  const grnId = receive.data.grn.id;
  const grnLineId = receive.data.lines[0].id;
  await req('POST', `/api/purchase/grns/${grnId}/quality`, { result: 'PASS', lines: [{ id: grnLineId, qtyFailed: '0' }] });
  const form = new FormData();
  form.append('invoiceNumber', 'INV-VPAY-1');
  form.append('amount', '500.00'); // 10kg * 50.00 = 500.00, matches exactly -> matched=true
  const invoiceRes = await fetch(`${BASE}/api/purchase/orders/${poId}/invoice`, { method: 'POST', headers: { cookie: cookieOwner, origin: BASE }, body: form });
  const invoiceJson = await invoiceRes.json();
  check('(setup) invoice recorded and matched', invoiceRes.status === 201 && invoiceJson.match.matched === true, invoiceJson);

  // (a) payment cannot be recorded before the 3-way match is approved
  const payBeforeApprove = await req('POST', `/api/purchase/orders/${poId}/three-way/paid`, { amountTsh: '500.00', paymentMethod: 'CASH', paidAt: '2026-11-01', idempotencyKey: 'vpay-k1' });
  check('(a) payment cannot be recorded before APPROVED (409)', payBeforeApprove.status === 409, payBeforeApprove.data);

  await req('POST', `/api/purchase/orders/${poId}/three-way/approve`, {});

  // (b) a partial-amount payment is rejected (full-payment-only rule)
  const partialPay = await req('POST', `/api/purchase/orders/${poId}/three-way/paid`, { amountTsh: '400.00', paymentMethod: 'CASH', paidAt: '2026-11-01', idempotencyKey: 'vpay-k-partial' });
  check('(b) a partial-amount payment is rejected (400, full-payment-only)', partialPay.status === 400, partialPay.data);

  // (c) the full-amount payment succeeds with real evidence
  const pay = await req('POST', `/api/purchase/orders/${poId}/three-way/paid`, { amountTsh: '500.00', paymentMethod: 'MOBILE_MONEY', referenceNumber: 'MM-TXN-001', paidAt: '2026-11-01', idempotencyKey: 'vpay-k1' });
  check('(c) the full-amount payment succeeds (201), match -> PAID', pay.status === 201 && pay.data.match.paymentStatus === 'PAID' && pay.data.payment.amountTsh === '500.00' && pay.data.payment.paymentMethod === 'MOBILE_MONEY' && pay.data.payment.referenceNumber === 'MM-TXN-001', pay.data);
  const { rows: dbRows } = await pool.query('select recorded_by_id, amount_tsh, payment_method from vendor_payments where po_id=$1', [poId]);
  check('(c2) real DB row: recordedById is the actor, exact amount/method persisted', dbRows[0]?.recorded_by_id === ids.owner && dbRows[0]?.amount_tsh === '500.00' && dbRows[0]?.payment_method === 'MOBILE_MONEY', dbRows[0]);

  // (d) the SAME idempotencyKey + SAME payload replays without creating a second row
  const payReplay = await req('POST', `/api/purchase/orders/${poId}/three-way/paid`, { amountTsh: '500.00', paymentMethod: 'MOBILE_MONEY', referenceNumber: 'MM-TXN-001', paidAt: '2026-11-01', idempotencyKey: 'vpay-k1' });
  check('(d) same key + same payload replays (200, replayed:true)', payReplay.status === 200 && payReplay.data.replayed === true, payReplay.data);
  const { rows: countAfterReplay } = await pool.query('select count(*)::int as n from vendor_payments where po_id=$1', [poId]);
  check('(d2) still exactly one vendor_payments row after the replay', countAfterReplay[0].n === 1, countAfterReplay[0]);

  // (e) the SAME idempotencyKey + a DIFFERENT payload is rejected (never silently overwrites real evidence)
  const payKeyReuse = await req('POST', `/api/purchase/orders/${poId}/three-way/paid`, { amountTsh: '500.00', paymentMethod: 'CASH', referenceNumber: 'DIFFERENT', paidAt: '2026-11-01', idempotencyKey: 'vpay-k1' });
  check('(e) same key + different payload is rejected (409)', payKeyReuse.status === 409, payKeyReuse.data);

  // (f) a DIFFERENT idempotencyKey on an already-paid match is rejected (duplicate allocation prevention)
  const payDuplicateKey = await req('POST', `/api/purchase/orders/${poId}/three-way/paid`, { amountTsh: '500.00', paymentMethod: 'CASH', paidAt: '2026-11-01', idempotencyKey: 'vpay-k2-different' });
  check('(f) a different key on an already-paid match is rejected (409, duplicate allocation)', payDuplicateKey.status === 409, payDuplicateKey.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
