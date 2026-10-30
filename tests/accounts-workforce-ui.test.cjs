// DB-free rendered UI checks. Browser persistence acceptance is parent-owned.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function render(relative, grants, language = 'en', role = 'STAFF', resourceData = null) {
  const actor = { id: 'actor', branchId: 'branch-a', role, moduleAccess: grants, ready: true, authenticated: true };
  const cache = new Map();
  const stubs = {
    '@/lib/current-user': { useCurrentUser: () => actor, hasCurrentModule: (user, ...keys) => user.authenticated && (user.role === 'SUPER_ADMIN' || keys.some(key => user.moduleAccess.includes(key))), requestJson: () => { throw Error('SSR must not request APIs'); } },
    '@/lib/current-branch': { useSelectedBranchId: () => 'branch-a', useBranches: () => ({ branches: [{id:'branch-a', name:'Branch A', code:'A'}], error:'', loading:false }) },
    '@/lib/i18n': { useTranslation: () => ({ language, t: (en, hi) => language === 'hinglish' && hi ? hi : en }) },
    '@/components/app-shell': { AppShell: ({children}) => React.createElement('main', null, children) },
    '@/components/page-header': { PageHeader: ({title,description,children}) => React.createElement('header', null, title, description, children) },
  };
  function load(file) {
    const filename = path.resolve(__dirname, '..', file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports:{}}; cache.set(filename, module);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX} }).outputText;
    function resolve(name) {
      if (stubs[name]) return stubs[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.resolve(__dirname,'../src',name.slice(2)) : path.resolve(path.dirname(filename),name);
        const target = [base,base+'.tsx',base+'.ts'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (!target) throw Error('Missing component dependency '+name);
        return load(target);
      }
      return require(name);
    }
    vm.runInNewContext(output, {module,exports:module.exports,require:resolve,console,URLSearchParams,AbortController,setTimeout,clearTimeout,Intl,Date}, {filename});
    if (resourceData && filename.endsWith('live-ui.tsx')) module.exports.useResource = url => ({data:resourceData(url),loading:false,error:'',reload:async()=>resourceData(url)});
    return module.exports;
  }
  return renderToStaticMarkup(React.createElement(load(relative).default, {branchId:'branch-a'}));
}
test('Accounts expenses grant renders real entry controls, no mock profit or unrelated demo controls', () => {
  const html = render('src/app/accounts/page-content.tsx',['ACCOUNTS_EXPENSES']);
  assert.match(html,/Expenses/);
  assert.match(html,/Profit/);
  assert.doesNotMatch(html,/Petty Cash Entry|Connaught Place|all branches compiled/);
  assert.match(html,/idempotency|reference|Reference/);
});
test('LEAVE_SELF renders only leave requests, never employee salary or attendance controls', () => {
  const html = render('src/app/workforce/page-content.tsx',['LEAVE_SELF']);
  assert.match(html,/Leave requests/);
  assert.doesNotMatch(html,/role="tab"[^>]*>Employees|role="tab"[^>]*>Daily attendance|role="tab"[^>]*>Payroll|Monthly salary|Finalize payroll/);
});
test('Workforce server page owns its live protectedPage guard', () => {
  const source = fs.readFileSync(path.join(__dirname,'../src/app/workforce/page.tsx'),'utf8');
  assert.match(source,/protectedPage\("\/workforce"/);
  assert.match(source,/force-dynamic/);
});
test('grant-specific workforce tabs and Owner bypass do not depend on job title', () => {
  const attendance = render('src/app/workforce/page-content.tsx',['ATTENDANCE']);
  assert.match(attendance,/role="tab"[^>]*>Daily attendance/);
  assert.doesNotMatch(attendance,/role="tab"[^>]*>Employees|role="tab"[^>]*>Payroll|role="tab"[^>]*>Leave requests/);
  const owner = render('src/app/workforce/page-content.tsx',[],'en','SUPER_ADMIN');
  for (const name of ['Employees','Daily attendance','Leave requests','Payroll']) assert.match(owner,new RegExp('role="tab"[^>]*>'+name));
  const denied = render('src/app/workforce/page-content.tsx',[]);
  assert.match(denied,/Workforce permission is required/);
  assert.doesNotMatch(denied,/role="tab"/);
});
test('petty cash-only access renders the real DB-backed petty cash tab, no aggregator/expense controls', () => {
  const html = render('src/app/accounts/page-content.tsx',['PETTY_CASH']);
  assert.match(html,/Real accounts data, saved to Postgres/);
  assert.match(html,/Log petty cash entry/);
  assert.doesNotMatch(html,/Save expense|>Aggregator Recon<|Profit &amp; Loss/);
});
test('employee forms use stable payroll enum values in both languages', () => {
  for (const language of ['en','hinglish']) {
    const html = render('src/app/workforce/employees-panel.tsx',['PAYROLL'],language,'STAFF',()=>({employees:[],users:[]}));
    assert.match(html,/value="ON_ROLL"/); assert.match(html,/value="OFF_ROLL"/);
    assert.match(html,/type="number"[^>]*step="0.01"/);
    assert.match(html,language==='en'?/Create employee/:/Employee banao/);
  }
});
test('approved leave is read-only while unmarked attendance has exactly three stable mark choices', () => {
  const html = render('src/app/workforce/attendance-panel.tsx',['ATTENDANCE'],'en','STAFF',()=>({employees:[{id:'one',name:'Leave person'},{id:'two',name:'Working person'}],attendance:[],leaves:[{employeeId:'one',status:'APPROVED',payType:'PAID'}]}));
  assert.match(html,/Approved leave · read-only/); assert.doesNotMatch(html,/attendance-one/);
  assert.match(html,/attendance-two/);
  for (const value of ['PRESENT','HALF_DAY','ABSENT']) assert.match(html,new RegExp('value="'+value+'"'));
  assert.doesNotMatch(html,/WEEKLY_OFF|WEEKLY OFF/);
});
test('current incomplete payroll shows missing dates and disabled finalization, not a salary transfer', () => {
  const html = render('src/app/workforce/payroll-panel.tsx',['PAYROLL'],'en','STAFF',()=>({month:'2026-10',finalized:false,total:'500.00',rows:[{employeeId:'one',employeeName:'Employee A',employmentType:'ON_ROLL',rate:'15000.00',calendarDays:31,presentDays:1,halfDays:0,paidLeaveDays:0,unpaidDays:0,payableUnits:1,amount:'500.00',status:'DRAFT',missingDates:['2026-10-02']}]}));
  assert.match(html,/2026-10-02/); assert.match(html,/Missing attendance must be marked/);
  assert.match(html,/current or a future month cannot be finalized/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>Finalize payroll/);
  assert.match(html,/no money is sent/);
});
test('leave review controls never expose own requests or unverified identity metadata', () => {
  const base = {id:'leave',employeeId:'person',employeeName:'Person',branchId:'branch-a',startDate:'2026-10-01',endDate:'2026-10-02',reason:'Personal',status:'PENDING',payType:null,reviewNote:null,requestedById:'other'};
  const own = render('src/app/workforce/leaves-panel.tsx',['LEAVE_APPROVAL'],'en','STAFF',()=>({employees:[{id:'person',name:'Person'}],leaves:[{...base,employeeUserId:'actor'}]}));
  assert.match(own,/Cannot review own leave/); assert.doesNotMatch(own,/>Review request</);
  const allowed = render('src/app/workforce/leaves-panel.tsx',['LEAVE_APPROVAL'],'en','STAFF',()=>({employees:[{id:'person',name:'Person'}],leaves:[{...base,employeeUserId:null,employmentType:'OFF_ROLL'}]}));
  assert.match(allowed,/>Review request</); assert.match(allowed,/Off-roll: unpaid/);
  const unknown = render('src/app/workforce/leaves-panel.tsx',['LEAVE_APPROVAL'],'en','STAFF',()=>({employees:[],leaves:[base]}));
  assert.match(unknown,/Review metadata unavailable/);assert.doesNotMatch(unknown,/>Review request</);
});
test('Payroll-only grant can view aggregate P&L but cannot post or inspect expenses', () => {
  const html = render('src/app/accounts/page-content.tsx',['PAYROLL']);
  assert.match(html,/Profit &amp; Loss/);
  assert.match(html,/COGS and gross profit remain unavailable/);
  assert.doesNotMatch(html,/Post expense|Save expense|Saved expenses<|Reference<|Petty Cash Entry/);
});
module.exports = {render};
