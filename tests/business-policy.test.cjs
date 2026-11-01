const fs=require('node:fs'),ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const test=require('node:test'),assert=require('node:assert/strict');

// Validation happens BEFORE any settings-table write, so these invalid-input
// cases never touch the database — safe to run without a live Postgres
// connection, same convention as purchase.test.cjs's pure-function tests.
// P0 decision (October 31, 2026): both of these thresholds are explicitly
// Owner-configurable at runtime, not fixed in code.

test('saveBusinessPolicy rejects a negative indent value threshold before any write', async () => {
  const bp = require('../src/lib/server/business-policy.ts');
  await assert.rejects(bp.saveBusinessPolicy({ indentValueThresholdTsh: '-5' }), e => e.status === 400);
});

test('saveBusinessPolicy rejects a non-numeric indent value threshold before any write', async () => {
  const bp = require('../src/lib/server/business-policy.ts');
  await assert.rejects(bp.saveBusinessPolicy({ indentValueThresholdTsh: 'abc' }), e => e.status === 400);
  await assert.rejects(bp.saveBusinessPolicy({ indentValueThresholdTsh: '1,000' }), e => e.status === 400);
});

test('saveBusinessPolicy rejects more than 2 decimal places on the money threshold', async () => {
  const bp = require('../src/lib/server/business-policy.ts');
  await assert.rejects(bp.saveBusinessPolicy({ indentValueThresholdTsh: '500000.123' }), e => e.status === 400);
});

test('saveBusinessPolicy rejects a cost/yield tolerance percent above 100', async () => {
  const bp = require('../src/lib/server/business-policy.ts');
  await assert.rejects(bp.saveBusinessPolicy({ costYieldTolerancePercent: '150' }), e => e.status === 400);
});

test('saveBusinessPolicy rejects a negative or malformed cost/yield tolerance percent', async () => {
  const bp = require('../src/lib/server/business-policy.ts');
  await assert.rejects(bp.saveBusinessPolicy({ costYieldTolerancePercent: '-1' }), e => e.status === 400);
  await assert.rejects(bp.saveBusinessPolicy({ costYieldTolerancePercent: '5%' }), e => e.status === 400);
});
