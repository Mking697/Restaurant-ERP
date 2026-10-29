// Local-only disposable DB + dedicated app, never port 3000 or shared DB.
// PGDATABASE=restaurant_erp_dashrpt_qa_20261028 DASHBOARD_QA_DATABASE=<same>
// BASE_URL=http://127.0.0.1:4317 node tests/dashboard-reports.integration.cjs
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_dashrpt_qa_\d{8}$/);
assert.equal(process.env.DASHBOARD_QA_DATABASE, process.env.PGDATABASE);
const base = new URL(process.env.BASE_URL || '');
assert.ok(base.hostname === '127.0.0.1' && base.protocol === 'http:' && base.port !== '3000' && base.port);
const pool = new Pool({ host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
const tokens = Object.fromEntries(['owner', 'manager', 'narrow'].map((k) => [k, crypto.randomBytes(32).toString('hex')]));
let fixturesOwned = false;
const results = [];
const check = (name, ok, detail) => { results.push({ name, pass: !!ok }); if (!ok) console.error('FAIL', name, JSON.stringify(detail)); };
async function req(path, who = 'owner', method = 'GET', origin = base.origin, body) {
  const response = await fetch(base.origin + path, { method, headers: { ...(who ? { cookie: `restaurant_session=${tokens[who]}` } : {}), origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let data; try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data };
}
const q = (text, values) => pool.query(text, values);
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
async function cleanup() {
  if (!fixturesOwned) return;
  // Guarded disposable target only. Nothing in this harness accepts prod/shared DBs.
  await q('truncate table branches, users, raw_materials, vendors cascade');
}
async function main() {
  assert.equal((await q('select current_database() as db')).rows[0].db, process.env.PGDATABASE);
  assert.equal(Number((await q('select count(*) as n from branches')).rows[0].n), 0, 'QA DB must start empty; do not destroy pre-existing fixtures');
  fixturesOwned = true;
  await q("insert into branches(id,name,code,lat,lng) values ('qadr-a','QA Dashboard A','QADRA',0,0),('qadr-b','QA Dashboard B','QADRB',0,0)");
  await q("insert into users(id,name,phone_e164,role,branch_id,module_access) values ('qadr-owner','QA Dashboard Owner','+919000001701','SUPER_ADMIN',null,'{}'),('qadr-manager','QA Dashboard Manager','+919000001702','BRANCH_MANAGER','qadr-a','{DASHBOARD_OWNER,REPORTS,MIS_PERFORMANCE,INVENTORY,AGGREGATOR_RECON}'),('qadr-narrow','QA Narrow','+919000001703','KITCHEN_STAFF','qadr-a','{}')");
  for (const [who, token] of Object.entries(tokens)) await q("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [crypto.createHash('sha256').update(token).digest('hex'), `qadr-${who}`]);
  // A random session exists only in the approved DB: readback binds the app
  // before relying on any HTTP mutation endpoint (MIS compute).
  const me = await req('/api/auth/me');
  assert.equal(me.data?.user?.id, 'qadr-owner', 'QA app is not bound to the approved disposable DB');
  await q("insert into raw_materials(id,name,unit) values ('qadr-rice','QA Rice','kg'),('qadr-missing','QA Missing Rate','kg')");
  await q("insert into vendors(id,name,phone_e164) values ('qadr-v1','QA Vendor 1','+919000001704'),('qadr-v2','QA Vendor 2','+919000001705')");
  await q("insert into vendor_rates(id,vendor_id,raw_material_id,rate,locked_at) values ('qadr-rate1','qadr-v1','qadr-rice',10,now()-interval '1 day'),('qadr-rate2','qadr-v2','qadr-rice',20,now())");
  await q("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values ('qadr-stock1','qadr-a','qadr-rice',5),('qadr-stock2','qadr-a','qadr-missing',7)");
  await q("insert into menu_items(id,branch_id,name,price) values ('qadr-dish','qadr-a','QA Dish',50),('qadr-norecipe','qadr-a','QA No Recipe',100),('qadr-bdish','qadr-b','QA B Dish',200)");
  await q("insert into bom_recipes(id,branch_id,menu_item_id,raw_material_id,qty_per_unit) values ('qadr-bom','qadr-a','qadr-dish','qadr-rice',1)");
  const now = new Date(), today = dayKey(now), yesterday = dayKey(new Date(now.getTime() - 86400000));
  const beforeToday = new Date(new Date(`${today}T00:00:00+05:30`).getTime() - 1000);
  async function order(id, branch, total, qty, item, opts = {}) {
    await q("insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,cashier_id,status,owner_only,created_at) values($1,$2,$1,$3,$4,$4,'CASH','qadr-owner',$5,$6,$7)", [id, branch, opts.channel || 'DINE_IN', total, opts.void ? 'VOIDED' : 'COMPLETED', !!opts.private, opts.at || new Date(now.getTime() - 2000)]);
    if (item) await q('insert into pos_order_lines(id,order_id,menu_item_id,qty,price) values($1,$2,$3,$4,$5)', [id+'-l', id, item, qty, (total / qty).toFixed(2)]);
  }
  await order('qadr-sale', 'qadr-a', 100, 2, 'qadr-dish');
  await order('qadr-private', 'qadr-a', 50, 1, 'qadr-dish', { private: true, channel: 'SWIGGY' });
  await order('qadr-void', 'qadr-a', 900, 1, 'qadr-dish', { void: true });
  await order('qadr-yesterday', 'qadr-a', 30, 1, 'qadr-dish', { at: beforeToday });
  await order('qadr-bsale', 'qadr-b', 200, 1, 'qadr-bdish');
  await q("insert into task_instances(id,branch_id,type,title,assigned_to_id,due_at,status,completed_at) values ('qadr-overdue','qadr-a','RECURRING','Overdue','qadr-manager',now()-interval '1 hour','PENDING',null),('qadr-done','qadr-a','RECURRING','Done','qadr-manager',now()-interval '2 hours','DONE',now()-interval '3 hours'),('qadr-skip','qadr-a','RECURRING','Skipped','qadr-manager',now()-interval '1 hour','SKIPPED',null)");
  await q("insert into night_variance_entries(id,branch_id,raw_material_id,shift_date,theoretical_qty,physical_qty,variance_qty,variance_value_inr,chef_on_duty_id,flagged_pilferage) values ('qadr-flag','qadr-a','qadr-rice',$1,10,8,-2,-20,'qadr-manager',true)", [today]);
  await q("insert into branch_shifts(id,branch_id,label,start_time,end_time,sort_order) values ('qadr-def','qadr-a','QA Shift','00:00','00:00',1)");
  await q("insert into shift_runs(id,branch_id,shift_definition_id,label,status,started_at,ended_at,started_by) values ('qadr-run','qadr-a','qadr-def','QA Closing','ENDED',$1,$2,'qadr-owner'),('qadr-next','qadr-a','qadr-def','QA Open','OPEN',$2,null,'qadr-owner')", [new Date(`${yesterday}T23:50:00+05:30`), new Date(`${today}T00:01:00+05:30`)]);
  await q("insert into cash_drops(id,branch_id,cashier_id,shift_date,expected_cash_inr,counted_cash_inr,shortage_excess_inr,shift_run_id) values ('qadr-closing','qadr-a','qadr-owner',$1,150,140,-10,'qadr-run'),('qadr-offcycle','qadr-a','qadr-manager',now(),999,0,-999,'')", [new Date(`${yesterday}T23:50:00+05:30`)]);
  await q("insert into shift_handovers(id,branch_id,from_run_id,to_run_id,closing_cash_drop_id,cash_amount,card_amount,upi_amount) values ('qadr-handover','qadr-a','qadr-run','qadr-next','qadr-closing',140,0,0)");
  await q("insert into aggregator_orders(id,branch_id,channel,order_value,commission_amount,ads_amount,refund_penalty,net_payout,order_date) values ('qadr-agg','qadr-a','SWIGGY',100,10,5,0,85,now())");

  const routes = ['/api/dashboard/kpis', '/api/reports/sales-trend', '/api/reports/food-cost', '/api/reports/cash-reconciliation'];
  for (const path of routes) {
    check(`${path}: anonymous denied`, (await req(path, null)).status === 401);
    check(`${path}: unknown branch rejected`, (await req(path+'?branchId=missing')).status === 404);
    check(`${path}: missing grant denied`, (await req(path, 'narrow')).status === 403);
    check(`${path}: cross-branch denied`, (await req(path+'?branchId=qadr-b', 'manager')).status === 403);
    check(`${path}: mutation method not exposed (CSRF-safe read-only)`, (await req(path, 'owner', 'POST', 'https://evil.example', {})).status === 405);
  }
  const emptyMis = await req('/api/dashboard/kpis?branchId=qadr-b');
  check('missing MIS and closed shift are honest nulls', emptyMis.status === 200 && emptyMis.data.branches[0].misScore === null && emptyMis.data.branches[0].cashVarianceInr === null, emptyMis);
  // Section 3b never inserts mis_scores, even in this harness: use 3a's real compute.
  const computed = await req('/api/mis/compute', 'owner', 'POST', base.origin, { branchId: 'qadr-a', periodStart: new Date(now.getTime() - 2*86400000).toISOString(), periodEnd: now.toISOString() });
  check('real MIS compute endpoint available', computed.status === 200, computed);
  const storedMis = (await q("select total_score from mis_scores where branch_id='qadr-a' and user_id is null")).rows[0];
  const k = await req('/api/dashboard/kpis');
  const a = k.data?.branches?.find((b) => b.branchId === 'qadr-a');
  check('Owner compiled branches real', k.status === 200 && k.data.branches.length === 2, k);
  check('today completed revenue includes private and excludes voided/yesterday', a?.revenueToday === 150, a);
  check('MTD real sales total', a?.revenueMtd === 180, a);
  check('inventory latest-known rate (20), excludes missing with count', a?.totalInventoryValueInr === 100 && a?.ratesMissingForCount === 1 && a.materialsMissingRateIds.includes('qadr-missing'), a);
  check('overdue pending counts; done/skipped excluded', a?.openTasksOverdue === 1, a);
  check('pilferage trailing flags', a?.pilferageFlags === 1, a);
  check('MIS read endpoint value matches persisted engine result', storedMis && a?.misScore === Number(storedMis.total_score), a);
  check('latest actual closed handover variance, not off-cycle', a?.cashVarianceInr === -10, a);
  check('prime cost null with reason', a?.primeCostPercent === null && !!a?.primeCostNote, a);
  check('food cost real BOM/current-rate estimate', a?.foodCostPercent === 22.2, a); // 4 sold units * 10 / 180
  const km = await req('/api/dashboard/kpis', 'manager');
  check('manager default own branch only', km.data?.branches?.length === 1 && km.data.branches[0].branchId === 'qadr-a', km);
  check('manager operational visibility excludes private sale', km.data?.branches?.[0]?.revenueToday === 100, km);
  const trend = await req('/api/reports/sales-trend?days=3', 'manager');
  check('trend contains exactly N consecutive day buckets', trend.status === 200 && trend.data.trend.length === 3, trend);
  check('IST grouping today and just-before-midnight yesterday', trend.data?.trend?.find((d) => d.date === today)?.revenueInr === '100.00' && trend.data.trend.find((d) => d.date === yesterday)?.revenueInr === '30.00', trend);
  check('zero-sale day is real zero bucket', trend.data?.trend?.[0]?.revenueInr === '0.00', trend);
  check('invalid days rejected', (await req('/api/reports/sales-trend?days=91')).status === 400);
  check('invalid month rejected', (await req('/api/reports/food-cost?month=2026-13')).status === 400);
  check('invalid date rejected', (await req('/api/reports/cash-reconciliation?from=2026-02-30')).status === 400);
  check('reversed range rejected', (await req('/api/reports/cash-reconciliation?from=2026-11-01&to=2026-10-01')).status === 400);
  const food = await req('/api/reports/food-cost?branchId=qadr-a');
  check('food report sold qty and COGS real', food.data?.cogsInr === '40.00' && food.data.items[0].qtySold === 4, food);
  const allFood = await req('/api/reports/food-cost');
  check('food report supports Owner all-branch summaries', allFood.data?.branches?.length === 2, allFood);
  check('branch B missing recipe explicit null and excluded item', allFood.data?.branches?.find((b) => b.branchId === 'qadr-b')?.foodCostPercent === null && allFood.data.branches.find((b) => b.branchId === 'qadr-b').excludedMenuItems.length === 1, allFood);
  const cash = await req(`/api/reports/cash-reconciliation?from=${today}&to=${today}`, 'manager');
  check('cash filters CLOSED date not shift start date; excludes off-cycle', cash.data?.rows?.length === 1 && cash.data.rows[0].cashDropId === 'qadr-closing', cash);
  check('cash retains actual stored values including private cash', cash.data?.rows?.[0]?.expectedCashInr === '150.00' && cash.data?.summary?.totalShortageExcessInr === '-10.00', cash);
  check('cash report foreign branch denied', (await req('/api/reports/cash-reconciliation?branchId=qadr-b', 'manager')).status === 403);
  const agg = await req(`/api/accounts/aggregator-orders?month=${today.slice(0,7)}`, 'manager');
  check('existing aggregator endpoint returns real scoped payout', agg.status === 200 && agg.data.orders[0].netPayout === '85.00', agg);
  await q("update vendor_rates set is_active=false where raw_material_id='qadr-rice'");
  const missing = await req('/api/reports/food-cost?branchId=qadr-a');
  check('missing active vendor rates returns null, not zero COGS', missing.data?.foodCostPercent === null && missing.data?.cogsInr === null && /qadr-rice/.test(missing.data?.excludedMenuItems?.[0]?.reason), missing);
  const missingKpi = await req('/api/dashboard/kpis?branchId=qadr-a');
  check('dashboard incomplete food cost null with reason', missingKpi.data?.branches?.[0]?.foodCostPercent === null && !!missingKpi.data.branches[0].foodCostNote, missingKpi);
  await q("update vendor_rates set is_active=true where raw_material_id='qadr-rice'");
  await order('qadr-nolines', 'qadr-a', 17, 1, null);
  const noLines = await req('/api/reports/food-cost?branchId=qadr-a');
  check('completed sale missing lines cannot silently understate COGS', noLines.data?.cogsInr === null && noLines.data.excludedOrders?.[0]?.orderId === 'qadr-nolines' && noLines.data.revenueInr === '197.00', noLines);
  await q("update users set module_access='{DASHBOARD_OWNER}' where id='qadr-manager'");
  const limited = await req('/api/dashboard/kpis', 'manager');
  check('Dashboard-only user retains own-branch KPIs', limited.status === 200 && limited.data.branches.length === 1 && limited.data.branches[0].branchId === 'qadr-a', limited);
  check('Dashboard-only user cannot inherit MIS grant', limited.data?.branches?.[0]?.misScore === null && /MIS_PERFORMANCE/.test(limited.data.branches[0].misScoreNote), limited);
  check('Dashboard grant does not broaden shared Reports endpoint', (await req('/api/reports/sales-trend', 'manager')).status === 403);
  const failures = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, passed: results.length-failures.length, failed: failures.length, failures }, null, 2));
  assert.equal(failures.length, 0);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { try { await cleanup(); } catch(e) { console.error('Cleanup failed',e); process.exitCode=1; } await pool.end(); });
