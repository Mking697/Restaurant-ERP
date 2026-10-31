const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const vm = require('node:vm');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const originalLoad = Module._load;
Module._load = function (request, parent, main) { return originalLoad.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, parent, main); };
const { HttpError } = require('../src/lib/server/permissions.ts');
const { branches } = require('../src/db/schema/platform.ts');
const { menuItems, bomRecipes } = require('../src/db/schema/menu.ts');
const { checklistTemplates } = require('../src/db/schema/tasks.ts');
const { PgDialect } = require('drizzle-orm/pg-core');
const dialect = new PgDialect();
const owner = { id: 'o', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
const admin = { id: 'a', role: 'BRANCH_MANAGER', branchId: 'x', moduleAccess: [] };

function helper() {
  const file = path.join(__dirname, '../src/lib/server/branch-clone.ts');
  assert.ok(fs.existsSync(file), 'branch-clone helper must exist');
  return require(file);
}

function whereResult(rows) {
  return { limit: async (n) => rows.slice(0, n ?? rows.length), then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
}

// Minimal fake Drizzle executor. Matches a row to an `eq(table.col, value)`
// condition by extracting the condition's single bound parameter and
// matching against every value on each candidate row — sufficient for the
// specific single-column equality queries the helper issues.
function executor({ tables = {}, failCodes = [] } = {}) {
  const state = new Map();
  for (const [table, rows] of Object.entries(tables)) state.set(table, rows.map((r) => ({ ...r })));
  const inserts = [];
  const tableRefs = { branches, menuItems, bomRecipes, checklistTemplates };
  function nameOf(table) {
    return Object.entries(tableRefs).find(([, ref]) => ref === table)?.[0];
  }
  return {
    inserts,
    select() {
      return {
        from(table) {
          return {
            where(condition) {
              const query = dialect.sqlToQuery(condition);
              const value = query.params[0];
              const rows = (state.get(nameOf(table)) || []).filter((row) => Object.values(row).includes(value));
              return whereResult(rows);
            },
          };
        },
      };
    },
    insert(table) {
      return {
        values(payload) {
          const rows = Array.isArray(payload) ? payload : [payload];
          const name = nameOf(table);
          return {
            returning: async () => {
              if (failCodes.includes(name)) throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
              inserts.push({ table: name, rows });
              const arr = state.get(name) || [];
              arr.push(...rows);
              state.set(name, arr);
              return rows;
            },
            then: async (resolve, reject) => {
              try {
                if (failCodes.includes(name)) throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
                inserts.push({ table: name, rows });
                const arr = state.get(name) || [];
                arr.push(...rows);
                state.set(name, arr);
                resolve(rows);
              } catch (error) { reject(error); }
            },
          };
        },
      };
    },
  };
}

test('non-Owner is rejected before any read/write', async () => {
  const { cloneBranch } = helper();
  const tx = executor({ tables: { branches: [{ id: 'src', code: 'SRC' }] } });
  await assert.rejects(
    cloneBranch(tx, admin, { sourceBranchId: 'src', code: 'NEW', name: 'New', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }),
    { status: 403 }
  );
  assert.equal(tx.inserts.length, 0);
});

test('missing/foreign source branch returns 404, no writes', async () => {
  const { cloneBranch } = helper();
  const tx = executor({ tables: { branches: [{ id: 'other', code: 'OTHER' }] } });
  await assert.rejects(
    cloneBranch(tx, owner, { sourceBranchId: 'missing', code: 'NEW', name: 'New', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }),
    { status: 404 }
  );
  assert.equal(tx.inserts.length, 0);
});

test('duplicate code bubbles the real 23505 unique-violation (caller/mutate rolls back)', async () => {
  const { cloneBranch } = helper();
  const tx = executor({ tables: { branches: [{ id: 'src', code: 'SRC' }] }, failCodes: ['branches'] });
  await assert.rejects(
    cloneBranch(tx, owner, { sourceBranchId: 'src', code: 'DUP', name: 'New', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }),
    (error) => error.code === '23505'
  );
  assert.equal(tx.inserts.length, 0);
});

test('successful clone copies menuItems/bomRecipes/checklistTemplates with correct counts, HQ-lock and new-branch component rewiring; skips global checklist templates; copies nothing else', async () => {
  const { cloneBranch } = helper();
  const tx = executor({
    tables: {
      branches: [{ id: 'src', code: 'SRC' }],
      menuItems: [
        { id: 'dish', branchId: 'src', name: 'Butter Chicken', category: '', outputUnit: 'portion', price: '250.00', isActive: true, isSemiFg: false, isSellable: true, productCode: '', vatRatePercent: '18.00' },
        { id: 'gravy', branchId: 'src', name: 'Gravy', category: '', outputUnit: 'kg', price: '0.00', isActive: true, isSemiFg: true, isSellable: false, productCode: '', vatRatePercent: '18.00' },
        { id: 'other-branch-dish', branchId: 'other', name: 'Not copied', category: '', outputUnit: 'portion', price: '0.00', isActive: true, isSemiFg: false, isSellable: true, productCode: '', vatRatePercent: '18.00' },
      ],
      bomRecipes: [
        { id: 'r1', branchId: 'src', menuItemId: 'dish', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'gravy', qtyPerUnit: '1.000', lockedByHq: true },
        { id: 'r2', branchId: 'src', menuItemId: 'gravy', componentType: 'RAW_MATERIAL', rawMaterialId: 'rm-tomato', componentMenuItemId: null, qtyPerUnit: '2.500', lockedByHq: false },
      ],
      checklistTemplates: [
        { templateId: 'tpl1', branchId: 'src', templateName: 'Opening', triggerEvent: 'MANUAL', status: 'Active', stepNo: 1, stepName: 'Step1', assignedToRole: '', tatValue: null, tatUnit: '', outcomeOptions: '', nextStepMap: { Pass: '2' }, outcomeType: 'PASS_FAIL', requiresPhoto: true, requiresGeofence: false, notifyOnComplete: [], createdBy: '' },
        { templateId: 'tpl1', branchId: 'src', templateName: 'Opening', triggerEvent: 'MANUAL', status: 'Active', stepNo: 2, stepName: 'Step2', assignedToRole: '', tatValue: null, tatUnit: '', outcomeOptions: '', nextStepMap: null, outcomeType: 'DONE', requiresPhoto: false, requiresGeofence: false, notifyOnComplete: [], createdBy: '' },
        { templateId: 'global', branchId: null, templateName: 'Global', triggerEvent: 'MANUAL', status: 'Active', stepNo: 1, stepName: 'G1', assignedToRole: '', tatValue: null, tatUnit: '', outcomeOptions: '', nextStepMap: null, outcomeType: 'DONE', requiresPhoto: false, requiresGeofence: false, notifyOnComplete: [], createdBy: '' },
      ],
    },
  });
  const result = await cloneBranch(tx, owner, { sourceBranchId: 'src', code: 'NEW', name: 'New Branch', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 });
  assert.deepEqual(result.copied, { menuItems: 2, bomRecipes: 2, checklistTemplates: 2 });

  const branchInsert = tx.inserts.find((i) => i.table === 'branches');
  assert.equal(branchInsert.rows[0].isTemplate, false);
  assert.equal(branchInsert.rows[0].clonedFromId, 'src');
  const newBranchId = branchInsert.rows[0].id;
  assert.notEqual(newBranchId, 'src');

  const menuInsert = tx.inserts.find((i) => i.table === 'menuItems');
  assert.equal(menuInsert.rows.length, 2);
  assert.ok(menuInsert.rows.every((r) => r.branchId === newBranchId));
  assert.ok(menuInsert.rows.every((r) => r.id !== 'dish' && r.id !== 'gravy'));
  const newDish = menuInsert.rows.find((r) => r.name === 'Butter Chicken');
  const newGravy = menuInsert.rows.find((r) => r.name === 'Gravy');
  assert.ok(newDish && newGravy);

  const bomInsert = tx.inserts.find((i) => i.table === 'bomRecipes');
  assert.equal(bomInsert.rows.length, 2);
  assert.ok(bomInsert.rows.every((r) => r.branchId === newBranchId));
  const newSemiFgLink = bomInsert.rows.find((r) => r.componentType === 'SEMI_FG');
  assert.equal(newSemiFgLink.menuItemId, newDish.id);
  // Rewired to the NEW branch's copied Gravy row, never the source's.
  assert.equal(newSemiFgLink.componentMenuItemId, newGravy.id);
  assert.notEqual(newSemiFgLink.componentMenuItemId, 'gravy');
  const rawLink = bomInsert.rows.find((r) => r.componentType === 'RAW_MATERIAL');
  assert.equal(rawLink.menuItemId, newGravy.id);
  assert.equal(rawLink.rawMaterialId, 'rm-tomato'); // global, unchanged
  // lockedByHq preserved exactly from source, never invented.
  assert.equal(newSemiFgLink.lockedByHq, true);
  assert.equal(rawLink.lockedByHq, false);

  const checklistInsert = tx.inserts.find((i) => i.table === 'checklistTemplates');
  assert.equal(checklistInsert.rows.length, 2);
  assert.ok(checklistInsert.rows.every((r) => r.branchId === newBranchId));
  assert.ok(checklistInsert.rows.every((r) => r.templateId !== 'tpl1' && r.templateId !== 'global'));
  const step1 = checklistInsert.rows.find((r) => r.stepNo === 1);
  const step2 = checklistInsert.rows.find((r) => r.stepNo === 2);
  assert.equal(step1.templateId, step2.templateId); // same new template chain
  assert.deepEqual(step1.nextStepMap, { Pass: '2' }); // step chain preserved

  // Nothing else touched: no inventory/user/recurring-task writes requested.
  assert.deepEqual(tx.inserts.map((i) => i.table).sort(), ['bomRecipes', 'branches', 'checklistTemplates', 'menuItems']);
});

test('source branch with no menu items/checklists clones to zero counts, still creates the branch', async () => {
  const { cloneBranch } = helper();
  const tx = executor({ tables: { branches: [{ id: 'src', code: 'SRC' }] } });
  const result = await cloneBranch(tx, owner, { sourceBranchId: 'src', code: 'EMPTY', name: 'Empty Clone', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 });
  assert.deepEqual(result.copied, { menuItems: 0, bomRecipes: 0, checklistTemplates: 0 });
  assert.deepEqual(tx.inserts.map((i) => i.table), ['branches']);
});

test('invalid new-branch fields reuse the shared branchInput validator and reject before any write', async () => {
  const { cloneBranch } = helper();
  const tx = executor({ tables: { branches: [{ id: 'src', code: 'SRC' }] } });
  await assert.rejects(
    cloneBranch(tx, owner, { sourceBranchId: 'src', code: 'bad code!', name: 'New', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 }),
    { status: 400 }
  );
  assert.equal(tx.inserts.length, 0);
});

function route(actor, tx) {
  const filename = path.join(__dirname, '../src/app/api/branches/clone/route.ts');
  assert.ok(fs.existsSync(filename), 'POST /api/branches/clone route exists');
  const module = { exports: {} };
  let mutations = 0;
  const auth = async () => { if (!actor) throw new HttpError(401, 'Authentication required'); return actor; };
  const dependencies = {
    '@/lib/server/branch-clone': helper(),
    '@/lib/server/auth': { mutate: async (request, action) => { mutations++; return action(tx, await auth()); } },
    '@/lib/server/http': require('../src/lib/server/http.ts'),
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: (name) => { assert.ok(dependencies[name], name); return dependencies[name]; }, URL }
  );
  return {
    call: (payload) => module.exports.POST(new Request('http://localhost/api/branches/clone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })),
    mutations: () => mutations,
  };
}

test('route wires body through mutate() into cloneBranch and returns 201 with branch+copied counts', async () => {
  const tx = executor({ tables: { branches: [{ id: 'src', code: 'SRC' }] } });
  const r = route(owner, tx);
  const response = await r.call({ sourceBranchId: 'src', code: 'NEW', name: 'New Branch', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.branch.clonedFromId, 'src');
  assert.deepEqual(data.copied, { menuItems: 0, bomRecipes: 0, checklistTemplates: 0 });
  assert.equal(r.mutations(), 1);
});

test('route surfaces 403/404 from the helper unchanged', async () => {
  const tx = executor({ tables: { branches: [{ id: 'src', code: 'SRC' }] } });
  const denied = await route(admin, tx).call({ sourceBranchId: 'src', code: 'NEW', name: 'New Branch', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 });
  assert.equal(denied.status, 403);
  const notFound = await route(owner, tx).call({ sourceBranchId: 'missing', code: 'NEW', name: 'New Branch', address: '', lat: 0, lng: 0, geofenceRadiusM: 50 });
  assert.equal(notFound.status, 404);
});

test('guarded integration harness refuses nonapproved targets without loading DB or connecting', () => {
  const { guard } = require('./branch-clone.integration.cjs');
  const env = { PGHOST: '127.0.0.1', PGPORT: '5436', PGDATABASE: 'restaurant_erp_branch_clone_qa_20261030', PGUSER: 'qa', PGPASSWORD: 'not-used', BASE_URL: 'http://127.0.0.1:4399' };
  assert.equal(guard(env).origin, env.BASE_URL);
  for (const change of [{ PGHOST: 'localhost' }, { PGHOST: 'remote' }, { PGPORT: '5432' }, { PGDATABASE: 'restaurant_erp' }, { PGDATABASE: env.PGDATABASE + 'extra' }, { BASE_URL: undefined }, { BASE_URL: 'https://example.com:4399' }, { BASE_URL: 'http://127.0.0.1:4399/path' }, { BASE_URL: 'http://127.0.0.1:4399?db=qa' }, { BASE_URL: 'http://user:pass@127.0.0.1:4399' }, { BASE_URL: 'http://127.0.0.1' }]) assert.throws(() => guard({ ...env, ...change }));
});
