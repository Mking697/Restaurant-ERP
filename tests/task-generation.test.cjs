const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
  return originalLoad.call(this, request, parent, isMain);
};
const load = () => require('../src/lib/server/task-generation.ts');

// ---------------------------------------------------------------------------
// istDateOnly — IST (UTC+5:30, no DST) calendar date from a UTC instant.
// ---------------------------------------------------------------------------
test('istDateOnly converts a UTC instant to its IST calendar date, including midnight rollover', () => {
  const { istDateOnly } = load();
  assert.equal(istDateOnly(new Date('2026-01-01T18:35:00Z')), '2026-01-02'); // 00:05 IST next day
  assert.equal(istDateOnly(new Date('2026-01-01T18:29:00Z')), '2026-01-01'); // 23:59 IST same day
  assert.equal(istDateOnly(new Date('2026-06-15T00:00:00Z')), '2026-06-15');
});

// ---------------------------------------------------------------------------
// cycleStartDateStr — deterministic per-frequency cycle anchoring.
// ---------------------------------------------------------------------------
test('cycleStartDateStr for day-based frequencies advances by a fixed interval', () => {
  const { cycleStartDateStr } = load();
  assert.equal(cycleStartDateStr('2026-01-01', 'DAILY', 0), '2026-01-01');
  assert.equal(cycleStartDateStr('2026-01-01', 'DAILY', 5), '2026-01-06');
  assert.equal(cycleStartDateStr('2026-01-01', 'WEEKLY', 1), '2026-01-08');
  assert.equal(cycleStartDateStr('2026-01-01', 'FORTNIGHTLY', 2), '2026-01-31');
});
test('cycleStartDateStr for month-based frequencies clamps day-of-month into short months', () => {
  const { cycleStartDateStr } = load();
  assert.equal(cycleStartDateStr('2026-01-31', 'MONTHLY', 1), '2026-02-28'); // 2026 not a leap year
  assert.equal(cycleStartDateStr('2026-01-31', 'MONTHLY', 2), '2026-03-31'); // clamp does not carry over
  assert.equal(cycleStartDateStr('2026-01-31', 'QUARTERLY', 1), '2026-04-30');
  assert.equal(cycleStartDateStr('2026-01-31', 'HALF_YEARLY', 1), '2026-07-31');
  assert.equal(cycleStartDateStr('2026-01-31', 'YEARLY', 1), '2027-01-31');
});

// ---------------------------------------------------------------------------
// isScheduledDay — the per-frequency scheduling-day decision against a fixed "today".
// ---------------------------------------------------------------------------
test('isScheduledDay is false before the anchor date for every frequency', () => {
  const { isScheduledDay } = load();
  for (const f of ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']) {
    assert.equal(isScheduledDay('2026-03-01', f, '2026-02-28'), false, f);
  }
});
test('isScheduledDay DAILY is true on the anchor date and every day after', () => {
  const { isScheduledDay } = load();
  assert.equal(isScheduledDay('2026-01-01', 'DAILY', '2026-01-01'), true);
  assert.equal(isScheduledDay('2026-01-01', 'DAILY', '2026-01-02'), true);
  assert.equal(isScheduledDay('2026-01-01', 'DAILY', '2026-02-14'), true);
});
test('isScheduledDay WEEKLY is true only on exact 7-day multiples from the anchor', () => {
  const { isScheduledDay } = load();
  assert.equal(isScheduledDay('2026-01-01', 'WEEKLY', '2026-01-08'), true);
  assert.equal(isScheduledDay('2026-01-01', 'WEEKLY', '2026-01-07'), false);
  assert.equal(isScheduledDay('2026-01-01', 'WEEKLY', '2026-01-09'), false);
});
test('isScheduledDay FORTNIGHTLY is true only on exact 15-day multiples from the anchor', () => {
  const { isScheduledDay } = load();
  assert.equal(isScheduledDay('2026-01-01', 'FORTNIGHTLY', '2026-01-16'), true);
  assert.equal(isScheduledDay('2026-01-01', 'FORTNIGHTLY', '2026-01-15'), false);
});
test('isScheduledDay MONTHLY matches the anchor day-of-month with short-month clamping', () => {
  const { isScheduledDay } = load();
  assert.equal(isScheduledDay('2026-01-31', 'MONTHLY', '2026-02-28'), true); // clamp
  assert.equal(isScheduledDay('2026-01-31', 'MONTHLY', '2026-03-31'), true); // not carried over from Feb's clamp
  assert.equal(isScheduledDay('2026-01-31', 'MONTHLY', '2026-03-28'), false);
});
test('isScheduledDay QUARTERLY/HALF_YEARLY/YEARLY match multi-month cycles', () => {
  const { isScheduledDay } = load();
  assert.equal(isScheduledDay('2026-01-15', 'QUARTERLY', '2026-04-15'), true);
  assert.equal(isScheduledDay('2026-01-15', 'QUARTERLY', '2026-03-15'), false);
  assert.equal(isScheduledDay('2026-01-15', 'HALF_YEARLY', '2026-07-15'), true);
  assert.equal(isScheduledDay('2026-01-15', 'YEARLY', '2027-01-15'), true);
  assert.equal(isScheduledDay('2026-01-15', 'YEARLY', '2026-07-15'), false);
});

// ---------------------------------------------------------------------------
// pendingCycleIndexes — first-run behavior, missed-day catch-up, idempotency, bound.
// ---------------------------------------------------------------------------
test('pendingCycleIndexes on a never-generated definition only returns the current cycle, not full history', () => {
  const { pendingCycleIndexes } = load();
  assert.deepEqual(pendingCycleIndexes('2020-01-01', 'DAILY', '2026-01-10', null), [latestIdx('2020-01-01', '2026-01-10')]);
  function latestIdx(anchor, today) {
    const { latestCycleIndex } = load();
    return latestCycleIndex(anchor, 'DAILY', today);
  }
});
test('pendingCycleIndexes carries a missed day forward without colliding with the next real occurrence', () => {
  const { pendingCycleIndexes, latestCycleIndex } = load();
  const anchor = '2026-01-01';
  const yesterdayIdx = latestCycleIndex(anchor, 'DAILY', '2026-01-04');
  const todayIdx = latestCycleIndex(anchor, 'DAILY', '2026-01-05');
  // cron last successfully generated 2026-01-03 (idx = yesterdayIdx - 1); today is 2026-01-05
  const pending = pendingCycleIndexes(anchor, 'DAILY', '2026-01-05', yesterdayIdx - 1);
  assert.deepEqual(pending, [yesterdayIdx, todayIdx]);
  assert.notEqual(pending[0], pending[1]);
});
test('pendingCycleIndexes is idempotent: a same-day second run after generation returns nothing new', () => {
  const { pendingCycleIndexes, latestCycleIndex } = load();
  const latest = latestCycleIndex('2026-01-01', 'DAILY', '2026-01-05');
  assert.deepEqual(pendingCycleIndexes('2026-01-01', 'DAILY', '2026-01-05', latest), []);
});
test('pendingCycleIndexes caps a huge catch-up gap at maxCatchUp', () => {
  const { pendingCycleIndexes, latestCycleIndex } = load();
  const latest = latestCycleIndex('2000-01-01', 'DAILY', '2026-01-10');
  const pending = pendingCycleIndexes('2000-01-01', 'DAILY', '2026-01-10', null === null ? -1000000 : null, 10);
  assert.equal(pending.length, 10);
  assert.equal(pending[pending.length - 1], latest);
});

// ---------------------------------------------------------------------------
// dueAtForCycle — IST wall-clock shiftTime converted to the correct UTC instant.
// ---------------------------------------------------------------------------
test('dueAtForCycle converts an IST wall-clock shiftTime into the correct UTC instant', () => {
  const { dueAtForCycle } = load();
  const due = dueAtForCycle('2026-01-05', '09:30');
  assert.equal(due.toISOString(), '2026-01-05T04:00:00.000Z'); // 09:30 IST = 04:00 UTC
});

// ---------------------------------------------------------------------------
// planGeneration — global-vs-branch-scoped definitions, holiday skip, pure (no DB).
// ---------------------------------------------------------------------------
function baseDefinition(overrides = {}) {
  return {
    id: 'def-1', branchId: null, title: 'T', description: '', assignedToId: 'u1', assignedById: 'u2',
    frequency: 'DAILY', assignDate: new Date('2026-01-01T00:00:00Z'), shiftTime: '09:00', ...overrides,
  };
}
test('planGeneration generates one occurrence PER active branch for a global (branchId null) definition', () => {
  const { planGeneration } = load();
  const def = baseDefinition();
  const now = new Date('2026-01-05T06:00:00Z'); // past 09:00 IST on 01-05
  const plans = planGeneration(def, now, ['branch-a', 'branch-b'], {}, {});
  assert.equal(plans.length, 2);
  assert.deepEqual(plans.map(p => p.branchId).sort(), ['branch-a', 'branch-b']);
  assert.ok(plans.every(p => p.naturalCycleStartDate === '2026-01-05'));
});
test('planGeneration only targets its own branch for a branch-scoped definition', () => {
  const { planGeneration } = load();
  const def = baseDefinition({ branchId: 'branch-a' });
  const now = new Date('2026-01-05T06:00:00Z');
  const plans = planGeneration(def, now, ['branch-a', 'branch-b'], {}, {});
  assert.deepEqual(plans.map(p => p.branchId), ['branch-a']);
});
test('planGeneration skips a scheduled date present in that branch holiday calendar without affecting other branches', () => {
  const { planGeneration } = load();
  const def = baseDefinition();
  const now = new Date('2026-01-05T06:00:00Z');
  const holidays = { 'branch-a': new Set(['2026-01-05']) };
  const plans = planGeneration(def, now, ['branch-a', 'branch-b'], holidays, {});
  assert.deepEqual(plans.map(p => p.branchId), ['branch-b']);
});
test('planGeneration carries a missed day forward with a distinct naturalCycleStartDate per branch, no collision with today', () => {
  const { planGeneration } = load();
  const def = baseDefinition({ branchId: 'branch-a' });
  const now = new Date('2026-01-05T06:00:00Z');
  const plans = planGeneration(def, now, ['branch-a'], {}, { 'branch-a': '2026-01-03' });
  assert.deepEqual(plans.map(p => p.naturalCycleStartDate), ['2026-01-04', '2026-01-05']);
});

// ---------------------------------------------------------------------------
// shouldEscalate — exact 30-minute boundary, no re-escalation, status gating.
// ---------------------------------------------------------------------------
test('shouldEscalate is false exactly at the 30-minute boundary and true just after it', () => {
  const { shouldEscalate } = load();
  const dueAt = new Date('2026-01-05T09:00:00Z');
  assert.equal(shouldEscalate({ status: 'PENDING', overdueEscalatedAt: null, dueAt }, new Date('2026-01-05T09:30:00.000Z')), false);
  assert.equal(shouldEscalate({ status: 'PENDING', overdueEscalatedAt: null, dueAt }, new Date('2026-01-05T09:30:00.001Z')), true);
});
test('shouldEscalate never re-escalates an already-escalated instance', () => {
  const { shouldEscalate } = load();
  const dueAt = new Date('2026-01-05T09:00:00Z');
  const now = new Date('2026-01-05T10:00:00Z');
  assert.equal(shouldEscalate({ status: 'PENDING', overdueEscalatedAt: new Date('2026-01-05T09:31:00Z'), dueAt }, now), false);
});
test('shouldEscalate only applies to PENDING/IN_PROGRESS, never DONE/OVERDUE/SKIPPED', () => {
  const { shouldEscalate } = load();
  const dueAt = new Date('2026-01-05T09:00:00Z');
  const now = new Date('2026-01-05T10:00:00Z');
  for (const status of ['DONE', 'OVERDUE', 'SKIPPED', 'ESCALATED']) {
    assert.equal(shouldEscalate({ status, overdueEscalatedAt: null, dueAt }, now), false, status);
  }
  assert.equal(shouldEscalate({ status: 'IN_PROGRESS', overdueEscalatedAt: null, dueAt }, now), true);
});
