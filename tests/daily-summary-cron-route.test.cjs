const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const Module = require('node:module');

function withMockedRoute(fn) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '@/lib/server/daily-summary') {
      return { runDailySummary: async () => ({ branches: 2, claimed: 2, alreadySent: 0, notified: 1 }) };
    }
    if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}app${path.sep}api${path.sep}cron${path.sep}daily-summary${path.sep}route`) ||
        key.includes(`${path.sep}src${path.sep}lib${path.sep}server${path.sep}cron-auth`)) delete require.cache[key];
  }
  try { return fn(); } finally { Module._load = originalLoad; }
}

function req(secret, method = 'POST') {
  const headers = {};
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request('http://localhost:3030/api/cron/daily-summary', { method, headers });
}

test('daily-summary route rejects missing/wrong/empty bearer secret with 401, no disclosure', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'daily-secret-123';
    try {
      const route = require('../src/app/api/cron/daily-summary/route.ts');
      assert.equal((await route.POST(req(undefined))).status, 401);
      assert.equal((await route.POST(req('wrong'))).status, 401);
      assert.equal((await route.POST(req(''))).status, 401);
      const res = await route.POST(req(undefined));
      assert.ok(!JSON.stringify(await res.json()).includes('daily-secret-123'));
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});

test('daily-summary route fails closed with 401 when CRON_SECRET is unset', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
    try {
      const route = require('../src/app/api/cron/daily-summary/route.ts');
      assert.equal((await route.POST(req('anything'))).status, 401);
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});

test('daily-summary route never accepts a session cookie in place of the bearer secret', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'daily-secret-123';
    try {
      const route = require('../src/app/api/cron/daily-summary/route.ts');
      const r = new Request('http://localhost:3030/api/cron/daily-summary', {
        method: 'POST',
        headers: { cookie: 'restaurant_session=' + 'a'.repeat(64) },
      });
      assert.equal((await route.POST(r)).status, 401);
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});

test('daily-summary route runs the summary and returns its exact counts on a correct secret', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'daily-secret-123';
    try {
      const route = require('../src/app/api/cron/daily-summary/route.ts');
      const res = await route.POST(req('daily-secret-123'));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { branches: 2, claimed: 2, alreadySent: 0, notified: 1 });
      assert.equal(route.GET, route.POST);
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});
