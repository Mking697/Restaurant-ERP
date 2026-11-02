// GAP-020 real HTTP+PostgreSQL proof. Full end-of-day RAW stock report:
// ledger-cutoff opening/receipt/issue/wastage/adjust/closing reconstruction
// (stockMovements + stock-transfer receive side), Prepared/expiry
// count-only (live-only, honestly unavailable for a past day), simple
// latest-wins versioning with the superseded snapshot kept in auditLog.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.ok((process.env.PGPORT === '5436' && /^restaurant_erp_eod_qa_\d{8}$/.test(process.env.PGDATABASE || '')) || (process.env.PGPORT === '5439' && process.env.PGDATABASE === 'gap2122_qa'), 'Only the guarded disposable EOD or GAP021/022 QA database is allowed');
assert.ok(process.env.BASE_URL);
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = { owner: 'qa-eod-owner', mgr: 'qa-eod-mgr', mgr2: 'qa-eod-mgr2', noInv: 'qa-eod-noinv', branch: 'qa-eod-branch', branch2: 'qa-eod-branch2', mat: 'qa-eod-mat', openMat: 'qa-eod-open-mat', prepared: 'qa-eod-prepared', central: 'qa-eod-central-wh', branchWh: 'qa-eod-branch-wh' };
let cookieOwner, cookieMgr, cookieMgr2, cookieNoInv;
async function req(cookie, method, path, bodyObj) {
  if (method === 'POST' && path === '/api/reports/eod-stock' && bodyObj && !bodyObj.requestKey) bodyObj = { ...bodyObj, requestKey: crypto.randomUUID(), regenerate: true };
  const res = await fetch(BASE + path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', origin: BASE, cookie }, body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, data };
}

function eatToday() {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}
function eatYesterday() {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

async function cleanup() {
  await pool.query(`delete from audit_log where user_id=any($1)`, [[ids.owner, ids.mgr, ids.mgr2, ids.noInv]]);
  await pool.query(`delete from daily_summary_log where branch_id=any($1)`, [[ids.branch, ids.branch2]]);
  await pool.query(`delete from eod_stock_reports where branch_id=any($1)`, [[ids.branch, ids.branch2]]);
  await pool.query(`delete from batch_transfer_receipt_lines where receipt_id in (select id from batch_transfer_receipts where transfer_id in (select id from stock_transfers where raw_material_id=$1))`, [ids.mat]);
  await pool.query(`delete from batch_transfer_receipts where transfer_id in (select id from stock_transfers where raw_material_id=$1)`, [ids.mat]);
  await pool.query(`delete from batch_transfer_allocations where transfer_id in (select id from stock_transfers where raw_material_id=$1)`, [ids.mat]);
  await pool.query(`delete from stock_transfers where raw_material_id=$1`, [ids.mat]);
  await pool.query(`delete from batch_movements where batch_id in (select id from stock_batches where branch_id=any($1) or raw_material_id=$2)`, [[ids.branch, ids.branch2], ids.mat]);
  await pool.query(`delete from stock_batches where branch_id=any($1) or raw_material_id=$2`, [[ids.branch, ids.branch2], ids.mat]);
  await pool.query(`delete from warehouse_stock where warehouse_id=any($1)`, [[ids.central, ids.branchWh]]);
  await pool.query(`delete from warehouses where id=any($1)`, [[ids.central, ids.branchWh]]);
  await pool.query(`delete from stock_movements where branch_id=any($1) or raw_material_id=$2`, [[ids.branch, ids.branch2], ids.mat]);
  await pool.query(`delete from inventory_stock where branch_id=any($1)`, [[ids.branch, ids.branch2]]);
  await pool.query(`delete from wastage_logs where branch_id=any($1)`, [[ids.branch, ids.branch2]]);
  await pool.query(`delete from semi_fg_stock where branch_id=any($1)`, [[ids.branch, ids.branch2]]);
  await pool.query(`delete from menu_items where id=$1`, [ids.prepared]);
  await pool.query(`delete from raw_materials where id=any($1)`, [[ids.mat, ids.openMat]]);
  await pool.query(`delete from sessions where user_id=any($1)`, [[ids.owner, ids.mgr, ids.mgr2, ids.noInv]]);
  await pool.query(`delete from users where id=any($1)`, [[ids.owner, ids.mgr, ids.mgr2, ids.noInv]]);
  await pool.query(`delete from branches where id=any($1)`, [[ids.branch, ids.branch2]]);
}

async function main() {
  await cleanup();
  const results = []; const check = (label, cond, extra) => { results.push({ label, pass: !!cond, extra }); if (!cond) console.log('FAIL ' + label, JSON.stringify(extra)); };

  await pool.query(`insert into branches(id,code,name,lat,lng) values($1,$1,'QA EOD Branch','0','0'), ($2,$2,'QA EOD Branch 2','0','0')`, [ids.branch, ids.branch2]);
  await pool.query(`insert into users(id,name,phone_e164,role,status) values($1,'QA EOD Owner','+255****0140','SUPER_ADMIN','Active')`, [ids.owner]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA EOD Mgr','+255****0141','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY}')`, [ids.mgr, ids.branch]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA EOD Mgr2','+255****0142','BRANCH_MANAGER',$2,'Active','{INVENTORY}')`, [ids.mgr2, ids.branch2]);
  await pool.query(`insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,'QA EOD No Inventory','+255****0143','BRANCH_MANAGER',$2,'Active','{}')`, [ids.noInv, ids.branch]);
  const tokenOwner = crypto.randomBytes(32).toString('hex'), tokenMgr = crypto.randomBytes(32).toString('hex'), tokenMgr2 = crypto.randomBytes(32).toString('hex'), tokenNoInv = crypto.randomBytes(32).toString('hex');
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenOwner), ids.owner]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenMgr), ids.mgr]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenMgr2), ids.mgr2]);
  await pool.query(`insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')`, [tokenHash(tokenNoInv), ids.noInv]);
  cookieOwner = `restaurant_session=${tokenOwner}`; cookieMgr = `restaurant_session=${tokenMgr}`; cookieMgr2 = `restaurant_session=${tokenMgr2}`; cookieNoInv = `restaurant_session=${tokenNoInv}`;

  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA EOD Mat','kg')`, [ids.mat]);

  const today = eatToday(), yesterday = eatYesterday();

  const opening = await req(cookieMgr, 'POST', '/api/inventory', { branchId: ids.branch, rawMaterialId: ids.openMat, qtyOnHand: '4.000', minStockLevel: '5.000', maxStockLevel: '10.000' });
  check('(setup) inventory opening API needs an existing catalog item', opening.status === 400, opening.data);
  await pool.query(`insert into raw_materials(id,name,unit) values($1,'QA EOD Opening Mat','kg')`, [ids.openMat]);
  const openingCreated = await req(cookieMgr, 'POST', '/api/inventory', { branchId: ids.branch, rawMaterialId: ids.openMat, qtyOnHand: '4.000', minStockLevel: '5.000', maxStockLevel: '10.000' });
  check('(setup) inventory opening API creates recorded opening batch history', openingCreated.status === 201, openingCreated.data);

  await pool.query(`insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Prepared','kg','0',true,false)`, [ids.prepared, ids.branch]);
  await pool.query(`insert into semi_fg_stock(id,branch_id,menu_item_id,qty_on_hand,min_stock_level,max_stock_level) values('qa-eod-prepared-stock',$1,$2,'2.000','6.000','10.000')`, [ids.branch, ids.prepared]);
  await pool.query(`insert into stock_movements(id,branch_id,item_type,menu_item_id,movement_type,qty_delta,idempotency_key,source_type,source_id,actor_id,effective_at) values('qa-eod-prep-in',$1,'SEMI_FG',$2,'PRODUCTION_OUTPUT','5.000','qa-eod-prep-in','PRODUCTION','qa-eod-prep-in',$3,now()-interval '1 day'),('qa-eod-prep-out',$1,'SEMI_FG',$2,'SEMI_FG_CONSUME','-3.000','qa-eod-prep-out','PRODUCTION','qa-eod-prep-out',$3,now())`, [ids.branch, ids.prepared, ids.mgr]);

  // --- Scenario A: backdated receipt (yesterday) + today's consumption, proving ledger-cutoff reconstruction ---
  // Seed a 10kg GRN-style credit directly as a stock_movements row + inventory_stock, backdated to yesterday.
  await pool.query(`insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level) values('qa-eod-inv',$1,$2,'10.000','0','0')`, [ids.branch, ids.mat]);
  await pool.query(`insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status) values('qa-eod-batch-1',$1,$2,'LOT-EOD-SEED','10.000','10.000','UNKNOWN')`, [ids.branch, ids.mat]);
  await pool.query(`insert into batch_movements(id,batch_id,qty_delta,source_type,source_id,actor_id,metadata,created_at) values('qa-eod-bm1','qa-eod-batch-1','10.000','GRN','qa-eod-grn1',$1,$2::jsonb,now()-interval '1 day')`, [ids.mgr, JSON.stringify({ expiryStatus: 'UNKNOWN', expiryDate: null })]);
  await pool.query(`insert into stock_movements(id,branch_id,item_type,raw_material_id,movement_type,qty_delta,idempotency_key,source_type,source_id,actor_id,effective_at) values('qa-eod-mv1',$1,'RAW_MATERIAL',$2,'GRN_RECEIPT','10.000','qa-eod-mv1-key','GRN','qa-eod-grn1',$3, (now() - interval '1 day'))`, [ids.branch, ids.mat, ids.mgr]);

  // Today: consume 3kg via inventory-adjustments (wastage) to get a real PRODUCTION_CONSUME-shaped movement — use wastage endpoint for simplicity (still a real ledger write).
  const wastage = await req(cookieMgr, 'POST', '/api/inventory/wastage', { branchId: ids.branch, rawMaterialId: ids.mat, qty: '3.000', reason: 'dropped', photoUrl: 'https://example.test/evidence.jpg' });
  check('(setup) wastage of 3kg recorded today', wastage.status === 201 || wastage.status === 200, wastage.data);

  // Report for YESTERDAY: closing should be 10.000 (only the backdated receipt applied within that day), opening 0.000
  const genYesterday = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: yesterday });
  check('(a) generate report for yesterday succeeds (201)', genYesterday.status === 201, genYesterday.data);
  const matRowY = genYesterday.data.report.snapshotJson.rawMaterials.find((r) => r.rawMaterialId === ids.mat);
  check('(a2) yesterday: opening 0.000, receipts 10.000, closing 10.000, reconciled', matRowY?.openingQty === '0.000' && matRowY?.receiptsQty === '10.000' && matRowY?.closingQty === '10.000' && matRowY?.reconciled === true, matRowY);
  check('(a3) yesterday: prepared/expiry counts are historical numbers', typeof genYesterday.data.report.snapshotJson.preparedLowStockCount === 'number' && typeof genYesterday.data.report.snapshotJson.expiredBatchCount === 'number', genYesterday.data.report.snapshotJson);
  check('(a4) historical prepared closing is reconstructed at cutoff and classified with current threshold snapshot', genYesterday.data.report.snapshotJson.preparedRows.find((r) => r.menuItemId === ids.prepared)?.closingQty === '5.000' && genYesterday.data.report.snapshotJson.preparedLowStockCount === 1, genYesterday.data.report.snapshotJson.preparedRows);
  check('(a5) inventory opening is recorded without requiring a stock_movements duplicate', genYesterday.data.report.snapshotJson.rawMaterials.find((r) => r.rawMaterialId === ids.openMat)?.reconciled === true, genYesterday.data.report.snapshotJson.rawMaterials);
  const cronResponse = await fetch(`${BASE}/api/cron/daily-summary`, { method: 'POST', headers: { authorization: 'Bearer qa-eod-cron-secret' }, signal: AbortSignal.timeout(30000) });
  const cronData = await cronResponse.json();
  const { rows: scheduledRows } = await pool.query(`select revision,generation_source from eod_stock_reports where branch_id=$1 and report_date=$2`, [ids.branch, yesterday]);
  check('(a6) scheduled generation skips an existing manual report and never overwrites it', cronResponse.status === 200 && cronData.eodReports.skipped >= 1 && scheduledRows[0]?.revision === 1 && scheduledRows[0]?.generation_source === 'MANUAL', { cronData, scheduledRows });

  // Report for TODAY: opening 10.000 (rolled forward from yesterday's close), wastage 3.000, closing 7.000 = live qtyOnHand
  const genToday = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  check('(b) generate report for today succeeds (201)', genToday.status === 201, genToday.data);
  const matRowT = genToday.data.report.snapshotJson.rawMaterials.find((r) => r.rawMaterialId === ids.mat);
  check('(b2) today: opening 10.000, wastage 3.000, closing 7.000 = currentQtyOnHand, reconciled', matRowT?.openingQty === '10.000' && matRowT?.wastageQty === '3.000' && matRowT?.closingQty === '7.000' && matRowT?.currentQtyOnHand === '7.000' && matRowT?.reconciled === true, matRowT);
  check('(b3) today: prepared/expiry counts are real numbers (live day)', typeof genToday.data.report.snapshotJson.preparedLowStockCount === 'number', genToday.data.report.snapshotJson);

  // --- Scenario B: regeneration overwrites in place, superseded snapshot preserved in auditLog ---
  const regen = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  check('(c) regenerating the same (branch, date) report returns 200, regenerated:true', regen.status === 200 && regen.data.regenerated === true, regen.data);
  const { rows: auditRows } = await pool.query(`select metadata_json from audit_log where action='EOD_STOCK_REPORT_SUPERSEDED' and entity_id=$1`, [`${ids.branch}:${today}`]);
  check('(c2) the superseded snapshot and revision metadata were preserved in auditLog', auditRows.length === 1 && auditRows[0].metadata_json.revision === 1 && auditRows[0].metadata_json.snapshotJson.rawMaterials.find((r) => r.rawMaterialId === ids.mat)?.closingQty === '7.000', auditRows);
  const { rows: reportRows } = await pool.query(`select count(*)::int as n from eod_stock_reports where branch_id=$1 and report_date=$2`, [ids.branch, today]);
  check('(c3) exactly one current report row remains (no duplicate version rows)', reportRows[0].n === 1, reportRows);
  const replayKey = crypto.randomUUID();
  const revisionWrite = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today, requestKey: replayKey, regenerate: true });
  const revisionReplay = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today, requestKey: replayKey, regenerate: true });
  check('(c4) a genuine new regeneration increments revision exactly once', revisionWrite.data.report.revision === 3 && revisionWrite.data.regenerated === true, revisionWrite.data);
  check('(c5) the same requestKey replays the saved row without another revision', revisionReplay.data.replayed === true && revisionReplay.data.report.revision === 3, revisionReplay.data);
  const noRegenerate = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today, requestKey: crypto.randomUUID(), regenerate: false });
  check('(c6) existing report with regenerate=false returns the existing revision unchanged', noRegenerate.data.skipped === true && noRegenerate.data.report.revision === 3, noRegenerate.data);

  // --- Scenario C: stock-transfer receive side is included (central -> branch credit) ---
  await pool.query(`insert into warehouses(id,type,branch_id,name) values($1,'CENTRAL',NULL,'QA EOD Central'), ($2,'BRANCH',$3,'QA EOD Branch WH')`, [ids.central, ids.branchWh, ids.branch]);
  await pool.query(`insert into stock_batches(id,warehouse_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status) values('qa-eod-src-batch',$1,$2,'LOT-EOD-1','5.000','5.000','UNKNOWN')`, [ids.central, ids.mat]);
  await pool.query(`insert into stock_transfers(id,from_warehouse_id,to_warehouse_id,raw_material_id,qty_dispatched,dispatched_by_id) values('qa-eod-transfer-1',$1,$2,$3,'5.000',$4)`, [ids.central, ids.branchWh, ids.mat, ids.owner]);
  await pool.query(`insert into batch_transfer_allocations(id,transfer_id,batch_id,origin_batch_id,batch_no,expiry_status,qty_dispatched,actor_id) values('qa-eod-alloc-1','qa-eod-transfer-1','qa-eod-src-batch','qa-eod-src-batch','LOT-EOD-1','UNKNOWN','5.000',$1)`, [ids.owner]);
  await pool.query(`update inventory_stock set min_stock_level='15.000', max_stock_level='20.000' where branch_id=$1 and raw_material_id=$2`, [ids.branch, ids.mat]);
  const pendingInbound = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  const pendingInboundRow = pendingInbound.data.report.snapshotJson.rawMaterials.find((r) => r.rawMaterialId === ids.mat);
  check('(d0) below-min row reports transfer in transit and inbound-pending reorder status', pendingInboundRow?.transferInTransitQty === '5.000' && pendingInboundRow?.totalInboundQty === '5.000' && pendingInboundRow?.reorderStatus === 'BELOW_MIN_INBOUND_PENDING', pendingInboundRow);
  const receive = await req(cookieMgr, 'POST', '/api/stock-transfers/qa-eod-transfer-1/receive', { qtyReceived: '5.000' });
  check('(setup) real transfer-receive endpoint credits the branch (200)', receive.status === 200, receive.data);

  const genToday2 = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  const matRowT2 = genToday2.data.report.snapshotJson.rawMaterials.find((r) => r.rawMaterialId === ids.mat);
  check('(d) transfer-in is included in receipts/closing, reconciled', matRowT2?.receiptsQty === '5.000' && matRowT2?.closingQty === '12.000' && matRowT2?.currentQtyOnHand === '12.000' && matRowT2?.reconciled === true, matRowT2);

  // --- Access control ---
  const crossBranch = await req(cookieMgr2, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  check('(e) a manager scoped to a different branch cannot generate this branch\'s report (403)', crossBranch.status === 403, crossBranch.data);
  const noInventory = await req(cookieNoInv, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  check('(e2) a same-branch user without INVENTORY cannot generate a report (403)', noInventory.status === 403, noInventory.data);

  const future = new Date(Date.now() + 3 * 60 * 60 * 1000 + 2 * 86400000).toISOString().slice(0, 10);
  const futureReport = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: future });
  check('(f) a future reportDate is rejected (400)', futureReport.status === 400, futureReport.data);

  // Stored past-day snapshots remain stable even after a later transfer.
  const savedYesterday = await req(cookieMgr, 'GET', `/api/reports/eod-stock?branchId=${ids.branch}&reportDate=${yesterday}`);
  check('(g) saved yesterday snapshot is unchanged after today transfer', savedYesterday.status === 200 && savedYesterday.data.report.snapshotJson.rawMaterials[0].closingQty === '10.000', savedYesterday.data);
  const crossRead = await req(cookieMgr2, 'GET', `/api/reports/eod-stock?branchId=${ids.branch}&reportDate=${yesterday}`);
  check('(h) cross-branch read rejected', crossRead.status === 403, crossRead.data);
  const noDate = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: '' });
  check('(i) blank date rejected', noDate.status === 400, noDate.data);
  const noBranch = await req(cookieOwner, 'POST', '/api/reports/eod-stock', { branchId: '', reportDate: today });
  check('(j) blank branch rejected even for Owner', noBranch.status === 400, noBranch.data);

  // A signed fractional count adjustment must retain '-0.125', never '0.-125'.
  await pool.query(`insert into stock_movements(id,branch_id,item_type,raw_material_id,movement_type,qty_delta,idempotency_key,source_type,source_id,actor_id) values('qa-eod-adjust',$1,'RAW_MATERIAL',$2,'PHYSICAL_COUNT_ADJUST','-0.125','qa-eod-adjust','STOCK_COUNT','qa-eod-count',$3)`, [ids.branch, ids.mat, ids.mgr]);
  await pool.query(`update inventory_stock set qty_on_hand=qty_on_hand-0.125 where branch_id=$1`, [ids.branch]);
  const adjusted = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  check('(k) signed fractional adjustment is correctly formatted', adjusted.data.report.snapshotJson.rawMaterials[0].adjustQty === '-0.125', adjusted.data);

  // Deliberate untracked stock cannot become an invented historical opening.
  await pool.query(`update inventory_stock set qty_on_hand=qty_on_hand+1 where branch_id=$1`, [ids.branch]);
  const incomplete = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: yesterday });
  const unknown = incomplete.data.report.snapshotJson.rawMaterials[0];
  check('(l) incomplete history withholds historical balances with a reason', unknown.openingQty === null && unknown.closingQty === null && unknown.reconciled === false && !!unknown.balanceUnavailableReason, unknown);

  // Seven-day expiry window is inclusive, distinct from expired/unknown lots.
  const todayUtc = Date.parse(`${today}T00:00:00Z`);
  for (const [days, field, expected] of [[7, 'expiringSoonBatchCount', 1], [8, 'expiringSoonBatchCount', 0], [-1, 'expiredBatchCount', 1]]) {
    const expiry = new Date(todayUtc + days * 86400000).toISOString().slice(0, 10);
    await pool.query(`update stock_batches set expiry_date=$1, expiry_status='DATED' where id='qa-eod-batch-1'`, [expiry]);
    await pool.query(`insert into batch_movements(id,batch_id,qty_delta,source_type,source_id,actor_id,metadata) values($1,'qa-eod-batch-1','0.000','BATCH_VERIFY',$1,$2,$3::jsonb)`, [`qa-eod-verify-${days}`, ids.owner, JSON.stringify({ expiryStatus: 'DATED', expiryDate: expiry })]);
    const expiryReport = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
    check(`expiry boundary ${days} days: ${field}=${expected}`, expiryReport.data.report.snapshotJson[field] === expected, expiryReport.data);
  }
  await pool.query(`update stock_batches set expiry_date=null, expiry_status='UNKNOWN' where id='qa-eod-batch-1'`);
  await pool.query(`insert into batch_movements(id,batch_id,qty_delta,source_type,source_id,actor_id,metadata) values('qa-eod-verify-unknown','qa-eod-batch-1','0.000','BATCH_VERIFY','qa-eod-verify-unknown',$1,$2::jsonb)`, [ids.owner, JSON.stringify({ expiryStatus: 'UNKNOWN', expiryDate: null })]);
  const heldReport = await req(cookieMgr, 'POST', '/api/reports/eod-stock', { branchId: ids.branch, reportDate: today });
  check('unknown expiry is held, not counted as expiring-soon', heldReport.data.report.snapshotJson.unknownExpiryBatchCount >= 1 && heldReport.data.report.snapshotJson.expiringSoonBatchCount === 0, heldReport.data);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail.map((f) => f.label) }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (err) => { console.error(err); try { await cleanup(); } catch (e) { console.error('Cleanup failure:', e.message); } await pool.end(); process.exit(1); });
