// Real HTTP + Postgres integration: GSTR-1 HSN Summary export.
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
  const gstBranchId = 'qa-gstr-branch-gst', noGstBranchId = 'qa-gstr-branch-nogst', ownerId = 'qa-gstr-owner-1', cashierId = 'qa-gstr-cashier-1';
  const itemA = 'qa-gstr-item-a', itemB = 'qa-gstr-item-b', itemNoGst = 'qa-gstr-item-nogst';

  const cleanup = async () => {
    await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id in ($1,$2))', [gstBranchId, noGstBranchId]);
    await pool.query('delete from pos_orders where branch_id in ($1,$2)', [gstBranchId, noGstBranchId]);
    await pool.query('delete from menu_items where id in ($1,$2,$3)', [itemA, itemB, itemNoGst]);
    await pool.query("delete from settings where key = 'GST_HOME_STATE_CODE'");
    await pool.query('delete from sessions where user_id in ($1,$2)', [ownerId, cashierId]);
    await pool.query('delete from users where id in ($1,$2)', [ownerId, cashierId]);
    await pool.query('delete from branches where id in ($1,$2)', [gstBranchId, noGstBranchId]);
  };
  await cleanup();

  await pool.query("insert into branches (id, name, code, lat, lng, gst_state_code) values ($1,'QA GSTR Branch','QAGSTR1','0','0','07')", [gstBranchId]);
  await pool.query("insert into branches (id, name, code, lat, lng, gst_state_code) values ($1,'QA GSTR NoGST Branch','QAGSTR2','0','0','')", [noGstBranchId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA GSTR Owner','+919000000881','SUPER_ADMIN',null,'Active','{}')", [ownerId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA GSTR Cashier','+919000000882','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')", [cashierId, gstBranchId]);
  await pool.query("insert into settings (key, value) values ('GST_HOME_STATE_CODE','07') on conflict (key) do update set value = '07'");
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable, hsn_sac_code, gst_rate_percent) values ($1, $2, 'QA GSTR Thali', 100.00, true, true, '2106', '5.00')", [itemA, gstBranchId]);
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable, hsn_sac_code, gst_rate_percent) values ($1, $2, 'QA GSTR Biryani', 200.00, true, true, '2106', '5.00')", [itemB, gstBranchId]);
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable, hsn_sac_code, gst_rate_percent) values ($1, $2, 'QA GSTR NoGstItem', 50.00, true, true, '1234', '18.00')", [itemNoGst, noGstBranchId]);

  const ownerToken = await seedSession(ownerId);
  const cashierToken = await seedSession(cashierId);

  // Two orders on the GST-configured branch, both HSN 2106 @ 5% -> should merge into ONE row.
  const o1 = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId: gstBranchId, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: itemA, qty: 2 }] } }); // taxable 200
  const o2 = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId: gstBranchId, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: itemB, qty: 1 }] } }); // taxable 200, same HSN+rate
  check('seed order 1: 201', o1.status === 201);
  check('seed order 2: 201', o2.status === 201);

  // An order on the no-GST branch must be EXCLUDED entirely from the summary.
  const noGstCashierToken = await (async () => {
    await pool.query("update users set branch_id = $1 where id = $2", [noGstBranchId, cashierId]);
    return cashierToken; // session unchanged, branch scope re-read live by the API each request
  })();
  const o3 = await api('/api/pos/orders', { method: 'POST', token: noGstCashierToken, body: { branchId: noGstBranchId, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: itemNoGst, qty: 1 }] } });
  check('seed order 3 (no-GST branch): 201', o3.status === 201);
  await pool.query("update users set branch_id = $1 where id = $2", [gstBranchId, cashierId]); // restore for any later reuse

  const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Owner (all branches) — must see BOTH GST-configured orders merged into
  // one HSN row (400 taxable, 5%), and the no-GST order excluded with a
  // nonzero ordersExcludedNoGst count.
  const summary = await api(`/api/gst/gstr1-hsn-summary?from=${from}&to=${to}`, { token: ownerToken });
  check('summary: 200', summary.status === 200);
  check('summary: exactly 1 HSN row (merged across 2 orders)', summary.json?.rows?.length === 1);
  const row = summary.json?.rows?.[0];
  check('summary: hsnSacCode 2106', row?.hsnSacCode === '2106');
  check('summary: ratePercent 5.00', row?.ratePercent === '5.00');
  check('summary: totalQty merged = 3', row?.totalQty === 3);
  check('summary: taxableValue merged = 400.00', row?.taxableValue === '400.00');
  check('summary: cgst = 10.00 (5% of 400 / 2)', row?.cgst === '10.00');
  check('summary: sgst = 10.00', row?.sgst === '10.00');
  check('summary: ordersIncluded = 2', summary.json?.ordersIncluded === 2);
  check('summary: ordersExcludedNoGst >= 1 (no-GST branch order excluded)', summary.json?.ordersExcludedNoGst >= 1);

  // Scoped to the no-GST branch only -> zero included, the excluded order shows up.
  const scoped = await api(`/api/gst/gstr1-hsn-summary?from=${from}&to=${to}&branchId=${noGstBranchId}`, { token: ownerToken });
  check('scoped to no-GST branch: 0 rows', scoped.json?.rows?.length === 0);
  check('scoped to no-GST branch: 1 excluded', scoped.json?.ordersExcludedNoGst === 1);

  // Invalid date format rejected.
  const badDate = await api('/api/gst/gstr1-hsn-summary?from=2026-13-99&to=2026-01-01', { token: ownerToken });
  check('invalid from date: 400', badDate.status === 400);

  // from > to rejected.
  const badRange = await api(`/api/gst/gstr1-hsn-summary?from=${to}&to=${from}`, { token: ownerToken });
  check('from after to: 400', badRange.status === 400);

  await cleanup();
  const leftover = await pool.query("select count(*) from branches where id like 'qa-gstr-%'");
  check('cleanup: 0 leftover QA branches', Number(leftover.rows[0].count) === 0);

  await pool.end();
  console.log(JSON.stringify({ total: pass + fail, pass, fail, failures }, null, 2));
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
