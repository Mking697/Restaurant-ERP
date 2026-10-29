const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
const grn = (id = 'grn-a', extra = {}) => ({ id, branchId: 'a', poNumber: 'PO-A', qualityRecorded: true, qualityRecordedAt: '2026-10-29', reconciliationRequired: false, qualityResult: 'PARTIAL', qualityNote: 'Damaged', lines: [
  { id: `${id}-rice`, name: 'Rice', itemDescription: '', unit: 'kg', qtyFailed: '1.250', rateOrdered: '50.00' },
  { id: `${id}-oil`, name: 'Oil', itemDescription: '', unit: 'l', qtyFailed: '0.500', rateOrdered: '100.00' },
], ...extra });
const claims = (g = grn()) => g.lines.filter(l => Number(l.qtyFailed) > 0).map(l => ({ id: `grn-return:${l.id}`, grnId: g.id, grnLineId: l.id, branchId: g.branchId, branch: 'Branch A', poNumber: g.poNumber, vendorId: 'v', vendor: 'Vendor A', itemName: l.name, unit: l.unit, qtyReturned: l.qtyFailed, refundAmountInr: l.unit === 'kg' ? '62.50' : '50.00', reasonNote: g.qualityNote, submittedToAccountsAt: '2026-10-29T10:00:00.000Z', createdAt: '2026-10-29T10:00:00.000Z', status: 'REFUND_OR_CREDIT_EXPECTED', moneyReceived: null }));
class RequestJsonError extends Error { constructor(message, outcome) { super(message); this.outcome = outcome; } }
async function harness(options = {}) {
  const stores = new Map(), effects = [], calls = [];
  let active, cursor, visited, selected = options.selected || 'all', language = 'en';
  let user = { id: 'staff', ready: true, authenticated: true, error: null, role: 'STAFF', branchId: 'a', moduleAccess: [options.mode === 'accounts' ? 'VENDOR_REFUNDS' : 'PURCHASE_ORDER'], ...options.user };
  let rows = options.rows || [], grns = options.grns || [grn()], request = options.request;
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in active)) active[i] = typeof initial === 'function' ? initial() : initial; const store = active; return [store[i], value => { store[i] = typeof value === 'function' ? value(store[i]) : value; }]; },
    useRef(initial) { const [ref] = hooks.useState(() => ({ current: initial })); return ref; },
    useCallback: fn => fn,
    useEffect(fn, deps) { const i = cursor++, store = active; if (!store[i] || deps?.some((v,n) => v !== store[i].deps[n])) { const previous = store[i]; store[i] = { deps }; effects.push(() => { previous?.cleanup?.(); store[i].cleanup = fn(); }); } },
  };
  const dependencies = {
    react: hooks, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/i18n': { useTranslation: () => ({ t: (en, hi) => language === 'en' ? en : hi ?? en }) },
    '@/lib/current-branch': { useSelectedBranchId: () => selected, useBranches: () => ({ branches: [], error: '' }) },
    '@/lib/current-user': { RequestJsonError, useCurrentUser: () => user, hasCurrentModule: (u, ...keys) => u.ready && u.authenticated && !u.error && (u.role === 'SUPER_ADMIN' || keys.some(k => u.moduleAccess.includes(k))), requestJson: async (url, init) => {
      calls.push({ url, method: init?.method || 'GET', body: init?.body });
      if (request) { const result = await request(url, init); if (result !== undefined) return result; }
      if (init?.method === 'POST') { rows = claims(grns.find(g => url.includes(g.id))); return { returns: rows, replayed: false }; }
      if (url.startsWith('/api/purchase/grns')) return { grns };
      const id = new URL(url, 'https://test.invalid').searchParams.get('grnId');
      return { returns: id ? rows.filter(r => r.grnId === id) : rows };
    } },
    '@/components/ui/button': { Button: 'Button' },
  };
  function load(path) { const module = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, URLSearchParams, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } }); return module.exports; }
  const panelPath = 'src/components/vendor-returns-panel.tsx';
  assert.ok(fs.existsSync(panelPath), 'Vendor returns panel must exist');
  const panel = load(panelPath); dependencies['@/components/vendor-returns-panel'] = panel;
  let root = panel.VendorReturnsPanel;
  if (options.page === 'accounts') {
    for (const [path, names] of Object.entries({ '@/components/app-shell': ['AppShell'], '@/components/page-header': ['PageHeader'], '@/components/ui/card': ['Card','CardContent'], '@/components/ui/table': ['Table','TableBody','TableCell','TableHead','TableHeader','TableRow'], '@/components/ui/tabs': ['Tabs','TabsContent','TabsList','TabsTrigger'] })) dependencies[path] = Object.fromEntries(names.map(k => [k,k]));
    dependencies['../workforce/live-ui'] = { monthNow: () => '2026-10', Panel: 'Panel' };
    dependencies['./legacy-demos'] = { default: 'LegacyAccountsDemo' }; dependencies['@/lib/expense-attempt'] = {}; dependencies['@/lib/csv-export'] = {}; dependencies['lucide-react'] = {};
    root = load('src/app/accounts/page-content.tsx').default;
  }
  function execute(fn, props, key) { visited.add(key); active = stores.get(key) || []; stores.set(key, active); cursor = 0; return fn(props); }
  function expand(node, path = 'root') { if (Array.isArray(node)) return node.map((n,i) => expand(n, path+i)); if (!node || typeof node !== 'object') return node; if (typeof node.type === 'function') return expand(execute(node.type, node.props, path + node.type.name + node.key), path); return { ...node, props: { ...node.props, children: expand(node.props?.children, path+'.') } }; }
  function render() { visited = new Set(); const tree = expand(execute(root, { mode: options.mode || 'purchase' }, 'page')); for (const [key, store] of stores) if (!visited.has(key)) { store.forEach(v => v?.cleanup?.()); stores.delete(key); } return tree; }
  const nodes = (n,p) => Array.isArray(n) ? n.flatMap(v => nodes(v,p)) : !n || typeof n !== 'object' ? [] : [...(p(n) ? [n] : []), ...nodes(n.props?.children,p)];
  const text = n => Array.isArray(n) ? n.map(text).join(' ') : n && typeof n === 'object' ? text(n.props?.children) : String(n ?? '');
  const find = p => nodes(render(),p);
  const button = label => { const n = find(n => ['button','Button'].includes(n.type) && text(n).trim() === label)[0]; assert.ok(n, 'Missing button: '+label); return n; };
  const choose = id => { const n = find(n => n.type === 'select')[0]; assert.ok(n, 'Missing GRN selector'); n.props.onChange({ target: { value: id } }); };
  const flush = async () => { render(); while (effects.length) effects.shift()(); await tick(); render(); };
  await flush(); await flush();
  return { calls, render, text, find, button, choose, flush, setUser: value => { user = { ...user, ...value }; }, setSelected: value => { selected = value; }, setRows: value => { rows = value; }, setRequest: value => { request = value; }, setLanguage: value => { language = value; } };
}

test('Accounts page exposes a grant-only read tab without expense or PO authority', async () => {
  const h = await harness({ page: 'accounts', mode: 'accounts', rows: claims() });
  assert.ok(h.find(n => n.type === 'TabsTrigger' && h.text(n) === 'Vendor refunds').length);
  assert.equal(h.find(n => n.type === 'Tabs')[0].props.defaultValue, 'vendor-refunds');
  assert.match(h.find(n => n.type === 'PageHeader')[0].props.description, /expected refund\/credit claims/i);
  assert.doesNotMatch(h.text(h.render()), /Accounts permission is required|Post expense|Save expense|Register failed/);
  assert.equal(h.calls.length, 1); assert.match(h.calls[0].url, /^\/api\/accounts\/vendor-refunds/);
});

test('Purchase page exposes shared returns panel and correct quality claim disclaimer', () => {
  const source = fs.readFileSync('src/app/purchase/page-content.tsx', 'utf8');
  assert.match(source, /<VendorReturnsPanel mode="purchase"/);
  assert.match(source, /Failed quantities queue expected refund\/credit claims/);
  assert.doesNotMatch(source, /receivables are not created yet/);
});

test('Purchase registers trusted failed quantities with an empty body and reloads expected claims', async () => {
  const h = await harness({ grns: [grn(), grn('pending', { qualityResult: 'PENDING' }), grn('pass', { qualityResult: 'PASS' }), grn('legacy', { qualityRecorded: false }), grn('reconcile', { reconciliationRequired: true }), grn('foreign', { branchId: 'b' })] });
  const options = h.find(n => n.type === 'option').map(n => n.props.value);
  assert.deepEqual(options, ['', 'grn-a']);
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  assert.deepEqual(h.calls.filter(c => c.method === 'POST'), [{ url: '/api/purchase/grns/grn-a/returns', method: 'POST', body: '{}' }]);
  assert.match(h.text(h.render()), /Claim confirmed and records reloaded/);
  assert.match(h.text(h.render()), /62.50/);
});

test('Accounts-only grant reads own-branch expected claims without purchase or mutation controls', async () => {
  const h = await harness({ mode: 'accounts', rows: claims() });
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, '/api/accounts/vendor-refunds?branchId=a');
  assert.equal(h.find(n => n.type === 'select').length, 0);
  assert.match(h.text(h.render()), /62.50/); assert.match(h.text(h.render()), /Latest 200/);
  assert.match(h.text(h.render()), /not.*money received/i); assert.doesNotMatch(h.text(h.render()), /Register failed/);
});

test('lost registration outcome freezes original GRN and explicitly replays only the exact empty request', async () => {
  const h = await harness({ grns: [grn(), grn('grn-b')], request: async (url, init) => { if (init?.method === 'POST') throw new RequestJsonError('Response lost', 'unknown'); } });
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  await h.flush(); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(h.find(n => n.type === 'select')[0].props.disabled, true);
  h.choose('grn-b'); assert.equal(h.find(n => n.type === 'select')[0].props.value, 'grn-a');
  await h.button('Register failed-quantity claim').props.onClick();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  await h.button('Replay exact request').props.onClick();
  const writes = h.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 2); assert.deepEqual(writes[1], writes[0]);
  assert.match(h.text(h.render()), /Outcome unconfirmed/);
});

test('same-tick register double click sends one POST and busy blocks recovery/reload', async () => {
  let release;
  const h = await harness({ request: async (url, init) => { if (init?.method === 'POST') return new Promise(resolve => { release = resolve; }); } });
  h.choose('grn-a'); const action = h.button('Register failed-quantity claim');
  const pending = action.props.onClick(); const duplicate = action.props.onClick();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  const before = h.calls.length; h.button('Reload claims').props.onClick(); assert.equal(h.calls.length, before);
  assert.equal(h.button('Register failed-quantity claim').props.disabled, true);
  release({ returns: claims(), replayed: false }); await Promise.all([pending, duplicate]);
});

test('read recovery requires the exact GRN/branch failed-line batch and never performs a second POST', async () => {
  const h = await harness({ request: async (url, init) => { if (init?.method === 'POST') throw new RequestJsonError('lost', 'unknown'); } });
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  await h.button('Check saved claims').props.onClick(); assert.match(h.text(h.render()), /Outcome unconfirmed/);
  h.setRows(claims()); await h.button('Check saved claims').props.onClick();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  assert.ok(h.calls.some(c => c.url === '/api/purchase/material-returns?branchId=a&grnId=grn-a'));
  assert.match(h.text(h.render()), /Claim confirmed and records reloaded/);
});

for (const kind of ['foreign-branch', 'foreign-grn', 'missing-line', 'duplicate', 'wrong-qty', 'wrong-amount', 'reconciliation', 'received-money']) test(`untrusted ${kind} response keeps original registration locked`, async () => {
  const bad = claims();
  if (kind === 'foreign-branch') bad[0].branchId = 'b';
  if (kind === 'foreign-grn') bad[0].grnId = 'other';
  if (kind === 'missing-line') bad.pop();
  if (kind === 'duplicate') bad[1] = bad[0];
  if (kind === 'wrong-qty') bad[0].qtyReturned = '1.249';
  if (kind === 'wrong-amount') bad[0].refundAmountInr = '62.49';
  if (kind === 'reconciliation') bad[0].status = 'RECONCILIATION_REQUIRED';
  if (kind === 'received-money') bad[0].moneyReceived = '62.50';
  const h = await harness({ request: async (url, init) => { if (init?.method === 'POST') return { returns: bad, replayed: true }; } });
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  assert.match(h.text(h.render()), /Outcome unconfirmed/); assert.doesNotMatch(h.text(h.render()), /Claim confirmed and/);
  assert.equal(h.button('Register failed-quantity claim').props.disabled, true);
  assert.ok(h.button('Replay exact request'));
});

test('explicit read recovery can confirm an older exact batch outside the bounded latest-200 list', async () => {
  const h = await harness({ request: async (url, init) => {
    if (init?.method === 'POST') throw new RequestJsonError('lost', 'unknown');
    if (url === '/api/purchase/material-returns?branchId=a') return { returns: [] };
  } });
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  h.setRows(claims()); await h.button('Check saved claims').props.onClick();
  assert.match(h.text(h.render()), /Claim confirmed and records reloaded/);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
});

test('a nonmatching fresh readback cannot turn a valid POST response into false confirmed/reloaded success', async () => {
  const h = await harness({ request: async (url, init) => { if (init?.method === 'POST') return { returns: claims(), replayed: false }; } });
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  assert.doesNotMatch(h.text(h.render()), /Claim confirmed and records reloaded/);
  assert.match(h.text(h.render()), /Outcome unconfirmed/);
});

test('successful POST followed by failed reload never claims success and read recovery stays available', async () => {
  let written = false;
  const h = await harness({ request: async (url, init) => {
    if (init?.method === 'POST') { written = true; return { returns: claims(), replayed: false }; }
    if (written) throw new Error('Reload failed');
  } });
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  assert.doesNotMatch(h.text(h.render()), /Claim confirmed and records reloaded/);
  assert.match(h.text(h.render()), /Outcome unconfirmed/); assert.ok(h.button('Check saved claims'));
  h.setRows(claims()); h.setRequest(undefined); await h.button('Check saved claims').props.onClick();
  assert.match(h.text(h.render()), /Claim confirmed and records reloaded/);
});

for (const patch of [{ ready: false }, { authenticated: false }, { moduleAccess: [] }, { error: 'Session error' }, { branchId: null }]) test(`claim access fails closed for ${JSON.stringify(patch)}`, async () => {
  const h = await harness({ user: patch }); assert.equal(h.calls.length, 0); assert.equal(h.find(n => n.type === 'select').length, 0);
});

test('Owner reads all branches or selected branch; staff ignores owner selection', async () => {
  const owner = await harness({ mode: 'accounts', user: { role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] } });
  assert.equal(owner.calls[0].url, '/api/accounts/vendor-refunds');
  owner.setSelected('b'); await owner.flush(); await owner.flush(); assert.equal(owner.calls.at(-1).url, '/api/accounts/vendor-refunds?branchId=b');
  const staff = await harness({ mode: 'accounts', selected: 'b' }); assert.equal(staff.calls[0].url, '/api/accounts/vendor-refunds?branchId=a');
});

test('scope changes immediately hide old claims and suppress both stale read and captured write handlers', async () => {
  const h = await harness({ rows: claims() }); h.choose('grn-a'); const old = h.button('Register failed-quantity claim');
  h.setUser({ id: 'other', branchId: 'b', moduleAccess: [] }); assert.doesNotMatch(h.text(h.render()), /Vendor A|PO-A/);
  await old.props.onClick(); assert.equal(h.calls.filter(c => c.method === 'POST').length, 0);
  let release;
  const reads = await harness({ mode: 'accounts', request: () => new Promise(resolve => { release = resolve; }) });
  reads.setUser({ branchId: 'b', moduleAccess: [] }); reads.render(); release({ returns: claims() }); await reads.flush();
  assert.doesNotMatch(reads.text(reads.render()), /Vendor A|62.50/);
});

test('late registration completion cannot publish success or trigger reload after actor/grant change', async () => {
  let release;
  const h = await harness({ request: async (url, init) => { if (init?.method === 'POST') return new Promise(resolve => { release = resolve; }); } });
  h.choose('grn-a'); const pending = h.button('Register failed-quantity claim').props.onClick();
  h.setUser({ id: 'other', moduleAccess: [] }); h.render(); const before = h.calls.length;
  release({ returns: claims(), replayed: true }); await pending;
  assert.equal(h.calls.length, before); assert.doesNotMatch(h.text(h.render()), /Claim confirmed|PO-A|Vendor A/);
});

test('load errors clear rows, block registration, and explicit reload recovers without a write', async () => {
  const h = await harness({ request: async () => { throw new Error('offline'); } });
  assert.match(h.text(h.render()), /Could not load claims/); assert.equal(h.button('Register failed-quantity claim').props.disabled, true);
  h.setRequest(undefined); h.button('Reload claims').props.onClick(); await h.flush();
  h.choose('grn-a'); assert.equal(h.button('Register failed-quantity claim').props.disabled, false);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 0);
});

test('general descriptive/zero-rate claims and half-up paise readback stay exact without client amounts', async () => {
  const source = grn('general', { qualityResult: 'FAIL', lines: [
    { id: 'general-zero', name: '', itemDescription: 'Repair work', unit: 'job', qtyFailed: '1.000', rateOrdered: '0.00' },
    { id: 'general-rounded', name: '', itemDescription: 'Small part', unit: 'piece', qtyFailed: '0.500', rateOrdered: '0.01' },
    { id: 'general-accepted', name: 'Accepted', itemDescription: '', unit: 'piece', qtyFailed: '0.000', rateOrdered: '1.00' },
  ] });
  const saved = claims(source); saved[0].refundAmountInr = '0.00'; saved[1].refundAmountInr = '0.01';
  const h = await harness({ grns: [source], rows: saved, request: async (url, init) => { if (init?.method === 'POST') return { returns: saved, replayed: true }; } });
  h.choose(source.id); await h.button('Register failed-quantity claim').props.onClick();
  assert.match(h.text(h.render()), /Claim confirmed and records reloaded/);
  assert.equal(h.calls.find(c => c.method === 'POST').body, '{}');
  assert.equal(h.find(n => n.type === 'input').length, 0);
});

test('a rejected replay of an earlier unknown write remains locked until explicit successful read recovery', async () => {
  const h = await harness({ request: async (url, init) => { if (init?.method === 'POST') throw new RequestJsonError('Lost', 'unknown'); } });
  h.choose('grn-a'); await h.button('Register failed-quantity claim').props.onClick();
  h.setRequest(async (url, init) => { if (init?.method === 'POST') throw new RequestJsonError('Conflict', 'rejected'); });
  await h.button('Replay exact request').props.onClick();
  assert.match(h.text(h.render()), /Outcome unconfirmed/); assert.equal(h.find(n => n.type === 'select')[0].props.disabled, true);
  h.setRows(claims()); await h.button('Check saved claims').props.onClick();
  assert.match(h.text(h.render()), /Claim confirmed and records reloaded/);
});

test('Accounts financial grant never supplies purchase-registration access, and PO grant never supplies Accounts read access', async () => {
  const purchase = await harness({ user: { moduleAccess: ['VENDOR_REFUNDS'] } }); assert.equal(purchase.calls.length, 0);
  const accounts = await harness({ mode: 'accounts', user: { moduleAccess: ['PURCHASE_ORDER', 'ACCOUNTS_EXPENSES'] } }); assert.equal(accounts.calls.length, 0);
});

test('reconciliation rows never display unverified money and both languages disclose scope and claim limits', async () => {
  const bad = claims(); bad[0].status = 'RECONCILIATION_REQUIRED'; bad[0].refundAmountInr = '999999.00';
  const h = await harness({ mode: 'accounts', rows: bad });
  assert.match(h.text(h.render()), /Reconciliation required/); assert.doesNotMatch(h.text(h.render()), /999999.00/);
  h.setLanguage('hinglish'); assert.match(h.text(h.render()), /Reconciliation chahiye/); assert.match(h.text(h.render()), /actual paisa|actual.*receive/); assert.match(h.text(h.render()), /latest 200/);
});
