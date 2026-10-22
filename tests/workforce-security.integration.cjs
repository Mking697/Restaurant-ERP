// Supplemental real HTTP/PG acceptance: only a disposable loopback workforce QA DB.
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGPORT,'5436');
assert.match(process.env.PGDATABASE||'',/^restaurant_erp_workforce_qa_\d{8}$/);
const target=new URL(process.env.BASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(target.hostname)&&target.protocol==='http:'&&target.pathname==='/'&&!target.username&&!target.password&&!target.search&&!target.hash);
const pool=new Pool({host:process.env.PGHOST,port:5436,user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,ssl:false});
const ids=[],branches=[],cookies={},run=randomUUID();let checks=0;
const pass=name=>{checks++;console.log('PASS '+name);};
async function request(path,actor='acc',method='GET',body){
 const r=await fetch(new URL(path,target),{method,headers:{cookie:cookies[actor]||'',origin:target.origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json()};
}
async function ok(path,actor,method,body,status=200){const r=await request(path,actor,method,body);assert.equal(r.status,status,path+': '+JSON.stringify(r.data));return r.data;}
async function identity(label,branch,grants,role='ACCOUNTANT'){
 const id=randomUUID(),token=randomBytes(32).toString('hex');ids.push(id);
 await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)',[id,'Security QA '+label+' '+run,'+918'+String(BigInt('0x'+randomBytes(6).toString('hex'))%1000000000n).padStart(9,'0'),role,branch,grants]);
 await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);cookies[label]='restaurant_session='+token;return id;
}
const ep='/api/workforce/employees',ap='/api/workforce/attendance',lp='/api/workforce/leaves',pp='/api/workforce/payroll';
async function employee(name,date,last=date,userId){const e=(await ok(ep,'acc','POST',{branchId:branches[0],name,employmentType:'OFF_ROLL',rate:'20.00',joinedOn:date,...(userId?{userId}:{})},201)).employee;await ok(ep+'/'+e.id,'acc','PATCH',{leftOn:last});return e;}
async function main(){try{
 assert.equal((await pool.query('select current_database() db')).rows[0].db,process.env.PGDATABASE);
 for(let i=0;i<2;i++){const id=randomUUID();branches.push(id);await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$3,0,0)',[id,'Security QA '+run,'SEC-'+i+'-'+run]);}
 const owner=await identity('owner',null,[],'SUPER_ADMIN');const acc=await identity('acc',branches[0],['PAYROLL','ATTENDANCE','LEAVE_APPROVAL']);
 const self=await identity('self',branches[0],['LEAVE_SELF'],'CASHIER');await identity('hq',null,['PAYROLL','ATTENDANCE','LEAVE_APPROVAL'],'CENTRAL_STORE_MGR');
 const revoke=await identity('revoke',branches[0],['ATTENDANCE']);
 assert.equal((await ok('/api/auth/me','owner')).user.id,owner);
 await ok(ep+'?branchId='+branches[0],'acc');await ok(ep+'?branchId='+branches[1],'acc','GET',undefined,403);await ok(ep+'?branchId='+branches[0],'hq','GET',undefined,403);pass('ACCOUNTANT stays own-branch; CENTRAL_STORE_MGR grants do not create HQ-wide workforce access');
 const e=await employee('Linked security QA','2024-05-31','2024-05-31',self);
 await ok('/api/users/'+self,'owner','PATCH',{branchId:branches[1]},409);await ok('/api/users/'+self,'owner','PATCH',{role:'CENTRAL_STORE_MGR',branchId:null},409);
 assert.equal((await pool.query('select branch_id from users where id=$1',[self])).rows[0].branch_id,branches[0]);pass('linked login branch transfer and HQ promotion roll back without breaking employee scope');
 // The same global lock used by production mutation paths simulates a revocation
 // committed just before this queued write re-reads its live identity.
 const locker=await pool.connect();let pending;
 try{
  await locker.query('begin');await locker.query('select pg_advisory_xact_lock(726431,1)');
  pending=request(ap,'revoke','POST',{employeeId:e.id,date:'2024-05-31',status:'PRESENT'});
  void pending.catch(()=>{}); // Attach immediately; finally drains before fixture cleanup.
  let waiting=false;
  for(let i=0;i<50;i++){
   const row=await locker.query("select exists(select 1 from pg_locks where locktype='advisory' and classid=726431 and objid=1 and not granted) waiting");
   if(row.rows[0].waiting){waiting=true;break;}await new Promise(r=>setTimeout(r,20));
  }
  assert.ok(waiting,'HTTP workforce mutation must actually wait for the lock');
  await locker.query("update users set module_access='{}',token_version=token_version+1 where id=$1",[revoke]);await locker.query('commit');
  assert.equal((await pending).status,401);assert.equal((await pool.query('select count(*)::int n from workforce_attendance where employee_id=$1',[e.id])).rows[0].n,0);
 }finally{
  try{await locker.query('rollback');}finally{locker.release();if(pending)await Promise.allSettled([pending]);}
 }
 pass('queued workforce write rechecks revoked session after lock and persists no attendance');
 const leaveBody={employeeId:e.id,startDate:'2024-05-31',endDate:'2024-05-31',reason:'Concurrent overlap QA'};
 const overlaps=await Promise.all([request(lp,'self','POST',leaveBody),request(lp,'self','POST',leaveBody)]);
 assert.deepEqual(overlaps.map(x=>x.status).sort(),[201,409]);const leave=overlaps.find(x=>x.status===201).data.leave;
 const review=await Promise.all([request(lp+'/'+leave.id+'/review','owner','POST',{decision:'APPROVED',payType:'UNPAID'}),request(lp+'/'+leave.id+'/review','acc','POST',{decision:'REJECTED'})]);
 assert.deepEqual(review.map(x=>x.status).sort(),[200,409]);
 const state=(await pool.query('select status from workforce_leaves where id=$1',[leave.id])).rows[0].status;
 assert.equal(state,review.find(x=>x.status===200).data.leave.status);pass('concurrent overlapping leave and opposite reviews serialize to exactly one accepted state');
 const e2=await employee('Attendance approval race QA','2024-06-30');
 const l2=(await ok(lp,'acc','POST',{employeeId:e2.id,startDate:'2024-06-30',endDate:'2024-06-30',reason:'Race QA'},201)).leave;
 const competing=await Promise.all([request(ap,'acc','POST',{employeeId:e2.id,date:'2024-06-30',status:'PRESENT'}),request(lp+'/'+l2.id+'/review','owner','POST',{decision:'APPROVED',payType:'UNPAID'})]);
 assert.deepEqual(competing.map(x=>x.status).sort(),[200,409]);
 const marks=(await pool.query('select count(*)::int n from workforce_attendance where employee_id=$1',[e2.id])).rows[0].n;
 const approved=(await pool.query("select count(*)::int n from workforce_leaves where employee_id=$1 and status='APPROVED'",[e2.id])).rows[0].n;
 assert.equal(marks+approved,1);pass('attendance versus leave approval cannot double-count the same date');
 const e3=await employee('Finalize attendance race QA','2024-07-31');await ok(ap,'acc','POST',{employeeId:e3.id,date:'2024-07-31',status:'PRESENT'});
 const raced=await Promise.all([request(pp+'/finalize','acc','POST',{branchId:branches[0],month:'2024-07'}),request(ap,'acc','POST',{employeeId:e3.id,date:'2024-07-31',status:'HALF_DAY'})]);
 assert.equal(raced[0].status,200);assert.ok([200,409].includes(raced[1].status));
 const saved=(await pool.query('select status from workforce_attendance where employee_id=$1',[e3.id])).rows[0].status;
 assert.equal(raced[0].data.total,saved==='PRESENT'?'20.00':'10.00');await ok(ap,'acc','POST',{employeeId:e3.id,date:'2024-07-31',status:'ABSENT'},409);pass('finalize versus attendance snapshots exactly the serialized state and locks later edits');
 const createBody={branchId:branches[1],name:'Finalization onboarding race QA',employmentType:'OFF_ROLL',rate:'20.00',joinedOn:'2024-08-31'};
 const creation=await Promise.all([request(ep,'owner','POST',createBody),request(pp+'/finalize','owner','POST',{branchId:branches[1],month:'2024-08'})]);
 assert.ok((creation[0].status===201&&creation[1].status===409)||(creation[0].status===409&&creation[1].status===200),JSON.stringify(creation));
 const runCount=(await pool.query('select count(*)::int n from payroll_runs where branch_id=$1',[branches[1]])).rows[0].n;
 const employeeCount=(await pool.query('select count(*)::int n from employees where branch_id=$1',[branches[1]])).rows[0].n;
 assert.equal(runCount+employeeCount,1);pass('onboarding versus empty-month closure cannot create an incomplete finalized run');
 console.log('RESULT '+checks+' real workforce security/concurrency checks passed');
 }finally{
 for(const table of ['payroll_snapshots','payroll_runs','workforce_leaves','workforce_attendance','employee_compensation','employees'])await pool.query('delete from '+table+' where branch_id=any($1::text[])',[branches]);
 await pool.query('delete from sessions where user_id=any($1::text[])',[ids]);await pool.query('delete from users where id=any($1::text[])',[ids]);await pool.query('delete from branches where id=any($1::text[])',[branches]);await pool.end();
 }}
main().catch(e=>{console.error(e);process.exitCode=1;});
