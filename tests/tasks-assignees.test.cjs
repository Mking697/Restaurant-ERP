const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const Module = require('node:module');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const originalLoad = Module._load;
Module._load = function(request, parent, main) { return originalLoad.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, parent, main); };
const tasks = require('../src/lib/server/tasks.ts');
const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
const staff = { id: 'staff', role: 'CASHIER', branchId: 'a', moduleAccess: ['TASKS_DELEGATION'] };
const { PgDialect } = require('drizzle-orm/pg-core');
function route(actor, tx) {
  const module = { exports: {} };
  const dependencies = { '@/db/client': { db: tx }, '@/lib/server/auth': { requireIdentity: async () => { if (!actor) throw new (require('../src/lib/server/permissions.ts').HttpError)(401, 'Authentication required'); return actor; } }, '@/lib/server/http': require('../src/lib/server/http.ts'), '@/lib/server/permissions': require('../src/lib/server/permissions.ts'), '@/lib/server/tasks': tasks };
  const filename = path.join(__dirname, '../src/app/api/tasks/assignees/route.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: name => dependencies[name], URL });
  return query => module.exports.GET(new Request('http://localhost/api/tasks/assignees' + query));
}

test('exported assignee GET authenticates and rejects ambiguous or unknown query fields', async () => {
  assert.equal((await route(null, executor())('?branchId=a')).status, 401);
  for (const query of ['', '?branchId=', '?branchId=a&branchId=b', '?branchId=a&limit=1']) {
    const tx = executor();
    assert.equal((await route(owner, tx)(query)).status, 400, query);
    assert.equal(tx.calls.length, 0);
  }
  const response = await route(staff, executor())('?branchId=a');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { branchId: 'a', assignees: [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Alice' }] });
});

test('lookup permission and branch scope reject before reading users; missing branches are 404', async () => {
  for (const actor of [{ ...staff, moduleAccess: [] }, { ...staff, moduleAccess: ['CHECKLISTS'] }, { ...staff, branchId: null }]) {
    const tx = executor();
    await assert.rejects(() => tasks.listAssignees(tx, actor, 'a'), { status: 403 });
    assert.equal(tx.calls.length, 0);
  }
  await assert.rejects(() => tasks.listAssignees(executor(), staff, 'b'), { status: 403 });
  await assert.rejects(() => tasks.listAssignees(executor(), owner, null), { status: 400 });
  const missing = executor(false);
  await assert.rejects(() => tasks.listAssignees(missing, owner, 'missing'), { status: 404 });
  assert.equal(missing.calls.length, 1);
  for (const actor of [owner, { ...staff, moduleAccess: ['TASKS_RECURRING'] }, staff]) assert.equal((await tasks.listAssignees(executor(), actor, 'a')).branchId, 'a');
});
const dialect = new PgDialect();
function executor(exists = true) {
  const calls = [];
  return { calls, select(columns) {
    const call = { columns }; calls.push(call);
    const builder = {
      from(table) { call.table = table; return this; },
      where(condition) { call.where = dialect.sqlToQuery(condition); return this; },
      limit(value) { call.limit = value; return Promise.resolve(exists ? [{ id: 'a' }] : []); },
      orderBy(...columns) { call.order = columns; return Promise.resolve([{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Alice' }]); },
    };
    return builder;
  } };
}
test('assignee lookup selects only id/name in explicit branch with stable uncapped ordering', async () => {
  const tx = executor();
  const result = await tasks.listAssignees(tx, staff, 'a');
  assert.deepEqual(result, { branchId: 'a', assignees: [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Alice' }] });
  assert.equal(tx.calls.length, 2);
  const call = tx.calls[1];
  assert.deepEqual(Object.keys(call.columns), ['id', 'name']);
  assert.match(call.where.sql, /"users"\."branch_id" = \$1/);
  assert.deepEqual(call.where.params, ['a']);
  assert.equal(call.limit, undefined);
  const { users } = require('../src/db/schema/auth.ts');
  assert.deepEqual(call.order, [users.name, users.id]);
});
