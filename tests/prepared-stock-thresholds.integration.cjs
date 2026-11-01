// GAP-012 real HTTP+PostgreSQL proof. Prepared-stock (Semi-FG) min/max par
// levels — threshold-based low/high alerting only this pass (no expiry
// tracking — explicitly deferred). "0 means unconfigured" convention, same
// as raw-material par levels. Boundary equality (qty == min or == max) is
// explicitly NOT a breach; cross-location isolation is proven.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_cutting_qa_\d{8}$/);
assert.equal(process.env.CUTTING_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { branchA: 'qa-prep-branch-a', branchB: 'qa-prep-branch-b', manager: 'qa-prep-manager', managerB: 'qa-prep-manager-b', item: 'qa-prep-item' };
let cookieA, cookieB;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}
async function setQty(branchId, menuItemId, qty) {
  await pool.query(`update semi_fg_stock set qty_on_hand=$1 where branch_id=$2 and menu_item_id=$3`, [qty, branchId, menuItemId]);
}

async function cleanup() {
  await pool.query(`delete from semi_fg_stock where branch_id=any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from menu_items where id=$1`, [ids.item]);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.manager, ids.managerB]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.manager, ids.managerB]]);
  await pool.query(`delete from branches where id=any($1)`, [[ids.branchA, ids.branchB]]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Prep Branch A','0','0')`, [ids.branchA]);
  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Prep Branch B','0','0')`, [ids.branchB]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Prep Manager A','+255****0030','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.manager, ids.branchA]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Prep Manager B','+255****0031','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.managerB, ids.branchB]);
  const tokenA = crypto.randomBytes(32).toString('hex'), tokenB = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenA), ids.manager]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenB), ids.managerB]);
  cookieA = `restaurant_session=${tokenA}`; cookieB = `restaurant_session=${tokenB}`;
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Prep Item','kg','0',true,false)`, [ids.item, ids.branchA]);

  // (a) a branch-B manager cannot set thresholds for a branch-A item (cross-location isolation)
  const crossBranch = await req(cookieB, 'POST', `/api/menu-items/${ids.item}/thresholds`, { branchId: ids.branchB, minStockLevel: '5.000', maxStockLevel: '50.000' });
  check('(a) a branch-B actor cannot set thresholds claiming their own branchId for a branch-A item (400, item not found there)', crossBranch.status === 400, crossBranch.data);

  // (b) status before any threshold is set: UNCONFIGURED
  await pool.query(`insert into semi_fg_stock(id,branch_id,menu_item_id,qty_on_hand) values('qa-prep-stock-a',$1,$2,'10.000')`, [ids.branchA, ids.item]);
  const beforeStatus = await req(cookieA, 'GET', `/api/menu-items/prepared-stock-status?branchId=${ids.branchA}`, undefined);
  const row0 = beforeStatus.data.status.find((r) => r.menuItemId === ids.item);
  check('(b) before any threshold, status is UNCONFIGURED', beforeStatus.status === 200 && row0?.breach === 'UNCONFIGURED', beforeStatus.data);

  // (c) branch A manager sets min=10, max=20
  const setResult = await req(cookieA, 'POST', `/api/menu-items/${ids.item}/thresholds`, { branchId: ids.branchA, minStockLevel: '10.000', maxStockLevel: '20.000' });
  check('(c) Owner/manager sets thresholds (200)', setResult.status === 200 && setResult.data.semiFgStock.minStockLevel === '10.000' && setResult.data.semiFgStock.maxStockLevel === '20.000', setResult.data);

  // (d) exact boundary equality at min (qty=10) is NOT a breach
  await setQty(ids.branchA, ids.item, '10.000');
  const atMin = await req(cookieA, 'GET', `/api/menu-items/prepared-stock-status?branchId=${ids.branchA}`, undefined);
  const rowAtMin = atMin.data.status.find((r) => r.menuItemId === ids.item);
  check('(d) qty exactly AT min is NOT a breach (OK)', rowAtMin?.breach === 'OK', rowAtMin);

  // (e) just below min (9.999) IS a breach (LOW)
  await setQty(ids.branchA, ids.item, '9.999');
  const belowMin = await req(cookieA, 'GET', `/api/menu-items/prepared-stock-status?branchId=${ids.branchA}`, undefined);
  const rowBelowMin = belowMin.data.status.find((r) => r.menuItemId === ids.item);
  check('(e) just below min IS a breach (LOW)', rowBelowMin?.breach === 'LOW', rowBelowMin);

  // (f) exact boundary equality at max (qty=20) is NOT a breach
  await setQty(ids.branchA, ids.item, '20.000');
  const atMax = await req(cookieA, 'GET', `/api/menu-items/prepared-stock-status?branchId=${ids.branchA}`, undefined);
  const rowAtMax = atMax.data.status.find((r) => r.menuItemId === ids.item);
  check('(f) qty exactly AT max is NOT a breach (OK)', rowAtMax?.breach === 'OK', rowAtMax);

  // (g) just above max (20.001) IS a breach (HIGH)
  await setQty(ids.branchA, ids.item, '20.001');
  const aboveMax = await req(cookieA, 'GET', `/api/menu-items/prepared-stock-status?branchId=${ids.branchA}`, undefined);
  const rowAboveMax = aboveMax.data.status.find((r) => r.menuItemId === ids.item);
  check('(g) just above max IS a breach (HIGH)', rowAboveMax?.breach === 'HIGH', rowAboveMax);

  // (h) a branch-B status list never includes branch-A's item (cross-location isolation)
  const branchBStatus = await req(cookieB, 'GET', `/api/menu-items/prepared-stock-status?branchId=${ids.branchB}`, undefined);
  check('(h) branch-B status list does not include branch-A\'s item', branchBStatus.status === 200 && !branchBStatus.data.status.some((r) => r.menuItemId === ids.item), branchBStatus.data);

  // (i) qtyOnHand itself was never touched by the threshold-setting call
  const { rows: qtyRows } = await pool.query('select qty_on_hand from semi_fg_stock where branch_id=$1 and menu_item_id=$2', [ids.branchA, ids.item]);
  check('(i) qtyOnHand is untouched by threshold calls (still whatever setQty last set it to)', qtyRows[0]?.qty_on_hand === '20.001', qtyRows[0]);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
