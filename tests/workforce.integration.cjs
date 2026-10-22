// Parent runs against a separately started app bound to the SAME guarded QA DB.
// No dotenv: never inherit this repository's production/local application secrets.
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const assert=require('node:assert/strict'),{Pool}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const env=process.env;
assert.equal(env.PGHOST,'127.0.0.1');assert.equal(env.PGPORT,'5436');assert.match(env.PGDATABASE??'',/^restaurant_erp_workforce_qa(?:_[a-zA-Z0-9_]+)?$/);
const origin=new URL(env.BASE_URL);assert.ok(['127.0.0.1','localhost'].includes(origin.hostname));assert.equal(origin.protocol,'http:');assert.equal(origin.pathname,'/');assert.equal(origin.username,'');assert.equal(origin.password,'');
const pool=new Pool({host:env.PGHOST,port:Number(env.PGPORT),database:env.PGDATABASE,user:env.PGUSER,password:env.PGPASSWORD,ssl:false});
const run=randomUUID(),branchIds=[],userIds=[],cookies={};let checks=0;
function pass(name){checks++;console.log('PASS '+name);}
async function req(path,actor='owner',method='GET',body,status=200){const r=await fetch(new URL(path,origin),{method,headers:{origin:origin.origin,cookie:cookies[actor]??'','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(data));return data;}
(async()=>{try{
 const identity=await pool.query('select current_database() db');assert.equal(identity.rows[0].db,env.PGDATABASE);
 for(const label of ['a','b']){const id=randomUUID();branchIds.push(id);await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$3,0,0)',[id,'WF '+label+' '+run,'WF-'+label+'-'+run]);}
 async function user(label,branch,grants,role='CASHIER') {const id=randomUUID(),token=randomBytes(32).toString('hex');userIds.push(id);await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)',[id,label+' '+run,'+91'+String(6000000000+Math.floor(Math.random()*3999999999)),role,branch,grants]);await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);cookies[label]='restaurant_session='+token;return id;}
 const ownerId=await user('owner',null,[],'SUPER_ADMIN');await user('manager',branchIds[0],['PAYROLL','ATTENDANCE','LEAVE_APPROVAL'],'BRANCH_MANAGER');const selfId=await user('self',branchIds[0],['LEAVE_SELF']);await user('attendance',branchIds[0],['ATTENDANCE']);const otherUser=await user('other',branchIds[1],['PAYROLL','ATTENDANCE','LEAVE_APPROVAL'],'BRANCH_MANAGER');
 await user('reviewer',branchIds[0],['LEAVE_APPROVAL']);
 // HTTP identity readback binds the app to the exact disposable fixture DB.
 assert.equal((await req('/api/auth/me')).user.id,ownerId);
 const ep='/api/workforce/employees',ap='/api/workforce/attendance',lp='/api/workforce/leaves',pp='/api/workforce/payroll';
 // A is the beneficiary; B submits on behalf. Nobody may erase A before review.
 const managerId=(await req('/api/auth/me','manager')).user.id;
 const beneficiary=(await req(ep,'manager','POST',{branchId:branchIds[0],name:'Beneficiary '+run,userId:managerId,employmentType:'ON_ROLL',rate:'31.00',joinedOn:'2025-01-01'},201)).employee;
 // Before any leave exists, link corrections and no-op edits remain supported.
 await req(ep+'/'+beneficiary.id,'owner','PATCH',{userId:null});
 await req(ep+'/'+beneficiary.id,'owner','PATCH',{userId:managerId});
 const behalf=(await req(lp,'owner','POST',{employeeId:beneficiary.id,startDate:'2025-01-01',endDate:'2025-01-01',reason:'On behalf'},201)).leave;
 await req(ep+'/'+beneficiary.id,'manager','PATCH',{userId:null},409);
 await req(ep+'/'+beneficiary.id,'owner','PATCH',{userId:selfId},409);
 assert.equal((await pool.query('select user_id from employees where id=$1',[beneficiary.id])).rows[0].user_id,managerId);
 await req(lp+'/'+behalf.id+'/review','manager','POST',{decision:'APPROVED',payType:'PAID'},403);
 assert.equal((await req(lp,'manager')).leaves.find(l=>l.id===behalf.id).canReview,false);
 pass('on-behalf beneficiary cannot clear/relink login to evade self-review, including third-party relinker');
 await req(ep+'/'+beneficiary.id,'manager','PATCH',{userId:managerId,name:'Beneficiary retained '+run});
 await req(lp+'/'+behalf.id+'/review','owner','POST',{decision:'REJECTED'},403);
 await req(lp+'/'+behalf.id+'/review','reviewer','POST',{decision:'REJECTED'});
 await req(ep+'/'+beneficiary.id,'owner','PATCH',{userId:null},409);
 const fresh=(await req(lp,'manager','POST',{employeeId:beneficiary.id,startDate:'2025-01-02',endDate:'2025-01-02',reason:'Self after rejected history'},201)).leave;
 await req(lp+'/'+fresh.id+'/review','manager','POST',{decision:'REJECTED'},403);
 await req(lp+'/'+fresh.id+'/review','owner','POST',{decision:'APPROVED',payType:'PAID'});
 await req(ep+'/'+beneficiary.id,'owner','PATCH',{userId:selfId},409);
 assert.equal((await pool.query('select user_id from employees where id=$1',[beneficiary.id])).rows[0].user_id,managerId);
 pass('rejected and approved historical leave retain beneficiary; unchanged link and name edits allowed');
 const employee=(await req(ep,'manager','POST',{branchId:branchIds[0],name:'Leap '+run,userId:selfId,employmentType:'ON_ROLL',rate:'100.01',joinedOn:'2024-02-28'},201)).employee;
 await req(ep+'?branchId='+branchIds[1],'manager','GET',undefined,403);await req(ep,'manager','POST',{branchId:branchIds[0],name:'Bad',userId:otherUser,employmentType:'OFF_ROLL',rate:'2.00',joinedOn:'2024-02-28'},400);pass('two-branch access and related-user branch validation');
 await req(ep,'manager','POST',{branchId:branchIds[0],name:'Duplicate',userId:selfId,employmentType:'ON_ROLL',rate:'2.00',joinedOn:'2024-02-28'},409);pass('unique login-employee link');
 await req(ep+'/'+employee.id,'manager','PATCH',{leftOn:'2024-02-29'});
 await req(ap,'manager','POST',{employeeId:employee.id,date:'2024-02-28',status:'HALF_DAY'});await req(ap,'manager','POST',{employeeId:employee.id,date:'2024-02-27',status:'PRESENT'},400);await req(ap,'manager','POST',{employeeId:employee.id,date:'2099-01-01',status:'PRESENT'},400);pass('strict employment/future attendance boundaries');
 const preview=await req(pp+'?branchId='+branchIds[0]+'&month=2024-02','manager');assert.deepEqual(preview.rows[0].missingDates,['2024-02-29']);await req(pp+'/finalize','manager','POST',{branchId:branchIds[0],month:'2024-02'},409);pass('missing dates block finalization');
 const leave=(await req(lp,'self','POST',{employeeId:employee.id,startDate:'2024-02-29',endDate:'2024-02-29',reason:'Personal'},201)).leave;
 await req(lp,'self','POST',{employeeId:employee.id,startDate:'2024-02-29',endDate:'2024-02-29',reason:'Duplicate'},409);assert.deepEqual((await req(pp+'?branchId='+branchIds[0]+'&month=2024-02','manager')).rows[0].missingDates,['2024-02-29']);pass('pending leave overlaps rejected and pending does not pay');
 await req(lp+'/'+leave.id+'/review','manager','POST',{decision:'APPROVED',payType:'PAID',reviewNote:'Approved'});await req(ap,'manager','POST',{employeeId:employee.id,date:'2024-02-29',status:'PRESENT'},409);await req(lp+'/'+leave.id+'/review','manager','POST',{decision:'REJECTED',reviewNote:'Again'},409);pass('approval derives pay without attendance and stale review denied');
 const safe=await req(ap+'?branchId='+branchIds[0]+'&date=2024-02-28','attendance');assert.equal(JSON.stringify(safe).includes('100.01'),false);assert.equal('rate' in safe.employees[0],false);await req(ep,'self','GET',undefined,403);assert.deepEqual((await req(lp,'self')).employees.map(x=>x.id),[employee.id]);pass('attendance/self DTOs contain no salary or other employees');
 await req(ep+'/'+employee.id,'owner','PATCH',{userId:null},409);
 assert.equal((await pool.query('select user_id from employees where id=$1',[employee.id])).rows[0].user_id,selfId);
 assert.equal((await req(lp,'self')).leaves.find(l=>l.id===leave.id).status,'APPROVED');
 pass('approved self-service history remains linked and visible even when no pending leave remains');
 const payload={branchId:branchIds[0],month:'2024-02'};const [f1,f2]=await Promise.all([req(pp+'/finalize','manager','POST',payload),req(pp+'/finalize','manager','POST',payload)]);assert.deepEqual(f1,f2);assert.equal(f1.rows[0].amount,'5.17');assert.equal(f1.total,'5.17');assert.equal(f1.finalized,true);const count=await pool.query('select count(*)::int n from payroll_snapshots where branch_id=$1 and month=$2',[branchIds[0],'2024-02']);assert.equal(count.rows[0].n,1);pass('leap month half-day paise exact and concurrent finalize idempotent persisted once');
 await req(ap,'manager','POST',{employeeId:employee.id,date:'2024-02-28',status:'PRESENT'},409);await req(ep+'/'+employee.id,'manager','PATCH',{rate:'900.00',rateEffectiveFrom:'2024-02-01'},409);await req(ep+'/'+employee.id,'manager','PATCH',{leftOn:null},409);await req(ep,'manager','POST',{branchId:branchIds[0],name:'Backdated',employmentType:'OFF_ROLL',rate:'2.00',joinedOn:'2024-02-01'},409);assert.deepEqual(await req(pp+'?branchId='+branchIds[0]+'&month=2024-02','manager'),f1);pass('finalized attendance/rate/employment/backdated creation locked; replay stable');
 const off=(await req(ep,'other','POST',{branchId:branchIds[1],name:'Offroll',userId:otherUser,employmentType:'OFF_ROLL',rate:'10.01',joinedOn:'2024-03-30'},201)).employee;await req(ep+'/'+off.id,'other','PATCH',{leftOn:'2024-03-31'});
 await req(ap,'other','POST',{employeeId:off.id,date:'2024-03-30',status:'HALF_DAY'});
 const ownLeave=(await req(lp,'other','POST',{employeeId:off.id,startDate:'2024-03-31',endDate:'2024-03-31',reason:'Own leave'},201)).leave;
 const foreignEmployeeBefore=(await pool.query('select * from employees where id=$1',[off.id])).rows;
 const foreignAttendanceBefore=(await pool.query('select * from workforce_attendance where employee_id=$1',[off.id])).rows;
 const foreignLeaveBefore=(await pool.query('select * from workforce_leaves where id=$1',[ownLeave.id])).rows;
 await req(ep+'/'+off.id,'manager','PATCH',{name:'Cross-branch overwrite'},403);
 await req(ap,'manager','POST',{employeeId:off.id,date:'2024-03-30',status:'PRESENT'},403);
 await req(lp+'/'+ownLeave.id+'/review','manager','POST',{decision:'APPROVED',payType:'UNPAID'},403);
 await req(pp+'?branchId='+branchIds[1]+'&month=2024-03','manager','GET',undefined,403);
 await req(pp+'/finalize','manager','POST',{branchId:branchIds[1],month:'2024-03'},403);
 await req(ap+'?branchId='+branchIds[1]+'&date=2024-03-30','manager','GET',undefined,403);
 await req(lp+'?branchId='+branchIds[1],'manager','GET',undefined,403);
 await req(ep,'manager','POST',{branchId:branchIds[1],name:'Cross branch create',employmentType:'ON_ROLL',rate:'1.00',joinedOn:'2024-03-30'},403);
 assert.deepEqual((await pool.query('select * from employees where id=$1',[off.id])).rows,foreignEmployeeBefore);
 assert.deepEqual((await pool.query('select * from workforce_attendance where employee_id=$1',[off.id])).rows,foreignAttendanceBefore);
 assert.deepEqual((await pool.query('select * from workforce_leaves where id=$1',[ownLeave.id])).rows,foreignLeaveBefore);
 assert.equal((await pool.query('select count(*)::int n from payroll_runs where branch_id=$1',[branchIds[1]])).rows[0].n,0);
 assert.equal((await req(ep,'manager')).employees.some(e=>e.id===off.id),false);
 const ownAttendance=await req(ap+'?date=2024-03-30','manager');assert.equal(ownAttendance.employees.some(e=>e.id===off.id),false);assert.equal(ownAttendance.attendance.some(e=>e.employeeId===off.id),false);
 assert.equal((await req(lp,'manager')).leaves.some(l=>l.id===ownLeave.id),false);
 pass('existing foreign IDs denied for employee PATCH, attendance and review; payroll read/finalize and list isolation; persisted rows unchanged');
 await req(lp+'/'+ownLeave.id+'/review','other','POST',{decision:'APPROVED',payType:'UNPAID'},403);await req(lp+'/'+ownLeave.id+'/review','owner','POST',{decision:'APPROVED',payType:'PAID'},400);await req(lp+'/'+ownLeave.id+'/review','owner','POST',{decision:'APPROVED',payType:'UNPAID'});assert.equal((await req(pp+'?branchId='+branchIds[1]+'&month=2024-03','other')).rows[0].amount,'5.01');pass('self approval denied and offroll paid leave forbidden, half-up daily wage');
 await req(lp+'?branchId='+branchIds[1],'self','GET',undefined,403);await req(lp,'self','POST',{employeeId:off.id,startDate:'2024-03-31',endDate:'2024-03-31',reason:'Foreign'},403);await req(lp+'/missing/review','manager','POST',{decision:'REJECTED'},404);await req(pp+'/finalize','manager','POST',{branchId:branchIds[0],month:'2099-01'},409);pass('self-service foreign access, missing review and future month denied');
 // Rejected applications may be replaced; review must recheck attendance conflicts.
 const rejected=(await req(lp,'other','POST',{employeeId:off.id,startDate:'2024-03-30',endDate:'2024-03-30',reason:'Marked conflict'},409));
 const reviewEmployee=(await req(ep,'other','POST',{branchId:branchIds[1],name:'Review QA',employmentType:'ON_ROLL',rate:'31.00',joinedOn:'2024-04-01'},201)).employee;await req(ep+'/'+reviewEmployee.id,'other','PATCH',{leftOn:'2024-04-01'});
 const rejectedLeave=(await req(lp,'other','POST',{employeeId:reviewEmployee.id,startDate:'2024-04-01',endDate:'2024-04-01',reason:'First request'},201)).leave;
 const lateUser=await user('lateLink',branchIds[1],['LEAVE_SELF']);
 await req(ep+'/'+reviewEmployee.id,'owner','PATCH',{userId:lateUser},409);
 assert.equal((await pool.query('select user_id from employees where id=$1',[reviewEmployee.id])).rows[0].user_id,null);
 pass('unlinked employee with pending leave cannot gain a new beneficiary login');
 assert.equal((await req(lp+'/'+rejectedLeave.id+'/review','owner','POST',{decision:'REJECTED',reviewNote:'Declined'})).leave.status,'REJECTED');
 const replacement=(await req(lp,'other','POST',{employeeId:reviewEmployee.id,startDate:'2024-04-01',endDate:'2024-04-01',reason:'Replacement'},201)).leave;
 await req(ap,'other','POST',{employeeId:reviewEmployee.id,date:'2024-04-01',status:'PRESENT'});await req(lp+'/'+replacement.id+'/review','owner','POST',{decision:'APPROVED',payType:'PAID'},409);await req(pp+'/finalize','other','POST',{branchId:branchIds[1],month:'2024-04'});await req(lp+'/'+replacement.id+'/review','owner','POST',{decision:'REJECTED'},409);pass('valid rejection allows replacement; attendance conflict and finalized pending review denied');
 const current=new Date(),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(current);const y=Number(parts.find(x=>x.type==='year').value),m=Number(parts.find(x=>x.type==='month').value);const future=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
 const futureEmployee=(await req(ep,'manager','POST',{branchId:branchIds[0],name:'Future rate QA',employmentType:'ON_ROLL',rate:'10.00',joinedOn:future},201)).employee;
 const effective=new Date(Date.UTC(y,m+1,1)).toISOString().slice(0,10);
 const changed=(await req(ep+'/'+futureEmployee.id,'manager','PATCH',{rate:'20.00',rateEffectiveFrom:effective})).employee;assert.equal(changed.compensationHistory.length,2);assert.equal(changed.compensationHistory[0].rate,'10.00');assert.equal(changed.compensationHistory[1].rate,'20.00');await req(ep+'/'+futureEmployee.id,'manager','PATCH',{rate:'30.00',rateEffectiveFrom:effective},409);pass('future-boundary append-only rate preserves original compensation');
 const csrf=await fetch(new URL(ap,origin),{method:'POST',headers:{cookie:cookies.manager,'content-type':'application/json',origin:'http://evil.test'},body:'{}'});assert.equal(csrf.status,403);pass('mutation CSRF rejected');
 // Fail compensation INSERT after employee INSERT; both writes must roll back.
 const compensationTrigger='wf_comp_fail_'+run.replaceAll('-','');
 const rollbackName='Compensation rollback '+run;
 const createPayload={branchId:branchIds[0],name:rollbackName,employmentType:'ON_ROLL',rate:'31.00',joinedOn:'2025-02-01'};
 const employeesBefore=(await pool.query('select * from employees where branch_id=$1 order by id',[branchIds[0]])).rows;
 const compensationBefore=(await pool.query('select * from employee_compensation where branch_id=$1 order by id',[branchIds[0]])).rows;
 await pool.query(`CREATE FUNCTION ${compensationTrigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA compensation rollback'; END $$`);
 try {
  await pool.query(`CREATE TRIGGER ${compensationTrigger} BEFORE INSERT ON employee_compensation FOR EACH ROW WHEN (NEW.branch_id = '${branchIds[0]}') EXECUTE FUNCTION ${compensationTrigger}()`);
  await req(ep,'manager','POST',createPayload,503);
  assert.deepEqual((await pool.query('select * from employees where branch_id=$1 order by id',[branchIds[0]])).rows,employeesBefore);
  assert.deepEqual((await pool.query('select * from employee_compensation where branch_id=$1 order by id',[branchIds[0]])).rows,compensationBefore);
 }finally{
  await pool.query(`DROP TRIGGER IF EXISTS ${compensationTrigger} ON employee_compensation`);
  await pool.query(`DROP FUNCTION ${compensationTrigger}()`);
 }
 const recovered=(await req(ep,'manager','POST',createPayload,201)).employee;
 assert.equal((await pool.query('select count(*)::int n from employees where branch_id=$1 and name=$2',[branchIds[0],rollbackName])).rows[0].n,1);
 assert.equal((await pool.query('select count(*)::int n from employee_compensation where employee_id=$1',[recovered.id])).rows[0].n,1);
 pass('forced compensation insert failure rolls back employee plus rate; retry persists exactly one of each');
 // Force a snapshot insert failure after run insertion; all writes must roll back.
 const trigger='wf_fail_'+run.replaceAll('-','');
 await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA rollback'; END $$`);
 try {
  await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON payroll_snapshots FOR EACH ROW WHEN (NEW.branch_id = '${branchIds[1]}') EXECUTE FUNCTION ${trigger}()`);
  await req(pp+'/finalize','other','POST',{branchId:branchIds[1],month:'2024-03'},503);
  for(const table of ['payroll_runs','payroll_snapshots'])assert.equal((await pool.query(`select count(*)::int n from ${table} where branch_id=$1 and month=$2`,[branchIds[1],'2024-03'])).rows[0].n,0);
 }finally{
  await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON payroll_snapshots`);
  await pool.query(`DROP FUNCTION ${trigger}()`);
 }
 pass('forced DB failure rolls back payroll run and snapshots');
 console.log('RESULT '+checks+' real HTTP/Postgres workforce checks passed');
 }finally{
 for(const table of ['payroll_snapshots','payroll_runs','workforce_leaves','workforce_attendance','employee_compensation','employees'])await pool.query(`delete from ${table} where branch_id=any($1::text[])`,[branchIds]);
 await pool.query('delete from sessions where user_id=any($1::text[])',[userIds]);await pool.query('delete from users where id=any($1::text[])',[userIds]);await pool.query('delete from branches where id=any($1::text[])',[branchIds]);await pool.end();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
