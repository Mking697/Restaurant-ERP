const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('schema declares branch concept, item station, OPEN/PAID lifecycle, durable attempts, tickets and receipts', () => {
  const platform = source('src/db/schema/platform.ts');
  const menu = source('src/db/schema/menu.ts');
  const pos = source('src/db/schema/pos.ts');
  assert.match(platform, /operatingConcept:.*default\("FAST_FOOD"\)/s);
  assert.match(menu, /productionStation:.*default\("KITCHEN"\)/s);
  assert.match(pos, /orderStatusEnum[\s\S]*"OPEN"[\s\S]*"PAID"/);
  for (const name of ['posOrderAttempts', 'posProductionTickets', 'posProductionTicketLines', 'posReceipts']) assert.match(pos, new RegExp(`export const ${name}`));
  assert.match(pos, /stockDeductedAt/);
  assert.match(pos, /settledAt/);
});

test('branch API enforces owner-only operating concept changes while existing branches remain FAST_FOOD by default', () => {
  const route = source('src/app/api/branches/[id]/route.ts');
  const input = source('src/lib/server/branches.ts');
  assert.match(input, /operatingConcept/);
  assert.match(route, /Only owner may change operating concept/);
});

test('order routes expose production-first add-lines and settlement mutations with server-side auth and idempotency', () => {
  const create = source('src/app/api/pos/orders/route.ts');
  const add = source('src/app/api/pos/orders/[id]/lines/route.ts');
  const settle = source('src/app/api/pos/orders/[id]/settle/route.ts');
  const service = source('src/lib/server/pos-orders.ts');
  for (const route of [create, add, settle]) {
    assert.match(route, /mutate\(/);
  }
  assert.match(service, /idempotencyKey/);
  assert.match(service, /posOrderAttempts/);
  assert.match(service, /orderFlow/);
  assert.match(service, /status:\s*flow === "PRODUCTION_FIRST" \? "OPEN" : "PAID"/);
  const addBody = service.slice(service.indexOf('export async function addPosOrderLines'), service.indexOf('export async function settlePosOrder'));
  assert.match(addBody, /deductStock\(/, 'adding lines posts their stock once before dispatching new tickets');
  const settleBody = service.slice(service.indexOf('export async function settlePosOrder'));
  assert.doesNotMatch(settleBody, /deductStock\(/, 'settlement must not deduct already-dispatched kitchen stock');
  assert.match(settleBody, /stockDeductedAt/);
  assert.match(settleBody, /posReceipts/);
  assert.match(settleBody, /status:\s*"PAID"/);
});

test('order schema snapshots its concept and idempotency attempts bind to the original actor', () => {
  const pos = source('src/db/schema/pos.ts');
  const service = source('src/lib/server/pos-orders.ts');
  assert.match(pos, /operatingConcept:.*branchOperatingConceptEnum/s);
  assert.match(pos, /actorId:.*users\.id/s);
  assert.match(service, /attempt\.actorId !== actorId/);
  assert.match(service, /operatingConcept:\s*branch\.operatingConcept/);
  const addBody = service.slice(service.indexOf('export async function addPosOrderLines'), service.indexOf('export async function settlePosOrder'));
  const settleBody = service.slice(service.indexOf('export async function settlePosOrder'));
  assert.match(addBody, /order\.operatingConcept !== "CONVENTIONAL"/);
  assert.match(settleBody, /order\.operatingConcept !== "CONVENTIONAL"/);
});

test('kitchen-first mutations consume stock at ticket dispatch and settlement never deducts it again', () => {
  const service = source('src/lib/server/pos-orders.ts');
  const createBody = service.slice(service.indexOf('export async function createPosOrder'), service.indexOf('export async function addPosOrderLines'));
  const addBody = service.slice(service.indexOf('export async function addPosOrderLines'), service.indexOf('export async function settlePosOrder'));
  const settleBody = service.slice(service.indexOf('export async function settlePosOrder'));
  assert.match(createBody, /deductStock\(/);
  assert.match(addBody, /deductStock\(/);
  assert.doesNotMatch(settleBody, /deductStock\(/, 'settlement must not consume kitchen stock a second time');
});

test('POS and admin/menu UI expose concept-aware open-order actions and station configuration', () => {
  const pos = source('src/app/pos/page-content.tsx');
  const branches = source('src/app/admin/branches/page-content.tsx');
  const builder = source('src/app/menu/recipe-builder.tsx');
  assert.match(pos, /Add items/);
  assert.match(pos, /Settle order/);
  assert.match(pos, /PRODUCTION_FIRST|CONVENTIONAL/);
  assert.match(branches, /Operating concept/);
  assert.match(builder, /Production station/);
});

test('POS unknown outcomes keep the exact intent locked and settlement receipt survives verified reload', () => {
  const pos = source('src/app/pos/page-content.tsx');
  assert.match(pos, /if \(!v && orderAttempt\.current\) return/);
  assert.match(pos, /if \(!value && !busy && !openOrderAttempt\.current\)/);
  assert.match(pos, /reloadOrders\(settlementResult\)/);
  assert.match(pos, /Replay exact request/);
});
