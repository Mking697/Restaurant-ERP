const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/app/api/reports/_aggregation.ts');

// ---------------------------------------------------------------------------
// Unit tests for the pure aggregation math behind section 3b (Dashboard
// KPIs + sales-trend/food-cost/cash-reconciliation reports). No DB/HTTP —
// see tests/dashboard-reports.integration.cjs for the real Postgres+HTTP suite.
// ---------------------------------------------------------------------------

test('sumMoneyInr adds fixed-point paise correctly, including negatives', () => {
  const { sumMoneyInr } = load();
  assert.equal(sumMoneyInr(['10.50', '5.25']), '15.75');
  assert.equal(sumMoneyInr(['0.00']), '0.00');
  assert.equal(sumMoneyInr(['-10.00', '15.00']), '5.00');
  assert.equal(sumMoneyInr([]), '0.00');
});

test('istDayRange/istMonthRange produce exactly 24h / full-month windows at the fixed +5:30 offset', () => {
  const { istDayRange, istMonthRange } = load();
  // 2026-01-15 10:00 UTC = 2026-01-15 15:30 IST — same IST calendar day.
  const now = new Date('2026-01-15T10:00:00.000Z');
  const day = istDayRange(now);
  assert.equal(day.end.getTime() - day.start.getTime(), 24 * 60 * 60 * 1000);
  // IST midnight 2026-01-15 00:00 IST = 2026-01-14T18:30:00.000Z
  assert.equal(day.start.toISOString(), '2026-01-14T18:30:00.000Z');
  const month = istMonthRange(now);
  assert.equal(month.start.toISOString(), '2025-12-31T18:30:00.000Z'); // Jan 1 00:00 IST
  assert.equal(month.end.toISOString(), '2026-01-31T18:30:00.000Z'); // Feb 1 00:00 IST
});

test('parseDaysParam validates/clamps and defaults', () => {
  const { parseDaysParam } = load();
  assert.equal(parseDaysParam(null), 14);
  assert.equal(parseDaysParam('7'), 7);
  assert.throws(() => parseDaysParam('0'), { status: 400 });
  assert.throws(() => parseDaysParam('91'), { status: 400 });
  assert.throws(() => parseDaysParam('abc'), { status: 400 });
});

test('groupRevenueByDay pre-seeds every requested day to zero, including days with zero sales', () => {
  const { groupRevenueByDay } = load();
  const now = new Date('2026-01-15T12:00:00.000Z'); // 2026-01-15 17:30 IST
  const orders = [
    { createdAt: new Date('2026-01-15T06:00:00.000Z'), totalAmount: '500.00' }, // 2026-01-15 11:30 IST
    { createdAt: new Date('2026-01-14T20:00:00.000Z'), totalAmount: '300.00' }, // 2026-01-15 01:30 IST
    { createdAt: new Date('2026-01-13T20:00:00.000Z'), totalAmount: '100.00' }, // 2026-01-14 01:30 IST
  ];
  const buckets = groupRevenueByDay(orders, 3, now);
  assert.equal(buckets.length, 3);
  const byDate = Object.fromEntries(buckets.map((b) => [b.date, b]));
  assert.equal(byDate['2026-01-15'].revenueInr, '800.00');
  assert.equal(byDate['2026-01-15'].orderCount, 2);
  assert.equal(byDate['2026-01-14'].revenueInr, '100.00');
  assert.equal(byDate['2026-01-13'].revenueInr, '0.00'); // real zero, not omitted
  assert.equal(byDate['2026-01-13'].orderCount, 0);
});

test('computeInventoryValue excludes materials with no vendor rate and reports the count — never fabricates a rate', () => {
  const { computeInventoryValue } = load();
  const rows = [
    { rawMaterialId: 'chicken', qtyOnHand: '10.000' },
    { rawMaterialId: 'rice', qtyOnHand: '20.000' },
    { rawMaterialId: 'ghost-material', qtyOnHand: '5.000' }, // no rate
  ];
  const rateMap = new Map([['chicken', 300], ['rice', 60]]);
  const result = computeInventoryValue(rows, rateMap);
  assert.equal(result.totalInventoryValueInr, 10 * 300 + 20 * 60); // ghost-material excluded, not valued at 0 either
  assert.equal(result.ratesMissingForCount, 1);
  assert.deepEqual(result.materialsMissingRateIds, ['ghost-material']);
});

test('missing-rate count is distinct materials, not duplicate stock rows', () => {
  const { computeInventoryValue } = load();
  const value = computeInventoryValue([{ rawMaterialId: 'missing', qtyOnHand: '1' }, { rawMaterialId: 'missing', qtyOnHand: '2' }], new Map());
  assert.equal(value.ratesMissingForCount, 1);
});

test('isTaskOverdue boundary: OVERDUE status always counts; PENDING counts only once past dueAt; DONE/SKIPPED never count', () => {
  const { isTaskOverdue } = load();
  const now = new Date('2026-01-15T12:00:00.000Z');
  assert.equal(isTaskOverdue({ status: 'OVERDUE', dueAt: new Date('2099-01-01') }, now), true); // explicit status wins even if due in future
  assert.equal(isTaskOverdue({ status: 'PENDING', dueAt: new Date('2026-01-15T11:59:59.000Z') }, now), true); // past due
  assert.equal(isTaskOverdue({ status: 'PENDING', dueAt: new Date('2026-01-15T12:00:01.000Z') }, now), false); // not yet due
  assert.equal(isTaskOverdue({ status: 'DONE', dueAt: new Date('2020-01-01') }, now), false);
  assert.equal(isTaskOverdue({ status: 'SKIPPED', dueAt: new Date('2020-01-01') }, now), false);
});

test('cashReconSummary counts nonzero variance rows and sums shortage/excess with sign', () => {
  const { cashReconSummary } = load();
  const rows = [{ shortageExcessInr: '-150.00' }, { shortageExcessInr: '0.00' }, { shortageExcessInr: '90.00' }];
  const summary = cashReconSummary(rows);
  assert.equal(summary.totalRows, 3);
  assert.equal(summary.nonZeroVarianceCount, 2);
  assert.equal(summary.totalShortageExcessInr, '-60.00');
});

test('nested empty recipes and cycles are excluded with a reason, never costed as zero', () => {
  const { computeFoodCost, buildRecipeIndex } = load();
  const row = { id: 'r', branchId: 'b', menuItemId: 'dish', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'empty', qtyPerUnit: '1', lockedByHq: true };
  const line = { menuItemId: 'dish', menuItemName: 'Dish', qty: 1, sellingPrice: '100.00', lineRevenueInr: '100.00' };
  const result = computeFoodCost([line], buildRecipeIndex([row]), new Map());
  assert.equal(result.cogsInr, null);
  assert.match(result.excludedMenuItems[0].reason, /recipe/i);
  const cyclic = computeFoodCost([line], buildRecipeIndex([{ ...row, componentMenuItemId: 'dish' }]), new Map());
  assert.equal(cyclic.foodCostPercent, null);
  assert.match(cyclic.excludedMenuItems[0].reason, /circular/i);
});

test('allocateSaleRevenue keeps discounts/tax in the real order total and conserves paise', () => {
  const { allocateSaleRevenue } = load();
  assert.deepEqual(allocateSaleRevenue('90.01', [{ price: '50.00', qty: 1 }, { price: '50.00', qty: 1 }]), ['45.00', '45.01']);
  assert.deepEqual(allocateSaleRevenue('0.00', [{ price: '50.00', qty: 2 }]), ['0.00']);
});

function recipeFixture() {
  const { buildRecipeIndex } = load();
  const row = (over) => ({ id: 'r', branchId: 'b1', componentType: 'RAW_MATERIAL', rawMaterialId: null, componentMenuItemId: null, qtyPerUnit: '0', lockedByHq: true, ...over });
  return buildRecipeIndex([
    row({ id: 'r1', menuItemId: 'butter-chicken', componentType: 'RAW_MATERIAL', rawMaterialId: 'chicken', qtyPerUnit: '0.250' }),
    row({ id: 'r2', menuItemId: 'butter-chicken', componentType: 'RAW_MATERIAL', rawMaterialId: 'butter', qtyPerUnit: '0.050' }),
    row({ id: 'r3', menuItemId: 'dal', componentType: 'RAW_MATERIAL', rawMaterialId: 'lentils', qtyPerUnit: '0.150' }),
    // "mystery-item" sold but has NO recipe row at all — must be excluded.
  ]);
}

test('computeFoodCost prices every item with a complete recipe+rate chain and excludes the rest, nulling the overall %', () => {
  const { computeFoodCost } = load();
  const recipeIndex = recipeFixture();
  const rateMap = new Map([['chicken', 300], ['butter', 400]]); // lentils rate is deliberately missing
  const soldLines = [
    { menuItemId: 'butter-chicken', menuItemName: 'Butter Chicken', sellingPrice: '420.00', qty: 2, lineRevenueInr: '840.00' },
    { menuItemId: 'dal', menuItemName: 'Dal Makhani', sellingPrice: '260.00', qty: 1, lineRevenueInr: '260.00' }, // lentils rate missing -> excluded
    { menuItemId: 'mystery-item', menuItemName: 'Mystery Item', sellingPrice: '100.00', qty: 1, lineRevenueInr: '100.00' }, // no recipe -> excluded
  ];
  const result = computeFoodCost(soldLines, recipeIndex, rateMap);
  // unit cost = 0.25*300 + 0.05*400 = 75 + 20 = 95; 2 units sold -> 190.00
  const bc = result.items.find((i) => i.menuItemId === 'butter-chicken');
  assert.equal(bc.excluded, false);
  assert.equal(bc.lineCogsInr, '190.00');
  assert.equal(bc.foodCostPercent, Math.round((190 / 840) * 1000) / 10);
  const dal = result.items.find((i) => i.menuItemId === 'dal');
  assert.equal(dal.excluded, true);
  assert.match(dal.exclusionReason, /vendor rate missing/i);
  const mystery = result.items.find((i) => i.menuItemId === 'mystery-item');
  assert.equal(mystery.excluded, true);
  assert.match(mystery.exclusionReason, /no recipe/i);
  // Overall % must be null (not an understated figure) because something was excluded.
  assert.equal(result.cogsInr, null);
  assert.equal(result.foodCostPercent, null);
  assert.equal(result.excludedCount, 2);
});

test('computeFoodCost reports a real overall % when every sold item has a complete recipe+rate chain', () => {
  const { computeFoodCost } = load();
  const recipeIndex = recipeFixture();
  const rateMap = new Map([['chicken', 300], ['butter', 400]]);
  const soldLines = [{ menuItemId: 'butter-chicken', menuItemName: 'Butter Chicken', sellingPrice: '420.00', qty: 1, lineRevenueInr: '420.00' }];
  const result = computeFoodCost(soldLines, recipeIndex, rateMap);
  assert.equal(result.excludedCount, 0);
  assert.equal(result.cogsInr, '95.00');
  assert.equal(result.foodCostPercent, Math.round((95 / 420) * 1000) / 10);
});

test('computeFoodCost aggregates multiple lines for the same menu item before pricing', () => {
  const { computeFoodCost } = load();
  const recipeIndex = recipeFixture();
  const rateMap = new Map([['chicken', 300], ['butter', 400]]);
  const soldLines = [
    { menuItemId: 'butter-chicken', menuItemName: 'Butter Chicken', sellingPrice: '420.00', qty: 1, lineRevenueInr: '420.00' },
    { menuItemId: 'butter-chicken', menuItemName: 'Butter Chicken', sellingPrice: '420.00', qty: 1, lineRevenueInr: '420.00' },
  ];
  const result = computeFoodCost(soldLines, recipeIndex, rateMap);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].qtySold, 2);
  assert.equal(result.items[0].revenueInr, '840.00');
  assert.equal(result.items[0].lineCogsInr, '190.00');
});

test('computeFoodCost on zero sales returns a real zero revenue and null % (not a fabricated 0%)', () => {
  const { computeFoodCost } = load();
  const recipeIndex = recipeFixture();
  const result = computeFoodCost([], recipeIndex, new Map());
  assert.equal(result.revenueInr, '0.00');
  assert.equal(result.foodCostPercent, null);
  assert.equal(result.excludedCount, 0);
});
