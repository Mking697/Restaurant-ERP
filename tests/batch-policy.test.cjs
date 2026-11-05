const fs=require('node:fs'),ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const test=require('node:test'),assert=require('node:assert/strict');
test('allocator refuses unknown stock and persists signed debit audit with source identity',async()=>{
 const {allocateConsume}=require('../src/lib/server/stock-batches.ts');
 const calls=[]; let rows=[{id:'unknown',qtyRemaining:'5.000',expiryDate:null,expiryStatus:'UNKNOWN'}];
 const query={where(){return this},orderBy(){return this},for(){return Promise.resolve(rows)}};
 const tx={select(){return {from(){return query}}},update(){return {set(v){calls.push(v);return {where:async()=>{}}}}},insert(t){return {values:async(v)=>calls.push(v)}}};
 await assert.rejects(allocateConsume(tx,'branch','raw','1.000',{allowExpired:false,actorId:'actor',sourceType:'POS',sourceId:'order'}),e=>e.status===409);
 assert.equal(calls.length,0);
 rows=[{id:'dated',qtyRemaining:'5.000',expiryDate:'2099-01-01',expiryStatus:'DATED'}];
 await allocateConsume(tx,'branch','raw','1.000',{allowExpired:false,actorId:'actor',sourceType:'POS',sourceId:'order'});
 assert.ok(calls.some(v=>v.qtyDelta==='-1.000'&&v.actorId==='actor'&&v.sourceId==='order'&&v.batchId==='dated'));
});
test('reconciliation only classifies exact positive unbatched difference; no duplicate credit',()=>{
 const {reconciliationLots}=require('../src/lib/server/batch-policy.ts');
 const lots=[{batchNo:'real lot',qty:'2.125',expiryDate:'2027-02-01'}];
 assert.equal(reconciliationLots('5.125','3.000',lots,'invoice label').length,1);
 assert.throws(()=>reconciliationLots('5.125','3.000',[{...lots[0],qty:'2.124'}],'invoice label'),e=>e.status===409);
 assert.throws(()=>reconciliationLots('5.125','5.125',lots,'invoice label'),e=>e.status===409);
 assert.throws(()=>reconciliationLots('5.125','6',lots,'invoice label'),e=>e.status===409);
 assert.throws(()=>reconciliationLots('5.125','3.000',[{...lots[0],actorId:'spoof'}],'invoice label'),e=>e.status===400);
});
test('short multi-lot receipts require explicit per-allocation quantities and preserve zero receipts',()=>{
 const {transferReceiptInput}=require('../src/lib/server/batch-policy.ts');
 const lots=[{id:'a',qtyDispatched:'2.000'},{id:'b',qtyDispatched:'3.000'}];
 assert.throws(()=>transferReceiptInput({qtyReceived:'4'},lots),e=>e.status===400);
 assert.deepEqual(transferReceiptInput({qtyReceived:'5'},lots),{qtyReceived:'5.000',allocations:[{allocationId:'a',qtyReceived:'2.000'},{allocationId:'b',qtyReceived:'3.000'}]});
 assert.deepEqual(transferReceiptInput({qtyReceived:'1',allocations:[{allocationId:'b',qtyReceived:'1'},{allocationId:'a',qtyReceived:'0'}]},lots).allocations,[{allocationId:'a',qtyReceived:'0.000'},{allocationId:'b',qtyReceived:'1.000'}]);
 assert.throws(()=>transferReceiptInput({qtyReceived:'4',allocations:[{allocationId:'a',qtyReceived:'3'},{allocationId:'b',qtyReceived:'1'}]},lots),e=>e.status===400);
 assert.throws(()=>transferReceiptInput({qtyReceived:'1',allocations:[{allocationId:'a',qtyReceived:'1'},{allocationId:'a',qtyReceived:'0'}]},lots),e=>e.status===400);
});
test('quality accepts batch evidence, rejects imaginary dates and keeps historical replay shape',()=>{
 const {parseQualityInput,sameQualityRequest}=require('../src/lib/server/grn-quality-policy.ts');
 const old={result:'PASS',lines:[{id:'line',qtyFailed:'0.000',expiryDate:null}],note:'',photoUrl:''};
 assert.equal(sameQualityRequest(parseQualityInput(old),old),true);
 assert.throws(()=>parseQualityInput({...old,lines:[{id:'line',qtyFailed:'0',expiryDate:'2026-02-30'}]}),e=>e.status===400);
 const line=parseQualityInput({...old,lines:[{id:'line',qtyFailed:'0',batchNo:'real',nonExpiring:true,evidence:'manufacturer spec'}]}).lines[0];
 assert.equal(line.batchNo,'real'); assert.equal(line.nonExpiring,true); assert.equal(line.evidence,'manufacturer spec');
});
test('sumBatchQty sums real lot remainders with exact bigint decimal math, never floating point',()=>{
 const {sumBatchQty}=require('../src/lib/server/batch-policy.ts');
 // 0.1+0.2 style drift: naive Number() summation of these 30 rows does not
 // land exactly on "3.000" in IEEE-754 — this is the regression this test
 // guards against (see reconciliationLots' EXACT-match requirement, which a
 // one-thousandth drift here would wrongly fail or misclassify).
 const rows=Array.from({length:30},()=>({qtyRemaining:'0.100'}));
 assert.equal(sumBatchQty(rows),'3.000');
 assert.equal(sumBatchQty([{qtyRemaining:'2.125'},{qtyRemaining:'0.875'}]),'3.000');
 assert.equal(sumBatchQty([]),'0.000');
});
test('unknown expiry is held; explicit non-expiring requires Owner evidence; dates are real calendar dates',()=>{
 const {parseBatchInput,batchDisposition}=require('../src/lib/server/batch-policy.ts');
 assert.equal(parseBatchInput({},false).expiryStatus,'UNKNOWN');
 assert.equal(batchDisposition({expiryDate:null,expiryStatus:'UNKNOWN'},'2026-10-31').held,true);
 assert.throws(()=>parseBatchInput({nonExpiring:true,evidence:'manufacturer label'},false),e=>e.status===403);
 assert.throws(()=>parseBatchInput({nonExpiring:true},true),e=>e.status===400);
 assert.equal(parseBatchInput({nonExpiring:true,evidence:'manufacturer specification'},true).expiryStatus,'NON_EXPIRING');
 assert.throws(()=>parseBatchInput({expiryDate:'2026-02-30'},true),e=>e.status===400);
 assert.throws(()=>parseBatchInput({expiryDate:'2026-11-01',nonExpiring:true,evidence:'proof'},true),e=>e.status===400);
 assert.throws(()=>parseBatchInput({nonExpiring:'false'},true),e=>e.status===400);
 assert.equal(batchDisposition({expiryDate:'2026-10-30',expiryStatus:'DATED'},'2026-10-31').held,true);
 assert.equal(batchDisposition({expiryDate:'2026-10-31',expiryStatus:'DATED'},'2026-10-31').held,false);
 assert.equal(batchDisposition({expiryDate:'2026-11-01',expiryStatus:'UNKNOWN'},'2026-10-31').expiryStatus,'DATED');
});
