// Parent-run only. No dotenv fallback; every target is explicit.
// PGHOST=127.0.0.1 PGPORT=5436 PGDATABASE=restaurant_erp_branch_delete_qa_20261030
// PGUSER=<qa-user> PGPASSWORD=<qa-secret> BASE_URL=http://127.0.0.1:<dedicated-port>
// node tests/branch-deletion.integration.cjs
// Synthetic opaque sessions test downstream live authentication, NOT login UI.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
function guard(env) {
  assert.equal(env.PGHOST, '127.0.0.1', 'Only approved loopback QA database');
  assert.equal(env.PGPORT, '5436');
  assert.equal(env.PGDATABASE, 'restaurant_erp_branch_delete_qa_20261030');
  assert.ok(env.PGUSER && typeof env.PGPASSWORD === 'string', 'Explicit QA credentials required');
  assert.ok(env.BASE_URL, 'Explicit dedicated QA app required');
  const target = new URL(env.BASE_URL);
  assert.ok(['127.0.0.1','localhost'].includes(target.hostname) && target.protocol === 'http:' && target.port && target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash, 'Dedicated loopback HTTP origin only');
  return target;
}
module.exports = { guard };
async function main() {
  const target = guard(process.env);
  const { Pool } = require('pg');
  const pool = new Pool({ host:'127.0.0.1', port:5436, database:'restaurant_erp_branch_delete_qa_20261030', user:process.env.PGUSER, password:process.env.PGPASSWORD, ssl:false });
  const ids = Object.fromEntries(['branch','empty','missing','owner','admin','staff','material','stock','employee','compensation','shift','warehouse','hqWarehouse','ledger','hqLedger','lateWarehouse'].map(k => [k,randomUUID()]));
  const cookies = {}; let checks = 0, verifiedDb = false, failure;
  const pass = name => { checks++; console.log('PASS ' + name); };
  const request = async (suffix, actor = 'owner', method = 'GET') => {
    const response = await fetch(target.origin + '/api/branches/' + suffix, { method, redirect:'error', headers:{ origin:target.origin, ...(actor ? {cookie:cookies[actor]} : {}) }, signal:AbortSignal.timeout(20000) });
    const data = await response.json(); return { status:response.status, data };
  };
  const expect = async (suffix, actor, method, status) => { const r = await request(suffix,actor,method); assert.equal(r.status,status,JSON.stringify(r)); return r.data; };
  async function identity(label, role, branch) {
    const token = randomBytes(32).toString('hex');
    const phone = '+919' + String(BigInt('0x' + randomBytes(6).toString('hex')) % BigInt(1000000000)).padStart(9,'0');
    await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)',[ids[label],'Branch deletion QA ' + label + ' ' + ids.branch,phone,role,branch,[]]);
    await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),ids[label]]);
    cookies[label] = 'restaurant_session=' + token;
  }
  const fixtureQueries = [
    ['branches', 'id', [ids.branch,ids.empty]], ['users','id',[ids.owner,ids.admin,ids.staff]],
    ['inventory_stock','id',[ids.stock]], ['employees','id',[ids.employee]], ['employee_compensation','id',[ids.compensation]],
    ['branch_shifts','id',[ids.shift]], ['warehouses','id',[ids.warehouse,ids.hqWarehouse,ids.lateWarehouse]], ['ledger_accounts','id',[ids.ledger,ids.hqLedger]],
  ];
  const snapshot = async () => {
    const result = {};
    for (const [table,column,values] of fixtureQueries) result[table] = (await pool.query(`select * from "${table}" where "${column}" = any($1::text[]) order by "${column}"`,[values])).rows;
    return result;
  };
  async function cleanup() {
    // Exact random fixture IDs only, ordered child -> parent. No blanket cleanup.
    const cleanupTargets = [['employee_compensation',[ids.compensation]],['employees',[ids.employee]],['branch_shifts',[ids.shift]],['inventory_stock',[ids.stock]],['warehouses',[ids.warehouse,ids.hqWarehouse,ids.lateWarehouse]],['ledger_accounts',[ids.ledger,ids.hqLedger]]];
    for (const [table,values] of cleanupTargets) await pool.query(`delete from "${table}" where id=any($1::text[])`,[values]);
    await pool.query('delete from sessions where user_id=any($1::text[])',[[ids.owner,ids.admin,ids.staff]]);
    await pool.query('delete from users where id=any($1::text[])',[[ids.owner,ids.admin,ids.staff]]);
    await pool.query('delete from raw_materials where id=$1',[ids.material]);
    await pool.query('delete from branches where id=any($1::text[])',[[ids.branch,ids.empty]]);
    for (const [table,column,values] of [...fixtureQueries,['raw_materials','id',[ids.material]],['sessions','user_id',[ids.owner,ids.admin,ids.staff]]]) assert.equal((await pool.query(`select count(*)::int n from "${table}" where "${column}"=any($1::text[])`,[values])).rows[0].n,0,'cleanup readback '+table);
  }
  try {
    assert.equal((await pool.query('select current_database() db')).rows[0].db,'restaurant_erp_branch_delete_qa_20261030'); verifiedDb = true;
    const fks = (await pool.query("select confdeltype from pg_constraint where contype='f' and confrelid='public.branches'::regclass")).rows;
    assert.ok(fks.length); assert.ok(fks.every(row => ['a','r'].includes(row.confdeltype)), 'Branch FKs must remain no-action/restrict final race protection');
    await pool.query('insert into branches(id,code,name,lat,lng) values($1,$1,$1,0,0),($2,$2,$2,0,0)',[ids.branch,ids.empty]);
    await identity('owner','SUPER_ADMIN',null); await identity('admin','BRANCH_MANAGER',ids.branch); await identity('staff','CASHIER',ids.branch);
    // Prove this app reads this exact guarded database before any HTTP write.
    const marker = await expect(ids.branch,'owner','GET',200); assert.equal(marker.branch.id,ids.branch); assert.equal(marker.branch.code,ids.branch);
    pass('app identity bound to random fixture in exact guarded QA database');
    const checkPath = ids.branch + '/deletion-check';
    await expect(checkPath,null,'GET',401);
    for (const actor of ['admin','staff']) { const denied = await expect(checkPath,actor,'GET',403); assert.deepEqual(Object.keys(denied),['error']); await expect(ids.branch,actor,'DELETE',403); }
    pass('anonymous, no-grant staff and Branch Admin cannot read counts/delete');
    for (const query of ['?ready=true','?branchId=a&branchId=b']) await expect(checkPath+query,'owner','GET',400);
    await expect(ids.missing+'/deletion-check','owner','GET',404); await expect(ids.missing,'owner','DELETE',404);
    pass('unknown queries rejected; missing precheck and DELETE return 404');
    await pool.query('insert into raw_materials(id,name,unit) values($1,$1,$2)',[ids.material,'kg']);
    await pool.query('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,3.125)',[ids.stock,ids.branch,ids.material]);
    await pool.query("insert into employees(id,branch_id,name,employment_type,joined_on,created_by_id) values($1,$2,$1,'ON_ROLL','2026-10-01',$3)",[ids.employee,ids.branch,ids.owner]);
    await pool.query("insert into employee_compensation(id,branch_id,employee_id,effective_from,employment_type,rate,created_by_id) values($1,$2,$3,'2026-10-01','ON_ROLL',12345.67,$4)",[ids.compensation,ids.branch,ids.employee,ids.owner]);
    await pool.query("insert into branch_shifts(id,branch_id,label,start_time,end_time,sort_order) values($1,$2,'QA shift','00:00','00:00',0)",[ids.shift,ids.branch]);
    await pool.query("insert into warehouses(id,branch_id,type,name) values($1,$2,'BRANCH',$1),($3,null,'CENTRAL',$3)",[ids.warehouse,ids.branch,ids.hqWarehouse]);
    await pool.query("insert into ledger_accounts(id,code,name,type,branch_id) values($1,$1,$1,'ASSET',$2),($3,$3,$3,'ASSET',null)",[ids.ledger,ids.branch,ids.hqLedger]);
    const before = await snapshot();
    const linked = await expect(checkPath,'owner','GET',200);
    assert.deepEqual(Object.keys(linked).sort(),['branchId','canDelete','dependencies']); assert.equal(linked.branchId,ids.branch); assert.equal(linked.canDelete,false);
    assert.deepEqual(linked.dependencies,[{group:'branch_shifts',count:1},{group:'employee_compensation',count:1},{group:'employees',count:1},{group:'inventory_stock',count:1},{group:'ledger_accounts',count:1},{group:'users',count:2},{group:'warehouses',count:1}]);
    for (const row of linked.dependencies) assert.deepEqual(Object.keys(row).sort(),['count','group']);
    assert.deepEqual(await snapshot(),before);
    pass('exact counts-only groups include users, inventory, workforce, shifts and nullable warehouse/ledger refs; GET no-write');
    const rejected = await expect(ids.branch+'?ready=true','owner','DELETE',409); assert.match(rejected.error,/linked records.*prevent deletion/i); assert.deepEqual(await snapshot(),before);
    pass('linked DELETE ignores client ready status and preserves all exact fixture rows');
    const empty = await expect(ids.empty+'/deletion-check','owner','GET',200); assert.deepEqual(empty,{branchId:ids.empty,canDelete:true,dependencies:[]});
    pass('empty branch ready; unrelated/HQ NULL references not counted');
    await pool.query("insert into warehouses(id,branch_id,type,name) values($1,$2,'BRANCH',$1)",[ids.lateWarehouse,ids.empty]);
    const lateBefore = await snapshot(); await expect(ids.empty,'owner','DELETE',409); assert.deepEqual(await snapshot(),lateBefore);
    pass('dependency inserted after ready snapshot forces fresh DELETE409; branch and dependency preserved');
    await pool.query('delete from warehouses where id=$1',[ids.lateWarehouse]);
    assert.deepEqual(await expect(ids.empty,'owner','DELETE',200),{ok:true}); assert.equal((await pool.query('select id from branches where id=$1',[ids.empty])).rowCount,0);
    await expect(ids.empty+'/deletion-check','owner','GET',404); await expect(ids.empty,'owner','DELETE',404);
    pass('empty deletion succeeds with durable readback; repeated/missing requests return404');
  } catch (error) { failure = error; }
  finally {
    try { if (verifiedDb) { await cleanup(); pass('exact fixture cleanup read back empty'); } } catch (error) { failure = failure ? new AggregateError([failure,error],'Acceptance and cleanup failed') : error; }
    await pool.end();
  }
  if (failure) throw failure;
  console.log('RESULT '+checks+' real HTTP/Postgres branch-deletion checks passed');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
