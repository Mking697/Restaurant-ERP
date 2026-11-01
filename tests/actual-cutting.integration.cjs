// GAP-009 "Actual Cutting" mode: real HTTP+PostgreSQL proof. Operator
// records REAL measured input/output/waste (not a BOM-derived ratio),
// conservation is enforced (hard physical rule + Owner tolerance %),
// idempotent, fails closed when the tolerance policy is unset.
// PGHOST=127.0.0.1 PGPORT=5436 PGDATABASE=restaurant_erp_cutting_qa_YYYYMMDD
// CUTTING_QA_DATABASE=<same> BASE_URL=http://127.0.0.1:<port>
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

const ids = {
  branch: 'qa-cut-branch', manager: 'qa-cut-manager', chickenWhole: 'qa-cut-mat-whole', chickenPieces: 'qa-cut-item-pieces',
};
let cookie;
async function req(method, path, bodyObj) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}
async function stockOf(branchId, materialId) {
  const { rows } = await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2', [branchId, materialId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}
async function semiFgOf(branchId, menuItemId) {
  const { rows } = await pool.query('select qty_on_hand from semi_fg_stock where branch_id=$1 and menu_item_id=$2', [branchId, menuItemId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}
async function setTolerance(percentOrNull) {
  await pool.query(`delete from settings where key='COST_YIELD_VARIANCE_TOLERANCE_PERCENT'`);
  if (percentOrNull !== null) await pool.query(`insert into settings(key,value) values('COST_YIELD_VARIANCE_TOLERANCE_PERCENT',$1)`, [percentOrNull]);
}

async function cleanup() {
  await pool.query(`delete from actual_cutting_productions where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from stock_movements where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from stock_batches where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from semi_fg_stock where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from menu_items where branch_id=$1`, [ids.branch]);
  await pool.query(`delete from raw_materials where id=$1`, [ids.chickenWhole]);
  await pool.query(`delete from raw_materials where id='qa-cut-mat-unpriced'`);
  await pool.query(`delete from sessions where user_id=$1`, [ids.manager]);
  await pool.query(`delete from users where id=$1`, [ids.manager]);
  await pool.query(`delete from branches where id=$1`, [ids.branch]);
  await setTolerance(null);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA Cutting Branch','0','0')`, [ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA Cutting Manager','+255710000010','BRANCH_MANAGER',$2,'Active','{MENU_BOM}')`, [ids.manager, ids.branch]);
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(token), ids.manager]);
  cookie = `restaurant_session=${token}`;
  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA Whole Chicken','kg')`, [ids.chickenWhole]);
  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Cut Chicken Pieces','pcs','0',true,false)`, [ids.chickenPieces, ids.branch]);
  await pool.query(`insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,'50.000')`, ['qa-cut-stock', ids.branch, ids.chickenWhole]);
  await pool.query(`insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_date,expiry_status,unit_cost_tsh) values($1,$2,$3,'QA-CUT-LOT','50.000','50.000','2099-01-01','DATED','3500.0000')`, ['qa-cut-batch', ids.branch, ids.chickenWhole]);

  // (a) fails closed when Owner has not configured the tolerance yet
  await setTolerance(null);
  const noPolicy = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: ids.chickenWhole, qtyKg: '10.000' }], outputQty: '36', outputMassKg: '9.000', wasteQtyKg: '1.000', idempotencyKey: 'qa-cut-1' });
  check('(a) fails closed (409) when cost/yield tolerance is not configured', noPolicy.status === 409, noPolicy.data);

  // Owner configures a 15% tolerance
  await setTolerance('15.00');

  // (b) the acceptance-criteria proof scenario: 10kg input, 9kg measured output mass, 1kg trim, 36 pieces -> passes
  const ok = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: ids.chickenWhole, qtyKg: '10.000' }], outputQty: '36', outputMassKg: '9.000', wasteQtyKg: '1.000', idempotencyKey: 'qa-cut-1' });
  check('(b) 10kg in, 9kg output mass + 1kg trim conserved exactly, passes (201)', ok.status === 201 && ok.data.production.unaccountedLossPercent === '0.000', ok.data);
  check('(b2) raw stock debited by exactly 10kg (FEFO lot consumption)', (await stockOf(ids.branch, ids.chickenWhole)) === '40.000', await stockOf(ids.branch, ids.chickenWhole));
  check('(b3) output credited as 36 pcs (whole number, not a BOM-derived ratio)', (await semiFgOf(ids.branch, ids.chickenPieces)) === '36.000', await semiFgOf(ids.branch, ids.chickenPieces));
  // GAP-010: 10kg * TSh 3500.00/kg lot cost = TSh 35000.00 batch value;
  // cost/pc = 35000.00 / 36 = 972.2222... rounded once to 972.22.
  check('(b4) GAP-010 batch value = 10kg * TSh3500/kg = TSh35000.00', ok.data.production.inputTotalValueTsh === '35000.00', ok.data.production.inputTotalValueTsh);
  check('(b5) GAP-010 cost/pc = 35000.00/36 rounded once = TSh972.22', ok.data.production.costPerOutputUnitTsh === '972.22', ok.data.production.costPerOutputUnitTsh);

  // (c) fractional pcs output rejected
  const fractional = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: ids.chickenWhole, qtyKg: '5.000' }], outputQty: '12.5', outputMassKg: '4.000', wasteQtyKg: '0.500', idempotencyKey: 'qa-cut-frac' });
  check('(c) fractional pcs output rejected (400)', fractional.status === 400, fractional.data);

  // (d) physically impossible — output+waste exceeds input — rejected regardless of tolerance
  const impossible = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: ids.chickenWhole, qtyKg: '5.000' }], outputQty: '20', outputMassKg: '5.500', wasteQtyKg: '0.500', idempotencyKey: 'qa-cut-impossible' });
  check('(d) output mass + waste exceeding input is rejected (409), no tolerance can excuse it', impossible.status === 409, impossible.data);

  // (e) unaccounted loss exceeding the configured 15% tolerance is rejected
  const overTolerance = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: ids.chickenWhole, qtyKg: '10.000' }], outputQty: '20', outputMassKg: '7.000', wasteQtyKg: '1.000', idempotencyKey: 'qa-cut-over' });
  check('(e) 20% unaccounted loss exceeds the 15% tolerance, rejected (409)', overTolerance.status === 409, overTolerance.data);
  check('(e2) rejected submission did not touch stock', (await stockOf(ids.branch, ids.chickenWhole)) === '40.000', await stockOf(ids.branch, ids.chickenWhole));

  // (f) idempotent replay of (b) returns the same record, no double debit
  const replay = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: ids.chickenWhole, qtyKg: '10.000' }], outputQty: '36', outputMassKg: '9.000', wasteQtyKg: '1.000', idempotencyKey: 'qa-cut-1' });
  check('(f) exact replay returns 200, replayed:true, no second debit', replay.status === 200 && replay.data.replayed === true, replay.data);
  check('(f2) raw stock unchanged by the replay (still 40.000)', (await stockOf(ids.branch, ids.chickenWhole)) === '40.000', await stockOf(ids.branch, ids.chickenWhole));

  // (g) same idempotency key with a DIFFERENT input is rejected
  const conflict = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: ids.chickenWhole, qtyKg: '5.000' }], outputQty: '18', outputMassKg: '4.500', wasteQtyKg: '0.500', idempotencyKey: 'qa-cut-1' });
  check('(g) reused idempotency key with different input is rejected (409)', conflict.status === 409, conflict.data);

  // (h) non-kg raw material rejected (scope restriction)
  await pool.query(`insert into raw_materials(id,name,unit) values('qa-cut-mat-oil','QA Cooking Oil','l')`);
  const nonKg = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: 'qa-cut-mat-oil', qtyKg: '2.000' }], outputQty: '2', outputMassKg: '1.000', wasteQtyKg: '0.000', idempotencyKey: 'qa-cut-nonkg' });
  check('(h) a non-kg raw material input is rejected (400)', nonKg.status === 400, nonKg.data);
  await pool.query(`delete from raw_materials where id='qa-cut-mat-oil'`);

  // (i) audit trail: GET exposes the cutting record alongside fixed-BOM productions
  const list = await req('GET', `/api/semi-fg/production?branchId=${ids.branch}`, undefined);
  check('(i) GET /api/semi-fg/production includes cuttingProductions audit trail', list.status === 200 && Array.isArray(list.data.cuttingProductions) && list.data.cuttingProductions.some((r) => r.idempotencyKey === 'qa-cut-1'), list.data);

  // (j) GAP-010 fails closed when a drawn lot has an unknown (NULL) cost —
  // e.g. an opening-stock credit that never carried a real vendor rate.
  await pool.query(`insert into raw_materials(id,name,unit) values('qa-cut-mat-unpriced','QA Unpriced Beef','kg')`);
  await pool.query(`insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values('qa-cut-stock-unpriced',$1,'qa-cut-mat-unpriced','10.000')`, [ids.branch]);
  await pool.query(`insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_date,expiry_status) values('qa-cut-batch-unpriced',$1,'qa-cut-mat-unpriced','QA-UNPRICED-LOT','10.000','10.000','2099-01-01','DATED')`, [ids.branch]);
  const unpriced = await req('POST', '/api/semi-fg/cutting', { menuItemId: ids.chickenPieces, inputs: [{ rawMaterialId: 'qa-cut-mat-unpriced', qtyKg: '5.000' }], outputQty: '18', outputMassKg: '4.500', wasteQtyKg: '0.500', idempotencyKey: 'qa-cut-unpriced' });
  check('(j) unknown-cost lot fails closed (409), never guesses a free cost', unpriced.status === 409, unpriced.data);
  check('(j2) rejected submission did not touch the unpriced stock', (await stockOf(ids.branch, 'qa-cut-mat-unpriced')) === '10.000', await stockOf(ids.branch, 'qa-cut-mat-unpriced'));
  await pool.query(`delete from stock_batches where id='qa-cut-batch-unpriced'`);
  await pool.query(`delete from inventory_stock where id='qa-cut-stock-unpriced'`);
  await pool.query(`delete from raw_materials where id='qa-cut-mat-unpriced'`);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
