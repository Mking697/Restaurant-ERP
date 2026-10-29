const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
// mis.ts imports schema/permissions via the "@/*" path alias, which plain
// `require` cannot resolve — same resolver hack as accounts-ledger.test.cjs.
const Module = require('node:module'), path = require('node:path');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@/db/client') return { db: { transaction: async fn => fn({ execute: async () => {} }) } };
  if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
const load = () => require('../src/app/api/mis/_shared.ts');

const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
const centralMgr = { id: 'csm', role: 'CENTRAL_STORE_MGR', branchId: null, moduleAccess: [] };
const branchManager = { id: 'bm', role: 'BRANCH_MANAGER', branchId: 'branch-a', moduleAccess: ['MIS_PERFORMANCE'] };
const cashier = { id: 'cashier', role: 'CASHIER', branchId: 'branch-a', moduleAccess: [] };

test('assertCanComputeMis allows only SUPER_ADMIN/CENTRAL_STORE_MGR', () => {
  const { assertCanComputeMis } = load();
  assert.doesNotThrow(() => assertCanComputeMis(owner));
  assert.doesNotThrow(() => assertCanComputeMis(centralMgr));
  assert.throws(() => assertCanComputeMis(branchManager), { status: 403 });
  assert.throws(() => assertCanComputeMis(cashier), { status: 403 });
});

test('parseComputeInput enforces ISO dates, periodEnd > periodStart and a 31-day max window', () => {
  const { parseComputeInput } = load();
  const value = parseComputeInput({ periodStart: '2024-02-01T00:00:00.000Z', periodEnd: '2024-02-15T00:00:00.000Z' });
  assert.equal(value.branchId, null);
  assert.equal(value.periodStart.toISOString(), '2024-02-01T00:00:00.000Z');
  assert.throws(() => parseComputeInput({ periodStart: '2024-02-15', periodEnd: '2024-02-01' }), { status: 400 }); // end before start
  assert.throws(() => parseComputeInput({ periodStart: '2024-02-01', periodEnd: '2024-02-01' }), { status: 400 }); // equal, not strictly after
  assert.throws(() => parseComputeInput({ periodStart: '2024-01-01', periodEnd: '2024-03-01' }), { status: 400 }); // > 31 days
  assert.throws(() => parseComputeInput({ periodStart: 'nonsense', periodEnd: '2024-02-15' }), { status: 400 });
  assert.throws(() => parseComputeInput({ periodStart: '2024-02-01', periodEnd: '2024-02-15', extra: 1 }), { status: 400 }); // unknown field
  const scoped = parseComputeInput({ branchId: 'branch-a', periodStart: '2024-02-01', periodEnd: '2024-02-15' });
  assert.equal(scoped.branchId, 'branch-a');
  const exactly31 = parseComputeInput({ periodStart: '2024-01-01T00:00:00.000Z', periodEnd: '2024-02-01T00:00:00.000Z' });
  assert.ok(exactly31); // exactly 31 days is allowed (boundary, not over)
});

function chain(rows) {
  const p = Promise.resolve(rows);
  p.limit = () => Promise.resolve(rows);
  p.orderBy = () => chain(rows);
  return p;
}
function txFromRows(rows) {
  return { select: () => ({ from: () => ({ where: () => chain(rows) }) }) };
}

test('classifyTasks: onTime/delay/notDone boundaries match the contract exactly', async () => {
  const { classifyTasks } = load();
  // Real "now" in the test run is well after 2024, so every 2024 dueAt below
  // is genuinely in the past already — no clock mocking needed, and the one
  // row deliberately due far in the future stays correctly excluded.
  const dueAt = new Date('2024-02-10T00:00:00.000Z');
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const rows = [
    { status: 'DONE', dueAt, completedAt: new Date('2024-02-10T00:00:00.000Z') }, // exactly on time (completedAt === dueAt) -> onTime
    { status: 'DONE', dueAt, completedAt: new Date('2024-02-10T00:00:01.000Z') }, // 1s late -> delay
    { status: 'OVERDUE', dueAt, completedAt: null }, // past due, not done -> notDone
    { status: 'PENDING', dueAt: farFuture, completedAt: null }, // not yet due -> excluded entirely
    { status: 'SKIPPED', dueAt, completedAt: null }, // explicitly skipped -> excluded entirely
  ];
  const result = await classifyTasks(txFromRows(rows), 'branch-a', 'RECURRING', new Date('2024-02-01'), new Date('2024-02-28'));
  assert.equal(result.onTime, 1); assert.equal(result.delay, 1); assert.equal(result.notDone, 1); assert.equal(result.total, 3);
  assert.equal(result.score, (1 / 3) * 100);
});

test('DONE without a completion timestamp is not invented as a late completion', async () => {
  const { classifyTasks } = load();
  const r=await classifyTasks(txFromRows([{status:'DONE',dueAt:new Date('2024-02-10'),completedAt:null}]),'a','RECURRING',new Date('2024-02-01'),new Date('2024-02-28'));
  assert.equal(r.score,null); assert.equal(r.delay,0);
});

test('classifyTasks returns null score (not 0) when zero rows exist in range', async () => {
  const { classifyTasks } = load();
  const result = await classifyTasks(txFromRows([]), 'branch-a', 'ONE_TIME', new Date('2024-02-01'), new Date('2024-02-28'));
  assert.equal(result.score, null); assert.equal(result.total, 0);
});

test('classifyVariance flags exactly-5% as fine and anything over 5% or explicitly flagged as bad', async () => {
  const { classifyVariance } = load();
  const rows = [
    { theoreticalQty: '100', varianceQty: '5', flaggedPilferage: false }, // exactly 5% -> not flagged (threshold is "> 5%", not ">=")
    { theoreticalQty: '100', varianceQty: '5.01', flaggedPilferage: false }, // just over 5% -> flagged
    { theoreticalQty: '100', varianceQty: '0', flaggedPilferage: true }, // explicitly flagged regardless of variance size
    { theoreticalQty: '100', varianceQty: '1', flaggedPilferage: false }, // well within tolerance
  ];
  const result = await classifyVariance(txFromRows(rows), 'branch-a', new Date('2024-02-01'), new Date('2024-02-28'));
  assert.equal(result.flagged, 2); assert.equal(result.total, 4);
  assert.equal(result.score, 100 - (2 / 4) * 100);
});

test('classifyVariance returns null (not 100) when zero rows exist in range', async () => {
  const { classifyVariance } = load();
  const result = await classifyVariance(txFromRows([]), 'branch-a', new Date('2024-02-01'), new Date('2024-02-28'));
  assert.equal(result.score, null);
});

test('classifyCashier reuses the real closing cash_drops.shortageExcessInr figure, not reinvented math', async () => {
  const { classifyCashier } = load();
  const runs = [{ id: 'run-1' }, { id: 'run-2' }, { id: 'run-3' }];
  const drops = [
    { shiftRunId: 'run-1', shortageExcessInr: '0.00' },
    { shiftRunId: 'run-2', shortageExcessInr: '-150.00' },
    { shiftRunId: 'run-3', shortageExcessInr: '0.00' },
  ];
  let call = 0;
  const tx = { select: () => ({ from: () => { const q = { where: () => chain(++call === 1 ? runs : drops) }; q.innerJoin = () => q; return q; } }) };
  const result = await classifyCashier(tx, 'branch-a', new Date('2024-02-01'), new Date('2024-02-28'));
  assert.equal(result.nonzero, 1); assert.equal(result.total, 3);
  assert.equal(result.score, 100 - (1 / 3) * 100);
});

test('closed shifts without complete closing observations return null, not perfect cashier scores', async () => {
  const { classifyCashier } = load(); let n=0;
  const tx={select:()=>({from:()=>{const q={where:()=>chain(++n===1?[{id:'closed'}]:[])};q.innerJoin=()=>q;return q;}})};
  assert.equal((await classifyCashier(tx,'a',new Date('2024-02-01'),new Date('2024-02-28'))).score,null);
});

test('weightedTotal re-normalizes weights to 100 using only the non-null components (the core partial-data rule)', () => {
  const { weightedTotal } = load();
  // Only taskScore(40) + delegationScore(30) present -> renormalized 40/70, 30/70 — NOT 40/100, 30/100.
  const partial = weightedTotal({
    taskScore: { score: 90, onTime: 9, delay: 1, notDone: 0, total: 10 },
    delegationScore: { score: 50, onTime: 5, delay: 5, notDone: 0, total: 10 },
    varianceScore: { score: null, flagged: 0, total: 0 },
    cashierScore: { score: null, nonzero: 0, total: 0 },
  });
  assert.deepEqual(partial.componentsUsed, ['taskScore', 'delegationScore']);
  const expected = (40 * 90 + 30 * 50) / 70;
  assert.ok(Math.abs(partial.totalScore - expected) < 1e-9);

  // All 4 present -> plain 40/30/20/10 weighted average (weights already sum to 100).
  const full = weightedTotal({
    taskScore: { score: 100, onTime: 10, delay: 0, notDone: 0, total: 10 },
    delegationScore: { score: 100, onTime: 10, delay: 0, notDone: 0, total: 10 },
    varianceScore: { score: 100, flagged: 0, total: 10 },
    cashierScore: { score: 100, nonzero: 0, total: 10 },
  });
  assert.equal(full.totalScore, 100); assert.equal(full.componentsUsed.length, 4);

  // Nothing present at all -> null total, empty componentsUsed, caller must skip the branch entirely.
  const none = weightedTotal({
    taskScore: { score: null, onTime: 0, delay: 0, notDone: 0, total: 0 },
    delegationScore: { score: null, onTime: 0, delay: 0, notDone: 0, total: 0 },
    varianceScore: { score: null, flagged: 0, total: 0 },
    cashierScore: { score: null, nonzero: 0, total: 0 },
  });
  assert.equal(none.totalScore, null); assert.deepEqual(none.componentsUsed, []);
});

test('persisted missing components are null with reasons, never inferred from changing live rows', () => {
  const { componentSnapshot } = load();
  const value = componentSnapshot({ taskScore: '0.00', delegationScore: '100.00', varianceScore: '-1.00', cashierScore: '-1.00' });
  assert.equal(value.taskScore, '0.00');
  assert.equal(value.varianceScore, null);
  assert.deepEqual(value.componentsUsed, ['taskScore', 'delegationScore']);
  assert.match(value.missingReasons.cashierScore, /No eligible/);
});

test('invalid calendar dates and non-ISO date inputs fail closed', () => {
  const { parseComputeInput } = load();
  for (const value of ['2024-02-30','02/01/2024','2024-13-01','2024-02-01T30:00:00Z']) assert.throws(() => parseComputeInput({periodStart:value,periodEnd:'2024-03-01'}), {status:400});
});

test('mis_scores table keeps its real column/index shape', () => {
  const { getTableConfig } = require('drizzle-orm/pg-core');
  const { misScores } = require('../src/db/schema/mis.ts');
  const config = getTableConfig(misScores);
  assert.equal(config.name, 'mis_scores');
  assert.ok(config.indexes.some((i) => i.config.name === 'mis_scores_branch_user_period_unique'));
});

test('exported MIS routes reject anonymous reads and CSRF-less/role-less writes before any DB access', async () => {
  const previous = process.env.APP_ORIGIN; process.env.APP_ORIGIN = 'http://localhost:3030';
  try {
    const scores = require('../src/app/api/mis/scores/route.ts');
    const compute = require('../src/app/api/mis/compute/route.ts');
    const variance = require('../src/app/api/inventory/variance/route.ts');
    const get = (url) => new Request(url);
    assert.equal((await scores.GET(get('http://localhost:3030/api/mis/scores'))).status, 401);
    assert.equal((await variance.GET(get('http://localhost:3030/api/inventory/variance'))).status, 401);
    const post = (url, origin) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ periodStart: '2024-02-01', periodEnd: '2024-02-15' }) });
    assert.equal((await compute.POST(post('http://localhost:3030/api/mis/compute'))).status, 403); // missing origin -> CSRF rejection first
    assert.equal((await compute.POST(post('http://localhost:3030/api/mis/compute', 'http://localhost:3030'))).status, 401); // real origin, no session
  } finally { if (previous === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = previous; }
});
