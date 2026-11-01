// GAP-004 follow-up slice: real HTTP+PostgreSQL proof that the stock_movements
// ledger now also covers Semi-FG (prepared) items — produceSemiFg's credit
// and deductStock's Semi-FG debit (a dish recipe consuming a prepared item)
// — alongside the raw-material coverage proven earlier, using the SAME
// seam (src/lib/server/stock-ledger.ts), now itemType-discriminated.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_semifgledger_qa_\d{8}$/);
assert.equal(process.env.SEMIFGLEDGER_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const id = () => crypto.randomUUID();
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branch: 'qa-sfl-branch', manager: 'qa-sfl-manager',
  flour: 'qa-sfl-mat-flour', // raw material behind the Semi-FG item
  gravy: 'qa-sfl-menu-gravy', // Semi-FG, recipe: 2kg flour per unit
  dish: 'qa-sfl-menu-dish', // sellable-like test item used only via production endpoint below, recipe: 1 gravy per unit (as another Semi-FG's component, proven via a second produceSemiFg)
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
  await pool.query(`delete from stock_movements where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from semi_fg_productions where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from semi_fg_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from bom_recipes where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from menu_items where id = any($1)`, [[ids.gravy, ids.dish]]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.flour]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.manager]);
  await pool.query(`delete from users where id = $1`, [ids.manager]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}
async function semiFgLedgerRows(menuItemId) {
  return (await pool.query(`select movement_type, qty_delta, item_type, source_type, source_id from stock_movements where branch_id = $1 and menu_item_id = $2 order by effective_at, id`, [ids.branch, menuItemId])).rows;
}
async function semiFgQty(menuItemId) {
  const { rows } = await pool.query(`select qty_on_hand from semi_fg_stock where branch_id = $1 and menu_item_id = $2`, [ids.branch, menuItemId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA SFL Branch','QASFL','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA SFL Manager','+255****0801','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.manager, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA SFL Flour','kg')`, [ids.flour]);
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ($1,$2,$3,'50.000')`, [id(), ids.branch, ids.flour]);
  await pool.query(`insert into menu_items (id, branch_id, name, price, is_semi_fg, is_sellable, output_unit) values ($1,$2,$1,'50.00',true,false,'kg'),($3,$2,$3,'500.00',true,false,'portion')`, [ids.gravy, ids.branch, ids.dish]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, component_menu_item_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,null,'2.000')`, [id(), ids.branch, ids.gravy, ids.flour]);
  // "dish" is itself ALSO a Semi-FG whose recipe consumes "gravy" as a Semi-FG component — lets the SAME /api/semi-fg/production endpoint exercise deductStock's Semi-FG debit (SEMI_FG_CONSUME) for gravy, and its own PRODUCTION_OUTPUT credit for dish, in one real call.
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, component_menu_item_id, qty_per_unit) values ($1,$2,$3,'SEMI_FG',null,$4,'1.000')`, [id(), ids.branch, ids.dish, ids.gravy]);

  const results = []; const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- (a) produce 5 units of gravy (Semi-FG) -> PRODUCTION_OUTPUT credit, no SEMI_FG rows debited (its own recipe is pure RAW) ---
  const produceGravyKey = id();
  const produceGravy = await req('POST', '/api/semi-fg/production', { branchId: ids.branch, menuItemId: ids.gravy, quantity: '5', idempotencyKey: produceGravyKey }, managerCookie);
  assert.equal(produceGravy.status, 201, JSON.stringify(produceGravy.json));
  check('(a) gravy semi_fg_stock is 5.000 after producing 5 units', (await semiFgQty(ids.gravy)) === '5.000', await semiFgQty(ids.gravy));
  const gravyRows1 = await semiFgLedgerRows(ids.gravy);
  check('(a2) exactly one PRODUCTION_OUTPUT ledger row for gravy, qty_delta +5.000, itemType SEMI_FG, sourced from the real idempotency key',
    gravyRows1.length === 1 && gravyRows1[0].movement_type === 'PRODUCTION_OUTPUT' && Number(gravyRows1[0].qty_delta) === 5 && gravyRows1[0].item_type === 'SEMI_FG' && gravyRows1[0].source_type === 'PRODUCTION' && gravyRows1[0].source_id === produceGravyKey, gravyRows1);

  // --- (b) idempotent replay of the same production call posts no second ledger row ---
  const replayGravy = await req('POST', '/api/semi-fg/production', { branchId: ids.branch, menuItemId: ids.gravy, quantity: '5', idempotencyKey: produceGravyKey }, managerCookie);
  assert.equal(replayGravy.json.replayed, true);
  check('(b) replay never posts a second PRODUCTION_OUTPUT row for gravy (still exactly 1)', (await semiFgLedgerRows(ids.gravy)).length === 1, await semiFgLedgerRows(ids.gravy));

  // --- (c) produce 2 units of "dish", which consumes 2 units of gravy (Semi-FG debit) and credits dish itself ---
  const produceDishKey = id();
  const produceDish = await req('POST', '/api/semi-fg/production', { branchId: ids.branch, menuItemId: ids.dish, quantity: '2', idempotencyKey: produceDishKey }, managerCookie);
  assert.equal(produceDish.status, 201, JSON.stringify(produceDish.json));
  check('(c) gravy semi_fg_stock drops from 5.000 to 3.000 (2 consumed by producing dish)', (await semiFgQty(ids.gravy)) === '3.000', await semiFgQty(ids.gravy));
  check('(c2) dish semi_fg_stock becomes 2.000 (its own production credit)', (await semiFgQty(ids.dish)) === '2.000', await semiFgQty(ids.dish));
  const gravyRows2 = await semiFgLedgerRows(ids.gravy);
  check('(c3) gravy now has a second ledger row: SEMI_FG_CONSUME, qty_delta -2.000, sourced from the dish production idempotency key',
    gravyRows2.length === 2 && gravyRows2[1].movement_type === 'SEMI_FG_CONSUME' && Number(gravyRows2[1].qty_delta) === -2 && gravyRows2[1].source_id === produceDishKey, gravyRows2);
  const dishRows = await semiFgLedgerRows(ids.dish);
  check('(c4) dish has exactly one PRODUCTION_OUTPUT ledger row, qty_delta +2.000', dishRows.length === 1 && dishRows[0].movement_type === 'PRODUCTION_OUTPUT' && Number(dishRows[0].qty_delta) === 2, dishRows);

  // --- (d) gravy's ENTIRE history (both its credit and its later debit) went through the ledger -> exact reconciliation ---
  const { rows: sumRows } = await pool.query(`select coalesce(sum(qty_delta),0)::text as total from stock_movements where branch_id = $1 and menu_item_id = $2`, [ids.branch, ids.gravy]);
  check('(d) ledger sum for gravy (5 - 2 = 3) exactly equals semi_fg_stock.qtyOnHand (3.000)', Number(sumRows[0].total) === 3 && (await semiFgQty(ids.gravy)) === '3.000', { ledgerSum: sumRows[0].total, qty: await semiFgQty(ids.gravy) });

  // --- (e) the raw-material ledger from the EARLIER slice is untouched/unaffected by this extension (flour's RAW_MATERIAL debit from producing gravy still itemType RAW_MATERIAL, not reclassified) ---
  const { rows: flourRows } = await pool.query(`select item_type, movement_type, qty_delta from stock_movements where branch_id = $1 and raw_material_id = $2`, [ids.branch, ids.flour]);
  check('(e) flour (raw material behind gravy) has exactly one RAW_MATERIAL/PRODUCTION_CONSUME row, qty_delta -10.000 (2kg x 5 units)', flourRows.length === 1 && flourRows[0].item_type === 'RAW_MATERIAL' && flourRows[0].movement_type === 'PRODUCTION_CONSUME' && Number(flourRows[0].qty_delta) === -10, flourRows);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
