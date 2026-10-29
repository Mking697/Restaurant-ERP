const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
const fixture = (id = 'grn-a', general = false) => ({ id, poNumber: 'PO-A', branchId: 'a', branch: 'A', receivedBy: 'Receiver', isGeneralPurchase: general, status: 'PENDING', qualityResult: 'PENDING', qualityNote: '', qualityPhotoUrl: '', qualityRecorded: false, qualityReady: true, reconciliationRequired: false, inventoryPosted: false, qualityRecordedAt: null, lines: [
  { id: 'line-rice', rawMaterialId: general ? null : 'rice', name: 'Rice', itemDescription: '', unit: 'kg', qtyOrdered: '10.000', qtyReceived: '10.000', qtyFailed: '0.000', qtyAccepted: '10.000', rateOrdered: '50' },
  { id: 'line-oil', rawMaterialId: general ? null : 'oil', name: 'Oil', itemDescription: '', unit: 'l', qtyOrdered: '5.000', qtyReceived: '5.000', qtyFailed: '0.000', qtyAccepted: '5.000', rateOrdered: '100' },
] });
class RequestJsonError extends Error { constructor(message, outcome, status) { super(message); this.outcome = outcome; this.status = status; } }
async function harness(options = {}) {
  const stores = new Map(), effects = [], posts = [], notices = [];
  let active, cursor, rows = options.rows || [fixture()], user = { id: 'owner', ready: true, authenticated: true, role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] }, post = options.post;
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in active)) active[i] = typeof initial === 'function' ? initial() : initial; const store = active; return [store[i], v => { store[i] = typeof v === 'function' ? v(store[i]) : v; }]; },
    useRef(initial) { const [ref] = hooks.useState(() => ({ current: initial })); return ref; },
    useCallback: fn => fn,
    useEffect(fn, deps) { const i = cursor++, store = active; if (!store[i] || deps?.some((v, n) => v !== store[i].deps[n])) { const previous = store[i]; store[i] = { deps }; effects.push(() => { previous?.cleanup?.(); store[i].cleanup = fn(); }); } },
  };
  const deps = {
    '@/components/vendor-returns-panel': { VendorReturnsPanel: 'VendorReturnsPanel' },
    react: hooks, 'react/jsx-runtime': require('react/jsx-runtime'), '@/lib/ui-copy': { useUiCopy: () => en => en },
    '@/lib/current-branch': { useBranches: () => ({ branches: [] }) },
    '@/lib/current-user': { RequestJsonError, useCurrentUser: () => user, requestJson: async (url, init) => {
      if (init?.method === 'POST') { const body = JSON.parse(init.body); posts.push({ url, body }); if (post) return post(url, body); const row = rows.find(r => url.includes(r.id)); const saved = { ...row, qualityResult: body.result, qualityNote: body.note || '', qualityPhotoUrl: body.photoUrl || '', qualityRecorded: true, inventoryPosted: !row.isGeneralPurchase && body.result !== 'FAIL', qualityRecordedAt: '2026-10-29', status: body.result === 'FAIL' ? 'QUALITY_HOLD' : 'APPROVED', lines: row.lines.map(l => ({ ...l, qtyFailed: body.lines.find(x => x.id === l.id).qtyFailed, qtyAccepted: String(Number(l.qtyReceived) - Number(body.lines.find(x => x.id === l.id).qtyFailed)) })) }; rows = rows.map(r => r.id === saved.id ? saved : r); return { grn: saved, replayed: false }; }
      if (url === '/api/purchase/grns') return { grns: rows };
      if (url === '/api/purchase/orders') return { purchaseOrders: [] };
      if (url === '/api/raw-materials') return { rawMaterials: [] };
      if (url === '/api/purchase/vendors') return { vendors: [] };
      return { indents: [] };
    } }, '@/components/toast': { useToast: () => ({ notify: v => notices.push(v), ToastHost: 'ToastHost' }) }, '@/lib/utils': { formatInr: String },
    'lucide-react': Object.fromEntries(['Plus','Check','X','Upload','PackageCheck','FlaskConical','Trash2'].map(k => [k,k])),
  };
  for (const [path, names] of Object.entries({ '@/components/app-shell': ['AppShell'], '@/components/page-header': ['PageHeader'], '@/components/ui/button': ['Button'], '@/components/ui/card': ['Card','CardContent'], '@/components/ui/table': ['Table','TableBody','TableCell','TableHead','TableHeader','TableRow'], '@/components/ui/badge': ['Badge'], '@/components/ui/tabs': ['Tabs','TabsContent','TabsList','TabsTrigger'], '@/components/ui/dialog': ['Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle','DialogTrigger'] })) deps[path] = Object.fromEntries(names.map(k => [k,k]));
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/purchase/page-content.tsx','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, require: name => { assert.ok(name in deps, name); return deps[name]; } });
  let visited;
  function execute(fn, props, key) { visited.add(key); active = stores.get(key) || []; stores.set(key, active); cursor = 0; return fn(props); }
  function expand(node, path = 'root') { if (Array.isArray(node)) return node.map((v,i) => expand(v, path + i)); if (!node || typeof node !== 'object') return node; if (typeof node.type === 'function' && node.type.name.startsWith('GrnQuality')) return expand(execute(node.type, node.props, path + node.type.name + node.key), path); return { ...node, props: { ...node.props, children: expand(node.props?.children, path + '.') } }; }
  const render = () => { visited = new Set(); const tree = expand(execute(module.exports.default, {}, 'page')); for (const [key, store] of stores) if (!visited.has(key)) { store.forEach(value => value?.cleanup?.()); stores.delete(key); } return tree; };
  const nodes = (node, predicate) => Array.isArray(node) ? node.flatMap(n => nodes(n,predicate)) : !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...nodes(node.props?.children,predicate)];
  const find = predicate => nodes(render(),predicate);
  const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  const button = label => { const n = find(n => ['Button','button'].includes(n.type) && text(n).trim() === label)[0]; assert.ok(n, 'Missing button: ' + label); return n; };
  const change = (label,value) => { const n = find(n => n.props?.['aria-label'] === label)[0]; assert.ok(n, 'Missing input: '+label); n.props.onChange({ target: { value } }); };
  const flush = async () => { render(); while (effects.length) effects.shift()(); await tick(); render(); };
  await flush(); await flush();
  return { render, find, text, button, change, posts, notices, flush, open: () => button('Quality Check').props.onClick(), setPost: fn => { post = fn; }, setRows: value => { rows = value; }, setUser: value => { user = { ...user, ...value }; } };
}

test('PASS submits every line only to quality endpoint and replaces row from durable response', async () => {
  const h = await harness(); h.open(); await h.button('Save quality').props.onClick();
  assert.deepEqual(h.posts, [{ url: '/api/purchase/grns/grn-a/quality', body: { result: 'PASS', lines: [{ id: 'line-rice', qtyFailed: '0' }, { id: 'line-oil', qtyFailed: '0' }], note: '', photoUrl: '' } }]);
  assert.match(h.text(h.render()), /Posted ✓/);
  assert.equal(h.find(n => n.type === 'Button' && h.text(n).trim() === 'Quality Check').length, 0);
});

test('PARTIAL sends independent failure quantities with trimmed note/reference and explains deferred refunds', async () => {
  const h = await harness(); h.open(); h.button('PARTIAL').props.onClick();
  h.change('Failed quantity for line-rice', '1.250'); h.change('Failed quantity for line-oil', '0.500');
  h.change('Quality note', '  damaged packs  '); h.change('Photo/reference (not an upload)', '  receipt/ref  ');
  await h.button('Save quality').props.onClick();
  assert.deepEqual(h.posts[0].body, { result: 'PARTIAL', lines: [{ id: 'line-rice', qtyFailed: '1.250' }, { id: 'line-oil', qtyFailed: '0.500' }], note: 'damaged packs', photoUrl: 'receipt/ref' });
  assert.match(h.text(h.render()), /vendor.return|refund/i);
});

test('FAIL requires a failure note and submits full received quantity for every line', async () => {
  const h = await harness(); h.open(); h.button('FAIL').props.onClick();
  await h.button('Save quality').props.onClick(); assert.equal(h.posts.length, 0);
  h.change('Quality note', 'All spoiled'); await h.button('Save quality').props.onClick();
  assert.deepEqual(h.posts[0].body.lines, [{ id: 'line-rice', qtyFailed: '10.000' }, { id: 'line-oil', qtyFailed: '5.000' }]);
});

for (const [rice, oil] of [['11', '0'], ['-1', '0'], ['0.0001', '0'], ['1e0', '0'], ['', '0'], ['0', '0'], ['10', '5']]) test(`PARTIAL rejects invalid/all-zero/all-failed quantities ${JSON.stringify([rice,oil])}`, async () => {
  const h = await harness(); h.open(); h.button('PARTIAL').props.onClick(); h.change('Quality note', 'Damaged');
  h.change('Failed quantity for line-rice', rice); h.change('Failed quantity for line-oil', oil);
  await h.button('Save quality').props.onClick(); assert.equal(h.posts.length, 0);
});

test('unknown outcome freezes original inputs, never auto-retries, and explicitly replays exact payload', async () => {
  const h = await harness({ post: async () => { throw new RequestJsonError('response lost', 'unknown'); } }); h.open();
  h.change('Quality note', 'original'); const save = h.button('Save quality'); await save.props.onClick();
  assert.equal(h.posts.length, 1); assert.equal(h.button('Save quality').props.disabled, true);
  h.change('Quality note', 'changed'); h.button('FAIL').props.onClick();
  assert.equal(h.find(n => n.type === 'textarea')[0].props.value, 'original');
  await h.button('Replay exact request').props.onClick();
  assert.deepEqual(h.posts[1], h.posts[0]); assert.match(h.text(h.render()), /unconfirmed|unknown/i);
});

test('same-tick double clicks issue one POST and disable close while busy', async () => {
  let release; const h = await harness({ post: () => new Promise(resolve => { release = resolve; }) }); h.open();
  const action = h.button('Save quality'); const pending = action.props.onClick(); const duplicate = action.props.onClick();
  const count = h.posts.length; release({ grn: { ...fixture(), qualityResult: 'PASS', qualityRecorded: true, inventoryPosted: true, status: 'APPROVED', qualityRecordedAt: '2026-10-29' }, replayed: false });
  assert.equal(count, 1); assert.equal(h.button('Save quality').props.disabled, true);
  const dialog = h.find(n => n.type === 'Dialog' && n.props.open === true)[0]; dialog.props.onOpenChange(false);
  assert.equal(h.find(n => n.type === 'Dialog' && n.props.open === true).length, 1);
  await Promise.all([pending, duplicate]);
});

test('explicit read recovery confirms matching durable result without another POST', async () => {
  const h = await harness({ post: async () => { throw new RequestJsonError('lost', 'unknown'); } }); h.open(); await h.button('Save quality').props.onClick();
  h.setRows([{ ...fixture(), qualityResult: 'PASS', qualityRecorded: true, inventoryPosted: true, status: 'APPROVED', qualityRecordedAt: '2026-10-29' }]);
  await h.button('Check saved quality').props.onClick(); assert.equal(h.posts.length, 1); assert.match(h.text(h.render()), /Posted ✓/);
  assert.equal(h.find(n => n.type === 'Dialog' && n.props.open === true).length, 0);
});

test('unconfirmed read recovery cannot unlock editing or accept a conflicting final result', async () => {
  const h = await harness({ post: async () => { throw new RequestJsonError('lost', 'unknown'); } }); h.open(); await h.button('Save quality').props.onClick();
  await h.button('Check saved quality').props.onClick(); assert.equal(h.button('Save quality').props.disabled, true);
  h.setRows([{ ...fixture(), qualityResult: 'FAIL', qualityRecorded: true, inventoryPosted: false, status: 'QUALITY_HOLD', qualityRecordedAt: '2026-10-29' }]);
  await h.button('Check saved quality').props.onClick(); assert.equal(h.button('Save quality').props.disabled, true); assert.doesNotMatch(h.text(h.render()), /Posted ✓/);
});

test('store quality discloses INVENTORY prerequisite while general quality remains available', async () => {
  const h = await harness(); h.setUser({ role: 'STAFF', moduleAccess: ['PURCHASE_ORDER'] }); await h.flush(); await h.flush();
  assert.equal(h.button('Quality Check').props.disabled, true); await h.button('Quality Check').props.onClick(); assert.equal(h.posts.length, 0);
  assert.match(h.text(h.render()), /INVENTORY/);
  const general = await harness({ rows: [fixture('general', true)] }); general.setUser({ role: 'STAFF', moduleAccess: ['PURCHASE_ORDER'] }); await general.flush(); await general.flush();
  assert.equal(!!general.button('Quality Check').props.disabled, false); general.open(); await general.button('Save quality').props.onClick();
  assert.equal(general.posts[0].url, '/api/purchase/grns/general/quality'); assert.doesNotMatch(general.text(general.render()), /Posted ✓/);
});

test('scope change discards an in-flight dialog completion and hides prior rows immediately', async () => {
  let release; const h = await harness({ post: () => new Promise(resolve => { release = resolve; }) }); h.open();
  const pending = h.button('Save quality').props.onClick(); h.setUser({ id: 'other', branchId: 'b', role: 'STAFF', moduleAccess: [] });
  assert.doesNotMatch(h.text(h.render()), /PO-A|Posted ✓/); assert.equal(h.find(n => n.type === 'Dialog' && n.props.open).length, 0);
  await h.flush(); release({ grn: { ...fixture(), qualityResult: 'PASS', qualityRecorded: true, inventoryPosted: true, status: 'APPROVED', qualityRecordedAt: '2026-10-29' }, replayed: false }); await pending;
  assert.doesNotMatch(h.text(h.render()), /PO-A|Posted ✓/); assert.equal(h.notices.length, 0);
});

test('fresh component reload renders persisted failures/accepted units and offers no repeat decision', async () => {
  const row = { ...fixture(), qualityReady: false, qualityResult: 'PARTIAL', qualityRecorded: true, inventoryPosted: true, status: 'APPROVED', qualityNote: 'Damaged', qualityPhotoUrl: 'ref', qualityRecordedAt: '2026-10-29', lines: fixture().lines.map(line => ({ ...line, qtyFailed: '1.000', qtyAccepted: line.id === 'line-rice' ? '9.000' : '4.000' })) };
  const h = await harness({ rows: [row] }); assert.match(h.text(h.render()), /9\.000\s+kg/); assert.match(h.text(h.render()), /4\.000\s+l/);
  assert.match(h.text(h.render()), /Damaged/); assert.match(h.text(h.render()), /Posted ✓/);
  assert.equal(h.find(n => n.type === 'Button' && h.text(n).trim() === 'Quality Check').length, 0);
});

test('known rejection preserves editable draft without claiming quality was saved', async () => {
  const h = await harness({ post: async () => { throw new RequestJsonError('Permission denied', 'rejected', 403); } }); h.open();
  await h.button('Save quality').props.onClick(); h.change('Quality note', 'corrected');
  assert.equal(h.find(n => n.type === 'textarea')[0].props.value, 'corrected'); assert.equal(h.button('Save quality').props.disabled, false);
  assert.match(h.text(h.render()), /Permission denied/); assert.doesNotMatch(h.text(h.render()), /Posted ✓/);
});

for (const kind of ['wrong-branch','missing-line','wrong-accepted','missing-receipt']) test(`malformed ${kind} success remains unconfirmed and locked`, async () => {
  const h = await harness({ post: async () => {
    const row = { ...fixture(), qualityResult: 'PASS', qualityRecorded: true, inventoryPosted: true, status: 'APPROVED', qualityRecordedAt: '2026-10-29' };
    if (kind === 'wrong-branch') row.branchId = 'foreign';
    if (kind === 'missing-line') row.lines = row.lines.slice(0,1);
    if (kind === 'wrong-accepted') row.lines[0].qtyAccepted = '9.000';
    if (kind === 'missing-receipt') row.qualityRecorded = false;
    return { grn: row, replayed: false };
  } }); h.open(); await h.button('Save quality').props.onClick();
  assert.equal(h.button('Save quality').props.disabled, true); assert.equal(h.posts.length, 1); assert.doesNotMatch(h.text(h.render()), /Posted ✓/);
});

test('legacy/unverifiable pending GRNs require reconciliation and offer no quality action', async () => {
  const h = await harness({ rows: [{ ...fixture(), qualityReady: false, reconciliationRequired: true, inventoryPosted: true }] });
  assert.equal(h.find(n => n.type === 'Button' && h.text(n).trim() === 'Quality Check').length, 0);
  assert.match(h.text(h.render()), /reconciliation required/i); assert.doesNotMatch(h.text(h.render()), /Posted ✓/);
});

test('PARTIAL quality dialog exposes every received line with its own unit', async () => {
  const h = await harness(); h.open(); h.button('PARTIAL').props.onClick();
  assert.equal(h.find(n => n.type === 'input' && n.props['aria-label']?.startsWith('Failed quantity for ')).length, 2);
  assert.match(h.text(h.render()), /10\.000\s+kg/); assert.match(h.text(h.render()), /5\.000\s+l/);
});
