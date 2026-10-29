// Parent-run only: migrated disposable QA DB + app bound to that exact DB.
// PGDATABASE=restaurant_erp_purchase_qa_YYYYMMDD PURCHASE_QA_DATABASE=<same>
// BASE_URL=http://127.0.0.1:<dedicated-port> node tests/purchase.integration.cjs
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');

assert.equal(process.env.PGHOST, '127.0.0.1', 'Must target the local Docker Postgres host only');
assert.equal(process.env.PGPORT, '5436', 'Must target the local Docker Postgres port only');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_purchase_qa_\d{8}$/, 'Disposable QA DB name required, never the shared dev DB');
assert.equal(process.env.PURCHASE_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable DB approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA app required');
const target = new URL(process.env.BASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:', 'QA app must be loopback-only');

const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const BASE = target.origin;
const ORIGIN = BASE;
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

const ids = {
  branchA: 'qa-pur-branch-a',
  branchB: 'qa-pur-branch-b',
  owner: 'qa-pur-owner',
  manager: 'qa-pur-manager',
  vendor: 'qa-pur-vendor',
  chicken: 'qa-pur-mat-chicken',
  rice: 'qa-pur-mat-rice',
};
const ownerToken = crypto.randomBytes(32).toString('hex');
const managerToken = crypto.randomBytes(32).toString('hex');
let ownerCookie, managerCookie;

async function req(method, path, bodyObj, cookie, originOverride) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin: originOverride === undefined ? ORIGIN : originOverride },
    body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function cleanup() {
  await pool.query(`delete from audit_log where entity_type='GRN' and entity_id in (select id from grns where branch_id=any($1))`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from grn_lines where grn_id in (select id from grns where branch_id = any($1))`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from grns where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from purchase_order_lines where po_id in (select id from purchase_orders where branch_id = any($1))`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from purchase_orders where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from indent_lines where indent_id in (select id from indents where branch_id = any($1))`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from indents where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from inventory_stock where branch_id = any($1)`, [[ids.branchA, ids.branchB]]);
  await pool.query(`delete from vendor_rates where vendor_id = $1`, [ids.vendor]);
  await pool.query(`delete from vendors where id = $1`, [ids.vendor]);
  await pool.query(`delete from raw_materials where id = any($1)`, [[ids.chicken, ids.rice]]);
  await pool.query(`delete from sessions where user_id = any($1)`, [[ids.owner, ids.manager]]);
  await pool.query(`delete from users where id = any($1)`, [[ids.owner, ids.manager]]);
  await pool.query(`delete from branches where id = any($1)`, [[ids.branchA, ids.branchB]]);
}

async function main() {
  await cleanup();
  await pool.query(`insert into branches (id, name, code, lat, lng) values ($1,'QA Purchase A','QAPURA','0','0'),($2,'QA Purchase B','QAPURB','0','0')`, [ids.branchA, ids.branchB]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Purchase Owner','+919****0301','SUPER_ADMIN',null,'Active','{}')`, [ids.owner]);
  await pool.query(`insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA Purchase Manager','+919****0302','BRANCH_MANAGER',$2,'Active','{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY}')`, [ids.manager, ids.branchA]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(ownerToken), ids.owner]);
  await pool.query(`insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,'0', now() + interval '1 hour')`, [tokenHash(managerToken), ids.manager]);
  ownerCookie = `restaurant_session=${ownerToken}`;
  managerCookie = `restaurant_session=${managerToken}`;
  await pool.query(`insert into raw_materials (id, name, unit) values ($1,'QA Purchase Chicken','kg'),($2,'QA Purchase Rice','kg')`, [ids.chicken, ids.rice]);
  await pool.query(`insert into vendors (id, name, phone_e164) values ($1,'QA Purchase Vendor','+919****0303')`, [ids.vendor]);

  const results = [];
  const check = (label, cond, extra) => results.push({ label, pass: !!cond, extra });

  // --- Auth/CSRF gating ---
  const anon = await req('GET', '/api/purchase/indents');
  check('anonymous GET indents -> 401', anon.status === 401, anon.json);
  const noCsrf = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.chicken, qty: '1' }] }, managerCookie, 'https://evil.example.com');
  check('cross-site POST indent -> 403', noCsrf.status === 403, noCsrf.json);

  const vendorsList = await req('GET', '/api/purchase/vendors', undefined, managerCookie);
  check('vendors list 200', vendorsList.status === 200 && vendorsList.json.vendors.some((v) => v.id === ids.vendor), vendorsList.json);

  // --- Indent create/list/branch isolation ---
  const createIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.chicken, qty: '10' }, { rawMaterialId: ids.rice, qty: '5' }] }, managerCookie);
  check('create indent 201 DRAFT', createIndent.status === 201 && createIndent.json.indent.status === 'DRAFT', createIndent.json);
  const indentId = createIndent.json?.indent?.id;

  const foreignBranchIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branchB, lines: [{ rawMaterialId: ids.chicken, qty: '1' }] }, managerCookie);
  check('manager cannot raise indent for foreign branch -> 403', foreignBranchIndent.status === 403, foreignBranchIndent.json);

  const tooManyLines = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: Array.from({ length: 51 }, () => ({ rawMaterialId: ids.chicken, qty: '1' })) }, managerCookie);
  check('51 lines rejected -> 400', tooManyLines.status === 400, tooManyLines.json);

  const unknownField = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.chicken, qty: '1' }], extra: 'nope' }, managerCookie);
  check('unknown field rejected -> 400', unknownField.status === 400, unknownField.json);

  const listA = await req('GET', '/api/purchase/indents?branchId=' + ids.branchA, undefined, managerCookie);
  check('list indents for branch A includes created indent with lineCount 2', listA.status === 200 && listA.json.indents.some((i) => i.id === indentId && i.lineCount === 2), listA.json);

  const listForeign = await req('GET', '/api/purchase/indents?branchId=' + ids.branchB, undefined, managerCookie);
  check('manager cannot list foreign branch indents -> 403', listForeign.status === 403, listForeign.json);

  // --- Submit / approve / reject lifecycle ---
  const submit = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, managerCookie);
  check('submit DRAFT->PENDING_APPROVAL 200, spikePercent stays null (no fabricated number)', submit.status === 200 && submit.json.indent.status === 'PENDING_APPROVAL' && submit.json.indent.spikePercent === null, submit.json);

  const submitAgain = await req('POST', `/api/purchase/indents/${indentId}/submit`, {}, managerCookie);
  check('re-submitting non-DRAFT indent -> 409', submitAgain.status === 409, submitAgain.json);

  const approve = await req('POST', `/api/purchase/indents/${indentId}/approve`, {}, managerCookie);
  check('approve PENDING_APPROVAL->APPROVED 200', approve.status === 200 && approve.json.indent.status === 'APPROVED', approve.json);

  // Separate indent, taken straight to REJECTED, to prove PO creation is denied against it.
  const createIndent2 = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.chicken, qty: '3' }] }, managerCookie);
  const indentId2 = createIndent2.json.indent.id;
  await req('POST', `/api/purchase/indents/${indentId2}/submit`, {}, managerCookie);
  const reject = await req('POST', `/api/purchase/indents/${indentId2}/reject`, {}, managerCookie);
  check('reject PENDING_APPROVAL->REJECTED 200', reject.status === 200 && reject.json.indent.status === 'REJECTED', reject.json);

  // --- PO creation: from APPROVED indent vs REJECTED indent (must deny) ---
  const poFromRejected = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: false, indentId: indentId2, lines: [{ rawMaterialId: ids.chicken, qty: '3', rate: '300.00' }] }, managerCookie);
  check('PO from REJECTED indent denied -> 409', poFromRejected.status === 409, poFromRejected.json);

  // Regression: helpers alone are insufficient; exercise the exported HTTP route
  // and inspect committed rows after every rejected approval-bypass attempt.
  const validLines = [{ rawMaterialId: ids.chicken, qty: '10', rate: '300.00' }, { rawMaterialId: ids.rice, qty: '5', rate: '60.00' }];
  const snapshot = async (id) => (await pool.query(`select
    (select count(*)::int from purchase_orders where branch_id = $1) as orders,
    (select count(*)::int from purchase_order_lines l join purchase_orders p on p.id=l.po_id where p.branch_id=$1) as lines,
    (select status from indents where id=$2) as status`, [ids.branchA, id])).rows[0];
  const attempts = [
    ['missing indent', { indentId: undefined }],
    ['null indent', { indentId: null }],
    ['empty indent', { indentId: '' }],
    ['missing purchase kind', { isGeneralPurchase: undefined }],
    ['string purchase kind', { isGeneralPurchase: 'true' }],
    ['numeric purchase kind', { isGeneralPurchase: 1 }],
    ['omitted material', { lines: validLines.slice(0, 1) }],
    ['substituted material', { lines: [{ ...validLines[0], rawMaterialId: ids.rice }, validLines[1]] }],
    ['excess quantity', { lines: [{ ...validLines[0], qty: '10.001' }, validLines[1]] }],
    ['partial quantity', { lines: [{ ...validLines[0], qty: '9.999' }, validLines[1]] }],
    ['duplicate splitting excess', { lines: [validLines[0], validLines[0], validLines[1]] }],
  ];
  for (const [label, override] of attempts) {
    const created = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.chicken, qty: '10' }, { rawMaterialId: ids.rice, qty: '5' }] }, managerCookie);
    const regressionId = created.json.indent.id;
    await req('POST', `/api/purchase/indents/${regressionId}/submit`, {}, managerCookie);
    await req('POST', `/api/purchase/indents/${regressionId}/approve`, {}, managerCookie);
    const before = await snapshot(regressionId);
    const result = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: false, indentId: regressionId, lines: validLines, ...override }, managerCookie);
    const after = await snapshot(regressionId);
    check(`approval bypass ${label}: 400 with no PO/line/status writes`, result.status === 400 && JSON.stringify(before) === JSON.stringify(after), { status: result.status, before, after });
  }

  const approvedChoices = await req('GET', '/api/purchase/orders/approved-indents?branchId=' + ids.branchA, undefined, managerCookie);
  const choice = approvedChoices.json?.indents?.find((i) => i.id === indentId);
  check('approved-indent picker returns exact approved material lines and branch', approvedChoices.status === 200 && choice?.branchId === ids.branchA && choice.lines.length === 2 && choice.lines.some((l) => l.rawMaterialId === ids.chicken && Number(l.qty) === 10), approvedChoices.json);
  await pool.query(`update users set module_access='{PURCHASE_ORDER}' where id=$1`, [ids.manager]);
  try {
    const buyerRead = await req('GET', '/api/purchase/orders/approved-indents', undefined, managerCookie);
    const buyerForeign = await req('GET', '/api/purchase/orders/approved-indents?branchId=' + ids.branchB, undefined, managerCookie);
    const buyerDraftRead = await req('GET', '/api/purchase/indents', undefined, managerCookie);
    const buyerApprove = await req('POST', `/api/purchase/indents/${indentId}/approve`, {}, managerCookie);
    check('PO-only user can read approved choices without indent read/review or foreign branch access', buyerRead.status === 200 && buyerForeign.status === 403 && buyerDraftRead.status === 403 && buyerApprove.status === 403, { read: buyerRead.status, foreign: buyerForeign.status, drafts: buyerDraftRead.status, approve: buyerApprove.status });
  } finally {
    await pool.query(`update users set module_access='{PURCHASE_INDENT,PURCHASE_ORDER,INVENTORY}' where id=$1`, [ids.manager]);
  }
  const anonymousChoices = await req('GET', '/api/purchase/orders/approved-indents');
  check('approved-indent picker denies anonymous reads', anonymousChoices.status === 401, anonymousChoices.json);

  const poFromApproved = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.chicken, qty: '10', rate: '300.00' }, { rawMaterialId: ids.rice, qty: '5', rate: '60.00' }] }, managerCookie);
  check('PO from APPROVED indent 201 CREATED', poFromApproved.status === 201 && poFromApproved.json.purchaseOrder.status === 'CREATED', poFromApproved.json);
  const poId = poFromApproved.json?.purchaseOrder?.id;

  const indentAfterPo = await req('GET', '/api/purchase/indents?branchId=' + ids.branchA, undefined, managerCookie);
  check('indent moved to PO_RAISED after PO creation', indentAfterPo.json.indents.find((i) => i.id === indentId)?.status === 'PO_RAISED', indentAfterPo.json);

  const poFromPoRaisedIndent = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: false, indentId, lines: [{ rawMaterialId: ids.chicken, qty: '1', rate: '300.00' }] }, managerCookie);
  check('PO from an already PO_RAISED indent denied -> 409', poFromPoRaisedIndent.status === 409, poFromPoRaisedIndent.json);

  // Decimal duplicate aggregation is valid, but one approved indent can be
  // consumed only once even when two real requests race.
  const decimalIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.chicken, qty: '0.1' }, { rawMaterialId: ids.chicken, qty: '0.2' }, { rawMaterialId: ids.rice, qty: '5' }] }, managerCookie);
  const decimalId = decimalIndent.json.indent.id;
  await req('POST', `/api/purchase/indents/${decimalId}/submit`, {}, managerCookie);
  await req('POST', `/api/purchase/indents/${decimalId}/approve`, {}, managerCookie);
  const decimalPayload = { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: false, indentId: decimalId, lines: [{ rawMaterialId: ids.chicken, qty: '0.300', rate: '300' }, { rawMaterialId: ids.rice, qty: '5.000', rate: '60' }] };
  const raced = await Promise.all([req('POST', '/api/purchase/orders', decimalPayload, managerCookie), req('POST', '/api/purchase/orders', decimalPayload, managerCookie)]);
  const raceRead = await pool.query('select p.id,p.status,(select count(*)::int from purchase_order_lines l where l.po_id=p.id) as lines from purchase_orders p where indent_id=$1', [decimalId]);
  check('decimal aggregate match survives concurrent requests with exactly one persisted PO', raced.map(r => r.status).sort().join(',') === '201,409' && raceRead.rowCount === 1 && raceRead.rows[0].lines === 2, { statuses: raced.map(r => r.status), rows: raceRead.rows });

  // Fail after the PO row insert to prove the real transaction rolls back all
  // PO/line/status effects, rather than merely validating before any writes.
  const rollbackIndent = await req('POST', '/api/purchase/indents', { branchId: ids.branchA, lines: [{ rawMaterialId: ids.chicken, qty: '1' }] }, managerCookie);
  const rollbackId = rollbackIndent.json.indent.id;
  await req('POST', `/api/purchase/indents/${rollbackId}/submit`, {}, managerCookie);
  await req('POST', `/api/purchase/indents/${rollbackId}/approve`, {}, managerCookie);
  await pool.query(`create function qa_purchase_fail_line() returns trigger language plpgsql as $$ begin if exists(select 1 from purchase_orders where id=NEW.po_id and branch_id='qa-pur-branch-a') then raise exception 'QA forced line failure'; end if; return NEW; end $$`);
  await pool.query('create trigger qa_purchase_fail_line before insert on purchase_order_lines for each row execute function qa_purchase_fail_line()');
  try {
    const before = await snapshot(rollbackId);
    const rollback = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: false, indentId: rollbackId, lines: [{ rawMaterialId: ids.chicken, qty: '1', rate: '10' }] }, managerCookie);
    const after = await snapshot(rollbackId);
    check('forced line-write failure rolls back PO, lines and approved-indent state', rollback.status === 503 && JSON.stringify(before) === JSON.stringify(after), { status: rollback.status, before, after });
  } finally {
    await pool.query('drop trigger qa_purchase_fail_line on purchase_order_lines');
    await pool.query('drop function qa_purchase_fail_line()');
  }

  // --- General purchase (no raw material, no Indent) ---
  const generalPo = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ itemDescription: 'QA office chair repair', qty: '1', rate: '1500.00' }] }, managerCookie);
  check('general purchase PO 201, no raw material on line', generalPo.status === 201 && generalPo.json.purchaseOrder.isGeneralPurchase === true && generalPo.json.lines[0].rawMaterialId === null, generalPo.json);
  const generalPoId = generalPo.json?.purchaseOrder?.id;

  const generalWithMaterial = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: true, lines: [{ rawMaterialId: ids.chicken, qty: '1', rate: '1' }] }, managerCookie);
  check('general purchase line cannot carry a rawMaterialId -> 400', generalWithMaterial.status === 400, generalWithMaterial.json);

  const generalWithIndent = await req('POST', '/api/purchase/orders', { branchId: ids.branchA, vendorId: ids.vendor, isGeneralPurchase: true, indentId, lines: [{ itemDescription: 'x', qty: '1', rate: '1' }] }, managerCookie);
  check('general purchase cannot reference an Indent -> 400', generalWithIndent.status === 400, generalWithIndent.json);

  // --- PO listing ---
  const poList = await req('GET', '/api/purchase/orders?branchId=' + ids.branchA, undefined, managerCookie);
  check('PO list for branch A includes both POs', poList.status === 200 && poList.json.purchaseOrders.some((p) => p.id === poId) && poList.json.purchaseOrders.some((p) => p.id === generalPoId), poList.json);

  // --- Step 2: Bill upload (optional, one-shot) ---
  const bill = await req('POST', `/api/purchase/orders/${poId}/bill`, { pdfUrl: 'https://example.com/qa-bill.pdf' }, managerCookie);
  check('bill upload 200, billUploadedAt set', bill.status === 200 && !!bill.json.purchaseOrder.billUploadedAt && bill.json.purchaseOrder.pdfUrl === 'https://example.com/qa-bill.pdf', bill.json);
  const billAgain = await req('POST', `/api/purchase/orders/${poId}/bill`, {}, managerCookie);
  check('re-billing same PO -> 409', billAgain.status === 409, billAgain.json);
  const billNoUrl = await req('POST', `/api/purchase/orders/${generalPoId}/bill`, {}, managerCookie);
  check('bill step without a URL still succeeds (optional field) 200', billNoUrl.status === 200 && !!billNoUrl.json.purchaseOrder.billUploadedAt, billNoUrl.json);

  // --- Step 3: Material receive -> creates real GRN row (one-shot) ---
  const receive = await req('POST', `/api/purchase/orders/${poId}/receive`, {}, managerCookie);
  check('material receive 201 creates GRN PENDING', receive.status === 201 && receive.json.grn.status === 'PENDING' && receive.json.grn.qualityResult === 'PENDING', receive.json);
  const grnId = receive.json?.grn?.id;
  const receiveAgain = await req('POST', `/api/purchase/orders/${poId}/receive`, {}, managerCookie);
  check('re-receiving same PO -> 409', receiveAgain.status === 409, receiveAgain.json);

  const generalReceive = await req('POST', `/api/purchase/orders/${generalPoId}/receive`, {}, managerCookie);
  check('general purchase material receive 201 too', generalReceive.status === 201, generalReceive.json);

  // --- GRN listing shows real rows shaped for the existing quality-check -> inventory flow ---
  const grnList = await req('GET', '/api/purchase/grns?branchId=' + ids.branchA, undefined, managerCookie);
  const grnRow = grnList.json?.grns?.find((g) => g.id === grnId);
  check('GRN list includes every created material line and durable posting readiness', grnList.status === 200 && grnRow?.branchId === ids.branchA && grnRow.lines?.length === 2 && grnRow.lines.some(l => l.rawMaterialId === ids.chicken && l.qtyReceived === '10.000' && l.unit === 'kg') && grnRow.qualityReady === true, grnRow);

  const generalGrnRow = grnList.json?.grns?.find((g) => g.poId === generalPoId);
  check('general-purchase GRN has only descriptive lines (nothing to post to Inventory)', generalGrnRow?.isGeneralPurchase === true && generalGrnRow.lines.every(l => l.rawMaterialId === null), generalGrnRow);

  // Real durable quality decision posts ALL accepted lines once.
  const postToInventory = await req('POST', `/api/purchase/grns/${grnId}/quality`, { result: 'PASS', lines: grnRow.lines.map(l => ({ id: l.id, qtyFailed: '0' })) }, managerCookie);
  check('GRN quality records a durable decision and inventory receipt', postToInventory.status === 200 && postToInventory.json.grn.inventoryPosted === true, postToInventory.json);
  const stock = await pool.query('select raw_material_id,qty_on_hand from inventory_stock where branch_id=$1', [ids.branchA]);
  check('all GRN accepted quantities posted: chicken 10kg and rice 5kg', stock.rows.some(r => r.raw_material_id === ids.chicken && r.qty_on_hand === '10.000') && stock.rows.some(r => r.raw_material_id === ids.rice && r.qty_on_hand === '5.000'), stock.rows);

  // --- Branch isolation on GRN/PO/Vendor reads ---
  const grnForeign = await req('GET', '/api/purchase/grns?branchId=' + ids.branchB, undefined, managerCookie);
  check('manager cannot read foreign branch GRNs -> 403', grnForeign.status === 403, grnForeign.json);
  const poForeign = await req('GET', '/api/purchase/orders?branchId=' + ids.branchB, undefined, managerCookie);
  check('manager cannot read foreign branch POs -> 403', poForeign.status === 403, poForeign.json);

  // Owner (no branchId scope) can see branch A rows without passing branchId explicitly.
  const ownerList = await req('GET', '/api/purchase/indents', undefined, ownerCookie);
  check('Owner lists indents across branches without a branchId filter', ownerList.status === 200 && ownerList.json.indents.some((i) => i.id === indentId), ownerList.json);

  const fail = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, pass: results.length - fail.length, fail: fail.length, failures: fail }, null, 2));
  return fail.length === 0;
}

main()
  .then(async (ok) => { await cleanup(); await pool.end(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error(e); try { await cleanup(); } catch {} await pool.end(); process.exit(1); });
