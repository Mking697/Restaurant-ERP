require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = 'http://localhost:3000';
const ORIGIN = 'http://localhost:3000'; // matches .env APP_ORIGIN; dev server itself is on 3001 because 3000 was occupied
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branch: 'qa-bom-branch-1',
  owner: 'qa-bom-owner-1',
  chicken: 'qa-bom-mat-chicken',
  butter: 'qa-bom-mat-butter',
  tomato: 'qa-bom-mat-tomato',
  vendor: 'qa-bom-vendor-1',
};
const token = crypto.randomBytes(32).toString('hex');
let cookie;

async function req(method, path, bodyObj) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', cookie, origin: ORIGIN },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from bom_recipes where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from menu_items where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.chicken, ids.butter, ids.tomato]]);
  await pool.query(`delete from sessions where user_id = $1`, [ids.owner]);
  await pool.query(`delete from users where id = $1`, [ids.owner]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
}

async function main() {
  await cleanup(); // in case a previous run was interrupted
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA BOM Branch','QABOM1','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA BOM Owner','+919000000111','SUPER_ADMIN',null,'Active','{}')`, [ids.owner]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(token), ids.owner]);
  cookie = `restaurant_session=${token}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA Chicken','kg'),($2,'QA Butter','kg'),($3,'QA Tomato','kg')`, [ids.chicken, ids.butter, ids.tomato]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA Vendor','+919000000222')`, [ids.vendor]);
  await pool.query(`insert into vendor_rates (id, vendor_id, raw_material_id, rate) values ('qa-r1',$1,$2,'300.00'),('qa-r2',$1,$3,'500.00'),('qa-r3',$1,$4,'40.00')`, [ids.vendor, ids.chicken, ids.butter, ids.tomato]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  const dish = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA Butter Chicken', price: '280.00', isSemiFg: false });
  check('create dish 201', dish.status === 201, dish.json);
  const gravy = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA Butter Chicken Gravy', price: '0.00', isSemiFg: true });
  check('create semi-fg 201', gravy.status === 201, gravy.json);
  const dishId = dish.json?.menuItem?.id, gravyId = gravy.json?.menuItem?.id;

  const r1 = await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: dishId, componentType: 'RAW_MATERIAL', rawMaterialId: ids.chicken, componentMenuItemId: null, qtyPerUnit: '0.250' });
  check('dish+chicken row 201', r1.status === 201, r1.json);
  const r2 = await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: dishId, componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: gravyId, qtyPerUnit: '0.100' });
  check('dish+gravy(semi-fg) row 201', r2.status === 201, r2.json);
  const r3 = await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: gravyId, componentType: 'RAW_MATERIAL', rawMaterialId: ids.butter, componentMenuItemId: null, qtyPerUnit: '0.300' });
  check('gravy+butter row 201', r3.status === 201, r3.json);
  const r4 = await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: gravyId, componentType: 'RAW_MATERIAL', rawMaterialId: ids.tomato, componentMenuItemId: null, qtyPerUnit: '0.200' });
  check('gravy+tomato row 201', r4.status === 201, r4.json);

  const cycle = await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: gravyId, componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: gravyId, qtyPerUnit: '1.000' });
  check('direct self-reference rejected 409', cycle.status === 409, cycle.json);

  const marinade = await req('POST', '/api/menu-items', { branchId: ids.branch, name: 'QA Marinade', price: '0.00', isSemiFg: true });
  check('create 2nd semi-fg 201', marinade.status === 201, marinade.json);
  const marinadeId = marinade.json?.menuItem?.id;
  const link = await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: gravyId, componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: marinadeId, qtyPerUnit: '0.050' });
  check('gravy+marinade(semi-fg) row 201', link.status === 201, link.json);
  // marinade -> gravy would close gravy -> marinade -> gravy
  const indirectCycle = await req('POST', '/api/bom-recipes', { branchId: ids.branch, menuItemId: marinadeId, componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: gravyId, qtyPerUnit: '1.000' });
  check('indirect circular insert rejected 409', indirectCycle.status === 409, indirectCycle.json);

  const explode = await req('GET', `/api/bom-recipes/explode?menuItemId=${dishId}&qty=2`);
  check('explode 200', explode.status === 200, explode.json);
  const reqs = Object.fromEntries((explode.json?.requirements ?? []).map((r) => [r.rawMaterialId, r.qty]));
  check('chicken qty = 0.5', reqs[ids.chicken] === 0.5, reqs);
  check('butter qty = 0.06', Math.abs(reqs[ids.butter] - 0.06) < 1e-9, reqs);
  check('tomato qty = 0.04', Math.abs(reqs[ids.tomato] - 0.04) < 1e-9, reqs);
  check('estimated cost = 181.6 (2x 90.8)', explode.json?.estimatedCost === 181.6, explode.json?.estimatedCost);

  const del = await req('DELETE', `/api/bom-recipes/${r1.json.bomRecipe.id}`);
  check('delete row 200', del.status === 200, del.json);
  const explode2 = await req('GET', `/api/bom-recipes/explode?menuItemId=${dishId}&qty=1`);
  check('chicken absent after delete', !('chicken' in Object.fromEntries((explode2.json?.requirements ?? []).map((r) => [r.rawMaterialId, r.qty]))), explode2.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
