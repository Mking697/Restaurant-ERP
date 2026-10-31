// Explicit disposable loopback targets only. Proves upgrade, fresh install and replay.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.equal(process.env.COGS_DEFAULT_QA, 'approved-disposable-only');
const config = { host: '127.0.0.1', port: 5436, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false };
const admin = new Pool({ ...config, database: 'postgres' });
const folder = path.resolve('drizzle');
const journal = JSON.parse(fs.readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8'));
assert.equal(journal.entries.at(-1).tag, '0017_groovy_lizard');
const scratch = fs.mkdtempSync(path.join('C:/Users/hp/AppData/Local/hermes/cache/scratch', 'cogs-default-'));
fs.mkdirSync(path.join(scratch, 'meta'));
const prefix = { ...journal, entries: journal.entries.slice(0, -1) };
fs.writeFileSync(path.join(scratch, 'meta/_journal.json'), JSON.stringify(prefix));
for (const entry of prefix.entries) fs.copyFileSync(path.join(folder, entry.tag + '.sql'), path.join(scratch, entry.tag + '.sql'));
async function scenario(database, upgrade) {
  let created = false, pool;
  try {
    await admin.query('CREATE DATABASE ' + database);
    created = true;
    pool = new Pool({ ...config, database });
    assert.equal((await pool.query('select current_database() db')).rows[0].db, database);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: upgrade ? scratch : folder });
    await pool.query("insert into branches(id,name,code,lat,lng) values ('cqa-a','Cost QA A','CQA_A',0,0),('cqa-b','Cost QA B','CQA_B',0,0)");
    await pool.query("insert into users(id,name,phone_e164,role) values ('cqa-owner','Cost QA','+255712000009','SUPER_ADMIN')");
    async function insert(id, branch, amount, complete) {
      const columns = amount === undefined ? '' : ',cogs_amount,cogs_complete';
      const placeholders = amount === undefined ? '' : ',$3,$4';
      return (await pool.query(`insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,cashier_id${columns}) values ($1,$2,$1,'DINE_IN',100,100,'CASH','cqa-owner'${placeholders}) returning id,branch_id,cogs_amount,cogs_complete`, amount === undefined ? [id,branch] : [id,branch,amount,complete])).rows[0];
    }
    if (upgrade) {
      const omittedBefore = await insert('old-default','cqa-a');
      assert.equal(omittedBefore.cogs_complete, true, 'Reproduce original unsafe default');
      await insert('old-zero','cqa-a','0.00',true);
      await insert('old-priced','cqa-b','12.34',true);
      await insert('old-partial','cqa-b','3.21',false);
      const before = (await pool.query('select * from pos_orders order by id')).rows;
      // Mirror the existing production tracking watermark without changing old SQL.
      await pool.query('update drizzle.__drizzle_migrations set created_at=$1 where created_at=$2', ['1793530000000', String(prefix.entries.at(-1).when)]);
      await migrate(db, { migrationsFolder: folder });
      assert.deepEqual((await pool.query('select * from pos_orders order by id')).rows, before, 'No legacy cost/flag/identity may be rewritten');
    }
    const fallback = await insert('new-default','cqa-a');
    assert.equal(fallback.cogs_complete, false);
    assert.equal(fallback.cogs_amount, '0.00');
    assert.equal((await insert('captured-zero','cqa-a','0.00',true)).cogs_complete, true);
    assert.equal((await insert('captured-priced','cqa-b','24.56',true)).cogs_amount, '24.56');
    const beforeReplay = (await pool.query('select * from pos_orders order by id')).rows;
    const tracking = (await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by id')).rows;
    assert.equal(tracking.length, journal.entries.length);
    await migrate(db, { migrationsFolder: folder });
    assert.deepEqual((await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by id')).rows, tracking);
    assert.deepEqual((await pool.query('select * from pos_orders order by id')).rows, beforeReplay);
    console.log('PASS ' + (upgrade ? 'upgrade: original bug reproduced; 4 existing rows across 2 branches unchanged; new default false; captured zero/nonzero preserved; production watermark respected; replay no-op' : 'fresh install: default false; explicit captured costs allowed; replay no-op'));
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query('DROP DATABASE ' + database);
  }
}
(async()=>{
  try {
    await scenario('restaurant_erp_cogsdefault_upgrade_qa_20261031', true);
    await scenario('restaurant_erp_cogsdefault_fresh_qa_20261031', false);
  } finally {
    await admin.end();
    fs.rmSync(scratch, { recursive: true });
  }
})().catch(e=>{console.error(e);process.exitCode=1});
