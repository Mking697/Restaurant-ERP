// Parent-run only. No dotenv fallback; every target is explicit.
// PGHOST=127.0.0.1 PGPORT=5436 PGDATABASE=restaurant_erp_branch_clone_qa_20261030
// PGUSER=<qa-user> PGPASSWORD=<qa-secret> BASE_URL=http://127.0.0.1:<dedicated-port>
// node tests/branch-clone.integration.cjs
// Synthetic opaque sessions test downstream live authentication, NOT login UI.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
function guard(env) {
  assert.equal(env.PGHOST, '127.0.0.1', 'Only approved loopback QA database');
  assert.equal(env.PGPORT, '5436');
  assert.equal(env.PGDATABASE, 'restaurant_erp_branch_clone_qa_20261030');
  assert.ok(env.PGUSER && typeof env.PGPASSWORD === 'string', 'Explicit QA credentials required');
  assert.ok(env.BASE_URL, 'Explicit dedicated QA app required');
  const target = new URL(env.BASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname) && target.protocol === 'http:' && target.port && target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash, 'Dedicated loopback HTTP origin only');
  return target;
}
module.exports = { guard };

async function main() {
  const target = guard(process.env);
  const { Pool } = require('pg');
  const pool = new Pool({ host: '127.0.0.1', port: 5436, database: 'restaurant_erp_branch_clone_qa_20261030', user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
  const ids = Object.fromEntries(['source', 'owner', 'admin', 'dish', 'gravy', 'rawMaterial', 'bomSemiFg', 'bomRaw', 'templateStep1', 'templateStep2', 'globalTemplateStep'].map(k => [k, randomUUID()]));
  const cookies = {}; let checks = 0, verifiedDb = false, failure;
  const pass = (name) => { checks++; console.log('PASS ' + name); };
  const request = async (path, actor = 'owner', method = 'GET', body) => {
    const response = await fetch(target.origin + path, {
      method, redirect: 'error',
      headers: { origin: target.origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(actor ? { cookie: cookies[actor] } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json(); return { status: response.status, data };
  };
  const expect = async (path, actor, method, body, status) => { const r = await request(path, actor, method, body); assert.equal(r.status, status, JSON.stringify(r)); return r.data; };
  async function identity(label, role, branch) {
    const token = randomBytes(32).toString('hex');
    const phone = '+919' + String(BigInt('0x' + randomBytes(6).toString('hex')) % BigInt(1000000000)).padStart(9, '0');
    await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)', [ids[label], 'Branch clone QA ' + label + ' ' + ids.source, phone, role, branch, []]);
    await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), ids[label]]);
    cookies[label] = 'restaurant_session=' + token;
  }
  const countsOf = async (table, column, value) => (await pool.query(`select count(*)::int n from "${table}" where "${column}"=$1`, [value])).rows[0].n;
  async function cleanup(newBranchId) {
    // Exact random fixture IDs only, ordered child -> parent. No blanket cleanup.
    if (newBranchId) {
      await pool.query('delete from bom_recipes where branch_id=$1', [newBranchId]);
      await pool.query('delete from checklist_templates where branch_id=$1', [newBranchId]);
      await pool.query('delete from menu_items where branch_id=$1', [newBranchId]);
      await pool.query('delete from branches where id=$1', [newBranchId]);
    }
    await pool.query('delete from bom_recipes where branch_id=$1', [ids.source]);
    await pool.query('delete from checklist_templates where branch_id=$1 or template_id=$1 or template_id=$2', [ids.source, ids.source + '-global']);
    await pool.query('delete from menu_items where branch_id=$1', [ids.source]);
    await pool.query('delete from raw_materials where id=$1', [ids.rawMaterial]);
    await pool.query('delete from sessions where user_id=any($1::text[])', [[ids.owner, ids.admin]]);
    await pool.query('delete from users where id=any($1::text[])', [[ids.owner, ids.admin]]);
    await pool.query('delete from branches where id=$1', [ids.source]);
    for (const [table, column, value] of [['users', 'id', ids.owner], ['raw_materials', 'id', ids.rawMaterial], ['branches', 'id', ids.source]]) {
      assert.equal(await countsOf(table, column, value), 0, 'cleanup readback ' + table);
    }
  }
  let createdBranchId;
  const sourceCode = 'QASRC' + ids.source.slice(0, 6);
  try {
    assert.equal((await pool.query('select current_database() db')).rows[0].db, 'restaurant_erp_branch_clone_qa_20261030'); verifiedDb = true;
    await pool.query('insert into branches(id,code,name,lat,lng) values($1,$2,$1,0,0)', [ids.source, sourceCode]);
    await identity('owner', 'SUPER_ADMIN', null);
    await identity('admin', 'BRANCH_MANAGER', ids.source);
    const marker = await expect('/api/branches/' + ids.source, 'owner', 'GET', undefined, 200);
    assert.equal(marker.branch.id, ids.source);
    pass('app identity bound to random fixture in exact guarded QA database');

    await expect('/api/branches/clone', null, 'POST', { sourceBranchId: ids.source, code: 'QACLONE1', name: 'QA Clone', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }, 401);
    await expect('/api/branches/clone', 'admin', 'POST', { sourceBranchId: ids.source, code: 'QACLONE1', name: 'QA Clone', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }, 403);
    pass('anonymous and non-Owner branch admin cannot clone');

    await expect('/api/branches/clone', 'owner', 'POST', { sourceBranchId: randomUUID(), code: 'QACLONE1', name: 'QA Clone', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }, 404);
    pass('missing source branch returns 404, no branch row created');

    // Seed source branch content: dish + semi-FG gravy + raw material + global checklist (must NOT be copied).
    await pool.query("insert into raw_materials(id,name,unit) values($1,'QA Tomato QA','kg')", [ids.rawMaterial]);
    await pool.query("insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Butter Chicken','portion',250,false,true)", [ids.dish, ids.source]);
    await pool.query("insert into menu_items(id,branch_id,name,output_unit,price,is_semi_fg,is_sellable) values($1,$2,'QA Gravy','kg',0,true,false)", [ids.gravy, ids.source]);
    await pool.query("insert into bom_recipes(id,branch_id,menu_item_id,component_type,component_menu_item_id,qty_per_unit,locked_by_hq) values($1,$2,$3,'SEMI_FG',$4,1,true)", [ids.bomSemiFg, ids.source, ids.dish, ids.gravy]);
    await pool.query("insert into bom_recipes(id,branch_id,menu_item_id,component_type,raw_material_id,qty_per_unit,locked_by_hq) values($1,$2,$3,'RAW_MATERIAL',$4,2.5,false)", [ids.bomRaw, ids.source, ids.gravy, ids.rawMaterial]);
    await pool.query("insert into checklist_templates(template_id,branch_id,template_name,step_no,step_name,next_step_map) values($1,$2,'QA Opening',1,'Step1','{\"Pass\":\"2\"}'),($1,$2,'QA Opening',2,'Step2',null)", [ids.source, ids.source]);
    await pool.query("insert into checklist_templates(template_id,branch_id,template_name,step_no,step_name) values($1,null,'QA Global',1,'G1')", [ids.source + '-global']);
    pass('seeded source branch menu/recipe/checklist/global fixtures');

    const duplicateAttempt = await expect('/api/branches/clone', 'owner', 'POST', { sourceBranchId: ids.source, code: sourceCode, name: 'Dup Code', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }, 409);
    assert.equal(await countsOf('branches', 'code', sourceCode), 1);
    assert.equal(await countsOf('menu_items', 'name', 'QA Butter Chicken'), 1); // no second copy attempt landed
    pass('duplicate code 409 with no partial writes (rollback proven via exact readback)');

    const cloned = await expect('/api/branches/clone', 'owner', 'POST', { sourceBranchId: ids.source, code: 'QACLONE2', name: 'QA Clone Branch', address: '', lat: 1, lng: 1, geofenceRadiusM: 75 }, 201);
    createdBranchId = cloned.branch.id;
    assert.equal(cloned.branch.clonedFromId, ids.source);
    assert.equal(cloned.branch.isTemplate, false);
    assert.deepEqual(cloned.copied, { menuItems: 2, bomRecipes: 2, checklistTemplates: 2 });
    pass('clone succeeds with correct copied counts: 2 menu items, 2 bomRecipes, 2 checklistTemplates');

    assert.equal(await countsOf('menu_items', 'branch_id', createdBranchId), 2);
    assert.equal(await countsOf('bom_recipes', 'branch_id', createdBranchId), 2);
    assert.equal(await countsOf('checklist_templates', 'branch_id', createdBranchId), 2);
    pass('exact row-count Postgres readback matches response for all three copied tables');

    const newDish = (await pool.query("select id from menu_items where branch_id=$1 and name='QA Butter Chicken'", [createdBranchId])).rows[0];
    const newGravy = (await pool.query("select id from menu_items where branch_id=$1 and name='QA Gravy'", [createdBranchId])).rows[0];
    const newSemiFgRow = (await pool.query("select component_menu_item_id, locked_by_hq from bom_recipes where branch_id=$1 and component_type='SEMI_FG'", [createdBranchId])).rows[0];
    const newRawRow = (await pool.query("select raw_material_id, locked_by_hq from bom_recipes where branch_id=$1 and component_type='RAW_MATERIAL'", [createdBranchId])).rows[0];
    assert.equal(newSemiFgRow.component_menu_item_id, newGravy.id); // rewired to NEW branch's copied gravy row
    assert.notEqual(newSemiFgRow.component_menu_item_id, ids.gravy);
    assert.equal(newSemiFgRow.locked_by_hq, true); // HQ-lock preserved exactly from source
    assert.equal(newRawRow.locked_by_hq, false);
    assert.equal(newRawRow.raw_material_id, ids.rawMaterial); // global raw material unchanged
    pass('component references rewired to NEW branch rows; HQ-lock state preserved exactly');

    assert.equal(await countsOf('checklist_templates', 'template_id', ids.source + '-global'), 1); // global template untouched, not duplicated
    assert.equal((await pool.query("select template_id from checklist_templates where branch_id=$1", [createdBranchId])).rows.every((r, i, arr) => r.template_id === arr[0].template_id), true);
    pass('global checklist template not duplicated; copied template shares one new template_id chain');

    // Nothing else copied: no inventory/user/recurring-task rows created for the new branch.
    assert.equal(await countsOf('inventory_stock', 'branch_id', createdBranchId), 0);
    assert.equal(await countsOf('users', 'branch_id', createdBranchId), 0);
    assert.equal(await countsOf('recurring_task_definitions', 'branch_id', createdBranchId), 0);
    pass('no inventory/user/recurring-task rows created for the new branch');
  } catch (error) { failure = error; }
  finally {
    try { if (verifiedDb) { await cleanup(createdBranchId); pass('exact fixture cleanup read back empty'); } }
    catch (error) { failure = failure ? new AggregateError([failure, error], 'Acceptance and cleanup failed') : error; }
    await pool.end();
  }
  if (failure) throw failure;
  console.log('RESULT ' + checks + ' real HTTP/Postgres branch-clone checks passed');
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
