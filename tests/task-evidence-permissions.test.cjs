const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
function loadConfig() {
  const filename = path.resolve(__dirname, '../next.config.ts');
  const mod = new Module(filename, module);
  mod.paths = module.paths;
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return mod.exports.default;
}
test('task evidence permits same-origin camera/location while other pages remain denied', async () => {
  const rules = await loadConfig().headers();
  const base = rules.find(r => r.source === '/:path*');
  assert.equal(base.headers.find(h => h.key === 'Permissions-Policy').value, 'camera=(), microphone=(), geolocation=()');
  const tasks = rules.find(r => r.source === '/tasks');
  assert.ok(tasks, 'task page needs a scoped permission policy override for real GPS capture');
  assert.ok(rules.indexOf(tasks) > rules.indexOf(base), 'specific header must override the global default');
  assert.equal(tasks.headers.find(h => h.key === 'Permissions-Policy').value, 'camera=(self), microphone=(), geolocation=(self)');
  assert.equal(base.headers.find(h => h.key === 'X-Frame-Options').value, 'DENY');
});
