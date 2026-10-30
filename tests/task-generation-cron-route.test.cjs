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
    if (request === '@/db/client') return { db: { transaction: async (run) => run({ execute: async () => {} }) } };
    if (request === '@/lib/server/task-generation') {
      return { generateRecurringOccurrences: async () => 3, escalateOverdueInstances: async () => 2 };
    }
    if (request.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '../src', request.slice(2)), parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  // Force a fresh require of the route + its dependency chain under the mocks.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}app${path.sep}api${path.sep}cron${path.sep}tasks${path.sep}route`) ||
        key.includes(`${path.sep}src${path.sep}lib${path.sep}server${path.sep}auth`)) delete require.cache[key];
  }
  try { return fn(); } finally { Module._load = originalLoad; }
}

function post(secret) {
  const headers = { 'content-type': 'application/json' };
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request('http://localhost:3030/api/cron/tasks', { method: 'POST', headers });
}

test('cron route rejects a missing Authorization header with 401 and no info disclosure', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'correct-secret-value-123';
    try {
      const route = require('../src/app/api/cron/tasks/route.ts');
      const res = await route.POST(post());
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(!JSON.stringify(data).includes('correct-secret-value-123'));
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});

test('cron route rejects a wrong bearer secret with 401', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'correct-secret-value-123';
    try {
      const route = require('../src/app/api/cron/tasks/route.ts');
      assert.equal((await route.POST(post('wrong-secret'))).status, 401);
      assert.equal((await route.POST(post(''))).status, 401);
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});

test('cron route fails closed with 401 when CRON_SECRET itself is unset/empty', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
    try {
      const route = require('../src/app/api/cron/tasks/route.ts');
      assert.equal((await route.POST(post('anything'))).status, 401);
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});

test('cron route never accepts a session cookie in place of the bearer secret', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'correct-secret-value-123';
    try {
      const route = require('../src/app/api/cron/tasks/route.ts');
      const req = new Request('http://localhost:3030/api/cron/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'restaurant_session=' + 'a'.repeat(64) },
      });
      assert.equal((await route.POST(req)).status, 401);
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});

test('cron route runs generation then escalation and returns exact counts on a correct secret', async () => {
  await withMockedRoute(async () => {
    const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = 'correct-secret-value-123';
    try {
      const route = require('../src/app/api/cron/tasks/route.ts');
      const res = await route.POST(post('correct-secret-value-123'));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { generated: 3, escalated: 2 });
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
});
