const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const test=require('node:test'),assert=require('node:assert/strict');
const policy=()=>require('../src/lib/server/grn-quality-policy.ts');
const rows=()=>[
 {id:'a',rawMaterialId:'rice',itemDescription:'',qtyOrdered:'10.000',qtyReceived:'10.000',qtyFailed:'0.000'},
 {id:'b',rawMaterialId:'oil',itemDescription:'',qtyOrdered:'5.000',qtyReceived:'5.000',qtyFailed:'0.000'},
];
const input=(result='PASS',lines=[{id:'a',qtyFailed:'0'},{id:'b',qtyFailed:'0'}],note='')=>({result,lines,note});

test('quality parser rejects untrusted fields, invalid result, duplicate IDs and nondecimal failed quantities',()=>{
 const {parseQualityInput:p}=policy();
 for(const value of [{...input(),branchId:'foreign'},{...input(),result:'PENDING'},{...input(),lines:[]},{...input(),lines:[{id:'a',qtyFailed:'0',qtyReceived:'100'}]},{...input(),lines:[{id:'a',qtyFailed:0}]},{...input(),lines:[{id:'a',qtyFailed:'-1'}]},{...input(),lines:[{id:'a',qtyFailed:'0.0001'}]},{...input(),lines:[{id:'a',qtyFailed:'0'},{id:'a',qtyFailed:'0'}]}]) assert.throws(()=>p(value),e=>e.status===400);
});
test('quality canonical request preserves decimal equivalence and ignores line order, not notes or result',()=>{
 const {parseQualityInput:p,sameQualityRequest:s}=policy();
 assert.equal(s(p(input()),p({...input(),lines:[{id:'b',qtyFailed:'0.000'},{id:'a',qtyFailed:'0.0'}],note:'  '})),true);
 assert.equal(s(p(input()),p({...input(),photoUrl:'https://example.test/proof'})),false);
 assert.equal(s(p(input()),p({...input(),note:'another decision'})),false);
});
test('FAIL/PARTIAL require bounded reason and reference remains optional text, not a fake upload',()=>{
 const {parseQualityInput:p}=policy();
 for(const note of ['', 'x', 'a'.repeat(1001)])assert.throws(()=>p(input('FAIL',[{id:'a',qtyFailed:'10'}],note)),e=>e.status===400);
 assert.throws(()=>p({...input(),photoUrl:{path:'fake'}}),e=>e.status===400);
 assert.throws(()=>p({...input(),photoUrl:'x'.repeat(2001)}),e=>e.status===400);
 assert.equal(p(input('FAIL',[{id:'a',qtyFailed:'10'}],' damaged ')).note,'damaged');
});
test('decision binds every persisted GRN line, never client material or received quantities',()=>{
 const {parseQualityInput:p,qualityDecision:d}=policy();
 for(const lines of [[{id:'a',qtyFailed:'0'}],[{id:'a',qtyFailed:'0'},{id:'foreign',qtyFailed:'0'}]])assert.throws(()=>d(p(input('PASS',lines)),rows(),false),e=>e.status===400);
 assert.throws(()=>d(p(input()),[],false),e=>e.status===409);
 assert.throws(()=>d(p(input()),[{...rows()[0],qtyReceived:'NaN'},rows()[1]],false),e=>e.status===409);
 assert.throws(()=>d(p(input()),[{...rows()[0],rawMaterialId:null},rows()[1]],false),e=>e.status===409);
});
test('PASS/FAIL/PARTIAL are validated across all lines without adding incompatible units',()=>{
 const {parseQualityInput:p,qualityDecision:d}=policy();
 assert.deepEqual(d(p(input()),rows(),false).credits,[{rawMaterialId:'oil',qty:'5.000'},{rawMaterialId:'rice',qty:'10.000'}]);
 assert.deepEqual(d(p(input('FAIL',[{id:'a',qtyFailed:'10'},{id:'b',qtyFailed:'5'}],'spoiled')),rows(),false).credits,[]);
 const partial=d(p(input('PARTIAL',[{id:'a',qtyFailed:'10'},{id:'b',qtyFailed:'0'}],'rice spoiled')),rows(),false);
 assert.deepEqual(partial.credits,[{rawMaterialId:'oil',qty:'5.000'}]);
 for(const [result,failed]of [['PASS',['1','0']],['FAIL',['9','5']],['PARTIAL',['0','0']],['PARTIAL',['10','5']],['PARTIAL',['11','0']]])assert.throws(()=>d(p(input(result,[{id:'a',qtyFailed:failed[0]},{id:'b',qtyFailed:failed[1]}],'reason')),rows(),false),e=>e.status===400);
});
test('duplicate materials aggregate accepted integer thousandths exactly once; general items credit nothing',()=>{
 const {parseQualityInput:p,qualityDecision:d}=policy();
 const duplicate=[{...rows()[0],qtyOrdered:'0.100',qtyReceived:'0.100'},{...rows()[1],rawMaterialId:'rice',qtyOrdered:'0.200',qtyReceived:'0.200'}];
 assert.deepEqual(d(p(input()),duplicate,false).credits,[{rawMaterialId:'rice',qty:'0.300'}]);
 const general=rows().map(r=>({...r,rawMaterialId:null,itemDescription:'General item'}));
 assert.deepEqual(d(p(input()),general,true).credits,[]);
 assert.throws(()=>d(p(input()),general,false),e=>e.status===409);
 assert.throws(()=>d(p(input()),rows(),true),e=>e.status===409);
});
test('creation marker distinguishes eligible new GRNs from ambiguous legacy PENDING rows',()=>{
 const {qualityOriginId,validQualityOrigin}=policy();
 const grn={id:'g',branchId:'branch',poId:'po'};
 const receipt={id:qualityOriginId('g'),entityType:'GRN',entityId:'g',action:'GRN_CREATED',metadataJson:{version:1,branchId:'branch',poId:'po'}};
 assert.equal(validQualityOrigin(grn,receipt),true);
 assert.equal(validQualityOrigin(grn,null),false);
 assert.equal(validQualityOrigin({...grn,branchId:'foreign'},receipt),false);
 assert.equal(validQualityOrigin(grn,{...receipt,action:'OTHER'}),false);
});

test('receipt-backed posted marker fails closed for missing, malformed, foreign and inconsistent receipts',()=>{
 const {parseQualityInput:p,qualityDecision:d,qualityReceiptState:s}=policy();
 const request=p(input()),decision=d(request,rows(),false);
 const grn={id:'g',branchId:'branch',isGeneralPurchase:false,status:'APPROVED',qualityResult:'PASS',qualityNote:'',qualityPhotoUrl:''};
 const saved=rows();
 const receipt={id:'grn-quality:g',entityType:'GRN',entityId:'g',action:'GRN_QUALITY_RECORDED',createdAt:new Date('2026-10-29T00:00:00Z'),metadataJson:{version:1,branchId:'branch',request,credits:decision.credits}};
 assert.equal(s(grn,saved,receipt).inventoryPosted,true);
 const jsonbReceipt={...receipt,metadataJson:{...receipt.metadataJson,credits:decision.credits.map(credit=>({qty:credit.qty,rawMaterialId:credit.rawMaterialId}))}};
 assert.equal(s(grn,saved,jsonbReceipt).inventoryPosted,true,'Postgres JSONB property ordering must not invalidate a real receipt');
 for(const invalid of [null,{...receipt,action:'OTHER'},{...receipt,metadataJson:null},{...receipt,metadataJson:{...receipt.metadataJson,branchId:'foreign'}},{...receipt,metadataJson:{...receipt.metadataJson,credits:[]}}])assert.equal(s(grn,saved,invalid).qualityRecorded,false);
 assert.equal(s({...grn,qualityNote:'changed'},saved,receipt).qualityRecorded,false);
 assert.equal(s({...grn,status:'PENDING'},saved,receipt).qualityRecorded,false);
 assert.equal(s(grn,[{...saved[0],qtyFailed:'1.000'},saved[1]],receipt).qualityRecorded,false);
});
