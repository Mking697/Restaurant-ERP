const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  const names=['currencyRates','menuItems','branches','posOrderAttempts','posOrderLines','posOrders','posProductionTicketLines','posProductionTickets','posReceipts','posDrafts','posLifecycleActions','posLifecycleEvents','posDocuments','posDocumentRequests','settings','posPayments','posPaymentAllocations','posTokenSequences'];
  const tables=Object.fromEntries(names.map(name=>[name,new Proxy({name},{get:(t,k)=>k==='_table'?name:{table:name,key:k}})]));
  const state=Object.fromEntries(names.map(n=>[n,[]]));
  Object.assign(state,{branches:[{id:'b',name:'Branch',code:'B1',address:'Street',operatingConcept:'CONVENTIONAL',vatRatePercent:'0.00'}],menuItems:[{id:'dish',branchId:'b',name:'Saved dish',price:'10.00',isActive:true,isSellable:true,vatRatePercent:'0.00',productCode:'D',productionStation:'KITCHEN'}],deductions:[]});
  const op={sql:(parts,...values)=>({parts,values}),isNull:c=>r=>r[c.key]==null,eq:(c,v)=>r=>r[c.key]===v,ne:(c,v)=>r=>r[c.key]!==v,and:(...p)=>r=>p.filter(Boolean).every(f=>f(r)),or:(...p)=>r=>p.filter(Boolean).some(f=>f(r)),inArray:(c,v)=>r=>(Array.isArray(v)?v:v._rows().map(row=>Object.values(row)[0])).includes(r[c.key]),asc:c=>({c,d:1}),desc:c=>({c,d:-1})};
  const mocks={'drizzle-orm':op,'./cogs':{computeOrderCogs:async()=>({cogsAmount:'2.10',complete:true})},'./production':{lockRecipeStock:async()=>{},readStockRecipe:async()=>[],deductStock:async(_t,b,r,s)=>{state.deductions.push(s);return {inventoryDeducted:[],semiFgDeducted:[]};}},'./production-quantity':{directRequirements:(_b,_r,l)=>l},'./shifts':{requireOperableShift:async()=>({shiftRunId:'shift'})},'./accounts-ledger':{postPosSaleJournal:async()=>null},'./whatsapp-triggers':{validOptionalPhone:v=>v??''}};
  const cache={};
  function load(name) {
    if(cache[name])return cache[name];
    const filename=path.join(__dirname,'../src/lib/server',`${name}.ts`),module={exports:{}};
    const req=r=>r.includes('/db/schema/')?tables:Object.hasOwn(mocks,r)?mocks[r]:r.startsWith('./')?load(r.slice(2)):r.startsWith('../')?load(r):require(r);
    vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}\n})`,{filename})(req,module,module.exports);
    return cache[name]=module.exports;
  }
  const queries=[];
  const tx={
    select:projection=>({from(table){let pred=()=>true,sort=[],max=Infinity,joined=false;const rows=()=>{queries.push({table:table._table,max,sort});let rows=state[table._table].filter(pred).map(r=>joined?{...state.menuItems.find(i=>i.id===r.menuItemId),...r}:{...r});for(const s of [...sort].reverse())rows.sort((a,b)=>(a[s.c.key]>b[s.c.key]?1:a[s.c.key]<b[s.c.key]?-1:0)*s.d);rows=rows.slice(0,max);return projection?rows.map(r=>Object.fromEntries(Object.entries(projection).map(([k,c])=>[k,r[c.key]]))):rows;};const q={_rows:rows,where(p){pred=p;return q;},orderBy(...s){sort=s;return q;},limit(n){max=n;return q;},innerJoin(){joined=true;return q;},then(a,b){return Promise.resolve(rows()).then(a,b);}};return q;}}),
    insert:table=>({values:async values=>{for(const r of Array.isArray(values)?values:[values])state[table._table].push({revision:1,createdAt:new Date('2026-11-03T00:00:00Z'),updatedAt:new Date(),ownerOnly:false,paymentCaptured:false,orderId:null,...r});}}),
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
  const actor={id:'cashier',name:'Actual collector',role:'CASHIER',branchId:'b',moduleAccess:['POS_CASHIER'],status:'Active'};
  const kitchen={...actor,id:'kitchen',role:'KITCHEN_STAFF',moduleAccess:['POS_KITCHEN']};
  const manager={...actor,id:'manager',role:'BRANCH_MANAGER'};
  const owner={...actor,id:'owner',role:'SUPER_ADMIN',branchId:null,moduleAccess:[]};
  return {state,tx,queries,actor,kitchen,manager,owner,service:load('pos-lifecycle'),orders:load('pos-orders'),payments:load('pos-payments'),documents:load('pos-documents')};
}
test('bounded authorized history returns truthful coverage without private customer data',async()=>{
 const h=harness();const paid=await h.orders.createPosOrder(h.tx,h.actor,'b',input);
 const open=await h.orders.createPosOrder(h.tx,h.actor,'b',{...input,channel:'DINE_IN',tableNo:'1',idempotencyKey:'open'});
 h.state.posOrders.push({...h.state.posOrders[0],id:'legacy',paymentCaptured:false,customerName:'Secret customer'});
 let list=await h.payments.listPosPayments(h.tx,h.actor,{});
 assert.equal(list.orders.find(o=>o.id===paid.order.id).coverage,'CAPTURED');assert.equal(list.orders.find(o=>o.id===open.order.id).outstandingAmount,'20.00');assert.equal(list.orders.find(o=>o.id==='legacy').legacyRecordedAmount,'20.00');assert.equal(list.limit,200);assert.equal(list.visibilityScope,'access-filtered');assert.ok(!JSON.stringify(list).includes('Secret customer'));
 h.state.posPaymentAllocations.length=0;list=await h.payments.listPosPayments(h.tx,h.actor,{});const broken=list.orders.find(o=>o.id===paid.order.id);assert.equal(broken.coverage,'UNAVAILABLE');assert.equal(broken.collectedAmount,null);assert.ok(broken.unavailableReason);
 h.state.posOrders[0].ownerOnly=true;await assert.rejects(h.payments.listPosPayments(h.tx,h.actor,{orderId:paid.order.id}),e=>e.status===404);assert.equal((await h.payments.listPosPayments(h.tx,h.actor,{})).orders.length,2);
 await assert.rejects(h.payments.listPosPayments(h.tx,h.kitchen,{}),e=>e.status===403);await assert.rejects(h.payments.listPosPayments(h.tx,h.actor,{branchId:'other'}),e=>e.status===403);
});
const input={channel:'TAKEAWAY',tenderType:'CASH',lines:[{menuItemId:'dish',qty:2}],idempotencyKey:'paid'};
test('paid admission persists immutable full collection after receipt/FINAL and before saved acknowledgment',async()=>{
 const h=harness(); const result=await h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',input));
 assert.ok(result.payment,'payment acknowledgment required');
 const p=result.payment;assert.equal(p.amount,'20.00');assert.equal(p.collectorId,'cashier');assert.equal(p.collectorName,'Actual collector');assert.equal(p.shiftRunId,'shift');assert.equal(p.sourceAction,'CREATE');assert.equal(p.receiptNumber,result.receipt.receiptNumber);assert.equal(p.finalDocumentId,result.finalDocument.id);assert.equal(p.allocation.amount,p.amount);assert.equal(h.state.posOrders[0].paymentCaptured,true);assert.equal(h.state.posPayments.length,1);assert.equal(h.state.posPaymentAllocations.length,1);
 const replay=await h.orders.createPosOrder(h.tx,h.actor,'b',input);assert.deepEqual(replay.payment,p);assert.equal(h.state.posPayments.length,1);
});
