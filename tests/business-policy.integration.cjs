// P0 decision (October 31, 2026): Owner-configurable value-based HO
// approval gate on top of the existing quantity-spike check.
// Parent-run only: migrated disposable QA DB + app bound to that exact DB.
// PGDATABASE=restaurant_erp_bizpolicy_qa_YYYYMMDD BIZPOLICY_QA_DATABASE=<same>
// BASE_URL=http://127.0.0.1:<dedicated-port> node tests/business-policy.integration.cjs
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Must target the local Docker Postgres host only');
assert.equal(process.env.PGPORT, '5436', 'Must target the local Docker Postgres port only');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_bizpolicy_qa_\d{8}$/, 'Disposable QA DB name required, never the shared dev DB');
assert.equal(process.env.BIZPOLICY_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:', 'QA app must be loopback-only');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const ORIGIN = BASE;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branch: 'qa-bizpolicy-branch',
  owner: 'qa-bizpolicy-owner',
  manager: 'qa-bizpolicy-manager',
  vendor: 'qa-bizpolicy-vendor',
  priced: 'qa-bizpolicy-mat-priced', // has a locked vendor rate
  unpriced: 'qa-bizpolicy-mat-unpriced', // deliberately NEVER given a rate
};
const ownerToken = crypto.randomBytes(32).toString('hex');
const managerToken = crypto.randomBytes(32).toString('hex');
let ownerCookie, managerCookie;

async function req(method, path, bodyObj, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: ORIGIN },
    body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id = $1)`, [ids.branch]);
  await pool.query(`delete from indents where branch_id = $1`, [ids.branch]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.priced, ids.unpriced]]);
  await pool.query(`delete from sessions where user_id = any($1)`, [[ids.owner, ids.manager]]);
  await pool.query(`delete from users where id = any($1)`, [[ids.owner, ids.manager]]);
  await pool.query(`delete from branches where id = $1`, [ids.branch]);
  await pool.query(`delete from settings where key = any($1)`, [['INDENT_HO_APPROVAL_VALUE_THRESHOLD_TSH', 'COST_YIELD_VARIANCE_TOLERANCE_PERCENT']]);
}

async function submitIndent(rawMaterialId, qty) {
  const create = await req('POST', '/api/purchase/indents', { branchId: ids.branch, lines: [{ rawMaterialId, qty }] }, managerCookie);
  assert.equal(create.status, 201, JSON.stringify(create.json));
  const indentId = create.json.indent.id;
  const submit = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, managerCookie);
  assert.equal(submit.status, 200, JSON.stringify(submit.json));
  return submit.json;
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA BizPolicy Branch','QABIZ','0','0')`, [ids.branch]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA BizPolicy Owner','+255****0501','SUPER_ADMIN',NULL,'Active','{}')`, [ids.owner]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA BizPolicy Manager','+255****0502','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY}')`, [ids.manager, ids.branch]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(ownerToken), ids.owner]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  ownerCookie = `restaurant_session=${ownerToken}`;
  managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA BizPolicy Priced','kg'),($2,'QA BizPolicy Unpriced','kg')`, [ids.priced, ids.unpriced]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA BizPolicy Vendor','+255****0503')`, [ids.vendor]);
  // Locked rate: TSh 1000.00 per kg for the "priced" material. "unpriced" never gets a rate.
  await pool.query(`insert into vendor_rates (id, vendor_id, raw_material_id, rate, locked_by_user_id) values ($1,$2,$3,'1000.00',$4)`, ['qa-bizpolicy-rate-1', ids.vendor, ids.priced, ids.owner]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- (a) no threshold configured: GET returns null/disabled, small indent auto-approves ---
  const initialGet = await req('GET', '/api/admin/settings/business-policy', undefined, ownerCookie);
  check('(a) GET business-policy as Owner: no threshold configured yet -> both fields null',
    initialGet.status === 200 && initialGet.json.indentValueThresholdTsh === null && initialGet.json.costYieldTolerancePercent === null, initialGet.json);

  const nonOwnerGet = await req('GET', '/api/admin/settings/business-policy', undefined, managerCookie);
  check('(a2) Branch Manager (non-Owner) is denied read access to this Owner-only settings endpoint', nonOwnerGet.status === 403, nonOwnerGet.json);

  const small = await submitIndent(ids.priced, '2'); // 2kg * TSh1000 = TSh 2000 estimated value
  check('(a3) threshold disabled: small-value indent for a KNOWN-rate material auto-approves (no spike history either, but <3 samples alone already forces PENDING_APPROVAL — use this only to confirm the value-gate note is absent)',
    !small.note.includes('TSh'), small.note);

  // --- (b) Owner sets a TSh 5,000 threshold ---
  const setThreshold = await req('POST', '/api/admin/settings/business-policy', { indentValueThresholdTsh: '5000.00' }, ownerCookie);
  check('(b) Owner can set the indent value threshold', setThreshold.status === 200 && setThreshold.json.indentValueThresholdTsh === '5000.00', setThreshold.json);

  const nonOwnerSet = await req('POST', '/api/admin/settings/business-policy', { indentValueThresholdTsh: '1.00' }, managerCookie);
  check('(b2) Branch Manager cannot write this Owner-only setting (value stays Owner\'s 5000.00, not overwritten)', nonOwnerSet.status === 403, nonOwnerSet.json);
  const afterDeniedWrite = await req('GET', '/api/admin/settings/business-policy', undefined, ownerCookie);
  check('(b3) denied write really left the DB value unchanged at 5000.00', afterDeniedWrite.json.indentValueThresholdTsh === '5000.00', afterDeniedWrite.json);

  // --- (c) below-threshold priced indent (3kg * TSh1000 = TSh3000 < TSh5000) is gated only by quantity-spike (no history -> PENDING_APPROVAL anyway, but the VALUE note must say "below") ---
  const belowThreshold = await submitIndent(ids.priced, '3');
  check('(c) estimated value TSh 3000.00 explicitly reported as below the TSh 5000.00 threshold', belowThreshold.note.includes('TSh 3000.00') && belowThreshold.note.includes('below the Owner-configured TSh 5000.00'), belowThreshold.note);

  // --- (d) at/above-threshold priced indent (5kg * TSh1000 = TSh5000, exactly at threshold) forces PENDING_APPROVAL via the value gate ---
  const atThreshold = await submitIndent(ids.priced, '5');
  check('(d) estimated value TSh 5000.00 (exactly at threshold) is reported as at/above and status is PENDING_APPROVAL',
    atThreshold.indent.status === 'PENDING_APPROVAL' && atThreshold.note.includes('at/above the Owner-configured TSh 5000.00'), atThreshold);

  // --- (e) an indent for a material with NO vendor rate is always routed to approval while a threshold is configured, regardless of quantity ---
  const unpriced = await submitIndent(ids.unpriced, '1');
  check('(e) unpriced material: value gate explicitly reports "could not be fully priced" and routes to PENDING_APPROVAL',
    unpriced.indent.status === 'PENDING_APPROVAL' && unpriced.note.includes('could not be fully priced'), unpriced);

  // --- (f) clearing the threshold (empty string) disables the value gate again ---
  const clear = await req('POST', '/api/admin/settings/business-policy', { indentValueThresholdTsh: '' }, ownerCookie);
  check('(f) Owner can clear the threshold back to disabled (null)', clear.status === 200 && clear.json.indentValueThresholdTsh === null, clear.json);
  const afterClear = await submitIndent(ids.priced, '5'); // same 5kg*1000=5000 that triggered the gate above
  check('(f2) with the threshold cleared, the same TSh 5000 indent no longer mentions any TSh value-threshold note', !afterClear.note.includes('Owner-configured'), afterClear.note);

  // --- (g) invalid threshold values are rejected server-side too (not just client-side) ---
  const invalidNegative = await req('POST', '/api/admin/settings/business-policy', { indentValueThresholdTsh: '-5' }, ownerCookie);
  check('(g) negative threshold rejected 400 by the real server, not just the pure helper', invalidNegative.status === 400, invalidNegative.json);
  const invalidTolerance = await req('POST', '/api/admin/settings/business-policy', { costYieldTolerancePercent: '150' }, ownerCookie);
  check('(g2) >100% tolerance rejected 400 by the real server', invalidTolerance.status === 400, invalidTolerance.json);

  // --- (h) unknown field rejected (same convention as every other settings route) ---
  const unknownField = await req('POST', '/api/admin/settings/business-policy', { notARealField: '1' }, ownerCookie);
  check('(h) unknown field rejected 400', unknownField.status === 400, unknownField.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
