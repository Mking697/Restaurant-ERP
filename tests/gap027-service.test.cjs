const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  const names=['currencyRates','menuItems','branches','posOrderAttempts','posOrderLines','posOrders','posProductionTicketLines','posProductionTickets','posReceipts','posDrafts','posLifecycleActions','posLifecycleEvents','posDocuments','posDocumentRequests','settings','posPayments','posPaymentAllocations','posOrderReversals','inventoryStock','semiFgStock','posTokenSequences'];
  const tables=Object.fromEntries(names.map(name=>[name,new Proxy({name},{get:(t,k)=>k==='_table'?name:{table:name,key:k}})]));
  const state=Object.fromEntries(names.map(n=>[n,[]]));
  Object.assign(state,{branches:[{id:'b',name:'Branch',code:'B1',address:'Street',operatingConcept:'CONVENTIONAL',vatRatePercent:'0.00'}],menuItems:[{id:'dish',branchId:'b',name:'Saved dish',price:'10.00',isActive:true,isSellable:true,vatRatePercent:'0.00',productCode:'D',productionStation:'KITCHEN'}],deductions:[],stockMovements:[],recipeRows:[{menuItemId:'dish',branchId:'b',componentType:'RAW_MATERIAL',rawMaterialId:'raw-1',componentMenuItemId:null,qtyPerUnit:'1.000'}]});
  const op={sql:(parts,...values)=>({parts,values}),isNull:c=>r=>r[c.key]==null,eq:(c,v)=>r=>r[c.key]===v,ne:(c,v)=>r=>r[c.key]!==v,and:(...p)=>r=>p.filter(Boolean).every(f=>f(r)),or:(...p)=>r=>p.filter(Boolean).some(f=>f(r)),inArray:(c,v)=>r=>(Array.isArray(v)?v:v._rows().map(row=>Object.values(row)[0])).includes(r[c.key]),asc:c=>({c,d:1}),desc:c=>({c,d:-1})};
  const mocks={'drizzle-orm':op,'./cogs':{computeOrderCogs:async()=>({cogsAmount:'2.10',complete:true})},'./production':{lockRecipeStock:async()=>{},readStockRecipe:async(_tx,_branchId,ids)=>state.recipeRows.filter(r=>ids.includes(r.menuItemId)),deductStock:async(_t,b,r,s)=>{state.deductions.push(s);return {inventoryDeducted:[],semiFgDeducted:[]};}},'./accounts-ledger':{postPosSaleJournal:async()=>null},'./production-quantity':{directRequirements:(_b,rows,demands)=>{if(!rows.length)throw new Error('Missing recipe');return {raw:new Map(demands.map(d=>['raw-1',BigInt(d.quantity)*1000n])),semiFg:new Map()};},decimal:v=>(Number(v)/1000).toFixed(3),quantity:v=>BigInt(Math.round(Number(v)*1000))},'./stock-ledger':{postStockMovement:async(_t,input)=>{state.stockMovements.push(input);}},'./shifts':{requireOperableShift:async()=>({shiftRunId:'shift'})},'./whatsapp-triggers':{validOptionalPhone:v=>v??''},'./pos-payments':{capturePosPayment:async()=>({payment:null})}};
  const cache={};
  function load(name) {
    if(cache[name])return cache[name];
    const filename=path.join(__dirname,'../src/lib/server',`${name}.ts`),module={exports:{}};
    const req=r=>r.includes('/db/schema/')?tables:Object.hasOwn(mocks,r)?mocks[r]:r.startsWith('./')?load(r.slice(2)):r.startsWith('../')?load(r):require(r);
    const body = ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInThisContext('(function(require,module,exports){' + body + '\n})',{filename})(req,module,module.exports);
    return cache[name]=module.exports;
  }
  const tx={
    select:projection=>({from(table){let pred=()=>true,sort=[],max=Infinity,joined=false;const rows=()=>{let rows=state[table._table].filter(pred).map(r=>joined?{...state.menuItems.find(i=>i.id===r.menuItemId),...r}:{...r});for(const s of [...sort].reverse())rows.sort((a,b)=>(a[s.c.key]>b[s.c.key]?1:a[s.c.key]<b[s.c.key]?-1:0)*s.d);rows=rows.slice(0,max);return projection?rows.map(r=>Object.fromEntries(Object.entries(projection).map(([k,c])=>[k,r[c.key]]))):rows;};const q={_rows:rows,where(p){pred=p;return q;},orderBy(...s){sort=s;return q;},limit(n){max=n;return q;},innerJoin(){joined=true;return q;},then(a,b){return Promise.resolve(rows()).then(a,b);}};return q;}}),
    insert:table=>({values:values=>{let done=false,inserted=[];const run=()=>{if(!done){for(const r of Array.isArray(values)?values:[values]){const row={revision:1,createdAt:new Date('2026-11-03T00:00:00Z'),updatedAt:new Date(),ownerOnly:false,paymentCaptured:false,orderId:null,...r};state[table._table].push(row);inserted.push(row);}done=true;}return inserted;};return {returning:async()=>run(),then:(a,b)=>Promise.resolve(run()).then(a,b)};}}),
    update:table=>({set:values=>({where(pred){let done=false,changed=[];const run=()=>{if(!done){changed=state[table._table].filter(pred);for(const r of changed)Object.assign(r,values);done=true;}return changed;};return {returning:async()=>run(),then:(a,b)=>Promise.resolve(run()).then(a,b)};}})}),
    execute:async query=>{
      const text=query.parts.join('?');
      if(text.includes('nextval'))return{rows:[{value:String(++state.sequence)}]};
      if(text.includes('pos_token_sequences')){
        const[id,branchId,businessDate,channel]=query.values;
        let row=state.posTokenSequences.find(r=>r.branchId===branchId&&r.businessDate===businessDate&&r.channel===channel);
        if(!row){row={id,branchId,businessDate,channel,lastValue:1};state.posTokenSequences.push(row);}else row.lastValue+=1;
        return{rows:[{last_value:row.lastValue}]};
      }
      return{rows:[]};
    },
  };
  state.sequence=0;
  tx.transaction=async fn=>{const saved=structuredClone(state);try{return await fn(tx);}catch(e){for(const k of Object.keys(saved))state[k]=saved[k];throw e;}};
  const actor={id:'cashier',name:'Actual cashier',role:'CASHIER',branchId:'b',moduleAccess:['POS_CASHIER'],status:'Active'};
  const manager={id:'manager',name:'Actual manager',role:'BRANCH_MANAGER',branchId:'b',moduleAccess:['POS_CASHIER'],status:'Active'};
  const foreignManager={...manager,id:'foreign-manager',branchId:'other'};
  const owner={id:'owner',name:'Owner',role:'SUPER_ADMIN',branchId:null,moduleAccess:[],status:'Active'};
  return {state,tx,actor,manager,foreignManager,owner,orders:load('pos-orders'),reversals:load('pos-order-reversals')};
}
const input={channel:'TAKEAWAY',tenderType:'CASH',lines:[{menuItemId:'dish',qty:2}],idempotencyKey:'void-create'};
const fails=status=>e=>e.status===status;

test('manager voids a paid order: served lines waste, unserved lines restock, refund liability captured, replay/authority/concurrency enforced',async()=>{
  const h=harness();
  const result=await h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',input));
  const orderId=h.state.posOrders[0].id;
  const ticket=h.state.posProductionTickets[0];
  const lineIds=h.state.posOrderLines.map(l=>l.id);
  h.state.posOrderLines.push({...h.state.posOrderLines[0],id:'line-2',qty:1});
  h.state.posProductionTicketLines.push({id:'tl-2',ticketId:ticket.id,orderLineId:'line-2'});
  h.state.posOrders[0].status='PAID';
  ticket.status='SERVED';
  h.state.posProductionTickets.push({id:'ticket-2',orderId,branchId:'b',station:'KITCHEN',ticketNumber:'KOT-2',status:'SENT',revision:1});
  h.state.posProductionTicketLines[h.state.posProductionTicketLines.length-1].ticketId='ticket-2';

  await assert.rejects(h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.actor,orderId,{reason:'Customer complaint'})),fails(403));
  await assert.rejects(h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.foreignManager,orderId,{reason:'Customer complaint'})),fails(403));

  const voided=await h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,orderId,{reason:'Customer complaint'}));
  assert.equal(voided.order.status,'VOIDED');
  assert.equal(h.state.posOrders[0].status,'VOIDED');
  assert.equal(h.state.posOrders[0].voidReason,'Customer complaint');
  const r=voided.reversal;
  assert.equal(r.actorId,'manager');assert.equal(r.actorName,'Actual manager');assert.equal(r.priorStatus,'PAID');
  assert.equal(r.wastedLines.length,1);assert.equal(r.wastedLines[0].menuItemId,'dish');
  assert.equal(r.restockedLines.length,1);
  assert.equal(r.refundLiabilityAmount,null);
  assert.equal(h.state.stockMovements.filter(m=>m.movementType==='ORDER_VOID_RESTOCK').length,1);

  const replay=await h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,orderId,{reason:'Customer complaint'}));
  assert.equal(replay.replayed,true);assert.equal(replay.reversal.id,r.id);
  assert.equal(h.state.posOrderReversals.length,1);
  assert.equal(h.state.stockMovements.filter(m=>m.movementType==='ORDER_VOID_RESTOCK').length,1);

  await assert.rejects(h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,orderId,{reason:'Different reason text'})),fails(409));
  assert.equal(h.state.posOrderReversals.length,1);

  const second=await h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',{...input,idempotencyKey:'void-create-2'}));
  const secondId=second.order.id;
  const ownerVoid=await h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.owner,secondId,{reason:'Owner initiated void'}));
  assert.equal(ownerVoid.order.status,'VOIDED');
});

test('OPEN order cannot be voided here; missing recipe falls back to waste instead of blocking the void',async()=>{
  const h=harness();
  const open=await h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',{channel:'DINE_IN',tableNo:'T1',tenderType:'CASH',lines:[{menuItemId:'dish',qty:1}],idempotencyKey:'open-void'}));
  const openId=open.order.id;
  assert.equal(h.state.posOrders.find(o=>o.id===openId).status,'OPEN');
  await assert.rejects(h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,openId,{reason:'Should use existing cancel'})),fails(409));

  const paid=await h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',{...input,idempotencyKey:'no-recipe'}));
  const paidId=paid.order.id;
  h.state.recipeRows.length=0;
  const voided=await h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,paidId,{reason:'Recipe since removed'}));
  assert.equal(voided.order.status,'VOIDED');
  assert.equal(voided.reversal.restockedLines.length,0);
  assert.ok(voided.reversal.wastedLines.length>=1);
});

test('short/empty/overlong reason and ownerOnly visibility are rejected before any write',async()=>{
  const h=harness();
  const paid=await h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',input));
  const orderId=paid.order.id;
  for(const reason of ['','ab',' '.repeat(10),'x'.repeat(501),undefined,42]){
    await assert.rejects(h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,orderId,{reason})),fails(400));
  }
  assert.equal(h.state.posOrders.find(o=>o.id===orderId).status,'PAID');
  h.state.posOrders.find(o=>o.id===orderId).ownerOnly=true;
  await assert.rejects(h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,orderId,{reason:'Hidden from manager'})),fails(404));
  const ownerVoid=await h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.owner,orderId,{reason:'Owner can still void'}));
  assert.equal(ownerVoid.order.status,'VOIDED');
});

test('readOrderReversal is bounded, branch/privacy-scoped and null before any void',async()=>{
  const h=harness();
  const paid=await h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',input));
  const orderId=paid.order.id;
  assert.equal(await h.tx.transaction(tx=>h.reversals.readOrderReversal(tx,h.manager,orderId)),null);
  await h.tx.transaction(tx=>h.reversals.voidPosOrder(tx,h.manager,orderId,{reason:'Customer complaint'}));
  const read=await h.tx.transaction(tx=>h.reversals.readOrderReversal(tx,h.manager,orderId));
  assert.equal(read.orderId,orderId);
  await assert.rejects(h.tx.transaction(tx=>h.reversals.readOrderReversal(tx,h.foreignManager,orderId)),fails(403));
  await assert.rejects(h.tx.transaction(tx=>h.reversals.readOrderReversal(tx,h.manager,'missing-order')),fails(404));
});
