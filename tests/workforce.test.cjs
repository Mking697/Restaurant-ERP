const ts=require('typescript'), fs=require('node:fs');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const test=require('node:test'), assert=require('node:assert/strict');
test('calendar payroll uses leap February, rational half units and one paise rounding',()=>{
 const w=require('../src/lib/server/workforce-calculation.ts');
 const e={id:'e',branchId:'b',name:'Employee',employmentType:'ON_ROLL',joinedOn:'2024-02-28',leftOn:null};
 const rates=[{effectiveFrom:'2024-02-28',rate:'100.01',employmentType:'ON_ROLL'}];
 const r=w.calculatePayroll(e,rates,[{date:'2024-02-28',status:'HALF_DAY'}],[{startDate:'2024-02-29',endDate:'2024-02-29',status:'APPROVED',payType:'PAID'}],'2024-02');
 assert.equal(r.calendarDays,29); assert.equal(r.payableUnits,'1.5'); assert.equal(r.amount,'5.17'); assert.deepEqual(r.missingDates,[]);
});
test('future leave cannot become preview pay; pending leaves remain missing',()=>{
 const w=require('../src/lib/server/workforce-calculation.ts');const e={id:'x',branchId:'b',name:'X',employmentType:'OFF_ROLL',joinedOn:'2024-03-01',leftOn:'2024-03-03'};
 const r=w.calculatePayroll(e,[{effectiveFrom:'2024-03-01',rate:'10.01',employmentType:'OFF_ROLL'}],[{date:'2024-03-01',status:'HALF_DAY'}],[{startDate:'2024-03-02',endDate:'2024-03-02',status:'PENDING',payType:null},{startDate:'2024-03-03',endDate:'2024-03-03',status:'APPROVED',payType:'PAID'}],'2024-03','2024-03-02');
 assert.equal(r.amount,'5.01');assert.deepEqual(r.missingDates,['2024-03-02']);assert.equal(r.unpaidDays,0);
 assert.equal(w.businessDate(new Date('2024-03-31T19:00:00Z')),'2024-04-01');
});
test('strict calendar and decimal validation rejects normalized invalid dates and floating INR',()=>{
 const w=require('../src/lib/server/workforce-calculation.ts');for(const x of ['2024-02-30','2023-02-29','24-01-01','2024-13-01'])assert.throws(()=>w.day(x),e=>e.status===400);for(const x of ['1.001','-1','1e2',1,'0'])assert.throws(()=>w.paise(x));
 assert.equal(w.monthRange('2023-02').calendarDays,28);assert.equal(w.monthRange('2024-04').calendarDays,30);
});
test('ON_ROLL actual 28/29/30/31-day months pay exact monthly rate, with no missing-day assumption',()=>{
 const w=require('../src/lib/server/workforce-calculation.ts');for(const month of ['2023-02','2024-02','2024-04','2024-01']){const {start,end}=w.monthRange(month),e={id:'e',branchId:'b',name:'X',employmentType:'ON_ROLL',joinedOn:start,leftOn:null},rates=[{effectiveFrom:start,rate:'999999999.99',employmentType:'ON_ROLL'}],marks=w.days(start,end).map(date=>({date,status:'PRESENT'}));assert.equal(w.calculatePayroll(e,rates,marks,[],month,'2025-01-01').amount,'999999999.99');const missing=w.calculatePayroll(e,rates,[],[],month,'2025-01-01');assert.equal(missing.missingDates.length,w.monthRange(month).calendarDays);assert.equal(missing.amount,'0.00');}
});
test('applicable historical rate segments are accumulated rationally and snapshotted',()=>{
 const w=require('../src/lib/server/workforce-calculation.ts'),e={id:'e',branchId:'b',name:'X',employmentType:'OFF_ROLL',joinedOn:'2024-01-01',leftOn:'2024-01-02'};
 const r=w.calculatePayroll(e,[{effectiveFrom:'2024-01-01',rate:'10.01',employmentType:'OFF_ROLL'},{effectiveFrom:'2024-01-02',rate:'20.02',employmentType:'OFF_ROLL'}],[{date:'2024-01-01',status:'HALF_DAY'},{date:'2024-01-02',status:'HALF_DAY'}],[],'2024-01','2025-01-01');assert.equal(r.amount,'15.02');assert.equal(r.rateSegments.length,2);assert.deepEqual(r.rateSegments.map(s=>s.payableHalfUnits),[1,1]);
});
test('workforce tables enforce unique employee/day and final employee/month keys',()=>{
 const {getTableConfig}=require('drizzle-orm/pg-core');const w=require('../src/db/schema/workforce.ts');
 assert.equal(getTableConfig(w.payrollSnapshots).name,'payroll_snapshots');assert.ok(getTableConfig(w.payrollSnapshots).indexes.some(i=>i.config.unique));assert.ok(getTableConfig(w.payrollRuns).indexes.some(i=>i.config.unique));assert.ok(getTableConfig(w.workforceAttendance).indexes.some(i=>i.config.unique));
});
