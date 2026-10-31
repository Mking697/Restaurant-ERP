require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = 'http://localhost:3000';
const ORIGIN = 'http://localhost:3000'; // matches .env APP_ORIGIN
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { branch: 'qa-vat-branch-1', overrideBranch: 'qa-vat-branch-2', cashier: 'qa-vat-cashier-1', overrideCashier: 'qa-vat-cashier-2', rice: 'qa-vat-mat-rice', bom1: 'qa-vat-bom-1', bom2: 'qa-vat-bom-2' };
const token = crypto.randomBytes(32).toString('hex');
const overrideToken = crypto.randomBytes(32).toString('hex');

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: bodyObj ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from pos_order_lines where order_id in (select id from pos_orders where branch_id in ($1,$2))`, [ids.branch, ids.overrideBranch]);
  await pool.query(`delete from pos_orders where branch_id in ($1,$2)`, [ids.branch, ids.overrideBranch]);
  await pool.query(`delete from bom_recipes where id in ($1,$2)`, [ids.bom1, ids.bom2]);
  await pool.query(`delete from inventory_stock where branch_id in ($1,$2)`, [ids.branch, ids.overrideBranch]);
  await pool.query(`delete from menu_items where branch_id in ($1,$2)`, [ids.branch, ids.overrideBranch]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.rice]);
  await pool.query(`delete from sessions where user_id in ($1,$2)`, [ids.cashier, ids.overrideCashier]);
  await pool.query(`delete from users where id in ($1,$2)`, [ids.cashier, ids.overrideCashier]);
  await pool.query(`delete from branches where id in ($1,$2)`, [ids.branch, ids.overrideBranch]);
}

async function main() {
  await cleanup();
  // Branch with no VAT override -> items bill at their own default 18.00% rate.
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA VAT Branch','QAVAT1','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA VAT Cashier','+255712340444','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')`, [ids.cashier, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(token), ids.cashier]);
  const cookie = `restaurant_session=${token}`;

  // Second branch with an explicit 0.00% VAT override, to prove the override wins over the item's own rate.
  await pool.query(`insert into branches (id, name, code, lat, lng, vat_rate_percent) values ($1,'QA VAT Override Branch','QAVAT2','0','0','0.00')`, [ids.overrideBranch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA VAT Override Cashier','+255712340555','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')`, [ids.overrideCashier, ids.overrideBranch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(overrideToken), ids.overrideCashier]);
  const overrideCookie = `restaurant_session=${overrideToken}`;

  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA VAT Rice','kg')`, [ids.rice]);
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ('qa-vat-s1',$1,$2,'100.000')`, [ids.branch, ids.rice]);
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ('qa-vat-s2',$1,$2,'100.000')`, [ids.overrideBranch, ids.rice]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  const dish1 = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA VAT Dish', price: '100.00', isSemiFg: false }, cookie);
  check('create dish 201', dish1.status === 201, dish1.json);
  const dishId = dish1.json?.menuItem?.id;

  const dish2 = await req('POST', '/api/menu-items', { branchId: ids.overrideBranch, name: 'QA VAT Override Dish', price: '100.00', isSemiFg: false }, overrideCookie);
  check('create override-branch dish 201', dish2.status === 201, dish2.json);
  const overrideDishId = dish2.json?.menuItem?.id;

  // Every sellable dish needs at least one BOM recipe row (empty recipe is rejected, not treated as "no deduction needed").
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.100')`, [ids.bom1, ids.branch, dishId, ids.rice]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.100')`, [ids.bom2, ids.overrideBranch, overrideDishId, ids.rice]);

  // Phase 1: no branch override -> item's own default 18.00% VAT always applies (never tax-free).
  const order1 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T1', tenderType: 'CASH', lines: [{ menuItemId: dishId, qty: 2 }] }, cookie);
  check('order1 201', order1.status === 201, order1.json);
  check('order1 taxAmount 36.00 (18% of 200)', order1.json?.receipt?.taxAmount === '36.00', order1.json?.receipt?.taxAmount);
  check('order1 totalAmount 236.00', order1.json?.receipt?.totalAmount === '236.00', order1.json?.receipt?.totalAmount);
  const rate1 = order1.json?.receipt?.vat?.rates?.[0];
  check('order1 single VAT rate 18.00, no CGST/SGST/IGST fields', rate1?.ratePercent === '18.00' && rate1?.vatAmount === '36.00' && rate1?.cgst === undefined, rate1);

  // Real DB check: posOrders.taxAmount/totalAmount persisted correctly.
  const dbOrder1 = await pool.query(`select tax_amount, total_amount from pos_orders where order_number = $1`, [order1.json.order.orderNumber]);
  check('real DB: order1 tax_amount=36.00 total_amount=236.00', dbOrder1.rows[0].tax_amount === '36.00' && dbOrder1.rows[0].total_amount === '236.00', dbOrder1.rows[0]);

  // Phase 2: branch VAT override (0.00%) wins over the item's own 18.00% default.
  const order2 = await req('POST', '/api/pos/orders', { branchId: ids.overrideBranch, channel: 'DINE_IN', tableNo: 'T2', tenderType: 'CASH', lines: [{ menuItemId: overrideDishId, qty: 1 }] }, overrideCookie);
  check('order2 (branch VAT override) 201', order2.status === 201, order2.json);
  check('order2 taxAmount 0.00 (branch override wins)', order2.json?.receipt?.taxAmount === '0.00', order2.json?.receipt?.taxAmount);
  check('order2 totalAmount 100.00', order2.json?.receipt?.totalAmount === '100.00', order2.json?.receipt?.totalAmount);
  const rate2 = order2.json?.receipt?.vat?.rates?.[0];
  check('order2 rate 0.00 (override, not item default 18.00)', rate2?.ratePercent === '0.00', rate2);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
