const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { GUIDE_MODULES } = require('../src/lib/guide-content.ts');
const { GUIDE_EXAMPLES, getGuideExample } = require('../src/lib/guide-examples.ts');

test('every module has a practical scenario, four steps and expected result in both languages', () => {
  assert.equal(GUIDE_MODULES.length, 16);
  assert.deepEqual(Object.keys(GUIDE_EXAMPLES).sort(), GUIDE_MODULES.map(m => m.route).sort());
  for (const module of GUIDE_MODULES) {
    for (const language of ['en', 'hinglish']) {
      const example = getGuideExample(module.route, language);
      assert.ok(example.scenario.length > 25, module.route + ' scenario');
      assert.equal(example.steps.length, 4, module.route + ' step count');
      assert.ok(example.steps.every(step => step.length > 20), module.route + ' concrete steps');
      assert.ok(example.result.length > 70, module.route + ' expected result');
    }
    assert.notEqual(GUIDE_EXAMPLES[module.route].en.scenario, GUIDE_EXAMPLES[module.route].hinglish.scenario);
  }
  assert.equal(getGuideExample('/missing', 'en'), undefined);
});

test('standalone guide embeds the same bilingual examples as the app', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/restaurant-erp-archify.html'), 'utf8').replace(/\r\n/g, '\n');
  const raw = html.match(/const EXAMPLES = ([^\r\n]+);/)?.[1];
  assert.ok(raw, 'standalone example data exists');
  assert.deepEqual(JSON.parse(raw), GUIDE_EXAMPLES);
  assert.match(html, /EXAMPLES\[m\.route\]/);
});

test('workforce guidance preserves leave identity and states practice permission prerequisites', () => {
  const workforce = GUIDE_MODULES.find(module => module.route === '/workforce');
  const editor = fs.readFileSync(path.join(__dirname, '../src/app/workforce/employees-panel.tsx'), 'utf8');
  for (const language of ['en', 'hinglish']) {
    const practice = GUIDE_EXAMPLES['/workforce'][language];
    const text = [practice.scenario, ...practice.steps].join(' ');
    for (const grant of ['PAYROLL', 'LEAVE_SELF', 'ATTENDANCE', 'LEAVE_APPROVAL']) assert.ok(text.includes(grant), language + ' ' + grant);
    const chapter = language === 'en' ? workforce : workforce.hinglish;
    assert.match(chapter.what, /PENDING\/APPROVED\/REJECTED/);
    assert.match(chapter.what, /Owner/);
  }
  assert.match(editor, /PENDING\/APPROVED\/REJECTED/);
  assert.match(editor, /even Owner/);
  const html = fs.readFileSync(path.join(__dirname, '../docs/restaurant-erp-archify.html'), 'utf8');
  const modules = JSON.parse(html.match(/const MODULES = ([^\r\n]+);/)[1]);
  assert.deepEqual(modules.find(module => module.route === '/workforce'), workforce);
});

test('examples distinguish page-local demos from real writes and never supply credentials', () => {
  for (const route of ['/tasks', '/purchase', '/cash-drop']) {
    assert.match(GUIDE_EXAMPLES[route].en.result, /demo|page|local/i, route);
    assert.match(GUIDE_EXAMPLES[route].en.result, /not|no |reset|reload/i, route);
  }
  for (const route of ['/inventory', '/admin/users', '/admin/branches', '/admin/settings/whatsapp', '/accounts', '/workforce', '/pos', '/menu', '/warehouse', '/gst-export']) {
    assert.match(GUIDE_EXAMPLES[route].en.result, /real|persist|database|Postgres/i, route);
  }
  const cash = GUIDE_EXAMPLES['/cash-drop'].en;
  assert.equal(500 * 10 + 200 * 5 + 100 * 5 + 50, 6550);
  assert.match(cash.result, /6,550/);
  assert.match(GUIDE_EXAMPLES['/admin/users'].en.steps.join(' '), /private password/);
  assert.match(GUIDE_EXAMPLES['/admin/settings/whatsapp'].en.steps.join(' '), /Never paste it into chat/);
});
