// Parent-run acceptance only: real HTTP + disposable migrated PostgreSQL, no mocks.
// PGHOST=127.0.0.1 PGPORT=5441 PGDATABASE=restaurant_erp_gap024_qa_20261104 \
// BASE_URL=http://localhost:3124 node tests/gap024.integration.cjs [--keep]
// Supply PGUSER/PGPASSWORD externally. Never loads .env or sends provider messages.
'use strict';
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const DATABASE = 'restaurant_erp_gap024_qa_20261104';
const BASE = 'http://localhost:3124';
// Guard BEFORE importing pg, creating a pool, opening HTTP, or writing fixtures.
assert.equal(process.env.PGHOST, '127.0.0.1', 'GAP024 requires explicit loopback PGHOST');
assert.equal(process.env.PGPORT, '5441', 'GAP024 requires isolated PGPORT 5441');
assert.equal(process.env.PGDATABASE, DATABASE, 'GAP024 requires exact disposable database');
assert.equal(process.env.BASE_URL, BASE, 'GAP024 requires exact production-built local app');
assert.ok(process.argv.slice(2).every(a => a === '--keep'), 'Only --keep is supported');
const keep = process.argv.includes('--keep');
const { Pool } = require('pg');
const pool = new Pool({ host:'127.0.0.1', port:5441, database:DATABASE,
  user:process.env.PGUSER, password:process.env.PGPASSWORD, ssl:false,
  connectionTimeoutMillis:10000, query_timeout:30000, max:6 });
const fresh = () => 'g24-' + randomUUID();
const ids = Object.fromEntries(['branch','fast','other','owner','manager','cashier','peer','kitchen','outsider','none','raw','vendor','food','bar','fastFood','otherFood'].map(k => [k,fresh()]));
const branchIds = [ids.branch,ids.fast,ids.other];
const userIds = ['owner','manager','cashier','peer','kitchen','outsider','none'].map(k => ids[k]);
const tokens = new Map(); // Credentials stay memory-only; never log HTTP bodies.
const orderIds = new Set(), draftIds = new Set(), ticketIds = new Set();
let seeded = false, bound = false, checks = 0, phase = 'target guards', columns;
const q = (sql,args=[]) => pool.query(sql,args);
const row = async (sql,args=[]) => (await q(sql,args)).rows[0];
const ident = s => '"' + s.replaceAll('"','""') + '"';
function equal(name,a,b) { assert.deepEqual(a,b,phase + ': ' + name); checks++; console.log('PASS '+name); }
function ok(name,v) { assert.ok(v,phase+': '+name); checks++; console.log('PASS '+name); }
const dp = id => '/api/pos/drafts/'+encodeURIComponent(id);
const tp = id => '/api/pos/tickets/'+encodeURIComponent(id);
const op = id => '/api/pos/orders/'+encodeURIComponent(id);
const key = () => randomUUID();
function track(data) {
  if(data.draft?.id) draftIds.add(data.draft.id);
  if(data.order?.id) orderIds.add(data.order.id);
  for(const t of [...(data.tickets || []),...(data.order?.tickets || []),...(data.ticket ? [data.ticket] : [])]) ticketIds.add(t.id);
  return data;
}
async function request(actor,url,input,method=input===undefined?'GET':'POST',origin=BASE) {
  assert.ok(!actor || tokens.has(actor),'Known fixture actor required');
  const response = await fetch(BASE+url,{ method,redirect:'error',signal:AbortSignal.timeout(90000),
    headers:{origin,'content-type':'application/json',...(actor?{cookie:'restaurant_session='+tokens.get(actor)}:{})},
    ...(input===undefined?{}:{body:JSON.stringify(input)}) });
  let data; try { data=JSON.parse(await response.text()); } catch { assert.fail('Expected JSON HTTP '+response.status+' at '+url.split('?')[0]); }
  return {status:response.status,data:track(data)};
}
async function http(name,actor,url,input,status=200,method) {
  const r=await request(actor,url,input,method); equal(name+' HTTP',r.status,status); return r.data;
}
function canonical(data) { const {replayed,whatsapp,...rest}=data; return rest; }
async function exact(name,actor,url,input,original,method,branch=ids.branch) {
  return unchanged(name,async()=>{
    const r=await http(name,actor,url,input,200,method);
    equal(name+' replay flag',r.replayed,true);
    equal(name+' immutable original result',canonical(r),canonical(original));
    return r;
  },'all',branch);
}
async function bindApp() {
  const me=await http('live app recognizes unpredictable owner','owner','/api/auth/me');
  equal('exact seeded session identity',me.user?.id,ids.owner);
  const b=await http('live app reads seeded branch','owner','/api/branches/'+ids.branch);
  equal('exact seeded branch identity',b.branch?.id,ids.branch);
  equal('unpredictable branch code binding',b.branch?.code,ids.branch.slice(0,28));
  bound=true;
}
async function bootstrap() {
  equal('connected database identity',(await row('select current_database() db')).db,DATABASE);
  const c=await pool.connect();
  try {
    await c.query('begin');
    for(const b of branchIds) await c.query('insert into branches(id,code,name,lat,lng,vat_rate_percent,operating_concept) values($1,$2,$1,0,0,0,$3)',[b,b.slice(0,28),b===ids.fast?'FAST_FOOD':'CONVENTIONAL']);
    for(const [actor,role,branch,grants] of [
      ['owner','SUPER_ADMIN',null,[]],['manager','BRANCH_MANAGER',ids.branch,['POS_CASHIER']],
      ['cashier','CASHIER',ids.branch,['POS_CASHIER']],['peer','CASHIER',ids.branch,['POS_CASHIER']],
      ['kitchen','CASHIER',ids.branch,['POS_KITCHEN']],['outsider','CASHIER',ids.other,['POS_CASHIER','POS_KITCHEN']],
      ['none','CASHIER',ids.branch,[]],
    ]) {
      await c.query("insert into users(id,name,phone_e164,role,branch_id,module_access,status) values($1,$2,$3,$4,$5,$6,'Active')",[ids[actor],'Synthetic GAP024 '+actor,'QA-NONROUTABLE-'+ids[actor],role,branch,grants]);
      const token=randomBytes(32).toString('hex'); tokens.set(actor,token);
      await c.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '4 hours')",[createHash('sha256').update(token).digest('hex'),ids[actor]]);
    }
    await c.query('commit'); seeded=true;
  } catch(e) { await c.query('rollback');throw e; } finally { c.release(); }
  await bindApp(); // No cleanup or destructive fixture adjustment without this proof.
  await q("insert into raw_materials(id,name,unit) values($1,$1,'kg')",[ids.raw]);
  await q("insert into vendors(id,name,phone_e164,status) values($1,$1,$2,'APPROVED')",[ids.vendor,'QA-NONROUTABLE-'+ids.vendor]);
  await q('insert into vendor_rates(id,vendor_id,raw_material_id,rate) values($1,$2,$3,200)',[fresh(),ids.vendor,ids.raw]);
  for(const b of branchIds) {
    await q('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,1000)',[fresh(),b,ids.raw]);
    await q("insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status) values($1,$2,$3,$1,1000,1000,'NON_EXPIRING')",[fresh(),b,ids.raw]);
  }
  for(const [item,b,station,price] of [[ids.food,ids.branch,'KITCHEN',100],[ids.bar,ids.branch,'BAR',50],[ids.fastFood,ids.fast,'KITCHEN',100],[ids.otherFood,ids.other,'KITCHEN',100]]) {
    await q('insert into menu_items(id,branch_id,name,price,production_station,vat_rate_percent) values($1,$2,$1,$3,$4,0)',[item,b,price,station]);
    await q("insert into bom_recipes(id,branch_id,menu_item_id,component_type,raw_material_id,qty_per_unit) values($1,$2,$3,'RAW_MATERIAL',$4,0.25)",[fresh(),b,item,ids.raw]);
  }
  columns=(await q("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
}
// Snapshot actual database rows, including newly-added lifecycle/audit tables.
// Compare complete rows, not merely counts, so hidden rewrites and duplicate events fail.
async function snapshot(mode='all',branch=ids.branch) {
  const out={};
  const knownOrders=(await q('select id from pos_orders where branch_id=$1',[branch])).rows.map(r=>r.id);
  const knownTickets=(await q('select id from pos_production_tickets where branch_id=$1',[branch])).rows.map(r=>r.id);
  const scope=[...knownOrders,...knownTickets,...draftIds];
  const tables=new Map();
  for(const c of columns) { if(!tables.has(c.table_name))tables.set(c.table_name,[]); tables.get(c.table_name).push(c.column_name); }
  for(const [table,cols] of tables) {
    if(mode==='effects' && !['pos_orders','pos_order_lines','pos_production_tickets','pos_production_ticket_lines','pos_receipts','pos_order_attempts','inventory_stock','stock_batches','stock_movements','batch_movements'].includes(table) && !/ledger|revenue|cogs/i.test(table)) continue;
    if(['posting','settlement'].includes(mode) && !(mode==='settlement' ? ['pos_order_lines','inventory_stock','stock_batches','stock_movements','batch_movements'] : ['pos_order_lines','pos_receipts','inventory_stock','stock_batches','stock_movements','batch_movements']).includes(table) && !/ledger|revenue|cogs/i.test(table)) continue;
    const clauses=[],args=[];
    for(const [col,value] of [['branch_id',[branch]],['order_id',knownOrders],['ticket_id',knownTickets],['entity_id',scope],['draft_id',[...draftIds]]]) {
      if(cols.includes(col)) { args.push(value);clauses.push(ident(col)+'=any($'+args.length+'::text[])'); }
    }
    if(table==='batch_movements') { args.push(branch); clauses.push('batch_id in (select id from stock_batches where branch_id=$'+args.length+')'); }
    if(!clauses.length)continue;
    out[table]=(await q('select to_jsonb(t) r from public.'+ident(table)+' t where '+clauses.join(' or ')+' order by to_jsonb(t)::text',args)).rows.map(r=>r.r);
  }
  if(['posting','settlement'].includes(mode)) out.capturedCosts=(await q('select id,cogs_amount,cogs_complete,stock_deducted_at from pos_orders where branch_id=$1 order by id',[branch])).rows;
  return out;
}
async function unchanged(name,fn,mode='all',branch=ids.branch) {
  const before=await snapshot(mode,branch);const result=await fn();equal(name+' SQL unchanged',await snapshot(mode,branch),before);return result;
}
async function stock(branch=ids.branch) {
  return row('select qty_on_hand::text qty,(select sum(qty_remaining)::numeric(12,3)::text from stock_batches where branch_id=$1 and raw_material_id=$2) lots from inventory_stock where branch_id=$1 and raw_material_id=$2',[branch,ids.raw]);
}
function payload(item=ids.food,extra={}) { return {channel:'DINE_IN',tableNo:'QA-'+randomUUID().slice(0,8),lines:[{menuItemId:item,qty:1}],...extra}; }
async function draft(actor='cashier',b=ids.branch,p=payload()) {
  const body={branchId:b,payload:p,requestKey:key()};
  const result=await http('create persisted draft',actor,'/api/pos/drafts',body,201);
  equal('draft starts DRAFT',result.draft?.status,'DRAFT');ok('draft revision positive',Number.isInteger(result.draft.revision)&&result.draft.revision>0);
  equal('draft no admitted order',result.draft.orderId,null);
  const persisted=await row('select status,revision,payload,order_id from pos_drafts where id=$1',[result.draft.id]);
  equal('draft HTTP matches PostgreSQL persistence',persisted,{status:result.draft.status,revision:result.draft.revision,payload:result.draft.payload,order_id:null});
  return {body,result,d:result.draft};
}
async function dispatch(f,actor='cashier') {
  const body={expectedRevision:f.d.revision,requestKey:key()};
  const result=await http('dispatch draft',actor,dp(f.d.id)+'/dispatch',body,201);
  equal('draft persisted DISPATCHED',result.draft?.status,'DISPATCHED');
  equal('draft links admitted order',result.draft.orderId,result.order?.id);
  return {body,result,d:result.draft,oid:result.order.id};
}
async function lifecycle(oid,actor='cashier') {
  const data=await http('lifecycle authorized read',actor,'/api/pos/lifecycle?includeClosed=true&branchId='+ids.branch);
  const order=data.orders.find(o=>o.id===oid);ok('lifecycle includes fixture order',!!order);return order;
}
async function ticket(tid,actor='kitchen') { return (await http('ticket snapshot read',actor,tp(tid))).ticket; }
function noMoney(value,name='ticket') {
  if(Array.isArray(value)) { for(const v of value)noMoney(v,name);return; }
  if(value && typeof value==='object')for(const [k,v] of Object.entries(value)) {
    ok(name+' forbids '+k,!/price|amount|total|cost|tender|currency|customer|phone|requestJson|responseJson|payload|requestKey/i.test(k));noMoney(v,name);
  }
}
async function action(t,actionName,actor='kitchen',status=200,extra={}) {
  const body={action:actionName,expectedRevision:t.revision,requestKey:key(),...extra};
  const result=await http(actionName+' ticket',actor,tp(t.id)+'/action',body,status);
  return {body,result,t:result.ticket};
}
async function orderAction(o,actionName,actor='cashier',status=200,extra={}) {
  const body={action:actionName,expectedRevision:o.revision,requestKey:key(),...extra};
  const result=await http(actionName+' order',actor,op(o.id)+'/lifecycle',body,status);
  return {body,result,o:result.order};
}
async function race(name,calls,expected) {
  const results=await Promise.all(calls.map(c=>request(...c)));
  const statuses=results.map(r=>r.status).sort((a,b)=>a-b);
  if(Array.isArray(expected[0]))ok(name+' exactly one operation wins',expected.some(e=>JSON.stringify(e)===JSON.stringify(statuses)));
  else equal(name+' HTTP outcomes',statuses,expected);
  return results;
}
async function draftAcceptance() {
  phase='draft persistence and exact retries';
  const before=await snapshot('effects');
  const f=await draft();
  equal('create draft zero posting',await snapshot('effects'),before);
  await exact('draft create exact retry','cashier','/api/pos/drafts',f.body,f.result);
  await unchanged('draft create actor binding',()=>http('different actor same key','peer','/api/pos/drafts',f.body,409));
  await unchanged('draft create payload binding',()=>http('changed draft key payload','cashier','/api/pos/drafts',{...f.body,payload:{...f.body.payload,tableNo:'CHANGED'}},409));
  const edit={payload:{...f.d.payload,lines:[{menuItemId:ids.food,qty:2}]},expectedRevision:f.d.revision,requestKey:key()};
  const edited=await unchanged('edit draft zero posting',()=>http('edit draft','cashier',dp(f.d.id),edit,200,'PATCH'),'effects');
  equal('draft edited payload persisted',edited.draft.payload.lines,edit.payload.lines);
  equal('draft edit revision advances',edited.draft.revision,f.d.revision+1);
  equal('edited draft persisted in PostgreSQL',await row('select revision,payload from pos_drafts where id=$1',[f.d.id]),{revision:edited.draft.revision,payload:edited.draft.payload});
  await exact('edit exact retry before stale revision check','cashier',dp(f.d.id),edit,edited,'PATCH');
  await unchanged('stale edit rejected',()=>http('stale edit','cashier',dp(f.d.id),{...edit,requestKey:key()},409,'PATCH'));
  await unchanged('stale dispatch rejected',()=>http('stale dispatch','cashier',dp(f.d.id)+'/dispatch',{expectedRevision:f.d.revision,requestKey:key()},409));
  await unchanged('stale draft cancellation rejected',()=>http('stale draft cancel','cashier',dp(f.d.id)+'/cancel',{expectedRevision:f.d.revision,requestKey:key(),reason:'Synthetic stale'},409));
  const other=await draft();
  await unchanged('edit key entity binding',()=>http('same edit key different draft','cashier',dp(other.d.id),edit,409,'PATCH'));
  const cancel={expectedRevision:edited.draft.revision,requestKey:key(),reason:'Synthetic draft abandoned'};
  const cancelled=await unchanged('draft cancel zero posting',()=>http('cancel draft','cashier',dp(f.d.id)+'/cancel',cancel),'effects');
  equal('cancelled draft persisted',cancelled.draft.status,'CANCELLED');
  equal('cancelled draft persisted in PostgreSQL',await row('select status,revision,order_id from pos_drafts where id=$1',[f.d.id]),{status:'CANCELLED',revision:cancelled.draft.revision,order_id:null});
  await exact('cancel draft historical retry','cashier',dp(f.d.id)+'/cancel',cancel,cancelled);
  await exact('edit historic retry after cancellation','cashier',dp(f.d.id),edit,edited,'PATCH');
  await unchanged('cancelled draft dispatch denied',()=>http('cancelled draft dispatch','cashier',dp(f.d.id)+'/dispatch',{expectedRevision:cancelled.draft.revision,requestKey:key()},409));
  const r=await draft();
  const editRace={expectedRevision:r.d.revision,requestKey:key(),payload:{...r.d.payload,tableNo:'RACE-EDIT'}};
  const sendRace={expectedRevision:r.d.revision,requestKey:key()};
  const replies=await race('concurrent edit versus dispatch',[
    ['cashier',dp(r.d.id),editRace,'PATCH'],['cashier',dp(r.d.id)+'/dispatch',sendRace],
  ], [[200,409],[201,409]]);
  const winner=replies.find(reply=>reply.status<300);
  if(winner.data.draft.status==='DRAFT') {
    equal('winning edit persisted',winner.data.draft.payload.tableNo,'RACE-EDIT');
    await dispatch({d:winner.data.draft});
  } else {
    equal('winning dispatch persisted',winner.data.draft.status,'DISPATCHED');
    equal('dispatch winner retains original payload',winner.data.draft.payload.tableNo,r.d.payload.tableNo);
  }
  return {other,replies};
}
async function dispatchAcceptance() {
  phase='dispatch once, payment-first, and ticket snapshots';
  const f=await draft('cashier',ids.branch,payload(ids.food,{lines:[{menuItemId:ids.food,qty:1},{menuItemId:ids.bar,qty:1}]}));
  const before=await stock();
  const body={expectedRevision:f.d.revision,requestKey:key()};
  const replies=await race('same-key concurrent dispatch',[
    ['cashier',dp(f.d.id)+'/dispatch',body],['cashier',dp(f.d.id)+'/dispatch',body],
  ],[200,201]);
  const made=replies.find(r=>r.status===201).data;
  equal('concurrent retry original result',canonical(replies[0].data),canonical(replies[1].data));
  equal('one exact replay',replies.filter(r=>r.data.replayed===true).length,1);
  equal('conventional dine-in OPEN',made.order.status,'OPEN');equal('unpaid dispatch no receipt',made.receipt,null);
  equal('stock aggregate deducted once',await stock(),{qty:(Number(before.qty)-0.5).toFixed(3),lots:(Number(before.lots)-0.5).toFixed(3)});
  equal('one admitted order for draft',(await row('select count(*)::int n from pos_orders where id=$1',[made.order.id])).n,1);
  equal('one captured COGS',(await row('select cogs_amount,cogs_complete from pos_orders where id=$1',[made.order.id])),{cogs_amount:'100.00',cogs_complete:true});
  equal('dispatch consumption ledger once',(await row('select sum(qty_delta)::numeric(12,3)::text qty from stock_movements where branch_id=$1 and source_id=$2 and raw_material_id=$3',[ids.branch,made.order.id,ids.raw])).qty,'-0.500');
  equal('dispatch creates exactly original lines/tickets and no receipts',await row('select (select count(*)::int from pos_order_lines where order_id=$1) lines,(select count(*)::int from pos_production_tickets where order_id=$1) tickets,(select count(*)::int from pos_receipts where order_id=$1) receipts',[made.order.id]),{lines:2,tickets:2,receipts:0});
  await exact('dispatch exact retry','cashier',dp(f.d.id)+'/dispatch',body,made);
  const receipt=await row('select actor_id,target_id,request_key from pos_lifecycle_actions where branch_id=$1 and request_key=$2',[ids.branch,body.requestKey]);
  equal('dispatch receipt binds original actor/entity/key',receipt,{actor_id:ids.cashier,target_id:f.d.id,request_key:body.requestKey});
  await unchanged('dispatch retry actor binding',()=>http('dispatch different actor same key','peer',dp(f.d.id)+'/dispatch',body,409));
  await unchanged('new key cannot dispatch again',()=>http('repeat dispatch new key','cashier',dp(f.d.id)+'/dispatch',{expectedRevision:made.draft.revision,requestKey:key()},409));
  await unchanged('dispatched draft immutable',()=>http('edit dispatched draft','cashier',dp(f.d.id),{payload:f.d.payload,expectedRevision:made.draft.revision,requestKey:key()},409,'PATCH'));
  const order=await lifecycle(made.order.id);
  equal('split kitchen and bar tickets',order.tickets.map(t=>t.station).sort(),['BAR','KITCHEN']);
  for(const t of order.tickets) { noMoney(t);equal('persisted snapshot available',t.snapshotAvailable,true);equal('initial SENT status',t.status,'SENT'); }
  const saved=await ticket(order.tickets.find(t=>t.station==='KITCHEN').id);
  equal('snapshot original menu name',saved.lines[0].name,ids.food);
  equal('snapshot original menu identity',saved.lines[0].menuItemId,ids.food);
  equal('snapshot original quantity',saved.lines[0].qty,1);
  await q("update menu_items set name=$2,price=777,production_station='BAR' where id=$1",[ids.food,'Renamed '+fresh()]);
  await unchanged('GET and repeated print preview never post',async()=>{
    for(let i=0;i<3;i++) equal('snapshot survives catalog change '+i,await ticket(saved.id),saved);
    await http('cashier kitchen read no posting','cashier','/api/pos/kitchen?branchId='+ids.branch);
    await http('lifecycle read no posting','cashier','/api/pos/lifecycle?branchId='+ids.branch);
  });
  await q("update menu_items set name=id,price=100,production_station='KITCHEN' where id=$1",[ids.food]);
  const fast=await draft('owner',ids.fast,payload(ids.fastFood));
  const fastBefore=await snapshot('effects',ids.fast);
  await http('FAST_FOOD missing tender blocks admission','owner',dp(fast.d.id)+'/dispatch',{expectedRevision:fast.d.revision,requestKey:key()},400);
  equal('FAST_FOOD missing tender atomic rollback',await snapshot('effects',ids.fast),fastBefore);
  const fastEdit={payload:{...fast.d.payload,tenderType:'CASH'},expectedRevision:fast.d.revision,requestKey:key()};
  const edited=await http('save FAST_FOOD tender','owner',dp(fast.d.id),fastEdit,200,'PATCH');
  const stockBefore=await stock(ids.fast);
  const paid=await dispatch({d:edited.draft},'owner');
  equal('FAST_FOOD PAID before preparation',paid.result.order.status,'PAID');ok('FAST_FOOD receipt exists',!!paid.result.receipt?.receiptNumber);
  equal('FAST_FOOD stock once',await stock(ids.fast),{qty:(Number(stockBefore.qty)-0.25).toFixed(3),lots:(Number(stockBefore.lots)-0.25).toFixed(3)});
  const fastQueue=await http('owner FAST_FOOD queue','owner','/api/pos/kitchen?branchId='+ids.fast);
  equal('paid preparation independent',fastQueue.tickets.find(t=>t.orderId===paid.oid)?.status,'SENT');
  const fastLifecycle=await http('Owner reads active paid FAST_FOOD order','owner','/api/pos/lifecycle?branchId='+ids.fast);
  const fastOrder=fastLifecycle.orders.find(o=>o.id===paid.oid);
  ok('active paid FAST_FOOD lifecycle exists',!!fastOrder);
  await unchanged('active PAID cannot cancel or close unserved',async()=>{
    await orderAction(fastOrder,'CANCEL','owner',409,{reason:'Synthetic paid cancellation must not refund'});
    await orderAction(fastOrder,'CLOSE','owner',409);
  },'all',ids.fast);
  await exact('FAST_FOOD exact dispatch retry','owner',dp(edited.draft.id)+'/dispatch',paid.body,paid.result,undefined,ids.fast);
  equal('FAST_FOOD retry never stock twice',await stock(ids.fast),{qty:(Number(stockBefore.qty)-0.25).toFixed(3),lots:(Number(stockBefore.lots)-0.25).toFixed(3)});
  for(const channel of ['TAKEAWAY','SWIGGY','ZOMATO']) {
    const p=payload(ids.food,{channel,tableNo:''});
    const unpaid=await draft('cashier',ids.branch,p);
    await unchanged(channel+' missing tender blocks dispatch',()=>http(channel+' missing tender','cashier',dp(unpaid.d.id)+'/dispatch',{expectedRevision:unpaid.d.revision,requestKey:key()},400));
    const e=await http(channel+' save payment','cashier',dp(unpaid.d.id),{payload:{...p,tenderType:channel==='TAKEAWAY'?'CARD':channel},expectedRevision:unpaid.d.revision,requestKey:key()},200,'PATCH');
    equal(channel+' payment before admission',(await dispatch({d:e.draft})).result.order.status,'PAID');
  }
  return {f,body,made,order,saved};
}
async function authorityAndService(context) {
  phase='live authority, kitchen workflow, and service closure';
  const {order}=context;
  const queue=await http('kitchen-only queue','kitchen','/api/pos/kitchen?branchId='+ids.branch);
  equal('kitchen-only capability separation',queue.capabilities,{canCashier:false,canPrepare:true,canCancel:false});
  noMoney(queue.tickets,'kitchen-only response');
  await http('kitchen cannot list bills','kitchen','/api/pos/lifecycle?branchId='+ids.branch,undefined,403);
  await http('kitchen cannot list financial orders','kitchen','/api/pos/orders?branchId='+ids.branch,undefined,403);
  await unchanged('kitchen cannot create draft',()=>http('kitchen cannot bill','kitchen','/api/pos/drafts',{branchId:ids.branch,payload:payload(),requestKey:key()},403));
  await unchanged('kitchen cannot add billed lines',()=>http('kitchen ADD denied','kitchen',op(order.id)+'/lines',{lines:[{menuItemId:ids.food,qty:1}],idempotencyKey:key()},403));
  await unchanged('kitchen cannot settle bill',()=>http('kitchen SETTLE denied','kitchen',op(order.id)+'/settle',{tenderType:'CASH',idempotencyKey:key()},403));
  const t=order.tickets.find(t=>t.station==='KITCHEN');
  for(const [actor,status] of [[null,401],['none',403],['outsider',403]]) {
    await http('queue denied '+actor,actor,'/api/pos/kitchen?branchId='+ids.branch,undefined,status);
    await http('ticket denied '+actor,actor,tp(t.id),undefined,status);
    await unchanged('action denied '+actor,()=>action(t,'START',actor,status));
    await http('lifecycle denied '+actor,actor,'/api/pos/lifecycle?branchId='+ids.branch,undefined,status);
  }
  await unchanged('cashier cannot START without kitchen grant',()=>action(t,'START','cashier',403));
  await unchanged('cannot skip READY',()=>action(t,'READY','kitchen',409));
  await unchanged('cannot skip SERVE',()=>action(t,'SERVE','cashier',409));
  await unchanged('kitchen cannot close',()=>orderAction(order,'CLOSE','kitchen',403));
  await unchanged('close unpaid/unserved denied',()=>orderAction(order,'CLOSE','cashier',409));
  const started=await unchanged('START has no stock/cost/receipt effects',()=>action(t,'START'),'posting');
  equal('START PREPARING',started.t.status,'PREPARING');
  ok('event original kitchen actor',started.t.history.some(e=>e.action==='START'&&e.actorId===ids.kitchen));
  await exact('START retry original actor and state','kitchen',tp(t.id)+'/action',started.body,started.result);
  await unchanged('START key actor bound',()=>http('START replay other authorized actor','owner',tp(t.id)+'/action',started.body,409));
  await unchanged('START key payload bound',()=>http('START key changed action','kitchen',tp(t.id)+'/action',{...started.body,action:'READY'},409));
  const bar=order.tickets.find(t=>t.station==='BAR');
  await unchanged('START key entity bound',()=>http('START key wrong ticket','kitchen',tp(bar.id)+'/action',started.body,409));
  // Same session remains valid; live grants, not stale token permissions, must govern replay.
  await q('update users set module_access=$2 where id=$1',[ids.kitchen,[]]);
  await http('revoked kitchen cannot read old ticket','kitchen',tp(t.id),undefined,403);
  await unchanged('revoked kitchen cached action denied',()=>http('revoked START replay','kitchen',tp(t.id)+'/action',started.body,403));
  await q('update users set module_access=$2 where id=$1',[ids.kitchen,['POS_KITCHEN']]);
  await q('update users set branch_id=$2 where id=$1',[ids.kitchen,ids.other]);
  await unchanged('original actor branch transfer blocks cached action',()=>http('transferred kitchen replay denied','kitchen',tp(t.id)+'/action',started.body,403));
  await q('update users set branch_id=$2 where id=$1',[ids.kitchen,ids.branch]);
  const readyBodies=[{action:'READY',expectedRevision:started.t.revision,requestKey:key()},{action:'READY',expectedRevision:started.t.revision,requestKey:key()}];
  const raced=await race('conflicting concurrent READY keys',readyBodies.map(b=>['kitchen',tp(t.id)+'/action',b]),[200,409]);
  const ready=raced.find(r=>r.status===200).data.ticket;
  equal('one READY event',ready.history.filter(e=>e.action==='READY').length,1);
  await unchanged('kitchen-only cannot SERVE',()=>action(ready,'SERVE','kitchen',403));
  await unchanged('cashier cannot READY',()=>action(started.t,'READY','cashier',403));
  const served=await unchanged('SERVE no posting',()=>action(ready,'SERVE','cashier'),'posting');
  equal('cashier SERVED',served.t.status,'SERVED');
  await exact('old START retry after SERVED is original snapshot','kitchen',tp(t.id)+'/action',started.body,started.result);
  await unchanged('no backwards START',()=>action(served.t,'START','kitchen',409));
  const barRace=await race('concurrent conflicting START versus READY',[
    ['kitchen',tp(bar.id)+'/action',{action:'START',expectedRevision:bar.revision,requestKey:key()}],
    ['kitchen',tp(bar.id)+'/action',{action:'READY',expectedRevision:bar.revision,requestKey:key()}],
  ],[200,409]);
  const bStart=barRace.find(r=>r.status===200).data.ticket;
  equal('conflicting actions admit START only',bStart.status,'PREPARING');
  const bReady=await action(bStart,'READY');await action(bReady.t,'SERVE','cashier');
  let current=await lifecycle(order.id);
  equal('prepared and served still unpaid',current.status,'OPEN');
  await unchanged('fully served unpaid cannot CLOSE',()=>orderAction(current,'CLOSE','cashier',409));
  const add={lines:[{menuItemId:ids.food,qty:1}],idempotencyKey:key()};
  const added=await http('new admitted items use conventional ADD','cashier',op(order.id)+'/lines',add,201);
  const settle={tenderType:'CARD',idempotencyKey:key()};
  const settled=await unchanged('settlement independent of new unserved ticket',()=>http('settle while preparing','cashier',op(order.id)+'/settle',settle,201),'settlement');
  equal('settlement creates exactly one receipt',(await row('select count(*)::int n from pos_receipts where order_id=$1',[order.id])).n,1);
  equal('settled PAID',settled.order.status,'PAID');
  current=await lifecycle(order.id);
  await unchanged('PAID but new ticket unserved cannot CLOSE',()=>orderAction(current,'CLOSE','cashier',409));
  for(const pending of current.tickets.filter(x=>x.status!=='SERVED')) { const s=await action(pending,'START');const r=await action(s.t,'READY');await action(r.t,'SERVE','cashier'); }
  current=await lifecycle(order.id);
  const closeBody={action:'CLOSE',expectedRevision:current.revision,requestKey:key()};
  const before=await snapshot('posting');
  const closes=await race('same-key concurrent CLOSE',[
    ['cashier',op(order.id)+'/lifecycle',closeBody],['cashier',op(order.id)+'/lifecycle',closeBody],
  ],[200,200]);
  equal('CLOSE exactly one replay',closes.filter(r=>r.data.replayed===true).length,1);
  equal('CLOSE no stock/COGS/receipt effect',await snapshot('posting'),before);
  const closed=closes.find(r=>!r.data.replayed).data;
  equal('CLOSED service status',closed.order.serviceStatus,'CLOSED');ok('closed timestamp saved',!!closed.order.closedAt);
  equal('one CLOSE event',closed.order.history.filter(e=>e.action==='CLOSE').length,1);
  await exact('CLOSE exact retry','cashier',op(order.id)+'/lifecycle',closeBody,closed);
  await unchanged('new ADD after CLOSED denied',()=>http('closed add','cashier',op(order.id)+'/lines',{...add,idempotencyKey:key()},409));
  await unchanged('new SETTLE after CLOSED denied',()=>http('closed settle','cashier',op(order.id)+'/settle',{...settle,idempotencyKey:key()},409));
  await exact('historic ADD after CLOSED safe','cashier',op(order.id)+'/lines',add,added);
  await exact('historic SETTLE after CLOSED safe','cashier',op(order.id)+'/settle',settle,settled);
  await unchanged('paid cancellation denied',()=>orderAction(closed.order,'CANCEL','manager',409,{reason:'Synthetic no refund'}));
  return {started,t,oid:order.id};
}
async function cancellationAndPrivacy() {
  phase='manager cancellation, retained original evidence, live privacy';
  const f=await draft();const sent=await dispatch(f);let o=await lifecycle(sent.oid);
  await unchanged('cashier cannot cancel unpaid order',()=>orderAction(o,'CANCEL','cashier',403,{reason:'Synthetic denied'}));
  await unchanged('kitchen cannot cancel unpaid order',()=>orderAction(o,'CANCEL','kitchen',403,{reason:'Synthetic denied'}));
  await unchanged('manager cancellation reason required',()=>orderAction(o,'CANCEL','manager',400));
  await unchanged('blank cancellation reason invalid',()=>orderAction(o,'CANCEL','manager',400,{reason:'   '}));
  const original=await row('select * from pos_orders where id=$1',[o.id]);
  const before=await snapshot('posting');
  const cancelled=await orderAction(o,'CANCEL','manager',200,{reason:'Synthetic customer left; do not restock'});
  equal('manager cancellation no stock/cost/receipt/restock effect',await snapshot('posting'),before);
  equal('cancel financial VOIDED',cancelled.o.status,'VOIDED');equal('cancel service CANCELLED',cancelled.o.serviceStatus,'CANCELLED');
  equal('all production tickets cancelled',cancelled.o.tickets.every(t=>t.status==='CANCELLED'),true);
  const persisted=await row('select * from pos_orders where id=$1',[o.id]);
  for(const col of ['subtotal','total_amount','cogs_amount','cogs_complete','stock_deducted_at'])equal('cancel retains '+col,persisted[col],original[col]);
  ok('cancel event audited reason/actor',cancelled.o.history.some(e=>e.action==='CANCEL'&&e.actorId===ids.manager&&e.reason===cancelled.body.reason));
  await exact('manager cancel exact retry','manager',op(o.id)+'/lifecycle',cancelled.body,cancelled.result);
  await q("update users set role='CASHIER' where id=$1",[ids.manager]);
  await unchanged('downgraded manager cannot replay cancellation',()=>http('live manager authority before cancel replay','manager',op(o.id)+'/lifecycle',cancelled.body,403));
  await q("update users set role='BRANCH_MANAGER' where id=$1",[ids.manager]);
  await unchanged('cancel key reason conflict',()=>http('changed cancellation reason','manager',op(o.id)+'/lifecycle',{...cancelled.body,reason:'Changed'},409));
  await unchanged('cancelled order ADD denied',()=>http('cancelled add','cashier',op(o.id)+'/lines',{lines:[{menuItemId:ids.food,qty:1}],idempotencyKey:key()},409));
  await unchanged('cancelled order SETTLE denied',()=>http('cancelled settle','cashier',op(o.id)+'/settle',{tenderType:'CASH',idempotencyKey:key()},409));
  const hidden=await draft();const h=await dispatch(hidden);o=await lifecycle(h.oid);const t=o.tickets[0];const start=await action(t,'START');
  await http('Owner marks fixture private','owner',op(o.id)+'/visibility',{ownerOnly:true,reason:'Synthetic GAP024 privacy'},200,'PATCH');
  equal('live private flag persisted',(await row('select owner_only from pos_orders where id=$1',[o.id])).owner_only,true);
  for(const actor of ['cashier','kitchen']) {
    await http('hidden ticket unreadable '+actor,actor,tp(t.id),undefined,404);
    await unchanged('hidden ticket action replay '+actor,()=>http('hidden START cached replay '+actor,actor,tp(t.id)+'/action',start.body,404));
    const queue=await http('filtered hidden queue '+actor,actor,'/api/pos/kitchen?branchId='+ids.branch+'&includeServed=true');
    equal('hidden ticket absent '+actor,queue.tickets.some(x=>x.id===t.id),false);
  }
  await unchanged('hidden draft dispatch cached replay',()=>http('hidden dispatch replay','cashier',dp(hidden.d.id)+'/dispatch',h.body,404));
  await unchanged('hidden draft create cached replay',()=>http('hidden draft create replay','cashier','/api/pos/drafts',hidden.body,404));
  const visible=await http('cashier filtered lifecycle','cashier','/api/pos/lifecycle?branchId='+ids.branch+'&includeClosed=true');
  equal('hidden order absent lifecycle',visible.orders.some(x=>x.id===o.id),false);
  equal('hidden dispatched draft absent lifecycle',visible.drafts.some(x=>x.id===hidden.d.id),false);
  equal('Owner authorized private ticket',(await ticket(t.id,'owner')).id,t.id);
  for(const [actor,status] of [[null,401],['none',403],['outsider',403]]) {
    await unchanged('cached dispatch authority '+actor,()=>http('cached dispatch denied '+actor,actor,dp(f.d.id)+'/dispatch',sent.body,status));
    await unchanged('cached cancellation authority '+actor,()=>http('cached cancel denied '+actor,actor,op(sent.oid)+'/lifecycle',cancelled.body,status));
  }
  return {hiddenOrder:o.id};
}
// Clone only our own rows, preserving additive schema defaults/required fields.
// Used to place newer nonmatching rows ahead of one overnight matching row.
async function cloneRow(table,source,overrides) {
  assert.ok(bound,'Fixture cloning requires proven live app binding');
  const data=await row('select to_jsonb(t) data from public.'+ident(table)+' t where id=$1',[source]);
  assert.ok(data,'Fixture clone source exists');
  const copy={...data.data,...overrides};
  await q('insert into public.'+ident(table)+' select (jsonb_populate_record(null::public.'+ident(table)+',$1::jsonb)).*',[JSON.stringify(copy)]);
}
async function overnightAndBounds() {
  phase='overnight unresolved queues and filter-before-limit';
  const f=await draft('cashier',ids.branch,payload(ids.bar));const sent=await dispatch(f);const o=await lifecycle(sent.oid);const t=o.tickets[0];
  const oldDraft=await draft();
  // Discover draft storage by exact ID, not a hard-coded proposed table name.
  const draftTables=[...new Set(columns.filter(c=>c.column_name==='id'&&/draft/i.test(c.table_name)).map(c=>c.table_name))];
  let draftTable;
  for(const table of draftTables) if((await row('select count(*)::int n from '+ident(table)+' where id=$1',[oldDraft.d.id])).n)draftTable=table;
  ok('persisted draft table identified',!!draftTable);
  await q('update '+ident(draftTable)+" set created_at=now()-interval '3 days',updated_at=now()-interval '3 days' where id=$1",[oldDraft.d.id]);
  await q("update pos_orders set created_at=now()-interval '3 days' where id=$1",[o.id]);
  await q("update pos_production_tickets set created_at=now()-interval '3 days' where id=$1",[t.id]);
  const queue=await http('overnight BAR queue','kitchen','/api/pos/kitchen?branchId='+ids.branch+'&station=BAR');
  ok('overnight SENT ticket retained',queue.tickets.some(x=>x.id===t.id));
  const live=await http('overnight lifecycle','cashier','/api/pos/lifecycle?branchId='+ids.branch);
  ok('overnight unresolved OPEN retained',live.orders.some(x=>x.id===o.id));
  ok('overnight unresolved DRAFT retained',live.drafts.some(x=>x.id===oldDraft.d.id));
  ok('queue discloses positive integer bound',Number.isInteger(queue.limit)&&queue.limit>0&&queue.limit<=2000);
  equal('queue discloses truncation type',typeof queue.truncated,'boolean');
  ok('lifecycle discloses positive integer bound',Number.isInteger(live.limit)&&live.limit>0&&live.limit<=2000);
  equal('lifecycle discloses truncation type',typeof live.truncated,'boolean');
  const legacyOrder=fresh(),legacyTicket=fresh();orderIds.add(legacyOrder);ticketIds.add(legacyTicket);
  await cloneRow('pos_orders',o.id,{id:legacyOrder,order_number:legacyOrder});
  await cloneRow('pos_production_tickets',t.id,{id:legacyTicket,order_id:legacyOrder,ticket_number:legacyTicket,snapshot_lines:null});
  await unchanged('legacy missing snapshot read cannot fabricate or post',async()=>{
    const legacy=await ticket(legacyTicket);
    equal('legacy absence explicitly disclosed',legacy.snapshotAvailable,false);
    equal('legacy lines not reconstructed from catalog',legacy.lines,[]);
    noMoney(legacy);
  });
  const decoys=[];
  for(let i=0;i<Math.max(queue.limit,live.limit)+2;i++) {
    const oid=fresh();orderIds.add(oid);decoys.push(oid);
    await cloneRow('pos_orders',o.id,{id:oid,order_number:oid,owner_only:true,created_at:new Date().toISOString()});
    const tid=fresh();ticketIds.add(tid);
    await cloneRow('pos_production_tickets',t.id,{id:tid,order_id:o.id,ticket_number:tid,station:'KITCHEN',created_at:new Date().toISOString()});
  }
  const filtered=await http('station and privacy filters before queue bound','kitchen','/api/pos/kitchen?branchId='+ids.branch+'&station=BAR');
  ok('older BAR survives newer other-station/private rows',filtered.tickets.some(x=>x.id===t.id));
  equal('station filter respected',filtered.tickets.every(x=>x.station==='BAR'),true);
  ok('queue row bound respected',filtered.tickets.length<=filtered.limit);
  const filteredOrders=await http('privacy before lifecycle bound','cashier','/api/pos/lifecycle?branchId='+ids.branch);
  ok('older visible order not crowded by hidden rows',filteredOrders.orders.some(x=>x.id===o.id));
  equal('private decoys excluded before bounds',filteredOrders.orders.some(x=>decoys.includes(x.id)),false);
  const owner=await http('Owner ALL bounded queue','owner','/api/pos/kitchen?branchId='+ids.branch+'&station=ALL');
  ok('Owner queue bounded',owner.tickets.length<=owner.limit);equal('Owner overflow disclosed',owner.truncated,true);
  await http('invalid station fails fast','kitchen','/api/pos/kitchen?branchId='+ids.branch+'&station=INVALID',undefined,400);
}
async function validation() {
  phase='HTTP contract input and origin guards';
  const f=await draft();
  for(const requestKey of ['', 'x'.repeat(129),undefined])await unchanged('invalid key rejected',()=>http('invalid request key','cashier',dp(f.d.id),{payload:f.d.payload,expectedRevision:f.d.revision,requestKey},400,'PATCH'));
  for(const expectedRevision of [0,-1,1.5,'1',undefined])await unchanged('invalid revision rejected',()=>http('invalid revision','cashier',dp(f.d.id),{payload:f.d.payload,expectedRevision,requestKey:key()},400,'PATCH'));
  await unchanged('cross origin denied',async()=>equal('cross-origin HTTP',(await request('cashier',dp(f.d.id)+'/cancel',{expectedRevision:f.d.revision,requestKey:key(),reason:'Synthetic'},'POST','http://evil.invalid')).status,403));
  await unchanged('foreign menu save denied',()=>http('cross branch draft menu','cashier',dp(f.d.id),{payload:payload(ids.otherFood),expectedRevision:f.d.revision,requestKey:key()},400,'PATCH'));
  await http('missing ticket 404','owner',tp(fresh()),undefined,404);
}
// FK-aware closure over exact fixture roots, never TRUNCATE or prefix-wide DELETE.
async function cleanup() {
  assert.ok(bound,'Cleanup forbidden until fixture app/DB binding succeeds');await bindApp();
  const c=await pool.connect();
  try {
    await c.query('begin');await c.query("set local lock_timeout='5s'");
    await c.query('create temporary table g24_cleanup_rows(rel oid,tid tid,primary key(rel,tid)) on commit drop');
    const roots=[['branches',branchIds],['users',userIds],['raw_materials',[ids.raw]],['vendors',[ids.vendor]]];
    for(const [table,list] of roots)await c.query('insert into g24_cleanup_rows select tableoid,ctid from public.'+ident(table)+' where id=any($1::text[]) on conflict do nothing',[list]);
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
        const join=fk.child_cols.map((col,i)=>'ch.'+ident(col)+'=pa.'+ident(fk.parent_cols[i])).join(' and ');
        added+=(await c.query('insert into g24_cleanup_rows select ch.tableoid,ch.ctid from '+ident(fk.child_schema)+'.'+ident(fk.child_table)+' ch join '+ident(fk.parent_schema)+'.'+ident(fk.parent_table)+' pa on '+join+' join g24_cleanup_rows r on r.rel=pa.tableoid and r.tid=pa.ctid on conflict do nothing')).rowCount;
      }
    } while(added);
    let tables=(await c.query('select distinct r.rel::int oid,n.nspname schema,c.relname name from g24_cleanup_rows r join pg_class c on c.oid=r.rel join pg_namespace n on n.oid=c.relnamespace')).rows;
    while(tables.length) {
      const blocked=[];let progress=false;
      for(const table of tables) {
        await c.query('savepoint cleanup_one');
        try {
          await c.query('delete from '+ident(table.schema)+'.'+ident(table.name)+' t using g24_cleanup_rows r where r.rel=t.tableoid and r.tid=t.ctid');
          await c.query('release savepoint cleanup_one');progress=true;
        } catch(e) { await c.query('rollback to savepoint cleanup_one');await c.query('release savepoint cleanup_one');if(e.code!=='23503')throw e;blocked.push(table); }
      }
      assert.ok(progress,'Scoped cleanup blocked by dependency cycle');tables=blocked;
    }
    for(const [table,list] of roots)assert.equal((await c.query('select count(*)::int n from '+ident(table)+' where id=any($1::text[])',[list])).rows[0].n,0,'cleanup exact root readback '+table);
    await c.query('commit');console.log('PASS scoped FK-aware fixture cleanup');
  } catch(e) { await c.query('rollback');throw e; } finally { c.release(); }
}
(async()=>{
  let failed=false;
  try {
    await bootstrap();await validation();await draftAcceptance();
    const context=await dispatchAcceptance();await authorityAndService(context);await cancellationAndPrivacy();await overnightAndBounds();
    equal('all orders omit provider contacts',(await row("select count(*)::int n from pos_orders where branch_id=any($1::text[]) and customer_phone<>''",[branchIds])).n,0);
    console.log(JSON.stringify({result:'PASS',checks}));
  } catch(e) {
    failed=true;process.exitCode=1;
    // Never print pg details/parameters, HTTP bodies, tokens, or stack dumps.
    console.error('FAIL phase='+phase+' '+(e.code==='ERR_ASSERTION'?e.message:'error '+(e.code||e.name)));
  } finally {
    try {
      if(keep&&seeded) {
        assert.ok(process.env.TMPDIR,'--keep requires configured Hermes scratch TMPDIR');
        const file=path.join(process.env.TMPDIR,'gap024-fixtures-'+randomUUID()+'.json');
        fs.writeFileSync(file,JSON.stringify({database:DATABASE,baseUrl:BASE,ids,branchIds,userIds,orderIds:[...orderIds],draftIds:[...draftIds],ticketIds:[...ticketIds],phase,checks},null,2),{flag:'wx',mode:0o600});
        console.log('KEEP non-secret fixture IDs: '+file);
      } else if(seeded&&bound)await cleanup();
      else if(seeded) { process.exitCode=1;console.error('Cleanup refused: live app binding unproven; bootstrap-only IDs '+JSON.stringify({branchIds,userIds})); }
    } catch(e) { process.exitCode=1;console.error('FAIL cleanup/keep '+(e.code||e.name));console.error('Fixture root IDs '+JSON.stringify({branchIds,userIds,rawId:ids.raw,vendorId:ids.vendor})); }
    finally { await pool.end(); }
    if(failed)console.error('Acceptance incomplete; no passing HTTP/PostgreSQL result claimed.');
  }
})();
