const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { render, validate, lanes, nodes, edges, cards } = require('../scripts/render-full-process-flow.cjs');
const file = path.join(__dirname, '../docs/restaurant-erp-full-process-flow.html');

test('full process-flow artifact is reproducible with valid source references', () => {
  validate();
  assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), render());
  assert.equal(lanes.length, 15);
  assert.equal(nodes.length, 74);
  assert.equal(edges.filter(e => e.route !== 'note').length, 61);
  assert.equal(cards.length, 33);
});
test('current flow preserves original module domains and adds invoice/accounts/automation', () => {
  for (const id of ['shifts','pos','kitchen','inventory','purchase','billing','whatsapp','privacy','tasks','workforce','admin','insights','invoice','accounts','automation']) {
    assert.ok(lanes.some(l => l[0] === id), id);
  }
  const names = new Set(nodes.map(n => n.id));
  for (const key of ['table','items','confirm','recipe','produce','stock_check','kot','semifg_check','warehouse','stock_deduct','low_stock','receipt','vat_invoice','vat_summary','thankyou','shift_setup','shift_start','shift_gate','blind_count','shift_next','accept_handover','owner_only','audit','staff_view','actual_records','official_access','recurring','delegate','mark_done','checklist','indent','indent_approve','po','grn','vendor_return','user','grants','branch','dashboard','reports','mis','attendance','leave','leave_review','payroll']) assert.ok(names.has(key), key);
  for (const edge of edges) assert.ok(names.has(edge.from) && names.has(edge.to));
});
test('GRN credits branch stock and financial states do not imply bank transfers', () => {
  assert.ok(edges.some(e => e.from === 'grn' && e.to === 'inventory_stock' && e.kind === 'write'));
  assert.ok(!edges.some(e => e.from === 'grn' && e.to === 'warehouse'));
  assert.ok(edges.some(e => e.from === 'three_way' && e.to === 'payment_approve'));
  assert.ok(edges.some(e => e.from === 'payment_approve' && e.to === 'paid'));
  const detail = cards.map(c => c.bullets.join(' ')).join(' ');
  assert.match(detail, /PO total as informational/);
  assert.match(detail, /not bank transfer/);
  assert.match(detail, /default incomplete/);
  assert.match(detail, /minStockLevel > 0 and qtyOnHand < minStockLevel/);
  assert.match(detail, /operational Accounts P&L and Food Cost follow order visibility/);
});
test('offline map removes obsolete status claims and discloses remaining boundaries', () => {
  const html = render();
  assert.doesNotMatch(html, /CGST|SGST|IGST|GSTR|HSN|Demo UI|Local QA, Not Deployed|mock-data\.ts/);
  assert.match(html, /Asia\/Kolkata/);
  assert.match(html, /Legacy database fields and the default internal tender code still use INR/);
  assert.match(html, /current branch\/item tax configuration/);
  assert.doesNotMatch(html, /<script\b|(?:src|href)="https?:\/\/|<link\b/);
  assert.equal((html.match(/data-node=/g) || []).length, nodes.length);
  assert.equal((html.match(/class="card"/g) || []).length, cards.length);
});
