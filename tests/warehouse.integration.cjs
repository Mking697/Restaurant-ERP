require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = 'http://localhost:3000';
const ORIGIN = 'http://localhost:3000';
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { branch: 'qa-wh-branch-1', owner: 'qa-wh-owner-1', branchUser: 'qa-wh-branchuser-1', rice: 'qa-wh-mat-rice' };
let ownerCookie, branchCookie;

async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie, origin: ORIGIN }, body: bodyObj ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from stock_transfers where raw_material_id = $1`, [ids.rice]);
  await pool.query(`delete from warehouses where branch_id = $1 or type = 'CENTRAL' and name = 'QA Central WH'`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from raw_materials where id = $1`, [ids.rice]);
  await pool.query(`delete from sessions where user_id = any($1)`, [[ids.owner, ids.branchUser]]);
  await pool.query(`delete from users where id = any($1)`, [[ids.owner, ids.branchUser]]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA WH Branch','QAWH1','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA WH Owner','+919000000661','SUPER_ADMIN',null,'Active','{}')`, [ids.owner]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA WH Branch User','+919000000662','BRANCH_MANAGER',$2,'Active','{INVENTORY}')`, [ids.branchUser, ids.branch]);
  const ownerToken = crypto.randomBytes(32).toString('hex');
  const branchToken = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(ownerToken), ids.owner]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(branchToken), ids.branchUser]);
  ownerCookie = `restaurant_session=${ownerToken}`; branchCookie = `restaurant_session=${branchToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA WH Rice','kg')`, [ids.rice]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // Branch user cannot create a warehouse (structural, Owner-only).
  const deniedCentral = await req(branchCookie, 'POST', '/api/warehouses', { type: 'CENTRAL', name: 'QA Central WH' });
  check('non-owner cannot create warehouse (403)', deniedCentral.status === 403, deniedCentral.json);

  const central = await req(ownerCookie, 'POST', '/api/warehouses', { type: 'CENTRAL', name: 'QA Central WH' });
  check('owner creates CENTRAL warehouse 201', central.status === 201, central.json);
  const branchWh = await req(ownerCookie, 'POST', '/api/warehouses', { type: 'BRANCH', branchId: ids.branch, name: 'QA Branch WH' });
  check('owner creates BRANCH warehouse 201', branchWh.status === 201, branchWh.json);
  const centralId = central.json?.warehouse?.id, branchWhId = branchWh.json?.warehouse?.id;

  // A CENTRAL warehouse rejects a branchId.
  const badCentral = await req(ownerCookie, 'POST', '/api/warehouses', { type: 'CENTRAL', name: 'Bad', branchId: ids.branch });
  check('CENTRAL warehouse with branchId rejected 400', badCentral.status === 400, badCentral.json);

  // Dispatch 10kg rice from central to the branch.
  const dispatch = await req(branchCookie, 'POST', '/api/stock-transfers', { fromWarehouseId: centralId, toWarehouseId: branchWhId, rawMaterialId: ids.rice, qtyDispatched: '10.000' });
  check('dispatch 201', dispatch.status === 201, dispatch.json);
  check('dispatch status DISPATCHED', dispatch.json?.stockTransfer?.status === 'DISPATCHED', dispatch.json);
  const transferId = dispatch.json?.stockTransfer?.id;

  // Inventory not yet touched (dispatch alone doesn't move branch stock).
  const stockBefore = await pool.query(`select qty_on_hand from inventory_stock where branch_id = $1 and raw_material_id = $2`, [ids.branch, ids.rice]);
  check('no inventory row yet before receive', stockBefore.rows.length === 0, stockBefore.rows);

  // Dispatch from a non-CENTRAL source is rejected.
  const badDispatch = await req(ownerCookie, 'POST', '/api/stock-transfers', { fromWarehouseId: branchWhId, toWarehouseId: centralId, rawMaterialId: ids.rice, qtyDispatched: '1.000' });
  check('dispatch from non-CENTRAL rejected 400', badDispatch.status === 400, badDispatch.json);

  // Receive 9.5kg (0.5kg shortage in transit) — branch's own user confirms.
  const receive = await req(branchCookie, 'POST', `/api/stock-transfers/${transferId}/receive`, { qtyReceived: '9.500' });
  check('receive 200', receive.status === 200, receive.json);
  check('receive variance = 0.500', receive.json?.variance === '0.500', receive.json?.variance);
  check('transfer status RECEIVED', receive.json?.stockTransfer?.status === 'RECEIVED', receive.json?.stockTransfer);

  const stockAfter = await pool.query(`select qty_on_hand from inventory_stock where branch_id = $1 and raw_material_id = $2`, [ids.branch, ids.rice]);
  check('real DB: branch now has 9.500kg rice', stockAfter.rows[0]?.qty_on_hand === '9.500', stockAfter.rows[0]);

  // Receiving an already-received transfer is rejected.
  const doubleReceive = await req(branchCookie, 'POST', `/api/stock-transfers/${transferId}/receive`, { qtyReceived: '1.000' });
  check('double-receive rejected 409', doubleReceive.status === 409, doubleReceive.json);

  // Second dispatch + receive on top of existing stock accumulates correctly.
  const dispatch2 = await req(branchCookie, 'POST', '/api/stock-transfers', { fromWarehouseId: centralId, toWarehouseId: branchWhId, rawMaterialId: ids.rice, qtyDispatched: '5.000' });
  const receive2 = await req(branchCookie, 'POST', `/api/stock-transfers/${dispatch2.json.stockTransfer.id}/receive`, { qtyReceived: '5.000' });
  check('receive2 200', receive2.status === 200, receive2.json);
  const stockFinal = await pool.query(`select qty_on_hand from inventory_stock where branch_id = $1 and raw_material_id = $2`, [ids.branch, ids.rice]);
  check('real DB: accumulated to 14.500kg (9.5 + 5.0)', stockFinal.rows[0]?.qty_on_hand === '14.500', stockFinal.rows[0]);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
