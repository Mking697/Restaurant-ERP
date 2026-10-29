// Explicit local QA-only browser fixtures. Never accepts shared or production DBs.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const database = 'restaurant_erp_dashrpt_qa_20261028';
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.equal(process.env.PGDATABASE, database);
const statePath = path.join(process.env.TMPDIR, 'restaurant-takeover-browser.json');
const pool = new Pool({ host: '127.0.0.1', port: 5436, database, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
async function main() {
  assert.equal((await pool.query('select current_database() db')).rows[0].db, database);
  if (process.argv[2] === 'create') {
    assert.equal(Number((await pool.query('select count(*) n from branches')).rows[0].n), 0, 'Existing fixtures must not be overwritten');
    await pool.query("insert into branches(id,name,code,lat,lng) values ('takeover-a','QA Takeover A','TAKEOVERA',0,0),('takeover-b','QA Takeover B','TAKEOVERB',0,0)");
    await pool.query("insert into users(id,name,phone_e164,role,branch_id,module_access) values ('takeover-owner','QA Takeover Owner','+919000000891','SUPER_ADMIN',null,'{}'),('takeover-staff','QA Takeover Staff','+919000000892','BRANCH_MANAGER','takeover-a','{DASHBOARD_OWNER,REPORTS,MIS_PERFORMANCE,INVENTORY,AGGREGATOR_RECON}')");
    const tokens = {};
    for (const who of ['owner', 'staff']) {
      tokens[who] = randomBytes(32).toString('hex');
      await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(tokens[who]).digest('hex'), 'takeover-'+who]);
    }
    await pool.query("insert into task_instances(id,branch_id,type,title,assigned_to_id,due_at,status,completed_at) values ('takeover-task','takeover-a','RECURRING','QA Finished task','takeover-staff',now()-interval '2 days','DONE',now()-interval '3 days')");
    for (const [id, branch, amount, hidden] of [['sale','a','123.00',false], ['private','a','456.00',true], ['other','b','789.00',false]]) await pool.query("insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,cashier_id,status,owner_only) values($1,$2,$1,'DINE_IN',$3,$3,'UPI','takeover-owner','COMPLETED',$4)", ['takeover-'+id, 'takeover-'+branch, amount, hidden]);
    fs.writeFileSync(statePath, JSON.stringify(tokens));
    console.log('Disposable browser fixtures created; session tokens saved privately to scratch.');
  } else if (process.argv[2] === 'cleanup') {
    await pool.query("delete from mis_scores where branch_id in ('takeover-a','takeover-b')");
    await pool.query("delete from task_instances where id='takeover-task'");
    await pool.query("delete from pos_orders where id in ('takeover-sale','takeover-private','takeover-other')");
    await pool.query("delete from sessions where user_id in ('takeover-owner','takeover-staff')");
    await pool.query("delete from users where id in ('takeover-owner','takeover-staff')");
    await pool.query("delete from branches where id in ('takeover-a','takeover-b')");
    assert.equal(Number((await pool.query("select count(*) n from branches where id in ('takeover-a','takeover-b')")).rows[0].n), 0);
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
    console.log('Exact browser fixtures removed and absence verified.');
  } else throw new Error('Use create or cleanup');
}
main().catch(e => { console.error(e); process.exitCode=1; }).finally(()=>pool.end());
