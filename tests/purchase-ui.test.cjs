const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

// Execute the actual page handlers with a deterministic hook state boundary.
// This is component behavior evidence, not a browser/visual acceptance claim.
async function pageHarness() {
  const state = [], effects = [], posts = [];
  let cursor = 0, first = true;
  const fakeReact = { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
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
    '@/lib/current-user': { RequestJsonError: Error, requestJson: async (url, options) => {
      if (options?.method === 'POST') { posts.push(JSON.parse(options.body)); return { purchaseOrder: { poNumber: 'PO-QA' } }; }
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
  vm.runInNewContext(output, { module, exports: module.exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
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
  return { field, change, submit, general, posts, nodes, render };
}

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
  h.change('Branch', 'a'); h.change('Vendor', 'v'); h.change('Item description', 'Chair repair'); h.change('Amount (₹)', '500');
  assert.equal(!!h.submit().props.disabled, false);
  await h.submit().props.onClick();
  assert.deepEqual(h.posts, [{ branchId: 'a', vendorId: 'v', isGeneralPurchase: true, lines: [{ itemDescription: 'Chair repair', qty: '1', rate: '500' }] }]);
});
