// GAP-004 remaining-scope follow-up: real HTTP+PostgreSQL proof of the two
// LAST branch-level RAW MATERIAL writers — wastage write-off and physical
// stock count (night variance) — neither of which had ANY writer before
// this slice (both tables were schema-only). Proves: real debit/adjust
// against inventory_stock (fail-closed on over-waste), a mandatory photo
// reference, server-captured (never client-supplied) theoretical qty,
// fail-closed on a missing vendor rate, duplicate-shift-date rejection,
// and correct GAP-004 stock_movements ledger postings for both.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_wastagevar_qa_\d{8}$/);
assert.equal(process.env.WASTAGEVAR_QA_DATABASE, process.env.PGDATABASE);
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const id = () => crypto.randomUUID();

const ids = { branch: 'qa-wv-branch', manager: 'qa-wv-manager', vendor: 'qa-wv-vendor', flour: 'qa-wv-mat-flour', unpriced: 'qa-wv-mat-unpriced' };
const managerToken = crypto.randomBytes(32).toString('hex');
let managerCookie;

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: BASE }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from stock_movements where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from night_variance_entries where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from wastage_logs where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.flour, ids.unpriced]]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.manager]);
  await pool.query(`delete from users where id = $1`, [ids.manager]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}
async function qtyOnHand(rawMaterialId) {
  const { rows } = await pool.query(`select qty_on_hand from inventory_stock where branch_id = $1 and raw_material_id = $2`, [ids.branch, rawMaterialId]);
  return rows[0]?.qty_on_hand ?? '0.000';
}
async function ledgerRows(rawMaterialId) {
  return (await pool.query(`select movement_type, qty_delta, source_type, source_id from stock_movements where branch_id = $1 and raw_material_id = $2 order by effective_at, id`, [ids.branch, rawMaterialId])).rows;
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA WV Branch','QAWV','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA WV Manager','+255****1001','BRANCH_MANAGER',$2,'Active','{INVENTORY}')`, [ids.manager, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA WV Flour','kg'),($2,'QA WV Unpriced','kg')`, [ids.flour, ids.unpriced]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA WV Vendor','+255****1002')`, [ids.vendor]);
  await pool.query(`insert into vendor_rates (id, vendor_id, raw_material_id, rate, locked_by_user_id) values ($1,$2,$3,'10.00',$4)`, [id(), ids.vendor, ids.flour, ids.manager]);
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ($1,$2,$3,'20.000')`, [id(), ids.branch, ids.flour]);

  const results = []; const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- (a) wastage without a photo reference is rejected ---
  const noPhoto = await req('POST', '/api/inventory/wastage', { branchId: ids.branch, rawMaterialId: ids.flour, qty: '2', reason: 'expired', photoUrl: '' }, managerCookie);
  check('(a) wastage with empty photoUrl is rejected (400) — mandatory proof', noPhoto.status === 400, noPhoto.json);

  // --- (b) wastage exceeding real stock on hand is rejected, stock untouched ---
  const overWaste = await req('POST', '/api/inventory/wastage', { branchId: ids.branch, rawMaterialId: ids.flour, qty: '21', reason: 'expired', photoUrl: 'https://evidence/1.jpg' }, managerCookie);
  check('(b) wasting 21kg against only 20kg on hand is rejected (409)', overWaste.status === 409, overWaste.json);
  check('(b2) stock untouched after the rejected over-waste', (await qtyOnHand(ids.flour)) === '20.000', await qtyOnHand(ids.flour));

  // --- (c) a real wastage write-off debits stock and posts a WASTAGE_WRITE_OFF ledger row ---
  const waste = await req('POST', '/api/inventory/wastage', { branchId: ids.branch, rawMaterialId: ids.flour, qty: '3', reason: 'expired', photoUrl: 'https://evidence/1.jpg' }, managerCookie);
  assert.equal(waste.status, 201, JSON.stringify(waste.json));
  check('(c) flour qtyOnHand drops from 20.000 to 17.000 after wasting 3kg', (await qtyOnHand(ids.flour)) === '17.000', await qtyOnHand(ids.flour));
  const wasteRows = await ledgerRows(ids.flour);
  check('(c2) exactly one WASTAGE_WRITE_OFF row, qty_delta -3.000, sourced from the real wastage log id', wasteRows.length === 1 && wasteRows[0].movement_type === 'WASTAGE_WRITE_OFF' && Number(wasteRows[0].qty_delta) === -3 && wasteRows[0].source_type === 'WASTAGE' && wasteRows[0].source_id === waste.json.wastage.id, wasteRows);

  // --- (d) a physical count for a material with NO locked vendor rate is rejected (fail-closed, never fabricate a value) ---
  await pool.query(`insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand) values ($1,$2,$3,'5.000')`, [id(), ids.branch, ids.unpriced]);
  const unpricedCount = await req('POST', '/api/inventory/variance', { branchId: ids.branch, rawMaterialId: ids.unpriced, physicalQty: '4', shiftDate: '2026-10-31' }, managerCookie);
  check('(d) a physical count for an unpriced material is rejected (409) — never fabricate varianceValueInr', unpricedCount.status === 409, unpricedCount.json);

  // --- (e) a real physical count: system believes 17kg, actual count is 15kg (shortage) ---
  const count1 = await req('POST', '/api/inventory/variance', { branchId: ids.branch, rawMaterialId: ids.flour, physicalQty: '15', shiftDate: '2026-10-31', flaggedPilferage: true }, managerCookie);
  assert.equal(count1.status, 201, JSON.stringify(count1.json));
  check('(e) theoreticalQty captured server-side is 17.000 (the real qtyOnHand before this count, not client-supplied)', count1.json.entry.theoreticalQty === '17.000', count1.json.entry);
  check('(e2) varianceQty is -2.000 (15 counted - 17 theoretical)', count1.json.entry.varianceQty === '-2.000', count1.json.entry);
  check('(e3) varianceValueInr is -20.00 (-2kg x rate 10.00, real priced value, not fabricated)', count1.json.entry.varianceValueInr === '-20.00', count1.json.entry);
  check('(e4) flaggedPilferage preserved exactly as submitted (manual judgment call, no auto-threshold)', count1.json.entry.flaggedPilferage === true, count1.json.entry);
  check('(e5) flour qtyOnHand is now reconciled to the real counted 15.000, overriding the stale system belief', (await qtyOnHand(ids.flour)) === '15.000', await qtyOnHand(ids.flour));
  const afterCount = await ledgerRows(ids.flour);
  check('(e6) a second ledger row posted: PHYSICAL_COUNT_ADJUST, qty_delta -2.000, sourced from the real variance entry id', afterCount.length === 2 && afterCount[1].movement_type === 'PHYSICAL_COUNT_ADJUST' && Number(afterCount[1].qty_delta) === -2 && afterCount[1].source_type === 'NIGHT_VARIANCE' && afterCount[1].source_id === count1.json.entry.id, afterCount);

  // --- (f) a second physical count for the SAME material on the SAME shift date is rejected (409) ---
  const dupeCount = await req('POST', '/api/inventory/variance', { branchId: ids.branch, rawMaterialId: ids.flour, physicalQty: '99', shiftDate: '2026-10-31' }, managerCookie);
  check('(f) a duplicate physical count for the same material+shift-date is rejected (409)', dupeCount.status === 409, dupeCount.json);
  check('(f2) stock untouched by the rejected duplicate (still 15.000)', (await qtyOnHand(ids.flour)) === '15.000', await qtyOnHand(ids.flour));

  // --- (g) flour's ENTIRE history (opening seed excluded intentionally, both wastage+count went through the ledger) reconciles: ledger sum for the wastage+count era equals the NET change (20 -> 15 = -5) ---
  const { rows: sumRows } = await pool.query(`select coalesce(sum(qty_delta),0)::text as total from stock_movements where branch_id = $1 and raw_material_id = $2`, [ids.branch, ids.flour]);
  check('(g) ledger sum for flour is exactly -5.000 (-3 wastage, -2 count adjustment), matching the real net change in qtyOnHand (20 -> 15)', Number(sumRows[0].total) === -5, sumRows[0]);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
