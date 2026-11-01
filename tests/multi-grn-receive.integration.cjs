// GAP-005 multi-delivery: real HTTP+PostgreSQL proof that a PO can now be
// received across SEVERAL separate GRNs, that invoicing is blocked until
// the PO is fully delivered, and that the final invoice/match aggregates
// the accepted value across ALL contributing GRNs (not just one).
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_multigrn_qa_\d{8}$/);
assert.equal(process.env.MULTIGRN_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { branch: 'qa-mg-branch', manager: 'qa-mg-manager', vendor: 'qa-mg-vendor', rice: 'qa-mg-mat-rice' };
const managerToken = crypto.randomBytes(32).toString('hex');
let managerCookie;

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: BASE }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
// The invoice endpoint is multipart/form-data, not JSON (optional file upload).
async function reqInvoice(poId, fields, cookie) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await fetch(`${BASE}/api/purchase/orders/${poId}/invoice`, { method: 'POST', headers: { cookie, origin: BASE }, body: form });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from stock_movements where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from stock_batches where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from material_returns where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from three_way_match_grns where match_id in (select id from three_way_match where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from three_way_match where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_invoices where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from audit_log where entity_type = 'GRN' and entity_id in (select id from grns where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from grns where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from purchase_orders where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.rice]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.manager]);
  await pool.query(`delete from users where id = $1`, [ids.manager]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA MultiGRN Branch','QAMG','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA MG Manager','+255****0901','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY,ACCOUNTS_EXPENSES}')`, [ids.manager, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA MG Rice','kg')`, [ids.rice]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA MG Vendor','+255****0902')`, [ids.vendor]);

  const results = []; const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- Setup: indent -> approve -> PO for 100kg rice @ rate 10 ---
  const create = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.rice, qty: '100' }] }, managerCookie);
  assert.equal(create.status, 201, JSON.stringify(create.json));
  const indentId = create.json.indent.id;
  const submit = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, managerCookie);
  let status = submit.json.indent.status;
  if (status === 'PENDING_APPROVAL') { const a = await req('POST', `/api/purchase/indents/${indentId}/approve`, {}, managerCookie); status = a.json.indent.status; }
  assert.equal(status, 'APPROVED');
  const po = await req('POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.rice, qty: '100', rate: '10' }] }, managerCookie);
  assert.equal(po.status, 201, JSON.stringify(po.json));
  const poId = po.json.purchaseOrder.id;
  await req('POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: '' }, managerCookie);

  // --- (a) FIRST delivery: only 60kg arrives, real shortage this round ---
  const receive1 = await req('POST', `/api/purchase/orders/${poId}/receive`, { lines: [{ rawMaterialId: ids.rice, qtyReceived: '60' }] }, managerCookie);
  assert.equal(receive1.status, 201, JSON.stringify(receive1.json));
  check('(a) first receive returns poStatus PARTIALLY_RECEIVED', receive1.json.poStatus === 'PARTIALLY_RECEIVED', receive1.json.poStatus);
  const { rows: poRow1 } = await pool.query('select status from purchase_orders where id=$1', [poId]);
  check('(a2) PO row itself is PARTIALLY_RECEIVED in the DB', poRow1[0].status === 'PARTIALLY_RECEIVED', poRow1[0]);
  const grn1Id = receive1.json.grn.id;
  const quality1 = await req('POST', `/api/purchase/grns/${grn1Id}/quality`, { result: 'PASS', lines: receive1.json.lines.map((l) => ({ id: l.id, qtyFailed: '0' })) }, managerCookie);
  assert.equal(quality1.status, 200, JSON.stringify(quality1.json));

  // --- (b) invoicing is BLOCKED while the PO is only partially received ---
  const earlyInvoice = await reqInvoice(poId, { invoiceNumber: 'INV-EARLY', amount: '600.00' }, managerCookie);
  check('(b) invoice creation rejected (409) while PO is not yet fully received', earlyInvoice.status === 409, earlyInvoice.json);

  // --- (c) a receive attempting MORE than the remaining 40kg is rejected ---
  const overReceive = await req('POST', `/api/purchase/orders/${poId}/receive`, { lines: [{ rawMaterialId: ids.rice, qtyReceived: '41' }] }, managerCookie);
  check('(c) receiving 41kg against only 40kg remaining is rejected (400)', overReceive.status === 400, overReceive.json);

  // --- (d) SECOND (final) delivery: the remaining 40kg arrives, PO becomes fully RECEIVED ---
  const receive2 = await req('POST', `/api/purchase/orders/${poId}/receive`, {}, managerCookie); // omitted lines = full remaining (40kg)
  assert.equal(receive2.status, 201, JSON.stringify(receive2.json));
  check('(d) second receive (omitted lines = full remaining) returns poStatus RECEIVED', receive2.json.poStatus === 'RECEIVED', receive2.json.poStatus);
  check('(d2) second GRN line qtyReceived is exactly 40.000 (the remaining amount, not 100)', receive2.json.lines[0].qtyReceived === '40.000', receive2.json.lines[0]);
  const grn2Id = receive2.json.grn.id;
  // quality PARTIAL: 35 pass, 5 fail out of the 40kg this delivery
  const quality2 = await req('POST', `/api/purchase/grns/${grn2Id}/quality`, { result: 'PARTIAL', lines: receive2.json.lines.map((l) => ({ id: l.id, qtyFailed: '5' })), note: 'Bag torn, 5kg spoiled' }, managerCookie);
  assert.equal(quality2.status, 200, JSON.stringify(quality2.json));

  // --- (e) a THIRD receive attempt on a now-fully-received PO is rejected outright ---
  const thirdReceive = await req('POST', `/api/purchase/orders/${poId}/receive`, {}, managerCookie);
  check('(e) a third receive on a fully-received PO is rejected (409)', thirdReceive.status === 409, thirdReceive.json);

  // --- (f) invoicing NOW succeeds, aggregating BOTH GRNs' accepted value (60 + 35 = 95kg accepted vs 100kg ordered) ---
  const invoice = await reqInvoice(poId, { invoiceNumber: 'INV-FINAL', amount: '950.00' }, managerCookie);
  assert.equal(invoice.status, 201, JSON.stringify(invoice.json));
  check('(f) invoice succeeds once fully received; match grnAcceptedTotalInr is 950.00 (95kg x rate 10, aggregated across BOTH GRNs)', invoice.json.match.grnAcceptedTotalInr === '950.00', invoice.json.match);
  check('(f2) match is reported as matched (950 accepted == 950 invoiced, within tolerance)', invoice.json.match.matched === true, invoice.json.match);
  const { rows: joinRows } = await pool.query('select grn_id from three_way_match_grns where match_id = $1 order by grn_id', [invoice.json.match.id]);
  check('(f3) three_way_match_grns has exactly 2 rows (one per contributing GRN), matching grn1 and grn2 exactly', joinRows.length === 2 && new Set(joinRows.map((r) => r.grn_id)).size === 2 && [grn1Id, grn2Id].every((id) => joinRows.some((r) => r.grn_id === id)), joinRows);

  // --- (g) a SECOND invoice for the same (now fully-invoiced) PO is still rejected — "one invoice per PO" is UNCHANGED ---
  const secondInvoice = await reqInvoice(poId, { invoiceNumber: 'INV-DUP', amount: '1.00' }, managerCookie);
  check('(g) a second invoice attempt for the same PO is rejected (409) — one-invoice-per-PO policy preserved', secondInvoice.status === 409, secondInvoice.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
