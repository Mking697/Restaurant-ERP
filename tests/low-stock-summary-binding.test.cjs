const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const crypto = require('node:crypto');

const source = readFileSync(resolve(__dirname, 'low-stock-summary.integration.cjs'), 'utf8');

// Execute the actual runner with isolated fake env/DB/HTTP: no dotenv, DB or network.
async function runWithIdentity(status, user) {
  const requests = [], queries = [], errors = [];
  let finish;
  const ended = new Promise(resolve => { finish = resolve; });
  const fakeProcess = { env: {
    PGHOST: '127.0.0.1', PGPORT: '5436',
    PGDATABASE: 'restaurant_erp_dashrpt_qa_20261031',
    BASE_URL: 'http://127.0.0.1:4317', CRON_SECRET: 'qa-low-stock-summary-only',
  }, exitCode: 0 };
  class Pool {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('current_database()')) return { rows: [{ db: fakeProcess.env.PGDATABASE }] };
      if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
      return { rows: [] };
    }
    async end() { finish(); }
  }
  vm.runInNewContext(source, {
    require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === 'pg') return { Pool };
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:crypto') return crypto;
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: fakeProcess, URL, AbortSignal,
    console: { log() {}, error(error) { errors.push(error); } },
    async fetch(url, options) {
      requests.push({ url, options });
      if (url.endsWith('/api/auth/me')) return { status, async json() { return { user }; } };
      return { status: options.headers.authorization === 'Bearer qa-low-stock-summary-only' ? 200 : 401,
        async json() { return { claimed: 2, notified: 0 }; } };
    },
  }, { filename: 'low-stock-summary.integration.cjs' });
  await ended;
  return { requests, queries, errors, exitCode: fakeProcess.exitCode };
}

for (const [name, status, user] of [
  ['different identity', 200, { id: 'not-the-disposable-user' }],
  ['unauthenticated response', 401, { id: 'qalow-ma' }],
  ['missing identity', 200, null],
]) {
  test(`DB binding ${name} aborts before any cron request`, async () => {
    const result = await runWithIdentity(status, user);
    assert.equal(result.requests.filter(r => r.url.endsWith('/api/cron/daily-summary')).length, 0,
      'Unsafe: cron called without proving HTTP app DB binding');
    assert.equal(result.requests.length, 1);
    assert.ok(result.requests[0].url.endsWith('/api/auth/me'));
    assert.equal(result.exitCode, 1);
    assert.match(String(result.errors[0]), /QA app is not bound to the approved disposable DB/);
    const session = result.queries.find(q => /insert into sessions/i.test(q.sql));
    assert.ok(session, 'Session must be inserted in the disposable DB before HTTP identity readback');
    const cookie = result.requests[0].options.headers.cookie;
    const token = cookie.replace(/^restaurant_session=/, '');
    assert.ok(/^[a-f0-9]{64}$/.test(token), 'Session must be a random 32-byte hex token');
    assert.equal(session.values[0], crypto.createHash('sha256').update(token).digest('hex'));
    assert.equal(session.values[1], 'qalow-ma');
    assert.ok(result.queries.some(q => /truncate table/.test(q.sql)), 'Failure cleans up disposable fixtures');
  });
}
