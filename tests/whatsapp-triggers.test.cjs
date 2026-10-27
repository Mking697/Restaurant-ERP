const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const load = () => require('../src/lib/server/whatsapp-triggers.ts');

test('validOptionalPhone accepts empty, bare 10-digit and 91-prefixed; rejects junk', () => {
  const { validOptionalPhone } = load();
  assert.equal(validOptionalPhone(undefined), '');
  assert.equal(validOptionalPhone(''), '');
  assert.equal(validOptionalPhone('9876543210'), '9876543210');
  assert.equal(validOptionalPhone('+91 98765 43210'), '919876543210');
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
