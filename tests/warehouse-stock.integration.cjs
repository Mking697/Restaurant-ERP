// GAP-004 follow-up slice: real HTTP+PostgreSQL proof that a CENTRAL
// warehouse now has a tracked, auditable stock balance (src/db/schema/
// warehouse-stock.ts) credited by POST /api/warehouses/[id]/stock-in and
// atomically debited by stock-transfer dispatch — preventing overselling —
// while receive still correctly credits the destination branch's
// inventory_stock exactly as before (unchanged by this slice).
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Must target the local Docker Postgres host only');
assert.equal(process.env.PGPORT, '5436', 'Must target the local Docker Postgres port only');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_whstock_qa_\d{8}$/, 'Disposable QA DB name required, never the shared dev DB');
assert.equal(process.env.WHSTOCK_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:', 'QA app must be loopback-only');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { branch: 'qa-wh-branch', owner: 'qa-wh-owner', central: 'qa-wh-central', destWh: 'qa-wh-dest', mat: 'qa-wh-mat-rice' };
const ownerToken = crypto.randomBytes(32).toString('hex');
let ownerCookie;

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: BASE }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where warehouse_id = any($1) or branch_id = $2)`, [[ids.central, ids.destWh], ids.branch]);
  await pool.query(`delete from batch_transfer_receipt_lines where allocation_id in (select id from batch_transfer_allocations where transfer_id in (select id from stock_transfers where from_warehouse_id = $1 or to_warehouse_id = $2))`, [ids.central, ids.destWh]);
  await pool.query(`delete from batch_transfer_receipts where transfer_id in (select id from stock_transfers where from_warehouse_id = $1 or to_warehouse_id = $2)`, [ids.central, ids.destWh]);
  await pool.query(`delete from batch_transfer_allocations where transfer_id in (select id from stock_transfers where from_warehouse_id = $1 or to_warehouse_id = $2)`, [ids.central, ids.destWh]);
  await pool.query(`delete from stock_transfers where from_warehouse_id = $1 or to_warehouse_id = $2`, [ids.central, ids.destWh]);
  await pool.query(`delete from stock_batches where warehouse_id = any($1) or branch_id = $2`, [[ids.central, ids.destWh], ids.branch]);
  await pool.query(`delete from warehouse_stock where warehouse_id = $1`, [ids.central]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from warehouses where id = any($1)`, [[ids.central, ids.destWh]]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.mat]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.owner]);
  await pool.query(`delete from users where id = $1`, [ids.owner]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}
async function centralBalance() {
  const { rows } = await pool.query(`select qty_on_hand from warehouse_stock where warehouse_id = $1 and raw_material_id = $2`, [ids.central, ids.mat]);
  return rows[0]?.qty_on_hand ?? null;
}
async function branchQty() {
  const { rows } = await pool.query(`select qty_on_hand from inventory_stock where branch_id = $1 and raw_material_id = $2`, [ids.branch, ids.mat]);
  return rows[0]?.qty_on_hand ?? '0.000';
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA WH Branch','QAWH','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA WH Owner','+255****0701','SUPER_ADMIN',null,'Active','{}')`, [ids.owner]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(ownerToken), ids.owner]);
  ownerCookie = `restaurant_session=${ownerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA WH Rice','kg')`, [ids.mat]);
  await pool.query(`insert into warehouses (id, type, branch_id, name) values ($1,'CENTRAL',null,'QA Central'),($2,'BRANCH',$3,'QA Dest')`, [ids.central, ids.destWh, ids.branch]);

  const results = []; const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- (a) BRANCH-type warehouse rejects stock-in; it has no tracked balance ---
  const branchStockIn = await req('POST', `/api/warehouses/${ids.destWh}/stock-in`, { rawMaterialId: ids.mat, qty: '10' }, ownerCookie);
  check('(a) stock-in on a BRANCH warehouse is rejected (400) — only CENTRAL has a tracked balance', branchStockIn.status === 400, branchStockIn.json);

  // --- (b) real stock-in credits the CENTRAL warehouse's balance ---
  // GAP-006: a stock-in with no real lot info is HELD (UNKNOWN) and cannot
  // be dispatched — supply a real future expiryDate so this flow exercises
  // normal DATED-lot movement, not the Owner-only HOLD release path.
  const stockIn = await req('POST', `/api/warehouses/${ids.central}/stock-in`, { rawMaterialId: ids.mat, qty: '30', batchNo: 'QA-LOT-1', expiryDate: '2099-01-01' }, ownerCookie);
  check('(b) stock-in 201, central balance becomes 30.000', stockIn.status === 201 && (await centralBalance()) === '30.000', { status: stockIn.status, balance: await centralBalance() });

  // --- (c) concurrent 20kg dispatches against 30kg available: only one succeeds (conservation, no overselling) ---
  const dispatch = () => req('POST', '/api/stock-transfers', { fromWarehouseId: ids.central, toWarehouseId: ids.destWh, rawMaterialId: ids.mat, qtyDispatched: '20' }, ownerCookie);
  const [d1, d2] = await Promise.all([dispatch(), dispatch()]);
  const statuses = [d1.status, d2.status].sort();
  check('(c) exactly one of two concurrent 20kg dispatches succeeds (201), the other is rejected for insufficient stock (409)', statuses[0] === 201 && statuses[1] === 409, { statuses, d1: d1.json, d2: d2.json });
  check('(c2) central balance after the single successful dispatch is exactly 10.000 (30 - 20), not negative, not double-debited', (await centralBalance()) === '10.000', await centralBalance());

  // --- (d) a dispatch exceeding the remaining 10kg balance is rejected outright, balance untouched ---
  const overDispatch = await dispatch();
  check('(d) a further 20kg dispatch against only 10kg remaining is rejected (409), balance still exactly 10.000', overDispatch.status === 409 && (await centralBalance()) === '10.000', { status: overDispatch.status, balance: await centralBalance() });

  // --- (e) receive still credits the destination branch's real inventory_stock exactly as before (unchanged by this slice) ---
  const successfulTransferId = (d1.status === 201 ? d1.json : d2.json).stockTransfer.id;
  const receive = await req('POST', `/api/stock-transfers/${successfulTransferId}/receive`, { qtyReceived: '19.500' }, ownerCookie);
  check('(e) receive 200, destination branch inventory_stock credited with the real counted 19.500 (not the dispatched 20)', receive.status === 200 && (await branchQty()) === '19.500' && receive.json.variance === '0.500', { status: receive.status, qty: await branchQty(), variance: receive.json.variance });

  // --- (f) a smaller remaining dispatch (5kg of the 10kg left) still succeeds and debits correctly ---
  const smallDispatch = await req('POST', '/api/stock-transfers', { fromWarehouseId: ids.central, toWarehouseId: ids.destWh, rawMaterialId: ids.mat, qtyDispatched: '5' }, ownerCookie);
  check('(f) a 5kg dispatch against the remaining 10kg succeeds, central balance becomes 5.000', smallDispatch.status === 201 && (await centralBalance()) === '5.000', { status: smallDispatch.status, balance: await centralBalance() });

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
