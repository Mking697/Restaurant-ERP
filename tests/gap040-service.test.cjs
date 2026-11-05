const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const load = () => require('../src/lib/server/customer-qr.ts');

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
    select() {
      let table, predicate, limit;
      const chain = {
        from(value) { table = value; return chain; },
        where(value) { predicate = value; return chain; },
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
        if (name === 'customer_qr_tokens' && value.status !== 'REVOKED' && existing.some(r => r.customerId === value.customerId && r.status === 'ACTIVE')) { const e = new Error('dup'); e.code = '23505'; throw e; }
        const row = { status: 'ACTIVE', issuedAt: new Date(), revokedAt: null, revokedBy: null, ...value };
        existing.push(row);
        return { returning: async () => structuredClone([row]) };
      } };
    },
    update(table) {
      return { set(value) { return { where(predicate) {
        const name = getTableName(table);
        const changed = (rows[name] || []).filter(row => matches(table, row, predicate));
        changed.forEach(row => Object.assign(row, value));
        return { returning: async () => structuredClone(changed) };
      } }; } };
    },
  };
}

const owner = { id: 'owner', role: 'SUPER_ADMIN', branchId: null };
const managerA = { id: 'manager-a', role: 'BRANCH_MANAGER', branchId: 'branch-a' };
const managerB = { id: 'manager-b', role: 'BRANCH_MANAGER', branchId: 'branch-b' };
const customer = { id: 'cust-1', phone: '712345678', name: 'Asha', createdBranchId: 'branch-a', status: 'ACTIVE' };

test('issueMemberQrToken returns a raw token that is NOT the phone/name/id and is never itself stored in plain text', async () => {
  const { issueMemberQrToken } = load();
  const tx = memoryTx({ customers: [customer] });
  const issued = await issueMemberQrToken(tx, managerA, customer.id);
  assert.ok(issued.token.length >= 20);
  assert.doesNotMatch(issued.token, /712345678|Asha|cust-1/);
  assert.match(issued.qrDataUrl, /^data:image\/png;base64,/);
  const stored = tx.rows.customer_qr_tokens[0];
  assert.notEqual(stored.tokenHash, issued.token, 'only the HASH is persisted, never the raw token');
});

test('re-issuing a token revokes the previous one — at most one ACTIVE token per customer', async () => {
  const { issueMemberQrToken, lookupMemberByQrToken } = load();
  const tx = memoryTx({ customers: [customer] });
  const first = await issueMemberQrToken(tx, managerA, customer.id);
  const second = await issueMemberQrToken(tx, managerA, customer.id);
  assert.notEqual(first.token, second.token);
  const active = tx.rows.customer_qr_tokens.filter(r => r.status === 'ACTIVE');
  assert.equal(active.length, 1, 'exactly one ACTIVE token survives');
  await assert.rejects(() => lookupMemberByQrToken(tx, first.token), { status: 404 }, 'the old (now revoked) token no longer resolves');
  const resolved = await lookupMemberByQrToken(tx, second.token);
  assert.equal(resolved.id, customer.id);
});

test('QR issuance/revocation requires the registering branch Manager or the Owner, same authority bar as a name edit', async () => {
  const { issueMemberQrToken } = load();
  const tx = memoryTx({ customers: [customer] });
  await assert.rejects(() => issueMemberQrToken(tx, managerB, customer.id), { status: 403 });
  const issued = await issueMemberQrToken(tx, owner, customer.id);
  assert.ok(issued.token);
});

test('lookupMemberByQrToken gives the EXACT SAME generic error for an unknown token and a revoked token — never distinguishable', async () => {
  const { issueMemberQrToken, revokeMemberQrToken, lookupMemberByQrToken } = load();
  const tx = memoryTx({ customers: [customer] });
  const issued = await issueMemberQrToken(tx, managerA, customer.id);
  await revokeMemberQrToken(tx, managerA, customer.id);

  let revokedError, unknownError;
  try { await lookupMemberByQrToken(tx, issued.token); } catch (e) { revokedError = e; }
  try { await lookupMemberByQrToken(tx, 'totally-made-up-token-xyz'); } catch (e) { unknownError = e; }
  assert.equal(revokedError.status, 404);
  assert.equal(unknownError.status, 404);
  assert.equal(revokedError.message, unknownError.message, 'identical message — no detail leaked about which case it was');
});

test('revokeMemberQrToken is a safe idempotent no-op when nothing is currently active', async () => {
  const { issueMemberQrToken, revokeMemberQrToken } = load();
  const tx = memoryTx({ customers: [customer] });
  const nothingToRevoke = await revokeMemberQrToken(tx, managerA, customer.id);
  assert.equal(nothingToRevoke, null);
  await issueMemberQrToken(tx, managerA, customer.id);
  const revoked = await revokeMemberQrToken(tx, managerA, customer.id);
  assert.equal(revoked.status, 'REVOKED');
  const again = await revokeMemberQrToken(tx, managerA, customer.id); // already revoked
  assert.equal(again, null);
});

test('lookupMemberByQrToken rejects empty input and never crashes on garbage', async () => {
  const { lookupMemberByQrToken } = load();
  const tx = memoryTx({ customers: [customer] });
  await assert.rejects(() => lookupMemberByQrToken(tx, ''), { status: 400 });
  await assert.rejects(() => lookupMemberByQrToken(tx, '   '), { status: 400 });
});
