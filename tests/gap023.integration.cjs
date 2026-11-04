// Parent-run only: real HTTP + migrated disposable PostgreSQL; no mocks/providers.
// PGHOST=127.0.0.1 PGPORT=5440 PGDATABASE=restaurant_erp_gap023_qa_20261103
// BASE_URL=http://localhost:3123 node tests/gap023.integration.cjs [--keep]
// PGUSER/PGPASSWORD must be supplied by the parent; deliberately never load .env.
'use strict';
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');

const DATABASE = 'restaurant_erp_gap023_qa_20261103';
const BASE = 'http://localhost:3123';
assert.equal(process.env.PGHOST, '127.0.0.1', 'GAP023 guard: explicit loopback PGHOST required');
assert.equal(process.env.PGPORT, '5440', 'GAP023 guard: dedicated PGPORT required');
assert.equal(process.env.PGDATABASE, DATABASE, 'GAP023 guard: exact disposable database required');
assert.equal(process.env.BASE_URL, BASE, 'GAP023 guard: exact dedicated app URL required');
assert.ok(process.argv.slice(2).every(arg => arg === '--keep'), 'Only --keep is supported');
const keep = process.argv.includes('--keep');
const pool = new Pool({ host: '127.0.0.1', port: 5440, database: DATABASE,
  user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false,
  connectionTimeoutMillis: 10000, query_timeout: 30000, max: 4 });
const fresh = () => 'g23-' + randomUUID();
const ids = Object.fromEntries(['fast','conventional','other','owner','manager','cashier','peer','outsider','noModule','vendor','foodRaw','barRaw','scarceRaw','expiredRaw','food','drink','fastFood','otherFood','scarce','expired','foodBom','barBom','shiftA','shiftB','runA','runB','legacy','legacyLine','voided'].map(k => [k, fresh()]));
const branchIds = [ids.fast, ids.conventional, ids.other];
const rawIds = [ids.foodRaw, ids.barRaw, ids.scarceRaw, ids.expiredRaw];
const userIds = [ids.owner, ids.manager, ids.cashier, ids.peer, ids.outsider, ids.noModule];
const tokens = new Map(); // Never print, serialize, or save session credentials.
const orderIds = new Set();
let bound = false, seeded = false, checks = 0, phase = 'guards';
function equal(name, actual, expected) { assert.deepEqual(actual, expected, phase + ': ' + name); checks++; console.log('PASS ' + name); }
function ok(name, condition) { assert.ok(condition, phase + ': ' + name); checks++; console.log('PASS ' + name); }
const q = (sql, args = []) => pool.query(sql, args);
const row = async (sql, args) => (await q(sql, args)).rows[0];
const orderPath = id => '/api/pos/orders/' + encodeURIComponent(id);
const linesPath = id => orderPath(id) + '/lines';
const settlePath = id => orderPath(id) + '/settle';
async function http(name, actor, pathname, input, expected = 200, method = input === undefined ? 'GET' : 'POST') {
  const response = await fetch(BASE + pathname, { method, redirect: 'error', signal: AbortSignal.timeout(90000),
    headers: { origin: BASE, 'content-type': 'application/json', ...(actor ? { cookie: 'restaurant_session=' + tokens.get(actor) } : {}) },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { assert.fail(name + ': non-JSON HTTP ' + response.status); }
  // Do not dump bodies: auth/me contains a session token in some implementations.
  equal(name + ' HTTP', response.status, expected);
  if (data.order?.id) orderIds.add(data.order.id);
  if (data.branch?.id && !branchIds.includes(data.branch.id)) branchIds.push(data.branch.id);
  return data;
}
async function bindApp() {
  const me = await http('app/DB binding: fixture session', 'owner', '/api/auth/me');
  equal('app recognizes exact seeded fixture owner', me.user?.id, ids.owner);
  const branch = await http('app/DB binding: fixture branch', 'owner', '/api/branches/' + ids.conventional);
  equal('app reads exact seeded fixture branch', branch.branch?.id, ids.conventional);
  equal('app reads unpredictable fixture branch code', branch.branch?.code, ids.conventional.slice(0, 28));
  bound = true;
}
async function bootstrap() {
  equal('connected database identity', (await row('select current_database() db')).db, DATABASE);
  const c = await pool.connect();
  try {
    await c.query('begin');
    for (const id of branchIds) await c.query('insert into branches(id,code,name,lat,lng,vat_rate_percent) values($1,$2,$3,0,0,0)', [id, id.slice(0,28), 'Synthetic GAP023 ' + id]);
    for (const [actor, role, branch, grants] of [
      ['owner','SUPER_ADMIN',null,[]], ['manager','BRANCH_MANAGER',ids.conventional,['POS_CASHIER']],
      ['cashier','CASHIER',ids.conventional,['POS_CASHIER','CASH_DROP']], ['peer','CASHIER',ids.conventional,['POS_CASHIER']],
      ['outsider','CASHIER',ids.other,['POS_CASHIER']], ['noModule','CASHIER',ids.conventional,[]],
    ]) {
      await c.query("insert into users(id,name,phone_e164,role,branch_id,module_access,status) values($1,$2,$3,$4,$5,$6,'Active')", [ids[actor], 'Synthetic GAP023 ' + actor, 'QA-NONROUTABLE-' + ids[actor], role, branch, grants]);
      const token = randomBytes(32).toString('hex'); tokens.set(actor, token);
      await c.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '4 hours')", [createHash('sha256').update(token).digest('hex'), ids[actor]]);
    }
    await c.query('commit'); seeded = true;
  } catch (error) { await c.query('rollback'); throw error; } finally { c.release(); }
  await bindApp(); // NO destructive SQL before this unpredictable-session/branch proof.
}
async function fixtures() {
  for (const id of rawIds) await q("insert into raw_materials(id,name,unit) values($1,$1,'kg')", [id]);
  await q("insert into vendors(id,name,phone_e164,status) values($1,$1,$2,'APPROVED')", [ids.vendor, 'QA-NONROUTABLE-' + ids.vendor]);
  for (const [raw, rate] of [[ids.foodRaw,'200.00'],[ids.barRaw,'100.00'],[ids.scarceRaw,'50.00'],[ids.expiredRaw,'75.00']]) {
    await q('insert into vendor_rates(id,vendor_id,raw_material_id,rate) values($1,$2,$3,$4)', [fresh(), ids.vendor, raw, rate]);
  }
  for (const branch of [ids.fast,ids.conventional,ids.other]) {
    for (const raw of rawIds) {
      const qty = raw === ids.scarceRaw ? '0.100' : '100.000';
      await q('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,$4)', [fresh(),branch,raw,qty]);
      await q(`insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status,expiry_date)
        values($1,$2,$3,$1,$4,$4,$5,$6)`, [fresh(),branch,raw,qty,raw === ids.expiredRaw ? 'DATED' : 'NON_EXPIRING',raw === ids.expiredRaw ? '2000-01-01' : null]);
    }
  }
  for (const [id,branch,station,price,raw,qty,bom] of [
    [ids.food,ids.conventional,'KITCHEN','100.00',ids.foodRaw,'0.250',ids.foodBom],
    [ids.drink,ids.conventional,'BAR','50.00',ids.barRaw,'0.100',ids.barBom],
    [ids.fastFood,ids.fast,'KITCHEN','100.00',ids.foodRaw,'0.250',fresh()],
    [ids.otherFood,ids.other,'KITCHEN','100.00',ids.foodRaw,'0.250',fresh()],
    [ids.scarce,ids.conventional,'KITCHEN','40.00',ids.scarceRaw,'1.000',fresh()],
    [ids.expired,ids.conventional,'BAR','40.00',ids.expiredRaw,'1.000',fresh()],
  ]) {
    await q('insert into menu_items(id,branch_id,name,price,production_station,vat_rate_percent) values($1,$2,$1,$3,$4,0)', [id,branch,price,station]);
    await q("insert into bom_recipes(id,branch_id,menu_item_id,component_type,raw_material_id,qty_per_unit) values($1,$2,$3,'RAW_MATERIAL',$4,$5)", [bom,branch,id,raw,qty]);
  }
  // Explicit SQL shift fixtures; HTTP end/accept will prove collection accounting.
  for (const [id,label,start,end,sort] of [[ids.shiftA,'A','00:00','12:00',0],[ids.shiftB,'B','12:00','00:00',1]]) {
    await q('insert into branch_shifts(id,branch_id,label,start_time,end_time,sort_order) values($1,$2,$3,$4,$5,$6)',[id,ids.conventional,label,start,end,sort]);
  }
  await q("insert into shift_runs(id,branch_id,shift_definition_id,label,started_by) values($1,$2,$3,'A',$4)",[ids.runA,ids.conventional,ids.shiftA,ids.cashier]);
}
function createBody(branch = ids.conventional, lines = [{ menuItemId: ids.food, qty: 1 }], extra = {}) {
  return { branchId: branch, channel: 'DINE_IN', tableNo: 'QA-T1', lines, idempotencyKey: randomUUID(), ...extra };
}
const dbOrder = id => row('select * from pos_orders where id=$1',[id]);
async function snapshot(branch = ids.conventional) {
  const output = {};
  for (const table of ['pos_orders','pos_production_tickets','pos_receipts','pos_order_attempts','inventory_stock','stock_batches','stock_movements']) {
    output[table] = (await q(`select * from ${table} where branch_id=$1 order by id`, [branch])).rows;
  }
  output.lines = (await q('select l.* from pos_order_lines l join pos_orders o on o.id=l.order_id where o.branch_id=$1 order by l.id',[branch])).rows;
  output.ticketLines = (await q('select l.* from pos_production_ticket_lines l join pos_production_tickets t on t.id=l.ticket_id where t.branch_id=$1 order by l.id',[branch])).rows;
  output.batchMovements = (await q('select m.* from batch_movements m join stock_batches b on b.id=m.batch_id where b.branch_id=$1 order by m.id',[branch])).rows;
  return output;
}
async function unchanged(name, action, branch = ids.conventional) {
  const before = await snapshot(branch); await action(); equal(name + ': full SQL state unchanged', await snapshot(branch), before);
}
async function stock(branch = ids.conventional) {
  return (await q(`select s.raw_material_id,s.qty_on_hand,
    (select sum(b.qty_remaining)::numeric(12,3)::text from stock_batches b where b.branch_id=s.branch_id and b.raw_material_id=s.raw_material_id) lots
    from inventory_stock s where s.branch_id=$1 order by s.raw_material_id`,[branch])).rows;
}
async function counts(id) {
  return row(`select (select count(*)::int from pos_order_lines where order_id=$1) lines,
    (select count(*)::int from pos_production_tickets where order_id=$1) tickets,
    (select count(*)::int from pos_receipts where order_id=$1) receipts,
    (select count(*)::int from pos_order_attempts where order_id=$1) attempts`,[id]);
}
function tickets(name, data, expected) {
  equal(name + ': station/type split', data.tickets.map(t => [t.station,t.ticketType]).sort(), expected.map(x=>x.slice()).sort());
  for (const ticket of data.tickets) for (const line of ticket.lines) {
    ok(name + ': production ticket has no money fields', !Object.keys(line).some(k=>/price|amount|tax|total|cost/i.test(k)));
  }
}
async function guardsAndPayment() {
  phase = 'concept and payment-first';
  equal('SQL omitted concept defaults FAST_FOOD', (await row('select operating_concept from branches where id=$1',[ids.fast])).operating_concept, 'FAST_FOOD');
  const made = await http('owner creates default branch', 'owner','/api/branches',{code:fresh().slice(0,28),name:'Synthetic GAP023 API default',lat:'0',lng:'0'},201);
  equal('API omitted concept defaults FAST_FOOD',made.branch.operatingConcept,'FAST_FOOD');
  await http('manager cannot create concept branch','manager','/api/branches',{code:fresh().slice(0,28),name:'Denied',lat:'0',lng:'0',operatingConcept:'CONVENTIONAL'},403);
  await http('manager cannot change operating concept','manager','/api/branches/'+ids.conventional,{operatingConcept:'CONVENTIONAL'},403,'PATCH');
  equal('denied concept change preserved value',(await row('select operating_concept from branches where id=$1',[ids.conventional])).operating_concept,'FAST_FOOD');
  await http('invalid concept rejected','owner','/api/branches/'+ids.conventional,{operatingConcept:'INVALID'},400,'PATCH');
  const changed = await http('owner changes concept','owner','/api/branches/'+ids.conventional,{operatingConcept:'CONVENTIONAL'},200,'PATCH');
  equal('owner concept persisted',changed.branch.operatingConcept,'CONVENTIONAL');
  for (const [actor,status] of [[null,401],['outsider',403],['noModule',403]]) {
    await unchanged('create denial '+actor,()=>http('create denial '+actor,actor,'/api/pos/orders',createBody(),status));
    await http('POS list denial '+actor,actor,'/api/pos/orders?branchId='+ids.conventional,undefined,status);
  }
  await unchanged('missing conventional table rollback',()=>http('conventional table required','cashier','/api/pos/orders',createBody(undefined,undefined,{tableNo:''}),400));
  await unchanged('missing key rollback',()=>http('idempotency key required','cashier','/api/pos/orders',{...createBody(),idempotencyKey:undefined},400));
  await unchanged('cross-branch menu rollback',()=>http('foreign menu rejected','cashier','/api/pos/orders',createBody(undefined,[{menuItemId:ids.otherFood,qty:1}]),400));
  await unchanged('visibility injection rollback',()=>http('create cannot set visibility','cashier','/api/pos/orders',{...createBody(),ownerOnly:true},400));
  const fast = createBody(ids.fast,[{menuItemId:ids.fastFood,qty:1}],{tenderType:'CASH'});
  const before = await stock(ids.fast);
  const paid = await race('concurrent fast create','owner','/api/pos/orders',fast);
  equal('fast food DINE_IN is PAID',paid.order.status,'PAID');
  equal('fast food flow',paid.order.flow,'PAYMENT_FIRST');
  equal('fast food receipt amount',paid.receipt?.totalAmount,'100.00');
  tickets('fast food',paid,[['KITCHEN','KOT']]);
  const fastDb = await dbOrder(paid.order.id);
  ok('fast food stock/settlement timestamps',!!fastDb.stock_deducted_at && !!fastDb.settled_at);
  ok('fast food deducted stock',JSON.stringify(await stock(ids.fast))!==JSON.stringify(before));
  const fastAfter=await stock(ids.fast);
  equal('fast food aggregate deduction exactly once',Number(fastAfter.find(r=>r.raw_material_id===ids.foodRaw).qty_on_hand),Number(before.find(r=>r.raw_material_id===ids.foodRaw).qty_on_hand)-0.25);
  equal('fast food lot deduction exactly once',Number(fastAfter.find(r=>r.raw_material_id===ids.foodRaw).lots),Number(before.find(r=>r.raw_material_id===ids.foodRaw).lots)-0.25);
  equal('concurrent fast create one persisted sale',await counts(paid.order.id),{lines:1,tickets:1,receipts:1,attempts:1});
  equal('no customer means no provider send',paid.whatsapp?.attempted,false);
  await unchanged('fast create exact replay',async()=>{const replay=await http('fast exact replay','owner','/api/pos/orders',fast); equal('fast replay identity',replay.order.id,paid.order.id);equal('fast replay flag',replay.replayed,true);},ids.fast);
  await unchanged('fast changed same key',()=>http('fast payload key conflict','owner','/api/pos/orders',{...fast,lines:[{menuItemId:ids.fastFood,qty:2}]},409),ids.fast);
  for (const channel of ['TAKEAWAY','SWIGGY','ZOMATO']) {
    const tenderType = channel==='TAKEAWAY' ? 'CARD' : channel;
    const result = await http('conventional '+channel+' payment-first','cashier','/api/pos/orders',createBody(undefined,undefined,{channel,tableNo:'',tenderType}),201);
    equal(channel+' PAID',result.order.status,'PAID');ok(channel+' receipt present',!!result.receipt?.receiptNumber);
  }
  await unchanged('missing payment tender',()=>http('takeaway requires tender','cashier','/api/pos/orders',createBody(undefined,undefined,{channel:'TAKEAWAY'}),400));
  await unchanged('paid order cannot add',()=>http('paid order add rejected','owner',linesPath(paid.order.id),{lines:[{menuItemId:ids.fastFood,qty:1}],idempotencyKey:randomUUID()},409),ids.fast);
}
// Race responses are permitted only to be one fresh 201 + one exact 200 replay.
async function race(name,actor,pathname,input) {
  const call = async () => {
    const response=await fetch(BASE+pathname,{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{origin:BASE,'content-type':'application/json',cookie:'restaurant_session='+tokens.get(actor)},body:JSON.stringify(input)});
    const data=await response.json(); if(data.order?.id)orderIds.add(data.order.id); return {status:response.status,data};
  };
  const replies=await Promise.all([call(),call()]);
  equal(name+' fresh/replay HTTP statuses',replies.map(r=>r.status).sort(),[200,201]);
  equal(name+' exactly one replay',replies.filter(r=>r.data.replayed===true).length,1);
  equal(name+' same order identity',replies[0].data.order?.id,replies[1].data.order?.id);
  const canonical = data => { const {replayed,whatsapp,...rest}=data; return rest; };
  equal(name+' same committed result',canonical(replies[0].data),canonical(replies[1].data));
  return replies.find(r=>r.status===201).data;
}
async function rollbackTests() {
  phase='atomic stock failure';
  for(const [name,item] of [['insufficient stock',ids.scarce],['only expired lots',ids.expired]]) {
    const payload=createBody(undefined,[{menuItemId:ids.food,qty:1},{menuItemId:item,qty:1}]);
    await unchanged(name+' create rollback',()=>http(name+' create fails','cashier','/api/pos/orders',payload,409));
    await unchanged(name+' payment-first rollback',()=>http(name+' payment-first fails','cashier','/api/pos/orders',{...payload,idempotencyKey:randomUUID(),channel:'TAKEAWAY',tenderType:'CASH'},409));
    const order=await http(name+' healthy open fixture','cashier','/api/pos/orders',createBody(),201);
    await unchanged(name+' added-line rollback',()=>http(name+' add fails','cashier',linesPath(order.order.id),{lines:payload.lines,idempotencyKey:randomUUID()},409));
  }
}
async function reportAssertions(name) {
  phase='reports: '+name;
  const month=(await row("select to_char(current_timestamp at time zone 'Africa/Dar_es_Salaam','YYYY-MM') as \"month\"")).month;
  const expected=await row(`select coalesce(sum(total_amount),0)::numeric(20,2)::text revenue,
    coalesce(sum(cogs_amount),0)::numeric(20,2)::text cogs,
    coalesce(bool_and(cogs_complete),true) complete from pos_orders
    where branch_id=$1 and status in ('PAID','COMPLETED')
    and (case when status='PAID' then coalesce(settled_at,created_at) else created_at end)>=(date_trunc('month',current_timestamp at time zone 'Africa/Dar_es_Salaam') at time zone 'Africa/Dar_es_Salaam')
    and (case when status='PAID' then coalesce(settled_at,created_at) else created_at end)<((date_trunc('month',current_timestamp at time zone 'Africa/Dar_es_Salaam')+interval '1 month') at time zone 'Africa/Dar_es_Salaam')`,[ids.conventional]);
  const pl=await http(name+' profit-loss','owner','/api/accounts/profit-loss?branchId='+ids.conventional+'&month='+month);
  equal(name+' P&L excludes unpaid OPEN revenue',pl.revenue,expected.revenue);
  equal(name+' P&L uses captured paid/legacy COGS',pl.cogs,expected.complete ? expected.cogs : null);
  const listing=await http(name+' POS summary','owner','/api/pos/orders?branchId='+ids.conventional);
  const today=await row(`select coalesce(sum(total_amount),0)::numeric(20,2)::text revenue from pos_orders where branch_id=$1 and status in ('PAID','COMPLETED') and (case when status='PAID' then coalesce(settled_at,created_at) else created_at end)>=(date_trunc('day',current_timestamp at time zone 'Africa/Dar_es_Salaam') at time zone 'Africa/Dar_es_Salaam') and (case when status='PAID' then coalesce(settled_at,created_at) else created_at end)<((date_trunc('day',current_timestamp at time zone 'Africa/Dar_es_Salaam')+interval '1 day') at time zone 'Africa/Dar_es_Salaam')`,[ids.conventional]);
  equal(name+' POS summary excludes unpaid OPEN',listing.salesSummary?.actualTotal,today.revenue);
  ok(name+' operational list retains unpaid tables',listing.orders.some(o=>o.status==='OPEN'));
  ok(name+' legacy COMPLETED order included',listing.orders.some(o=>o.id===ids.legacy && o.status==='COMPLETED'));
  const oldOpen=listing.orders.find(o=>o.id===ids.olderOpenOrder);
  equal(name+' yesterday OPEN retained',oldOpen?.status,'OPEN');
  equal(name+' older OPEN concept snapshot exposed',oldOpen?.operatingConcept,'CONVENTIONAL');
  if(name==='after settlement') {
    ok('today list includes paid order opened prior month',listing.orders.some(o=>o.id===ids.settlementOrder && o.status==='PAID'));
    const previous=(await row("select to_char(date_trunc('month',current_timestamp at time zone 'Africa/Dar_es_Salaam')-interval '1 day','YYYY-MM') as \"month\"")).month;
    const previousPl=await http('prior-month report after settlement','owner','/api/accounts/profit-loss?branchId='+ids.conventional+'&month='+previous);
    equal('prior opening month does not recognize today collection',previousPl.revenue,'0.00');
  }
}
async function hiddenOrderSecurity() {
  phase='owner-only order confidentiality';
  const input=createBody(undefined,undefined,{tableNo:'QA-PRIVATE'});
  const created=await http('cashier creates future private order','cashier','/api/pos/orders',input,201);
  const oid=created.order.id;ids.hiddenOrder=oid;
  const add={lines:[{menuItemId:ids.drink,qty:1}],idempotencyKey:randomUUID()};
  await http('cashier adds before visibility change','cashier',linesPath(oid),add,201);
  const visibility={ownerOnly:true,reason:'Synthetic GAP023 confidentiality acceptance'};
  await http('cashier cannot make order private','cashier',orderPath(oid)+'/visibility',visibility,403,'PATCH');
  await http('owner hides order','owner',orderPath(oid)+'/visibility',visibility,200,'PATCH');
  equal('hidden order SQL readback',(await dbOrder(oid)).owner_only,true);
  const cashierList=await http('cashier list hides private order','cashier','/api/pos/orders?branchId='+ids.conventional);
  equal('hidden order ID absent for original cashier',cashierList.orders.some(o=>o.id===oid),false);
  const ownerList=await http('owner list retains private order','owner','/api/pos/orders?branchId='+ids.conventional);
  equal('owner sees hidden order marker',ownerList.orders.find(o=>o.id===oid)?.ownerOnly,true);
  await unchanged('hidden CREATE replay disclosure blocked',()=>http('original cashier hidden CREATE replay','cashier','/api/pos/orders',input,404));
  await unchanged('hidden ADD replay disclosure blocked',()=>http('original cashier hidden ADD replay','cashier',linesPath(oid),add,404));
  await unchanged('hidden fresh ADD blocked',()=>http('original cashier hidden ADD mutation','cashier',linesPath(oid),{...add,idempotencyKey:randomUUID()},404));
  await unchanged('hidden fresh SETTLE blocked',()=>http('original cashier hidden SETTLE mutation','cashier',settlePath(oid),{tenderType:'CARD',idempotencyKey:randomUUID()},404));
  const ownerAdd={lines:[{menuItemId:ids.drink,qty:1}],idempotencyKey:randomUUID()};
  await http('owner can add hidden order','owner',linesPath(oid),ownerAdd,201);
  const ownerSettle={tenderType:'CARD',idempotencyKey:randomUUID()};
  const paid=await http('owner can settle hidden order','owner',settlePath(oid),ownerSettle,201);
  equal('owner hidden settlement paid',paid.order.status,'PAID');
  equal('owner hidden settlement full bill',paid.receipt.totalAmount,'200.00');
  equal('hidden settlement persisted PAID',(await dbOrder(oid)).status,'PAID');
  await unchanged('owner hidden exact settlement replay',async()=>{
    const replay=await http('owner hidden settlement replay','owner',settlePath(oid),ownerSettle);
    equal('owner hidden replay flag',replay.replayed,true);equal('owner hidden same receipt',replay.receipt.receiptNumber,paid.receipt.receiptNumber);
  });
  for(const [suffix,payload] of [['/settle',ownerSettle],['/lines',ownerAdd]]) {
    await unchanged('hidden saved owner response blocked '+suffix,()=>http('original cashier cannot replay hidden owner action '+suffix,'cashier',orderPath(oid)+suffix,payload,404));
  }
  await unchanged('hidden paid original create replay blocked',()=>http('hidden paid CREATE replay remains 404','cashier','/api/pos/orders',input,404));
}
async function conventionalLifecycle() {
  phase='conventional open and add';
  const initial=createBody(undefined,[{menuItemId:ids.food,qty:1},{menuItemId:ids.drink,qty:1}]);
  const stockBefore=await stock();
  const opened=await race('concurrent conventional create','cashier','/api/pos/orders',initial);
  const oid=opened.order.id;
  equal('conventional dine-in OPEN',opened.order.status,'OPEN');
  equal('production-first flow',opened.order.flow,'PRODUCTION_FIRST');
  equal('OPEN has no receipt',opened.receipt,null);
  tickets('mixed production dispatch',opened,[['KITCHEN','KOT'],['BAR','BOT']]);
  equal('KOT routes only food',opened.tickets.find(t=>t.station==='KITCHEN').lines.map(l=>l.menuItemId),[ids.food]);
  equal('BOT routes only drink',opened.tickets.find(t=>t.station==='BAR').lines.map(l=>l.menuItemId),[ids.drink]);
  equal('one OPEN create effects',await counts(oid),{lines:2,tickets:2,receipts:0,attempts:1});
  const persisted=await dbOrder(oid);
  equal('OPEN tender not collected',persisted.tender_type,'');equal('OPEN no settled timestamp',persisted.settled_at,null);
  equal('order snapshots conventional concept',persisted.operating_concept,'CONVENTIONAL');
  ok('stock posted at dispatch',!!persisted.stock_deducted_at);
  equal('opening shift stored',persisted.shift_run_id,ids.runA);
  equal('dispatch captures complete COGS',persisted.cogs_complete,true);equal('dispatch COGS 50 food + 10 bar',persisted.cogs_amount,'60.00');
  for(const [raw,delta] of [[ids.foodRaw,0.25],[ids.barRaw,0.1]]) {
    const before=stockBefore.find(r=>r.raw_material_id===raw),after=(await stock()).find(r=>r.raw_material_id===raw);
    equal('dispatch aggregate deduction '+raw,Number(after.qty_on_hand),Number(before.qty_on_hand)-delta);
    equal('dispatch physical lot deduction '+raw,Number(after.lots),Number(before.lots)-delta);
  }
  await unchanged('exact OPEN create replay',async()=>{const replay=await http('OPEN exact create replay','cashier','/api/pos/orders',initial);equal('OPEN create replay flag',replay.replayed,true);equal('OPEN create replay ID',replay.order.id,oid);});
  for(const [actor,status] of [[null,401],['outsider',403],['noModule',403],['peer',409]]) {
    await unchanged('create replay authorization '+actor,()=>http('create replay denial '+actor,actor,'/api/pos/orders',initial,status));
  }
  await unchanged('same CREATE key altered payload',()=>http('create key conflict','cashier','/api/pos/orders',{...initial,tableNo:'CHANGED'},409));
  const second=await http('second OPEN order','cashier','/api/pos/orders',createBody(undefined,undefined,{tableNo:'QA-T2'}),201);
  ids.settlementOrder=oid;ids.olderOpenOrder=second.order.id;
  await q("update pos_orders set created_at=date_trunc('month',current_timestamp)-interval '1 day' where id=$1",[oid]);
  await q("update pos_orders set created_at=current_date-interval '1 day'+interval '1 hour' where id=$1",[second.order.id]);
  const overnight=await http('cashier lists overnight OPEN tables','cashier','/api/pos/orders?branchId='+ids.conventional);
  ok('yesterday OPEN remains actionable in GET list',overnight.orders.some(o=>o.id===second.order.id && o.status==='OPEN'));
  ok('prior-month OPEN remains actionable in GET list',overnight.orders.some(o=>o.id===oid && o.status==='OPEN'));
  equal('GET exposes snapshot concept for old OPEN',overnight.orders.find(o=>o.id===oid)?.operatingConcept,'CONVENTIONAL');
  // Change recipe/rate BEFORE adding: old dispatch retains 60; new two plates
  // consume 1kg at 400 = 400; the cumulative immutable capture must be 460.
  await q('update vendor_rates set rate=400,locked_at=now() where vendor_id=$1 and raw_material_id=$2',[ids.vendor,ids.foodRaw]);
  await q('update bom_recipes set qty_per_unit=0.500 where id=$1',[ids.foodBom]);
  const add={lines:[{menuItemId:ids.food,qty:2}],idempotencyKey:randomUUID()};
  const beforeAdd=await stock();
  const added=await race('concurrent added-line dispatch','cashier',linesPath(oid),add);
  tickets('add only creates new kitchen ticket',added,[['KITCHEN','KOT']]);
  equal('one add effects',await counts(oid),{lines:3,tickets:3,receipts:0,attempts:2});
  equal('new line subtotal once',(await dbOrder(oid)).total_amount,'350.00');
  equal('add captures only new dispatch COGS',(await dbOrder(oid)).cogs_amount,'460.00');
  const afterAdd=await stock();
  equal('added food aggregate deducted once',Number(afterAdd.find(r=>r.raw_material_id===ids.foodRaw).qty_on_hand),Number(beforeAdd.find(r=>r.raw_material_id===ids.foodRaw).qty_on_hand)-1);
  equal('added food lots deducted once',Number(afterAdd.find(r=>r.raw_material_id===ids.foodRaw).lots),Number(beforeAdd.find(r=>r.raw_material_id===ids.foodRaw).lots)-1);
  const movement=await row('select sum(qty_delta)::numeric(12,3)::text qty from stock_movements where branch_id=$1 and source_id=$2 and raw_material_id=$3',[ids.conventional,oid,ids.foodRaw]);
  equal('ledger includes original and added consumption',movement.qty,'-1.250');
  await unchanged('exact add replay',async()=>{const replay=await http('add exact replay','cashier',linesPath(oid),add);equal('add replay flag',replay.replayed,true);});
  await unchanged('wrong order add-key replay',()=>http('same ADD key cannot target another order','cashier',linesPath(second.order.id),add,409));
  await unchanged('changed add key payload',()=>http('changed ADD payload rejected','cashier',linesPath(oid),{...add,lines:[{menuItemId:ids.food,qty:1}]},409));
  for(const [actor,status] of [[null,401],['outsider',403],['noModule',403],['peer',409]]) {
    await unchanged('add replay authorization '+actor,()=>http('add replay denied '+actor,actor,linesPath(oid),add,status));
  }
  // Seed genuine pre-GAP legacy completed sale, with no receipt/tickets/timestamps.
  await q(`insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,status,cashier_id,cogs_amount,cogs_complete)
    values($1,$2,$1,'TAKEAWAY',77,77,'CASH','COMPLETED',$3,7,true)`,[ids.legacy,ids.conventional,ids.cashier]);
  await q('insert into pos_order_lines(id,order_id,menu_item_id,qty,price,vat_rate_percent) values($1,$2,$3,1,77,0)',[ids.legacyLine,ids.legacy,ids.food]);
  await q(`insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,status,cashier_id,cogs_complete)
    values($1,$2,$1,'TAKEAWAY',999,999,'CASH','VOIDED',$3,true)`,[ids.voided,ids.conventional,ids.cashier]);
  await reportAssertions('before settlement');
  phase='concept switch and settlement';
  await http('owner switches branch with OPEN tables','owner','/api/branches/'+ids.conventional,{operatingConcept:'FAST_FOOD'},200,'PATCH');
  const conceptAdd={lines:[{menuItemId:ids.drink,qty:1}],idempotencyKey:randomUUID()};
  await http('snapshot preserves add after concept switch','cashier',linesPath(second.order.id),conceptAdd,201);
  equal('existing order concept remains conventional',(await dbOrder(second.order.id)).operating_concept,'CONVENTIONAL');
  const newlyFast=await http('new order follows changed concept','cashier','/api/pos/orders',createBody(undefined,undefined,{tenderType:'CARD'}),201);
  equal('new order after switch PAID',newlyFast.order.status,'PAID');
  // Real HTTP handover isolates the collection shift from the opening shift.
  const ended=await http('end opening shift','cashier','/api/shift-runs/'+ids.runA+'/end',{branchId:ids.conventional,coinsInr:0},201);
  ids.runB=ended.toRun.id;
  const openingCollected=await row(`select coalesce(sum(total_amount),0)::numeric(10,2)::text total from pos_orders where branch_id=$1 and shift_run_id=$2 and tender_type='CASH' and status in ('PAID','COMPLETED')`,[ids.conventional,ids.runA]);
  equal('opening shift excludes unpaid table collection',ended.cashExpected,openingCollected.total);
  await unchanged('settlement blocked pending handover',()=>http('pending handover settlement denied','cashier',settlePath(oid),{tenderType:'CASH',idempotencyKey:randomUUID()},409));
  await http('accept new shift handover','cashier','/api/shift-handovers/'+ended.handover.id+'/accept',{branchId:ids.conventional});
  // No stock needed at settlement: remove availability WITHOUT changing historical consumption.
  // Change BOM and rates again: settlement must retain dispatch-time 460 exactly.
  await q('update bom_recipes set qty_per_unit=99 where id=any($1::text[])',[[ids.foodBom,ids.barBom]]);
  await q('update vendor_rates set rate=999,locked_at=now() where vendor_id=$1',[ids.vendor]);
  await q('update inventory_stock set qty_on_hand=0 where branch_id=$1',[ids.conventional]);
  await q('update stock_batches set qty_remaining=0 where branch_id=$1',[ids.conventional]);
  const settle={tenderType:'CASH',idempotencyKey:randomUUID()};
  for(const [actor,status] of [[null,401],['outsider',403],['noModule',403]]) {
    await unchanged('fresh settlement authorization '+actor,()=>http('fresh settlement denied '+actor,actor,settlePath(oid),settle,status));
  }
  const preSettle=await stock();
  const preMovements=(await snapshot()).stock_movements;
  const settled=await race('concurrent settlement','cashier',settlePath(oid),settle);
  equal('settled status',settled.order.status,'PAID');equal('one receipt full bill',settled.receipt.totalAmount,'350.00');
  equal('settlement no raw deductions',settled.inventoryDeducted,[]);equal('settlement no semi-FG deductions',settled.semiFgDeducted,[]);
  equal('settlement leaves stock/lots unchanged',await stock(),preSettle);
  equal('settlement leaves movement ledger unchanged',(await snapshot()).stock_movements,preMovements);
  equal('one receipt and settlement attempt',await counts(oid),{lines:3,tickets:3,receipts:1,attempts:3});
  const final=await dbOrder(oid);
  equal('COGS preserved despite rate/BOM change',final.cogs_amount,'460.00');equal('COGS completeness preserved',final.cogs_complete,true);
  equal('collection reassigned to settling shift',final.shift_run_id,ids.runB);ok('settlement timestamp recorded',!!final.settled_at);
  equal('original dispatch timestamp preserved',final.stock_deducted_at,persisted.stock_deducted_at);
  await unchanged('settlement exact replay',async()=>{const replay=await http('post-settle exact replay','cashier',settlePath(oid),settle);equal('settle replay flag',replay.replayed,true);equal('same receipt number',replay.receipt.receiptNumber,settled.receipt.receiptNumber);});
  await unchanged('wrong order settlement replay',()=>http('SETTLE key cannot target second table','cashier',settlePath(second.order.id),settle,409));
  await unchanged('changed settlement payload',()=>http('changed tender same key conflict','cashier',settlePath(oid),{...settle,tenderType:'CARD'},409));
  await unchanged('new settlement key after payment',()=>http('already paid fresh key rejected','cashier',settlePath(oid),{...settle,idempotencyKey:randomUUID()},409));
  await unchanged('fresh add after payment',()=>http('paid cannot add fresh lines','cashier',linesPath(oid),{...add,idempotencyKey:randomUUID()},409));
  for(const [actor,status] of [[null,401],['outsider',403],['noModule',403],['peer',409]]) {
    for(const [suffix,payload] of [['/settle',settle],['/lines',add]]) await unchanged('post-paid replay authorization '+actor+suffix,()=>http('post-paid replay denied '+actor+suffix,actor,orderPath(oid)+suffix,payload,status));
  }
  await unchanged('post-paid CREATE replay',async()=>{const replay=await http('original CREATE after payment','cashier','/api/pos/orders',initial);equal('CREATE historical response retained',replay.order.status,'OPEN');equal('CREATE replay flag after payment',replay.replayed,true);});
  await unchanged('post-paid ADD replay',async()=>{const replay=await http('original ADD after payment','cashier',linesPath(oid),add);equal('ADD historical response retained',replay.order.status,'OPEN');equal('ADD replay flag after payment',replay.replayed,true);});
  await reportAssertions('after settlement');
  phase='settling shift collection';
  const closing=await http('end settling shift','cashier','/api/shift-runs/'+ids.runB+'/end',{branchId:ids.conventional,coinsInr:350},201);
  equal('settling shift collects table payment exactly once',closing.cashExpected,'350.00');
  equal('settling shift has zero shortage',closing.shortageExcessInr,'0.00');
  const noContacts=await row("select count(*)::int n from pos_orders where branch_id=any($1::text[]) and customer_phone<>''",[branchIds]);
  equal('all fixtures omit customer phones',noContacts.n,0);
}

// FK-aware scoped cleanup: discover all descendants of *our exact root IDs*.
// New GAP tables need no hard-coded deletion order. No TRUNCATE, CASCADE DDL,
// disabled constraints, or prefix-wide deletes. Unknown/cyclic FKs fail closed
// and roll back the entire cleanup rather than removing unrelated records.
const ident = value => '"' + value.replaceAll('"','""') + '"';
async function cleanup() {
  assert.ok(bound,'Cleanup forbidden until live app fixture binding succeeds');
  await bindApp();
  const c=await pool.connect();
  try {
    await c.query('begin');
    await c.query("set local lock_timeout='5s'");
    await c.query('create temporary table g23_cleanup_rows(rel oid, tid tid, primary key(rel,tid)) on commit drop');
    for(const [table,roots] of [['branches',branchIds],['users',userIds],['raw_materials',rawIds],['vendors',[ids.vendor]]]) {
      await c.query(`insert into g23_cleanup_rows select tableoid,ctid from public.${ident(table)} where id=any($1::text[]) on conflict do nothing`,[roots]);
    }
    const fks=(await c.query(`select k.conrelid::int child_oid,k.confrelid::int parent_oid,
      cn.nspname child_schema,cc.relname child_table,pn.nspname parent_schema,pc.relname parent_table,
      array_agg(ca.attname::text order by u.ordinality) child_cols,array_agg(pa.attname::text order by u.ordinality) parent_cols
      from pg_constraint k join pg_class cc on cc.oid=k.conrelid join pg_namespace cn on cn.oid=cc.relnamespace
      join pg_class pc on pc.oid=k.confrelid join pg_namespace pn on pn.oid=pc.relnamespace
      cross join lateral unnest(k.conkey,k.confkey) with ordinality u(cnum,pnum,ordinality)
      join pg_attribute ca on ca.attrelid=k.conrelid and ca.attnum=u.cnum
      join pg_attribute pa on pa.attrelid=k.confrelid and pa.attnum=u.pnum
      where k.contype='f' and cn.nspname='public' and pn.nspname='public'
      group by k.oid,k.conrelid,k.confrelid,cn.nspname,cc.relname,pn.nspname,pc.relname`)).rows;
    let added;
    do {
      added=0;
      for(const fk of fks) {
        const join=fk.child_cols.map((col,i)=>`ch.${ident(col)}=pa.${ident(fk.parent_cols[i])}`).join(' and ');
        const result=await c.query(`insert into g23_cleanup_rows
          select ch.tableoid,ch.ctid from ${ident(fk.child_schema)}.${ident(fk.child_table)} ch
          join ${ident(fk.parent_schema)}.${ident(fk.parent_table)} pa on ${join}
          join g23_cleanup_rows r on r.rel=pa.tableoid and r.tid=pa.ctid on conflict do nothing`);
        added+=result.rowCount;
      }
    } while(added);
    let tables=(await c.query(`select distinct r.rel::int oid,n.nspname schema,c.relname name from g23_cleanup_rows r
      join pg_class c on c.oid=r.rel join pg_namespace n on n.oid=c.relnamespace`)).rows;
    while(tables.length) {
      const blocked=[];let progress=false;
      for(const table of tables) {
        await c.query('savepoint cleanup_one');
        try {
          await c.query(`delete from ${ident(table.schema)}.${ident(table.name)} target using g23_cleanup_rows r where r.rel=target.tableoid and r.tid=target.ctid`);
          await c.query('release savepoint cleanup_one');progress=true;
        } catch(error) {
          await c.query('rollback to savepoint cleanup_one');await c.query('release savepoint cleanup_one');
          if(error.code!=='23503')throw error;
          blocked.push(table);
        }
      }
      assert.ok(progress,'Scoped cleanup blocked by FK cycle/new dependency: '+blocked.map(t=>t.name).join(','));
      tables=blocked;
    }
    for(const [table,roots] of [['branches',branchIds],['users',userIds],['raw_materials',rawIds],['vendors',[ids.vendor]]]) {
      assert.equal((await c.query(`select count(*)::int n from public.${ident(table)} where id=any($1::text[])`,[roots])).rows[0].n,0,'cleanup readback '+table);
    }
    await c.query('commit');console.log('PASS scoped FK-aware fixture cleanup');
  } catch(error) { await c.query('rollback');throw error; } finally { c.release(); }
}
function nonSecretManifest() {
  return { database:DATABASE,baseUrl:BASE,ids,branchIds,userIds,rawIds,orderIds:[...orderIds],checks,phase };
}
(async()=>{
  let failed=false;
  try {
    await bootstrap();await fixtures();await guardsAndPayment();await rollbackTests();await hiddenOrderSecurity();await conventionalLifecycle();
    console.log(JSON.stringify({passed:checks,result:'PASS'}));
  } catch(error) {
    failed=true;process.exitCode=1;
    // pg errors can contain SQL parameters; report only safe test messages/code.
    console.error('FAIL phase='+phase+' '+(error.code==='ERR_ASSERTION' ? error.message : 'error '+(error.code||error.name)));
  } finally {
    try {
      if(keep && seeded) {
        const dir=process.env.TMPDIR || os.tmpdir();
        const file=path.join(dir,'gap023-fixtures-'+randomUUID()+'.json');
        fs.writeFileSync(file,JSON.stringify(nonSecretManifest(),null,2),{flag:'wx',mode:0o600});
        console.log('KEEP non-secret fixture identifiers: '+file);
      } else if(seeded && bound) {
        await cleanup();
      } else if(seeded) {
        process.exitCode=1;
        console.error('Cleanup skipped: app/DB binding not proven. Only newly inserted bootstrap fixtures remain.');
        console.error(JSON.stringify({branchIds,userIds}));
      }
    } catch(error) {
      process.exitCode=1;console.error('FAIL cleanup/keep: '+(error.code||error.name));
      console.error(JSON.stringify({branchIds,userIds,rawIds,vendorId:ids.vendor}));
    } finally { await pool.end(); }
    if(failed)console.error('Acceptance incomplete; no passing HTTP/DB result claimed.');
  }
})();
