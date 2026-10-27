// Real HTTP + Postgres integration: 2-counter billing per branch + optional
// multi-currency (NRI/export) payment conversion on pos_orders.
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
  const branchId = 'qa-cc-branch-1', ownerId = 'qa-cc-owner-1', cashierId = 'qa-cc-cashier-1';
  const itemId = 'qa-cc-item-1';

  const cleanup = async () => {
    await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id = $1)', [branchId]);
    await pool.query('delete from pos_orders where branch_id = $1', [branchId]);
    await pool.query('delete from menu_items where id = $1', [itemId]);
    await pool.query("delete from currency_rates where currency_code = 'ZZZ'");
    await pool.query('delete from sessions where user_id in ($1,$2)', [ownerId, cashierId]);
    await pool.query('delete from users where id in ($1,$2)', [ownerId, cashierId]);
    await pool.query('delete from branches where id = $1', [branchId]);
  };
  await cleanup();

  await pool.query("insert into branches (id, name, code, lat, lng) values ($1,'QA CC Branch','QACC','0','0')", [branchId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA CC Owner','+919000000991','SUPER_ADMIN',null,'Active','{}')", [ownerId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA CC Cashier','+919000000992','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')", [cashierId, branchId]);
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable) values ($1, $2, 'QA CC Thali', 500.00, true, true)", [itemId, branchId]);

  const ownerToken = await seedSession(ownerId);
  const cashierToken = await seedSession(cashierId);

  // 1. Default order (no counterNo given) -> COUNTER_1.
  const defaultOrder = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('default order: 201', defaultOrder.status === 201);
  check('default order: counterNo=COUNTER_1', defaultOrder.json?.order?.counterNo === 'COUNTER_1');

  // 2. Explicit Counter 2.
  const counter2Order = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', counterNo: 'COUNTER_2', tenderType: 'CASH', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('counter 2 order: 201', counter2Order.status === 201);
  check('counter 2 order: counterNo=COUNTER_2', counter2Order.json?.order?.counterNo === 'COUNTER_2');

  // 3. Invalid counterNo silently falls back to COUNTER_1 (never rejects the sale over a cosmetic field).
  const badCounter = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', counterNo: 'COUNTER_99', tenderType: 'CASH', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('invalid counterNo: 201 (falls back, not rejected)', badCounter.status === 201 && badCounter.json?.order?.counterNo === 'COUNTER_1');

  // 4. GET orders lists both counters, scoped to this branch.
  const list = await api(`/api/pos/orders?branchId=${branchId}`, { token: ownerToken });
  const counters = new Set((list.json?.orders ?? []).map((o) => o.counterNo));
  check('GET orders: both counters present', counters.has('COUNTER_1') && counters.has('COUNTER_2'));

  // 5. Foreign currency WITHOUT a configured rate -> 400, order never created.
  const noRate = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tenderCurrencyCode: 'ZZZ', tenderType: 'CASH', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('unconfigured currency: 400', noRate.status === 400);

  // 6. Owner sets a rate for ZZZ (fake test currency, 1 ZZZ = 10 INR).
  const setRate = await api('/api/currency-rates', { method: 'POST', token: ownerToken, body: { currencyCode: 'ZZZ', rateToInr: 10 } });
  check('owner sets rate: 201', setRate.status === 201);
  check('owner sets rate: rateToInr persisted', Number(setRate.json?.currencyRate?.rateToInr) === 10);

  // 6b. Non-owner (cashier) cannot set a rate.
  const cashierSetRate = await api('/api/currency-rates', { method: 'POST', token: cashierToken, body: { currencyCode: 'ZZZ', rateToInr: 20 } });
  check('cashier cannot set rate: 403', cashierSetRate.status === 403);

  // 7. Order in ZZZ now succeeds: total ₹500 / 10 = 50.00 ZZZ, rate snapshotted.
  const fxOrder = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tenderCurrencyCode: 'zzz', tenderType: 'CARD', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('fx order: 201', fxOrder.status === 201);
  check('fx order: currency.tenderCurrencyCode=ZZZ (case-normalized)', fxOrder.json?.receipt?.currency?.tenderCurrencyCode === 'ZZZ');
  check('fx order: tenderCurrencyAmount = 50.00', fxOrder.json?.receipt?.currency?.tenderCurrencyAmount === '50.00');
  check('fx order: fxRateToInr snapshotted = 10.000000', fxOrder.json?.receipt?.currency?.fxRateToInr === '10.000000');
  check('fx order: totalAmount (INR, invoice-of-record) still 500.00', fxOrder.json?.receipt?.totalAmount === '500.00');

  // 8. Changing the rate afterwards does NOT alter the already-placed fx order's snapshot.
  await api('/api/currency-rates', { method: 'POST', token: ownerToken, body: { currencyCode: 'ZZZ', rateToInr: 20 } });
  const fxOrderRow = await pool.query('select fx_rate_to_inr, tender_currency_amount from pos_orders where id = $1', [fxOrder.json.order.id]);
  check('rate change after sale: order snapshot unchanged', Number(fxOrderRow.rows[0].fx_rate_to_inr) === 10 && fxOrderRow.rows[0].tender_currency_amount === '50.00');

  // 9. INR orders never carry a currency block.
  check('INR order: receipt.currency is null', defaultOrder.json?.receipt?.currency === null);

  await cleanup();
  const leftover = await pool.query("select count(*) from branches where id like 'qa-cc-%'");
  check('cleanup: 0 leftover QA branches', Number(leftover.rows[0].count) === 0);

  await pool.end();
  console.log(JSON.stringify({ total: pass + fail, pass, fail, failures }, null, 2));
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
