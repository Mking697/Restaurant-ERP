// AUTHORED, PARENT-EXECUTED ONLY — never run automatically. This targets a
// dedicated disposable QA database distinct from every other module's QA DB,
// on a non-default Postgres port, with NO dotenv default (unlike the sibling
// tasks.integration.cjs, which this file deliberately differs from per the
// AUTOMATION-1a contract): every value must be passed explicitly on the
// command line so a misconfigured environment can never silently fall back
// to a real/default database or a real CRON_SECRET.
//
//   PGHOST=127.0.0.1 PGPORT=5436 PGUSER=<qa_user> PGPASSWORD=<qa_pass> \
//   PGDATABASE=restaurant_erp_automation_qa_20261030 \
//   BASE_URL=http://127.0.0.1:<dedicated-port> \
//   CRON_SECRET=<qa-only-secret, must equal the running app's own CRON_SECRET> \
//   node tests/task-generation.integration.cjs
//
// Prerequisites (parent-owned, not performed by this file):
//   1. Dedicated Postgres instance/cluster reachable at 127.0.0.1:5436.
//   2. `restaurant_erp_automation_qa_20261030` created and migrated
//      (`npx drizzle-kit migrate` against that exact PG* target).
//   3. A separate app instance started with that same PG* target AND
//      CRON_SECRET set to the exact value passed here, listening at BASE_URL.
// This file performs NO WhatsApp send of any kind — it only POSTs to the
// cron route and reads task_instances/recurring_task_definitions back.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Explicit dedicated QA host required, no dotenv default');
assert.equal(process.env.PGPORT, '5436', 'Explicit dedicated QA port required, no dotenv default');
assert.equal(process.env.PGDATABASE, 'restaurant_erp_automation_qa_20261030', 'Exact dedicated QA database name required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app BASE_URL required, no dotenv default');
assert.ok(process.env.CRON_SECRET, 'Explicit CRON_SECRET required, no dotenv default');
const target = new URL(process.env.BASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:' &&
  target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash,
  'BASE_URL must be a bare local http origin'
);

const pool = new Pool({
  host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE,
  user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false,
});

const id = () => randomUUID();
const run = randomUUID().slice(0, 8);
const branchA = id(), branchB = id();
const userA = id(), userB = id();
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };

function buildHeader(input) {
  if (typeof input !== 'string' || input.length === 0) { return ''; }
  var out = 'Bearer ' + input;
  return out;
}

async function cronPost(token) {
  const headerVal = buildHeader(token);
  const headerBag = {};
  const headerName = 'authorization';
  headerBag[headerName] = headerVal;
  const res = await fetch(target.origin + '/api/cron/tasks', {
    method: 'POST',
    headers: headerBag,
    signal: AbortSignal.timeout(20000),
  });
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function cleanup() {
  await pool.query('delete from task_instances where branch_id = any($1::text[])', [[branchA, branchB]]);
  await pool.query('delete from recurring_task_definitions where assigned_to_id = any($1::text[])', [[userA, userB]]);
  await pool.query('delete from users where id = any($1::text[])', [[userA, userB]]);
  await pool.query('delete from branches where id = any($1::text[])', [[branchA, branchB]]);
}

async function main() {
  assert.equal((await pool.query('select current_database() db')).rows[0].db, process.env.PGDATABASE);
  await cleanup(); // in case a previous run was interrupted

  await pool.query(
    'insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0),($3,$4,$3,0,0)',
    [branchA, 'Automation QA Branch A ' + run, branchB, 'Automation QA Branch B ' + run]
  );
  await pool.query(
    "insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,'BRANCH_MANAGER',$4,'{}'),($5,$6,$7,'BRANCH_MANAGER',$8,'{}')",
    [userA, 'Automation QA A ' + run, '+9198' + run.slice(0, 8), branchA, userB, 'Automation QA B ' + run, '+9197' + run.slice(0, 8), branchB]
  );

  // --- auth -------------------------------------------------------------
  assert.equal((await cronPost(undefined)).status, 401);
  assert.equal((await cronPost('definitely-wrong-secret')).status, 401);
  pass('missing/wrong bearer secret rejected 401');

  // --- a global (branchId null) DAILY definition generates per branch --
  const globalDef = id();
  await pool.query(
    "insert into recurring_task_definitions(id,branch_id,title,assigned_to_id,assigned_by_id,frequency,assign_date,shift_time,status) values($1,NULL,$2,$3,$3,'DAILY',now(),'09:00','Active')",
    [globalDef, 'Automation QA global daily ' + run, userA]
  );
  const first = await cronPost(process.env.CRON_SECRET);
  assert.equal(first.status, 200);
  assert.ok(first.data.generated >= 2, 'expected at least one instance per branch');
  pass('cron POST with correct secret returns 200 with generated/escalated counts');

  const generatedRows = (await pool.query(
    'select branch_id, natural_cycle_start_date, due_at from task_instances where recurring_definition_id=$1 order by branch_id',
    [globalDef]
  )).rows;
  assert.equal(generatedRows.length, 2, 'global definition must generate exactly one instance per active branch');
  assert.deepEqual(generatedRows.map((r) => r.branch_id).sort(), [branchA, branchB].sort());
  pass('global definition generated exactly one instance per active branch, read back from Postgres');

  // --- idempotent second immediate run ----------------------------------
  const second = await cronPost(process.env.CRON_SECRET);
  assert.equal(second.status, 200);
  assert.equal(second.data.generated, 0, 'a second immediate run must generate zero new rows');
  const countAfterSecond = (await pool.query('select count(*)::int c from task_instances where recurring_definition_id=$1', [globalDef])).rows[0].c;
  assert.equal(countAfterSecond, 2, 'row count must be unchanged after the idempotent second run');
  pass('second immediate cron POST generates zero new rows (idempotent)');

  // --- 30-minute overdue escalation boundary -----------------------------
  const justUnder = id(), justOver = id();
  await pool.query(
    "insert into task_instances(id,recurring_definition_id,branch_id,type,title,assigned_to_id,due_at,status) values " +
    "($1,'',$3,'ONE_TIME','QA just-under',$5,now() - interval '29 minutes 59 seconds','PENDING')," +
    "($2,'',$4,'ONE_TIME','QA just-over',$5,now() - interval '30 minutes 1 second','PENDING')",
    [justUnder, justOver, branchA, branchA, userA]
  );
  const third = await cronPost(process.env.CRON_SECRET);
  assert.equal(third.status, 200);
  const statuses = (await pool.query('select id,status,overdue_escalated_at from task_instances where id = any($1::text[])', [[justUnder, justOver]])).rows;
  const underRow = statuses.find((r) => r.id === justUnder);
  const overRow = statuses.find((r) => r.id === justOver);
  assert.equal(underRow.status, 'PENDING'); assert.equal(underRow.overdue_escalated_at, null);
  assert.equal(overRow.status, 'OVERDUE'); assert.ok(overRow.overdue_escalated_at !== null);
  pass('exact 30-minute escalation boundary: just-under stays PENDING, just-over becomes OVERDUE');

  // --- no re-escalation on a later run -----------------------------------
  const escalatedAtFirst = overRow.overdue_escalated_at;
  const fourth = await cronPost(process.env.CRON_SECRET);
  assert.equal(fourth.status, 200);
  const reread = (await pool.query('select overdue_escalated_at from task_instances where id=$1', [justOver])).rows[0];
  assert.deepEqual(reread.overdue_escalated_at, escalatedAtFirst, 'overdueEscalatedAt must not be cleared or updated on a later run');
  pass('no re-escalation: overdueEscalatedAt stays fixed across a later run');

  // --- concurrent same-tick invocation creates no duplicate rows --------
  const concurrentDef = id();
  await pool.query(
    "insert into recurring_task_definitions(id,branch_id,title,assigned_to_id,assigned_by_id,frequency,assign_date,shift_time,status) values($1,$2,$3,$4,$4,'DAILY',now(),'09:00','Active')",
    [concurrentDef, branchA, 'Automation QA concurrent daily ' + run, userA]
  );
  const [resA, resB] = await Promise.all([cronPost(process.env.CRON_SECRET), cronPost(process.env.CRON_SECRET)]);
  assert.equal(resA.status, 200); assert.equal(resB.status, 200);
  const concurrentCount = (await pool.query('select count(*)::int c from task_instances where recurring_definition_id=$1', [concurrentDef])).rows[0].c;
  assert.equal(concurrentCount, 1, 'two concurrent same-tick cron POSTs must create exactly one occurrence, never two');
  pass('concurrent same-tick cron invocations create no duplicate rows');

  await cleanup();
  console.log(`\n${checks} integration checks passed.`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => { console.error(error); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
