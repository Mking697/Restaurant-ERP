require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
// BASE_URL/APP_ORIGIN are overridable so this can target a dedicated QA app
// port bound to a disposable DB (never the shared local dev server/DB silently).
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ORIGIN = process.env.APP_ORIGIN || BASE;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branch: 'qa-pos-branch-1',
  cashier: 'qa-pos-cashier-1',
  chicken: 'qa-pos-mat-chicken',
  butter: 'qa-pos-mat-butter',
  tomato: 'qa-pos-mat-tomato',
  rice: 'qa-pos-mat-rice',
};
const token = crypto.randomBytes(32).toString('hex');
let cookie;

async function req(method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: bodyObj ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from pos_order_lines where order_id in (select id from pos_orders where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from pos_orders where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from semi_fg_productions where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from semi_fg_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from bom_recipes where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from menu_items where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.chicken, ids.butter, ids.tomato, ids.rice]]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.cashier]);
  await pool.query(`delete from users where id = $1`, [ids.cashier]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA POS Branch','QAPOS1','0','0')`, [ids.branch]);
  // MENU_BOM grant is also needed for POST /api/semi-fg/production.
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Cashier','+919****0333','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')`, [ids.cashier, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(token), ids.cashier]);
  cookie = `restaurant_session=${token}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA POS Chicken','kg'),($2,'QA POS Butter','kg'),($3,'QA POS Tomato','kg'),($4,'QA POS Rice','kg')`, [ids.chicken, ids.butter, ids.tomato, ids.rice]);
  // Direct-raw stock: enough chicken/rice for 2 plates. Butter/tomato are
  // consumed only when producing the gravy (Semi-FG), never at sale time.
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ('qa-s1',$1,$2,'1.000'),('qa-s2',$1,$3,'0.300'),('qa-s3',$1,$4,'1.000'),('qa-s4',$1,$5,'5.000')`, [ids.branch, ids.chicken, ids.butter, ids.tomato, ids.rice]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  const dish = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA POS Butter Chicken', price: '280.00', isSemiFg: false, outputUnit: 'portion' });
  check('create dish 201', dish.status === 201, dish.json);
  const gravy = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA POS Gravy', price: '0.00', isSemiFg: true, outputUnit: 'kg' });
  check('create semi-fg 201', gravy.status === 201, gravy.json);
  const rice = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA POS Rice', price: '60.00', isSemiFg: false, outputUnit: 'portion' });
  check('create rice dish 201', rice.status === 201, rice.json);
  const dishId = dish.json?.menuItem?.id, gravyId = gravy.json?.menuItem?.id, riceId = rice.json?.menuItem?.id;

  await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: dishId, componentType: 'RAW_MATERIAL', rawMaterialId: ids.chicken, componentMenuItemId: null, qtyPerUnit: '0.250' });
  await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: dishId, componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: gravyId, qtyPerUnit: '0.100' });
  await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: gravyId, componentType: 'RAW_MATERIAL', rawMaterialId: ids.butter, componentMenuItemId: null, qtyPerUnit: '0.300' });
  await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: gravyId, componentType: 'RAW_MATERIAL', rawMaterialId: ids.tomato, componentMenuItemId: null, qtyPerUnit: '0.200' });
  await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: riceId, componentType: 'RAW_MATERIAL', rawMaterialId: ids.rice, componentMenuItemId: null, qtyPerUnit: '0.200' });

  // Selling the dish must be blocked until the gravy Semi-FG has real produced
  // stock — no recursive/virtual deduction of the gravy's own raw ingredients.
  const blocked = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T0', tenderType: 'CASH', lines: [{ menuItemId: dishId, qty: 1 }] });
  check('sale blocked 409 before gravy is produced (no virtual raw fallback)', blocked.status === 409, blocked.json);

  // Produce 1kg of gravy: consumes 0.3 butter + 0.2 tomato directly (per its own recipe).
  const produced = await req('POST', '/api/semi-fg/production', { branchId: ids.branch, menuItemId: gravyId, quantity: '1', idempotencyKey: crypto.randomUUID() });
  check('gravy production 201', produced.status === 201, produced.json);
  const afterProduction = await pool.query(`select raw_material_id, qty_on_hand from inventory_stock where branch_id = $1`, [ids.branch]);
  const productionMap = Object.fromEntries(afterProduction.rows.map((r) => [r.raw_material_id, Number(r.qty_on_hand)]));
  check('production deducted butter 0.300 -> 0.000', Math.abs(productionMap[ids.butter] - 0) < 1e-9, productionMap[ids.butter]);
  check('production deducted tomato 1.000 -> 0.800', Math.abs(productionMap[ids.tomato] - 0.8) < 1e-9, productionMap[ids.tomato]);

  // 1 plate butter chicken needs 0.25 chicken (direct raw) + 0.1 gravy (direct Semi-FG, from produced stock).
  const order1 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T1', tenderType: 'CASH', lines: [{ menuItemId: dishId, qty: 1 }, { menuItemId: riceId, qty: 2 }] });
  check('order1 201', order1.status === 201, order1.json);
  check('order1 kot has 2 lines, no price field', order1.json?.kot?.length === 2 && !('price' in (order1.json.kot[0] ?? {})), order1.json?.kot);
  check('order1 receipt total = 280 + 2*60 = 400.00', order1.json?.receipt?.totalAmount === '400.00', order1.json?.receipt);
  const deductedChicken = order1.json?.inventoryDeducted?.find((d) => d.rawMaterialId === ids.chicken);
  check('order1 deducted chicken (direct raw) = 0.25', deductedChicken && Math.abs(deductedChicken.qtyDeducted - 0.25) < 1e-9, deductedChicken);
  check('order1 never deducts butter/tomato again at sale time', !order1.json?.inventoryDeducted?.some((d) => d.rawMaterialId === ids.butter || d.rawMaterialId === ids.tomato), order1.json?.inventoryDeducted);
  const deductedGravy = order1.json?.semiFgDeducted?.find((d) => d.menuItemId === gravyId);
  check('order1 deducted gravy (direct Semi-FG) = 0.1', deductedGravy && Math.abs(deductedGravy.qtyDeducted - 0.1) < 1e-9, deductedGravy);

  const afterStock = await pool.query(`select raw_material_id, qty_on_hand from inventory_stock where branch_id = $1`, [ids.branch]);
  const stockMap = Object.fromEntries(afterStock.rows.map((r) => [r.raw_material_id, Number(r.qty_on_hand)]));
  check('real DB: chicken 1.000 -> 0.750', Math.abs(stockMap[ids.chicken] - 0.75) < 1e-9, stockMap[ids.chicken]);
  check('real DB: rice 5.000 -> 4.600', Math.abs(stockMap[ids.rice] - 4.6) < 1e-9, stockMap[ids.rice]);
  check('real DB: butter stays 0.000 (not re-deducted at sale)', Math.abs(stockMap[ids.butter] - 0) < 1e-9, stockMap[ids.butter]);
  const gravyStock = await pool.query(`select qty_on_hand from semi_fg_stock where branch_id = $1 and menu_item_id = $2`, [ids.branch, gravyId]);
  check('real DB: gravy Semi-FG stock 1.000 -> 0.900', Math.abs(Number(gravyStock.rows[0].qty_on_hand) - 0.9) < 1e-9, gravyStock.rows[0]);

  // Only 0.9kg gravy remains; 10 more plates need 1.0kg, 0.1kg more than
  // available -> must be rejected AND leave stock untouched (no partial deduction).
  const order2 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T2', tenderType: 'CASH', lines: [{ menuItemId: dishId, qty: 10 }] });
  check('order2 rejected 409 (insufficient gravy Semi-FG stock)', order2.status === 409, order2.json);
  const afterStock2 = await pool.query(`select qty_on_hand from semi_fg_stock where branch_id = $1 and menu_item_id = $2`, [ids.branch, gravyId]);
  check('no partial deduction: gravy stock still 0.900 after rejected order', Math.abs(Number(afterStock2.rows[0].qty_on_hand) - 0.9) < 1e-9, afterStock2.rows[0]);

  const dbOrder = await pool.query(`select count(*) from pos_orders where branch_id = $1`, [ids.branch]);
  check('exactly 1 order persisted (blocked/rejected orders not saved)', dbOrder.rows[0].count === '1', dbOrder.rows[0]);

  // Semi-FG item cannot be ordered directly.
  const orderGravy = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T3', tenderType: 'CASH', lines: [{ menuItemId: gravyId, qty: 1 }] });
  check('semi-fg direct order rejected 400', orderGravy.status === 400, orderGravy.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
