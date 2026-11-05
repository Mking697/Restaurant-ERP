const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/whatsapp-triggers.ts');

test('validOptionalPhone accepts empty, bare 9-digit and 255-prefixed; rejects junk', () => {
  const { validOptionalPhone } = load();
  assert.equal(validOptionalPhone(undefined), '');
  assert.equal(validOptionalPhone(''), '');
  assert.equal(validOptionalPhone('712345678'), '712345678');
  assert.equal(validOptionalPhone('+255 712 345 678'), '712345678');
  assert.equal(validOptionalPhone('0712345678'), '712345678');
  assert.throws(() => validOptionalPhone('12345'), { status: 400 });
  assert.throws(() => validOptionalPhone('0123456789'), { status: 400 });
  assert.throws(() => validOptionalPhone(12345), { status: 400 });
});

test('thankYouMessage includes order number, total, branch; defaults Guest', () => {
  const { thankYouMessage } = load();
  const msg = thankYouMessage({ customerName: 'Rahul', orderNumber: 'ORD-1', totalAmount: '280.00', branchName: 'Connaught Place' });
  assert.match(msg, /Rahul/); assert.match(msg, /ORD-1/); assert.match(msg, /280\.00/); assert.match(msg, /Connaught Place/);
  const guestMsg = thankYouMessage({ customerName: '  ', orderNumber: 'ORD-2', totalAmount: '100.00', branchName: 'B2' });
  assert.match(guestMsg, /Guest/);
});

test('offerMessage includes branch, text and optional validity', () => {
  const { offerMessage } = load();
  const msg = offerMessage({ offerText: '20% off today', validUntil: '31 Oct', branchName: 'Saket' });
  assert.match(msg, /Saket/); assert.match(msg, /20% off today/); assert.match(msg, /31 Oct/);
  const noExpiry = offerMessage({ offerText: 'Free dessert', validUntil: '', branchName: 'B3' });
  assert.doesNotMatch(noExpiry, /Valid tak/);
});

test('GAP-037: thankYouMessage offers a community link ONLY when one is actually configured — never by default', () => {
  const { thankYouMessage } = load();
  const base = { customerName: 'Rahul', orderNumber: 'ORD-9', totalAmount: '100.00', branchName: 'B1' };
  const withoutLink = thankYouMessage(base);
  assert.doesNotMatch(withoutLink, /chat\.whatsapp\.com|community/i);
  const withLink = thankYouMessage({ ...base, communityUrl: 'https://chat.whatsapp.com/abc123' });
  assert.match(withLink, /https:\/\/chat\.whatsapp\.com\/abc123/);
  // Explicitly voluntary wording, never a claim of automatic enrollment.
  assert.match(withLink, /optional/i);
});

test('GAP-037: an opt-out link, when configured, is printed on BOTH thank-you and offer messages', () => {
  const { thankYouMessage, offerMessage } = load();
  const thankYou = thankYouMessage({ customerName: 'A', orderNumber: 'O1', totalAmount: '1.00', branchName: 'B', optOutUrl: 'https://app.example.com/whatsapp-optout?phone=712345678' });
  assert.match(thankYou, /app\.example\.com\/whatsapp-optout\?phone=712345678/);
  const offer = offerMessage({ offerText: 'Deal', validUntil: '', branchName: 'B', optOutUrl: 'https://app.example.com/whatsapp-optout?phone=712345678' });
  assert.match(offer, /app\.example\.com\/whatsapp-optout\?phone=712345678/);
});

test('GAP-037: no opt-out URL configured means no opt-out line is printed — never a broken/placeholder link', () => {
  const { thankYouMessage, offerMessage } = load();
  assert.doesNotMatch(thankYouMessage({ customerName: 'A', orderNumber: 'O1', totalAmount: '1.00', branchName: 'B' }), /whatsapp-optout/);
  assert.doesNotMatch(offerMessage({ offerText: 'Deal', validUntil: '', branchName: 'B' }), /whatsapp-optout/);
});

test('GAP-038: requiredPhone rejects empty/invalid where validOptionalPhone would silently allow empty', () => {
  const { requiredPhone } = load();
  assert.equal(requiredPhone('712345678'), '712345678');
  assert.throws(() => requiredPhone(''), { status: 400 });
  assert.throws(() => requiredPhone(undefined), { status: 400 });
  assert.throws(() => requiredPhone('12345'), { status: 400 });
});

test('taskReminderMessage includes doer name, title, branch and defaults a blank name', () => {
  const { taskReminderMessage } = load();
  const due = new Date('2026-10-30T06:00:00.000Z'); // 09:00 EAT
  const msg = taskReminderMessage({ doerName: 'Priya', title: 'Closing checklist', branchName: 'B1', dueAt: due });
  assert.match(msg, /Priya/); assert.match(msg, /Closing checklist/); assert.match(msg, /B1/); assert.match(msg, /09:00/);
  const blank = taskReminderMessage({ doerName: '  ', title: 'T', branchName: 'B2', dueAt: due });
  assert.match(blank, /Team/);
});

test('taskEscalationMessage flags overdue, names the doer and branch, defaults an unknown doer', () => {
  const { taskEscalationMessage } = load();
  const due = new Date('2026-10-30T03:30:00.000Z');
  const msg = taskEscalationMessage({ title: 'Opening checklist', doerName: 'Amit', branchName: 'B4', dueAt: due });
  assert.match(msg, /OVERDUE/); assert.match(msg, /Amit/); assert.match(msg, /B4/); assert.match(msg, /Opening checklist/);
  const blank = taskEscalationMessage({ title: 'T', doerName: '', branchName: 'B5', dueAt: due });
  assert.match(blank, /the assigned staff member/);
});

test('dailySummaryMessage reports sales/overdue/handover/low stock, and handles unavailable sales data', () => {
  const { dailySummaryMessage } = load();
  const msg = dailySummaryMessage({ branchName: 'B6', completedSales: 12, overdueTasks: 2, pendingHandover: true, lowStockCount: 3 });
  assert.match(msg, /B6/); assert.match(msg, /12 completed sale/); assert.match(msg, /2 overdue task/); assert.match(msg, /handover pending/);
  assert.match(msg, /3 item\(s\) below minimum stock level/);
  const noSales = dailySummaryMessage({ branchName: 'B7', completedSales: null, overdueTasks: 0, pendingHandover: false, lowStockCount: 1 });
  assert.match(noSales, /sales data not available/);
  assert.match(noSales, /1 item\(s\) below minimum stock level/);
  assert.doesNotMatch(noSales, /handover pending/);
});

test('dailySummaryMessage omits low stock alert for zero count without hiding other summary fields', () => {
  const { dailySummaryMessage } = load();
  const msg = dailySummaryMessage({ branchName: 'B8', completedSales: 0, overdueTasks: 4, pendingHandover: true, lowStockCount: 0 });
  assert.match(msg, /B8/);
  assert.match(msg, /0 completed sale\(s\)/);
  assert.match(msg, /4 overdue task\(s\)/);
  assert.match(msg, /handover pending/);
  assert.doesNotMatch(msg, /below minimum stock level|item\(s\)|low stock/i);
});
