// Real HTTP + Postgres integration: VAT Summary export.
require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const BASE = 'http://localhost:3000';
const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) { pass++; } else { fail++; failures.push(name); } }

async function seedSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('delete from sessions where user_id = $1', [userId]);
  await pool.query('insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,\'0\', now() + interval \'1 hour\')', [tokenHash(token), userId]);
  return token;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(token ? { cookie: `restaurant_session=${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

(async () => {
  const branchId = 'qa-vatsum-branch-1', overrideBranchId = 'qa-vatsum-branch-2', ownerId = 'qa-vatsum-owner-1', cashierId = 'qa-vatsum-cashier-1', overrideCashierId = 'qa-vatsum-cashier-2';
  const itemA = 'qa-vatsum-item-a', itemB = 'qa-vatsum-item-b', itemOverride = 'qa-vatsum-item-override';
  const rawId = 'qa-vatsum-raw-1';
  const bomA = 'qa-vatsum-bom-a', bomB = 'qa-vatsum-bom-b', bomOverride = 'qa-vatsum-bom-override';

  const cleanup = async () => {
    await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id in ($1,$2))', [branchId, overrideBranchId]);
    await pool.query('delete from pos_orders where branch_id in ($1,$2)', [branchId, overrideBranchId]);
    await pool.query('delete from bom_recipes where id in ($1,$2,$3)', [bomA, bomB, bomOverride]);
    await pool.query('delete from inventory_stock where branch_id in ($1,$2)', [branchId, overrideBranchId]);
    await pool.query('delete from menu_items where id in ($1,$2,$3)', [itemA, itemB, itemOverride]);
    await pool.query('delete from raw_materials where id = $1', [rawId]);
    await pool.query('delete from sessions where user_id in ($1,$2,$3)', [ownerId, cashierId, overrideCashierId]);
    await pool.query('delete from users where id in ($1,$2,$3)', [ownerId, cashierId, overrideCashierId]);
    await pool.query('delete from branches where id in ($1,$2)', [branchId, overrideBranchId]);
  };
  await cleanup();

  await pool.query("insert into branches (id, name, code, lat, lng) values ($1,'QA VAT Summary Branch','QAVATSUM1','0','0')", [branchId]);
  await pool.query("insert into branches (id, name, code, lat, lng, vat_rate_percent) values ($1,'QA VAT Summary Override Branch','QAVATSUM2','0','0','0.00')", [overrideBranchId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA VAT Summary Owner','+255712340881','SUPER_ADMIN',null,'Active','{}')", [ownerId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA VAT Summary Cashier','+255712340882','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')", [cashierId, branchId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA VAT Summary Override Cashier','+255712340883','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')", [overrideCashierId, overrideBranchId]);
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable, product_code, vat_rate_percent) values ($1, $2, 'QA VatSum Thali', 100.00, true, true, 'P-100', '18.00')", [itemA, branchId]);
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable, product_code, vat_rate_percent) values ($1, $2, 'QA VatSum Biryani', 200.00, true, true, 'P-100', '18.00')", [itemB, branchId]);
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable, product_code, vat_rate_percent) values ($1, $2, 'QA VatSum OverrideItem', 50.00, true, true, 'P-200', '18.00')", [itemOverride, overrideBranchId]);
  await pool.query("insert into raw_materials (id, name, unit) values ($1,'QA VatSum Rice','kg')", [rawId]);
  await pool.query("insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ($1,$2,$3,'100.000')", ['qa-vatsum-stock-1', branchId, rawId]);
  await pool.query("insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ($1,$2,$3,'100.000')", ['qa-vatsum-stock-2', overrideBranchId, rawId]);
  await pool.query("insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.100')", [bomA, branchId, itemA, rawId]);
  await pool.query("insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.100')", [bomB, branchId, itemB, rawId]);
  await pool.query("insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values ($1,$2,$3,'RAW_MATERIAL',$4,'0.100')", [bomOverride, overrideBranchId, itemOverride, rawId]);

  const ownerToken = await seedSession(ownerId);
  const cashierToken = await seedSession(cashierId);
  const overrideCashierToken = await seedSession(overrideCashierId);

  // Two orders on the default branch, same product code + rate -> should merge into ONE row.
  const o1 = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: itemA, qty: 2 }] } }); // taxable 200
  const o2 = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: itemB, qty: 1 }] } }); // taxable 200, same product code+rate
  check('seed order 1: 201', o1.status === 201);
  check('seed order 2: 201', o2.status === 201);

  // An order on the branch with a 0.00% VAT override must appear as its own row at rate 0.00, never merged with the 18% rows.
  const o3 = await api('/api/pos/orders', { method: 'POST', token: overrideCashierToken, body: { branchId: overrideBranchId, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: itemOverride, qty: 1 }] } });
  check('seed order 3 (VAT override branch): 201', o3.status === 201);

  const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Owner (all branches) — must see both default-branch orders merged into
  // one product-code row (400 taxable, 18%), plus the override-branch order
  // as its own row at 0.00%.
  const summary = await api(`/api/vat/vat-summary?from=${from}&to=${to}`, { token: ownerToken });
  check('summary: 200', summary.status === 200);
  check('summary: exactly 2 rows', summary.json?.rows?.length === 2);
  const mainRow = summary.json?.rows?.find((r) => r.ratePercent === '18.00');
  const overrideRow = summary.json?.rows?.find((r) => r.ratePercent === '0.00');
  check('summary: main row productCode P-100', mainRow?.productCode === 'P-100');
  check('summary: main row totalQty merged = 3', mainRow?.totalQty === 3);
  check('summary: main row taxableValue merged = 400.00', mainRow?.taxableValue === '400.00');
  check('summary: main row vatAmount = 72.00 (18% of 400)', mainRow?.vatAmount === '72.00');
  check('summary: override row vatAmount = 0.00', overrideRow?.vatAmount === '0.00');
  check('summary: ordersIncluded = 3', summary.json?.ordersIncluded === 3);

  // Scoped to the override branch only -> 1 row, 0.00% rate.
  const scoped = await api(`/api/vat/vat-summary?from=${from}&to=${to}&branchId=${overrideBranchId}`, { token: ownerToken });
  check('scoped to override branch: 1 row', scoped.json?.rows?.length === 1);
  check('scoped to override branch: rate 0.00', scoped.json?.rows?.[0]?.ratePercent === '0.00');

  // Invalid date format rejected.
  const badDate = await api('/api/vat/vat-summary?from=2026-13-99&to=2026-01-01', { token: ownerToken });
  check('invalid from date: 400', badDate.status === 400);

  // from > to rejected.
  const badRange = await api(`/api/vat/vat-summary?from=${to}&to=${from}`, { token: ownerToken });
  check('from after to: 400', badRange.status === 400);

  await cleanup();
  const leftover = await pool.query("select count(*) from branches where id like 'qa-vatsum-%'");
  check('cleanup: 0 leftover QA branches', Number(leftover.rows[0].count) === 0);

  await pool.end();
  console.log(JSON.stringify({ total: pass + fail, pass, fail, failures }, null, 2));
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
