const fs=require('node:fs'),ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const test=require('node:test'),assert=require('node:assert/strict');
const owner={id:'o',role:'SUPER_ADMIN',branchId:null,moduleAccess:[]}, staff={id:'s',role:'CASHIER',branchId:'b',moduleAccess:['LEAVE_SELF']};
test('leave review metadata excludes own requests and handles mixed on/off-roll intervals without salary disclosure',()=>{
 const {leaveReviewMetadata}=require('../src/lib/server/workforce-policy.ts');
 const leave={requestedById:'s',status:'PENDING',startDate:'2024-03-30',endDate:'2024-04-02'};
 const rates=[{effectiveFrom:'2024-01-01',employmentType:'ON_ROLL'},{effectiveFrom:'2024-04-01',employmentType:'OFF_ROLL'}];
 assert.deepEqual(leaveReviewMetadata(owner,null,leave,rates),{canReview:true,paidLeaveAllowed:false});
 assert.deepEqual(leaveReviewMetadata(owner,null,{...leave,endDate:'2024-03-31'},rates),{canReview:true,paidLeaveAllowed:true});
 assert.equal(leaveReviewMetadata(owner,'o',leave,rates).canReview,false);
 assert.equal(leaveReviewMetadata(owner,null,{...leave,requestedById:'o'},rates).canReview,false);
 assert.equal(leaveReviewMetadata(staff,null,leave,rates).canReview,false);
 assert.equal(leaveReviewMetadata(owner,null,{...leave,status:'REJECTED'},rates).canReview,false);
});
test('leave history freezes beneficiary login against clearing, replacement and late assignment',()=>{
 const w=require('../src/lib/server/workforce-policy.ts');
 for(const [current,next] of [['a',null],['a','b'],[null,'b']])assert.throws(()=>w.assertEmployeeUserLinkChange(current,next,true),e=>e.status===409);
 w.assertEmployeeUserLinkChange('a','a',true);w.assertEmployeeUserLinkChange(null,null,true);
 for(const [current,next] of [['a',null],['a','b'],[null,'b']])w.assertEmployeeUserLinkChange(current,next,false);
});
test('Owner cannot approve own linked employee OR own submitted request',()=>{const w=require('../src/lib/server/workforce-policy.ts');assert.throws(()=>w.assertReviewActor(owner,'o','s'),e=>e.status===403);assert.throws(()=>w.assertReviewActor(owner,'s','o'),e=>e.status===403);w.assertReviewActor(owner,'s','other');});
test('only approval or payroll grant can submit for another employee',()=>{const w=require('../src/lib/server/workforce-policy.ts');assert.equal(w.canSubmitOthers(staff),false);assert.equal(w.canSubmitOthers({...staff,moduleAccess:['ATTENDANCE']}),false);assert.equal(w.canSubmitOthers({...staff,moduleAccess:['PAYROLL']}),true);assert.equal(w.canSubmitOthers(owner),true);});
test('rate effective date is explicit increasing future month boundary',()=>{const w=require('../src/lib/server/workforce-policy.ts');for(const d of [undefined,'2024-03-02','2024-02-01','2024-04-01'])assert.throws(()=>w.rateEffectiveDate(d,'2024-04-01','2024-03-10'));assert.equal(w.rateEffectiveDate('2024-05-01','2024-04-01','2024-03-10'),'2024-05-01');});
test('all write payloads fail closed on unknown fields',()=>{const w=require('../src/lib/server/workforce-policy.ts');assert.throws(()=>w.allowedFields({rate:'1',status:'APPROVED'},['rate']),e=>e.status===400);w.allowedFields({rate:'1'},['rate']);});
