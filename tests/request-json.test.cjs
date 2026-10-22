const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function harness(fetch) {
  const timers = new Map(); let next = 0;
  const module = { exports: {} };
  const filename = require('node:path').join(__dirname, '../src/lib/current-user.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require, fetch, AbortController,
    setTimeout(fn, ms) { timers.set(++next, { fn, ms }); return next; }, clearTimeout(id) { timers.delete(id); },
  }, { filename });
  return { store: module.exports, timers, expire() { assert.equal(timers.size, 1, 'request must have one finite deadline'); const timer = [...timers.values()][0]; assert.ok(timer.ms > 0 && timer.ms <= 20000); timer.fn(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('requestJson bounds stalled headers and body even when transport ignores abort, with no retry', async () => {
  for (const stage of ['headers', 'body']) {
    let calls = 0, signal;
    const h = harness(async (_url, init) => { calls++; signal = init.signal; return stage === 'headers' ? new Promise(() => {}) : { ok: true, status: 200, json: () => new Promise(() => {}) }; });
    const result = h.store.requestJson('/api/workforce/attendance').then(() => null, error => error);
    await tick(); h.expire(); const error = await result;
    assert.ok(error instanceof h.store.RequestJsonError); assert.match(error.message, /timed out/i);
    assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(h.timers.size, 0);
  }
});
test('timed-out writes report unknown outcome and never retry or imply rollback', async () => {
  let calls = 0;
  const h = harness(() => { calls++; return new Promise(() => {}); });
  const result = h.store.requestJson('/api/accounts/expenses', { method: 'POST', body: '{}' }).catch(error => error);
  h.expire(); const error = await result;
  assert.equal(error.outcome, 'unknown'); assert.match(error.message, /may already be saved/i); assert.equal(calls, 1);
});
test('success clears deadline while typed admission rejections differ from infrastructure failures', async () => {
  for (const status of [200, 400, 401, 403, 409, 503]) {
    const h = harness(async () => ({ ok: status === 200, status, json: async () => status === 200 ? { saved: true } : { error: 'Denied by server' } }));
    h.store.seedCurrentUser({ id: 'qa', name: 'QA', phoneE164: '', role: 'CASHIER', branchId: 'a', moduleAccess: [], status: 'Active' });
    if (status === 200) assert.equal((await h.store.requestJson('/api/test')).saved, true);
    else await assert.rejects(h.store.requestJson('/api/test', { method: 'POST', body: '{}' }), error => {
      assert.equal(error.status, status); assert.equal(error.outcome, status < 500 ? 'rejected' : 'unknown'); return true;
    });
    assert.equal(h.timers.size, 0);
    if (status === 401) assert.equal(h.store.getCurrentUser().authenticated, false);
  }
});
test('network errors and undecodable successful acknowledgements cannot be reported as saved', async () => {
  for (const fetch of [async () => { throw new Error('offline'); }, async () => ({ ok: true, status: 200, json: async () => { throw new Error('truncated JSON'); } })]) {
    const h = harness(fetch);
    await assert.rejects(h.store.requestJson('/api/accounts/expenses', { method: 'POST', body: '{}' }), error => error.outcome === 'unknown');
    assert.equal(h.timers.size, 0);
  }
});
test('caller cancellation settles an abort-ignoring transport and removes listeners and deadlines', async () => {
  let signal;
  const h = harness((_url, init) => { signal = init.signal; return new Promise(() => {}); });
  const controller = new AbortController(); let listeners = 0;
  const add = controller.signal.addEventListener.bind(controller.signal), remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { listeners++; return add(...args); };
  controller.signal.removeEventListener = (...args) => { listeners--; return remove(...args); };
  const result = h.store.requestJson('/api/test', { signal: controller.signal }).catch(error => error);
  controller.abort(); const error = await result;
  assert.ok(error instanceof h.store.RequestJsonError); assert.equal(signal.aborted, true); assert.equal(h.timers.size, 0); assert.equal(listeners, 0);
});
test('401 revokes identity immediately even when the error body stalls', async () => {
  const h = harness(async () => ({ ok: false, status: 401, json: () => new Promise(() => {}) }));
  h.store.seedCurrentUser({ id: 'qa', name: 'QA', phoneE164: '', role: 'CASHIER', branchId: 'a', moduleAccess: [], status: 'Active' });
  const result = h.store.requestJson('/api/test').catch(error => error);
  await tick(); assert.equal(h.store.getCurrentUser().authenticated, false); h.expire(); await result;
});
