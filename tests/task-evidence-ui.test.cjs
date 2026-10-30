const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

// Render the actual page/component functions with deterministic hook/data I/O.
// This exercises row rendering and the real evidence click handler, not a browser.
function renderEvidence(attachmentUrl) {
  const reads = [], opened = [];
  const instance = { id: 'task/a', branchId: 'branch-a', branchName: 'A', type: 'ONE_TIME', title: 'Task', description: '', assignedToId: 'doer', assignedToName: 'Doer', priority: 'HIGH', dueAt: '2026-10-30T01:00:00Z', status: 'DONE', completedAt: null, attachmentUrl };
  const user = { id: 'owner', authenticated: true, role: 'SUPER_ADMIN', branchId: null, moduleAccess: [] };
  const dependencies = {
    react: { ...React, useState: value => [typeof value === 'function' ? value() : value, () => {}] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/current-user': { useCurrentUser: () => user, hasCurrentModule: () => true, requestJson: async url => { reads.push(url); return { url: 'https://private.example/temporary' }; } },
    '@/lib/current-branch': { useBranches: () => ({ branches: [] }), useSelectedBranchId: () => 'all' },
    '@/lib/i18n': { useTranslation: () => ({ t: en => en }) },
    '../workforce/live-ui': { useResource: url => ({ data: url?.includes('/instances?') ? { instances: [instance] } : { recurring: [] }, loading: false }), useAction: () => ({ busy: false }), query: () => '', post: () => { throw new Error('Unexpected write'); }, ActionState: 'ActionState', DataTable: 'table', Field: 'Field', Panel: 'Panel', LoadState: 'LoadState' },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/tasks/page-content.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, Date, window: { open: (...args) => opened.push(args) }, require: name => {
    if (name in dependencies) return dependencies[name];
    assert.ok(name.startsWith('@/components/') || name === 'lucide-react', `Unexpected import: ${name}`);
    return new Proxy({}, { get: (_, key) => key });
  } });
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  function nodes(node, predicate) {
    if (Array.isArray(node)) return node.flatMap(n => nodes(n, predicate));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join('');
    if (!node || typeof node !== 'object') return String(node ?? '');
    return text(node.props.children);
  }
  const tree = expand(module.exports.default());
  return { tree, nodes: predicate => nodes(tree, predicate), text: text(tree), reads, opened };
}

for (const reference of ['Repair photo filed in maintenance register #42', 'https://example.com/legacy-photo.jpg']) {
  test(`legacy evidence reference stays visible without a task_proofs lookup: ${reference}`, () => {
    const h = renderEvidence(reference);
    assert.ok(h.text.includes(reference), 'Legacy attachment reference must remain visible');
    assert.equal(h.nodes(n => n.type === 'Button' && JSON.stringify(n.props.children).includes('View evidence')).length, 0);
    assert.equal(h.nodes(n => n.props.href === reference || n.props.src === reference).length, 0, 'Legacy references are inert text, not trusted image/link targets');
    assert.equal(h.reads.length, 0);
  });
}

for (const reference of ['evidence/branch-a/task-a/123-photo.jpg', 'https://store.private.blob.vercel-storage.com/evidence/photo.jpg?token=private-signed-token']) test('private uploaded evidence uses authenticated endpoint without rendering storage path or signed token', async () => {
  const h = renderEvidence(reference);
  assert.ok(!h.text.includes(reference));
  assert.equal(h.nodes(n => n.props.href === reference || n.props.src === reference).length, 0);
  const button = h.nodes(n => n.type === 'Button' && JSON.stringify(n.props.children).includes('View evidence'))[0];
  assert.ok(button);
  await button.props.onClick();
  assert.deepEqual(h.reads, ['/api/tasks/instances/task%2Fa/evidence']);
  assert.deepEqual(h.opened, [['https://private.example/temporary', '_blank', 'noopener,noreferrer']]);
});

test('no evidence remains empty and makes no evidence request', () => {
  const h = renderEvidence('');
  assert.equal(h.reads.length, 0);
  assert.equal(h.nodes(n => n.type === 'Button' && JSON.stringify(n.props.children).includes('View evidence')).length, 0);
});
