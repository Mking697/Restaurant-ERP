const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: name => name in overrides ? overrides[name] : require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name), console, crypto }, { filename });
  return module.exports;
}

test('GAP-021 exact inventory position and unit rounding do not double-count dispatched linked supply', () => {
  const mod = load('src/lib/server/reorder-policy.ts', {
    './permissions': { HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } } },
  });
  const position = mod.computeInventoryPosition({ usable: '2.125', requisitionOutstanding: '3.000', transferInTransit: '2.000', externalPoOutstanding: '1.500', qualityPending: '0.375' });
  assert.equal(position, '9.000');
  assert.equal(mod.computeSuggestedQty('12.000', position, 'kg'), '3.000');
  assert.equal(mod.computeSuggestedQty('12.001', '9.000', 'pcs'), '4.000');
  assert.equal(mod.computeSuggestedQty('12.001', '9.000', 'count'), '4.000');
  assert.equal(mod.computeSuggestedQty('12.001', '9.000', 'ltr'), '3.001');
});

test('GAP-021 supply fingerprint is stable and changed supply position is stale', () => {
  const mod = load('src/lib/server/reorder-policy.ts', {
    './permissions': { HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } } },
  });
  const a = mod.supplyPositionFingerprint({ branchId: 'b1', rawMaterialId: 'm1', unit: 'kg', maxStock: '10.000', usable: '2.000', requisitionOutstanding: '1.000', transferInTransit: '0.000', externalPoOutstanding: '0.000', qualityPending: '0.000', internalAvailable: '4.000' });
  const b = mod.supplyPositionFingerprint({ qualityPending: '0.000', internalAvailable: '4.000', externalPoOutstanding: '0.000', transferInTransit: '0.000', requisitionOutstanding: '1.000', usable: '2.000', maxStock: '10.000', unit: 'kg', rawMaterialId: 'm1', branchId: 'b1' });
  const changed = mod.supplyPositionFingerprint({ branchId: 'b1', rawMaterialId: 'm1', unit: 'kg', maxStock: '10.000', usable: '3.000', requisitionOutstanding: '1.000', transferInTransit: '0.000', externalPoOutstanding: '0.000', qualityPending: '0.000', internalAvailable: '4.000' });
  assert.equal(a, b);
  assert.notEqual(a, changed);
});

test('GAP-021 internal allocation is bounded by proven central availability', () => {
  const mod = load('src/lib/server/reorder-policy.ts', {
    './permissions': { HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } } },
  });
  assert.equal(JSON.stringify(mod.allocateSupply('6.250', '4.000')), JSON.stringify({ internalQty: '4.000', externalQty: '2.250' }));
  assert.equal(JSON.stringify(mod.allocateSupply('2.000', '4.000')), JSON.stringify({ internalQty: '2.000', externalQty: '0.000' }));
  assert.equal(JSON.stringify(mod.allocateSupply('4.000', '2.750', 'pcs')), JSON.stringify({ internalQty: '2.000', externalQty: '2.000' }));
  assert.throws(() => mod.allocateSupply('2.000', null), error => error.status === 409 && /cannot be determined/i.test(error.message));
});

test('GAP-022 subject revision identity reopens corrected evidence', () => {
  const modules = load('src/lib/moduleAccess.ts');
  const permissions = load('src/lib/server/permissions.ts', { '../moduleAccess': modules });
  const review = load('src/lib/server/ho-stock-review-policy.ts', { './permissions': permissions });
  assert.equal(review.hoSubjectIdentity('EOD_STOCK', 'report-1', 1), 'EOD_STOCK:report-1:r1');
  assert.equal(review.hoSubjectIdentity('EOD_STOCK', 'report-1', 2), 'EOD_STOCK:report-1:r2');
  assert.notEqual(review.hoSubjectIdentity('EOD_STOCK', 'report-1', 1), review.hoSubjectIdentity('EOD_STOCK', 'report-1', 2));
  assert.equal(review.hoSubjectIdentity('GRN', 'grn-1', 1), 'GRN:grn-1:r1');
});

test('GAP-022 exact HO permission is limited to Owner and explicitly granted HQ/Central users', () => {
  const modules = load('src/lib/moduleAccess.ts');
  const permissions = load('src/lib/server/permissions.ts', { '../moduleAccess': modules });
  assert.ok(modules.MODULE_KEYS.includes('HO_STOCK_REVIEW'));
  const branchManager = { id: 'bm', role: 'BRANCH_MANAGER', branchId: 'b1', moduleAccess: ['HO_STOCK_REVIEW'] };
  assert.throws(() => permissions.hoReviewScope(branchManager, 'b1'), error => error.status === 403);
  assert.throws(() => permissions.hoReviewScope(branchManager, 'b2'), error => error.status === 403);
  const hq = { id: 'hq', role: 'CENTRAL_STORE_MGR', branchId: null, moduleAccess: ['HO_STOCK_REVIEW'] };
  assert.equal(permissions.hoReviewScope(hq, 'b2'), 'b2');
  const branchBoundCentral = { ...hq, branchId: 'b1' };
  assert.throws(() => permissions.hoReviewScope(branchBoundCentral, 'b1'), error => error.status === 403);
  const missing = { ...hq, moduleAccess: [] };
  assert.throws(() => permissions.hoReviewScope(missing, 'b2'), error => error.status === 403);
  const owner = { id: 'o', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
  assert.equal(permissions.hoReviewScope(owner, 'b2'), 'b2');
});

test('GAP-022 escalation stays unresolved until a later acknowledgment', () => {
  const modules = load('src/lib/moduleAccess.ts');
  const permissions = load('src/lib/server/permissions.ts', { '../moduleAccess': modules });
  const review = load('src/lib/server/ho-stock-review-policy.ts', { './permissions': permissions });
  const escalation = { action: 'ESCALATE', reason: 'Short delivery unresolved', createdAt: new Date('2026-11-02T08:00:00Z') };
  const acknowledgment = { action: 'ACKNOWLEDGE', reason: '', createdAt: new Date('2026-11-02T09:00:00Z') };
  assert.equal(review.isHoSubjectResolved([]), false);
  assert.equal(review.isHoSubjectResolved([escalation]), false);
  assert.equal(review.isHoSubjectResolved([escalation, acknowledgment]), true);
  assert.equal(review.latestHoReviewEvent([acknowledgment, escalation]).action, 'ACKNOWLEDGE');
});

test('GAP-022 escalation reason and action identity are validated', () => {
  const modules = load('src/lib/moduleAccess.ts');
  const permissions = load('src/lib/server/permissions.ts', { '../moduleAccess': modules });
  const review = load('src/lib/server/ho-stock-review-policy.ts', { './permissions': permissions });
  assert.equal(JSON.stringify(review.parseHoReviewAction({ action: 'ACKNOWLEDGE', actionKey: 'a1' })), JSON.stringify({ action: 'ACKNOWLEDGE', actionKey: 'a1', reason: '' }));
  assert.throws(() => review.parseHoReviewAction({ action: 'ESCALATE', actionKey: 'a2', reason: '  ' }), error => error.status === 400);
  assert.equal(JSON.stringify(review.parseHoReviewAction({ action: 'ESCALATE', actionKey: 'a3', reason: 'Short delivery unresolved' })), JSON.stringify({ action: 'ESCALATE', actionKey: 'a3', reason: 'Short delivery unresolved' }));
});
