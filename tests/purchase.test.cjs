const fs=require('node:fs'),ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const test=require('node:test'),assert=require('node:assert/strict');

test('indent lines: 1-50 bound, positive qty, unknown fields rejected', () => {
  const p = require('../src/lib/server/purchase.ts');
  assert.throws(() => p.parseIndentLines([]), e => e.status === 400);
  assert.throws(() => p.parseIndentLines(Array.from({ length: 51 }, () => ({ rawMaterialId: 'm', qty: '1' }))), e => e.status === 400);
  assert.throws(() => p.parseIndentLines([{ rawMaterialId: 'm', qty: '0' }]), e => e.status === 400);
  assert.throws(() => p.parseIndentLines([{ rawMaterialId: 'm', qty: '-1' }]), e => e.status === 400);
  assert.throws(() => p.parseIndentLines([{ rawMaterialId: 'm', qty: '1', extra: 'x' }]), e => e.status === 400);
  assert.deepEqual(p.parseIndentLines([{ rawMaterialId: 'm1', qty: '2.5' }]), [{ rawMaterialId: 'm1', qty: '2.5' }]);
  assert.equal(p.parseIndentLines(Array.from({ length: 50 }, () => ({ rawMaterialId: 'm', qty: '1' }))).length, 50);
});

test('PO lines: general purchase uses itemDescription, store purchase requires rawMaterialId, never mixed', () => {
  const p = require('../src/lib/server/purchase.ts');
  assert.deepEqual(p.parsePoLines([{ itemDescription: 'Chair repair', qty: '1', rate: '500' }], true), [{ rawMaterialId: null, itemDescription: 'Chair repair', qty: '1', rate: '500' }]);
  assert.throws(() => p.parsePoLines([{ rawMaterialId: 'm1', itemDescription: 'x', qty: '1', rate: '500' }], true), e => e.status === 400);
  assert.deepEqual(p.parsePoLines([{ rawMaterialId: 'm1', qty: '20', rate: '45.50' }], false), [{ rawMaterialId: 'm1', itemDescription: '', qty: '20', rate: '45.50' }]);
  assert.throws(() => p.parsePoLines([{ itemDescription: 'x', qty: '1', rate: '1' }], false), e => e.status === 400);
  assert.throws(() => p.parsePoLines([{ rawMaterialId: 'm1', qty: '0', rate: '1' }], false), e => e.status === 400);
  assert.throws(() => p.parsePoLines([], false), e => e.status === 400);
});

test('PO kind is a strict boolean and store purchases require an indent', () => {
  const p = require('../src/lib/server/purchase.ts');
  for (const value of [undefined, null, 'true', 'false', 0, 1, {}, []]) {
    assert.throws(() => p.parseGeneralPurchase(value), e => e.status === 400);
  }
  assert.equal(p.parseGeneralPurchase(true), true);
  assert.equal(p.parseGeneralPurchase(false), false);
  for (const value of [undefined, null, '']) assert.throws(() => p.parsePoIndentId(value, false), e => e.status === 400);
  assert.equal(p.parsePoIndentId('approved-id', false), 'approved-id');
  assert.equal(p.parsePoIndentId(undefined, true), null);
  assert.throws(() => p.parsePoIndentId('approved-id', true), e => e.status === 400);
});

test('store PO matches every approved material quantity using exact decimal aggregates', () => {
  const p = require('../src/lib/server/purchase.ts');
  const approved = [{ rawMaterialId: 'a', qty: '0.1' }, { rawMaterialId: 'a', qty: '0.2' }, { rawMaterialId: 'b', qty: '5.000' }];
  const line = (rawMaterialId, qty) => ({ rawMaterialId, qty, rate: '1', itemDescription: '' });
  p.assertPoMatchesIndent([line('b', '5'), line('a', '0.300')], approved);
  p.assertPoMatchesIndent([line('a', '0.1'), line('a', '0.2'), line('b', '5')], approved);
  for (const lines of [
    [line('a', '0.3')], // omitted approved material
    [line('a', '0.3'), line('c', '5')], // substitution
    [line('a', '0.3'), line('b', '5'), line('c', '1')], // unapproved extra
    [line('a', '0.301'), line('b', '5')], // excess
    [line('a', '0.299'), line('b', '5')], // partial
    [line('a', '0.2'), line('a', '0.2'), line('b', '5')], // duplicate splitting excess
  ]) assert.throws(() => p.assertPoMatchesIndent(lines, approved), e => e.status === 400);
  assert.throws(() => p.assertPoMatchesIndent([line('a', '1')], []), e => e.status === 400);
  assert.throws(() => p.assertPoMatchesIndent([line('a', '1')], [{ rawMaterialId: 'a', qty: '0' }]), e => e.status === 400);
});

test('indent status transitions deny out-of-order moves', () => {
  const p = require('../src/lib/server/purchase.ts');
  p.assertIndentDraft('DRAFT');
  for (const s of ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PO_RAISED']) assert.throws(() => p.assertIndentDraft(s), e => e.status === 409);
  p.assertIndentPending('PENDING_APPROVAL');
  for (const s of ['DRAFT', 'APPROVED', 'REJECTED', 'PO_RAISED']) assert.throws(() => p.assertIndentPending(s), e => e.status === 409);
  p.assertIndentApprovedForPo('APPROVED');
  for (const s of ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'PO_RAISED']) assert.throws(() => p.assertIndentApprovedForPo(s), e => e.status === 409);
});

test('PO bill/receive steps are each one-shot, never re-run', () => {
  const p = require('../src/lib/server/purchase.ts');
  p.assertPoNotBilled(null);
  assert.throws(() => p.assertPoNotBilled(new Date()), e => e.status === 409);
  p.assertPoNotReceived(null);
  assert.throws(() => p.assertPoNotReceived(new Date()), e => e.status === 409);
});

test('bill URL is optional text/URL only, never a fabricated upload path', () => {
  const p = require('../src/lib/server/purchase.ts');
  assert.equal(p.billUrl(undefined), '');
  assert.equal(p.billUrl(null), '');
  assert.equal(p.billUrl(''), '');
  assert.equal(p.billUrl('https://example.com/bill.pdf'), 'https://example.com/bill.pdf');
  assert.throws(() => p.billUrl(123), e => e.status === 400);
});

test('generated PO numbers are unique and follow the PO-<time>-<rand> shape', () => {
  const p = require('../src/lib/server/purchase.ts');
  const a = p.generatePoNumber(), b = p.generatePoNumber();
  assert.notEqual(a, b);
  assert.match(a, /^PO-[0-9A-Z]+-[0-9A-Z]{4}$/);
});

test('status filters reject values outside the real enum', () => {
  const p = require('../src/lib/server/purchase.ts');
  assert.equal(p.parseStatusFilter(null, p.INDENT_STATUSES), undefined);
  assert.equal(p.parseStatusFilter('APPROVED', p.INDENT_STATUSES), 'APPROVED');
  assert.throws(() => p.parseStatusFilter('NOT_A_STATUS', p.INDENT_STATUSES), e => e.status === 400);
  assert.throws(() => p.parseStatusFilter('APPROVED', p.PO_STATUSES), e => e.status === 400);
});

test('aggregateIndentLinesByMaterial merges duplicate materials with exact decimal sums', () => {
  const p = require('../src/lib/server/purchase.ts');
  assert.deepEqual(
    p.aggregateIndentLinesByMaterial([{ rawMaterialId: 'a', qty: '0.1' }, { rawMaterialId: 'a', qty: '0.2' }, { rawMaterialId: 'b', qty: '5' }]).sort((x, y) => x.rawMaterialId.localeCompare(y.rawMaterialId)),
    [{ rawMaterialId: 'a', qty: '0.300' }, { rawMaterialId: 'b', qty: '5.000' }],
  );
});

test('evaluateIndentSpike: no real average for a material never fabricates a figure', () => {
  const p = require('../src/lib/server/purchase.ts');
  const result = p.evaluateIndentSpike([{ rawMaterialId: 'unknown-material', qty: '100' }], new Map());
  assert.equal(result.dailyAvgQtyJson, null);
  assert.equal(result.spikePercent, null);
  assert.equal(result.hasData, false);
  assert.equal(result.isSpike, false);
});

test('evaluateIndentSpike: mixed known/insufficient baselines never auto-approve or invent partial spike figures', () => {
  const p = require('../src/lib/server/purchase.ts');
  for (const knownQty of ['11', '20']) {
    for (const unknownAverage of [undefined, { rawMaterialId: 'rice', avgQtyMillis: 1000n, sampleCount: 2 }, { rawMaterialId: 'rice', avgQtyMillis: 0n, sampleCount: 3 }]) {
      const averages = new Map([['chicken', { rawMaterialId: 'chicken', avgQtyMillis: 10000n, sampleCount: 3 }]]);
      if (unknownAverage) averages.set('rice', unknownAverage);
      for (const lines of [
        [{ rawMaterialId: 'chicken', qty: knownQty }, { rawMaterialId: 'rice', qty: '999999' }],
        [{ rawMaterialId: 'rice', qty: '999999' }, { rawMaterialId: 'chicken', qty: knownQty }],
      ]) {
        const result = p.evaluateIndentSpike(lines, averages);
        assert.deepEqual(result, { hasData: false, isSpike: false, dailyAvgQtyJson: null, spikePercent: null });
        assert.equal(result.isSpike || !result.hasData ? 'PENDING_APPROVAL' : 'APPROVED', 'PENDING_APPROVAL');
      }
    }
  }
});

test('evaluateIndentSpike: real average exists, requested qty within 25% does not spike', () => {
  const p = require('../src/lib/server/purchase.ts');
  const averages = new Map([['chicken', { rawMaterialId: 'chicken', avgQtyMillis: 10000n, sampleCount: 3 }]]);
  const result = p.evaluateIndentSpike([{ rawMaterialId: 'chicken', qty: '11' }], averages);
  assert.equal(result.isSpike, false);
  assert.equal(result.dailyAvgQtyJson, null);
  assert.equal(result.spikePercent, null);
  assert.equal(result.hasData, true);
});

test('evaluateIndentSpike: real average exists, requested qty over 25% spikes with accurate stored percent', () => {
  const p = require('../src/lib/server/purchase.ts');
  const averages = new Map([['chicken', { rawMaterialId: 'chicken', avgQtyMillis: 10000n, sampleCount: 3 }]]);
  const result = p.evaluateIndentSpike([{ rawMaterialId: 'chicken', qty: '20' }], averages);
  assert.equal(result.isSpike, true);
  assert.equal(result.spikePercent, '100.00');
  assert.deepEqual(result.dailyAvgQtyJson, { chicken: { avgQty: '10.000', sampleCount: 3, requestedQty: '20.000', pctOverAvg: 100 } });
});

test('evaluateIndentSpike: exactly at the 25% boundary does not spike (strictly greater-than only)', () => {
  const p = require('../src/lib/server/purchase.ts');
  const averages = new Map([['chicken', { rawMaterialId: 'chicken', avgQtyMillis: 10000n, sampleCount: 3 }]]);
  assert.equal(p.evaluateIndentSpike([{ rawMaterialId: 'chicken', qty: '12.5' }], averages).isSpike, false);
  assert.equal(p.evaluateIndentSpike([{ rawMaterialId: 'chicken', qty: '12.501' }], averages).isSpike, true);
});

test('evaluateIndentSpike: multi-line indent reports the highest line\'s % over average and only spiking lines trigger it', () => {
  const p = require('../src/lib/server/purchase.ts');
  const averages = new Map([
    ['chicken', { rawMaterialId: 'chicken', avgQtyMillis: 10000n, sampleCount: 3 }],
    ['rice', { rawMaterialId: 'rice', avgQtyMillis: 5000n, sampleCount: 5 }],
  ]);
  const result = p.evaluateIndentSpike([{ rawMaterialId: 'chicken', qty: '11' }, { rawMaterialId: 'rice', qty: '20' }], averages);
  assert.equal(result.isSpike, true);
  assert.equal(result.spikePercent, '300.00');
  assert.ok(result.dailyAvgQtyJson.chicken && result.dailyAvgQtyJson.rice);
});

test('allowedFields fails closed on unknown keys, same convention as every other module', () => {
  const p = require('../src/lib/server/purchase.ts');
  assert.throws(() => p.allowedFields({ branchId: 'b', extra: 1 }, ['branchId']), e => e.status === 400);
  p.allowedFields({ branchId: 'b' }, ['branchId']);
});
