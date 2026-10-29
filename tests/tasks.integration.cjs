// Parent-run only: migrated disposable QA DB + app bound to that exact DB.
// PGHOST=127.0.0.1 PGPORT=5436 PGDATABASE=restaurant_erp_tasks_qa_YYYYMMDD
// BASE_URL=http://127.0.0.1:<dedicated-port> node tests/tasks.integration.cjs
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_tasks_qa_\d{8}$/);
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:' && target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash);
const pool = new Pool({ host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });

const id = () => randomUUID();
const branchA = id(), branchB = id();
const owner = id(), managerA = id(), kitchenA = id(), cashierB = id();
const run = randomUUID().slice(0, 8);
const cookies = {};
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };

async function identity(label, { branchId, role, grants }) {
  const uid = label === 'owner' ? owner : label === 'managerA' ? managerA : label === 'kitchenA' ? kitchenA : cashierB;
  const token = randomBytes(32).toString('hex');
  const phone = '+919' + String(BigInt('0x' + randomBytes(6).toString('hex')) % 1000000000n).padStart(9, '0');
  await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)', [uid, 'Tasks QA ' + label + ' ' + run, phone, role, branchId, grants]);
  await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), uid]);
  cookies[label] = 'restaurant_session=' + token;
  return uid;
}

async function request(path, actor, method = 'GET', body) {
  const res = await fetch(target.origin + path, {
    method,
    headers: { 'content-type': 'application/json', origin: target.origin, ...(actor ? { cookie: cookies[actor] } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
async function ok(path, actor, method, body, status = 200) {
  const r = await request(path, actor, method, body);
  assert.equal(r.status, status, path + ' (' + method + '): ' + JSON.stringify(r.data));
  return r.data;
}

async function cleanup() {
  await pool.query('delete from task_instances where branch_id = any($1::text[])', [[branchA, branchB]]);
  await pool.query('delete from recurring_task_definitions where branch_id = any($1::text[])', [[branchA, branchB]]);
  await pool.query('delete from sessions where user_id = any($1::text[])', [[owner, managerA, kitchenA, cashierB]]);
  await pool.query('delete from users where id = any($1::text[])', [[owner, managerA, kitchenA, cashierB]]);
  await pool.query('delete from branches where id = any($1::text[])', [[branchA, branchB]]);
}

async function main() {
  assert.equal((await pool.query('select current_database() db')).rows[0].db, process.env.PGDATABASE);
  await cleanup(); // in case a previous run was interrupted

  await pool.query("insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0),($3,$4,$3,0,0)", [branchA, 'Tasks QA Branch A ' + run, branchB, 'Tasks QA Branch B ' + run]);
  await identity('owner', { branchId: null, role: 'SUPER_ADMIN', grants: [] });
  await identity('managerA', { branchId: branchA, role: 'BRANCH_MANAGER', grants: ['TASKS_RECURRING', 'TASKS_DELEGATION'] });
  await identity('kitchenA', { branchId: branchA, role: 'KITCHEN_STAFF', grants: [] });
  await identity('cashierB', { branchId: branchB, role: 'CASHIER', grants: ['TASKS_DELEGATION'] });

  // --- auth/CSRF sanity -----------------------------------------------
  assert.equal((await request('/api/tasks/recurring')).status, 401);
  pass('anonymous read is rejected 401');
  const noOrigin = await fetch(target.origin + '/api/tasks/recurring', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookies.managerA }, body: JSON.stringify({}) });
  assert.equal(noOrigin.status, 403);
  pass('cross-origin / missing-origin write is rejected 403 before auth');

  // --- recurring: create / list / branch scoping / pause-resume -------
  const recur = await ok('/api/tasks/recurring', 'managerA', 'POST', {
    branchId: branchA, title: 'Walk-in fridge temp log', assignedToId: kitchenA, frequency: 'DAILY', assignDate: new Date().toISOString(), shiftTime: '09:30',
  }, 201);
  assert.equal(recur.recurring.status, 'Active'); assert.equal(recur.recurring.assignedToName.includes('Tasks QA kitchenA'), true);
  pass('recurring definition created with Active default status and joined doer name');

  await ok('/api/tasks/recurring', 'managerA', 'POST', { branchId: branchB, title: 'x', assignedToId: kitchenA, frequency: 'DAILY', assignDate: new Date().toISOString() }, 403);
  pass('cross-branch recurring create is denied 403');

  await ok('/api/tasks/recurring', 'managerA', 'POST', { branchId: branchA, title: 'x', assignedToId: cashierB, frequency: 'DAILY', assignDate: new Date().toISOString() }, 400);
  pass('assignedToId outside the target branch is rejected 400');

  await ok('/api/tasks/recurring', 'managerA', 'POST', { branchId: branchA, title: 'x', assignedToId: kitchenA, frequency: 'DAILY', assignDate: new Date().toISOString(), extra: 1 }, 400);
  pass('unknown field on recurring create is rejected 400');

  await ok('/api/tasks/recurring', 'kitchenA', 'POST', { branchId: branchA, title: 'x', assignedToId: kitchenA, frequency: 'DAILY', assignDate: new Date().toISOString() }, 403);
  pass('a user without TASKS_RECURRING grant cannot create a recurring definition');

  const listOwner = await ok('/api/tasks/recurring?branchId=' + branchA, 'owner');
  assert.equal(listOwner.recurring.some((r) => r.id === recur.recurring.id), true);
  pass('Owner lists recurring definitions scoped to an explicit branch');

  const listCross = await request('/api/tasks/recurring?branchId=' + branchA, 'managerA');
  assert.equal(listCross.status, 200); assert.equal(listCross.data.recurring.length >= 1, true);
  const crossRead = await request('/api/tasks/recurring?branchId=' + branchB, 'managerA');
  assert.equal(crossRead.status, 403);
  pass('non-Owner recurring list cannot be redirected to a foreign branch');

  const paused = await ok('/api/tasks/recurring/' + recur.recurring.id, 'managerA', 'PATCH', { status: 'Paused' });
  assert.equal(paused.recurring.status, 'Paused');
  await ok('/api/tasks/recurring/' + recur.recurring.id, 'managerA', 'PATCH', { status: 'Bogus' }, 400);
  await ok('/api/tasks/recurring/' + recur.recurring.id, 'kitchenA', 'PATCH', { status: 'Active' }, 403);
  pass('recurring status PATCH accepts only Active/Paused and requires the grant');

  // --- delegation: create / attachment-required complete / branch scope
  const delegated = await ok('/api/tasks/delegate', 'managerA', 'POST', {
    branchId: branchA, title: 'Repair exhaust fan', assignedToId: kitchenA, priority: 'HIGH', dueAt: new Date(Date.now() + 86400000).toISOString(),
  }, 201);
  assert.equal(delegated.instance.type, 'ONE_TIME'); assert.equal(delegated.instance.status, 'PENDING'); assert.equal(delegated.instance.delegatedById, managerA);
  pass('one-time delegated task created with the actor recorded as delegatedById');

  await ok('/api/tasks/delegate', 'kitchenA', 'POST', { branchId: branchA, title: 'x', assignedToId: kitchenA, priority: 'LOW', dueAt: new Date().toISOString() }, 403);
  pass('a user without TASKS_DELEGATION grant cannot delegate a task');

  const missingAttachment = await request('/api/tasks/instances/' + delegated.instance.id + '/complete', 'kitchenA', 'POST', {});
  assert.equal(missingAttachment.status, 400);
  pass('completing a ONE_TIME task without an attachment is rejected 400');

  const completedByAssignee = await ok('/api/tasks/instances/' + delegated.instance.id + '/complete', 'kitchenA', 'POST', { attachmentUrl: 'receipt.jpg' });
  assert.equal(completedByAssignee.instance.status, 'DONE'); assert.equal(completedByAssignee.instance.attachmentUrl, 'receipt.jpg'); assert.ok(completedByAssignee.instance.completedAt);
  pass('the assignee can complete their own ONE_TIME task once evidence is attached');

  await ok('/api/tasks/instances/' + delegated.instance.id + '/complete', 'kitchenA', 'POST', { attachmentUrl: 'again.jpg' }, 409);
  pass('completing an already-DONE task is rejected 409');

  const delegated2 = await ok('/api/tasks/delegate', 'managerA', 'POST', {
    branchId: branchA, title: 'Second one-time task', assignedToId: kitchenA, priority: 'MEDIUM', dueAt: new Date(Date.now() + 86400000).toISOString(),
  }, 201);
  await ok('/api/tasks/instances/' + delegated2.instance.id + '/complete', 'managerA', 'POST', { attachmentUrl: 'manager-closed.jpg' });
  pass('a TASKS_DELEGATION grant holder (not the assignee) can also complete a ONE_TIME task');

  const delegated3 = await ok('/api/tasks/delegate', 'managerA', 'POST', {
    branchId: branchA, title: 'Third one-time task', assignedToId: kitchenA, priority: 'LOW', dueAt: new Date(Date.now() + 86400000).toISOString(),
  }, 201);
  await ok('/api/tasks/instances/' + delegated3.instance.id + '/complete', 'cashierB', 'POST', { attachmentUrl: 'x.jpg' }, 403);
  pass('a different-branch user cannot complete a task outside their branch, even holding the grant');

  // --- listing instances: self-vs-grant scoping -----------------------
  const kitchenOwnList = await ok('/api/tasks/instances?branchId=' + branchA + '&type=ONE_TIME', 'kitchenA');
  assert.ok(kitchenOwnList.instances.every((i) => i.assignedToId === kitchenA));
  pass('a user without any task grant only sees their own assigned instances');

  const managerList = await ok('/api/tasks/instances?branchId=' + branchA + '&type=ONE_TIME', 'managerA');
  assert.ok(managerList.instances.length >= 3);
  pass('a grant holder sees every instance in their branch, not just their own');

  const crossList = await request('/api/tasks/instances?branchId=' + branchB, 'managerA');
  assert.equal(crossList.status, 403);
  pass('instance listing cannot be redirected to a foreign branch either');

  const ownerAll = await ok('/api/tasks/instances?type=ONE_TIME', 'owner');
  assert.ok(ownerAll.instances.length >= 3);
  pass('Owner with no branchId sees instances across all branches');

  console.log('RESULT ' + checks + ' real HTTP+Postgres task checks passed');
}

main()
  .then(async () => { await cleanup(); await pool.end(); process.exit(0); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
