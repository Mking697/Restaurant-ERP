const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = require.extensions['.ts'] || ((mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename));
const load = () => require('../src/lib/server/whatsapp-preferences.ts');

function memoryTx(seed = []) {
  const { getTableName } = require('drizzle-orm');
  const rows = { whatsapp_opt_outs: [...seed] };
  return {
    rows,
    select(cols) {
      let table, predicate;
      const chain = {
        from(value) { table = value; return chain; },
        where(value) { predicate = value; return chain; },
        limit() { return chain; },
        then(resolve, reject) {
          const name = getTableName(table);
          // Matches either a single eq(phone, X) or inArray(phone, [...]).
          const all = rows[name] || [];
          let result = all;
          if (predicate) {
            const sql = require('drizzle-orm/pg-core').PgDialect ? new (require('drizzle-orm/pg-core').PgDialect)().sqlToQuery(predicate) : null;
            if (sql) {
              const eqMatch = sql.sql.match(/"phone" = \$(\d+)/);
              const inMatch = sql.sql.includes('in (');
              if (eqMatch) { const v = sql.params[Number(eqMatch[1]) - 1]; result = all.filter(r => r.phone === v); }
              else if (inMatch) { const set = new Set(sql.params); result = all.filter(r => set.has(r.phone)); }
            }
          }
          const mapped = cols ? result.map(r => Object.fromEntries(Object.keys(cols).map(k => [k, r[cols[k].name ?? 'phone']]))) : result;
          return Promise.resolve(structuredClone(mapped)).then(resolve, reject);
        },
      };
      return chain;
    },
    insert(table) {
      return { values(value) {
        const name = getTableName(table);
        return { onConflictDoNothing: () => {
          const exists = (rows[name] ||= []).some(r => r.phone === value.phone);
          if (!exists) rows[name].push({ optedOutAt: new Date(), ...value });
          return Promise.resolve();
        } };
      } };
    },
  };
}

test('optOutPhone persists exactly once even when called twice (idempotent, never errors)', async () => {
  const { optOutPhone, isOptedOut } = load();
  const tx = memoryTx();
  await optOutPhone(tx, '712345678');
  await optOutPhone(tx, '712345678'); // retry — must not throw or duplicate
  assert.equal(tx.rows.whatsapp_opt_outs.length, 1);
  assert.equal(await isOptedOut(tx, '712345678'), true);
});

test('isOptedOut is false for an untouched phone, and for empty input', async () => {
  const { isOptedOut } = load();
  const tx = memoryTx();
  assert.equal(await isOptedOut(tx, '712345678'), false);
  assert.equal(await isOptedOut(tx, ''), false);
});

test('optedOutSet correctly partitions a mixed batch (GAP-037 offer-alert exclusion)', async () => {
  const { optOutPhone, optedOutSet } = load();
  const tx = memoryTx();
  await optOutPhone(tx, '711111111');
  const set = await optedOutSet(tx, ['711111111', '722222222', '733333333']);
  assert.equal(set.has('711111111'), true);
  assert.equal(set.has('722222222'), false);
  assert.equal(set.has('733333333'), false);
  assert.equal((await optedOutSet(tx, [])).size, 0, 'an empty batch never touches the database');
});

test('buildOptOutUrl is empty when no public URL is configured yet, and well-formed once it is', () => {
  const { buildOptOutUrl } = load();
  assert.equal(buildOptOutUrl('', '712345678'), '');
  assert.equal(buildOptOutUrl('https://app.example.com/', '712345678'), 'https://app.example.com/whatsapp-optout?phone=712345678');
  assert.equal(buildOptOutUrl('https://app.example.com', '712345678'), 'https://app.example.com/whatsapp-optout?phone=712345678');
});
