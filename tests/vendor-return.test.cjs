const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const source=()=>({id:'g',branchId:'a',poId:'po',vendorId:'v',qualityNote:'Damaged packs',lines:[{id:'rice',qtyFailed:'2.125',rateOrdered:'10.25'},{id:'oil',qtyFailed:'0.500',rateOrdered:'100.00'},{id:'pass',qtyFailed:'0.000',rateOrdered:'10.00'}]});
test('failed line claims use exact thousandths and saved rate paise with per-line half-up rounding',()=>{
 const {returnPlan}=require('../src/lib/server/vendor-return-policy.ts');
 assert.deepEqual(returnPlan(source()),[{id:'grn-return:oil',grnLineId:'oil',branchId:'a',qtyReturned:'0.500',refundAmountInr:'50.00',reasonNote:'Damaged packs'},{id:'grn-return:rice',grnLineId:'rice',branchId:'a',qtyReturned:'2.125',refundAmountInr:'21.78',reasonNote:'Damaged packs'}]);
});

test('vendor return receipts normalize JSONB member order and bind immutable claimed lines',()=>{
 const p=require('../src/lib/server/vendor-return-policy.ts'),s=source(),claims=p.returnPlan(s),at=new Date('2026-10-29T00:00:00Z');
 const rows=claims.map(line=>({...line,grnId:s.id,submittedToAccountsAt:at,createdAt:at}));
 const receipt={id:p.returnReceiptId(s.id),entityType:'GRN',entityId:s.id,action:p.RETURN_ACTION,metadataJson:{vendorId:s.vendorId,claims:claims.slice().reverse().map(c=>({reasonNote:c.reasonNote,refundAmountInr:c.refundAmountInr,qtyReturned:c.qtyReturned,branchId:c.branchId,grnLineId:c.grnLineId,id:c.id})),poId:s.poId,branchId:s.branchId,version:1}};
 assert.equal(p.validReturnReceipt(s,rows,receipt),true);
 for(const bad of [undefined,{...receipt,entityId:'foreign'},{...receipt,metadataJson:{...receipt.metadataJson,vendorId:'foreign'}}])assert.equal(p.validReturnReceipt(s,rows,bad),false);
 for(const bad of [rows.slice(0,1),[...rows,rows[0]],rows.map((r,i)=>i?r:{...r,qtyReturned:'0.001'}),rows.map((r,i)=>i?r:{...r,refundAmountInr:'1.00'}),rows.map((r,i)=>i?r:{...r,submittedToAccountsAt:null}),rows.map((r,i)=>i?r:{...r,grnId:'foreign'})])assert.equal(p.validReturnReceipt(s,bad,receipt),false);
 assert.equal(p.validReturnReceipt({...s,lines:s.lines.map(l=>({...l,rateOrdered:'1'}))},rows,receipt),false);
});
test('return policy rejects invalid/overflow operands and retains zero-rate claims',()=>{
 const {returnPlan}=require('../src/lib/server/vendor-return-policy.ts');
 for(const lines of [[],[{id:'z',qtyFailed:'0',rateOrdered:'1'}],[{id:'x',qtyFailed:'1',rateOrdered:'1'},{id:'x',qtyFailed:'2',rateOrdered:'1'}],[{id:'x',qtyFailed:'-1',rateOrdered:'1'}],[{id:'x',qtyFailed:'0.0001',rateOrdered:'1'}],[{id:'x',qtyFailed:'1',rateOrdered:'1.001'}],[{id:'x',qtyFailed:'999999999.999',rateOrdered:'99999999.99'}]])assert.throws(()=>returnPlan({...source(),lines}),e=>e.status===409);
 assert.equal(returnPlan({...source(),lines:[{id:'z',qtyFailed:'0.001',rateOrdered:'5'}]})[0].refundAmountInr,'0.01');
 assert.equal(returnPlan({...source(),lines:[{id:'z',qtyFailed:'1',rateOrdered:'0'}]})[0].refundAmountInr,'0.00');
});
test('vendor refunds grant opens Accounts only without purchase/expense authority',()=>{
 const {validateGrants,hasModule}=require('../src/lib/server/permissions.ts'),{canOpenPath}=require('../src/lib/server/page-access.ts');
 const actor={id:'a',role:'ACCOUNTANT',branchId:'a',moduleAccess:validateGrants(['VENDOR_REFUNDS'])};
 assert.equal(canOpenPath(actor,'/accounts'),true);assert.equal(canOpenPath(actor,'/purchase'),false);assert.equal(hasModule(actor,'ACCOUNTS_EXPENSES'),false);assert.equal(hasModule(actor,'PURCHASE_ORDER'),false);
});
