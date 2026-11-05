const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { render, validate, lanes, nodes, edges, cards } = require('../scripts/render-full-process-flow.cjs');
const file = path.join(__dirname, '../docs/restaurant-erp-full-process-flow.html');

test('full process-flow artifact is reproducible with valid source references', () => {
  validate();
  assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), render());
  assert.equal(lanes.length, 18);
  assert.equal(nodes.length, 93);
  assert.equal(edges.filter(e => e.route !== 'note').length, 84);
  assert.equal(cards.length, 45);
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
  assert.doesNotMatch(html, /<script\b|(?:src|href)=\"https?:\/\/|<link\b/);
  assert.equal((html.match(/data-node=/g) || []).length, nodes.length);
  assert.equal((html.match(/class="card"/g) || []).length, cards.length);
});

test('new lanes cover payments/void custody, customer CRM/loyalty/QR and waiter/PWA apps', () => {
  for (const id of ['cashcustody', 'crm', 'pwaapps']) {
    assert.ok(lanes.some(l => l[0] === id), id);
  }
  const names = new Set(nodes.map(n => n.id));
  for (const key of [
    'payment_capture', 'void_order', 'menu_image', 'optout', 'login_auth',
    'opening_float', 'live_summary', 'shift_expense', 'ho_dispatch', 'ho_accept',
    'register_member', 'qr_issue', 'qr_lookup', 'reward_earn', 'reward_redeem', 'repeat_order',
    'waiter_order', 'pwa_install', 'app_downloads',
  ]) assert.ok(names.has(key), key);
  for (const n of nodes) assert.ok(n.col >= 0 && n.col <= 5, `${n.id} col in range`);
});

test('payment capture, void and HO cash dispatch are connected with the correct write/reference kinds', () => {
  assert.ok(edges.some(e => e.from === 'confirm' && e.to === 'payment_capture' && e.kind === 'write'));
  assert.ok(edges.some(e => e.from === 'payment_capture' && e.to === 'void_order' && e.kind === 'reference'));
  assert.ok(edges.some(e => e.from === 'void_order' && e.to === 'stock_deduct' && e.kind === 'reference'));
  assert.ok(edges.some(e => e.from === 'shift_start' && e.to === 'opening_float' && e.kind === 'write'));
  assert.ok(edges.some(e => e.from === 'blind_count' && e.to === 'ho_dispatch' && e.kind === 'reference'));
  assert.ok(edges.some(e => e.from === 'opening_float' && e.to === 'live_summary'));
  assert.ok(edges.some(e => e.from === 'shift_expense' && e.to === 'ho_dispatch'));
  assert.ok(edges.some(e => e.from === 'ho_dispatch' && e.to === 'ho_accept'));
});

test('rewards ledger is deliberately not auto-wired, and repeat orders never reuse historical prices', () => {
  assert.ok(edges.some(e => e.from === 'payment_capture' && e.to === 'reward_earn' && e.kind === 'reference'));
  assert.ok(edges.some(e => e.from === 'register_member' && e.to === 'repeat_order' && e.kind === 'reference'));
  assert.ok(edges.some(e => e.from === 'repeat_order' && e.to === 'confirm' && e.kind === 'reference'));
  assert.ok(edges.some(e => e.from === 'register_member' && e.to === 'qr_issue' && e.kind === 'write'));
  const detail = cards.map(c => c.bullets.join(' ')).join(' ');
  assert.match(detail, /NOT auto-wired into the real POS checkout\/void flow/);
  assert.match(detail, /never the historical snapshot/);
  assert.match(detail, /byte-identical generic error/);
  assert.match(detail, /structurally rules out cross-branch substitution/);
});

test('waiter PWA is kitchen-first only, and WhatsApp opt-out is phone-only and voluntary', () => {
  assert.ok(edges.some(e => e.from === 'waiter_order' && e.to === 'kot' && e.kind === 'write'));
  assert.ok(edges.some(e => e.from === 'thankyou' && e.to === 'optout'));
  const detail = cards.map(c => c.bullets.join(' ')).join(' ');
  assert.match(detail, /never silently create an order marked paid with no money collected/);
  assert.match(detail, /never inferred from merely capturing a phone on an order/);
  assert.match(detail, /lists only the installable apps the current user's own module access actually grants/);
});

test('login is email\\+password based, not phone, and change-password revokes other sessions', () => {
  const detail = cards.map(c => c.bullets.join(' ')).join(' ');
  assert.match(detail, /Sign-in now identifies a user by email \+ password/);
  assert.match(detail, /not by phone/);
  assert.match(detail, /every OTHER device's existing session is revoked immediately/);
  assert.doesNotMatch(detail, /identifies a user by phone/);
});

test('blind count card no longer claims opening float is unmodeled now that GAP-033 exists', () => {
  const detail = cards.map(c => c.bullets.join(' ')).join(' ');
  assert.doesNotMatch(detail, /An initial cash float and safe withdrawals are not modeled/);
  assert.match(detail, /opening float is modeled/);
  assert.match(detail, /minus every POSTED CASH expense linked to this run/);
});
