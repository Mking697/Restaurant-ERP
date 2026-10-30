const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const load = Module._load;
Module._load = function(name, parent, main) { return load.call(this, name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2)) : name, parent, main); };
const permissions = require('../src/lib/server/permissions.ts');
const staff = { id: 'buyer', role: 'CASHIER', branchId: 'a', moduleAccess: ['PURCHASE_ORDER'] };
const owner = { ...staff, role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
const filename = '../src/lib/server/historical-purchase-lookup.ts';
function helper() { assert.ok(fs.existsSync(path.join(__dirname, filename)), 'exact-read helper exists'); return require(filename); }
const { PgDialect } = require('drizzle-orm/pg-core');
function executor(rows = [{ id: 'old', branchId: 'a' }]) {
  const calls = [];
  return { calls, select(columns) { const call = { columns }; calls.push(call); const result = calls.length === 1 ? rows : [{ rawMaterialId: 'rice', qty: '2.000', name: 'Rice', unit: 'kg' }]; const q = {
    from() { return q; }, innerJoin() { return q; }, where(value) { call.where = new PgDialect().sqlToQuery(value); return q; }, limit(value) { call.limit = value; return Promise.resolve(result); }, then(a,b) { return Promise.resolve(result).then(a,b); },
  }; return q; } };
}
test('approved exact helper scopes id/status before a single-row read and projects only purchase choices', async () => {
  const tx = executor(); const result = await helper().readApprovedIndent(tx, staff, 'old', 'a');
  assert.deepEqual(result, { id: 'old', branchId: 'a', lines: [{ rawMaterialId: 'rice', qty: '2.000', name: 'Rice', unit: 'kg' }] });
  assert.deepEqual(Object.keys(tx.calls[0].columns), ['id', 'branchId']);
  assert.deepEqual(Object.keys(tx.calls[1].columns), ['rawMaterialId', 'qty', 'name', 'unit']);
  assert.deepEqual(tx.calls[0].where.params, ['old', 'a', 'APPROVED']); assert.equal(tx.calls[0].limit, 1);
});
test('approved exact helper denies foreign scope and non-PO grants before DB and returns scoped 404', async () => {
  for (const [actor, branch, status] of [[staff,'b',403], [{ ...staff, moduleAccess: ['VENDOR_REFUNDS'] },'a',403], [owner,null,400]]) {
    const tx = executor(); await assert.rejects(() => helper().readApprovedIndent(tx, actor, 'old', branch), { status }); assert.equal(tx.calls.length, 0);
  }
  await assert.rejects(() => helper().readApprovedIndent(executor([]), staff, 'absent', 'a'), { status: 404 });
});
function route(kind, actor = staff, rows) {
  const tx = executor(rows); const calls = []; let locked = false;
  const dependencies = {
    '@/db/client': { db: tx }, '@/lib/server/http': require('../src/lib/server/http.ts'),
    '@/lib/server/permissions': permissions, '@/lib/server/historical-purchase-lookup': helper(),
    '@/lib/server/auth': { locked: async fn => { locked = true; return fn(tx); }, requireIdentity: async (_r, source) => { if (kind === 'grns') assert.equal(source, tx); if (!actor) throw new permissions.HttpError(401, 'Login'); return actor; } },
    '@/lib/server/grn-quality': { readGrns: async (source, user, query) => { assert.equal(locked, true); assert.equal(source, tx); permissions.assertModule(user, 'PURCHASE_ORDER'); permissions.branchScope(user, query.branchId); calls.push(query); return rows ?? [{ id: 'old', branchId: 'a', lines: [{ id: 'line' }], qualityRecorded: true }]; } },
  };
  const file = `src/app/api/purchase/${kind === 'grns' ? 'grns' : 'orders/approved-indents'}/[id]/route.ts`;
  assert.ok(fs.existsSync(file), 'exact GET route exists: ' + file);
  const mod = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, URL, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { tx, calls, get: (query = '?branchId=a', id = 'old') => mod.exports.GET(new Request('http://localhost/test'+query), { params: Promise.resolve({ id }) }) };
}
const { target } = require('./historical-purchase-lookup.integration.cjs');
test('real integration harness rejects implicit, remote or mismatched targets before connecting', () => {
  const env = { PGHOST: '127.0.0.1', PGPORT: '5436', PGDATABASE: 'restaurant_erp_purchase_history_qa_20261030', HISTORY_QA_DATABASE: 'restaurant_erp_purchase_history_qa_20261030', PGUSER: 'qa', PGPASSWORD: '', BASE_URL: 'http://127.0.0.1:4318' };
  assert.equal(target(env).database.database, env.PGDATABASE);
  for (const patch of [{ PGHOST: 'remote.example' }, { PGPORT: '5432' }, { PGDATABASE: 'restaurant_erp' }, { HISTORY_QA_DATABASE: '' }, { BASE_URL: '' }, { BASE_URL: 'https://127.0.0.1:4318' }, { BASE_URL: 'http://remote.example:4318' }, { BASE_URL: 'http://127.0.0.1:4318/?PGDATABASE=restaurant_erp' }, { BASE_URL: 'http://user@127.0.0.1:4318' }]) assert.throws(() => target({ ...env, ...patch }));
});
test('reused real GRN reader applies exact branch/id predicates before its unchanged 200-row cap', async () => {
  const calls = []; const tx = { select() { const call = {}; calls.push(call); const q = { from() { return q; }, innerJoin() { return q; }, where(sql) { call.where = new PgDialect().sqlToQuery(sql); return q; }, orderBy() { return q; }, limit(n) { call.limit = n; return Promise.resolve([]); } }; return q; } };
  const { readGrns } = require('../src/lib/server/grn-quality.ts');
  assert.deepEqual(await readGrns(tx, staff, { branchId: 'a', id: 'old' }), []);
  assert.deepEqual(calls[0].where.params, ['a','old']); assert.equal(calls[0].limit, 200);
});
for (const kind of ['approved', 'grns']) {
  test(`${kind} exported GET requires live PO identity, explicit strict query and bounded literal ids`, async () => {
    assert.equal((await route(kind, null).get()).status, 401);
    for (const q of ['', '?branchId=', '?branchId=a&branchId=a', '?branchId=a&status=APPROVED', '?branchId=a&limit=1', '?branchId=%20a', '?branchId='+'a'.repeat(201)]) assert.equal((await route(kind, owner).get(q)).status, 400, q);
    for (const id of ['', ' ', ' old', 'x\n', 'a'.repeat(201)]) assert.equal((await route(kind).get('?branchId=a', id)).status, 400, JSON.stringify(id));
    assert.equal((await route(kind, { ...staff, moduleAccess: ['VENDOR_REFUNDS'] }).get()).status, 403);
    assert.equal((await route(kind).get('?branchId=b')).status, 403);
    const r = route(kind); const response = await r.get(); assert.equal(response.status, 200);
    const value = await response.json(); assert.equal(value[kind === 'grns' ? 'grn' : 'indent'].id, 'old');
    if (kind === 'grns') assert.deepEqual(JSON.parse(JSON.stringify(r.calls)), [{ branchId: 'a', id: 'old' }]);
    assert.equal((await route(kind, staff, []).get()).status, 404);
  });
}
