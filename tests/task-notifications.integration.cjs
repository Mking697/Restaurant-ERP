// AUTOMATION-1b — AUTHORED, PARENT-EXECUTED ONLY. Real HTTP+Postgres
// integration test for the staff/owner-facing WhatsApp task reminder,
// overdue escalation and daily summary automation. Every value must be
// passed explicitly on the command line, same no-dotenv-default convention
// as tests/task-generation.integration.cjs.
//
//   PGHOST=127.0.0.1 PGPORT=5436 PGUSER=<qa_user> PGPASSWORD=<qa_pass> \
//   PGDATABASE=restaurant_erp_automation1b_qa_20261030 \
//   BASE_URL=http://127.0.0.1:<dedicated-port> \
//   CRON_SECRET=<qa-only-secret, must equal the running app's own CRON_SECRET> \
//   node tests/task-notifications.integration.cjs
//
// NO LIVE SEND: this test deliberately never inserts a CHATXFLOW_API_TOKEN
// row into the QA database's `settings` table. src/lib/chatxflow.ts
// getConfig() therefore always returns null, so sendConfigured() returns
// `{ ok:false, error:"... not configured ..." }` and returns BEFORE ever
// calling fetch() — no network call to any WhatsApp provider is possible,
// by construction, regardless of what this test asserts. Every outbound
// attempt (recipient phone + exact message text) is still durably recorded
// in whatsapp_message_log by src/lib/chatxflow.ts logMessage(), which is
// what every assertion below reads back — this proves recipient/content/
// idempotency without ever touching the real network.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Explicit dedicated QA host required, no dotenv default');
assert.equal(process.env.PGPORT, '5436', 'Explicit dedicated QA port required, no dotenv default');
assert.equal(process.env.PGDATABASE, 'restaurant_erp_automation1b_qa_20261030', 'Exact dedicated QA database name required');
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
let checks = 0;
const pass = (name) => { checks++; console.log('PASS ' + name); };

async function cronPost(path, token) {
  const headers = {};
  if (token !== undefined) headers.authorization = 'Bearer ' + token;
  const res = await fetch(target.origin + path, { method: 'POST', headers, signal: AbortSignal.timeout(30000) });
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

const branchA = id();
const owner = id(), managerA = id(), doerDue = id(), doerInactive = id(), otherBranchManager = id();
const branchB = id();

async function cleanup() {
  await pool.query('delete from whatsapp_message_log where related_entity_id like $1', [`%${run}%`]);
  await pool.query('delete from daily_summary_log where branch_id = any($1::text[])', [[branchA, branchB]]);
  await pool.query('delete from task_instances where branch_id = any($1::text[])', [[branchA, branchB]]);
  await pool.query('delete from pos_orders where branch_id = any($1::text[])', [[branchA, branchB]]);
  await pool.query('delete from users where id = any($1::text[])', [[owner, managerA, doerDue, doerInactive, otherBranchManager]]);
  await pool.query('delete from branches where id = any($1::text[])', [[branchA, branchB]]);
  await pool.query("delete from settings where key = 'CHATXFLOW_API_TOKEN'"); // guarantee no-live-send precondition
}

async function main() {
  assert.equal((await pool.query('select current_database() db')).rows[0].db, process.env.PGDATABASE);
  await cleanup(); // in case a previous run was interrupted

  const noToken = (await pool.query("select value from settings where key='CHATXFLOW_API_TOKEN'")).rows;
  assert.equal(noToken.length, 0, 'precondition: no real ChatXFlow token configured in this QA database — guarantees no live send is possible');
  pass('precondition verified: ChatXFlow is NOT configured in this QA database (no live send is possible)');

  await pool.query(
    'insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0),($3,$4,$3,0,0)',
    [branchA, 'AUTOMATION1B QA Branch A ' + run, branchB, 'AUTOMATION1B QA Branch B ' + run]
  );
  await pool.query(
    "insert into users(id,name,phone_e164,role,branch_id,status,module_access) values " +
    "($1,'QA Owner " + run + "','+919900" + run.slice(0, 6) + "1','SUPER_ADMIN',NULL,'Active','{}')," +
    "($2,'QA Manager A " + run + "','+919900" + run.slice(0, 6) + "2','BRANCH_MANAGER',$6,'Active','{}')," +
    "($3,'QA Doer Due " + run + "','+919900" + run.slice(0, 6) + "3','KITCHEN_STAFF',$6,'Active','{}')," +
    "($4,'QA Doer Inactive " + run + "','+919900" + run.slice(0, 6) + "4','KITCHEN_STAFF',$6,'Inactive','{}')," +
    "($5,'QA Manager B " + run + "','+919900" + run.slice(0, 6) + "5','BRANCH_MANAGER',$7,'Active','{}')",
    [owner, managerA, doerDue, doerInactive, otherBranchManager, branchA, branchB]
  );

  // --- auth: both cron endpoints reject anonymous/wrong secret, never a cookie --
  assert.equal((await cronPost('/api/cron/tasks', undefined)).status, 401);
  assert.equal((await cronPost('/api/cron/tasks', 'wrong-secret')).status, 401);
  assert.equal((await cronPost('/api/cron/daily-summary', undefined)).status, 401);
  assert.equal((await cronPost('/api/cron/daily-summary', 'wrong-secret')).status, 401);
  pass('both cron endpoints reject anonymous/wrong bearer secret with 401');

  // ======================================================================
  // 1) A due task occurrence triggers EXACTLY ONE reminder call to the
  //    correct recipient/content, never a second one on retry.
  // ======================================================================
  const dueTask = id();
  const dueTaskTitle = 'QA closing checklist ' + run;
  await pool.query(
    "insert into task_instances(id,recurring_definition_id,branch_id,type,title,assigned_to_id,due_at,status) values " +
    "($1,'',$2,'ONE_TIME',$3,$4,now() - interval '5 minutes','PENDING')",
    [dueTask, branchA, dueTaskTitle, doerDue]
  );
  const first = await cronPost('/api/cron/tasks', process.env.CRON_SECRET);
  assert.equal(first.status, 200);
  // remindersSent only counts an *actually successful* provider ACK
  // (result.ok) — in this QA run ChatXFlow is deliberately NOT configured
  // (no-live-send precondition above), so sendConfigured() always returns
  // ok:false before ever calling fetch(), and remindersSent is correctly 0.
  // The real proof that exactly one reminder CALL was attempted, to the
  // correct recipient with the correct content, is the durable
  // whatsapp_message_log row asserted right below — logMessage() always
  // records the attempt regardless of ok/fail.
  assert.equal(first.data.remindersSent, 0, 'no provider is configured in this QA run, so zero sends can ever succeed (no-live-send precondition)');
  pass('cron POST claims the due occurrence and attempts exactly one reminder send');

  const reminderRows = (await pool.query(
    "select to_phone, payload_json from whatsapp_message_log where related_entity_type='TASK_REMINDER' and related_entity_id=$1",
    [dueTask]
  )).rows;
  assert.equal(reminderRows.length, 1, 'exactly one reminder log row for this occurrence');
  assert.equal(reminderRows[0].to_phone, '+919900' + run.slice(0, 6) + '3', 'reminder must go to the assigned doer, no one else');
  assert.match(reminderRows[0].payload_json.message, new RegExp(dueTaskTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'reminder message must contain the task title');
  pass('exactly one reminder log row, to the correct doer, with the task title in the message body');

  const reminderSentAt = (await pool.query('select reminder_sent_at from task_instances where id=$1', [dueTask])).rows[0].reminder_sent_at;
  assert.ok(reminderSentAt, 'reminderSentAt must be set (one-shot claim)');

  // retry: no second reminder, claim stays fixed
  const second = await cronPost('/api/cron/tasks', process.env.CRON_SECRET);
  assert.equal(second.status, 200);
  assert.equal(second.data.remindersSent, 0, 'a second immediate run must attempt zero new reminders for this occurrence');
  const reminderRowsAfterRetry = (await pool.query(
    "select id from whatsapp_message_log where related_entity_type='TASK_REMINDER' and related_entity_id=$1",
    [dueTask]
  )).rows;
  assert.equal(reminderRowsAfterRetry.length, 1, 'retry must never create a second reminder log row for the same occurrence');
  const reread = (await pool.query('select reminder_sent_at from task_instances where id=$1', [dueTask])).rows[0];
  assert.deepEqual(reread.reminder_sent_at, reminderSentAt, 'reminderSentAt must not be cleared/updated on a later run');
  pass('retry never resends the same reminder twice; reminderSentAt stays fixed');

  // ======================================================================
  // 2) An overdue escalation goes to the correct manager/Owner ONCE.
  // ======================================================================
  const overdueTask = id();
  const overdueTitle = 'QA opening checklist ' + run;
  await pool.query(
    "insert into task_instances(id,recurring_definition_id,branch_id,type,title,assigned_to_id,due_at,status) values " +
    "($1,'',$2,'ONE_TIME',$3,$4,now() - interval '31 minutes','PENDING')",
    [overdueTask, branchA, overdueTitle, doerDue]
  );
  const third = await cronPost('/api/cron/tasks', process.env.CRON_SECRET);
  assert.equal(third.status, 200);
  assert.equal(third.data.escalated, 1, 'exactly one occurrence must flip to OVERDUE this tick');
  // Same no-live-send precondition as the reminder case above: escalationNoticesSent
  // only counts a successful provider ACK, which is always 0 here by construction.
  assert.equal(third.data.escalationNoticesSent, 0, 'no provider is configured in this QA run, so zero sends can ever succeed (no-live-send precondition)');
  pass('cron POST escalates the overdue occurrence and attempts notices to exactly 2 recipients');

  const escalationRows = (await pool.query(
    "select to_phone, payload_json from whatsapp_message_log where related_entity_type='TASK_ESCALATION' and related_entity_id=$1 order by to_phone",
    [overdueTask]
  )).rows;
  assert.equal(escalationRows.length, 2);
  const escalationPhones = escalationRows.map((r) => r.to_phone).sort();
  assert.deepEqual(escalationPhones, ['+919900' + run.slice(0, 6) + '1', '+919900' + run.slice(0, 6) + '2'].sort(), 'escalation must reach exactly the Owner and branchA manager');
  // the other branch's manager (otherBranchManager) must never be notified
  const otherBranchManagerPhone = '+919900' + run.slice(0, 6) + '5';
  assert.ok(!escalationPhones.includes(otherBranchManagerPhone), 'a different branch\'s manager must never receive this branch\'s escalation');
  for (const row of escalationRows) assert.match(row.payload_json.message, new RegExp(overdueTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  pass('escalation notices reach exactly the correct branch manager + Owner, with the task title, and never a foreign-branch manager');

  const statusRow = (await pool.query('select status, overdue_escalated_at from task_instances where id=$1', [overdueTask])).rows[0];
  assert.equal(statusRow.status, 'OVERDUE');
  const escalatedAtFirst = statusRow.overdue_escalated_at;

  // retry: no second escalation
  const fourth = await cronPost('/api/cron/tasks', process.env.CRON_SECRET);
  assert.equal(fourth.status, 200);
  assert.equal(fourth.data.escalated, 0, 'a second immediate run must escalate zero occurrences');
  const escalationRowsAfterRetry = (await pool.query(
    "select id from whatsapp_message_log where related_entity_type='TASK_ESCALATION' and related_entity_id=$1",
    [overdueTask]
  )).rows;
  assert.equal(escalationRowsAfterRetry.length, 2, 'retry must never create additional escalation log rows for the same occurrence');
  const rereadEscalated = (await pool.query('select overdue_escalated_at from task_instances where id=$1', [overdueTask])).rows[0];
  assert.deepEqual(rereadEscalated.overdue_escalated_at, escalatedAtFirst, 'overdueEscalatedAt must not change on a later run');
  pass('retry never resends the escalation notice twice');

  // ======================================================================
  // 3) A deactivated user is NEVER messaged — reminder path.
  // ======================================================================
  const inactiveTask = id();
  await pool.query(
    "insert into task_instances(id,recurring_definition_id,branch_id,type,title,assigned_to_id,due_at,status) values " +
    "($1,'',$2,'ONE_TIME',$3,$4,now() - interval '5 minutes','PENDING')",
    [inactiveTask, branchA, 'QA inactive-assignee task ' + run, doerInactive]
  );
  const fifth = await cronPost('/api/cron/tasks', process.env.CRON_SECRET);
  assert.equal(fifth.status, 200);
  const inactivePhone = '+919900' + run.slice(0, 6) + '4';
  const inactiveLogRows = (await pool.query('select id from whatsapp_message_log where to_phone=$1', [inactivePhone])).rows;
  assert.equal(inactiveLogRows.length, 0, 'a deactivated (Inactive) user must never be messaged, even though their occurrence was claimed as due');
  const inactiveClaim = (await pool.query('select reminder_sent_at from task_instances where id=$1', [inactiveTask])).rows[0];
  assert.ok(inactiveClaim.reminder_sent_at, 'the occurrence is still claimed (one-shot) even though no eligible recipient exists, so it is never re-attempted either');
  pass('a deactivated user is never messaged; their due occurrence is claimed once and skipped, not retried forever');

  // ======================================================================
  // 4) Daily summary endpoint: auth gate (already checked above) + runs +
  //    sends to Owner/branch manager + is idempotent for the same day.
  // ======================================================================
  // Direct SQL fixtures only: no customer contact, POS endpoint, or provider call.
  // One public sale, two owner-only sales, and a void that must never count.
  for (const [label, ownerOnly, status] of [
    ['public', false, 'COMPLETED'], ['private-1', true, 'COMPLETED'],
    ['private-2', true, 'COMPLETED'], ['void', false, 'VOIDED'],
  ]) {
    await pool.query(
      "insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,status,owner_only,cashier_id,created_at) " +
      "values($1,$2,$3,'TAKEAWAY',100,100,'CASH',$4,$5,$6,(date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') + interval '1 hour')",
      [id(), branchA, `QA-${run}-${label}`, status, ownerOnly, doerDue]
    );
  }
  const summaryFirst = await cronPost('/api/cron/daily-summary', process.env.CRON_SECRET);
  assert.equal(summaryFirst.status, 200);
  assert.ok(summaryFirst.data.claimed >= 2, 'at least both QA branches must be claimed for today\'s summary');
  pass('daily-summary POST with the correct secret returns 200 and claims every branch once');

  const summaryLogRows = (await pool.query(
    "select to_phone, payload_json from whatsapp_message_log where related_entity_type='DAILY_SUMMARY' and related_entity_id like $1",
    [`${branchA}:%`]
  )).rows;
  const summaryPhones = summaryLogRows.map((r) => r.to_phone).sort();
  assert.deepEqual(summaryPhones, ['+919900' + run.slice(0, 6) + '1', '+919900' + run.slice(0, 6) + '2'].sort(), 'branchA daily summary must reach exactly its manager + Owner');
  pass('daily summary for branchA reaches exactly its manager + Owner, matching the escalation recipient set');
  const managerSummary = summaryLogRows.find(r => r.to_phone === '+919900' + run.slice(0, 6) + '2').payload_json.message;
  const ownerSummary = summaryLogRows.find(r => r.to_phone === '+919900' + run.slice(0, 6) + '1').payload_json.message;
  assert.match(managerSummary, /: 1 completed sale\(s\) today so far,/, 'Manager sees public completed sales only');
  assert.match(ownerSummary, /: 3 completed sale\(s\) today so far,/, 'Owner receives actual total, including owner-only sales');
  assert.equal(ownerSummary.replace('3 completed sale(s)', '1 completed sale(s)'), managerSummary, 'Manager copy contains no private subtotal, count or existence hint');
  assert.equal(summaryFirst.data.notified, 0, 'Unconfigured sandbox provider must never report a successful send');
  pass('sandbox daily summaries distinguish Owner actual sales from manager-visible sales without revealing private activity');

  const summarySecond = await cronPost('/api/cron/daily-summary', process.env.CRON_SECRET);
  assert.equal(summarySecond.status, 200);
  assert.equal(summarySecond.data.claimed, 0, 'a second run on the same day must claim zero branches (already sent)');
  assert.ok(summarySecond.data.alreadySent >= 2, 'both branches must be reported as already-sent on the retry');
  const summaryLogRowsAfterRetry = (await pool.query(
    "select id from whatsapp_message_log where related_entity_type='DAILY_SUMMARY' and related_entity_id like $1",
    [`${branchA}:%`]
  )).rows;
  assert.equal(summaryLogRowsAfterRetry.length, summaryLogRows.length, 'retry must never send a second daily summary for the same branch+day');
  pass('a second daily-summary run the same day is fully idempotent — zero additional sends');

  await cleanup();
  console.log(`\n${checks} integration checks passed.`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => { console.error(error); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
