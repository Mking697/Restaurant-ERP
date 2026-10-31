const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/cogs.ts');
const { bomRecipes } = require('../src/db/schema/menu.ts');
const { vendorRates } = require('../src/db/schema/vendors.ts');

// Minimal drizzle-shaped fake tx: distinguishes which table .from() was
// called with by reference identity against the real schema objects, same
// tables cogs.ts itself imports.
function makeTx(recipeRows, rateRows) {
  return {
    select: () => ({
      from: (table) => {
        if (table === bomRecipes) return { where: () => Promise.resolve(recipeRows) };
        if (table === vendorRates) return { where: () => ({ orderBy: () => Promise.resolve(rateRows) }) };
        throw new Error('unexpected table in fake tx');
      },
    }),
  };
}

const recipeRow = (over) => ({ id: 'r', branchId: 'b1', menuItemId: 'dish', componentType: 'RAW_MATERIAL', rawMaterialId: null, componentMenuItemId: null, qtyPerUnit: '0.100', lockedByHq: true, ...over });
const rateRow = (over) => ({ id: 'vr', vendorId: 'v1', rawMaterialId: 'chicken', rate: '200.00', lockedByUserId: 'u1', lockedAt: new Date('2026-01-01'), isActive: true, ...over });

test('computeOrderCogs prices a flat raw-material dish using the latest locked vendor rate', async () => {
  const { computeOrderCogs } = load();
  const recipes = [recipeRow({ id: 'r1', menuItemId: 'dish', rawMaterialId: 'chicken', qtyPerUnit: '0.250' })];
  const rates = [rateRow({ rate: '200.00' })];
  const tx = makeTx(recipes, rates);
  const result = await computeOrderCogs(tx, 'b1', [{ menuItemId: 'dish', qty: 4 }]);
  // 4 units * 0.250 chicken/unit = 1.000 chicken * 200.00/unit = 200.00
  assert.equal(result.cogsAmount, '200.00');
  assert.equal(result.complete, true);
});

test('computeOrderCogs recurses through a nested Semi-FG down to raw materials', async () => {
  const { computeOrderCogs } = load();
  // dish = 0.25 chicken(direct) + 0.10 gravy(semi-FG); gravy = 0.30 butter + 0.20 tomato per unit
  const recipes = [
    recipeRow({ id: 'r1', menuItemId: 'dish', componentType: 'RAW_MATERIAL', rawMaterialId: 'chicken', qtyPerUnit: '0.250' }),
    recipeRow({ id: 'r2', menuItemId: 'dish', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'gravy', qtyPerUnit: '0.100' }),
    recipeRow({ id: 'r3', menuItemId: 'gravy', componentType: 'RAW_MATERIAL', rawMaterialId: 'butter', qtyPerUnit: '0.300' }),
    recipeRow({ id: 'r4', menuItemId: 'gravy', componentType: 'RAW_MATERIAL', rawMaterialId: 'tomato', qtyPerUnit: '0.200' }),
  ];
  const rates = [rateRow({ rawMaterialId: 'chicken', rate: '200.00' }), rateRow({ rawMaterialId: 'butter', rate: '400.00' }), rateRow({ rawMaterialId: 'tomato', rate: '30.00' })];
  const tx = makeTx(recipes, rates);
  const result = await computeOrderCogs(tx, 'b1', [{ menuItemId: 'dish', qty: 1 }]);
  // chicken: 0.25*200 = 50; gravy explodes to butter 0.1*0.3=0.03*400=12, tomato 0.1*0.2=0.02*30=0.6
  assert.equal(result.cogsAmount, (50 + 12 + 0.6).toFixed(2));
  assert.equal(result.complete, true);
});

test('computeOrderCogs marks the whole order incomplete when a nested Semi-FG has no saved recipe, without throwing', async () => {
  const { computeOrderCogs } = load();
  const recipes = [
    recipeRow({ id: 'r1', menuItemId: 'dish', componentType: 'RAW_MATERIAL', rawMaterialId: 'chicken', qtyPerUnit: '0.250' }),
    recipeRow({ id: 'r2', menuItemId: 'dish', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'gravy', qtyPerUnit: '0.100' }),
    // gravy itself has no recipe rows at all
  ];
  const rates = [rateRow({ rawMaterialId: 'chicken', rate: '200.00' })];
  const tx = makeTx(recipes, rates);
  const result = await computeOrderCogs(tx, 'b1', [{ menuItemId: 'dish', qty: 1 }]);
  assert.equal(result.complete, false);
  // Only the priceable chicken leg is summed (0.25 * 200 = 50); the gravy leg contributes nothing, never silently zero-priced as if complete.
  assert.equal(result.cogsAmount, '50.00');
});

test('computeOrderCogs marks the order incomplete when a raw material has no vendor rate ever locked', async () => {
  const { computeOrderCogs } = load();
  const recipes = [recipeRow({ id: 'r1', menuItemId: 'dish', rawMaterialId: 'saffron', qtyPerUnit: '0.010' })];
  const tx = makeTx(recipes, []); // no vendor_rates row at all for saffron
  const result = await computeOrderCogs(tx, 'b1', [{ menuItemId: 'dish', qty: 1 }]);
  assert.equal(result.complete, false);
  assert.equal(result.cogsAmount, '0.00');
});

test('computeOrderCogs uses the LATEST locked vendor rate, not the lowest-active planning rate Food Cost uses', async () => {
  const { computeOrderCogs } = load();
  const recipes = [recipeRow({ id: 'r1', menuItemId: 'dish', rawMaterialId: 'chicken', qtyPerUnit: '1.000' })];
  // Older, cheaper rate locked first; newer, pricier rate locked later -> latest wins for real cost-incurred.
  // Fake tx doesn't execute real SQL ORDER BY — rows are supplied already in
  // the order the real DB query (desc(lockedAt), desc(id)) would return them.
  const rates = [
    rateRow({ id: 'vr-new', rate: '220.00', lockedAt: new Date('2026-01-01') }),
    rateRow({ id: 'vr-old', rate: '150.00', lockedAt: new Date('2025-01-01') }),
  ];
  const tx = makeTx(recipes, rates);
  const result = await computeOrderCogs(tx, 'b1', [{ menuItemId: 'dish', qty: 1 }]);
  assert.equal(result.cogsAmount, '220.00');
});

test('computeOrderCogs returns 0.00/complete for an order whose only lines have no BOM (defensive — order route already requires a recipe before this is called)', async () => {
  const { computeOrderCogs } = load();
  const tx = makeTx([], []);
  const result = await computeOrderCogs(tx, 'b1', []);
  assert.equal(result.cogsAmount, '0.00');
  assert.equal(result.complete, true);
});
