const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const stores = new Map(), effects = [], requests = [], posts = [];
  let active, cursor, visited;
  let user = { id: 'owner', ready: true, authenticated: true, role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] }, selected = 'all';
  const hooks = { ...React,
    useState(initial) { const store = active, i = cursor++; if (!(i in store)) store[i] = typeof initial === 'function' ? initial() : initial; return [store[i], value => { store[i] = typeof value === 'function' ? value(store[i]) : value; }]; },
    useRef(initial) { const [ref] = hooks.useState(() => ({ current: initial })); return ref; },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) { const store = active, i = cursor++; if (!store[i] || deps.some((v,n) => v !== store[i].deps[n])) { const previous = store[i]; store[i] = { deps }; effects.push(() => { previous?.cleanup?.(); store[i].cleanup = fn(); }); } },
  };
  // Match useCallback identity semantics: useResource's effect depends on reload.
  hooks.useCallback = (fn, deps) => { const store = active, i = cursor++; if (!store[i] || deps.some((v,n) => v !== store[i].deps[n])) store[i] = { deps, fn }; return store[i].fn; };
  const deps = {
    react: hooks, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/i18n': { useTranslation: () => ({ t: en => en }) },
    '@/lib/current-branch': { useBranches: () => ({ branches: [{ id: 'a', name: 'A', code: 'A' }, { id: 'b', name: 'B', code: 'B' }] }), useSelectedBranchId: () => selected },
    '@/lib/current-user': { useCurrentUser: () => user, hasCurrentModule: (actor, grant) => actor.ready && actor.authenticated && (actor.role === 'SUPER_ADMIN' || actor.moduleAccess.includes(grant)), requestJson: async (url, init) => {
      if (init) { posts.push({ url, body: JSON.parse(init.body) }); return {}; }
      if (url.startsWith('/api/tasks/assignees')) return new Promise((resolve,reject) => requests.push({ url, resolve, reject }));
      return url.startsWith('/api/tasks/recurring') ? { recurring: [] } : { instances: [] };
    } },
    'lucide-react': Object.fromEntries(['Plus','Repeat','UserCheck','Paperclip','CheckCircle2'].map(name => [name,name])),
  };
  for (const [file, names] of Object.entries({ '@/components/app-shell': ['AppShell'], '@/components/page-header': ['PageHeader'], '@/components/ui/button': ['Button'], '@/components/ui/tabs': ['Tabs','TabsContent','TabsList','TabsTrigger'], '@/components/ui/dialog': ['Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle','DialogTrigger'] })) deps[file] = Object.fromEntries(names.map(name => [name,name]));
  function load(file) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, require: name => { assert.ok(name in deps, name); return deps[name]; }, URLSearchParams, Date, Error });
    return module.exports;
  }
  deps['../workforce/live-ui'] = load('src/app/workforce/live-ui.tsx');
  const page = load('src/app/tasks/page-content.tsx').default;
  function expand(node, path = 'root') {
    if (Array.isArray(node)) return node.map((n,i) => expand(n,path+i));
    if (!node || typeof node !== 'object') return node;
    const key = path + ':' + (node.key ?? '');
    if (typeof node.type === 'function') { visited.add(key); active = stores.get(key) || []; stores.set(key,active); cursor = 0; return expand(node.type(node.props),key+'.'); }
    return { ...node, props: { ...node.props, children: expand(node.props?.children,key+'.') } };
  }
  const render = () => { visited = new Set(); const tree = expand(React.createElement(page)); for (const [key,store] of stores) if (!visited.has(key)) { store.forEach(v => v?.cleanup?.()); stores.delete(key); } return tree; };
  const nodes = (node,predicate) => Array.isArray(node) ? node.flatMap(n => nodes(n,predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props.children,predicate)];
  const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props.children) : String(node ?? '');
  const find = predicate => nodes(render(),predicate);
  const dialogs = () => find(n => n.type === 'Dialog' && nodes(n,x => x.type === 'form').length);
  const open = index => dialogs()[index].props.onOpenChange(true);
  const fields = index => nodes(dialogs()[index],n => n.type === 'label');
  const field = (index,label) => { const match = fields(index).find(n => text(n).startsWith(label)); assert.ok(match, label); return nodes(match,n => ['select','input'].includes(n.type))[0]; };
  const submit = index => nodes(dialogs()[index],n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  const flush = async () => { for (let i=0;i<3;i++) { render(); while (effects.length) effects.shift()(); await tick(); } };
  return { render, find, text, open, field, submit, requests, posts, flush, dialogs, setUser: value => { user = { ...user,...value }; }, select: value => { selected = value; } };
}

for (const index of [0,1]) test(`dialog ${index} lazily loads branch-bound assignees and submits looked-up ID`, async () => {
  const h = harness(); await h.flush(); assert.equal(h.requests.length,0);
  h.open(index); await h.flush(); assert.equal(h.requests.length,0);
  h.field(index,'Branch').props.onChange({ target: { value: 'a' } }); await h.flush();
  assert.equal(h.requests.length,1); assert.equal(h.requests[0].url,'/api/tasks/assignees?branchId=a');
  const doer = h.field(index,index === 0 ? 'Assigned to' : 'Assign to');
  assert.equal(doer.type,'select'); assert.equal(doer.props.disabled,true);
  await h.submit(index); assert.equal(h.posts.length,0);
  h.requests[0].resolve({ branchId:'a', assignees:[{ id:'u-a', name:'Alice' }] }); await h.flush();
  h.field(index,index === 0 ? 'Assigned to' : 'Assign to').props.onChange({ target: { value:'u-a' } });
  h.field(index,index === 0 ? 'Anchor assign date' : 'Due').props.onChange({ target: { value:'2026-10-30' } });
  await h.submit(index); assert.equal(h.posts.length,1); assert.equal(h.posts[0].body.assignedToId,'u-a'); assert.equal(h.posts[0].body.branchId,'a');
});

for (const index of [0,1]) {
  const label = index === 0 ? 'Assigned to' : 'Assign to';
  test(`dialog ${index} resets selection on branch change before effects and rejects stale responses`, async () => {
    const h = harness(); await h.flush(); h.open(index);
    h.field(index,'Branch').props.onChange({ target:{ value:'a' } }); await h.flush();
    h.requests[0].resolve({ branchId:'a', assignees:[{ id:'shared', name:'Alice' }] }); await h.flush();
    h.field(index,label).props.onChange({ target:{ value:'shared' } });
    assert.equal(h.field(index,label).props.value,'shared');
    h.field(index,'Branch').props.onChange({ target:{ value:'b' } });
    assert.equal(h.field(index,label).props.value,'');
    assert.equal(h.field(index,label).props.disabled,true);
    await h.submit(index); assert.equal(h.posts.length,0);
    await h.flush();
    // A same ID in a new branch must still require a fresh user selection.
    h.requests[1].resolve({ branchId:'b', assignees:[{ id:'shared', name:'Bob' }] }); await h.flush();
    assert.equal(h.field(index,label).props.value,'');
    await h.submit(index); assert.equal(h.posts.length,0);
    h.field(index,'Branch').props.onChange({ target:{ value:'a' } }); await h.flush();
    h.field(index,'Branch').props.onChange({ target:{ value:'b' } }); await h.flush();
    h.requests[3].resolve({ branchId:'b', assignees:[{ id:'new-b', name:'Current B' }] }); await h.flush();
    h.requests[2].resolve({ branchId:'a', assignees:[{ id:'old-a', name:'Stale A' }] }); await h.flush();
    assert.equal(h.text(h.field(index,label)).includes('Stale A'),false);
    assert.equal(h.text(h.field(index,label)).includes('Current B'),true);
  });
  for (const outcome of ['empty','error','foreign']) test(`dialog ${index} fails closed on ${outcome} lookup`, async () => {
    const h = harness(); await h.flush(); h.open(index);
    h.field(index,'Branch').props.onChange({ target:{ value:'a' } }); await h.flush();
    if (outcome === 'error') h.requests[0].reject(new Error('lookup unavailable'));
    else h.requests[0].resolve({ branchId: outcome === 'foreign' ? 'b' : 'a', assignees: outcome === 'empty' ? [] : [{ id:'u',name:'Foreign' }] });
    await h.flush();
    const field = h.field(index,label);
    assert.equal(field.props.disabled,true); assert.equal(field.props.value,'');
    field.props.onChange({ target:{ value:'u' } });
    await h.submit(index); assert.equal(h.posts.length,0);
    if (outcome === 'error') assert.match(h.text(h.render()),/lookup unavailable/);
  });
  test(`dialog ${index} close cancels late lookup and reopening starts with no selection`, async () => {
    const h = harness(); h.select('a'); await h.flush(); h.open(index); await h.flush();
    h.dialogs()[index].props.onOpenChange(false); await h.flush();
    h.requests[0].resolve({ branchId:'a',assignees:[{ id:'old',name:'Old' }] }); await h.flush();
    h.open(index); assert.equal(h.field(index,label).props.value,'');
    assert.equal(h.field(index,label).props.disabled,true); await h.flush();
    assert.equal(h.requests.length,2);
  });
}

test('live actor/grant/selected-branch changes remount drafts and never grant CHECKLISTS a directory', async () => {
  const h = harness(); h.select('a'); await h.flush(); h.open(0); await h.flush();
  h.requests[0].resolve({ branchId:'a',assignees:[{ id:'u',name:'Alice' }] }); await h.flush();
  h.field(0,'Assigned to').props.onChange({ target:{ value:'u' } });
  h.select('b');
  assert.equal(h.dialogs()[0].props.open,false);
  assert.equal(h.field(0,'Assigned to').props.value,'');
  await h.flush(); assert.equal(h.requests.length,1);
  h.setUser({ id:'staff', role:'CASHIER',branchId:'a',moduleAccess:['CHECKLISTS'] }); await h.flush();
  assert.equal(h.dialogs().length,0); assert.equal(h.requests.length,1);
  h.setUser({ moduleAccess:['TASKS_DELEGATION'] }); await h.flush();
  assert.equal(h.dialogs().length,1); h.open(0); await h.flush();
  assert.equal(h.requests[1].url,'/api/tasks/assignees?branchId=a');
  h.setUser({ moduleAccess:[] }); await h.flush();
  h.requests[1].resolve({ branchId:'a',assignees:[{ id:'old',name:'Revoked' }] }); await h.flush();
  assert.equal(h.dialogs().length,0); assert.equal(h.posts.length,0);
});
