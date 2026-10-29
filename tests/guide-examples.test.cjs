const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { GUIDE_MODULES } = require('../src/lib/guide-content.ts');
const { GUIDE_EXAMPLES, getGuideExample } = require('../src/lib/guide-examples.ts');

test('every module has a practical scenario, four steps and expected result in both languages', () => {
  assert.equal(GUIDE_MODULES.length, 17);
  assert.deepEqual(Object.keys(GUIDE_EXAMPLES).sort(), GUIDE_MODULES.map(m => m.exampleKey ?? m.route).sort());
  for (const module of GUIDE_MODULES) {
    const key = module.exampleKey ?? module.route;
    for (const language of ['en', 'hinglish']) {
      const example = getGuideExample(key, language);
      assert.ok(example.scenario.length > 25, key + ' scenario');
      assert.equal(example.steps.length, 4, key + ' step count');
      assert.ok(example.steps.every(step => step.length > 20), key + ' concrete steps');
      assert.ok(example.result.length > 70, key + ' expected result');
    }
    assert.notEqual(GUIDE_EXAMPLES[key].en.scenario, GUIDE_EXAMPLES[key].hinglish.scenario);
  }
  assert.equal(getGuideExample('/missing', 'en'), undefined);
});

test('standalone guide embeds the same bilingual examples as the app', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/restaurant-erp-archify.html'), 'utf8').replace(/\r\n/g, '\n');
  const raw = html.match(/const EXAMPLES = ([^\r\n]+);/)?.[1];
  assert.ok(raw, 'standalone example data exists');
  assert.deepEqual(JSON.parse(raw), GUIDE_EXAMPLES);
  assert.deepEqual(JSON.parse(html.match(/const MODULES = (.+);/)[1]), GUIDE_MODULES);
  assert.match(html, /EXAMPLES\[m\.exampleKey\|\|m\.route\]/);
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

test('examples distinguish persisted writes from deferred quality/upload behavior and never supply credentials', () => {
  assert.match(GUIDE_EXAMPLES['/tasks'].en.result, /persist|database|Postgres/i);
  assert.match(GUIDE_EXAMPLES['/purchase'].en.result, /persist|database|Postgres/i);
  assert.match(GUIDE_EXAMPLES['/purchase'].en.result, /quality|refund|return/i);
  for (const route of ['/inventory', '/admin/users', '/admin/branches', '/admin/settings/whatsapp', '/accounts', '/workforce', '/pos', '/cash-drop', '/admin/settings/shifts', '/menu', '/warehouse', '/accounts-gstr']) {
    assert.match(GUIDE_EXAMPLES[route].en.result, /real|persist|database|Postgres/i, route);
  }
  const cash = GUIDE_EXAMPLES['/cash-drop'].en;
  assert.equal(500 * 10 + 200 * 5 + 100 * 5 + 50, 6550);
  assert.match(cash.result, /6,550/);
  assert.match(GUIDE_EXAMPLES['/admin/users'].en.steps.join(' '), /private password/);
  assert.match(GUIDE_EXAMPLES['/admin/settings/whatsapp'].en.steps.join(' '), /Never paste it into chat/);
});

test('shift and cash guidance describe local persisted operations and acceptance gates in both languages', () => {
  const shift = GUIDE_MODULES.find(module => module.module === 'SHIFT_MANAGEMENT');
  const cash = GUIDE_MODULES.find(module => module.module === 'CASH_DROP');
  const pos = GUIDE_MODULES.find(module => module.route === '/pos');
  assert.equal(shift.route, '/admin/settings/shifts');
  assert.equal(shift.cat, 'admin');
  assert.equal(shift.status, 'live');
  assert.equal(cash.status, 'live');
  for (const language of ['en', 'hinglish']) {
    const chapter = language === 'en' ? shift : shift.hinglish;
    const cashChapter = language === 'en' ? cash : cash.hinglish;
    const posChapter = language === 'en' ? pos : pos.hinglish;
    const shiftPractice = GUIDE_EXAMPLES[shift.route][language];
    const cashPractice = GUIDE_EXAMPLES[cash.route][language];
    const posPractice = GUIDE_EXAMPLES[pos.route][language];
    const shiftText = [chapter.what, ...chapter.how, chapter.example].join(' ');
    const cashText = [cashChapter.what, ...cashChapter.how, cashChapter.example].join(' ');
    for (const token of ['SHIFT_MANAGEMENT', 'BRANCH_MANAGER', '1-12', '24h', 'IST', '00:00-00:00', 'Start Shift', 'End Shift & Handover', 'PENDING', 'historical', 'legacy POS', 'real-close']) {
      assert.ok(shiftText.includes(token), language + ' shift: ' + token);
    }
    for (const practice of [shiftPractice, cashPractice, posPractice]) {
      assert.match(practice.scenario, /QA/);
      assert.match(practice.scenario, /real|Real/);
      assert.match(practice.steps.join(' '), /Accept Handover/);
      assert.match(practice.steps.join(' '), /PENDING/);
    }
    for (const token of ['CASH_DROP', 'physical cash', 'CASH sales', 'Card/UPI/Other', 'Initial cash float', 'safe withdrawals', 'production-live']) {
      assert.ok(cashText.includes(token), language + ' cash: ' + token);
    }
    assert.match(cashChapter.what, /counted minus expected/);
    assert.match(cashPractice.steps.join(' '), /6,000/);
    assert.match(cashPractice.steps.join(' '), /550/);
    assert.match(cashPractice.result, /6,550/);
    assert.match(cashPractice.steps.join(' '), /verify/);
    assert.match(posChapter.how.join(' '), /PENDING/);
    assert.match(posChapter.how.join(' '), /Accept Handover/);
    assert.match(posChapter.how.join(' '), /legacy POS/);
    assert.match(posPractice.result, /real-close/);
  }
  assert.equal(6000 + 550, 6550);
});

test('visibility guidance separates operational confidentiality from actual records in both languages', () => {
  const pos = GUIDE_MODULES.find(module => module.route === '/pos');
  const gstr = GUIDE_MODULES.find(module => module.exampleKey === '/accounts-gstr');
  const cash = GUIDE_MODULES.find(module => module.module === 'CASH_DROP');
  assert.equal(gstr.module, 'OFFICIAL_SALES_REPORTS');
  assert.equal(GUIDE_MODULES.length, 17);
  for (const language of ['en', 'hinglish']) {
    const chapterText = module => {
      const chapter = language === 'en' ? module : module.hinglish;
      return [chapter.what, ...chapter.how, chapter.example].join(' ');
    };
    const practiceText = route => {
      const practice = GUIDE_EXAMPLES[route][language];
      return [practice.scenario, ...practice.steps, practice.result].join(' ');
    };
    for (const text of [chapterText(pos), practiceText('/pos')]) {
      for (const token of ['Owner-only', '3-500', 'audit', 'visible', 'actual', 'private', 'accountant', 'OFFICIAL_SALES_REPORTS', 'print', 'demo']) {
        assert.ok(text.includes(token), language + ' POS: ' + token);
      }
      assert.match(text, /stock/);
    }
    for (const text of [chapterText(gstr), practiceText('/accounts-gstr')]) {
      for (const token of ['OFFICIAL_SALES_REPORTS', 'POS_CASHIER', 'explicit', 'Owner-only', 'actual', 'filtered', 'auto']) {
        assert.ok(text.includes(token), language + ' GSTR: ' + token);
      }
    }
    for (const text of [chapterText(cash), practiceText('/cash-drop')]) {
      for (const token of ['Owner-only', 'actual', 'reconciliation', 'indirect', 'custody', 'intentional']) {
        assert.ok(text.includes(token), language + ' Cash Drop: ' + token);
      }
    }
  }
});

test('offline status removes cash from demos and retains English default with Hinglish choice', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/restaurant-erp-archify.html'), 'utf8');
  const statusLine = html.split(String.fromCharCode(10)).find(line => line.startsWith('status:['));
  assert.ok(statusLine);
  assert.match(statusLine, /locally implemented real database/);
  assert.doesNotMatch(statusLine, /Purchase(?: and |, )Cash Drop/);
  assert.match(html, /let language="en"/);
  assert.match(html, /value="hinglish"/);
});
