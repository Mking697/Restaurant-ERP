require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ORIGIN = process.env.APP_ORIGIN || BASE;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  convBranch: 'qa-waiter-conv-branch',
  ffBranch: 'qa-waiter-ff-branch',
  waiter: 'qa-waiter-user',
  cashier: 'qa-waiter-cashier',
  dish: 'qa-waiter-dish',
  garnish: 'qa-waiter-garnish',
};
const waiterToken = crypto.randomBytes(32).toString('hex');
const cashierToken = crypto.randomBytes(32).toString('hex');

async function req(token, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie: `restaurant_session=${token}`, origin: ORIGIN }, body: bodyObj ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from pos_production_ticket_lines where ticket_id in (select id from pos_production_tickets where branch_id = any($1))`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from pos_production_tickets where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from pos_payments where order_id in (select id from pos_orders where branch_id = any($1))`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from pos_documents where order_id in (select id from pos_orders where branch_id = any($1))`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from pos_receipts where order_id in (select id from pos_orders where branch_id = any($1))`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from pos_order_lines where order_id in (select id from pos_orders where branch_id = any($1))`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from pos_order_attempts where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from pos_orders where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from shift_runs where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from bom_recipes where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id = any($1))`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from stock_batches where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from stock_movements where raw_material_id = $1`, [ids.garnish]);
  await pool.query(`delete from menu_items where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from inventory_stock where branch_id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.garnish]);
  await pool.query(`delete from sessions where user_id = any($1)`, [[ids.waiter, ids.cashier]]);
  await pool.query(`delete from users where id = any($1)`, [[ids.waiter, ids.cashier]]);
  await pool.query(`delete from branches where id = any($1)`, [[ids.convBranch, ids.ffBranch]]);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng, operating_concept) values ($1,'QA Waiter Conventional','QAWC1','0','0','CONVENTIONAL')`, [ids.convBranch]);
  await pool.query(`insert into branches (id, name, code, lat, lng, operating_concept) values ($1,'QA Waiter FastFood','QAWF1','0','0','FAST_FOOD')`, [ids.ffBranch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Waiter','+919****0444','CASHIER',$2,'Active','{POS_WAITER}')`, [ids.waiter, ids.convBranch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Cashier','+919****0555','CASHIER',$2,'Active','{POS_CASHIER}')`, [ids.cashier, ids.convBranch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(waiterToken), ids.waiter]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(cashierToken), ids.cashier]);
  await pool.query(`insert into menu_items (id, branch_id, name, price, is_sellable, is_active) values ($1,$2,'QA Waiter Dish','150.00', true, true)`, [ids.dish, ids.convBranch]);
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA Waiter Garnish','kg')`, [ids.garnish]);
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ('qa-waiter-stock-1',$1,$2,'10.000')`, [ids.convBranch, ids.garnish]);
  await pool.query(`insert into stock_batches (id, branch_id, raw_material_id, batch_no, qty_received, qty_remaining, expiry_date, expiry_status, unit_cost_tsh) values ('qa-waiter-batch-1',$1,$2,'QA-WAITER-LOT','10.000','10.000','2099-01-01','DATED','100.0000')`, [ids.convBranch, ids.garnish]);
  await pool.query(`insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, component_menu_item_id, qty_per_unit) values ('qa-waiter-recipe-1',$1,$2,'RAW_MATERIAL',$3,null,'0.010')`, [ids.convBranch, ids.dish, ids.garnish]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // 1. Waiter-only actor creates a DINE_IN order at a CONVENTIONAL branch -> OPEN, no payment fields required.
  const opened = await req(waiterToken, 'POST', '/api/pos/orders', { branchId: ids.convBranch, channel: 'DINE_IN', tableNo: 'T5', lines: [{ menuItemId: ids.dish, qty: 2 }], idempotencyKey: crypto.randomUUID() });
  check('waiter opens CONVENTIONAL dine-in order 201', opened.status === 201, opened.json);
  check('order is OPEN (unpaid), not PAID', opened.json?.order?.status === 'OPEN', opened.json?.order);
  const orderId = opened.json?.order?.id;

  // 2. Waiter-only actor tries TAKEAWAY at the same CONVENTIONAL branch -> PAYMENT_FIRST flow -> must be rejected 403.
  const takeaway = await req(waiterToken, 'POST', '/api/pos/orders', { branchId: ids.convBranch, channel: 'TAKEAWAY', lines: [{ menuItemId: ids.dish, qty: 1 }], idempotencyKey: crypto.randomUUID() });
  check('waiter blocked 403 on TAKEAWAY (payment-first) at same branch', takeaway.status === 403, takeaway.json);

  // 3. Waiter-only actor tries DINE_IN at a FAST_FOOD branch -> PAYMENT_FIRST flow -> must be rejected 403, never silently charged.
  const ffAttempt = await req(waiterToken, 'POST', '/api/pos/orders', { branchId: ids.ffBranch, channel: 'DINE_IN', tableNo: 'T1', lines: [{ menuItemId: ids.dish, qty: 1 }], idempotencyKey: crypto.randomUUID() });
  check('waiter blocked 403 on FAST_FOOD dine-in (payment-first there)', ffAttempt.status === 403, ffAttempt.json);
  const ffOrderCount = await pool.query(`select count(*) from pos_orders where branch_id = $1`, [ids.ffBranch]);
  check('no order was created at the Fast Food branch', ffOrderCount.rows[0].count === '0', ffOrderCount.rows[0]);

  // 4. Waiter adds more lines to their own OPEN order.
  const added = await req(waiterToken, 'POST', `/api/pos/orders/${orderId}/lines`, { lines: [{ menuItemId: ids.dish, qty: 1 }], idempotencyKey: crypto.randomUUID() });
  check('waiter adds lines to own OPEN order 201', added.status === 201, added.json);
  check('total reflects 3 dishes subtotal 450.00 (+ VAT)', added.json?.order?.subtotal === '450.00', added.json?.order);

  // 5. Waiter CANNOT settle (collect payment) — only POS_CASHIER can.
  const settleByWaiter = await req(waiterToken, 'POST', `/api/pos/orders/${orderId}/settle`, { tenderType: 'CASH', idempotencyKey: crypto.randomUUID() });
  check('waiter blocked 403 from settling/collecting payment', settleByWaiter.status === 403, settleByWaiter.json);

  // 6. Cashier (no POS_WAITER) CAN settle the order the waiter opened.
  const settleByCashier = await req(cashierToken, 'POST', `/api/pos/orders/${orderId}/settle`, { tenderType: 'CASH', idempotencyKey: crypto.randomUUID() });
  check('cashier settles the waiter-opened order 201', settleByCashier.status === 201, settleByCashier.json);
  check('order now PAID', settleByCashier.json?.order?.status === 'PAID', settleByCashier.json?.order);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
