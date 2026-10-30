const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const vm = require('node:vm');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const originalLoad = Module._load;
Module._load = function(request, parent, main) { return originalLoad.call(this, request.startsWith('@/') ? path.join(__dirname, '../src', request.slice(2)) : request, parent, main); };
const { HttpError } = require('../src/lib/server/permissions.ts');
const { branches } = require('../src/db/schema/platform.ts');
const { is } = require('drizzle-orm');
const { PgTable, PgDialect, getTableConfig, pgTable, text, foreignKey } = require('drizzle-orm/pg-core');
const dialect = new PgDialect();
const owner = { id: 'o', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
function helper() {
  const file = path.join(__dirname, '../src/lib/server/branch-deletion.ts');
  assert.ok(fs.existsSync(file), 'branch-deletion helper must implement the schema-derived precheck');
  return require(file);
}
function executor({ exists = true, linked = {} } = {}) {
  const calls = [], writes = [];
  return { calls, writes, select(fields) { calls.push({ fields }); return { from(table) { calls.at(-1).table = table; return this; }, where(condition) { calls.at(-1).query = dialect.sqlToQuery(condition); return this; }, async limit() { return exists ? [{ id: 'a' }] : []; } }; },
    async execute(query) { calls.push({ aggregate: dialect.sqlToQuery(query) }); return { rows: helper().branchDependencies.map(({ group }) => ({ group, count: String(linked[group] || 0) })) }; },
    delete(table) { writes.push(table); return { where() { return this; }, async returning() { return exists ? [{ id: 'a' }] : []; } }; },
  };
}
test('schema-derived registry covers every direct branch FK across every schema file, nullable and unusual references', () => {
  const { discoverBranchDependencies, branchDependencies } = helper();
  const tables = new Set();
  for (const filename of fs.readdirSync('src/db/schema').filter(name => name.endsWith('.ts') && name !== 'index.ts')) {
    for (const value of Object.values(require(path.resolve('src/db/schema', filename)))) if (is(value, PgTable)) tables.add(value);
  }
  const expected = [];
  for (const table of tables) for (const fk of getTableConfig(table).foreignKeys) {
    const ref = fk.reference();
    if (ref.foreignTable === branches) ref.columns.forEach(col => expected.push(getTableConfig(table).name + '.' + col.name));
  }
  const actual = branchDependencies.flatMap(d => d.columns.map(col => d.group + '.' + col.name));
  assert.deepEqual(actual.sort(), [...new Set(expected)].sort());
  for (const name of ['users','inventory_stock','employees','employee_compensation','workforce_attendance','workforce_leaves','payroll_runs','payroll_snapshots','branch_shifts','shift_runs','shift_handovers','warehouses']) assert.ok(branchDependencies.some(d => d.group === name), name);
  const odd = pgTable('odd', { id: text('id'), source: text('origin_site').references(() => branches.id), destination: text('destination_site') }, t => [foreignKey({ columns: [t.destination], foreignColumns: [branches.id] })]);
  const discovered = discoverBranchDependencies([odd, odd, () => null]);
  assert.equal(discovered.length, 1);
  assert.deepEqual(discovered[0].columns.map(c => c.name).sort(), ['destination_site','origin_site']);
});
function route(actor, tx, check = false) {
  const filename = path.join(__dirname, '../src/app/api/branches/[id]', check ? 'deletion-check/route.ts' : 'route.ts');
  assert.ok(fs.existsSync(filename), 'deletion-check GET route exists');
  const module = { exports: {} }; let mutations = 0;
  const auth = async () => { if (!actor) throw new HttpError(401, 'Authentication required'); return actor; };
  const dependencies = {
    '@/db/client': { db: tx }, '@/db/schema/platform': { branches }, 'drizzle-orm': require('drizzle-orm'),
    '@/lib/server/auth': { requireIdentity: auth, mutate: async (request, action) => { mutations++; return action(tx, await auth()); } },
    '@/lib/server/branch-deletion': helper(), '@/lib/server/branches': {},
    '@/lib/server/http': require('../src/lib/server/http.ts'), '@/lib/server/permissions': require('../src/lib/server/permissions.ts'),
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: name => { assert.ok(dependencies[name], name); return dependencies[name]; }, URL });
  return { call: (method = 'GET', query = '', id = 'a') => module.exports[method](new Request('http://localhost/api/branches/' + id + (check ? '/deletion-check' : '') + query, { method }), { params: Promise.resolve({ id }) }), mutations: () => mutations };
}
test('exported GET requires authenticated Owner, rejects every query parameter, distinguishes missing, never mutates', async () => {
  for (const actor of [null, { ...owner, role: 'BRANCH_MANAGER' }, { ...owner, role: 'CASHIER' }]) {
    const tx = executor(); const r = route(actor, tx, true);
    assert.equal((await r.call()).status, actor ? 403 : 401); assert.equal(tx.calls.length, 0); assert.equal(r.mutations(), 0);
  }
  for (const query of ['?ready=true', '?branchId=a&branchId=b', '?limit=1']) {
    const tx = executor(); assert.equal((await route(owner, tx, true).call('GET', query)).status, 400); assert.equal(tx.calls.length, 0);
  }
  assert.equal((await route(owner, executor({ exists: false }), true).call()).status, 404);
  const tx = executor({ linked: { users: 3 } }); const r = route(owner, tx, true); const response = await r.call();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { branchId: 'a', canDelete: false, dependencies: [{ group: 'users', count: 3 }] }); assert.equal(r.mutations(), 0); assert.equal(tx.writes.length, 0);
});
test('DELETE recomputes inside mutate, linked/missing/unauthorized are no-write; empty deletion and FK race protection preserved', async () => {
  for (const [actor, settings, status] of [[null, {}, 401], [{ ...owner, role: 'BRANCH_MANAGER' }, {}, 403], [owner, { exists: false }, 404], [owner, { linked: { warehouses: 1 } }, 409]]) {
    const tx = executor(settings); const r = route(actor, tx); const response = await r.call('DELETE', '?ready=true');
    assert.equal(response.status, status); assert.equal(tx.writes.length, 0); assert.equal(r.mutations(), 1);
    if (status === 409) assert.match((await response.json()).error, /linked records.*prevent deletion/i);
  }
  const tx = executor(); const r = route(owner, tx); assert.equal((await r.call('DELETE')).status, 200); assert.deepEqual(tx.writes, [branches]); assert.equal(tx.calls.length, 2);
  const race = executor(); race.delete = () => ({ where() { return this; }, async returning() { throw Object.assign(new Error('foreign key'), { code: '23503' }); } });
  assert.equal((await route(owner, race).call('DELETE')).status, 409);
  const changed = executor(); assert.equal((await route(owner, changed, true).call()).status, 200);
  changed.execute = executor({ linked: { branch_shifts: 1 } }).execute;
  assert.equal((await route(owner, changed).call('DELETE')).status, 409); assert.equal(changed.writes.length, 0);
});
test('guarded integration harness refuses nonapproved targets without loading DB or connecting', () => {
  const { guard } = require('./branch-deletion.integration.cjs');
  const env = { PGHOST:'127.0.0.1',PGPORT:'5436',PGDATABASE:'restaurant_erp_branch_delete_qa_20261030',PGUSER:'qa',PGPASSWORD:'not-used',BASE_URL:'http://127.0.0.1:4399' };
  assert.equal(guard(env).origin,env.BASE_URL);
  for (const change of [{PGHOST:'localhost'},{PGHOST:'remote'},{PGPORT:'5432'},{PGDATABASE:'restaurant_erp'},{PGDATABASE:env.PGDATABASE+'extra'},{BASE_URL:undefined},{BASE_URL:'https://example.com:4399'},{BASE_URL:'http://127.0.0.1:4399/path'},{BASE_URL:'http://127.0.0.1:4399?db=qa'},{BASE_URL:'http://user:pass@127.0.0.1:4399'},{BASE_URL:'http://127.0.0.1'}]) assert.throws(() => guard({...env,...change}));
});
test('precheck fails closed on incomplete, duplicate, corrupt or failed counts', async () => {
  const { checkBranchDeletion, branchDependencies } = helper();
  for (const change of [rows => rows.slice(1), rows => [...rows.slice(1),rows[1]], rows => rows.map((r,i) => i === 0 ? {...r,count:'NaN'} : r), rows => rows.map((r,i) => i === 0 ? {...r,count:'9007199254740992'} : r)]) {
    const tx = executor(); tx.execute = async () => ({ rows:change(branchDependencies.map(d => ({group:d.group,count:'0'}))) });
    await assert.rejects(checkBranchDeletion(tx,owner,'a')); assert.equal(tx.writes.length,0);
  }
  const tx = executor(); tx.execute = async () => { throw new Error('offline'); };
  assert.equal((await route(owner,tx,true).call()).status,503); assert.equal((await route(owner,tx).call('DELETE')).status,503); assert.equal(tx.writes.length,0);
});
test('precheck is Owner only, selects branch identity only, returns 404 before counts and counts-only linked DTO', async () => {
  const { checkBranchDeletion } = helper();
  for (const role of ['BRANCH_MANAGER','CASHIER']) { const tx = executor(); await assert.rejects(checkBranchDeletion(tx, { ...owner, role }, 'a'), { status: 403 }); assert.equal(tx.calls.length, 0); }
  const missing = executor({ exists: false }); await assert.rejects(checkBranchDeletion(missing, owner, 'missing'), { status: 404 }); assert.equal(missing.calls.length, 1);
  const tx = executor({ linked: { users: 2, employees: 1 } });
  assert.deepEqual(await checkBranchDeletion(tx, owner, 'a'), { branchId: 'a', canDelete: false, dependencies: [{ group: 'employees', count: 1 }, { group: 'users', count: 2 }] });
  assert.deepEqual(Object.keys(tx.calls[0].fields), ['id']);
  assert.deepEqual(tx.calls[0].query.params, ['a']);
  assert.equal(tx.writes.length, 0);
  const query = tx.calls[1].aggregate;
  assert.match(query.sql, /count\(\*\)/i); assert.match(query.sql, /union all/i);
  assert.ok(query.params.includes('a')); assert.ok(!query.sql.includes("'a'"));
  for (const { group, columns } of helper().branchDependencies) for (const col of columns) assert.ok(query.sql.includes('"' + group + '"."' + col.name + '"'), group + '.' + col.name);
  assert.deepEqual(await checkBranchDeletion(executor(), owner, 'a'), { branchId: 'a', canDelete: true, dependencies: [] });
});
