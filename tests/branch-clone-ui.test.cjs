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
  let actor = { id: 'owner', ready: true, authenticated: true, status: 'Active', role: 'SUPER_ADMIN', branchId: null, moduleAccess: [], error: null };
  let branchState = { branches: ['a', 'b'].map(id => ({ id, code: id, name: id, address: '', lat: '0', lng: '0', geofenceRadiusM: 50 })), loading: false, error: null };
  const hooks = { ...React,
    useState(initial) { const store = active, i = cursor++; if (!(i in store)) store[i] = typeof initial === 'function' ? initial() : initial; return [store[i], value => { store[i] = typeof value === 'function' ? value(store[i]) : value; }]; },
    useRef(initial) { const [ref] = hooks.useState(() => ({ current: initial })); return ref; },
    useEffect(fn, deps) { const store = active, i = cursor++; if (!store[i] || deps.some((v,n) => v !== store[i].deps[n])) { const previous = store[i]; store[i] = { deps }; effects.push(() => { previous?.cleanup?.(); store[i].cleanup = fn(); }); } },
  };
  const deps = { react: hooks, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/ui-copy': { useUiCopy: () => (en, hi) => language === 'hi' ? hi || en : en },
    '@/lib/current-user': { useCurrentUser: () => actor, requestJson: (url, init) => new Promise((resolve,reject) => requests.push({ url, init, resolve, reject })) },
    '@/lib/current-branch': { useBranches: () => branchState, notifyBranchesChanged() {} },
  };
  for (const [file, names] of Object.entries({ '@/components/app-shell': ['AppShell'], '@/components/page-header': ['PageHeader'], '@/components/ui/button': ['Button'], '@/components/ui/card': ['Card','CardContent'], '@/components/ui/table': ['Table','TableBody','TableCell','TableHead','TableHeader','TableRow'], '@/components/ui/dialog': ['Dialog','DialogContent','DialogDescription','DialogHeader','DialogTitle'] })) deps[file] = Object.fromEntries(names.map(name => [name,name]));
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/admin/branches/page-content.tsx','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, require: name => { assert.ok(deps[name], name); return deps[name]; }, AbortController, Error, Set });
  function expand(node, path = 'root') {
    if (Array.isArray(node)) return node.map((n,i) => expand(n,path+i));
    if (!node || typeof node !== 'object') return node;
    const key = path + ':' + (node.key ?? '');
    if (typeof node.type === 'function') { visited.add(key); active = stores.get(key) || []; stores.set(key,active); cursor = 0; return expand(node.type(node.props),key+'.'); }
    if (node.type === 'Dialog' && !node.props.open) return { ...node, props: { ...node.props, children: null } };
    return { ...node, props: { ...node.props, children: expand(node.props?.children,key+'.') } };
  }
  const render = () => { visited = new Set(); const tree = expand(React.createElement(module.exports.default)); for (const [key,store] of stores) if (!visited.has(key)) { store.forEach(v => v?.cleanup?.()); stores.delete(key); } return tree; };
  const nodes = (node,predicate) => Array.isArray(node) ? node.flatMap(n => nodes(n,predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props.children,predicate)];
  const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props.children) : String(node ?? '');
  const find = predicate => nodes(render(),predicate);
  const button = label => find(n => n.type === 'Button' && text(n) === label)[0];
  const cloneDialog = () => find(n => n.type === 'Dialog' && nodes(n, x => x.type === 'select').length)[0];
  const field = label => { const dialog = cloneDialog(); const match = nodes(dialog, n => n.type === 'label').find(n => text(n).startsWith(label)); assert.ok(match, label); return nodes(match, n => ['select','input'].includes(n.type))[0]; };
  const submit = () => nodes(cloneDialog(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  const flush = async () => { for (let i=0;i<3;i++) { render(); while (effects.length) effects.shift()(); await tick(); } };
  return { render, find, text, button, cloneDialog, field, submit, flush, requests, setActor: value => { actor = {...actor,...value}; }, setBranches: value => { branchState = {...branchState,...value}; }, hi: () => { language = 'hi'; } };
}

test('Owner sees a real Clone Branch action instead of the old disabled button', async () => {
  const h = harness(); await h.flush();
  assert.equal(h.button('Clone unavailable'), undefined);
  assert.ok(h.button('Clone Branch'));
  h.button('Clone Branch').props.onClick(); await h.flush();
  assert.match(h.text(h.render()), /checklist/i);
});

test('Branch Admin and unauthenticated actors never see Clone Branch', async () => {
  const admin = harness(); admin.setActor({ role: 'BRANCH_MANAGER', branchId: 'a' }); await admin.flush();
  assert.equal(admin.button('Clone Branch'), undefined);
  const guest = harness(); guest.setActor({ authenticated: false, ready: false }); await guest.flush();
  assert.equal(guest.button('Clone Branch'), undefined);
});

test('Clone dialog is closed until opened, submits sourceBranchId plus new-branch fields, and shows copied counts', async () => {
  const h = harness(); await h.flush();
  assert.equal(h.cloneDialog(), undefined);
  h.button('Clone Branch').props.onClick(); await h.flush();
  assert.ok(h.cloneDialog());
  assert.equal(h.requests.length, 0);
  h.field('Source branch').props.onChange({ target: { value: 'a' } });
  h.field('New branch code').props.onChange({ target: { value: 'B9' } });
  h.field('New branch name').props.onChange({ target: { value: 'Branch 9' } });
  const promise = h.submit();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/api/branches/clone');
  assert.equal(h.requests[0].init.method, 'POST');
  const body = JSON.parse(h.requests[0].init.body);
  assert.equal(body.sourceBranchId, 'a');
  assert.equal(body.code, 'B9');
  assert.equal(body.name, 'Branch 9');
  assert.equal('sourceBranchId' in body, true);
  h.requests[0].resolve({ branch: { id: 'new', code: 'B9', name: 'Branch 9', address: '', lat: '0', lng: '0', geofenceRadiusM: 50 }, copied: { menuItems: 3, bomRecipes: 5, checklistTemplates: 2 } });
  await promise; await h.flush();
  assert.equal(h.cloneDialog(), undefined); // dialog closes on success
  assert.match(h.text(h.render()), /3.*menu items/);
  assert.match(h.text(h.render()), /5.*recipes/);
  assert.match(h.text(h.render()), /2.*checklist steps/);
});

test('Clone dialog surfaces a server error (e.g. duplicate code) without closing', async () => {
  const h = harness(); await h.flush();
  h.button('Clone Branch').props.onClick(); await h.flush();
  h.field('Source branch').props.onChange({ target: { value: 'a' } });
  h.field('New branch code').props.onChange({ target: { value: 'DUP' } });
  h.field('New branch name').props.onChange({ target: { value: 'Dup' } });
  const promise = h.submit();
  h.requests[0].reject(new Error('Record already exists'));
  await promise; await h.flush();
  assert.ok(h.cloneDialog());
  assert.match(h.text(h.render()), /Record already exists/);
});

test('bilingual copy-scope note names what is and is not copied', async () => {
  const h = harness(); await h.flush();
  h.button('Clone Branch').props.onClick(); await h.flush();
  assert.match(h.text(h.render()), /checklist templates/i);
  assert.match(h.text(h.render()), /NOT copied.*inventory stock.*vendor rates.*users.*recurring task/i);
  h.hi();
  assert.match(h.text(h.render()), /COPY NAHI hota/);
});

test('closing the clone dialog discards the draft; reopening starts fresh', async () => {
  const h = harness(); await h.flush();
  h.button('Clone Branch').props.onClick(); await h.flush();
  h.field('Source branch').props.onChange({ target: { value: 'b' } });
  h.cloneDialog().props.onOpenChange(false); await h.flush();
  assert.equal(h.cloneDialog(), undefined);
  h.button('Clone Branch').props.onClick(); await h.flush();
  assert.equal(h.field('Source branch').props.value, '');
});
