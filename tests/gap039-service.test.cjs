const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const load = () => require('../src/lib/server/rewards.ts');

function memoryTx(seed = {}) {
  const { getTableName, getTableColumns } = require('drizzle-orm');
  const { PgDialect } = require('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  const rows = structuredClone(seed);
  function matches(table, row, predicate) {
    if (!predicate) return true;
    const query = dialect.sqlToQuery(predicate);
    const columns = getTableColumns(table);
    const col = (name) => Object.keys(columns).find(k => columns[k].name === name);
    const eqChecks = [...query.sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
    return eqChecks.every(([, column, index]) => row[col(column)] === query.params[Number(index) - 1]);
  }
  return {
    rows,
    async execute() {},
    select() {
      let table, predicate, limit;
      const chain = {
        from(value) { table = value; return chain; },
        where(value) { predicate = value; return chain; },
        orderBy() { return chain; }, // insertion order == chronological order in these tests
        limit(value) { limit = value; return chain; },
        then(resolve, reject) {
          const name = getTableName(table);
          const result = (rows[name] || []).filter(row => matches(table, row, predicate));
          return Promise.resolve(structuredClone(limit ? result.slice(0, limit) : result)).then(resolve, reject);
        },
      };
      return chain;
    },
    insert(table) {
      return { values(value) {
        const name = getTableName(table);
        const existing = rows[name] ||= [];
        if (name === 'reward_events') {
          if (value.sourceOrderId != null && existing.some(r => r.sourceOrderId === value.sourceOrderId)) { const e = new Error('dup'); e.code = '23505'; throw e; }
          if (value.reversesEventId != null && existing.some(r => r.reversesEventId === value.reversesEventId)) { const e = new Error('dup'); e.code = '23505'; throw e; }
        }
        const row = { createdAt: new Date(), amountTsh: null, sourceOrderId: null, reversesEventId: null, expiresAt: null, ...value };
        existing.push(row);
        return { returning: async () => structuredClone([row]) };
      } };
    },
  };
}

const actor = { id: 'cashier' };
const branchId = 'branch-a';
const customer = { id: 'cust-1', phone: '712345678', name: 'A', status: 'ACTIVE' };
const order = (id, totalAmount, status = 'PAID') => ({ id, branchId, totalAmount, status });

test('rewardBalance: plain earn/redeem sum, with a REVERSE netting its target to exactly zero', () => {
  const { rewardBalance } = load();
  const events = [
    { id: 'e1', type: 'EARN', points: 10 },
    { id: 'r1', type: 'REDEEM', points: 3 },
    { id: 'e2', type: 'EARN', points: 5 },
    { id: 'rev1', type: 'REVERSE', points: 5, reversesEventId: 'e2' },
  ];
  // 10 earned, 3 redeemed, the second earn (5) fully reversed -> net 7
  assert.equal(rewardBalance(events), 7);
});

test('earnPoints reads the REAL order total (floor division), never a client-supplied amount, and is idempotent per order', async () => {
  const { earnPoints, getRewardBalance } = load();
  const tx = memoryTx({ pos_orders: [order('o1', '1999.00')], customers: [customer] });
  const event = await earnPoints(tx, actor, branchId, customer.id, 'o1');
  assert.equal(event.points, 1, 'floor(1999/1000) = 1, never rounds up to 2');
  const again = await earnPoints(tx, actor, branchId, customer.id, 'o1'); // retry
  assert.equal(again.id, event.id, 'idempotent — returns the SAME event, never a second one');
  assert.equal(tx.rows.reward_events.length, 1);
  assert.equal(await getRewardBalance(tx, customer.id), 1);
});

test('earnPoints rejects a non-PAID/COMPLETED order and posts nothing for a sub-threshold order', async () => {
  const { earnPoints } = load();
  const txOpen = memoryTx({ pos_orders: [order('o2', '5000.00', 'OPEN')], customers: [customer] });
  await assert.rejects(() => earnPoints(txOpen, actor, branchId, customer.id, 'o2'), { status: 409 });

  const txSmall = memoryTx({ pos_orders: [order('o3', '999.00')], customers: [customer] });
  const result = await earnPoints(txSmall, actor, branchId, customer.id, 'o3');
  assert.equal(result, null, 'below TSh 1,000 earns zero points — null, not an error');
});

test('redeemPoints rejects overspend and snapshots the TSh-50-per-point rate', async () => {
  const { earnPoints, redeemPoints } = load();
  const tx = memoryTx({ pos_orders: [order('o4', '5000.00')], customers: [customer] });
  await earnPoints(tx, actor, branchId, customer.id, 'o4'); // +5 points

  await assert.rejects(() => redeemPoints(tx, actor, branchId, customer.id, 6), { status: 409 }, 'cannot redeem more than the balance');
  const redeemed = await redeemPoints(tx, actor, branchId, customer.id, 5);
  assert.equal(redeemed.amountTsh, '250.00', '5 points * TSh 50');

  await assert.rejects(() => redeemPoints(tx, actor, branchId, customer.id, 1), { status: 409 }, 'balance is now 0 — nothing left to redeem');
});

test('two concurrent redemption calls cannot both succeed beyond the real balance (serialized via the customer lock)', async () => {
  const { earnPoints, redeemPoints } = load();
  const tx = memoryTx({ pos_orders: [order('o5', '10000.00')], customers: [customer] });
  await earnPoints(tx, actor, branchId, customer.id, 'o5'); // +10 points
  // Sequential here (the mock has no real concurrency), but each call re-reads
  // the balance fresh under the lock — proving the SECOND of two 6-point
  // requests against a 10-point balance is correctly rejected, not double-spent.
  await redeemPoints(tx, actor, branchId, customer.id, 6);
  await assert.rejects(() => redeemPoints(tx, actor, branchId, customer.id, 6), { status: 409 });
});

test('reverseEarnForOrder claws back an order\'s earn exactly once; a retry and a never-earned order are both safe no-ops', async () => {
  const { earnPoints, reverseEarnForOrder, getRewardBalance } = load();
  const tx = memoryTx({ pos_orders: [order('o6', '5000.00')], customers: [customer] });
  await earnPoints(tx, actor, branchId, customer.id, 'o6'); // +5
  assert.equal(await getRewardBalance(tx, customer.id), 5);

  const reversed = await reverseEarnForOrder(tx, actor, branchId, 'o6');
  assert.equal(reversed.points, 5);
  assert.equal(await getRewardBalance(tx, customer.id), 0);

  const retry = await reverseEarnForOrder(tx, actor, branchId, 'o6'); // retry — idempotent no-op
  assert.equal(retry.id, reversed.id);
  assert.equal(tx.rows.reward_events.filter(e => e.type === 'REVERSE').length, 1, 'never double-reversed');

  const never = await reverseEarnForOrder(tx, actor, branchId, 'no-such-order');
  assert.equal(never, null);
});

test('expireOldEarns settles ONLY the FIFO-remaining portion of an aged-out lot, leaving a newer lot and already-redeemed points untouched', async () => {
  const { earnPoints, redeemPoints, expireOldEarns, getRewardBalance } = load();
  const tx = memoryTx({ pos_orders: [order('o7', '5000.00'), order('o8', '3000.00')], customers: [customer] });
  const oldEarn = await earnPoints(tx, actor, branchId, customer.id, 'o7'); // +5, old lot
  await redeemPoints(tx, actor, branchId, customer.id, 2); // consumes 2 of the old lot, 3 remain
  const newEarn = await earnPoints(tx, actor, branchId, customer.id, 'o8'); // +3, fresh lot — not aged out

  // Force only the OLD lot's own expiresAt into the past (fresh lot stays current).
  tx.rows.reward_events.find(e => e.id === oldEarn.id).expiresAt = new Date(Date.now() - 1000);

  const posted = await expireOldEarns(tx, actor, branchId, customer.id);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].points, 3, 'only the 3 still-remaining points of the aged-out lot expire — the 2 already redeemed are not double-charged');
  assert.equal(posted[0].reversesEventId, oldEarn.id);

  // Balance: 5 earned - 2 redeemed - 3 expired + 3 (fresh, untouched) = 3
  assert.equal(await getRewardBalance(tx, customer.id), 3);

  const again = await expireOldEarns(tx, actor, branchId, customer.id); // idempotent — nothing left to expire on that lot
  assert.equal(again.length, 0);
  assert.notEqual(newEarn.id, oldEarn.id);
});

test('expireOldEarns takes the SAME per-customer advisory lock as redeemPoints/reverseEarnForOrder (audit fix: it used to skip it)', async () => {
  const { earnPoints, expireOldEarns } = load();
  const tx = memoryTx({ pos_orders: [order('o9', '5000.00')], customers: [customer] });
  const earn = await earnPoints(tx, actor, branchId, customer.id, 'o9');
  tx.rows.reward_events.find(e => e.id === earn.id).expiresAt = new Date(Date.now() - 1000);

  const executedSql = [];
  const originalExecute = tx.execute.bind(tx);
  tx.execute = async (query) => { executedSql.push(query); return originalExecute(query); };

  await expireOldEarns(tx, actor, branchId, customer.id);
  assert.equal(executedSql.length, 1, 'expireOldEarns must acquire the per-customer advisory lock exactly like redeemPoints does');
});
