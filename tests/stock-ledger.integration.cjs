// GAP-004 first slice: real HTTP+PostgreSQL proof that the new stock_movements
// ledger (src/db/schema/stock-ledger.ts, src/lib/server/stock-ledger.ts) is
// posted correctly by the two wired writers (GRN quality credit, deductStock's
// raw debit used by both Semi-FG production and POS sale consumption), stays
// idempotent on replay, and reconciles exactly against inventory_stock.qtyOnHand
// for a material whose ENTIRE history went through wired writers.
//
// Parent-run only: migrated disposable QA DB + app bound to that exact DB.
// PGDATABASE=restaurant_erp_stockledger_qa_YYYYMMDD STOCKLEDGER_QA_DATABASE=<same>
// BASE_URL=http://127.0.0.1:<dedicated-port> node tests/stock-ledger.integration.cjs
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Must target the local Docker Postgres host only');
assert.equal(process.env.PGPORT, '5436', 'Must target the local Docker Postgres port only');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_stockledger_qa_\d{8}$/, 'Disposable QA DB name required, never the shared dev DB');
assert.equal(process.env.STOCKLEDGER_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:', 'QA app must be loopback-only');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const ORIGIN = BASE;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const id = () => crypto.randomUUID();

const ids = {
  branch: 'qa-ledger-branch',
  manager: 'qa-ledger-manager',
  cashier: 'qa-ledger-cashier',
  vendor: 'qa-ledger-vendor',
  flour: 'qa-ledger-mat-flour', // ENTIRE history goes through wired writers -> must reconcile exactly
  salt: 'qa-ledger-mat-salt', // opening balance seeded directly (legacy/unwired) -> must NOT be expected to reconcile
  gravy: 'qa-ledger-menu-gravy', // Semi-FG, recipe: 5kg flour per unit
  dish: 'qa-ledger-menu-dish', // sellable, recipe: 1 gravy + 0.05kg salt per unit
};
const managerToken = crypto.randomBytes(32).toString('hex');
const cashierToken = crypto.randomBytes(32).toString('hex');
let managerCookie, cashierCookie;

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: ORIGIN },
    body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from stock_movements where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from pos_order_lines where order_id in (select id from pos_orders where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from pos_orders where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from semi_fg_productions where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from semi_fg_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from bom_recipes where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from audit_log where entity_type = 'GRN' and entity_id in (select id from grns where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from grns where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from purchase_orders where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from menu_items where id = any($1)`, [[ids.gravy, ids.dish]]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.flour, ids.salt]]);
  await pool.query(`delete from sessions where user_id = any($1)`, [[ids.manager, ids.cashier]]);
  await pool.query(`delete from users where id = any($1)`, [[ids.manager, ids.cashier]]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

async function ledgerRows(rawMaterialId) {
  return (await pool.query(`select movement_type, qty_delta, source_type, source_id from stock_movements where branch_id = $1 and raw_material_id = $2 order by effective_at, id`, [ids.branch, rawMaterialId])).rows;
}
async function ledgerSum(rawMaterialId) {
  const { rows } = await pool.query(`select coalesce(sum(qty_delta), 0)::text as total from stock_movements where branch_id = $1 and raw_material_id = $2`, [ids.branch, rawMaterialId]);
  return Number(rows[0].total).toFixed(3);
}
async function qtyOnHand(rawMaterialId) {
  const { rows } = await pool.query(`select qty_on_hand from inventory_stock where branch_id = $1 and raw_material_id = $2`, [ids.branch, rawMaterialId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}

async function runFullGrnCycle(qty, rate) {
  const create = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.flour, qty }] }, managerCookie);
  assert.equal(create.status, 201, JSON.stringify(create.json));
  const indentId = create.json.indent.id;
  const submit = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, managerCookie);
  assert.equal(submit.status, 200, JSON.stringify(submit.json));
  let status = submit.json.indent.status;
  if (status === 'PENDING_APPROVAL') {
    const approve = await req('POST', `/api/purchase/indents/${indentId}/approve`, {}, managerCookie);
    assert.equal(approve.status, 200, JSON.stringify(approve.json));
    status = approve.json.indent.status;
  }
  assert.equal(status, 'APPROVED');
  const po = await req('POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.flour, qty, rate }] }, managerCookie);
  assert.equal(po.status, 201, JSON.stringify(po.json));
  const poId = po.json.purchaseOrder.id;
  await req('POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: '' }, managerCookie);
  const receive = await req('POST', `/api/purchase/orders/${poId}/receive`, {}, managerCookie);
  assert.equal(receive.status, 201, JSON.stringify(receive.json));
  const grnId = receive.json.grn.id;
  const grnList = await req('GET', '/api/purchase/grns?branchId=' + ids.branch, undefined, managerCookie);
  const grnRow = grnList.json.grns.find((g) => g.id === grnId);
  const quality = await req('POST', `/api/purchase/grns/${grnId}/quality`, { result: 'PASS', lines: grnRow.lines.map((l) => ({ id: l.id, qtyFailed: '0' })) }, managerCookie);
  assert.equal(quality.status, 200, JSON.stringify(quality.json));
  assert.equal(quality.json.grn.inventoryPosted, true);
  return grnId;
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA Ledger Branch','QALEDGER','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Ledger Manager','+255****0601','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY,MENU_BOM}')`, [ids.manager, ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Ledger Cashier','+255****0602','BRANCH_MANAGER',$2,'Active','{POS_CASHIER}')`, [ids.cashier, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(cashierToken), ids.cashier]);
  managerCookie = `restaurant_session=${managerToken}`;
  cashierCookie = `restaurant_session=${cashierToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA Ledger Flour','kg'),($2,'QA Ledger Salt','kg')`, [ids.flour, ids.salt]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA Ledger Vendor','+255****0603')`, [ids.vendor]);
  // Salt's opening balance is seeded DIRECTLY (bypassing the ledger) — same as
  // every real pre-existing/legacy stock row today. This is the explicit
  // "unwired opening balance" case the ledger does NOT claim to cover yet.
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ($1,$2,$3,'10.000')`, [id(), ids.branch, ids.salt]);
  await pool.query(`insert into menu_items (id, branch_id, name, price, is_semi_fg, is_sellable, output_unit) values ($1,$2,$1,'50.00',true,false,'kg'),($3,$2,$3,'500.00',false,true,'portion')`, [ids.gravy, ids.branch, ids.dish]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, component_menu_item_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,null,'5.000')`, [id(), ids.branch, ids.gravy, ids.flour]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, component_menu_item_id, qty_per_unit) values ($1,$2,$3,'SEMI_FG',null,$4,'1.000')`, [id(), ids.branch, ids.dish, ids.gravy]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, component_menu_item_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,null,'0.050')`, [id(), ids.branch, ids.dish, ids.salt]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- (a) GRN PASS credits flour; ledger gets exactly one GRN_RECEIPT row ---
  const grnId = await runFullGrnCycle('20', '10');
  check('(a) flour qtyOnHand is 20.000 after the real GRN PASS', await qtyOnHand(ids.flour) === '20.000', await qtyOnHand(ids.flour));
  const afterGrn = await ledgerRows(ids.flour);
  check('(a2) exactly one GRN_RECEIPT ledger row posted, qty_delta +20.000, correct source', afterGrn.length === 1 && afterGrn[0].movement_type === 'GRN_RECEIPT' && Number(afterGrn[0].qty_delta) === 20 && afterGrn[0].source_type === 'GRN' && afterGrn[0].source_id === grnId, afterGrn);

  // --- (b) Semi-FG production debits flour (10kg for 2 units); idempotent replay posts no second row ---
  const prodKey = id();
  const produce = await req('POST', '/api/semi-fg/production', { branchId: ids.branch, menuItemId: ids.gravy, quantity: '2', idempotencyKey: prodKey }, managerCookie);
  assert.equal(produce.status, 201, JSON.stringify(produce.json));
  check('(b) flour qtyOnHand is 10.000 after producing 2 units of gravy (-10kg)', await qtyOnHand(ids.flour) === '10.000', await qtyOnHand(ids.flour));
  const afterProd = await ledgerRows(ids.flour);
  check('(b2) a PRODUCTION_CONSUME row for flour was posted with qty_delta -10.000, sourced from the production idempotency key',
    afterProd.length === 2 && afterProd[1].movement_type === 'PRODUCTION_CONSUME' && Number(afterProd[1].qty_delta) === -10 && afterProd[1].source_type === 'PRODUCTION' && afterProd[1].source_id === prodKey, afterProd);
  const replay = await req('POST', '/api/semi-fg/production', { branchId: ids.branch, menuItemId: ids.gravy, quantity: '2', idempotencyKey: prodKey }, managerCookie);
  assert.equal(replay.json.replayed, true);
  const afterReplay = await ledgerRows(ids.flour);
  check('(b3) idempotent production replay never posts a second ledger row (still exactly 2 rows for flour)', afterReplay.length === 2, afterReplay);

  // --- (c) flour's ENTIRE history went through wired writers -> ledger sum must equal the live column exactly ---
  check('(c) ledger reconciliation: sum(qty_delta) for flour (20 - 10 = 10) exactly equals inventory_stock.qtyOnHand',
    await ledgerSum(ids.flour) === '10.000' && await ledgerSum(ids.flour) === await qtyOnHand(ids.flour), { ledgerSum: await ledgerSum(ids.flour), qtyOnHand: await qtyOnHand(ids.flour) });

  // --- (d) POS sale debits salt (direct RAW_MATERIAL component on "dish") via the SAME deductStock seam, sourced as POS_ORDER ---
  const sale = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: ids.dish, qty: 2 }] }, cashierCookie);
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  check('(d) salt qtyOnHand drops from the seeded 10.000 to 9.900 after selling 2 dishes (0.05kg each)', await qtyOnHand(ids.salt) === '9.900', await qtyOnHand(ids.salt));
  const saltRows = await ledgerRows(ids.salt);
  check('(d2) exactly one PRODUCTION_CONSUME row for salt, qty_delta -0.100, sourced from the real POS order id (not the production idempotency key)',
    saltRows.length === 1 && saltRows[0].movement_type === 'PRODUCTION_CONSUME' && Number(saltRows[0].qty_delta) === -0.1 && saltRows[0].source_type === 'POS_ORDER' && saltRows[0].source_id === sale.json.order.id, saltRows);

  // --- (e) salt's OPENING balance was seeded directly (bypassing the ledger) -> ledger sum intentionally does NOT equal the live column; only the POS-era movement is expected to match ---
  check('(e) salt ledger sum reflects ONLY the wired POS debit (-0.100), correctly NOT matching the full qtyOnHand (9.900) because its opening balance predates the ledger',
    await ledgerSum(ids.salt) === '-0.100' && await ledgerSum(ids.salt) !== await qtyOnHand(ids.salt), { ledgerSum: await ledgerSum(ids.salt), qtyOnHand: await qtyOnHand(ids.salt) });

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
