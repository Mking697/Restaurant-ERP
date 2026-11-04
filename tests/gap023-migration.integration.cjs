// Explicitly isolated PostgreSQL only; no app secrets or production access.
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { readMigrationFiles } = require('drizzle-orm/migrator');
const fs = require('node:fs');
const path = require('node:path');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5440');
assert.equal(process.env.PGDATABASE, 'restaurant_erp_gap023_qa_20261103');
const config = { host: '127.0.0.1', port: 5440, user: 'postgres', password: '', ssl: false };
const database = process.env.PGDATABASE;
const freshName = 'restaurant_erp_gap023_fresh_qa_20261103';
const files = readMigrationFiles({ migrationsFolder: './drizzle' });
const journal = JSON.parse(fs.readFileSync(path.join('drizzle', 'meta', '_journal.json'), 'utf8'));
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); console.log('PASS', name); };
async function ledger(pool) {
  return (await pool.query('select hash,created_at from drizzle.__drizzle_migrations order by created_at,id')).rows.map(row => [row.hash, Number(row.created_at)]);
}
async function main() {
  const pool = new Pool({ ...config, database });
  const admin = new Pool({ ...config, database: 'postgres' });
  let fresh;
  let createdFresh = false;
  try {
    check('guarded target identity', (await pool.query('select current_database() as name')).rows[0].name, database);
    check('upgrade starts at exact 38-migration prefix', await ledger(pool), files.slice(0, 38).map(file => [file.hash, file.folderMillis]));
    check('new migration timestamp is forward', journal.entries.at(-1).when > journal.entries.at(-2).when, true);
    await pool.query("insert into branches(id,code,name,lat,lng) values ('g23-legacy-b1','G23LEG1','Legacy QA One',0,0),('g23-legacy-b2','G23LEG2','Legacy QA Two',0,0)");
    await pool.query("insert into users(id,name,phone_e164,role,module_access) values('g23-legacy-owner','Legacy QA Owner','+255600002301','SUPER_ADMIN',ARRAY['POS_CASHIER'])");
    await pool.query("insert into menu_items(id,branch_id,name,price) values('g23-legacy-menu','g23-legacy-b1','Legacy Dish',12.34)");
    await pool.query("insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,status,cashier_id,created_at,cogs_amount,cogs_complete) values('g23-legacy-sale','g23-legacy-b1','LEGACY-1','DINE_IN',12.34,12.34,'CASH','COMPLETED','g23-legacy-owner','2026-10-01T12:00:00Z',2.34,true),('g23-legacy-void','g23-legacy-b2','LEGACY-2','TAKEAWAY',7.89,7.89,'CARD','VOIDED','g23-legacy-owner','2026-10-02T12:00:00Z',1.23,false)");
    await pool.query("insert into pos_order_lines(id,order_id,menu_item_id,qty,price) values('g23-legacy-line','g23-legacy-sale','g23-legacy-menu',1,12.34)");
    const before = (await pool.query("select id,branch_id,order_number,status,subtotal,total_amount,cogs_amount,cogs_complete,created_at from pos_orders where id like 'g23-legacy-%' order by id")).rows;
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    check('legacy sales and void financial fingerprint preserved', (await pool.query("select id,branch_id,order_number,status,subtotal,total_amount,cogs_amount,cogs_complete,created_at from pos_orders where id like 'g23-legacy-%' order by id")).rows, before);
    check('legacy branches default FAST_FOOD', (await pool.query("select operating_concept from branches where id like 'g23-legacy-%' order by id")).rows.map(row => row.operating_concept), ['FAST_FOOD', 'FAST_FOOD']);
    check('legacy item defaults KITCHEN', (await pool.query("select production_station from menu_items where id='g23-legacy-menu'")).rows[0].production_station, 'KITCHEN');
    check('legacy tax snapshot remains unknown', (await pool.query("select vat_rate_percent from pos_order_lines where id='g23-legacy-line'")).rows[0].vat_rate_percent, null);
    check('legacy posting timestamps not fabricated', (await pool.query("select stock_deducted_at,settled_at from pos_orders where id='g23-legacy-sale'")).rows[0], { stock_deducted_at: null, settled_at: null });
    for (const table of ['pos_order_attempts', 'pos_production_tickets', 'pos_production_ticket_lines', 'pos_receipts']) check('no fabricated business rows in ' + table, (await pool.query('select count(*)::int as n from ' + table)).rows[0].n, 0);
    await pool.query("insert into pos_orders(id,branch_id,order_number,channel,subtotal,total_amount,tender_type,status,cashier_id) values('g23-new-open','g23-legacy-b1','NEW-OPEN','DINE_IN',1,1,'','OPEN','g23-legacy-owner'),('g23-new-paid','g23-legacy-b1','NEW-PAID','DINE_IN',1,1,'CASH','PAID','g23-legacy-owner')");
    check('new OPEN and PAID values accepted after commit', (await pool.query("select status from pos_orders where id in ('g23-new-open','g23-new-paid') order by id")).rows.map(row => row.status), ['OPEN', 'PAID']);
    const expectedLedger = files.map(file => [file.hash, file.folderMillis]);
    check('upgrade exact ordered migration lineage', await ledger(pool), expectedLedger);
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    check('second migrate is a no-op', await ledger(pool), expectedLedger);
    await admin.query('CREATE DATABASE ' + freshName);
    createdFresh = true;
    fresh = new Pool({ ...config, database: freshName });
    await migrate(drizzle(fresh), { migrationsFolder: './drizzle' });
    check('fresh full chain ordered lineage', await ledger(fresh), expectedLedger);
    check('fresh full install table count', (await fresh.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 87);
    console.log('Migration acceptance complete: fresh install, legacy upgrade, no-op replay. Production lineage not accessed or claimed.');
  } finally {
    await pool.query("delete from pos_order_lines where id='g23-legacy-line'").catch(() => {});
    await pool.query("delete from pos_orders where id like 'g23-legacy-%' or id in ('g23-new-open','g23-new-paid')").catch(() => {});
    await pool.query("delete from menu_items where id='g23-legacy-menu'").catch(() => {});
    await pool.query("delete from users where id='g23-legacy-owner'").catch(() => {});
    await pool.query("delete from branches where id in ('g23-legacy-b1','g23-legacy-b2')").catch(() => {});
    await pool.end();
    if (fresh) await fresh.end();
    if (createdFresh) await admin.query('DROP DATABASE ' + freshName);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
