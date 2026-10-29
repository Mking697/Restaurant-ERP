const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
test('MIS inclusive IST calendar days produce shared half-open bounds and reject invalid/overlong dates', () => {
  const { misCalendarWindow } = load('src/lib/mis-period.ts', {});
  const one = misCalendarWindow('2024-02-29', '2024-02-29');
  assert.equal(one.periodStart, '2024-02-28T18:30:00.000Z');
  assert.equal(one.periodEnd, '2024-02-29T18:30:00.000Z');
  assert.equal(new Date(one.periodEnd) - new Date(one.periodStart), 86400000);
  assert.equal(misCalendarWindow('2024-01-01','2024-01-31').periodEnd,'2024-01-31T18:30:00.000Z');
  for (const [from,to] of [['2024-02-30','2024-03-01'],['2024-01-01','2024-02-01'],['2024-02-02','2024-02-01']]) assert.throws(()=>misCalendarWindow(from,to));
});
test('REPORTS-only picker explains prerequisite grants instead of linking to forbidden reports', () => {
  const passthrough = ({ children }) => React.createElement('div', null, children);
  const reports = load('src/lib/reports.ts', {});
  let actor = {role:'BRANCH_MANAGER',moduleAccess:['REPORTS']};
  const mod = load('src/app/reports/page-content.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/ui-copy': {useUiCopy:()=>s=>s}, 'next/link': {default:({href,children})=>React.createElement('a',{href},children)},
    '@/components/app-shell': {AppShell:passthrough}, '@/components/page-header':{PageHeader:()=>null},
    '@/components/ui/card':Object.fromEntries(['Card','CardContent','CardDescription','CardHeader','CardTitle'].map(k=>[k,passthrough])),
    '@/lib/reports':reports, 'lucide-react':{ArrowRight:()=>null},
    '@/lib/current-user':{useCurrentUser:()=>actor,hasCurrentModule:(a,key)=>a.role==='SUPER_ADMIN'||a.moduleAccess.includes(key)},
  });
  let html=renderToStaticMarkup(React.createElement(mod.default));
  assert.match(html,/href="\/reports\/sales-trend"/);assert.doesNotMatch(html,/href="\/reports\/mis-scorecard"/);
  for(const grant of ['MIS_PERFORMANCE','INVENTORY','AGGREGATOR_RECON']) assert.ok(html.includes(`Requires ${grant} access`));
  actor={role:'SUPER_ADMIN',moduleAccess:[]};html=renderToStaticMarkup(React.createElement(mod.default));
  for(const report of reports.REPORT_DEFS) assert.ok(html.includes(`/reports/${report.slug}`));
});
function load(file, dependencies) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, URL, Date, Map });
  return module.exports;
}
test('Phase 2/3 routes and report details no longer emit the obsolete demo notice', () => {
  const access = load('src/lib/server/page-access.ts', {});
  for (const route of ['/dashboard', '/reports', '/reports/sales-trend', '/reports/mis-scorecard', '/performance', '/tasks', '/purchase']) assert.equal(access.isPersistedPath(route), true, route);
  assert.equal(access.isPersistedPath('/unknown'), false);
  assert.equal(access.canOpenPath({ role: 'CASHIER', moduleAccess: [] }, '/dashboard'), false);
});
test('Dashboard reads the shared scoped MIS reader without APP_ORIGIN or cookie forwarding, retaining its grant', async () => {
  let actor = { role: 'SUPER_ADMIN', moduleAccess: [] };
  const calls = [];
  const db = { select: () => ({ from: () => ({ where: async () => [] }) }) };
  const noop = () => undefined;
  const { GET } = load('src/app/api/dashboard/kpis/route.ts', {
    'drizzle-orm': { and: noop, eq: noop, gte: noop, lt: noop, notInArray: noop, or: noop, sql: noop },
    '@/db/client': { db }, '@/db/schema/pos': { posOrders: {} },
    '@/db/schema/inventory': { inventoryStock: {}, nightVarianceEntries: {} }, '@/db/schema/tasks': { taskInstances: {} },
    '@/lib/server/auth': { requireIdentity: async () => actor },
    '@/lib/server/http': { api: fn => fn(), json: data => data },
    '@/lib/server/permissions': { assertModule: noop, branchScope: () => 'own-branch' },
    '@/lib/server/order-visibility': { operationalOrderVisibility: noop },
    '@/app/api/mis/_shared': { listMisScores: async (...args) => { calls.push(args); return []; } },
    '@/app/api/reports/_aggregation': { computeInventoryValue: noop, istDayKey: noop, istDayRange: () => ({}), istMonthRange: () => ({}), sumMoneyInr: noop },
    '@/app/api/reports/_data': { branchFoodCost: noop, closingCash: async () => [], foodRates: async () => new Map(), inventoryRates: async () => new Map(), reportBranches: async () => [] },
  });
  const request = { url: 'https://example.test/api/dashboard/kpis', headers: { get: () => { throw new Error('Must not forward cookies'); } } };
  await GET(request); assert.equal(calls.length, 1); assert.equal(calls[0][1], actor); assert.equal(calls[0][2].branchId, 'own-branch');
  actor = { role: 'BRANCH_MANAGER', moduleAccess: ['DASHBOARD_OWNER'] };
  await GET(request); assert.equal(calls.length, 1, 'Dashboard-only access must not grant MIS reads');
  actor = { role: 'BRANCH_MANAGER', moduleAccess: ['DASHBOARD_OWNER', 'MIS_PERFORMANCE'] };
  await GET(request); assert.equal(calls.length, 2);
});
