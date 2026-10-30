const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute real summary, recipient resolution and message builder. Only persistence,
// transaction locking and provider I/O are replaced; no DB/env/network is accessed.
function harness(orders, contacts) {
  const sent = [], claims = new Set(), cache = {};
  const table = (name, columns) => Object.fromEntries(['_table', ...columns].map(k => [k, k === '_table' ? name : k]));
  const branches = table('branches', ['id', 'name']);
  const posOrders = table('orders', ['id', 'branchId', 'status', 'createdAt', 'ownerOnly']);
  const taskInstances = table('tasks', ['id', 'branchId', 'status']);
  const shiftHandovers = table('handovers', ['id', 'branchId', 'status']);
  const users = table('users', ['name', 'phoneE164', 'role', 'branchId', 'status']);
  const data = { branches: [{ id: 'a', name: 'Branch A' }], orders, users: contacts, tasks: [], handovers: [] };
  const db = {
    select(columns) {
      let rows;
      const q = {
        from(t) { rows = data[t._table]; return q; },
        where(predicate) { rows = rows.filter(predicate); return q; },
        limit(n) { rows = rows.slice(0, n); return q; },
        then(resolve, reject) { return Promise.resolve(rows.map(row => Object.fromEntries(Object.entries(columns).map(([key, col]) => [key, row[col]])))).then(resolve, reject); },
      };
      return q;
    },
    insert() { return { values: async row => { const key = `${row.branchId}:${row.summaryDate}`; if (claims.has(key)) throw { code: '23505' }; claims.add(key); } }; },
  };
  const dependencies = {
    'node:crypto': require('node:crypto'), './permissions': { HttpError: Error },
    'drizzle-orm': { and: (...ps) => row => ps.every(p => p(row)), eq: (col, value) => row => row[col] === value, gte: (col, value) => row => row[col] >= value, lt: (col, value) => row => row[col] < value, inArray: (col, values) => row => values.includes(row[col]) },
    '@/db/client': { db }, '@/db/schema/platform': { branches }, '@/db/schema/pos': { posOrders },
    '@/db/schema/tasks': { taskInstances }, '@/db/schema/shifts': { shiftHandovers }, '@/db/schema/auth': { users },
    '@/db/schema/notifications': { dailySummaryLog: {} }, './auth': { locked: fn => fn(db) },
    './task-generation': { istDateOnly: () => '2026-10-30' },
    '@/lib/chatxflow': { sendWhatsAppMessage: async (phone, message, metadata) => { sent.push({ phone, message, metadata }); return { ok: true }; } },
  };
  function load(name) {
    if (name in dependencies) return dependencies[name];
    assert.ok(['./daily-summary', './task-notifications', './whatsapp-triggers'].includes(name), `Unexpected dependency: ${name}`);
    if (cache[name]) return cache[name];
    const mod = { exports: {} }; cache[name] = mod.exports;
    const filename = path.join(__dirname, '../src/lib/server', name + '.ts');
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require: load, Date });
    return mod.exports;
  }
  return { run: () => load('./daily-summary').runDailySummary(new Date('2026-10-30T03:00:00Z')), sent, recipients: () => load('./task-notifications').branchEscalationRecipients(db, 'a') };
}
const contact = (phoneE164, role, branchId = 'a', status = 'Active') => ({ name: role, phoneE164, role, branchId, status });
const order = (id, ownerOnly, extra = {}) => ({ id, ownerOnly, branchId: 'a', status: 'COMPLETED', createdAt: new Date('2026-10-30T01:00:00Z'), ...extra });

test('real daily summary hides private sales from manager while Owner receives actual count', async () => {
  const contacts = [contact('manager', 'BRANCH_MANAGER'), contact('owner', 'SUPER_ADMIN', null)];
  const baseline = harness([order('public', false)], contacts);
  const privateSales = harness([order('public', false), order('secret-1', true), order('secret-2', true), order('void', false, { status: 'VOIDED' }), order('foreign', false, { branchId: 'b' }), order('old', false, { createdAt: new Date('2026-10-29T00:00:00Z') })], contacts);
  await baseline.run();
  assert.equal((await privateSales.run()).notified, 2);
  const message = (h, phone) => h.sent.find(row => row.phone === phone).message;
  assert.equal(message(privateSales, 'manager'), message(baseline, 'manager'), 'Adding owner-only sales must not change manager message or reveal existence');
  assert.match(message(privateSales, 'manager'), /1 completed sale\(s\)/);
  assert.match(message(privateSales, 'owner'), /3 completed sale\(s\)/);
  const onlyPrivate = harness([order('secret', true)], contacts);
  await onlyPrivate.run();
  assert.match(message(onlyPrivate, 'manager'), /0 completed sale\(s\)/);
  assert.match(message(onlyPrivate, 'owner'), /1 completed sale\(s\)/);
  assert.equal((await privateSales.run()).alreadySent, 1);
  assert.equal(privateSales.sent.length, 2, 'Retry never re-sends');
});

test('Owner phone shared with another branch manager is also restricted', async () => {
  const h = harness([order('secret', true)], [contact('shared', 'SUPER_ADMIN', null), contact('shared', 'BRANCH_MANAGER', 'b')]);
  await h.run();
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].message, /0 completed sale\(s\)/);
});

test('shared phones never upgrade manager visibility regardless of recipient order', async () => {
  for (const reverse of [false, true]) {
    const rows = [contact('shared', 'SUPER_ADMIN', null), contact('shared', 'BRANCH_MANAGER'), contact('owner', 'SUPER_ADMIN', null), contact('foreign', 'BRANCH_MANAGER', 'b'), contact('inactive', 'SUPER_ADMIN', null, 'Inactive'), contact('', 'SUPER_ADMIN', null)];
    const h = harness([order('secret', true)], reverse ? rows.reverse() : rows);
    const recipients = await h.recipients();
    assert.equal(recipients.length, 2);
    assert.equal(recipients.find(r => r.phone === 'shared').role, 'BRANCH_MANAGER');
    assert.equal(recipients.find(r => r.phone === 'owner').role, 'SUPER_ADMIN');
    await h.run();
    assert.equal(h.sent.length, 2);
    assert.match(h.sent.find(r => r.phone === 'shared').message, /0 completed sale\(s\)/);
    assert.match(h.sent.find(r => r.phone === 'owner').message, /1 completed sale\(s\)/);
  }
});
