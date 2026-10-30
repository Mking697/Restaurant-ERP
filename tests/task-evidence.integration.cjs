// Parent-run only: migrated disposable QA DB + app bound to that exact DB,
// using the REAL (already-provisioned) private Vercel Blob store — this
// test performs real network uploads/deletes against that store, so its
// own fixtures are deleted via `del()` in `finally` (see cleanup()).
// PGHOST=127.0.0.1 PGPORT=5436 PGDATABASE=restaurant_erp_evidence_qa_20261030
// BASE_URL=http://127.0.0.1:4521 node tests/task-evidence.integration.cjs
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_evidence_qa_\d{8}$/);
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
assert.ok(process.env.BLOB_READ_WRITE_TOKEN, 'Real private Blob store token required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:' && target.pathname === '/');
const pool = new Pool({ host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });

const id = () => randomUUID();
const branchA = id(), branchUnconfigured = id(), branchOther = id();
const owner = id(), managerA = id(), kitchenA = id(), cashierOther = id(), managerUnconfigured = id();
const identities = { owner, managerA, kitchenA, cashierOther, managerUnconfigured };
const run = randomUUID().slice(0, 8);
const cookies = {};
const uploadedPathnames = [];
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };

// 1x1 real PNG (valid signature, decodable) — used as the "valid photo" fixture.
const VALID_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5e0000000049454e44ae426082', 'hex');
const NOT_AN_IMAGE = Buffer.from('this is definitely not an image file, just plain text padding '.repeat(50));

async function identity(label, { branchId, role, grants }) {
  const uid = identities[label];
  const token = randomBytes(32).toString('hex');
  const phone = '+255' + String(700000000 + Number(BigInt('0x' + randomBytes(3).toString('hex')) % 90000000n));
  await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)', [uid, 'Evidence QA ' + label + ' ' + run, phone, role, branchId, grants]);
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

async function uploadEvidence(taskId, actor, { photoBuffer = VALID_PNG, filename = 'evidence.png', contentType = 'image/png', lat, lng } = {}) {
  const form = new FormData();
  form.append('photo', new Blob([photoBuffer], { type: contentType }), filename);
  if (lat !== undefined) form.append('lat', String(lat));
  if (lng !== undefined) form.append('lng', String(lng));
  const res = await fetch(target.origin + '/api/tasks/instances/' + taskId + '/evidence', {
    method: 'POST', headers: { origin: target.origin, cookie: cookies[actor] }, body: form, signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function okUpload(taskId, actor, opts, status = 201) {
  const r = await uploadEvidence(taskId, actor, opts);
  assert.equal(r.status, status, 'upload: ' + JSON.stringify(r.data));
  return r.data;
}

async function createOneTimeTask(branchId, assignedToId, creatorActor = 'managerA') {
  const delegated = await ok('/api/tasks/delegate', creatorActor, 'POST', {
    branchId, title: 'Evidence QA task ' + randomUUID().slice(0, 8), assignedToId, priority: 'HIGH', dueAt: new Date(Date.now() + 86400000).toISOString(),
  }, 201);
  return delegated.instance;
}

async function cleanup() {
  // Delete every real Blob object this run created so no test photo lingers
  // in the real private store, before dropping the QA DB rows.
  if (uploadedPathnames.length) {
    const { del } = await import('@vercel/blob');
    for (const p of uploadedPathnames) { try { await del(p); } catch {} }
  }
  await pool.query('delete from task_proofs where task_instance_id in (select id from task_instances where branch_id = any($1::text[]))', [[branchA, branchUnconfigured, branchOther]]);
  await pool.query('delete from task_instances where branch_id = any($1::text[])', [[branchA, branchUnconfigured, branchOther]]);
  await pool.query('delete from sessions where user_id = any($1::text[])', [Object.values(identities)]);
  await pool.query('delete from users where id = any($1::text[])', [Object.values(identities)]);
  await pool.query('delete from branches where id = any($1::text[])', [[branchA, branchUnconfigured, branchOther]]);
}

async function main() {
  assert.equal((await pool.query('select current_database() db')).rows[0].db, process.env.PGDATABASE);
  await cleanup(); // in case a previous run was interrupted

  // Branch A: real configured coordinates + a tight 100m geofence.
  await pool.query('insert into branches(id,name,code,lat,lng,geofence_radius_m) values($1,$2,$1,$3,$4,$5)', [branchA, 'Evidence QA Branch A ' + run, '-6.776000', '39.178000', 100]);
  // Deliberately left at the sentinel 0,0 default -> "not configured yet".
  await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0)', [branchUnconfigured, 'Evidence QA Unconfigured ' + run]);
  await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0)', [branchOther, 'Evidence QA Other Branch ' + run]);
  await identity('owner', { branchId: null, role: 'SUPER_ADMIN', grants: [] });
  await identity('managerA', { branchId: branchA, role: 'BRANCH_MANAGER', grants: ['TASKS_DELEGATION'] });
  await identity('kitchenA', { branchId: branchA, role: 'KITCHEN_STAFF', grants: [] });
  await identity('cashierOther', { branchId: branchOther, role: 'CASHIER', grants: ['TASKS_DELEGATION'] });
  await identity('managerUnconfigured', { branchId: branchUnconfigured, role: 'BRANCH_MANAGER', grants: ['TASKS_DELEGATION'] });

  // --- existing ONE_TIME-requires-evidence rule must be unchanged ------
  const task1 = await createOneTimeTask(branchA, kitchenA);
  await ok('/api/tasks/instances/' + task1.id + '/complete', 'kitchenA', 'POST', {}, 400);
  pass('completing a ONE_TIME task with no evidence at all still correctly 400s, exactly as before');

  // --- valid upload inside the geofence ---------------------------------
  const withinUpload = await okUpload(task1.id, 'kitchenA', { lat: -6.776050, lng: 39.178040 }); // ~7m away, inside 100m radius
  uploadedPathnames.push('(resolved below)');
  assert.equal(withinUpload.proof.taskInstanceId, task1.id);
  assert.equal(withinUpload.proof.withinGeofence, true);
  assert.ok(Number(withinUpload.proof.distanceFromBranchM) < 100);
  pass('a valid image upload inside the configured geofence succeeds and records withinGeofence:true');

  // Fetch the real stored pathname so we can delete exactly it in cleanup.
  const { rows: [proofRow] } = await pool.query('select photo_url from task_proofs where task_instance_id=$1', [task1.id]);
  uploadedPathnames[uploadedPathnames.length - 1] = proofRow.photo_url;

  // --- signed-URL read: authorized viewers can see it, others cannot ---
  const signed1 = await ok('/api/tasks/instances/' + task1.id + '/evidence', 'kitchenA');
  assert.ok(signed1.url.startsWith('https://'));
  const fetched = await fetch(signed1.url, { signal: AbortSignal.timeout(15000) });
  assert.equal(fetched.status, 200);
  const fetchedBytes = Buffer.from(await fetched.arrayBuffer());
  assert.ok(fetchedBytes.equals(VALID_PNG), 'signed URL returns the exact uploaded bytes');
  pass('the assignee retrieves a real signed URL and the bytes behind it match the uploaded photo exactly');

  const signedByOwner = await ok('/api/tasks/instances/' + task1.id + '/evidence', 'owner');
  assert.ok(signedByOwner.url.startsWith('https://'));
  pass('Owner (authorized viewer, same permission rule as task-instance reads) can also retrieve a signed URL');

  await ok('/api/tasks/instances/' + task1.id + '/evidence', 'cashierOther', 'GET', undefined, 403);
  pass('a cross-branch unauthorized user cannot read the evidence signed URL');

  // --- now complete: existing complete logic re-uses the uploaded pathname
  const completed1 = await ok('/api/tasks/instances/' + task1.id + '/complete', 'kitchenA', 'POST', {});
  assert.equal(completed1.instance.status, 'DONE');
  assert.equal(completed1.instance.attachmentUrl, proofRow.photo_url);
  pass('completion succeeds using the uploaded evidence pathname as attachmentUrl, unchanged complete() contract');

  // Evidence cannot be swapped out after the task is already DONE.
  await uploadEvidence(task1.id, 'kitchenA', { lat: -6.776050, lng: 39.178040 }).then((r) => assert.equal(r.status, 409));
  pass('re-uploading evidence for an already-DONE task is rejected 409');

  // --- oversized / non-image rejection -----------------------------------
  const task2 = await createOneTimeTask(branchA, kitchenA);
  const tooLarge = Buffer.concat([VALID_PNG, Buffer.alloc(9 * 1024 * 1024, 1)]);
  const oversized = await uploadEvidence(task2.id, 'kitchenA', { photoBuffer: tooLarge });
  assert.ok([400, 413].includes(oversized.status), JSON.stringify(oversized));
  pass('an oversized (>8MB) upload is rejected 400/413');

  const notImage = await uploadEvidence(task2.id, 'kitchenA', { photoBuffer: NOT_AN_IMAGE, contentType: 'image/png' });
  assert.equal(notImage.status, 400, JSON.stringify(notImage));
  pass('a non-image upload (even with a spoofed image/png content type) is rejected 400 by real signature validation');

  await ok('/api/tasks/instances/' + task2.id + '/complete', 'kitchenA', 'POST', {}, 400);
  pass('task2 still has no real evidence after the rejected uploads, so completion still 400s');

  // --- geofence: configured-out-of-range --------------------------------
  const outsideUpload = await okUpload(task2.id, 'kitchenA', { lat: -6.900000, lng: 39.300000 }); // far outside 100m radius
  uploadedPathnames.push((await pool.query('select photo_url from task_proofs where task_instance_id=$1', [task2.id])).rows[0].photo_url);
  assert.equal(outsideUpload.proof.withinGeofence, false);
  assert.ok(Number(outsideUpload.proof.distanceFromBranchM) > 1000);
  pass('an upload far outside the configured geofence records withinGeofence:false with a real distance, never blocking completion');
  await ok('/api/tasks/instances/' + task2.id + '/complete', 'kitchenA', 'POST', {});
  pass('completion succeeds even though the geofence check failed — geofence never blocks completion');

  // --- geofence: unconfigured branch (sentinel 0,0) fails open -----------
  const task3 = await createOneTimeTask(branchUnconfigured, managerUnconfigured, 'managerUnconfigured');
  const unconfiguredUpload = await okUpload(task3.id, 'managerUnconfigured', { lat: -6.776050, lng: 39.178040 });
  uploadedPathnames.push((await pool.query('select photo_url from task_proofs where task_instance_id=$1', [task3.id])).rows[0].photo_url);
  assert.equal(unconfiguredUpload.proof.withinGeofence, null, 'must be null, never a fabricated true/false');
  assert.equal(unconfiguredUpload.proof.distanceFromBranchM, null);
  pass('an unconfigured branch (no real lat/lng yet) records withinGeofence:null, never a fabricated result');
  await ok('/api/tasks/instances/' + task3.id + '/complete', 'managerUnconfigured', 'POST', {});
  pass('completion succeeds on an unconfigured branch — missing geofence config never blocks completion');

  // --- geofence: permission denied / missing coordinates fails open -----
  const task4 = await createOneTimeTask(branchA, kitchenA);
  const deniedUpload = await okUpload(task4.id, 'kitchenA', {}); // no lat/lng at all = denied/unavailable
  uploadedPathnames.push((await pool.query('select photo_url from task_proofs where task_instance_id=$1', [task4.id])).rows[0].photo_url);
  assert.equal(deniedUpload.proof.withinGeofence, null, 'must be null, never a fabricated true/false');
  pass('missing geolocation (denied permission) on a configured branch also records withinGeofence:null, never fabricated');
  await ok('/api/tasks/instances/' + task4.id + '/complete', 'kitchenA', 'POST', {});
  pass('completion succeeds even when geolocation permission was denied — fails open, never blocks');

  // --- auth/branch sanity on the evidence routes --------------------------
  const task5 = await createOneTimeTask(branchA, kitchenA);
  await uploadEvidence(task5.id, undefined, {}).then((r) => assert.equal(r.status, 401));
  pass('anonymous evidence upload is rejected 401');
  const crossBranchUpload = await uploadEvidence(task5.id, 'cashierOther', {});
  assert.equal(crossBranchUpload.status, 403);
  pass('a different-branch grant holder cannot upload evidence for a task outside their branch');

  console.log('RESULT ' + checks + ' real HTTP+Postgres+Blob evidence checks passed');
}

main()
  .then(async () => { await cleanup(); await pool.end(); process.exit(0); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch (ce) { console.error('cleanup failed too:', ce); } await pool.end(); process.exit(1); });
