// Parent-run only: migrated disposable QA DB + app bound to that exact DB.
// PGDATABASE=restaurant_erp_recipe_qa_YYYYMMDD SEMI_FG_QA_DATABASE=<same>
// BASE_URL=http://127.0.0.1:<dedicated-port> node tests/semi-fg.integration.cjs
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5436');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_(recipe|semi_fg)_qa_\d{8}$/);
assert.equal(process.env.SEMI_FG_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:' && target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash);
const pool = new Pool({ host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
const id = () => randomUUID();
const a = id(), b = id(), owner = id(), staff = id(), cashier = id(), raw = id(), salt = id(), gravy = id(), nested = id(), dish = id(), empty = id(), foreign = id(), rawDish = id();
const branchIds = [a, b], userIds = [owner, staff, cashier], menuIds = [gravy, nested, dish, empty, foreign, rawDish];
const token = () => randomBytes(32).toString('hex');
const ot = token(), st = token(), ct = token();
const cookie = t => 'restaurant_session=' + t;
let checks = 0;
function pass(name) { checks++; console.log('PASS ' + name); }
async function request(path, t = ot, method = 'GET', input, expected = 200) {
 const response = await fetch(target.origin + path, { method, headers: { origin: target.origin, 'content-type': 'application/json', ...(t ? { cookie: cookie(t) } : {}) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
 const data = await response.json();
 if (expected !== null) assert.equal(response.status, expected, path + ': ' + JSON.stringify(data));
 else assert.ok([200,201].includes(response.status), path + ': ' + JSON.stringify(data));
 return data;
}
const production = (menuItemId, quantity, key = id(), branchId = a) => ({ branchId, menuItemId, quantity, idempotencyKey: key });
const order = (menuItemId = dish, qty = 1) => ({ branchId: a, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId, qty }] });
async function stock() {
 const r = (await pool.query('select raw_material_id,qty_on_hand from inventory_stock where branch_id=$1 order by raw_material_id', [a])).rows;
 const s = (await pool.query('select menu_item_id,qty_on_hand from semi_fg_stock where branch_id=$1 order by menu_item_id', [a])).rows;
 const n = (await pool.query('select count(*)::int n from semi_fg_productions where branch_id=$1', [a])).rows[0].n;
 const o = (await pool.query('select count(*)::int n from pos_orders where branch_id=$1', [a])).rows[0].n;
 return { r, s, n, o };
}
async function recipe(menu, type, component, qty) {
 await pool.query('insert into bom_recipes(id,branch_id,menu_item_id,component_type,raw_material_id,component_menu_item_id,qty_per_unit) values($1,$2,$3,$4,$5,$6,$7)', [id(), a, menu, type, type === 'RAW_MATERIAL' ? component : null, type === 'SEMI_FG' ? component : null, qty]);
}
(async () => {
 try {
  assert.equal((await pool.query('select current_database() db')).rows[0].db, process.env.SEMI_FG_QA_DATABASE);
  for (const [uid, role, grants, t] of [[owner, 'SUPER_ADMIN', [], ot], [staff, 'KITCHEN_STAFF', ['MENU_BOM'], st], [cashier, 'CASHIER', ['POS_CASHIER'], ct]]) {
   await pool.query('insert into users(id,name,phone_e164,role,branch_id,password_hash,module_access) values($1,$2,$3,$4,null,$5,$6)', [uid, 'Semi-FG QA ' + uid, '+919' + String(BigInt('0x' + uid.replaceAll('-', '').slice(0, 12)) % 1000000000n).padStart(9, '0'), role, 'qa-no-password-login', grants]);
   await pool.query('insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval \'1 hour\')', [createHash('sha256').update(t).digest('hex'), uid]);
  }
  // Binds HTTP to our guarded DB BEFORE issuing any domain API mutations.
  assert.equal((await request('/api/auth/me')).user.id, owner);
  for (const branch of branchIds) await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0)', [branch, 'Semi-FG QA ' + branch]);
  await pool.query('update users set branch_id=$1 where id=any($2::text[])', [a, [staff, cashier]]);
  await pool.query('insert into raw_materials(id,name,unit) values($1,$2,\'kg\'),($3,$4,\'kg\')', [raw, 'QA flour ' + raw, salt, 'QA salt ' + salt]);
  for (const material of [raw, salt]) await pool.query('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,10)', [id(), a, material]);
  for (const [mid, bid, semi, sellable] of [[gravy,a,true,false], [nested,a,true,false], [dish,a,false,true], [empty,a,true,true], [foreign,b,true,false], [rawDish,a,false,true]]) await pool.query('insert into menu_items(id,branch_id,name,price,is_semi_fg,is_sellable,output_unit) values($1,$2,$1,100,$3,$4,\'kg\')', [mid,bid,semi,sellable]);
  await recipe(gravy, 'RAW_MATERIAL', raw, '0.200');
  await recipe(nested, 'SEMI_FG', gravy, '0.500');
  await recipe(nested, 'RAW_MATERIAL', salt, '0.100');
  await recipe(dish, 'SEMI_FG', gravy, '0.250');
  await recipe(dish, 'RAW_MATERIAL', salt, '0.050');
  await recipe(rawDish, 'RAW_MATERIAL', raw, '0.100');
  await request('/api/semi-fg/production', '', 'POST', production(gravy, '1'), 401);
  await request('/api/semi-fg/production', ct, 'POST', production(gravy, '1'), 403);
  await request('/api/semi-fg/production?branchId=' + b, st, 'GET', undefined, 403);
  await request('/api/semi-fg/production', st, 'POST', production(gravy, '1', id(), b), 403);
  await request('/api/semi-fg/production', st, 'POST', production(foreign, '1'), 400);
  await request('/api/semi-fg/production', st, 'POST', production(dish, '1'), 400);
  const csrf = await fetch(target.origin + '/api/semi-fg/production', { method: 'POST', headers: { cookie: cookie(st), origin: 'http://evil.test', 'content-type': 'application/json' }, body: JSON.stringify(production(gravy,'1')) });
  assert.equal(csrf.status,403); pass('authentication, grants, branch/foreign IDs, non-Semi-FG and CSRF fail closed');
  const initial = await stock();
  await request('/api/semi-fg/production', st, 'POST', production(nested, '1'), 409);
  await request('/api/semi-fg/production', st, 'POST', production(empty, '1'), 409);
  await request('/api/pos/orders', ct, 'POST', order(empty), 409);
  assert.deepEqual(await stock(), initial); pass('nested Semi-FG requires produced stock; missing recipes reject with no writes');
  const key = id(), payload = production(gravy, '10', key);
  const first = await request('/api/semi-fg/production', st, 'POST', payload, 201);
  assert.equal(first.production.quantity, '10.000');
  assert.equal(first.production.snapshot.unit, 'kg');
  assert.equal(first.production.snapshot.inventoryDeducted[0].qtyDeducted, '2.000');
  const afterProduction = await stock();
  assert.equal(afterProduction.r.find(x=>x.raw_material_id===raw).qty_on_hand,'8.000');
  assert.equal(afterProduction.s.find(x=>x.menu_item_id===gravy).qty_on_hand,'10.000');
  const replay = await request('/api/semi-fg/production', st, 'POST', {...payload, quantity:'10.000'});
  assert.deepEqual(replay.production, first.production); assert.equal(replay.replayed,true);
  await request('/api/semi-fg/production', st, 'POST', {...payload,quantity:'9'},409);
  assert.deepEqual(await stock(), afterProduction); pass('production consumes raw, credits Semi-FG and idempotent replay never writes twice');
  const sale = await request('/api/pos/orders', ct, 'POST', order(dish,2), 201);
  assert.deepEqual(sale.inventoryDeducted,[{rawMaterialId:salt,qtyDeducted:0.1}]);
  assert.deepEqual(sale.semiFgDeducted,[{menuItemId:gravy,qtyDeducted:0.5}]);
  assert.equal((await stock()).r.find(x=>x.raw_material_id===raw).qty_on_hand,'8.000');
  assert.equal((await stock()).s.find(x=>x.menu_item_id===gravy).qty_on_hand,'9.500');
  pass('POS consumes direct raw and stocked Semi-FG without double-consuming embedded raw');
  const rawOnly = await request('/api/pos/orders',ct,'POST',order(rawDish),201);
  assert.deepEqual(rawOnly.inventoryDeducted,[{rawMaterialId:raw,qtyDeducted:0.1}]); assert.deepEqual(rawOnly.semiFgDeducted,[]); assert.ok(rawOnly.kot && rawOnly.receipt && rawOnly.order);
  pass('raw-only POS retains receipt/KOT and numeric inventoryDeducted compatibility');
  await request('/api/semi-fg/production',st,'POST',production(nested,'2'),201);
  assert.equal((await stock()).s.find(x=>x.menu_item_id===nested).qty_on_hand,'2.000');
  pass('nested production consumes direct Semi-FG and direct raw, not recursive raw');
  const beforeShort = await stock();
  await request('/api/semi-fg/production',st,'POST',production(gravy,'500'),409);
  await request('/api/pos/orders',ct,'POST',order(dish,500),409);
  assert.deepEqual(await stock(), beforeShort); pass('shortages roll back every stock row, production and order');
  await pool.query('update menu_items set is_active=false where id=$1',[gravy]);
  await request('/api/semi-fg/production',st,'POST',production(gravy,'1'),400);
  await request('/api/pos/orders',ct,'POST',order(),400);
  const historical = await request('/api/semi-fg/production',st,'POST',payload);
  assert.deepEqual(historical.production,first.production);
  await pool.query('update menu_items set is_active=true,name=\'changed\',output_unit=\'ltr\' where id=$1',[gravy]);
  await pool.query('update bom_recipes set qty_per_unit=0.300 where menu_item_id=$1',[gravy]);
  assert.deepEqual((await request('/api/semi-fg/production',st,'POST',payload)).production,first.production);
  pass('inactive components rejected; immutable replay survives recipe/name/unit changes');
  const history = await request('/api/semi-fg/production?branchId='+a,st);
  assert.ok(history.stock.some(x=>x.menuItemId===gravy && x.unit==='ltr'));
  assert.ok(history.productions.some(x=>x.id===first.production.id && x.snapshot.unit==='kg'));
  pass('branch-scoped stock and recent immutable production history read back');
  const concurrentKey = id();
  // One concurrent caller gets 201 (created), the other 200 (replayed) once the
  // advisory lock serializes them — pass expected=null for the accept-either path.
  const pair = await Promise.all([1,2].map(()=>request('/api/semi-fg/production',st,'POST',production(gravy,'1',concurrentKey),null).catch(e=>{throw e;})));
  assert.equal(pair[0].production.id,pair[1].production.id);
  console.log('RESULT '+checks+' real HTTP/Postgres checks passed');
 } finally {
  await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id=any($1::text[]))',[branchIds]);
  await pool.query('delete from pos_orders where branch_id=any($1::text[])',[branchIds]);
  await pool.query('delete from semi_fg_productions where branch_id=any($1::text[])',[branchIds]);
  await pool.query('delete from semi_fg_stock where branch_id=any($1::text[])',[branchIds]);
  await pool.query('delete from bom_recipes where branch_id=any($1::text[])',[branchIds]);
  await pool.query('delete from menu_items where id=any($1::text[])',[menuIds]);
  await pool.query('delete from inventory_stock where branch_id=any($1::text[])',[branchIds]);
  await pool.query('delete from raw_materials where id=any($1::text[])',[[raw,salt]]);
  await pool.query('delete from sessions where user_id=any($1::text[])',[userIds]);
  await pool.query('delete from users where id=any($1::text[])',[userIds]);
  await pool.query('delete from branches where id=any($1::text[])',[branchIds]);
  await pool.end();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
