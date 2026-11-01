const fs=require('node:fs'),ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const test=require('node:test'),assert=require('node:assert/strict');

// GAP-008 (P0 decision, October 31, 2026): Tanzania EAT (fixed UTC+3, no
// DST) is the single canonical business-calendar definition every other
// file (shifts.ts, workforce-calculation.ts, reports/_aggregation.ts,
// task-generation.ts, mis-period.ts) now delegates to.

test('businessDateString returns the Tanzania EAT calendar date, including cross-midnight rollover', () => {
  const bc = require('../src/lib/server/business-calendar.ts');
  assert.equal(bc.businessDateString(new Date('2026-01-01T20:59:00Z')), '2026-01-01'); // 23:59 EAT same day
  assert.equal(bc.businessDateString(new Date('2026-01-01T21:00:00Z')), '2026-01-02'); // 00:00 EAT next day
  assert.equal(bc.businessDateString(new Date('2026-06-15T00:00:00Z')), '2026-06-15');
});

test('businessTimeHHMM formats 24h wall-clock time in Tanzania EAT', () => {
  const bc = require('../src/lib/server/business-calendar.ts');
  assert.equal(bc.businessTimeHHMM(new Date('2026-01-15T06:00:00Z')), '09:00');
  assert.equal(bc.businessTimeHHMM(new Date('2026-01-15T21:00:00Z')), '00:00'); // midnight EAT
});

test('businessDayRange produces an exact 24h window anchored at Tanzania EAT midnight', () => {
  const bc = require('../src/lib/server/business-calendar.ts');
  const now = new Date('2026-01-15T10:00:00.000Z'); // 13:00 EAT, same EAT day
  const { start, end } = bc.businessDayRange(now);
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  assert.equal(start.toISOString(), '2026-01-14T21:00:00.000Z'); // 2026-01-15 00:00 EAT
});

test('businessMonthRange spans exactly the Tanzania EAT calendar month', () => {
  const bc = require('../src/lib/server/business-calendar.ts');
  const { start, end } = bc.businessMonthRange(new Date('2026-01-15T10:00:00.000Z'));
  assert.equal(start.toISOString(), '2025-12-31T21:00:00.000Z'); // Jan 1 00:00 EAT
  assert.equal(end.toISOString(), '2026-01-31T21:00:00.000Z'); // Feb 1 00:00 EAT
});

test('businessDayKey labels an already-recorded instant by its Tanzania EAT day, independent of businessDateString', () => {
  const bc = require('../src/lib/server/business-calendar.ts');
  assert.equal(bc.businessDayKey(new Date('2026-01-01T21:05:00Z')), '2026-01-02');
  assert.equal(bc.businessDayKey(new Date('2026-01-01T20:59:00Z')), '2026-01-01');
});

test('BUSINESS_TIMEZONE is the Tanzania identifier, not the old India one', () => {
  const bc = require('../src/lib/server/business-calendar.ts');
  assert.equal(bc.BUSINESS_TIMEZONE, 'Africa/Dar_es_Salaam');
});
