// AUTOMATION-1c: real indent spike detection against a real rolling average
// of actually-posted GRN receipts.
// Parent-run only: migrated disposable QA DB + app bound to that exact DB.
// PGDATABASE=restaurant_erp_indentspike_qa_YYYYMMDD INDENTSPIKE_QA_DATABASE=<same>
// BASE_URL=http://127.0.0.1:<dedicated-port> node tests/indent-spike.integration.cjs
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Must target the local Docker Postgres host only');
assert.equal(process.env.PGPORT, '5436', 'Must target the local Docker Postgres port only');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_indentspike_qa_\d{8}$/, 'Disposable QA DB name required, never the shared dev DB');
assert.equal(process.env.INDENTSPIKE_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:', 'QA app must be loopback-only');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const ORIGIN = BASE;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branch: 'qa-spike-branch',
  manager: 'qa-spike-manager',
  vendor: 'qa-spike-vendor',
  chicken: 'qa-spike-mat-chicken', // builds up 3 real historical samples, avg = 10
  rice: 'qa-spike-mat-rice', // never purchased: always <3 samples
};
const managerToken = crypto.randomBytes(32).toString('hex');
let managerCookie;

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: ORIGIN },
    body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from audit_log where entity_type='GRN' and entity_id in (select id from grns where branch_id=$1)`, [ids.branch]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from grns where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from purchase_orders where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from inventory_stock where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.chicken, ids.rice]]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.manager]);
  await pool.query(`delete from users where id = $1`, [ids.manager]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

// Full real Indent -> (submit) -> approve-if-needed -> PO -> bill -> receive
// -> quality PASS cycle through the actual HTTP routes (same as
// purchase.integration.cjs), so the resulting GRN is a real, already-posted
// inventory receipt exactly like production traffic would create.
async function runFullCycle(qty, rate) {
  const create = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.chicken, qty }] }, managerCookie);
  assert.equal(create.status, 201, JSON.stringify(create.json));
  const indentId = create.json.indent.id;
  const submit = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, managerCookie);
  assert.equal(submit.status, 200, JSON.stringify(submit.json));
  let status = submit.json.indent.status;
  if (status === 'PENDING_APPROVAL') {
    const approve = await req('POST', `/api/purchase/indents/${indentId}/approve`, {}, managerCookie);
    assert.equal(approve.status, 200, JSON.stringify(approve.json));
    status = approve.json.indent.status;
  }
  assert.equal(status, 'APPROVED', 'historical cycle indent must reach APPROVED to raise a PO');
  const po = await req('POST', '/api/purchase/orders', { branchId: ids.branch, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.chicken, qty, rate }] }, managerCookie);
  assert.equal(po.status, 201, JSON.stringify(po.json));
  const poId = po.json.purchaseOrder.id;
  await req('POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: '' }, managerCookie);
  const receive = await req('POST', `/api/purchase/orders/${poId}/receive`, {}, managerCookie);
  assert.equal(receive.status, 201, JSON.stringify(receive.json));
  const grnId = receive.json.grn.id;
  const grnList = await req('GET', '/api/purchase/grns?branchId=' + ids.branch, undefined, managerCookie);
  const grnRow = grnList.json.grns.find((g) => g.id === grnId);
  const quality = await req('POST', `/api/purchase/grns/${grnId}/quality`, { result: 'PASS', lines: grnRow.lines.map((l) => ({ id: l.id, qtyFailed: '0' })) }, managerCookie);
  assert.equal(quality.status, 200, JSON.stringify(quality.json));
  assert.equal(quality.json.grn.inventoryPosted, true);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA Spike Branch','QASPIKE','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Spike Manager','+255712000401','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY}')`, [ids.manager, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA Spike Chicken','kg'),($2,'QA Spike Rice','kg')`, [ids.chicken, ids.rice]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA Spike Vendor','+255712000402')`, [ids.vendor]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- Build 3 real historical receipts for chicken: 8, 10, 12 kg -> avg exactly 10.000 ---
  await runFullCycle('8', '100');
  await runFullCycle('10', '100');
  await runFullCycle('12', '100');
  const stockAfterHistory = await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2', [ids.branch, ids.chicken]);
  check('3 historical GRNs posted real stock (8+10+12=30kg)', stockAfterHistory.rows[0]?.qty_on_hand === '30.000', stockAfterHistory.rows);

  // --- (a) <3 samples (rice has 0 historical GRNs) leaves dailyAvgQtyJson/spikePercent null, fail-safe PENDING_APPROVAL ---
  const riceIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.rice, qty: '5' }] }, managerCookie);
  const riceIndentId = riceIndent.json.indent.id;
  const riceSubmit = await req('POST', `/api/purchase/indents/${riceIndentId}/submit`, {}, managerCookie);
  check('(a) <3 samples: status stays PENDING_APPROVAL, dailyAvgQtyJson/spikePercent stay null (never fabricated)',
    riceSubmit.status === 200 && riceSubmit.json.indent.status === 'PENDING_APPROVAL' && riceSubmit.json.indent.spikePercent === null && riceSubmit.json.indent.dailyAvgQtyJson === null && riceSubmit.json.spikeComputed === false,
    riceSubmit.json);

  // Mixed baseline regression: known chicken never legitimizes unknown rice.
  for (const chickenQty of ['11', '20']) {
    const mixed = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.chicken, qty: chickenQty }, { rawMaterialId: ids.rice, qty: '999999' }] }, managerCookie);
    assert.equal(mixed.status, 201, JSON.stringify(mixed.json));
    const mixedId = mixed.json.indent.id;
    const submitted = await req('POST', `/api/purchase/indents/${mixedId}/submit`, {}, managerCookie);
    assert.equal(submitted.status, 200, JSON.stringify(submitted.json));
    assert.equal(submitted.json.indent.status, 'PENDING_APPROVAL');
    assert.equal(submitted.json.spikeComputed, false);
    assert.equal(submitted.json.indent.dailyAvgQtyJson, null);
    assert.equal(submitted.json.indent.spikePercent, null);
    const persistedMixed = (await pool.query('select status, daily_avg_qty_json, spike_percent from indents where id=$1', [mixedId])).rows[0];
    assert.deepEqual(persistedMixed, { status: 'PENDING_APPROVAL', daily_avg_qty_json: null, spike_percent: null });
    check(`mixed history (chicken ${chickenQty}, unknown rice 999999): persisted pending with no partial spike figures`, true, persistedMixed);
  }

  // --- (b) >=3 samples, requested qty (11kg, +10% over avg 10) does NOT spike -> free path (no PENDING_APPROVAL) ---
  const noSpikeIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.chicken, qty: '11' }] }, managerCookie);
  const noSpikeIndentId = noSpikeIndent.json.indent.id;
  const noSpikeSubmit = await req('POST', `/api/purchase/indents/${noSpikeIndentId}/submit`, {}, managerCookie);
  check('(b) >=3 samples, no spike (11kg vs avg 10kg = +10%): proceeds without PENDING_APPROVAL',
    noSpikeSubmit.status === 200 && noSpikeSubmit.json.indent.status !== 'PENDING_APPROVAL' && noSpikeSubmit.json.indent.status === 'APPROVED' && noSpikeSubmit.json.spikeComputed === true,
    noSpikeSubmit.json);

  // --- (c) >=3 samples, requested qty (20kg, +100% over avg 10) DOES spike -> PENDING_APPROVAL with accurate stored percent ---
  const spikeIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.chicken, qty: '20' }] }, managerCookie);
  const spikeIndentId = spikeIndent.json.indent.id;
  const spikeSubmit = await req('POST', `/api/purchase/indents/${spikeIndentId}/submit`, {}, managerCookie);
  check('(c) >=3 samples, real spike (20kg vs avg 10kg = +100%): status PENDING_APPROVAL with accurate spikePercent 100.00',
    spikeSubmit.status === 200 && spikeSubmit.json.indent.status === 'PENDING_APPROVAL' && spikeSubmit.json.indent.spikePercent === '100.00',
    spikeSubmit.json);
  const snapshot = spikeSubmit.json?.indent?.dailyAvgQtyJson;
  check('(c) dailyAvgQtyJson stores the real per-material snapshot (avgQty 10.000, sampleCount 3, requestedQty 20.000, pctOverAvg 100)',
    snapshot && snapshot[ids.chicken] && snapshot[ids.chicken].avgQty === '10.000' && snapshot[ids.chicken].sampleCount === 3 && snapshot[ids.chicken].requestedQty === '20.000' && snapshot[ids.chicken].pctOverAvg === 100,
    snapshot);

  // Readback via the real GET /api/purchase/indents list endpoint too, not just the submit response.
  const listed = await req('GET', '/api/purchase/indents?branchId=' + ids.branch, undefined, managerCookie);
  const listedRow = listed.json?.indents?.find((i) => i.id === spikeIndentId);
  check('GET indents list readback shows the same persisted spikePercent/dailyAvgQtyJson', listedRow?.spikePercent === '100.00' && listedRow?.dailyAvgQtyJson?.[ids.chicken]?.avgQty === '10.000', listedRow);

  // --- (d) regression: GRN/receive flow for a fresh material unaffected, draft/rejected indent quantities never counted as samples ---
  const rejectedIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.rice, qty: '999' }] }, managerCookie);
  const rejectedIndentId = rejectedIndent.json.indent.id;
  await req('POST', `/api/purchase/indents/${rejectedIndentId}/submit`, {}, managerCookie);
  const rejected = await req('POST', `/api/purchase/indents/${rejectedIndentId}/reject`, {}, managerCookie);
  check('rejected-indent regression: reject still works', rejected.status === 200 && rejected.json.indent.status === 'REJECTED', rejected.json);
  const riceStillNoData = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId: ids.rice, qty: '1' }] }, managerCookie);
  const riceStillNoDataSubmit = await req('POST', `/api/purchase/indents/${riceStillNoData.json.indent.id}/submit`, {}, managerCookie);
  check('rejected indent quantity (999) never became a rolling-average sample for rice', riceStillNoDataSubmit.json.indent.status === 'PENDING_APPROVAL' && riceStillNoDataSubmit.json.indent.dailyAvgQtyJson === null, riceStillNoDataSubmit.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
