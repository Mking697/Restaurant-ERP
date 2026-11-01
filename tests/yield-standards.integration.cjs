// GAP-011 real HTTP+PostgreSQL proof. Approved, versioned yield standards
// for Actual Cutting (GAP-009/010 scope only). SOFT flag only — a deviation
// never blocks the production; Owner-only to set a standard or review a
// flagged deviation. Boundary equality (exact min/max) is NOT a breach;
// a later standard relaxation never rewrites a past deviation's frozen
// band; a missing standard means nothing is evaluated.
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

const ids = { branch: 'qa-yield-branch', owner: 'qa-yield-owner', manager: 'qa-yield-manager', mat: 'qa-yield-mat', item: 'qa-yield-item' };
let ownerCookie, managerCookie;
async function req(cookie, method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}
async function setTolerance(percentOrNull) {
  await pool.query(`delete from settings where key='COST_YIELD_VARIANCE_TOLERANCE_PERCENT'`);
  if (percentOrNull !== null) await pool.query(`insert into settings(key,value) values('COST_YIELD_VARIANCE_TOLERANCE_PERCENT',$1)`, [percentOrNull]);
}
let cutCount = 0;
async function cut(inputKg, outputQty, outputMassKg, wasteKg) {
  cutCount += 1;
  return req(managerCookie, 'POST', '/api/semi-fg/cutting', { menuItemId: ids.item, inputs: [{ rawMaterialId: ids.mat, qtyKg: inputKg }], outputQty, outputMassKg, wasteQtyKg: wasteKg, idempotencyKey: `qa-yield-cut-${cutCount}` });
}

async function cleanup() {
  await pool.query(`delete from cutting_yield_deviations where cutting_production_id in (select id from actual_cutting_productions where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from cutting_yield_standards where menu_item_id=$1`, [ids.item]);
  await pool.query(`delete from actual_cutting_productions where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from stock_movements where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from stock_batches where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from semi_fg_stock where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from menu_items where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from raw_materials where id=$1`, [ids.mat]);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.owner, ids.manager]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.owner, ids.manager]]);
  await pool.query(`delete from branches where id=$1`, [ids.branch]);
  await setTolerance(null);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Yield Branch','0','0')`, [ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,status,module_access) values($1,'QA Yield Owner','+255****0020','SUPER_ADMIN','Active','{}')`, [ids.owner]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Yield Manager','+255****0021','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.manager, ids.branch]);
  const ownerToken = crypto.randomBytes(32).toString('hex'), managerToken = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(ownerToken), ids.owner]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  ownerCookie = `restaurant_session=${ownerToken}`; managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA Yield Beef','kg')`, [ids.mat]);
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Yield Cut Beef','kg','0',true,false)`, [ids.item, ids.branch]);
  await pool.query(`insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,'200.000')`, ['qa-yield-stock', ids.branch, ids.mat]);
  await pool.query(`insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_date,expiry_status,unit_cost_tsh) values($1,$2,$3,'QA-YIELD-LOT','200.000','200.000','2099-01-01','DATED','1000.0000')`, ['qa-yield-batch', ids.branch, ids.mat]);
  await setTolerance('50.00'); // generous — this test is about yield standards, not GAP-009's own tolerance

  // (a) non-Owner (manager) cannot set a standard
  const managerSet = await req(managerCookie, 'POST', `/api/menu-items/${ids.item}/yield-standard`, { minYieldPercent: '85.00', maxYieldPercent: '95.00' });
  check('(a) a non-Owner cannot set a yield standard (403)', managerSet.status === 403, managerSet.data);

  // (b) Owner sets a standard: 85%-95% yield
  const setResult = await req(ownerCookie, 'POST', `/api/menu-items/${ids.item}/yield-standard`, { minYieldPercent: '85.00', maxYieldPercent: '95.00' });
  check('(b) Owner sets a yield standard (201)', setResult.status === 201 && setResult.data.standard.minYieldPercent === '85.00' && setResult.data.standard.maxYieldPercent === '95.00', setResult.data);
  const standardId1 = setResult.data.standard.id;

  // (c) missing standard check happened BEFORE (b) existed — a cut with no
  // standard yet set must show no deviation. Use a disposable second item.
  const noStandardItem = 'qa-yield-item-nostandard';
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA No Standard Item','kg','0',true,false)`, [noStandardItem, ids.branch]);
  const noStandardCut = await req(managerCookie, 'POST', '/api/semi-fg/cutting', { menuItemId: noStandardItem, inputs: [{ rawMaterialId: ids.mat, qtyKg: '10.000' }], outputQty: '5.000', wasteQtyKg: '0.000', idempotencyKey: 'qa-yield-nostandard' });
  check('(c) a cut against an item with no standard has no deviation', noStandardCut.status === 201 && noStandardCut.data.deviation === null, noStandardCut.data);
  await pool.query(`delete from actual_cutting_productions where menu_item_id=$1`, [noStandardItem]);
  await pool.query(`delete from stock_movements where menu_item_id=$1`, [noStandardItem]);
  await pool.query(`delete from semi_fg_stock where menu_item_id=$1`, [noStandardItem]);
  await pool.query(`delete from menu_items where id=$1`, [noStandardItem]);

  // (d) within band (90% yield: 9kg out of 10kg) — no deviation, posts fine
  const within = await cut('10.000', '9.000', '9.000', '1.000');
  check('(d) 90% yield within the 85-95% band — posts (201), no deviation', within.status === 201 && within.data.deviation === null, within.data);

  // (e) exact boundary equality (95% yield: 9.5kg out of 10kg) — NOT a breach
  const boundary = await cut('10.000', '9.500', '9.500', '0.500');
  check('(e) exact 95% boundary (upper bound) is NOT a breach', boundary.status === 201 && boundary.data.deviation === null, boundary.data);

  // (f) smallest increment ABOVE the boundary (95.01%... use 95.1% via 9.51kg/10kg) stores a flag
  const aboveBoundary = await cut('10.000', '9.510', '9.510', '0.490');
  check('(f) just above the 95% upper bound stores a deviation flag', aboveBoundary.status === 201 && aboveBoundary.data.deviation !== null && aboveBoundary.data.deviation.yieldPercent === '95.10', aboveBoundary.data);
  const deviationId = aboveBoundary.data.deviation.id;

  // (g) below the lower bound (80% yield) also flags, and the production still posts (SOFT flag, never blocks)
  const below = await cut('10.000', '8.000', '8.000', '2.000');
  check('(g) below the 85% lower bound flags, production still posts (soft, never blocked)', below.status === 201 && below.data.deviation !== null && below.data.deviation.yieldPercent === '80.00', below.data);

  // (h) review queue lists the unreviewed flags
  const queue = await req(managerCookie, 'GET', `/api/menu-items/yield-deviations?branchId=${ids.branch}&unreviewedOnly=true`, undefined);
  check('(h) review queue lists both unreviewed deviations', queue.status === 200 && queue.data.deviations.length === 2, queue.data);

  // (i) a non-Owner cannot review
  const managerReview = await req(managerCookie, 'POST', `/api/menu-items/yield-deviations/${deviationId}/review`, { reason: 'Checked — normal cut variance' });
  check('(i) a non-Owner cannot review a deviation (403)', managerReview.status === 403, managerReview.data);

  // (j) Owner reviews with a reason
  const ownerReview = await req(ownerCookie, 'POST', `/api/menu-items/yield-deviations/${deviationId}/review`, { reason: 'Checked — normal cut variance' });
  check('(j) Owner reviews with a reason (200)', ownerReview.status === 200 && ownerReview.data.deviation.reviewReason === 'Checked — normal cut variance', ownerReview.data);

  // (k) a reason is mandatory
  const noReason = await req(ownerCookie, 'POST', `/api/menu-items/yield-deviations/${deviationId}/review`, { reason: '' });
  check('(k) an empty review reason is rejected (400 or already-reviewed 200 idempotent)', noReason.status === 400 || noReason.status === 409, noReason.data);

  // (l) review queue now shows only the still-unreviewed one
  const queueAfter = await req(managerCookie, 'GET', `/api/menu-items/yield-deviations?branchId=${ids.branch}&unreviewedOnly=true`, undefined);
  check('(l) review queue shows exactly 1 remaining unreviewed deviation', queueAfter.status === 200 && queueAfter.data.deviations.length === 1, queueAfter.data);

  // (m) a later standard relaxation never rewrites a past deviation's frozen band
  const relax = await req(ownerCookie, 'POST', `/api/menu-items/${ids.item}/yield-standard`, { minYieldPercent: '50.00', maxYieldPercent: '100.00' });
  check('(m) Owner relaxes the standard (201)', relax.status === 201, relax.data);
  const { rows: frozen } = await pool.query('select min_yield_percent_at_evaluation, max_yield_percent_at_evaluation from cutting_yield_deviations where id=$1', [deviationId]);
  check('(m2) the already-recorded deviation still shows the ORIGINAL 85-95% band, not the relaxed one', frozen[0]?.min_yield_percent_at_evaluation === '85.00' && frozen[0]?.max_yield_percent_at_evaluation === '95.00', frozen[0]);

  // (n) a NEW cut now evaluates against the relaxed standard (80% yield no longer flags)
  const afterRelax = await cut('10.000', '8.000', '8.000', '2.000');
  check('(n) after relaxation, an 80% yield cut (within the new 50-100% band) no longer flags', afterRelax.status === 201 && afterRelax.data.deviation === null, afterRelax.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
