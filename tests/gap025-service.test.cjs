const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  const names=['currencyRates','menuItems','branches','posOrderAttempts','posOrderLines','posOrders','posProductionTicketLines','posProductionTickets','posReceipts','posDrafts','posLifecycleActions','posLifecycleEvents','posDocuments','posDocumentRequests','settings'];
  const tables=Object.fromEntries(names.map(name=>[name,new Proxy({name},{get:(t,k)=>k==='_table'?name:{table:name,key:k}})]));
  const state=Object.fromEntries(names.map(n=>[n,[]]));
  Object.assign(state,{branches:[{id:'b',name:'Branch',code:'B1',address:'Street',operatingConcept:'CONVENTIONAL',vatRatePercent:'0.00'}],menuItems:[{id:'dish',branchId:'b',name:'Saved dish',price:'10.00',isActive:true,isSellable:true,vatRatePercent:'0.00',productCode:'D',productionStation:'KITCHEN'}],deductions:[]});
  const op={sql:(parts,...values)=>({parts,values}),isNull:c=>r=>r[c.key]==null,eq:(c,v)=>r=>r[c.key]===v,ne:(c,v)=>r=>r[c.key]!==v,and:(...p)=>r=>p.filter(Boolean).every(f=>f(r)),or:(...p)=>r=>p.filter(Boolean).some(f=>f(r)),inArray:(c,v)=>r=>(Array.isArray(v)?v:v._rows().map(row=>Object.values(row)[0])).includes(r[c.key]),asc:c=>({c,d:1}),desc:c=>({c,d:-1})};
  const mocks={'drizzle-orm':op,'./cogs':{computeOrderCogs:async()=>({cogsAmount:'2.10',complete:true})},'./production':{lockRecipeStock:async()=>{},readStockRecipe:async()=>[],deductStock:async(_t,b,r,s)=>{state.deductions.push(s);return {inventoryDeducted:[],semiFgDeducted:[]};}},'./production-quantity':{directRequirements:(_b,_r,l)=>l},'./shifts':{requireOperableShift:async()=>({shiftRunId:'shift'})},'./whatsapp-triggers':{validOptionalPhone:v=>v??''}};
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
    insert:table=>({values:async values=>{for(const r of Array.isArray(values)?values:[values])state[table._table].push({revision:1,createdAt:new Date('2026-11-03T00:00:00Z'),updatedAt:new Date(),ownerOnly:false,orderId:null,...r});}}),
    update:table=>({set:values=>({where(pred){let done=false,changed=[];const run=()=>{if(!done){changed=state[table._table].filter(pred);for(const r of changed)Object.assign(r,values);done=true;}return changed;};return {returning:async()=>run(),then:(a,b)=>Promise.resolve(run()).then(a,b)};}})}),
    execute:async query=>({rows:query.parts.join('').includes('nextval')?[{value:String(++state.sequence)}]:[]}),
  };
  state.sequence=0;
  tx.transaction=async fn=>{const saved=structuredClone(state);try{return await fn(tx);}catch(e){for(const k of Object.keys(saved))state[k]=saved[k];throw e;}};
  const actor={id:'cashier',role:'CASHIER',branchId:'b',moduleAccess:['POS_CASHIER'],status:'Active'};
  const kitchen={...actor,id:'kitchen',role:'KITCHEN_STAFF',moduleAccess:['POS_KITCHEN']};
  const manager={...actor,id:'manager',role:'BRANCH_MANAGER'};
  const owner={...actor,id:'owner',role:'SUPER_ADMIN',branchId:null,moduleAccess:[]};
  return {state,tx,queries,actor,kitchen,manager,owner,service:load('pos-lifecycle'),orders:load('pos-orders'),documents:load('pos-documents')};
}
const payload={channel:'DINE_IN',tableNo:'T1',lines:[{menuItemId:'dish',qty:2}]};
const fails=status=>e=>e.status===status;
test('paid create captures names/codes and atomically persists FINAL before acknowledgment; settlement uses original catalog evidence',async()=>{
 const h=harness();const opened=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'});const line=h.state.posOrderLines[0];assert.equal(line.nameSnapshot,'Saved dish');assert.equal(line.productCodeSnapshot,'D');
 const pf=await h.documents.issueProformaPosDocument(h.tx,h.actor,{sourceType:'ORDER',sourceId:opened.order.id,expectedRevision:1,requestKey:'order-pf'});
 h.state.menuItems[0].name='Renamed';h.state.menuItems[0].productCode='NEW';h.state.menuItems[0].price='99.00';h.state.menuItems[0].vatRatePercent='18.00';
 const paid=await h.orders.settlePosOrder(h.tx,h.actor,opened.order.id,{tenderType:'CASH',idempotencyKey:'pay'});
 assert.equal(paid.finalDocument.kind,'FINAL');assert.equal(paid.finalDocument.proformaId,pf.document.id);assert.equal(paid.finalDocument.receiptNumber,paid.receipt.receiptNumber);assert.equal(paid.finalDocument.lines[0].name,'Saved dish');assert.equal(paid.receipt.lines[0].name,'Saved dish');assert.equal(paid.receipt.lines[0].productCode,'D');assert.ok(!('nameSnapshot' in paid.receipt.lines[0]));assert.ok(!('productCodeSnapshot' in paid.receipt.lines[0]));assert.equal(paid.finalDocument.sourceRevision,2);
 assert.equal((await h.orders.settlePosOrder(h.tx,h.actor,opened.order.id,{tenderType:'CASH',idempotencyKey:'pay'})).replayed,true);assert.equal(h.state.posDocuments.filter(d=>d.kind==='FINAL').length,1);assert.equal(h.state.deductions.length,1);
 assert.equal((await h.documents.issueFinalPosDocument(h.tx,h.actor,opened.order.id)).document.id,paid.finalDocument.id);
 const fast=await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,channel:'TAKEAWAY',tenderType:'CASH',idempotencyKey:'fast'});assert.equal(fast.finalDocument.kind,'FINAL');assert.equal(h.state.posReceipts.length,2);
});
test('document failure rolls back paid create and full settlement; legacy missing snapshots settles without fabricated FINAL',async()=>{
 const h=harness();const insert=h.tx.insert;h.tx.insert=t=>t._table==='posDocuments'?{values:async()=>{throw Error('document storage failure');}}:insert(t);
 await assert.rejects(h.tx.transaction(tx=>h.orders.createPosOrder(tx,h.actor,'b',{...payload,channel:'TAKEAWAY',tenderType:'CASH',idempotencyKey:'broken'})),/document storage failure/);assert.equal(h.state.posOrders.length,0);assert.equal(h.state.posReceipts.length,0);assert.equal(h.state.deductions.length,0);assert.equal(h.state.posOrderAttempts.length,0);
 h.tx.insert=insert;const order=(await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'open'})).order;h.tx.insert=t=>t._table==='posDocuments'?{values:async()=>{throw Error('document storage failure');}}:insert(t);
 await assert.rejects(h.tx.transaction(tx=>h.orders.settlePosOrder(tx,h.actor,order.id,{tenderType:'CASH',idempotencyKey:'pay'})),/document storage failure/);assert.equal(h.state.posOrders[0].status,'OPEN');assert.equal(h.state.posReceipts.length,0);assert.equal(h.state.posOrderAttempts.length,1);
 h.tx.insert=insert;h.state.posOrderLines[0].nameSnapshot=null;const paid=await h.orders.settlePosOrder(h.tx,h.actor,order.id,{tenderType:'CASH',idempotencyKey:'legacy-pay'});assert.equal(paid.finalDocument,null);assert.match(paid.documentUnavailableReason,/snapshot/i);assert.equal(h.state.posDocuments.length,0);assert.equal(h.state.posReceipts.length,1);
});
test('pre-dispatch draft proforma links fast-food FINAL and inherits linked order privacy after dispatch',async()=>{
 const h=harness();h.state.branches[0].operatingConcept='FAST_FOOD';const draft=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload:{...payload,tenderType:'CASH'},requestKey:'draft'})).draft;const pf=await issue(h,draft.id);
 const sent=await h.service.dispatchPosDraft(h.tx,h.actor,draft.id,{expectedRevision:1,requestKey:'dispatch'});assert.equal(sent.finalDocument.proformaId,pf.document.id);assert.equal(sent.finalDocument.sourceType,'ORDER');
 assert.equal((await h.documents.readPosDocument(h.tx,h.actor,pf.document.id)).document.id,pf.document.id);h.state.posOrders[0].ownerOnly=true;
 await assert.rejects(h.documents.readPosDocument(h.tx,h.actor,pf.document.id),fails(404));await assert.rejects(issue(h,draft.id),fails(404));assert.equal((await h.documents.listPosDocuments(h.tx,h.actor)).documents.length,0);assert.equal((await h.documents.listPosDocuments(h.tx,h.owner)).documents.length,2);
});
const issue=(h,id,key='pf',revision=1)=>h.documents.issueProformaPosDocument(h.tx,h.actor,{sourceType:'DRAFT',sourceId:id,expectedRevision:revision,requestKey:key});
function route(h,name){const filename=path.join(__dirname,'../src/app/api/pos/documents',name,'route.ts');assert.ok(fs.existsSync(filename),'document route must exist');const m={exports:{}};const req=r=>r==='@/lib/server/pos-documents'?h.documents:r==='@/lib/server/auth'?{mutate:async(request,fn)=>{if(request.headers.get('origin')!=='http://localhost')throw Object.assign(Error('Origin denied'),{status:403});return h.tx.transaction(tx=>fn(tx,h.actor));},locked:async fn=>fn(h.tx),requireIdentity:async()=>h.actor}:r==='@/lib/server/http'?{api:async fn=>{try{return await fn();}catch(e){return Response.json({error:e.message},{status:e.status??500});}},body:async r=>r.json(),json:(v,status=200)=>Response.json(v,{status})}:require(r);vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}})`)(req,m,m.exports);return (method,input,id,query='',origin='http://localhost')=>m.exports[method](new Request(`http://localhost/api/pos/documents${query}`,{method,headers:{origin,'content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})}),{params:Promise.resolve({id})});}
test('document HTTP handlers run real service, await params, reject foreign origin and preserve initial/replay statuses',async()=>{
 const h=harness(),draft=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'d'})).draft;
 const post=route(h,'proforma'),input={sourceType:'DRAFT',sourceId:draft.id,expectedRevision:1,requestKey:'http'};
 assert.equal((await post('POST',input,null,'','http://evil')).status,403);assert.equal(h.state.posDocuments.length,0);
 const response=await post('POST',input);assert.equal(response.status,201);const d=(await response.json()).document;
 assert.equal((await post('POST',input)).status,200);assert.equal((await route(h,'[id]')('GET',null,d.id)).status,200);
 const listed=await route(h,'')('GET',null,null,`?sourceType=DRAFT&sourceId=${draft.id}`);assert.equal(listed.status,200);assert.equal((await listed.json()).documents.length,1);
 assert.equal((await route(h,'')('GET',null,null,'?sourceType=DRAFT')).status,400);assert.equal((await post('POST',{...input,kind:'FINAL'})).status,400);
 h.actor=h.kitchen;assert.equal((await route(h,'[id]')('GET',null,d.id)).status,403);
});
test('source revision, request identity, branch and financial access gates reject without business writes',async()=>{
 const h=harness();const draft=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'d'})).draft;const first=await issue(h,draft.id);
 const before=JSON.stringify(h.state);const base={sourceType:'DRAFT',sourceId:draft.id,expectedRevision:1,requestKey:'pf'};
 for(const [actor,input,status] of [[h.kitchen,base,403],[{...h.actor,branchId:'other'},base,403],[{...h.actor,id:'another'},base,409],[h.actor,{...base,sourceType:'ORDER'},404],[h.actor,{...base,expectedRevision:2},409],[h.actor,{...base,requestKey:'stale',expectedRevision:2},409],[h.actor,{...base,requestKey:'bad',expectedRevision:0},400],[h.actor,{...base,requestKey:'x'.repeat(129)},400],[h.actor,{...base,sourceType:'BOGUS'},400],[h.actor,{...base,sourceId:'missing'},404],[h.actor,{...base,context:{draftId:'x'}},400]]) await assert.rejects(h.documents.issueProformaPosDocument(h.tx,actor,input),fails(status));
 const other=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'other'})).draft;await assert.rejects(issue(h,other.id,'pf'),fails(409));
 h.state.posDrafts.pop();h.state.posLifecycleActions.pop();h.state.posLifecycleEvents.pop();assert.equal(JSON.stringify(h.state),before);
 await assert.rejects(h.documents.readPosDocument(h.tx,h.kitchen,first.document.id),fails(403));await assert.rejects(h.documents.listPosDocuments(h.tx,h.kitchen),fails(403));assert.equal(h.state.sequence,1);
});
test('new revisions replace estimates without altering history; stale or amount/name/code evidence cannot link FINAL',async()=>{
 const h=harness();const draft=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload:{...payload,tenderType:'CASH'},requestKey:'d'})).draft;const original=await issue(h,draft.id);
 await h.service.editPosDraft(h.tx,h.actor,draft.id,{payload:{...payload,tenderType:'CASH',tableNo:'T2'},expectedRevision:1,requestKey:'edit'});
 const replacement=await issue(h,draft.id,'replacement',2);assert.notEqual(replacement.document.number,original.document.number);assert.equal(replacement.document.sourceRevision,2);assert.equal((await h.documents.readPosDocument(h.tx,h.actor,original.document.id)).document.tableNo,'T1');
 h.state.menuItems[0].productCode='changed-code';const sent=await h.service.dispatchPosDraft(h.tx,h.actor,draft.id,{expectedRevision:2,requestKey:'dispatch'});
 const paid=await h.orders.settlePosOrder(h.tx,h.actor,sent.order.id,{tenderType:'CASH',idempotencyKey:'pay'});assert.equal(paid.finalDocument.proformaId,null);assert.equal(paid.finalDocument.seller.tin,null);assert.equal(paid.finalDocument.seller.vrn,null);
 const h2=harness();const d2=(await h2.service.createPosDraft(h2.tx,h2.actor,'b',{payload:{...payload,tenderType:'CASH'},requestKey:'d'})).draft;await issue(h2,d2.id);await h2.service.editPosDraft(h2.tx,h2.actor,d2.id,{payload:{...payload,tenderType:'CASH'},expectedRevision:1,requestKey:'edit'});h2.state.branches[0].operatingConcept='FAST_FOOD';assert.equal((await h2.service.dispatchPosDraft(h2.tx,h2.actor,d2.id,{expectedRevision:2,requestKey:'send'})).finalDocument.proformaId,null);
});
test('current order proforma uses captured VAT/name/blank code; legacy requests have no number or document effects',async()=>{
 const h=harness();h.state.branches[0].vatRatePercent='18.00';h.state.menuItems[0].productCode='';const order=(await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'o'})).order;
 h.state.branches[0].vatRatePercent='0.00';h.state.menuItems[0].name='changed';h.state.menuItems[0].productCode='changed';const input={sourceType:'ORDER',sourceId:order.id,expectedRevision:1,requestKey:'pf'};
 const pf=(await h.documents.issueProformaPosDocument(h.tx,h.actor,input)).document;assert.equal(pf.lines[0].name,'Saved dish');assert.equal(pf.lines[0].productCode,'');assert.equal(pf.lines[0].vatRatePercent,'18.00');assert.equal(pf.taxAmount,'3.60');assert.equal(pf.totalAmount,'23.60');assert.equal(pf.vat.rates[0].vatAmount,'3.60');
 h.state.posOrderLines[0].nameSnapshot=null;const before=JSON.stringify(h.state);await assert.rejects(h.documents.issueProformaPosDocument(h.tx,h.actor,{...input,requestKey:'legacy'}),fails(409));assert.equal(JSON.stringify(h.state),before);
});
test('installed node-postgres adapter returns QueryResult.rows and issued numbers consume that real adapter shape',async()=>{
 const {drizzle}=require('drizzle-orm/node-postgres'),{sql}=require('drizzle-orm');const calls=[];
 const db=drizzle({query:async config=>{calls.push(config.text);return {command:'SELECT',rowCount:1,oid:0,fields:[],rows:[{value:'9007199254740993'}]};}});
 const h=harness(),execute=h.tx.execute;h.tx.execute=query=>query.parts.join('').includes('nextval')?db.execute(sql`select nextval('pos_document_number_seq')::text as value`):execute(query);
 const draft=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'d'})).draft;const pf=await issue(h,draft.id);assert.match(pf.document.number,/-9007199254740993$/);assert.equal(calls.length,1);assert.match(calls[0],/nextval/);
});
test('installed Drizzle emits one bounded newest-first SQL query with live draft/order privacy before LIMIT',async()=>{
 const cache={};function load(filename){filename=path.resolve(filename);if(cache[filename])return cache[filename];const m={exports:{}};cache[filename]=m.exports;const req=r=>r.startsWith('.')?load(path.resolve(path.dirname(filename),r+'.ts')):require(r);vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}})`)(req,m,m.exports);return cache[filename]=m.exports;}
 const service=load(path.join(__dirname,'../src/lib/server/pos-documents.ts'));const calls=[];const db=require('drizzle-orm/node-postgres').drizzle({query:async(config,params)=>{calls.push({text:config.text,params});return {rows:[],fields:[],rowCount:0};}});
 const h=harness();const result=await service.listPosDocuments(db,h.actor);assert.deepEqual(result.documents,[]);assert.equal(calls.length,1);const query=calls[0];assert.match(query.text,/owner_only/);assert.match(query.text,/pos_drafts/);assert.match(query.text,/order_id.*is null/);assert.match(query.text,/order by "pos_documents"\."issued_at" desc/);assert.match(query.text,/limit \$/);assert.equal(query.params.at(-1),201);assert.ok(query.params.includes(false));assert.ok(query.params.includes('b'));
});
test('history database query is bounded after privacy and returns newest documents rather than hiding them after 200',async()=>{
 const h=harness();const draft=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload,requestKey:'d'})).draft;await issue(h,draft.id);const t=h.state.posDocuments[0];
 h.state.posDocuments.length=0;for(let i=0;i<205;i++){const issuedAt=new Date(Date.UTC(2026,0,1,0,i));h.state.posDocuments.push({...t,id:`d-${i}`,issuedAt,snapshot:{...t.snapshot,id:`d-${i}`,issuedAt:issuedAt.toISOString()}});}
 h.queries.length=0;const list=await h.documents.listPosDocuments(h.tx,h.actor);assert.equal(list.documents[0].id,'d-204');assert.equal(list.documents.at(-1).id,'d-5');assert.equal(list.truncated,true);assert.equal(list.documents.length,200);
 const headers=h.queries.filter(q=>q.table==='posDocuments');assert.equal(headers.length,1);assert.equal(headers[0].max,201);assert.equal(headers[0].sort[0].d,-1);
});
test('history privacy is applied before bound, source pairing is validated and reads have zero effects',async()=>{
 const h=harness();const order=(await h.orders.createPosOrder(h.tx,h.actor,'b',{...payload,idempotencyKey:'o'})).order;const d=(await h.documents.issueProformaPosDocument(h.tx,h.actor,{sourceType:'ORDER',sourceId:order.id,expectedRevision:1,requestKey:'pf'})).document;
 const template=h.state.posDocuments[0];h.state.posOrders[0].ownerOnly=true;
 for(let i=0;i<210;i++)h.state.posDocuments.push({...template,id:`hidden-${i}`,snapshot:{...d,id:`hidden-${i}`}});
 const visible={...h.state.posOrders[0],id:'visible',ownerOnly:false};h.state.posOrders.push(visible);h.state.posDocuments.push({...template,id:'visible-document',sourceId:'visible',orderId:'visible',snapshot:{...d,id:'visible-document',sourceId:'visible',orderId:'visible'}});
 const before=JSON.stringify(h.state),cash=await h.documents.listPosDocuments(h.tx,h.actor);assert.deepEqual(cash.documents.map(d=>d.id),['visible-document']);assert.equal(cash.visibilityScope,'access-filtered');assert.equal(cash.truncated,false);assert.equal(cash.limit,200);
 const owner=await h.documents.listPosDocuments(h.tx,h.owner);assert.equal(owner.documents.length,200);assert.equal(owner.truncated,true);assert.equal(owner.visibilityScope,'actual');assert.match(owner.legacyNotice,/legacy/i);assert.ok(!/requestJson|requestKey|actorId|seller|lines/.test(JSON.stringify(owner.documents)));
 await assert.rejects(h.documents.listPosDocuments(h.tx,h.actor,{sourceType:'DRAFT'}),fails(400));await assert.rejects(h.documents.listPosDocuments(h.tx,h.actor,{sourceId:'x'}),fails(400));await assert.rejects(h.documents.listPosDocuments(h.tx,h.actor,{branchId:'other'}),fails(403));assert.equal(JSON.stringify(h.state),before);
});
test('draft proforma snapshots seller, item, VAT, FX and customer with no admission effects; read/replay is immutable',async()=>{
 const h=harness();h.state.settings.push({key:'RESTAURANT_NAME',value:'Original seller'});h.state.currencyRates.push({currencyCode:'USD',rateToInr:'2.000000'});
 const draft=(await h.service.createPosDraft(h.tx,h.actor,'b',{payload:{...payload,customerName:'Ada',customerPhone:'123',tenderCurrencyCode:'USD'},requestKey:'draft'})).draft;
 const first=await issue(h,draft.id);assert.equal(first.document.kind,'PROFORMA');assert.equal(first.document.seller.name,'Original seller');assert.equal(first.document.currency.baseCode,'TZS');assert.equal(first.document.currency.tenderCurrencyAmount,'10.00');assert.equal(first.document.customer.name,'Ada');assert.equal(first.document.lines[0].productCode,'D');
 const original=structuredClone(first.document);h.state.menuItems[0].name='Changed';h.state.menuItems[0].price='99.00';h.state.branches[0].name='Changed';h.state.settings[0].value='Changed';
 assert.deepEqual((await h.documents.readPosDocument(h.tx,h.actor,original.id)).document,original);
 h.state.posDrafts[0].revision=2;h.state.posDrafts[0].status='CANCELLED';assert.deepEqual((await issue(h,draft.id)).document,original);
 assert.equal((await issue(h,draft.id)).replayed,true);assert.equal(h.state.posDocuments.length,1);assert.equal(h.state.posOrders.length,0);assert.equal(h.state.posReceipts.length,0);assert.equal(h.state.deductions.length,0);assert.equal(h.state.posProductionTickets.length,0);
 assert.ok(!/requestKey|requestJson|actorId/.test(JSON.stringify(first)));
});
