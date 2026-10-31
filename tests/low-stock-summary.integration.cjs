// Disposable loopback DB only; no provider token means no real WhatsApp send.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.equal(process.env.PGDATABASE, 'restaurant_erp_dashrpt_qa_20261031');
const base = new URL(process.env.BASE_URL);
assert.equal(base.origin, 'http://127.0.0.1:4317');
assert.equal(process.env.CRON_SECRET, 'qa-low-stock-summary-only');
const pool = new Pool({ host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
let owned = false;
const q = (sql, values) => pool.query(sql, values);
async function call(secret) {
  const response = await fetch(base.origin + '/api/cron/daily-summary', { method: 'POST', headers: secret ? { authorization: 'Bearer ' + secret } : {}, signal: AbortSignal.timeout(15000) });
  return { status: response.status, data: await response.json() };
}
async function main() {
  assert.equal((await q('select current_database() as db')).rows[0].db, process.env.PGDATABASE);
  assert.equal((await q('select count(*)::int as n from branches')).rows[0].n, 0);
  assert.equal((await q("select count(*)::int as n from settings where key='CHATXFLOW_API_TOKEN'")).rows[0].n, 0, 'No token: provider sends must remain impossible');
  owned = true;
  await q("insert into branches(id,name,code,lat,lng) values ('qalow-a','QA Low A','QALOWA',0,0),('qalow-b','QA Low B','QALOWB',0,0)");
  await q("insert into users(id,name,phone_e164,role,branch_id,status) values ('qalow-ma','QA Manager A','+255712000001','BRANCH_MANAGER','qalow-a','Active'),('qalow-mb','QA Manager B','+255712000002','BRANCH_MANAGER','qalow-b','Active')");
  // The random session exists only in the verified disposable DB. Bind the
  // HTTP app to it before ANY cron request (including unauthorized probes).
  const token = crypto.randomBytes(32).toString('hex');
  await q("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [crypto.createHash('sha256').update(token).digest('hex'), 'qalow-ma']);
  const me = await fetch(base.origin + '/api/auth/me', {
    headers: { cookie: `restaurant_session=${token}` },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(me.status, 200, 'QA app is not bound to the approved disposable DB');
  assert.equal((await me.json())?.user?.id, 'qalow-ma', 'QA app is not bound to the approved disposable DB');
  for (const [i, qty, minimum] of [[0,'2','10'],[1,'10','10'],[2,'10','2'],[3,'-1','0']]) {
    await q('insert into raw_materials(id,name,unit) values ($1,$1,\'kg\')', ['qalow-'+i]);
    await q('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level) values ($1,\'qalow-a\',$1,$2,$3)', ['qalow-'+i,qty,minimum]);
  }
  await q("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level) values ('qalow-b-stock','qalow-b','qalow-0',20,10)");
  assert.equal((await call()).status, 401);
  assert.equal((await call('wrong')).status, 401);
  assert.equal((await q('select count(*)::int as n from daily_summary_log')).rows[0].n, 0);
  const first = await call(process.env.CRON_SECRET);
  assert.equal(first.status, 200);
  assert.equal(first.data.claimed, 2);
  assert.equal(first.data.notified, 0, 'No real provider configured');
  const messages = (await q("select to_phone,payload_json from whatsapp_message_log where related_entity_type='DAILY_SUMMARY'")).rows;
  assert.equal(messages.length, 2);
  assert.match(messages.find(r=>r.to_phone==='+255712000001').payload_json.message, /1 item\(s\) below minimum stock level/);
  assert.doesNotMatch(messages.find(r=>r.to_phone==='+255712000002').payload_json.message, /below minimum stock/);
  const second = await call(process.env.CRON_SECRET);
  assert.equal(second.data.claimed, 0);
  assert.equal(second.data.alreadySent, 2);
  assert.equal((await q('select count(*)::int as n from whatsapp_message_log')).rows[0].n, 2);
  console.log('PASS real cron HTTP + PostgreSQL: threshold boundary, branch isolation, auth and retry idempotency; zero external sends');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
  if (owned) {
    await q('truncate table branches, users, raw_materials, vendors, whatsapp_message_log cascade');
  }
  await pool.end();
});
