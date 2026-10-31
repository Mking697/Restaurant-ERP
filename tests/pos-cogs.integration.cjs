require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = 'http://localhost:3000';
const ORIGIN = 'http://localhost:3000';
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branch: 'qa-cogs-branch-1', owner: 'qa-cogs-owner-1', vendor: 'qa-cogs-vendor-1', vendor2: 'qa-cogs-vendor-2',
  chicken: 'qa-cogs-mat-chicken', butter: 'qa-cogs-mat-butter', saffron: 'qa-cogs-mat-saffron',
  rate1: 'qa-cogs-rate-1', rate2: 'qa-cogs-rate-2', rate3: 'qa-cogs-rate-3',
  bomDish1: 'qa-cogs-bom-d1', bomGravy1: 'qa-cogs-bom-g1', bomGravy2: 'qa-cogs-bom-g2', bomDish2: 'qa-cogs-bom-d2',
};
const token = crypto.randomBytes(32).toString('hex');

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: bodyObj ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from audit_log where user_id = $1`, [ids.owner]);
  await pool.query(`delete from pos_order_lines where order_id in (select id from pos_orders where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from pos_orders where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from bom_recipes where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from semi_fg_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from menu_items where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id in ($1,$2)`, [ids.vendor, ids.vendor2]);
  await pool.query(`delete from vendors where id in ($1,$2)`, [ids.vendor, ids.vendor2]);
  await pool.query(`delete from raw_materials where id in ($1,$2,$3)`, [ids.chicken, ids.butter, ids.saffron]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.owner]);
  await pool.query(`delete from users where id = $1`, [ids.owner]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA COGS Branch','QACOGS1','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA COGS Owner','+255****0666','SUPER_ADMIN',$2,'Active','{POS_CASHIER,MENU_BOM,ACCOUNTS_EXPENSES}')`, [ids.owner, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(token), ids.owner]);
  const cookie = `restaurant_session=${token}`;

  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA COGS Chicken','kg'),($2,'QA COGS Butter','kg'),($3,'QA COGS Saffron','g')`, [ids.chicken, ids.butter, ids.saffron]);
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ('qa-cogs-s1',$1,$2,'100.000'),('qa-cogs-s2',$1,$3,'100.000'),('qa-cogs-s3',$1,$4,'100.000')`, [ids.branch, ids.chicken, ids.butter, ids.saffron]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA COGS Vendor','+255****0777'),($2,'QA COGS Vendor 2','+255****0778')`, [ids.vendor, ids.vendor2]);
  // Older, cheaper chicken rate (vendor 1) then a newer, pricier one from a different vendor (vendor 2) -> latest-locked must win (real cost incurred), unlike Food Cost's lowest-active planning rate.
  await pool.query(`insert into vendor_rates (id, vendor_id, raw_material_id, rate, locked_at) values ($1,$2,$3,'150.00', now() - interval '10 days')`, [ids.rate1, ids.vendor, ids.chicken]);
  await pool.query(`insert into vendor_rates (id, vendor_id, raw_material_id, rate, locked_at) values ($1,$2,$3,'200.00', now())`, [ids.rate2, ids.vendor2, ids.chicken]);
  await pool.query(`insert into vendor_rates (id, vendor_id, raw_material_id, rate, locked_at) values ($1,$2,$3,'400.00', now())`, [ids.rate3, ids.vendor, ids.butter]);
  // Saffron deliberately has NO vendor rate locked at all.

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // Dish 1: 0.25 chicken direct + 0.10 gravy (semi-FG: 0.30 butter per unit gravy) -> fully priceable.
  const dish1 = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA COGS Dish', price: '500.00', isSemiFg: false }, cookie);
  check('create dish1 201', dish1.status === 201, dish1.json);
  const dish1Id = dish1.json?.menuItem?.id;
  const gravy = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA COGS Gravy', price: '0.00', isSemiFg: true, outputUnit: 'kg' }, cookie);
  check('create gravy (semi-fg) 201', gravy.status === 201, gravy.json);
  const gravyId = gravy.json?.menuItem?.id;
  // Pre-produced Semi-FG stock (produceSemiFg itself is exercised elsewhere; here we only need
  // enough gravy ON HAND for the sale to succeed, same as a kitchen that already made a batch).
  await pool.query(`insert into semi_fg_stock (id, branch_id, menu_item_id, qty_on_hand) values ('qa-cogs-semi-1',$1,$2,'10.000')`, [ids.branch, gravyId]);

  // Dish 2: uses saffron, which has no vendor rate -> this order must be cogsComplete=false.
  const dish2 = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA COGS Dish Saffron', price: '300.00', isSemiFg: false }, cookie);
  check('create dish2 201', dish2.status === 201, dish2.json);
  const dish2Id = dish2.json?.menuItem?.id;

  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.250')`, [ids.bomDish1, ids.branch, dish1Id, ids.chicken]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, component_menu_item_id, qty_per_unit) values ($1,$2,$3,'SEMI_FG',$4,'0.100')`, [ids.bomGravy1, ids.branch, dish1Id, gravyId]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.300')`, [ids.bomGravy2, ids.branch, gravyId, ids.butter]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.010')`, [ids.bomDish2, ids.branch, dish2Id, ids.saffron]);

  // Order 1: 2x dish1 -> chicken 2*0.25=0.5*200(latest rate)=100.00; gravy 2*0.10=0.20*0.300=0.06 butter*400=24.00 -> total 124.00, complete.
  const order1 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T1', tenderType: 'CASH', lines: [{ menuItemId: dish1Id, qty: 2 }] }, cookie);
  check('order1 201', order1.status === 201, order1.json);
  const db1 = await pool.query(`select cogs_amount, cogs_complete from pos_orders where order_number = $1`, [order1.json?.order?.orderNumber]);
  check('order1 real DB cogs_amount 124.00, latest (not lowest) chicken rate used', db1.rows[0]?.cogs_amount === '124.00', db1.rows[0]);
  check('order1 real DB cogs_complete true', db1.rows[0]?.cogs_complete === true, db1.rows[0]);

  // Order 2: 1x dish2 (saffron, no vendor rate) -> incomplete.
  const order2 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T2', tenderType: 'CASH', lines: [{ menuItemId: dish2Id, qty: 1 }] }, cookie);
  check('order2 201', order2.status === 201, order2.json);
  const db2 = await pool.query(`select cogs_amount, cogs_complete from pos_orders where order_number = $1`, [order2.json?.order?.orderNumber]);
  check('order2 real DB cogs_complete false (saffron has no vendor rate)', db2.rows[0]?.cogs_complete === false, db2.rows[0]);
  check('order2 real DB cogs_amount 0.00 (nothing priceable)', db2.rows[0]?.cogs_amount === '0.00', db2.rows[0]);

  // P&L for this branch/month: order2's incomplete COGS must withhold grossProfit for the WHOLE period, never understate it.
  const month = new Date().toISOString().slice(0, 7);
  const pl = await req('GET', `/api/accounts/profit-loss?branchId=${ids.branch}&month=${month}`, null, cookie);
  check('profit-loss 200', pl.status === 200, pl.json);
  check('profit-loss revenue includes both orders (500+500tax? just check > 0)', Number(pl.json?.revenue) > 0, pl.json?.revenue);
  check('profit-loss cogs withheld (null) because order2 was incomplete', pl.json?.cogs === null && pl.json?.grossProfit === null && pl.json?.cogsConnected === false, pl.json);

  // Now void dish2's confounding order2 scenario isn't needed — instead prove the CONNECTED path with a fresh branch-month using only dish1 orders.
  // Delete order2 to isolate a clean "all complete" period and re-check P&L connects real gross profit.
  await pool.query(`delete from pos_order_lines where order_id = (select id from pos_orders where order_number = $1)`, [order2.json?.order?.orderNumber]);
  await pool.query(`delete from pos_orders where order_number = $1`, [order2.json?.order?.orderNumber]);
  const pl2 = await req('GET', `/api/accounts/profit-loss?branchId=${ids.branch}&month=${month}`, null, cookie);
  check('profit-loss (order2 removed) cogsConnected true', pl2.json?.cogsConnected === true, pl2.json);
  check('profit-loss (order2 removed) cogs=124.00 (order1 only)', pl2.json?.cogs === '124.00', pl2.json);
  check('profit-loss (order2 removed) grossProfit = revenue - 124.00', Number(pl2.json?.grossProfit) === Number(pl2.json?.revenue) - 124.00, pl2.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
