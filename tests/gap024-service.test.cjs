const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  const names=['currencyRates','menuItems','branches','posOrderAttempts','posOrderLines','posOrders','posProductionTicketLines','posProductionTickets','posReceipts','posDrafts','posLifecycleActions','posLifecycleEvents'];
  const tables=Object.fromEntries(names.map(name=>[name,new Proxy({name},{get:(t,k)=>k==='_table'?name:{table:name,key:k}})]));
  const state=Object.fromEntries(names.map(n=>[n,[]]));
  Object.assign(state,{branches:[{id:'b',name:'Branch',operatingConcept:'CONVENTIONAL',vatRatePercent:'0.00'}],menuItems:[{id:'dish',branchId:'b',name:'Saved dish',price:'10.00',isActive:true,isSellable:true,vatRatePercent:'0.00',productCode:'D',productionStation:'KITCHEN'}],deductions:[]});
  const op={isNull:c=>r=>r[c.key]==null,eq:(c,v)=>r=>r[c.key]===v,ne:(c,v)=>r=>r[c.key]!==v,and:(...p)=>r=>p.filter(Boolean).every(f=>f(r)),or:(...p)=>r=>p.filter(Boolean).some(f=>f(r)),inArray:(c,v)=>r=>v.includes(r[c.key]),asc:c=>({c,d:1}),desc:c=>({c,d:-1})};
  const mocks={'drizzle-orm':op,'./cogs':{computeOrderCogs:async()=>({cogsAmount:'2.10',complete:true})},'./production':{lockRecipeStock:async()=>{},readStockRecipe:async()=>[],deductStock:async(_t,b,r,s)=>{state.deductions.push(s);return {inventoryDeducted:[],semiFgDeducted:[]};}},'./production-quantity':{directRequirements:(_b,_r,l)=>l},'./shifts':{requireOperableShift:async()=>({shiftRunId:'shift'})},'./accounts-ledger':{postPosSaleJournal:async()=>null},'./pos-documents':{issueFinalPosDocument:async()=>({document:null,unavailableReason:'Isolated legacy harness'})},'./pos-payments':{capturePosPayment:async()=>({payment:null})},'./pos-tokens':{allocatePickupToken:async(_t,_b,channel)=>channel==='TAKEAWAY'?'T-TEST':''},'./whatsapp-triggers':{validOptionalPhone:v=>v??''}};
  const cache={};
  function load(name) {
    if(cache[name])return cache[name];
    const filename=path.join(__dirname,'../src/lib/server',`${name}.ts`),module={exports:{}};
    const req=r=>r.includes('/db/schema/')?tables:Object.hasOwn(mocks,r)?mocks[r]:r.startsWith('./')?load(r.slice(2)):r.startsWith('../')?load(r):require(r);
    vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}\n})`,{filename})(req,module,module.exports);
    return cache[name]=module.exports;
  }
  const tx={
    select:projection=>({from(table){let pred=()=>true,sort=[],max=Infinity,joined=false;const rows=()=>{let rows=state[table._table].filter(pred).map(r=>joined?{...state.menuItems.find(i=>i.id===r.menuItemId),...r}:{...r});for(const s of [...sort].reverse())rows.sort((a,b)=>(a[s.c.key]>b[s.c.key]?1:a[s.c.key]<b[s.c.key]?-1:0)*s.d);rows=rows.slice(0,max);return projection?rows.map(r=>Object.fromEntries(Object.entries(projection).map(([k,c])=>[k,r[c.key]]))):rows;};const q={where(p){pred=p;return q;},orderBy(...s){sort=s;return q;},limit(n){max=n;return q;},innerJoin(){joined=true;return q;},then(a,b){return Promise.resolve(rows()).then(a,b);}};return q;}}),
    insert:table=>({values:async values=>{for(const r of Array.isArray(values)?values:[values])state[table._table].push({revision:1,createdAt:new Date('2026-11-03T00:00:00Z'),updatedAt:new Date(),ownerOnly:false,orderId:null,...r});}}),
    update:table=>({set:values=>({where(pred){let done=false,changed=[];const run=()=>{if(!done){changed=state[table._table].filter(pred);for(const r of changed)Object.assign(r,values);done=true;}return changed;};return {returning:async()=>run(),then:(a,b)=>Promise.resolve(run()).then(a,b)};}})}),
    execute:async()=>[],
  };
  const actor={id:'cashier',role:'CASHIER',branchId:'b',moduleAccess:['POS_CASHIER'],status:'Active'};
  const kitchen={...actor,id:'kitchen',role:'KITCHEN_STAFF',moduleAccess:['POS_KITCHEN']};
  const manager={...actor,id:'manager',role:'BRANCH_MANAGER'};
  const owner={...actor,id:'owner',role:'SUPER_ADMIN',branchId:null,moduleAccess:[]};
  return {state,tx,actor,kitchen,manager,owner,service:load('pos-lifecycle'),orders:load('pos-orders')};
}
const payload={channel:'DINE_IN',tableNo:'T1',lines:[{menuItemId:'dish',qty:2}]};
const fails=status=>e=>e.status===status;
test('persisted draft save/edit is optimistic, validates sellable items, and has zero admission effects',async()=>{
  const h=harness(),s=h.service;
  const initial=await s.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'new'});
  assert.equal(initial.draft.status,'DRAFT');assert.equal(initial.draft.revision,1);
  assert.equal(h.state.posOrders.length,0);assert.equal(h.state.posProductionTickets.length,0);assert.equal(h.state.deductions.length,0);
  const edit={payload:{...payload,tableNo:'T2'},expectedRevision:1,requestKey:'edit'};
  const edited=await s.editPosDraft(h.tx,h.actor,initial.draft.id,edit);
  assert.equal(edited.draft.revision,2);assert.equal(edited.draft.payload.tableNo,'T2');
  assert.equal((await s.editPosDraft(h.tx,h.actor,initial.draft.id,edit)).replayed,true);
  await assert.rejects(s.editPosDraft(h.tx,h.actor,initial.draft.id,{...edit,requestKey:'stale'}),fails(409));
  h.state.menuItems[0].isSellable=false;
  await assert.rejects(s.editPosDraft(h.tx,h.actor,initial.draft.id,{...edit,expectedRevision:2,requestKey:'bad-item'}),fails(400));
});

test('dispatch admits exactly once with immutable no-price snapshots and independent active status',async()=>{
  const h=harness(),s=h.service;
  const draft=(await s.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'draft'})).draft;
  const input={expectedRevision:1,requestKey:'send'};
  const sent=await s.dispatchPosDraft(h.tx,h.actor,draft.id,input);
  assert.equal(sent.draft.status,'DISPATCHED');assert.equal(sent.draft.orderId,sent.order.id);
  assert.equal(h.state.posOrders[0].serviceStatus,'ACTIVE');assert.equal(h.state.posOrders[0].revision,1);
  assert.equal(h.state.posOrders[0].status,'OPEN');assert.equal(h.state.deductions.length,1);
  assert.deepEqual(h.state.posProductionTickets[0].snapshotLines.map(({orderLineId,...l})=>l),[{menuItemId:'dish',name:'Saved dish',qty:2}]);
  assert.equal((await s.dispatchPosDraft(h.tx,h.actor,draft.id,input)).replayed,true);
  assert.equal(h.state.posOrders.length,1);assert.equal(h.state.deductions.length,1);
  await assert.rejects(s.editPosDraft(h.tx,h.actor,draft.id,{payload,expectedRevision:2,requestKey:'no-edit'}),fails(409));
  h.state.posOrders[0].ownerOnly=true;
  await assert.rejects(s.dispatchPosDraft(h.tx,h.actor,draft.id,input),fails(404));
});

test('draft cancellation requires reason and payment-first dispatch never admits an unpaid fast-food order',async()=>{
  const h=harness(),s=h.service;h.state.branches[0].operatingConcept='FAST_FOOD';
  const draft=(await s.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'draft'})).draft;
  await assert.rejects(s.dispatchPosDraft(h.tx,h.actor,draft.id,{expectedRevision:1,requestKey:'unpaid'}),fails(400));
  assert.equal(h.state.posOrders.length,0);assert.equal(h.state.deductions.length,0);
  await assert.rejects(s.cancelPosDraft(h.tx,h.actor,draft.id,{expectedRevision:1,requestKey:'empty',reason:''}),fails(400));
  const input={expectedRevision:1,requestKey:'cancel',reason:'Customer changed plan'};
  assert.equal((await s.cancelPosDraft(h.tx,h.actor,draft.id,input)).draft.status,'CANCELLED');
  assert.equal((await s.cancelPosDraft(h.tx,h.actor,draft.id,input)).replayed,true);
  assert.equal(h.state.deductions.length,0);
});

test('ticket read/reprint uses stored no-price snapshot/history and live authorization before retry',async()=>{
  const h=harness(),s=h.service;
  const opened=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'}),id=opened.tickets[0].id;
  h.state.menuItems[0].name='Renamed';h.state.menuItems[0].price='99.00';
  const before=h.state.deductions.length;
  const read=await s.readPosTicket(h.tx,h.kitchen,id);
  assert.equal(read.ticket.lines[0].name,'Saved dish');assert.equal(read.ticket.snapshotAvailable,true);
  assert.ok(!/totalAmount|customer|price|tender|responseJson|requestJson/.test(JSON.stringify(read)));
  assert.equal(read.ticket.history[0].action,'SENT');
  const start={action:'START',expectedRevision:1,requestKey:'start'};
  const first=await s.actPosTicket(h.tx,h.kitchen,id,start);
  assert.equal(first.ticket.status,'PREPARING');assert.equal(first.ticket.revision,2);
  assert.equal((await s.actPosTicket(h.tx,h.kitchen,id,start)).replayed,true);
  await assert.rejects(s.actPosTicket(h.tx,h.kitchen,id,{action:'READY',expectedRevision:1,requestKey:'stale'}),fails(409));
  await assert.rejects(s.actPosTicket(h.tx,h.actor,id,{action:'READY',expectedRevision:2,requestKey:'cashier-ready'}),fails(403));
  await s.actPosTicket(h.tx,h.kitchen,id,{action:'READY',expectedRevision:2,requestKey:'ready'});
  await s.actPosTicket(h.tx,h.actor,id,{action:'SERVE',expectedRevision:3,requestKey:'serve'});
  const served=await s.readPosTicket(h.tx,h.kitchen,id);
  assert.equal(served.ticket.status,'SERVED');assert.equal(served.ticket.history.length,4);
  assert.equal(h.state.deductions.length,before);
  h.state.posOrders[0].ownerOnly=true;
  await assert.rejects(s.readPosTicket(h.tx,h.kitchen,id),fails(404));
  await assert.rejects(s.actPosTicket(h.tx,h.kitchen,id,start),fails(404));
  assert.equal((await s.readPosTicket(h.tx,h.owner,id)).ticket.status,'SERVED');
});

test('legacy tickets disclose unavailable snapshot without reconstructing catalog data',async()=>{
  const h=harness();const opened=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'});
  h.state.posProductionTickets[0].snapshotLines=null;
  const read=await h.service.readPosTicket(h.tx,h.kitchen,opened.tickets[0].id);
  assert.equal(read.ticket.snapshotAvailable,false);assert.deepEqual(read.ticket.lines,[]);
});

test('close requires payment and all tickets served; settlement/additions advance order revisions without touching service status',async()=>{
  const h=harness(),s=h.service;
  const opened=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'}),id=opened.order.id;
  await assert.rejects(s.actPosOrder(h.tx,h.actor,id,{action:'CLOSE',expectedRevision:1,requestKey:'unpaid'}),fails(409));
  await h.orders.addPosOrderLines(h.tx,h.actor,id,{lines:payload.lines,idempotencyKey:'add'});
  assert.equal(h.state.posOrders[0].revision,2);
  await h.orders.settlePosOrder(h.tx,h.actor,id,{tenderType:'CASH',idempotencyKey:'pay'});
  assert.equal(h.state.posOrders[0].revision,3);assert.equal(h.state.posOrders[0].serviceStatus,'ACTIVE');
  await assert.rejects(s.actPosOrder(h.tx,h.actor,id,{action:'CLOSE',expectedRevision:3,requestKey:'not-served'}),fails(409));
  for(const ticket of opened.tickets.concat([{id:h.state.posProductionTickets[1].id}])){
    await s.actPosTicket(h.tx,h.kitchen,ticket.id,{action:'START',expectedRevision:1,requestKey:`start-${ticket.id}`});
    await s.actPosTicket(h.tx,h.kitchen,ticket.id,{action:'READY',expectedRevision:2,requestKey:`ready-${ticket.id}`});
    await s.actPosTicket(h.tx,h.actor,ticket.id,{action:'SERVE',expectedRevision:3,requestKey:`serve-${ticket.id}`});
  }
  const input={action:'CLOSE',expectedRevision:3,requestKey:'close'};
  const closed=await s.actPosOrder(h.tx,h.actor,id,input);
  assert.equal(closed.order.serviceStatus,'CLOSED');assert.equal(closed.order.status,'PAID');assert.equal(closed.order.revision,4);assert.ok(closed.order.closedAt);
  assert.equal((await s.actPosOrder(h.tx,h.actor,id,input)).replayed,true);
  assert.equal(h.state.deductions.length,2);
  await assert.rejects(h.orders.addPosOrderLines(h.tx,h.actor,id,{lines:payload.lines,idempotencyKey:'after-close'}),fails(409));
  await assert.rejects(h.orders.settlePosOrder(h.tx,h.actor,id,{tenderType:'CASH',idempotencyKey:'after-close-pay'}),fails(409));
});

test('only manager cancels unpaid order; original money, lines, COGS and stock history survive without restock',async()=>{
  const h=harness(),s=h.service;
  const opened=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'}),id=opened.order.id;
  const amounts={totalAmount:h.state.posOrders[0].totalAmount,cogsAmount:h.state.posOrders[0].cogsAmount};
  const lines=JSON.stringify(h.state.posOrderLines),input={action:'CANCEL',expectedRevision:1,requestKey:'cancel',reason:'Wrong table dispatch'};
  await assert.rejects(s.actPosOrder(h.tx,h.actor,id,input),fails(403));
  const cancelled=await s.actPosOrder(h.tx,h.manager,id,input);
  assert.equal(cancelled.order.serviceStatus,'CANCELLED');assert.equal(cancelled.order.status,'VOIDED');
  assert.equal(cancelled.order.tickets[0].status,'CANCELLED');assert.equal(cancelled.order.tickets[0].revision,2);
  assert.equal(h.state.posOrders[0].totalAmount,amounts.totalAmount);assert.equal(h.state.posOrders[0].cogsAmount,amounts.cogsAmount);
  assert.equal(JSON.stringify(h.state.posOrderLines),lines);assert.equal(h.state.deductions.length,1);assert.equal(h.state.posReceipts.length,0);
  assert.equal((await s.actPosOrder(h.tx,h.manager,id,input)).replayed,true);
  await assert.rejects(h.orders.addPosOrderLines(h.tx,h.actor,id,{lines:payload.lines,idempotencyKey:'cancel-add'}),fails(409));
  await assert.rejects(h.orders.settlePosOrder(h.tx,h.actor,id,{tenderType:'CASH',idempotencyKey:'cancel-pay'}),fails(409));
  h.state.posOrders[0].ownerOnly=true;
  await assert.rejects(s.actPosOrder(h.tx,h.manager,id,input),fails(404));
  const paid=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,channel:'TAKEAWAY',tenderType:'CASH',idempotencyKey:'paid'});
  await assert.rejects(s.actPosOrder(h.tx,h.manager,paid.order.id,{...input,requestKey:'no-refund'}),e=>e.status===409&&e.message.includes('GAP-027'));
});

test('queues keep overnight work, filter authority/status/station before disclosed bounds, and hide linked private drafts',async()=>{
  const h=harness(),s=h.service;
  const draft=(await s.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'draft'})).draft;
  const sent=await s.dispatchPosDraft(h.tx,h.actor,draft.id,{expectedRevision:1,requestKey:'dispatch'});
  const template=h.state.posOrders[0],ticket=h.state.posProductionTickets[0];
  h.state.posOrders[0].ownerOnly=true;
  for(let i=0;i<210;i++) {
    h.state.posOrders.push({...template,id:`hidden-${i}`,ownerOnly:true});
    h.state.posProductionTickets.push({...ticket,id:`hidden-ticket-${i}`,orderId:`hidden-${i}`});
  }
  const visible={...template,id:'visible',ownerOnly:false,createdAt:new Date('2026-10-01T00:00:00Z')};
  h.state.posOrders.push(visible);h.state.posProductionTickets.push({...ticket,id:'visible-ticket',orderId:'visible',station:'BAR'});
  const kitchen=await s.listPosKitchen(h.tx,h.kitchen,{station:'BAR'});
  assert.deepEqual(kitchen.tickets.map(t=>t.id),['visible-ticket']);assert.equal(kitchen.truncated,false);assert.ok(kitchen.limit>0);
  assert.ok(!/totalAmount|customer|price|tender|requestJson|responseJson/.test(JSON.stringify(kitchen)));
  const lifecycle=await s.listPosLifecycle(h.tx,h.actor,{includeClosed:true});
  assert.equal(lifecycle.visibilityScope,'access-filtered');assert.equal(lifecycle.drafts.length,0);assert.equal(lifecycle.orders.length,1);assert.equal(lifecycle.orders[0].id,'visible');
  const owner=await s.listPosKitchen(h.tx,h.owner,{});
  assert.equal(owner.tickets.length,owner.limit);assert.equal(owner.truncated,true);
  await assert.rejects(s.listPosLifecycle(h.tx,h.kitchen,{}),fails(403));
  await assert.rejects(s.listPosKitchen(h.tx,{...h.kitchen,branchId:'other'},{branchId:'b'}),fails(403));
  await assert.rejects(s.listPosKitchen(h.tx,h.kitchen,{station:'UNKNOWN'}),fails(400));
  await assert.rejects(s.listPosKitchen(h.tx,h.kitchen,{includeServed:'yes'}),fails(400));
  assert.equal(h.state.deductions.length,1);
});

function routeHarness(h, route) {
  const filename=path.join(__dirname,'../src/app/api/pos',route,'route.ts'),module={exports:{}};
  const req=r=>r==='@/lib/server/pos-lifecycle'?h.service:r==='@/lib/server/permissions'?{}:r==='@/lib/server/auth'?{mutate:async(request,fn)=>{if(request.headers.get('origin')!=='http://localhost')throw Object.assign(new Error('Origin denied'),{status:403});return fn(h.tx,h.actor);},locked:async fn=>fn(h.tx),requireIdentity:async()=>h.actor}:r==='@/lib/server/http'?{api:async fn=>{try{return await fn();}catch(e){return Response.json({error:e.message},{status:e.status??500});}},body:async request=>request.json(),json:(v,status=200)=>Response.json(v,{status})}:require(r);
  vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}\n})`,{filename})(req,module,module.exports);
  return (method,input,id,url='http://localhost/api/pos')=>module.exports[method](new Request(url,{method,headers:{origin:'http://localhost','content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})}),{params:Promise.resolve({id})});
}
test('HTTP handlers execute draft, dispatch, kitchen reads and ticket actions with exact initial/replay statuses',async()=>{
  const h=harness();const create=routeHarness(h,'drafts');
  const body={branchId:'b',payload,requestKey:'http-create'};
  const initial=await create('POST',body);assert.equal(initial.status,201);const draft=(await initial.json()).draft;
  assert.equal((await create('POST',body)).status,200);
  const edit=routeHarness(h,'drafts/[id]');
  assert.equal((await edit('PATCH',{payload,expectedRevision:1,requestKey:'http-edit'},draft.id)).status,200);
  const dispatch=routeHarness(h,'drafts/[id]/dispatch'),send={expectedRevision:2,requestKey:'http-send'};
  const sent=await dispatch('POST',send,draft.id);assert.equal(sent.status,201);const ticketId=(await sent.json()).tickets[0].id;
  assert.equal((await dispatch('POST',send,draft.id)).status,200);
  assert.equal((await routeHarness(h,'lifecycle')('GET')).status,200);
  assert.equal((await routeHarness(h,'kitchen')('GET',null,null,'http://localhost/api/pos/kitchen?station=BOGUS')).status,400);
  assert.equal((await routeHarness(h,'tickets/[id]')('GET',null,ticketId)).status,200);
  h.actor=h.kitchen;
  // Route loader's identity callback uses current h.actor, proving action grant separation.
  assert.equal((await routeHarness(h,'tickets/[id]/action')('POST',{action:'START',expectedRevision:1,requestKey:'http-start'},ticketId)).status,200);
  h.actor=h.manager;
  const id=h.state.posOrders[0].id;
  assert.equal((await routeHarness(h,'orders/[id]/lifecycle')('POST',{action:'CANCEL',expectedRevision:1,requestKey:'http-cancel',reason:'Explicit correction'},id)).status,200);
  const other=(await (await create('POST',{...body,requestKey:'another'})).json()).draft;
  assert.equal((await routeHarness(h,'drafts/[id]/cancel')('POST',{expectedRevision:1,requestKey:'draft-cancel',reason:'No longer needed'},other.id)).status,200);
});

test('request keys reject overlong raw values and non-string identity fields without writes',async()=>{
  const h=harness(),s=h.service;
  for(const requestKey of [' '+ 'x'.repeat(128), 'x'.repeat(128)+' ', '', '   ', 123]) await assert.rejects(s.createPosDraft(h.tx,h.actor,'b',{payload,requestKey}),fails(400));
  for(const extra of [{channel:['DINE_IN']},{counterNo:['COUNTER_1']},{tenderType:['CASH']}]) await assert.rejects(s.createPosDraft(h.tx,h.actor,'b',{payload:{...payload,...extra},requestKey:'bad-type'}),fails(400));
  assert.equal(h.state.posDrafts.length,0);assert.equal(h.state.posLifecycleActions.length,0);
});

test('fresh service writes stay blocked after terminal service status even if financial status is OPEN',async()=>{
  for(const serviceStatus of ['CLOSED','CANCELLED']) {
    const h=harness();const opened=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'});
    h.state.posOrders[0].serviceStatus=serviceStatus;
    const before=JSON.stringify(h.state);
    await assert.rejects(h.orders.addPosOrderLines(h.tx,h.actor,opened.order.id,{lines:payload.lines,idempotencyKey:'denied-add'}),fails(409));
    await assert.rejects(h.orders.settlePosOrder(h.tx,h.actor,opened.order.id,{tenderType:'CASH',idempotencyKey:'denied-settle'}),fails(409));
    assert.equal(JSON.stringify(h.state),before);
  }
});

test('same-revision concurrent ticket actions have one winner, append-only history and exact old replay after service',async()=>{
  const h=harness(),s=h.service;const opened=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'}),id=opened.tickets[0].id;
  const first={action:'START',expectedRevision:1,requestKey:'start-a'},second={...first,requestKey:'start-b'};
  const race=await Promise.allSettled([s.actPosTicket(h.tx,h.kitchen,id,first),s.actPosTicket(h.tx,h.kitchen,id,second)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.status,409);
  const winner=race[0].status==='fulfilled'?first:second,result=race.find(r=>r.status==='fulfilled').value;
  await s.actPosTicket(h.tx,h.kitchen,id,{action:'READY',expectedRevision:2,requestKey:'ready'});
  await s.actPosTicket(h.tx,h.actor,id,{action:'SERVE',expectedRevision:3,requestKey:'serve'});
  const before=JSON.stringify(h.state),replayed=await s.actPosTicket(h.tx,h.kitchen,id,winner);
  const {replayed:flag,...original}=replayed;
  assert.equal(flag,true);assert.deepEqual(original,result);assert.equal(JSON.stringify(h.state),before);
  await assert.rejects(s.actPosTicket(h.tx,{...h.kitchen,moduleAccess:[]},id,winner),fails(403));
  await assert.rejects(s.actPosTicket(h.tx,{...h.kitchen,id:'different-actor'},id,winner),fails(409));
});
