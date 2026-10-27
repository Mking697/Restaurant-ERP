const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/bom.ts');

const row = (over) => ({ id: 'r1', branchId: 'b1', menuItemId: 'dish', componentType: 'RAW_MATERIAL', rawMaterialId: 'chicken', componentMenuItemId: null, qtyPerUnit: '0.200', lockedByHq: true, ...over });

test('parseBomRow enforces exactly one of rawMaterialId / componentMenuItemId, matching componentType', () => {
  const { parseBomRow } = load();
  const base = { branchId: 'b1', menuItemId: 'dish', componentType: 'RAW_MATERIAL', rawMaterialId: 'chicken', componentMenuItemId: null, qtyPerUnit: '0.200' };
  assert.doesNotThrow(() => parseBomRow(base));
  assert.throws(() => parseBomRow({ ...base, rawMaterialId: null }), { status: 400 });
  assert.throws(() => parseBomRow({ ...base, componentMenuItemId: 'gravy' }), { status: 400 });
  const semi = { branchId: 'b1', menuItemId: 'dish', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'gravy', qtyPerUnit: '0.050' };
  assert.doesNotThrow(() => parseBomRow(semi));
  assert.throws(() => parseBomRow({ ...semi, componentMenuItemId: 'dish' }), { status: 409 }); // self-reference
  assert.throws(() => parseBomRow({ ...base, qtyPerUnit: '0' }), { status: 400 });
  assert.throws(() => parseBomRow({ ...base, qtyPerUnit: '1.2345' }), { status: 400 });
});

test('explodeBom walks a nested Semi-FG tree down to raw-material leaves', () => {
  const { explodeBom, buildRecipeIndex } = load();
  // Butter Chicken (dish) = 0.25 chicken + 0.10 "Butter Chicken Gravy" (semi-FG)
  // Butter Chicken Gravy (semi-FG) = 0.03 butter + 0.02 tomato (per 1 unit of gravy)
  const rows = [
    row({ id: 'r1', menuItemId: 'butter_chicken', componentType: 'RAW_MATERIAL', rawMaterialId: 'chicken', componentMenuItemId: null, qtyPerUnit: '0.250' }),
    row({ id: 'r2', menuItemId: 'butter_chicken', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'gravy', qtyPerUnit: '0.100' }),
    row({ id: 'r3', menuItemId: 'gravy', componentType: 'RAW_MATERIAL', rawMaterialId: 'butter', componentMenuItemId: null, qtyPerUnit: '0.300' }),
    row({ id: 'r4', menuItemId: 'gravy', componentType: 'RAW_MATERIAL', rawMaterialId: 'tomato', componentMenuItemId: null, qtyPerUnit: '0.200' }),
  ];
  const index = buildRecipeIndex(rows);
  const result = explodeBom('butter_chicken', 2, index); // order of 2 plates
  assert.equal(result.get('chicken'), 0.5);
  // 2 plates * 0.10 gravy/plate = 0.2 gravy units; gravy needs 0.3 butter + 0.2 tomato per 1 gravy unit
  assert.ok(Math.abs(result.get('butter') - 0.06) < 1e-9);
  assert.ok(Math.abs(result.get('tomato') - 0.04) < 1e-9);
  assert.equal(result.size, 3);
});

test('explodeBom and computeRecipeCost reject a circular BOM reference', () => {
  const { explodeBom, computeRecipeCost, buildRecipeIndex } = load();
  const rows = [
    row({ id: 'r1', menuItemId: 'a', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'b', qtyPerUnit: '1.000' }),
    row({ id: 'r2', menuItemId: 'b', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'a', qtyPerUnit: '1.000' }),
  ];
  const index = buildRecipeIndex(rows);
  assert.throws(() => explodeBom('a', 1, index), { status: 409 });
  assert.throws(() => computeRecipeCost('a', index, new Map()), { status: 409 });
});

test('assertAcyclicInsert blocks a new Semi-FG edge that would close a cycle', () => {
  const { assertAcyclicInsert, buildRecipeIndex } = load();
  const rows = [row({ id: 'r1', menuItemId: 'gravy', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'butter_chicken', qtyPerUnit: '1.000' })];
  const index = buildRecipeIndex(rows);
  // gravy already depends on butter_chicken; adding butter_chicken -> gravy would close the loop
  assert.throws(() => assertAcyclicInsert('butter_chicken', 'gravy', index), { status: 409 });
  // adding an unrelated dependency is fine
  assert.doesNotThrow(() => assertAcyclicInsert('butter_chicken', 'rice_base', index));
  assert.throws(() => assertAcyclicInsert('dish', 'dish', index), { status: 409 }); // direct self-reference
});

test('computeRecipeCost prices a nested Semi-FG dish from raw-material unit costs', () => {
  const { computeRecipeCost, buildRecipeIndex } = load();
  const rows = [
    row({ id: 'r1', menuItemId: 'butter_chicken', componentType: 'RAW_MATERIAL', rawMaterialId: 'chicken', componentMenuItemId: null, qtyPerUnit: '0.250' }),
    row({ id: 'r2', menuItemId: 'butter_chicken', componentType: 'SEMI_FG', rawMaterialId: null, componentMenuItemId: 'gravy', qtyPerUnit: '0.100' }),
    row({ id: 'r3', menuItemId: 'gravy', componentType: 'RAW_MATERIAL', rawMaterialId: 'butter', componentMenuItemId: null, qtyPerUnit: '0.300' }),
    row({ id: 'r4', menuItemId: 'gravy', componentType: 'RAW_MATERIAL', rawMaterialId: 'tomato', componentMenuItemId: null, qtyPerUnit: '0.200' }),
  ];
  const index = buildRecipeIndex(rows);
  const costs = new Map([['chicken', 300], ['butter', 500], ['tomato', 40]]); // per kg/ltr-equivalent unit
  // chicken: 0.25*300=75; gravy unit cost = 0.3*500 + 0.2*40 = 150+8=158; 0.1 gravy*158=15.8; total 90.8
  const cost = computeRecipeCost('butter_chicken', index, costs);
  assert.equal(cost, 90.8);
  assert.throws(() => computeRecipeCost('butter_chicken', index, new Map([['chicken', 300]])), { status: 400 }); // missing gravy's raw costs
});
