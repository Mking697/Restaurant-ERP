const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

// Execute the actual page handlers with a deterministic hook state boundary.
// This is component behavior evidence, not a browser/visual acceptance claim.
async function pageHarness(options = {}) {
  const state = [], effects = [], posts = [];
  let cursor = 0, first = true, user = { id: 'owner', ready: true, authenticated: true, role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
  const fakeReact = { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const [ref] = fakeReact.useState(() => ({ current: initial })); return ref; },
    useCallback: fn => fn,
    useEffect: fn => { if (first) effects.push(fn); },
  };
  const approved = { id: 'approved-a', branchId: 'a', lines: [
    { rawMaterialId: 'rice', qty: '10.000', name: 'Rice', unit: 'kg' },
    { rawMaterialId: 'oil', qty: '5.000', name: 'Oil', unit: 'l' },
  ] };
  const dependencies = {
    '@/components/vendor-returns-panel': { VendorReturnsPanel: 'VendorReturnsPanel' },
    react: fakeReact,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/ui-copy': { useUiCopy: () => en => en },
    '@/lib/current-branch': { useBranches: () => ({ branches: [{ id: 'a', code: 'A', name: 'Branch A' }, { id: 'b', code: 'B', name: 'Branch B' }] }) },
    '@/lib/current-user': { useCurrentUser: () => user, RequestJsonError: Error, requestJson: async (url, init) => {
      if (options.request) { const value = await options.request(url, init); if (value !== undefined) return value; }
      if (init?.method === 'POST') { posts.push(JSON.parse(init.body)); return { purchaseOrder: { poNumber: 'PO-QA' } }; }
      if (url.includes('approved-indents')) return { indents: [approved] };
      if (url === '/api/raw-materials') return { rawMaterials: [] };
      if (url === '/api/purchase/vendors') return { vendors: [{ id: 'v', name: 'Vendor' }] };
      if (url === '/api/purchase/orders') return { purchaseOrders: [] };
      if (url === '/api/purchase/grns') return { grns: [] };
      return { indents: [] };
    } },
    '@/components/toast': { useToast: () => ({ notify: () => {}, ToastHost: 'ToastHost' }) },
    '@/lib/utils': { formatInr: String },
    'lucide-react': Object.fromEntries(['Plus', 'Check', 'X', 'Upload', 'PackageCheck', 'FlaskConical', 'Trash2'].map(k => [k, k])),
  };
  for (const [path, names] of Object.entries({
    '@/components/app-shell': ['AppShell'], '@/components/page-header': ['PageHeader'], '@/components/ui/button': ['Button'],
    '@/components/ui/card': ['Card', 'CardContent'], '@/components/ui/table': ['Table', 'TableBody', 'TableCell', 'TableHead', 'TableHeader', 'TableRow'],
    '@/components/ui/badge': ['Badge'], '@/components/ui/tabs': ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger'],
    '@/components/ui/dialog': ['Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle', 'DialogTrigger'],
  })) dependencies[path] = Object.fromEntries(names.map(k => [k, k]));
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync('src/app/purchase/page-content.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, URLSearchParams, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = () => { cursor = 0; const tree = module.exports.default(); first = false; return tree; };
  render(); effects.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve));
  const nodes = (node, predicate) => {
    if (Array.isArray(node)) return node.flatMap(n => nodes(n, predicate));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
  };
  const field = label => {
    const found = nodes(render(), n => n.props?.label === label)[0];
    assert.ok(found, `Missing field: ${label}`);
    return found.props.children;
  };
  const change = (label, value) => field(label).props.onChange({ target: { value } });
  const submit = () => nodes(render(), n => n.type === 'Button' && String(n.props.children).includes('Create (Step 1: Buy)'))[0];
  const general = checked => nodes(render(), n => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange({ target: { checked } });
  const button = label => { const node = nodes(render(), n => n.type === 'Button' && String(n.props.children).trim() === label)[0]; assert.ok(node, 'Missing button: '+label); return node; };
  const dialog = () => nodes(render(), n => n.type === 'Dialog')[0];
  return { field, change, submit, general, posts, nodes, render, button, dialog, setUser: value => { user = { ...user, ...value }; } };
}

test('approved lookup network error clears old quantities and explicit retry stays read-only', async () => {
  let offline = true;
  const h = await pageHarness({ request: async url => { if (url.includes('/approved-indents/')) { if (offline) throw new Error('offline'); return { indent: historicalIndent }; } } });
  h.dialog().props.onOpenChange(true); h.change('Branch','a'); h.change('Approved indent','approved-a'); h.change('Full indent ID','old');
  await h.button('Look up approved indent').props.onClick(); assert.equal(h.field('Approved indent').props.value,''); assert.equal(!!h.submit().props.disabled,true);
  assert.ok(h.nodes(h.render(), n => n.props?.role === 'alert').some(n => String(n.props.children).includes('lookup failed')));
  offline = false; await h.button('Look up approved indent').props.onClick(); assert.equal(h.field('Approved indent').props.value,'old'); assert.equal(h.posts.length,0);
});

const historicalIndent = { id: 'old', branchId: 'a', lines: [{ rawMaterialId: 'rice', qty: '3.250', name: 'Rice', unit: 'kg' }] };
test('historical approved lookup selects exact full document without a write or changing locked quantities', async () => {
  const reads = [];
  const h = await pageHarness({ request: async (url, init) => { if (url.includes('/approved-indents/')) { reads.push({url,init}); return { indent: historicalIndent }; } } });
  h.dialog().props.onOpenChange(true); h.change('Branch', 'a'); h.change('Vendor', 'v');
  h.change('Full indent ID', 'old'); await h.button('Look up approved indent').props.onClick();
  assert.equal(h.field('Approved indent').props.value, 'old');
  assert.equal(reads[0].url, '/api/purchase/orders/approved-indents/old?branchId=a'); assert.equal(reads[0].init, undefined);
  h.nodes(h.render(), n => n.props?.['aria-label'] === 'Rate for Rice')[0].props.onChange({ target: { value: '7.00' } });
  await h.submit().props.onClick(); assert.equal(h.posts[0].indentId, 'old'); assert.deepEqual(h.posts[0].lines, [{ rawMaterialId: 'rice', qty: '3.250', rate: '7.00' }]);
});
for (const change of ['branch', 'type', 'dialog', 'identity', 'input']) test(`late approved lookup is discarded after ${change} changes`, async () => {
  let release; const h = await pageHarness({ request: url => url.includes('/approved-indents/') ? new Promise(resolve => { release = resolve; }) : undefined });
  h.dialog().props.onOpenChange(true); h.change('Branch', 'a'); h.change('Full indent ID', 'old');
  const pending = h.button('Look up approved indent').props.onClick();
  if (change === 'branch') h.change('Branch', 'b');
  if (change === 'type') h.general(true);
  if (change === 'dialog') h.dialog().props.onOpenChange(false);
  if (change === 'identity') { h.setUser({ id: 'other', moduleAccess: [], role: 'CASHIER' }); h.render(); }
  if (change === 'input') h.change('Full indent ID', 'new');
  release({ indent: historicalIndent }); await pending;
  assert.equal(!!h.submit().props.disabled, true); assert.equal(h.posts.length, 0);
  assert.equal(h.nodes(h.render(), n => n.props?.['aria-label'] === 'Rate for Rice').length, 0);
});
test('approved lookup cannot resurrect a stale response after identity changes away and back', async () => {
  let release; const h = await pageHarness({ request: url => url.includes('/approved-indents/') ? new Promise(resolve => { release = resolve; }) : undefined });
  h.dialog().props.onOpenChange(true); h.change('Branch', 'a'); h.change('Full indent ID', 'old'); const pending = h.button('Look up approved indent').props.onClick();
  h.setUser({ id: 'other' }); h.render(); h.setUser({ id: 'owner' }); h.render();
  release({ indent: historicalIndent }); await pending;
  assert.equal(h.field('Approved indent').props.value, ''); assert.equal(!!h.button('Look up approved indent').props.disabled, false);
});

for (const bad of [null, { ...historicalIndent, id: 'wrong' }, { ...historicalIndent, branchId: 'b' }, { ...historicalIndent, lines: [] }, { ...historicalIndent, lines: [{ rawMaterialId: 'rice', qty: 'NaN' }] }]) test(`malformed approved exact DTO clears old selection ${JSON.stringify(bad)}`, async () => {
  const h = await pageHarness({ request: async url => url.includes('/approved-indents/') ? { indent: bad } : undefined });
  h.dialog().props.onOpenChange(true); h.change('Branch', 'a'); h.change('Approved indent', 'approved-a'); h.change('Full indent ID', 'old');
  await h.button('Look up approved indent').props.onClick(); assert.equal(h.field('Approved indent').props.value, ''); assert.equal(!!h.submit().props.disabled, true);
});

test('store purchase submits approved indent with all locked quantities and per-line rates', async () => {
  const h = await pageHarness();
  h.change('Branch', 'a'); h.change('Vendor', 'v');
  assert.equal(!!h.submit().props.disabled, true);
  h.change('Approved indent', 'approved-a');
  const rates = h.nodes(h.render(), n => n.type === 'input' && n.props['aria-label']?.startsWith('Rate for '));
  assert.equal(rates.length, 2);
  rates[0].props.onChange({ target: { value: '60' } });
  h.nodes(h.render(), n => n.type === 'input' && n.props['aria-label'] === 'Rate for Oil')[0].props.onChange({ target: { value: '100' } });
  assert.equal(!!h.submit().props.disabled, false);
  await h.submit().props.onClick();
  assert.deepEqual(h.posts, [{ branchId: 'a', vendorId: 'v', isGeneralPurchase: false, indentId: 'approved-a', lines: [
    { rawMaterialId: 'rice', qty: '10.000', rate: '60' }, { rawMaterialId: 'oil', qty: '5.000', rate: '100' },
  ] }]);
});

test('changing branch clears approved indent and blocks stale store submission', async () => {
  const h = await pageHarness();
  h.change('Branch', 'a'); h.change('Vendor', 'v'); h.change('Approved indent', 'approved-a');
  h.change('Branch', 'b');
  assert.equal(h.field('Approved indent').props.value, '');
  assert.equal(!!h.submit().props.disabled, true);
  await h.submit().props.onClick();
  assert.equal(h.posts.length, 0);
});

test('purchase dialog translations describe persisted approval-bound purchases in both languages', () => {
  const module = { exports: {} };
  let language = 'en';
  const output = ts.transpileModule(fs.readFileSync('src/lib/ui-copy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: name => {
    assert.equal(name, '@/lib/i18n');
    return { useTranslation: () => ({ t: (en, hinglish) => language === 'en' ? en : hinglish ?? en }) };
  } });
  for (language of ['en', 'hinglish']) {
    const text = module.exports.useUiCopy()('Store-related material ya general (non-store) item — dono same 3-step flow follow karte hain.');
    assert.doesNotMatch(text, /demo|No purchase is saved|save nahi hoti/i);
    assert.match(text, /approved indent/i);
  }
});

test('general purchase omits indent and never sends raw-material lines', async () => {
  const h = await pageHarness(); h.general(true);
  h.change('Branch', 'a'); h.change('Vendor', 'v'); h.change('Item description', 'Chair repair'); h.change('Amount (TSh)', '500');
  assert.equal(!!h.submit().props.disabled, false);
  await h.submit().props.onClick();
  assert.deepEqual(h.posts, [{ branchId: 'a', vendorId: 'v', isGeneralPurchase: true, lines: [{ itemDescription: 'Chair repair', qty: '1', rate: '500' }] }]);
});
