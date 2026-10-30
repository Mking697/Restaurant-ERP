const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
// tasks.ts resolves schema modules via the project's "@/*" -> "src/*" tsconfig path
// alias, which plain Node `require` does not understand — install the same
// alias resolution Node's module loader needs, scoped to this process only.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
const load = () => require('../src/lib/server/tasks.ts');
const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
const manager = { id: 'manager', role: 'BRANCH_MANAGER', branchId: 'branch-a', moduleAccess: ['TASKS_RECURRING', 'TASKS_DELEGATION'] };
const kitchen = { id: 'kitchen', role: 'KITCHEN_STAFF', branchId: 'branch-a', moduleAccess: [] };
const otherBranchStaff = { id: 'other', role: 'CASHIER', branchId: 'branch-b', moduleAccess: ['TASKS_DELEGATION'] };

test('unknown fields are rejected closed, matching every other write payload convention', () => {
  const { allowedFields } = load();
  assert.throws(() => allowedFields({ title: 'x', hacked: true }, ['title']), { status: 400 });
  assert.doesNotThrow(() => allowedFields({ title: 'x' }, ['title']));
  assert.doesNotThrow(() => allowedFields({}, ['title']));
});

test('requiredBranchId enforces branch membership and rejects a missing/foreign branch', () => {
  const { requiredBranchId } = load();
  assert.equal(requiredBranchId(owner, 'branch-a'), 'branch-a');
  assert.equal(requiredBranchId(manager, 'branch-a'), 'branch-a');
  assert.throws(() => requiredBranchId(manager, 'branch-b'), { status: 403 });
  assert.throws(() => requiredBranchId(manager, undefined), { status: 400 });
  assert.throws(() => requiredBranchId(manager, ''), { status: 400 });
  assert.throws(() => requiredBranchId(manager, 123), { status: 400 });
});

test('optionalBranchId lets Owner see all branches but still scopes non-Owner reads', () => {
  const { optionalBranchId } = load();
  assert.equal(optionalBranchId(owner, null), null);
  assert.equal(optionalBranchId(owner, 'branch-a'), 'branch-a');
  assert.equal(optionalBranchId(manager, null), 'branch-a');
  assert.throws(() => optionalBranchId(manager, 'branch-b'), { status: 403 });
});

test('canManageTasks requires any of the three task-module grants (Owner implicitly included elsewhere)', () => {
  const { canManageTasks } = load();
  assert.equal(canManageTasks(kitchen), false);
  assert.equal(canManageTasks(manager), true);
  assert.equal(canManageTasks({ ...kitchen, moduleAccess: ['CHECKLISTS'] }), true);
});

test('ONE_TIME delegated tasks REQUIRE a non-empty attachment to complete; RECURRING does not', () => {
  const { assertAttachmentForComplete } = load();
  assert.throws(() => assertAttachmentForComplete('ONE_TIME', ''), { status: 400 });
  assert.throws(() => assertAttachmentForComplete('ONE_TIME', '   '.trim()), { status: 400 });
  assert.doesNotThrow(() => assertAttachmentForComplete('ONE_TIME', 'proof.jpg'));
  assert.doesNotThrow(() => assertAttachmentForComplete('RECURRING', ''));
  assert.doesNotThrow(() => assertAttachmentForComplete('RECURRING', 'proof.jpg'));
});

test('only the assignee OR a matching module-grant holder may complete a task (self-vs-grant pattern)', () => {
  const { assertCanComplete } = load();
  const noGrant = { id: 'bystander', role: 'CASHIER', branchId: 'branch-a', moduleAccess: [] };
  const oneTime = { assignedToId: 'kitchen', type: 'ONE_TIME' };
  assert.doesNotThrow(() => assertCanComplete(kitchen, oneTime)); // own task
  assert.throws(() => assertCanComplete(noGrant, oneTime), { status: 403 }); // not assignee, no grant
  assert.doesNotThrow(() => assertCanComplete(manager, oneTime)); // TASKS_DELEGATION grant holder, not the assignee
  assert.doesNotThrow(() => assertCanComplete(otherBranchStaff, oneTime)); // grant check here is purely module-based; branch isolation is enforced separately by branchScope() before this runs
});

test('completing already-assigned recurring task by its own TASKS_RECURRING grant holder succeeds', () => {
  const { assertCanComplete } = load();
  const recurringGrantHolder = { id: 'rec-mgr', role: 'BRANCH_MANAGER', branchId: 'branch-a', moduleAccess: ['TASKS_RECURRING'] };
  assert.doesNotThrow(() => assertCanComplete(recurringGrantHolder, { assignedToId: 'someone-else', type: 'RECURRING' }));
  assert.throws(() => assertCanComplete(recurringGrantHolder, { assignedToId: 'someone-else', type: 'ONE_TIME' }), { status: 403 });
});

test('exported task routes reject anonymous reads and CSRF-less writes before any DB access', async () => {
  const Module = require('node:module'), path = require('node:path');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '@/db/client') return { db: { transaction: async fn => fn({ execute: async () => {} }) } };
    if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  const previous = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'http://localhost:3030';
  try {
    const recurring = require('../src/app/api/tasks/recurring/route.ts');
    const assignees = require('../src/app/api/tasks/assignees/route.ts');
    const recurringId = require('../src/app/api/tasks/recurring/[id]/route.ts');
    const delegate = require('../src/app/api/tasks/delegate/route.ts');
    const instances = require('../src/app/api/tasks/instances/route.ts');
    const complete = require('../src/app/api/tasks/instances/[id]/complete/route.ts');
    const get = new Request('http://localhost:3030/api/tasks/recurring?branchId=branch-a');
    assert.equal((await recurring.GET(get)).status, 401);
    assert.equal((await assignees.GET(new Request('http://localhost:3030/api/tasks/assignees?branchId=branch-a'))).status, 401);
    assert.equal((await instances.GET(new Request('http://localhost:3030/api/tasks/instances'))).status, 401);
    const body = { branchId: 'branch-a', title: 'x', assignedToId: 'u1', frequency: 'DAILY', assignDate: new Date().toISOString() };
    const post = (url, payload, origin) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(payload) });
    assert.equal((await recurring.POST(post(get.url, body))).status, 403); // no origin -> CSRF rejected before auth
    assert.equal((await recurring.POST(post(get.url, body, 'http://localhost:3030'))).status, 401); // origin ok, still anonymous
    assert.equal((await delegate.POST(post('http://localhost:3030/api/tasks/delegate', body))).status, 403);
    assert.equal((await delegate.POST(post('http://localhost:3030/api/tasks/delegate', body, 'http://localhost:3030'))).status, 401);
    const patch = (url, payload, origin) => new Request(url, { method: 'PATCH', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(payload) });
    assert.equal((await recurringId.PATCH(patch('http://localhost:3030/api/tasks/recurring/r1', { status: 'Paused' }), { params: Promise.resolve({ id: 'r1' }) })).status, 403);
    assert.equal((await recurringId.PATCH(patch('http://localhost:3030/api/tasks/recurring/r1', { status: 'Paused' }, 'http://localhost:3030'), { params: Promise.resolve({ id: 'r1' }) })).status, 401);
    assert.equal((await complete.POST(post('http://localhost:3030/api/tasks/instances/i1/complete', {}), { params: Promise.resolve({ id: 'i1' }) })).status, 403);
    assert.equal((await complete.POST(post('http://localhost:3030/api/tasks/instances/i1/complete', {}, 'http://localhost:3030'), { params: Promise.resolve({ id: 'i1' }) })).status, 401);
  } finally { Module._load = originalLoad; if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; }
});
