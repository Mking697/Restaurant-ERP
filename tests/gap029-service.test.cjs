const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function tokenHarness() {
  const state = { posTokenSequences: [] };
  const op = { sql: (parts, ...values) => ({ parts, values }) };
  const tx = {
    execute: async query => {
      const text = query.parts.join('?');
      if (!text.includes('pos_token_sequences')) return { rows: [] };
      const [id, branchId, businessDate, channel] = query.values;
      let row = state.posTokenSequences.find(r => r.branchId === branchId && r.businessDate === businessDate && r.channel === channel);
      if (!row) { row = { id, branchId, businessDate, channel, lastValue: 1 }; state.posTokenSequences.push(row); }
      else row.lastValue += 1;
      return { rows: [{ last_value: row.lastValue }] };
    },
  };
  const filename = path.join(__dirname, '../src/lib/server/pos-tokens.ts');
  const module = { exports: {} };
  const req = r => r === 'drizzle-orm' ? op : r === './business-calendar' ? require('../src/lib/server/business-calendar.ts') : r === 'node:crypto' ? require('node:crypto') : require(r);
  require.extensions['.ts'] = require.extensions['.ts'] || ((m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f));
  vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`, { filename })(req, module, module.exports);
  return { state, tx, allocatePickupToken: module.exports.allocatePickupToken };
}

test('allocatePickupToken: TAKEAWAY-only, sequential per branch/business-day, branch-isolated, never reused across a business-day rollover', async () => {
  const h = tokenHarness();
  assert.equal(await h.allocatePickupToken(h.tx, 'branch-a', 'DINE_IN', new Date('2026-11-04T10:00:00Z')), '', 'DINE_IN never gets a pickup token');
  assert.equal(await h.allocatePickupToken(h.tx, 'branch-a', 'SWIGGY', new Date('2026-11-04T10:00:00Z')), '', 'platform channels are out of this scope');

  const t1 = await h.allocatePickupToken(h.tx, 'branch-a', 'TAKEAWAY', new Date('2026-11-04T10:00:00Z'));
  const t2 = await h.allocatePickupToken(h.tx, 'branch-a', 'TAKEAWAY', new Date('2026-11-04T11:00:00Z'));
  const t3 = await h.allocatePickupToken(h.tx, 'branch-a', 'TAKEAWAY', new Date('2026-11-04T12:00:00Z'));
  assert.deepEqual([t1, t2, t3], ['T-1', 'T-2', 'T-3'], 'sequential within the same branch/business-day');

  // A different branch on the exact same business day starts its own count at 1.
  const otherBranch = await h.allocatePickupToken(h.tx, 'branch-b', 'TAKEAWAY', new Date('2026-11-04T10:30:00Z'));
  assert.equal(otherBranch, 'T-1', 'cross-branch collision must not happen');

  // Crossing the Tanzania EAT midnight boundary (21:00 UTC == 00:00 EAT next day) rolls the counter back to 1.
  const rolledOver = await h.allocatePickupToken(h.tx, 'branch-a', 'TAKEAWAY', new Date('2026-11-04T21:30:00Z'));
  assert.equal(rolledOver, 'T-1', 'a new Tanzania business day starts a fresh sequence');

  // Still the same calendar day (branch-a's 4th token overall would be T-4 if not rolled) must not collide with rolled T-1.
  assert.equal(h.state.posTokenSequences.filter(r => r.branchId === 'branch-a').length, 2, 'one scope row per distinct branch/business-day');
});
