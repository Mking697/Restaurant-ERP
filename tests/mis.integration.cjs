// Explicit disposable DB/app only; no dotenv or default target fallback.
const assert = require('node:assert/strict');
const { randomUUID: id, randomBytes, createHash } = require('node:crypto');
const { Pool } = require('pg');
function guard() {
  assert.equal(process.env.MIS_INTEGRATION, '1');
  assert.equal(process.env.PGHOST, '127.0.0.1'); assert.equal(process.env.PGPORT, '5436');
  assert.match(process.env.PGDATABASE || '', /^restaurant_erp_mis_qa_\d{8}$/);
  assert.equal(process.env.APP_ORIGIN, 'http://localhost:3043');
  assert.ok(process.env.PGUSER); assert.ok(process.env.PGPASSWORD);
}
async function main() {
  guard();
  const pool = new Pool({host:'127.0.0.1', port:5436, database:process.env.PGDATABASE, user:process.env.PGUSER, password:process.env.PGPASSWORD, ssl:false});
  const origin=process.env.APP_ORIGIN, a=id(), b=id(), empty=id(), material=id(), uids=[];
  let checks=0;
  const pass = name => { checks++; console.log('PASS '+name); };
  async function req(path,cookie,method='GET',data,expected=200,source=origin) {
    const res=await fetch(origin+path,{method,headers:{...(cookie?{cookie}:{}),...(source?{origin:source}:{}),'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(60000)});
    const text=await res.text(); let result; try {result=JSON.parse(text);} catch {throw new Error(path+' '+res.status+' '+text.slice(0,500));}
    assert.equal(res.status,expected,path+': '+JSON.stringify(result)); return result;
  }
  async function identity(role,branchId,grants) {
    const uid=id(),token=randomBytes(32).toString('hex'); uids.push(uid);
    await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)',[uid,'MIS QA '+role,'+91'+String(BigInt('0x'+randomBytes(6).toString('hex'))%10000000000n).padStart(10,'0'),role,branchId,grants]);
    await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),uid]);
    const cookie='restaurant_session='+token;
    assert.equal((await req('/api/auth/me',cookie)).user.id,uid,'App bound to exact fixture DB');
    return {uid,cookie};
  }
  const period={periodStart:'2024-02-01T00:00:00.000Z',periodEnd:'2024-02-29T00:00:00.000Z'};
  try {
    assert.equal((await pool.query('select current_database() db')).rows[0].db,process.env.PGDATABASE);
    for(const [n,branch] of [a,b,empty].entries()) await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0)',[branch,'MIS branch '+n]);
    const owner=await identity('SUPER_ADMIN',null,[]), manager=await identity('BRANCH_MANAGER',a,['MIS_PERFORMANCE','INVENTORY']), csm=await identity('CENTRAL_STORE_MGR',null,[]), denied=await identity('CASHIER',a,[]);
    pass('random fixture sessions prove app uses this disposable database');
    await req('/api/mis/scores','', 'GET',undefined,401);
    await req('/api/inventory/variance','', 'GET',undefined,401);
    await req('/api/mis/compute',owner.cookie,'POST',period,403,null);
    await req('/api/mis/compute',owner.cookie,'POST',period,403,'http://evil.test');
    pass('anonymous reads and missing/foreign-origin writes rejected');
    await req('/api/mis/compute',manager.cookie,'POST',period,403);
    await req('/api/mis/scores',denied.cookie,'GET',undefined,403);
    await req('/api/inventory/variance',denied.cookie,'GET',undefined,403);
    pass('compute role restrictions and module grants enforced');
    for(const patch of [{periodEnd:period.periodStart},{periodEnd:'2024-04-01'},{periodStart:'bad'},{extra:true}]) await req('/api/mis/compute',owner.cookie,'POST',{...period,...patch},400);
    pass('invalid range and unknown fields rejected');
    assert.deepEqual((await req('/api/mis/scores',owner.cookie)).scores,[]);
    const skipped=await req('/api/mis/compute',owner.cookie,'POST',{...period,branchId:empty});
    assert.equal(skipped.results[0].computed,false); assert.ok(skipped.results[0].reason);
    pass('empty period has no fabricated scores and explicit skip reason');
    async function task(branch,type,status,completedAt) {
      await pool.query('insert into task_instances(id,branch_id,type,title,assigned_to_id,due_at,status,completed_at) values($1,$2,$3,$1,$4,$5,$6,$7)',[id(),branch,type,manager.uid,'2024-02-10T10:00:00Z',status,completedAt]);
    }
    await task(a,'RECURRING','DONE','2024-02-10T10:00:00Z');
    await task(a,'RECURRING','DONE','2024-02-10T10:00:01Z');
    await task(a,'RECURRING','OVERDUE',null);
    await task(a,'ONE_TIME','DONE','2024-02-10T09:00:00Z');
    await task(b,'RECURRING','DONE','2024-02-10T10:00:00Z');
    await task(b,'ONE_TIME','OVERDUE',null);
    await pool.query('insert into raw_materials(id,name,unit) values($1,$1,\'kg\')',[material]);
    for (const [qty,flag] of [['5',false],['6',false],['0',true]]) await pool.query('insert into night_variance_entries(id,branch_id,raw_material_id,shift_date,theoretical_qty,physical_qty,variance_qty,variance_value_inr,chef_on_duty_id,flagged_pilferage) values($1,$2,$3,\'2024-02-10\',100,95,$4,-10.25,$5,$6)',[id(),a,material,qty,manager.uid,flag]);
    const shift=id(); await pool.query('insert into branch_shifts(id,branch_id,label,start_time,end_time,sort_order) values($1,$2,\'QA\',\'00:00\',\'00:00\',0)',[shift,a]);
    for(const [i,variance] of ['0.00','-2.00'].entries()) {
      const run=id(),next=id(),drop=id();
      for(const [rid,status,end] of [[run,'ENDED','2024-02-10T11:00:00Z'],[next,'OPEN',null]]) await pool.query('insert into shift_runs(id,branch_id,shift_definition_id,label,status,started_by,started_at,ended_at) values($1,$2,$3,\'QA\',$4,$5,\'2024-02-10T09:00:00Z\',$6)',[rid,a,shift,status,manager.uid,end]);
      await pool.query('insert into cash_drops(id,branch_id,cashier_id,shift_date,expected_cash_inr,counted_cash_inr,shortage_excess_inr,shift_run_id) values($1,$2,$3,$4,100,$5,$6,$7)',[drop,a,manager.uid,`2024-02-${10+i}T09:00:00Z`,100+Number(variance),variance,run]);
      await pool.query('insert into shift_handovers(id,branch_id,from_run_id,to_run_id,closing_cash_drop_id,cash_amount,card_amount,upi_amount) values($1,$2,$3,$4,$5,100,0,0)',[id(),a,run,next,drop]);
    }
    await req('/api/mis/compute',owner.cookie,'POST',period);
    const listed=await req('/api/mis/scores?'+new URLSearchParams(period),owner.cookie);
    const row=listed.scores.find(r=>r.branchId===a), partial=listed.scores.find(r=>r.branchId===b);
    assert.equal(row.taskScore,'33.33'); assert.equal(row.delegationScore,'100.00'); assert.equal(row.varianceScore,'33.33'); assert.equal(row.cashierScore,'50.00'); assert.equal(row.totalScore,'55.00');
    assert.equal(row.onTimeCount,1); assert.equal(row.delayCount,1); assert.equal(row.notDoneCount,1);
    pass('real task, variance and closed-shift figures produce exact four-component score');
    assert.equal(partial.totalScore,'57.14'); assert.equal(partial.varianceScore,null); assert.equal(partial.cashierScore,null);
    assert.deepEqual(partial.componentsUsed,['taskScore','delegationScore']); assert.ok(partial.missingReasons.varianceScore);
    assert.equal(partial.rank,1); assert.equal(row.rank,2);
    pass('partial weights renormalize 40/70 and 30/70; missing components null with reasons');
    await Promise.all([req('/api/mis/compute',owner.cookie,'POST',period),req('/api/mis/compute',csm.cookie,'POST',period)]);
    assert.equal(Number((await pool.query('select count(*) from mis_scores where branch_id=$1',[a])).rows[0].count),1);
    assert.equal((await req('/api/mis/scores?branchId='+a,owner.cookie)).scores[0].id,row.id);
    pass('concurrent recompute including CENTRAL_STORE_MGR updates same row without duplicates');
    const scoped=await req('/api/mis/scores',manager.cookie);
    assert.equal(scoped.scores.length,1); assert.equal(scoped.scores[0].branchId,a); assert.equal(scoped.scores[0].rank,1);
    await req('/api/mis/scores?branchId='+b,manager.cookie,'GET',undefined,403);
    await req('/api/inventory/variance?branchId='+b,manager.cookie,'GET',undefined,403);
    pass('branch scope and view-relative rank enforced');
    const report=await req('/api/inventory/variance?from=2024-02-01&to=2024-02-29',manager.cookie);
    assert.equal(report.entries.length,3); assert.equal(report.entries[0].rawMaterialName,material); assert.equal(report.entries[0].chefOnDutyName,'MIS QA BRANCH_MANAGER');
    assert.equal(report.summary.totalVarianceValueInr,'-30.75'); assert.equal(report.summary.pilferageFlagCount,1);
    pass('variance report joins chef/material and sums exact real rows');
    assert.equal((await req('/api/inventory/variance?from=2025-01-01',manager.cookie)).entries.length,0);
    pass('variance date filters return real empty results');
    await pool.query("insert into wastage_logs(id,branch_id,raw_material_id,qty,reason,photo_url,logged_by_id,logged_at) values($1,$2,$3,2.5,'burnt','proof.jpg',$4,'2024-02-10')",[id(),a,material,manager.uid]);
    const withWaste=await req('/api/inventory/variance?from=2024-02-01&to=2024-02-29',manager.cookie);
    assert.equal(withWaste.wastage.length,1); assert.equal(withWaste.wastage[0].qty,'2.500'); assert.equal(withWaste.summary.wastageCount,1); assert.equal(withWaste.summary.totalWastageValueInr,null); assert.ok(withWaste.summary.wastageValueReason);
    pass('wastage quantities/proof/author are real; unavailable historical valuation stays null');
    await req('/api/inventory/variance?from=2024-02-30',owner.cookie,'GET',undefined,400);
    await req('/api/mis/scores?periodStart=2024-03-01&periodEnd=2024-02-01',owner.cookie,'GET',undefined,400);
    pass('invalid calendar dates and reversed read windows rejected');
    await task(b,'ONE_TIME','DONE','2024-02-10T09:00:00Z');
    const snapshot=await req('/api/mis/scores?branchId='+b,owner.cookie);
    assert.equal(snapshot.scores[0].totalScore,'57.14'); assert.deepEqual(snapshot.scores[0].componentsUsed,partial.componentsUsed);
    pass('GET reads stored snapshot and does not silently recompute from changed tasks');
    await pool.query('delete from task_instances where branch_id=$1',[b]);
    const cleared=await req('/api/mis/compute',owner.cookie,'POST',{...period,branchId:b});
    assert.equal(cleared.results[0].computed,false);
    assert.equal((await req('/api/mis/scores?branchId='+b,owner.cookie)).scores.length,0);
    pass('recompute after removal of all source observations clears stale score');
    const innerPeriod={branchId:a,periodStart:'2024-02-09T00:00:00.000Z',periodEnd:'2024-02-11T00:00:00.000Z'};
    await req('/api/mis/compute',owner.cookie,'POST',innerPeriod);
    const exactQuery=new URLSearchParams({...period,branchId:a,periodMatch:'exact'});
    const exactRows=await req('/api/mis/scores?'+exactQuery,owner.cookie);
    assert.equal(exactRows.scores.length,1);assert.equal(exactRows.scores[0].periodStart,period.periodStart);
    assert.equal((await req('/api/mis/scores?'+new URLSearchParams({...period,branchId:a}),owner.cookie)).scores.length,2);
    await req('/api/mis/scores?periodMatch=exact',owner.cookie,'GET',undefined,400);
    pass('exact-period leaderboard excludes historical snapshots; history retains explicit periods');
    const boundary={branchId:b,periodStart:'2024-02-10',periodEnd:'2024-02-11'};
    for(const dueAt of ['2024-02-09T18:29:59.999Z','2024-02-09T18:30:00.000Z','2024-02-10T18:29:59.999Z','2024-02-10T18:30:00.000Z']) await pool.query("insert into task_instances(id,branch_id,type,title,assigned_to_id,due_at,status,completed_at) values($1,$2,'RECURRING','Boundary',$3,$4,'DONE',$4)",[id(),b,manager.uid,dueAt]);
    for(const day of ['2024-02-10','2024-02-11']) await pool.query("insert into night_variance_entries(id,branch_id,raw_material_id,shift_date,theoretical_qty,physical_qty,variance_qty,variance_value_inr,chef_on_duty_id,flagged_pilferage) values($1,$2,$3,$4,100,100,0,0,$5,$6)",[id(),b,material,day,manager.uid,day==='2024-02-11']);
    await req('/api/mis/compute',owner.cookie,'POST',boundary);
    const boundaryScore=(await req('/api/mis/scores?branchId='+b,owner.cookie)).scores[0];
    assert.equal(boundaryScore.onTimeCount,2);assert.equal(boundaryScore.varianceScore,'100.00');
    assert.equal(boundaryScore.periodStart,'2024-02-09T18:30:00.000Z');assert.equal(boundaryScore.periodEnd,'2024-02-10T18:30:00.000Z');
    pass('IST day includes last millisecond but excludes next midnight for tasks and variance');
  } finally {
    for(const table of ['mis_scores','wastage_logs','night_variance_entries','shift_handovers','cash_drops','shift_runs','branch_shifts','task_instances']) await pool.query(`delete from ${table} where branch_id=any($1::text[])`,[[a,b,empty]]);
    await pool.query('delete from raw_materials where id=$1',[material]);
    await pool.query('delete from users where id=any($1::text[])',[uids]);
    await pool.query('delete from branches where id=any($1::text[])',[[a,b,empty]]);
    assert.equal(Number((await pool.query('select count(*) from mis_scores where branch_id=any($1::text[])',[[a,b,empty]])).rows[0].count),0);
    await pool.end();
  }
  console.log(`RESULT ${checks} real HTTP+Postgres MIS checks passed; fixtures cleaned`);
}
if(require.main===module) main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={guard};
