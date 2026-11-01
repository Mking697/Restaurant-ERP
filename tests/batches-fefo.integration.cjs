// GAP-006 real HTTP+PostgreSQL proof. Scenario straight from gaps.md's own
// blueprint: aggregate stock may say enough is on hand, but if most of it
// is sitting in an EXPIRED lot, real consumption must be blocked anyway
// (hard-block policy, FEFO allocation order, Owner-approved via clarify).
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_batches_qa_\d{8}$/);
assert.equal(process.env.BATCHES_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const id = () => crypto.randomUUID();

const ids = {
  branchA: 'qa-b6-brancha', branchB: 'qa-b6-branchb', manager: 'qa-b6-manager',
  vendor: 'qa-b6-vendor', flour: 'qa-b6-mat-flour', dish: 'qa-b6-dish',
  po: 'qa-b6-po', grn1: 'qa-b6-grn1', grn1line: 'qa-b6-grn1line',
  grn2: 'qa-b6-grn2', grn2line: 'qa-b6-grn2line',
  toWarehouse: 'qa-b6-warehouse-b', transfer: 'qa-b6-transfer',
};
const managerToken = crypto.randomBytes(32).toString('hex');
let managerCookie;

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: BASE }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from stock_movements where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from stock_batches where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from stock_transfers where id = $1`, [ids.transfer]);
  await pool.query(`delete from inventory_stock where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from warehouses where id = $1`, [ids.toWarehouse]);
  await pool.query(`delete from material_returns where branch_id = $1`, [ids.branchA]);
  await pool.query(`delete from wastage_logs where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from night_variance_entries where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from audit_log where entity_type = 'GRN' and entity_id in (select id from grns where branch_id = $1)`, [ids.branchA]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id = $1)`, [ids.branchA]);
  await pool.query(`delete from grns where branch_id = $1`, [ids.branchA]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id = $1)`, [ids.branchA]);
  await pool.query(`delete from purchase_orders where branch_id = $1`, [ids.branchA]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id = $1)`, [ids.branchA]);
  await pool.query(`delete from indents where branch_id = $1`, [ids.branchA]);
  await pool.query(`delete from bom_recipes where branch_id = $1`, [ids.branchA]);
  await pool.query(`delete from semi_fg_productions where branch_id = $1`, [ids.branchA]);
  await pool.query(`delete from semi_fg_stock where branch_id = $1`, [ids.branchA]);
  await pool.query(`delete from menu_items where id = $1`, [ids.dish]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.flour]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.manager]);
  await pool.query(`delete from users where id = $1`, [ids.manager]);
  await pool.query(`delete from branches where id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from settings where key = 'NEAR_EXPIRY_WARNING_DAYS'`);
}
async function qtyOnHand(branchId, rawMaterialId) {
  const { rows } = await pool.query(`select qty_on_hand from inventory_stock where branch_id = $1 and raw_material_id = $2`, [branchId, rawMaterialId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}
async function batchesFor(branchId, rawMaterialId) {
  return (await pool.query(`select id, qty_remaining, to_char(expiry_date,'YYYY-MM-DD') as expiry_date from stock_batches where branch_id = $1 and raw_material_id = $2 order by expiry_date asc nulls last, id`, [branchId, rawMaterialId])).rows;
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA B6 Branch A','QAB6A','0','0'),($2,'QA B6 Branch B','QAB6B','0','0')`, [ids.branchA, ids.branchB]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA B6 Manager','+255****2001','SUPER_ADMIN',null,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY,MENU_BOM}')`, [ids.manager]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA B6 Flour','kg')`, [ids.flour]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA B6 Vendor','+255****2002')`, [ids.vendor]);
  await pool.query(`insert into vendor_rates (id, vendor_id, raw_material_id, rate, locked_by_user_id) values ($1,$2,$3,'10.00',$4)`, [id(), ids.vendor, ids.flour, ids.manager]);
  await pool.query(`insert into menu_items (id, branch_id, name, output_unit, price, is_active, is_semi_fg) values ($1,$2,'QA B6 Dish','portion','5.00',true,true)`, [ids.dish, ids.branchA]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'1.000')`, [id(), ids.branchA, ids.dish, ids.flour]);

  const results = []; const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- set up two GRN-credited batches via the REAL indent->PO->receive
  // flow (direct SQL GRN inserts skip the audit-receipt origin check):
  // 4kg expiring YESTERDAY (already expired), 6kg expiring in 30 days.
  const createIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.flour, qty: '10' }] }, managerCookie);
  assert.equal(createIndent.status, 201, JSON.stringify(createIndent.json));
  const indentId = createIndent.json.indent.id;
  const submit = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, managerCookie);
  let indentStatus = submit.json.indent.status;
  if (indentStatus === 'PENDING_APPROVAL') { const a = await req('POST', `/api/purchase/indents/${indentId}/approve`, {}, managerCookie); indentStatus = a.json.indent.status; }
  assert.equal(indentStatus, 'APPROVED', JSON.stringify(submit.json));
  const poRes = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.flour, qty: '10', rate: '10' }] }, managerCookie);
  assert.equal(poRes.status, 201, JSON.stringify(poRes.json));
  const poId = poRes.json.purchaseOrder.id;
  await req('POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: '' }, managerCookie);

  const receive1 = await req('POST', `/api/purchase/orders/${poId}/receive`, { lines: [{ rawMaterialId: ids.flour, qtyReceived: '4' }] }, managerCookie);
  assert.equal(receive1.status, 201, JSON.stringify(receive1.json));
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const q1 = await req('POST', `/api/purchase/grns/${receive1.json.grn.id}/quality`, { result: 'PASS', lines: receive1.json.lines.map((l) => ({ id: l.id, qtyFailed: '0', expiryDate: yesterday })), note: '', photoUrl: 'https://evidence/grn1.jpg' }, managerCookie);
  assert.equal(q1.status, 200, JSON.stringify(q1.json));

  const receive2 = await req('POST', `/api/purchase/orders/${poId}/receive`, { lines: [{ rawMaterialId: ids.flour, qtyReceived: '6' }] }, managerCookie);
  assert.equal(receive2.status, 201, JSON.stringify(receive2.json));
  const q2 = await req('POST', `/api/purchase/grns/${receive2.json.grn.id}/quality`, { result: 'PASS', lines: receive2.json.lines.map((l) => ({ id: l.id, qtyFailed: '0', expiryDate: in30 })), note: '', photoUrl: 'https://evidence/grn2.jpg' }, managerCookie);
  assert.equal(q2.status, 200, JSON.stringify(q2.json));

  check('(a) aggregate qtyOnHand after both GRNs is 10.000 (4 expired + 6 fresh)', (await qtyOnHand(ids.branchA, ids.flour)) === '10.000', await qtyOnHand(ids.branchA, ids.flour));
  const batches0 = await batchesFor(ids.branchA, ids.flour);
  check('(b) two separate batches exist with the right expiry dates and quantities', batches0.length === 2 && batches0[0].expiry_date === yesterday && Number(batches0[0].qty_remaining) === 4 && batches0[1].expiry_date === in30 && Number(batches0[1].qty_remaining) === 6, batches0);

  // --- (c) HARD BLOCK: consuming 5kg should be REJECTED even though 10kg aggregate exists, because only 6kg is non-expired... wait we need <5 non-expired to really test the block. Use 7kg request against 6kg non-expired. ---
  const produce1 = await req('POST', '/api/semi-fg/production', { branchId: ids.branchA, menuItemId: ids.dish, quantity: '7', idempotencyKey: 'qa-b6-prod-blocked' }, managerCookie);
  check('(c) producing 7 portions (needs 7kg flour) is REJECTED (409) — only 6kg is non-expired even though aggregate qtyOnHand is 10kg', produce1.status === 409, produce1.json);
  check('(c2) stock untouched by the rejected production (still 10.000 aggregate)', (await qtyOnHand(ids.branchA, ids.flour)) === '10.000', await qtyOnHand(ids.branchA, ids.flour));

  // --- (d) a request within the non-expired total (5kg) succeeds, drawn FEFO from the 6kg fresh batch (the only eligible one) ---
  const produce2 = await req('POST', '/api/semi-fg/production', { branchId: ids.branchA, menuItemId: ids.dish, quantity: '5', idempotencyKey: 'qa-b6-prod-ok' }, managerCookie);
  assert.equal(produce2.status, 201, JSON.stringify(produce2.json));
  check('(d) aggregate qtyOnHand drops to 5.000 (10 - 5kg consumed)', (await qtyOnHand(ids.branchA, ids.flour)) === '5.000', await qtyOnHand(ids.branchA, ids.flour));
  const batches1 = await batchesFor(ids.branchA, ids.flour);
  check('(d2) the expired 4kg batch is UNTOUCHED (still 4.000) — FEFO drew from the fresh batch only, leaving expired stock held, not silently deleted', Number(batches1[0].qty_remaining) === 4, batches1);
  check('(d3) the fresh batch dropped from 6.000 to 1.000 (5kg consumed from it)', Number(batches1[1].qty_remaining) === 1, batches1);

  // --- (e) retry with the SAME idempotency key cannot double-allocate ---
  const produce2retry = await req('POST', '/api/semi-fg/production', { branchId: ids.branchA, menuItemId: ids.dish, quantity: '5', idempotencyKey: 'qa-b6-prod-ok' }, managerCookie);
  assert.equal(produce2retry.status, 200, JSON.stringify(produce2retry.json));
  check('(e) idempotent replay returns success without a second allocation', produce2retry.json.replayed === true, produce2retry.json);
  check('(e2) stock unchanged by the replay (still 5.000 aggregate, fresh batch still 1.000)', (await qtyOnHand(ids.branchA, ids.flour)) === '5.000' && Number((await batchesFor(ids.branchA, ids.flour))[1].qty_remaining) === 1, { qty: await qtyOnHand(ids.branchA, ids.flour), batches: await batchesFor(ids.branchA, ids.flour) });

  // --- (f) the already-expired 4kg can ONLY be removed via a wastage write-off with reason:"expired" ---
  const wasteWrongReason = await req('POST', '/api/inventory/wastage', { branchId: ids.branchA, rawMaterialId: ids.flour, qty: '4', reason: 'dropped', photoUrl: 'https://evidence/w1.jpg' }, managerCookie);
  assert.equal(wasteWrongReason.status, 201, JSON.stringify(wasteWrongReason.json)); // dropped/burnt may draw FEFO across all batches including expired
  check('(f) a "dropped" wastage still succeeds against the expired batch (dropped/burnt may draw from any batch)', (await qtyOnHand(ids.branchA, ids.flour)) === '1.000', await qtyOnHand(ids.branchA, ids.flour));
  const batches2 = await batchesFor(ids.branchA, ids.flour);
  check('(f2) the expired batch is now fully drawn down to 0 by the dropped-reason wastage (FEFO picked the expired lot first, correctly)', Number(batches2[0].qty_remaining) === 0, batches2);

  // --- (g) a transfer receipt into Branch B credits an "unknown origin" batch (central warehouse is not expiry-tracked) ---
  await pool.query(`insert into warehouses (id, type, branch_id, name) values ($1,'BRANCH',$2,'QA B6 Branch B Warehouse')`, [ids.toWarehouse, ids.branchB]);
  await pool.query(`insert into stock_transfers (id, from_warehouse_id, to_warehouse_id, raw_material_id, qty_dispatched, status, dispatched_by_id) values ($1,$2,$3,$4,'2.000','DISPATCHED',$5)`, [ids.transfer, ids.toWarehouse, ids.toWarehouse, ids.flour, ids.manager]);
  const receive = await req('POST', `/api/stock-transfers/${ids.transfer}/receive`, { qtyReceived: '2' }, managerCookie);
  assert.equal(receive.status, 200, JSON.stringify(receive.json));
  const branchBBatches = await batchesFor(ids.branchB, ids.flour);
  check('(g) Branch B receives one unknown-origin batch (expiryDate: null) for the transferred 2kg', branchBBatches.length === 1 && branchBBatches[0].expiry_date === null && Number(branchBBatches[0].qty_remaining) === 2, branchBBatches);

  // --- (h) GET /api/inventory/batches exception view reflects reality ---
  const list = await req('GET', `/api/inventory/batches?branchId=${ids.branchA}`, undefined, managerCookie);
  check('(h) batch list for Branch A shows only the remaining fresh 1kg lot (expired+dropped lots fully drawn down are excluded from the remaining-stock view)', list.status === 200 && list.json.batches.length === 1 && Number(list.json.batches[0].qtyRemaining) === 1 && list.json.batches[0].expired === false, list.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
