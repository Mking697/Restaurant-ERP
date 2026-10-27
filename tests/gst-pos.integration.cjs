require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = 'http://localhost:3000';
const ORIGIN = 'http://localhost:3000'; // matches .env APP_ORIGIN
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { branch: 'qa-gst-branch-1', cashier: 'qa-gst-cashier-1', rice: 'qa-gst-mat-rice' };
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
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from menu_items where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.rice]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.cashier]);
  await pool.query(`delete from users where id = $1`, [ids.cashier]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
  await pool.query(`delete from settings where key = 'GST_HOME_STATE_CODE'`);
}

async function main() {
  await cleanup();
  // Branch starts with NO gst_state_code — proves backward-compat (tax-free order still works).
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA GST Branch','QAGST1','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA GST Cashier','+919000000444','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')`, [ids.cashier, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(token), ids.cashier]);
  cookie = `restaurant_session=${token}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA GST Rice','kg')`, [ids.rice]);
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ('qa-gst-s1',$1,$2,'100.000')`, [ids.branch, ids.rice]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  const rice = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA GST Rice Dish', price: '100.00', isSemiFg: false });
  check('create dish 201', rice.status === 201, rice.json);
  const riceId = rice.json?.menuItem?.id;

  // Phase 1: GST not configured at all -> order succeeds tax-free.
  const order1 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T1', tenderType: 'CASH', lines: [{ menuItemId: riceId, qty: 2 }] });
  check('order1 (unconfigured GST) 201', order1.status === 201, order1.json);
  check('order1 gst.configured false', order1.json?.receipt?.gst?.configured === false, order1.json?.receipt?.gst);
  check('order1 taxAmount 0.00', order1.json?.receipt?.taxAmount === '0.00', order1.json?.receipt?.taxAmount);
  check('order1 totalAmount = 200.00 (tax-free)', order1.json?.receipt?.totalAmount === '200.00', order1.json?.receipt?.totalAmount);

  // Phase 2: configure branch state code + company state code (same state -> CGST+SGST). Menu item default rate is 5.00%.
  await pool.query(`update branches set gst_state_code = '07' where id = $1`, [ids.branch]);
  await pool.query(`insert into settings (key, value) values ('GST_HOME_STATE_CODE', '07') on conflict (key) do update set value = excluded.value`);
  const order2 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T2', tenderType: 'CASH', lines: [{ menuItemId: riceId, qty: 2 }] });
  check('order2 (configured, same state) 201', order2.status === 201, order2.json);
  check('order2 gst.configured true', order2.json?.receipt?.gst?.configured === true, order2.json?.receipt?.gst);
  check('order2 taxAmount = 10.00 (5% of 200)', order2.json?.receipt?.taxAmount === '10.00', order2.json?.receipt?.taxAmount);
  check('order2 totalAmount = 210.00', order2.json?.receipt?.totalAmount === '210.00', order2.json?.receipt?.totalAmount);
  const rate = order2.json?.receipt?.gst?.rates?.[0];
  check('order2 CGST/SGST split 2.50/2.50 x2 lines = 5.00/5.00', rate?.cgst === '5.00' && rate?.sgst === '5.00' && rate?.igst === '0.00', rate);

  // Real DB check: posOrders.taxAmount/totalAmount persisted correctly.
  const dbOrder2 = await pool.query(`select tax_amount, total_amount from pos_orders where order_number = $1`, [order2.json.order.orderNumber]);
  check('real DB: order2 tax_amount=10.00 total_amount=210.00', dbOrder2.rows[0].tax_amount === '10.00' && dbOrder2.rows[0].total_amount === '210.00', dbOrder2.rows[0]);

  // Phase 3: inter-state (branch state 07, company moved to 27) -> IGST only.
  await pool.query(`insert into settings (key, value) values ('GST_HOME_STATE_CODE', '27') on conflict (key) do update set value = excluded.value`);
  const order3 = await req('POST', '/api/pos/orders', { branchId: ids.branch, channel: 'DINE_IN', tableNo: 'T3', tenderType: 'CASH', lines: [{ menuItemId: riceId, qty: 1 }] });
  check('order3 (inter-state) 201', order3.status === 201, order3.json);
  const rate3 = order3.json?.receipt?.gst?.rates?.[0];
  check('order3 IGST=5.00, CGST/SGST=0.00', rate3?.igst === '5.00' && rate3?.cgst === '0.00' && rate3?.sgst === '0.00', rate3);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
