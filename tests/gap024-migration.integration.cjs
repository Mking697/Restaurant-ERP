// GAP-024 migration acceptance. Hard local-only target; never reads app secrets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { readMigrationFiles } = require('drizzle-orm/migrator');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5441');
assert.equal(process.env.PGDATABASE, 'restaurant_erp_gap024_qa_20261104');
const config = { host:'127.0.0.1',port:5441,user:'postgres',password:'',ssl:false };
const database = process.env.PGDATABASE;
const freshName = 'restaurant_erp_gap024_fresh_qa_20261104';
let assertions = 0;
function check(label,actual,expected) { assert.deepEqual(actual,expected,label);assertions++;console.log('PASS',label); }
async function ledger(pool) { return (await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by created_at,id')).rows.map(row=>[row.hash,Number(row.created_at)]); }
async function fingerprint(pool) {
 return {
  orders:(await pool.query("select id,branch_id,order_number,status,subtotal,total_amount,cogs_amount,cogs_complete,stock_deducted_at,settled_at,created_at from pos_orders where id like 'g24-migration-%' order by id")).rows,
  lines:(await pool.query("select * from pos_order_lines where id like 'g24-migration-%' order by id")).rows,
  tickets:(await pool.query("select id,order_id,branch_id,station,ticket_number,created_at from pos_production_tickets where id like 'g24-migration-%' order by id")).rows,
  ticketLines:(await pool.query("select * from pos_production_ticket_lines where id like 'g24-migration-%' order by id")).rows,
 };
}
async function main() {
 const pool=new Pool({...config,database});const admin=new Pool({...config,database:'postgres'});let fresh;let createdFresh=false;let seeded=false;
 try {
  const files=readMigrationFiles({migrationsFolder:'./drizzle'});
  const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
  check('candidate is exactly one additive migration after GAP-023',files.length,40);
  check('guarded local database identity',(await pool.query('select current_database() as name')).rows[0].name,database);
  check('upgrade starts with exact 39 ordered hashes/timestamps',await ledger(pool),files.slice(0,39).map(f=>[f.hash,f.folderMillis]));
  check('candidate timestamp advances watermark',journal.entries.at(-1).when>journal.entries.at(-2).when,true);
  await pool.query("insert into branches(id,code,name,lat,lng) values('g24-migration-branch','G24MIG','Disposable GAP-024 migration QA',0,0)");seeded=true;
  await pool.query("insert into users(id,name,phone_e164,role,module_access) values('g24-migration-owner','Disposable GAP-024 migration owner','G24-MIGRATION-LOCAL-ONLY','SUPER_ADMIN',ARRAY['POS_CASHIER'])");
  await pool.query("insert into menu_items(id,branch_id,name,price) values('g24-migration-menu','g24-migration-branch','Original old item',12.34)");
  await pool.query("insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,status,cashier_id,created_at,cogs_amount,cogs_complete) values('g24-migration-paid','g24-migration-branch','G24-OLD-PAID','DINE_IN',12.34,12.34,'CASH','COMPLETED','g24-migration-owner','2026-10-01T12:00:00Z',2.34,true),('g24-migration-open','g24-migration-branch','G24-OLD-OPEN','DINE_IN',12.34,12.34,'','OPEN','g24-migration-owner','2026-10-02T12:00:00Z',2.34,true)");
  await pool.query("insert into pos_order_lines(id,order_id,menu_item_id,qty,price) values('g24-migration-line','g24-migration-open','g24-migration-menu',1,12.34)");
  await pool.query("insert into pos_production_tickets(id,order_id,branch_id,station,ticket_number,created_at) values('g24-migration-ticket','g24-migration-open','g24-migration-branch','KITCHEN','KOT-G24-OLD','2026-10-02T12:00:00Z')");
  await pool.query("insert into pos_production_ticket_lines(id,ticket_id,order_line_id) values('g24-migration-ticket-line','g24-migration-ticket','g24-migration-line')");
  const before=await fingerprint(pool);
  const beforeTables=(await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename);
  await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});
  check('legacy financial/stock/line/ticket fingerprint is unchanged',await fingerprint(pool),before);
  check('legacy order preparation is not invented',(await pool.query("select service_status,revision,closed_at from pos_orders where id like 'g24-migration-%' order by id")).rows,[{service_status:'LEGACY',revision:1,closed_at:null},{service_status:'LEGACY',revision:1,closed_at:null}]);
  check('legacy missing print snapshot is not fabricated',(await pool.query("select status,revision,snapshot_lines from pos_production_tickets where id='g24-migration-ticket'")).rows,[{status:'SENT',revision:1,snapshot_lines:null}]);
  await pool.query("update menu_items set name='Renamed today',price=999 where id='g24-migration-menu'");
  check('catalog change still does not fabricate a historical snapshot',(await pool.query("select snapshot_lines from pos_production_tickets where id='g24-migration-ticket'")).rows[0].snapshot_lines,null);
  const afterTables=(await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename);
  const added=afterTables.filter(t=>!beforeTables.includes(t));
  check('migration adds lifecycle storage without deleting existing tables',added.length>=2 && beforeTables.every(t=>afterTables.includes(t)),true);
  for(const table of added) { assert.match(table,/^pos_[a-z_]+$/);check('no fabricated business records in '+table,(await pool.query('select count(*)::int as n from "'+table+'"')).rows[0].n,0); }
  const expected=files.map(f=>[f.hash,f.folderMillis]);check('upgraded ordered lineage',await ledger(pool),expected);
  await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});check('second migration is exact no-op',await ledger(pool),expected);
  await admin.query('CREATE DATABASE '+freshName);createdFresh=true;fresh=new Pool({...config,database:freshName});
  await migrate(drizzle(fresh),{migrationsFolder:'./drizzle'});check('fresh full-chain ordered lineage',await ledger(fresh),expected);
  const snapshot=JSON.parse(fs.readFileSync(path.join('drizzle','meta',String(journal.entries.at(-1).idx).padStart(4,'0')+'_snapshot.json'),'utf8'));
  const expectedTables=Object.values(snapshot.tables).map(t=>t.name).sort();
  check('fresh full-chain tables match generated snapshot',(await fresh.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename),expectedTables);
  check('fresh lifecycle table is empty',(await fresh.query('select count(*)::int as n from pos_production_tickets')).rows[0].n,0);
  console.log('GAP-024 migration acceptance:',assertions,'assertions passed; fresh, legacy upgrade, ordered lineage and no-op. Production not accessed.');
 }finally{
  if(seeded){
   await pool.query("delete from pos_production_ticket_lines where id like 'g24-migration-%'");
   await pool.query("delete from pos_production_tickets where id like 'g24-migration-%'");
   await pool.query("delete from pos_order_lines where id like 'g24-migration-%'");
   await pool.query("delete from pos_orders where id like 'g24-migration-%'");
   await pool.query("delete from menu_items where id='g24-migration-menu'");
   await pool.query("delete from users where id='g24-migration-owner'");
   await pool.query("delete from branches where id='g24-migration-branch'");
  }
  await pool.end();if(fresh)await fresh.end();if(createdFresh)await admin.query('DROP DATABASE '+freshName);await admin.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
