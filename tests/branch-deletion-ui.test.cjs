const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const stores = new Map(), effects = [], requests = [];
  let active, cursor, visited, language = 'en';
  let actor = { id:'owner', ready:true, authenticated:true, status:'Active', role:'SUPER_ADMIN', branchId:null, moduleAccess:[], error:null };
  let branchState = { branches: ['a','b'].map(id => ({ id, code:id, name:id, address:'', lat:'0', lng:'0', geofenceRadiusM:50 })), loading:false, error:null };
  const hooks = { ...React,
    useState(initial) { const store = active, i = cursor++; if (!(i in store)) store[i] = typeof initial === 'function' ? initial() : initial; return [store[i], value => { store[i] = typeof value === 'function' ? value(store[i]) : value; }]; },
    useRef(initial) { const [ref] = hooks.useState(() => ({ current:initial })); return ref; },
    useEffect(fn, deps) { const store = active, i = cursor++; if (!store[i] || deps.some((v,n) => v !== store[i].deps[n])) { const previous = store[i]; store[i] = { deps }; effects.push(() => { previous?.cleanup?.(); store[i].cleanup = fn(); }); } },
  };
  const deps = { react:hooks, 'react/jsx-runtime':require('react/jsx-runtime'),
    '@/lib/ui-copy': { useUiCopy: () => (en, hi) => language === 'hi' ? hi || en : en },
    '@/lib/current-user': { useCurrentUser:() => actor, requestJson:(url, init) => new Promise((resolve,reject) => requests.push({url,init,resolve,reject})) },
    '@/lib/current-branch': { useBranches:() => branchState, notifyBranchesChanged() {} },
  };
  for (const [file, names] of Object.entries({ '@/components/app-shell':['AppShell'], '@/components/page-header':['PageHeader'], '@/components/ui/button':['Button'], '@/components/ui/card':['Card','CardContent'], '@/components/ui/table':['Table','TableBody','TableCell','TableHead','TableHeader','TableRow'], '@/components/ui/dialog':['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'] })) deps[file] = Object.fromEntries(names.map(name => [name,name]));
  const module = { exports:{} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/admin/branches/page-content.tsx','utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX } }).outputText, { module, exports:module.exports, require:name => { assert.ok(deps[name], name); return deps[name]; }, AbortController, Error, Set });
  function expand(node, path = 'root') {
    if (Array.isArray(node)) return node.map((n,i) => expand(n,path+i));
    if (!node || typeof node !== 'object') return node;
    const key = path + ':' + (node.key ?? '');
    if (typeof node.type === 'function') { visited.add(key); active = stores.get(key) || []; stores.set(key,active); cursor = 0; return expand(node.type(node.props),key+'.'); }
    if (node.type === 'Dialog' && !node.props.open) return { ...node, props:{ ...node.props, children:null } };
    return { ...node, props:{ ...node.props, children:expand(node.props?.children,key+'.') } };
  }
  const render = () => { visited = new Set(); const tree = expand(React.createElement(module.exports.default)); for (const [key,store] of stores) if (!visited.has(key)) { store.forEach(v => v?.cleanup?.()); stores.delete(key); } return tree; };
  const nodes = (node,predicate) => Array.isArray(node) ? node.flatMap(n => nodes(n,predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props.children,predicate)];
  const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props.children) : String(node ?? '');
  const find = predicate => nodes(render(),predicate);
  const button = label => find(n => n.type === 'Button' && text(n) === label)[0];
  const open = (index = 0) => find(n => n.type === 'Button' && text(n) === 'Edit')[index].props.onClick();
  const check = () => { const b = button('Check deletion readiness') || button('Retry deletion check'); assert.ok(b, 'Owner read-only readiness action must exist'); return b.props.onClick(); };
  const flush = async () => { for (let i=0;i<3;i++) { render(); while (effects.length) effects.shift()(); await tick(); } };
  return { render, find, text, button, open, check, flush, requests, setActor:value => { actor = {...actor,...value}; }, setBranches:value => { branchState = {...branchState,...value}; }, hi:() => { language = 'hi'; } };
}
const ready = { branchId:'a', canDelete:true, dependencies:[] };
test('Owner check is lazy, read-only GET with snapshot warning; linked counts only and no destructive action', async () => {
  const h = harness(); await h.flush(); assert.equal(h.requests.length,0); h.open(); await h.flush(); assert.equal(h.requests.length,0);
  const promise = h.check(); assert.equal(h.requests.length,1); assert.equal(h.requests[0].url,'/api/branches/a/deletion-check'); assert.equal(h.requests[0].init.method,'GET');
  h.requests[0].resolve({ branchId:'a',canDelete:false,dependencies:[{group:'users',count:2}] }); await promise; await h.flush();
  assert.match(h.text(h.render()),/Linked records prevent deletion/); assert.match(h.text(h.render()),/users.*2/); assert.match(h.text(h.render()),/snapshot.*server rechecks/i); assert.match(h.text(h.render()),/No automatic cleanup/i);
  assert.equal(h.find(n => n.type === 'Button' && /^delete( branch)?$/i.test(h.text(n))).length,0);
  assert.ok(h.requests.every(r => r.init?.method === 'GET'));
});
test('readiness errors and wrong-branch/malformed replies clear old counts and offer bilingual retry', async () => {
  const h = harness(); await h.flush(); h.open(); await h.flush();
  let promise = h.check(); h.requests[0].resolve(ready); await promise; await h.flush(); assert.match(h.text(h.render()),/No linked records found/);
  promise = h.check(); assert.doesNotMatch(h.text(h.render()),/No linked records found/); h.requests[1].reject(new Error('unavailable')); await promise; await h.flush(); assert.ok(h.button('Retry deletion check'));
  promise = h.check(); h.requests[2].resolve({...ready,branchId:'b'}); await promise; await h.flush(); assert.doesNotMatch(h.text(h.render()),/No linked records found/);
  promise = h.check(); h.requests[3].resolve({...ready,dependencies:[{group:'users',count:1}]}); await promise; await h.flush(); assert.ok(h.button('Retry deletion check'));
  h.hi(); assert.match(h.text(h.render()),/Dobara deletion check karein/);
});
test('changing/closing branch discards pending responses and reopening has no old readiness', async () => {
  const h = harness(); await h.flush(); h.open(); await h.flush(); const promise = h.check();
  h.open(1); assert.doesNotMatch(h.text(h.render()),/No linked records found/); await h.flush(); h.requests[0].resolve(ready); await promise; await h.flush(); assert.doesNotMatch(h.text(h.render()),/No linked records found/);
  const next = h.check(); assert.equal(h.requests[1].url,'/api/branches/b/deletion-check');
  h.find(n => n.type === 'Dialog')[0].props.onOpenChange(false); await h.flush(); h.requests[1].resolve({...ready,branchId:'b'}); await next; await h.flush(); h.open(1); assert.doesNotMatch(h.text(h.render()),/No linked records found/);
});
for (const changed of [{id:'other-owner'}, {role:'BRANCH_MANAGER',branchId:'a'}, {ready:false}, {authenticated:false}, {status:'Inactive'}, {error:'session unavailable'}]) test('actor transition synchronously masks readiness: ' + JSON.stringify(changed), async () => {
  for (const pending of [true,false]) {
    const h = harness(); await h.flush(); h.open(); await h.flush(); const promise = h.check();
    if (!pending) { h.requests[0].resolve(ready); await promise; await h.flush(); assert.match(h.text(h.render()),/No linked records found/); }
    h.setActor(changed);
    assert.doesNotMatch(h.text(h.render()),/No linked records found/); await h.flush();
    if (pending) { h.requests[0].resolve(ready); await promise; await h.flush(); }
    assert.doesNotMatch(h.text(h.render()),/No linked records found/);
    if (changed.role || changed.ready === false || changed.authenticated === false || changed.status || changed.error) assert.equal(h.button('Check deletion readiness'),undefined);
  }
});
test('missing/stale branch list fails closed and Branch Admin/new-branch dialogs never offer counts', async () => {
  const h = harness(); await h.flush(); h.open(); await h.flush(); const promise = h.check(); h.setBranches({branches:[]}); await h.flush(); h.requests[0].resolve(ready); await promise; await h.flush(); assert.equal(h.button('Check deletion readiness'),undefined); assert.doesNotMatch(h.text(h.render()),/No linked records found/);
  const admin = harness(); admin.setActor({role:'BRANCH_MANAGER',branchId:'a'}); await admin.flush(); admin.open(); assert.equal(admin.button('Check deletion readiness'),undefined); assert.equal(admin.requests.length,0);
  const fresh = harness(); await fresh.flush(); fresh.button('New Branch').props.onClick(); assert.equal(fresh.button('Check deletion readiness'),undefined);
});
