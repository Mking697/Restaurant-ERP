// Parent-run: migrated dedicated QA database and freshly built app bound to it.
// PGHOST=127.0.0.1 PGPORT=5436 PGDATABASE=restaurant_erp_recipe_qa_20261027
// ORDER_VISIBILITY_QA_DATABASE=<same> BASE_URL=http://127.0.0.1:<qa-port>
// node tests/order-visibility.integration.cjs
// Never passes customerPhone to order creation or calls offer POST (GET only).
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1', 'Loopback QA PostgreSQL only');
assert.equal(process.env.PGPORT, '5436', 'Explicit local QA PostgreSQL port only');
assert.match(process.env.PGDATABASE || '', /^restaurant_erp_(recipe|semi_fg|shifts|visibility)_qa_\d{8}$/);
assert.equal(process.env.ORDER_VISIBILITY_QA_DATABASE, process.env.PGDATABASE, 'Explicit disposable QA database approval required');
assert.ok(process.env.BASE_URL, 'Explicit dedicated QA application URL required');
const target = new URL(process.env.BASE_URL);
assert.ok(target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname) && target.port && target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash, 'Dedicated loopback HTTP app required');
assert.notEqual(target.port, '3000', 'Do not target shared development server');
const pool = new Pool({ host: '127.0.0.1', port: 5436, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
const id = () => randomUUID();
const a = id(), b = id(), owner = id(), staff = id(), admin = id(), item = id(), raw = id();
const branches = [a, b], users = [owner, staff, admin];
const tokens = Object.fromEntries(users.map(uid => [uid, randomBytes(32).toString('hex')]));
const triggerName = 'qa_visibility_' + id().replaceAll('-', '');
const functionName = triggerName + '_fn';
let checks = 0, dbApproved = false, bindingPassed = false;
const pass = label => { checks++; console.log('PASS ' + label); };
async function api(path, who = owner, method = 'GET', input, status = 200, extra = {}) {
  const response = await fetch(target.origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { origin: target.origin, 'content-type': 'application/json', ...(who ? { cookie: 'restaurant_session=' + tokens[who] } : {}), ...extra.headers },
    ...(input === undefined ? {} : { body: extra.raw ? input : JSON.stringify(input) }),
  });
  const text = await response.text();
  let result; try { result = JSON.parse(text); } catch { assert.fail(path + ' did not return JSON: HTTP ' + response.status); }
  assert.equal(response.status, status, path + ': ' + JSON.stringify(result));
  return result;
}
const ordersPath = '/api/pos/orders?branchId=' + a;
const audiencePath = '/api/whatsapp/offer-alert?branchId=' + a;
const visibilityPath = orderId => '/api/pos/orders/' + encodeURIComponent(orderId) + '/visibility';
const change = (orderId, ownerOnly, who = owner, expected = 200, extra = {}) => api(visibilityPath(orderId), who, 'PATCH', { ownerOnly, reason: 'QA operational privacy only', ...extra }, expected);
const sale = { branchId: a, channel: 'DINE_IN', tenderType: 'CASH', lines: [{ menuItemId: item, qty: 1 }] };
async function financialSnapshot() {
  return {
    orders: (await pool.query('select id,branch_id,order_number,subtotal,tax_amount,total_amount,tender_type,status,shift_run_id,cashier_id,created_at from pos_orders where branch_id=any($1::text[]) order by id', [branches])).rows,
    lines: (await pool.query('select l.* from pos_order_lines l join pos_orders o on o.id=l.order_id where o.branch_id=any($1::text[]) order by l.id', [branches])).rows,
    stock: (await pool.query('select * from inventory_stock where branch_id=any($1::text[]) order by id', [branches])).rows,
  };
}
function noPrivateMetadata(data, privateOrder) {
  const text = JSON.stringify(data);
  for (const forbidden of [privateOrder.id, privateOrder.orderNumber, 'PRIVATE-ONLY-QA', '+19999999992']) assert.ok(!text.includes(forbidden), 'Staff response leaked ' + forbidden);
  for (const forbidden of ['actualTotal', 'privateTotal', 'privateCount', 'ownerOnlyTotal', 'ownerOnlyCount']) assert.ok(!text.includes('"' + forbidden + '"'), 'Staff response leaked aggregate ' + forbidden);
}
async function cleanup() {
  // Unique per-run trigger/function; never removes another test's objects.
  await pool.query(`drop trigger if exists ${triggerName} on audit_log`);
  await pool.query(`drop function if exists ${functionName}()`);
  await pool.query('delete from audit_log where user_id=any($1::text[])', [users]);
  await pool.query('delete from whatsapp_message_log where related_entity_id=any($1::text[]) or related_entity_id in (select id from pos_orders where branch_id=any($1::text[]))', [branches]);
  await pool.query('delete from employee_ledger where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from shift_handovers where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from shift_runs where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from branch_shifts where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from cash_drops where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from pos_alerts where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id=any($1::text[]))', [branches]);
  await pool.query('delete from pos_orders where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from bom_recipes where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from inventory_stock where branch_id=any($1::text[])', [branches]);
  await pool.query('delete from menu_items where id=$1', [item]);
  await pool.query('delete from raw_materials where id=$1', [raw]);
  await pool.query('delete from sessions where user_id=any($1::text[])', [users]);
  await pool.query('delete from users where id=any($1::text[])', [users]);
  await pool.query('delete from branches where id=any($1::text[])', [branches]);
  assert.equal((await pool.query('select count(*)::int n from branches where id=any($1::text[])', [branches])).rows[0].n, 0);
  assert.equal((await pool.query('select count(*)::int n from users where id=any($1::text[])', [users])).rows[0].n, 0);
}
(async () => {
  try {
    assert.equal((await pool.query('select current_database() db')).rows[0].db, process.env.ORDER_VISIBILITY_QA_DATABASE);
    dbApproved = true;
    // Refuse old/unmigrated DB before any fixture writes.
    await pool.query('select owner_only from pos_orders limit 0');
    for (const branch of branches) await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$1,0,0)', [branch, 'Visibility QA ' + branch]);
    for (const [uid, role, grants] of [[owner, 'SUPER_ADMIN', []], [staff, 'CASHIER', ['POS_CASHIER', 'CASH_DROP']], [admin, 'BRANCH_MANAGER', ['POS_CASHIER', 'CASH_DROP', 'SHIFT_MANAGEMENT', 'OFFICIAL_SALES_REPORTS']]]) {
      const phone = '+1999' + String(BigInt('0x' + uid.replaceAll('-', '').slice(0, 12)) % 10000000n).padStart(7, '0');
      await pool.query('insert into users(id,name,phone_e164,role,branch_id,module_access) values($1,$2,$3,$4,$5,$6)', [uid, 'Visibility QA ' + uid, phone, role, role === 'SUPER_ADMIN' ? null : a, grants]);
      await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(tokens[uid]).digest('hex'), uid]);
    }
    // Unpredictable session only exists in the approved PG database. A different
    // app DB cannot authenticate it. Do this BEFORE business HTTP writes.
    for (const uid of users) assert.equal((await api('/api/auth/me', uid)).user.id, uid);
    bindingPassed = true;
    pass('current_database and all three unpredictable /api/auth/me sessions bind app to approved QA DB');
    // 400 taxable + 25% VAT = exactly 500 per invoice, with nonzero tax.
    await pool.query("insert into menu_items(id,branch_id,name,price,is_sellable,output_unit,product_code,vat_rate_percent) values($1,$2,$1,400,true,'portion','P-2106',25)", [item, a]);
    await pool.query("insert into raw_materials(id,name,unit) values($1,$1,'kg')", [raw]);
    await pool.query('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,10)', [id(), a, raw]);
    await pool.query("insert into bom_recipes(id,branch_id,menu_item_id,component_type,raw_material_id,qty_per_unit) values($1,$2,$3,'RAW_MATERIAL',$4,0.1)", [id(), a, item, raw]);
    await api('/api/branch-shifts', owner, 'POST', { branchId: a, shifts: [{ label: 'A', startTime: '00:00', endTime: '12:00' }, { label: 'B', startTime: '12:00', endTime: '00:00' }] }, 201);
    const run = (await api('/api/shift-runs', staff, 'POST', { branchId: a }, 201)).run;
    const billingMenu = await api('/api/menu-items?branchId=' + a, staff);
    assert.deepEqual(billingMenu.menuItems.map(row => row.id), [item]);
    await api('/api/menu-items', staff, 'POST', { branchId: a, name: 'Forbidden', price: '1' }, 403);
    pass('POS-only cashier can read the branch billing menu but cannot edit recipes/menu');
    const visibleSale = await api('/api/pos/orders', staff, 'POST', sale, 201);
    const privateSale = await api('/api/pos/orders', staff, 'POST', sale, 201);
    for (const order of [visibleSale, privateSale]) { assert.equal(order.receipt.totalAmount, '500.00'); assert.equal(order.receipt.taxAmount, '100.00'); assert.equal(order.whatsapp.attempted, false); }
    const visible = visibleSale.order, hidden = privateSale.order;
    // Set synthetic contact metadata directly, NOT via an endpoint which sends.
    await pool.query("update pos_orders set customer_phone=$1,customer_name=$2 where id=$3", ['+19999999991', 'VISIBLE-QA', visible.id]);
    await pool.query("update pos_orders set customer_phone=$1,customer_name=$2 where id=$3", ['+19999999992', 'PRIVATE-ONLY-QA', hidden.id]);
    const baseline = await financialSnapshot();
    assert.equal(baseline.orders.length, 2); assert.equal(baseline.stock[0].qty_on_hand, '9.800');
    assert.deepEqual((await api(ordersPath, staff)).orders.map(o => o.id).sort(), [visible.id, hidden.id].sort());
    pass('two real CASH sales total 1000, carry 200 tax and deduct real stock once without WhatsApp attempts');

    noPrivateMetadata(await change(hidden.id, true, staff, 403), hidden);
    noPrivateMetadata(await change(hidden.id, true, admin, 403), hidden);
    await api(visibilityPath(hidden.id), null, 'PATCH', { branchId: a, ownerOnly: true, reason: 'QA denial' }, 401);
    await api(visibilityPath(hidden.id), owner, 'PATCH', { branchId: a, ownerOnly: true, reason: 'QA denial' }, 403, { headers: { origin: 'http://evil.invalid' } });
    for (const malformed of [{}, { ownerOnly: 'true' }, { ownerOnly: null }, { ownerOnly: true, reason: '' }, { ownerOnly: true, reason: 'x' }, { ownerOnly: true, reason: 'x'.repeat(1001) }]) await api(visibilityPath(hidden.id), owner, 'PATCH', malformed, 400);
    for (const bad of ['{', 'null', '[]']) await api(visibilityPath(hidden.id), owner, 'PATCH', bad, 400, { raw: true });
    await api(visibilityPath(hidden.id), owner, 'PATCH', { ownerOnly: true, reason: 'Valid reason' }, 415, { headers: { 'content-type': 'text/plain' } });
    await api(visibilityPath(hidden.id), owner, 'PATCH', 'x'.repeat(17000), 413, { raw: true });
    await change(hidden.id, true, owner, 400, { totalAmount: '0.00' });
    await change(id(), true, owner, 404);
    // Owner is intentionally all-branch; a forged branch field is rejected,
    // not accepted as an alternate authorization scope.
    await change(hidden.id, true, owner, 400, { branchId: b });
    await pool.query("update users set role='BRANCH_MANAGER',branch_id=$1,module_access=array['POS_CASHIER','OFFICIAL_SALES_REPORTS']::text[] where id=$2", [a, owner]);
    await change(hidden.id, true, owner, 403);
    await pool.query("update users set role='SUPER_ADMIN',branch_id=null,module_access='{}'::text[] where id=$1", [owner]);
    await api(ordersPath.replace(a, b), staff, 'GET', undefined, 403);
    await api(audiencePath.replace(a, b), staff, 'GET', undefined, 403);
    for (const field of ['ownerOnly', 'owner_only', 'visibility']) {
      for (const uid of [staff, owner]) await api('/api/pos/orders', uid, 'POST', { ...sale, [field]: true }, 400);
    }
    assert.deepEqual(await financialSnapshot(), baseline);
    assert.equal((await pool.query('select count(*)::int n from audit_log where user_id=any($1::text[])', [users])).rows[0].n, 0);
    pass('role/anonymous/CSRF/malformed/missing-id/foreign-scope/forged-create denials change neither finances nor audit');

    // Force the audit insert to fail for this actor ONLY, proving transaction
    // rollback rather than merely observing that two successful writes exist.
    await pool.query(`create function ${functionName}() returns trigger language plpgsql as $$ begin if NEW.user_id = '${owner}' and NEW.entity_id = '${hidden.id}' and NEW.action = 'POS_ORDER_VISIBILITY_CHANGED' then raise exception 'QA scoped audit failure'; end if; return NEW; end; $$`);
    await pool.query(`create trigger ${triggerName} before insert on audit_log for each row execute function ${functionName}()`);
    await change(hidden.id, true, owner, 503);
    assert.equal((await pool.query('select owner_only from pos_orders where id=$1', [hidden.id])).rows[0].owner_only, false);
    assert.equal((await pool.query('select count(*)::int n from audit_log where entity_id=$1', [hidden.id])).rows[0].n, 0);
    await pool.query(`drop trigger ${triggerName} on audit_log`);
    await pool.query(`drop function ${functionName}()`);
    pass('forced audit insert failure rolls back visibility change atomically');

    const concurrent = await Promise.all([change(hidden.id, true), change(hidden.id, true)]);
    assert.deepEqual(concurrent.map(r => r.changed).sort(), [false, true]);
    for (const result of concurrent) assert.deepEqual(result.order, { id: hidden.id, ownerOnly: true });
    const audits = (await pool.query('select * from audit_log where entity_id=$1 order by created_at', [hidden.id])).rows;
    assert.equal(audits.length, 1, 'Concurrent desired-state replay must not duplicate audit');
    assert.equal(audits[0].user_id, owner);
    assert.equal(audits[0].action, 'POS_ORDER_VISIBILITY_CHANGED');
    assert.equal(audits[0].entity_type, 'PosOrder');
    assert.deepEqual(audits[0].metadata_json, { branchId: a, previousOwnerOnly: false, ownerOnly: true, reason: 'QA operational privacy only' });
    assert.equal((await pool.query('select owner_only from pos_orders where id=$1', [hidden.id])).rows[0].owner_only, true);
    assert.equal((await change(hidden.id, true)).changed, false);
    assert.equal((await pool.query('select count(*)::int n from audit_log where entity_id=$1', [hidden.id])).rows[0].n, 1);
    assert.deepEqual(await financialSnapshot(), baseline);
    pass('concurrent hide plus repeated desired state produces one audit and no inventory/invoice/tax changes');

    const own = await api(ordersPath);
    assert.equal(own.orders.length, 2);
    assert.equal(own.visibilityScope, 'actual');
    assert.equal(own.orders.find(o => o.id === hidden.id).ownerOnly, true);
    assert.equal(own.salesSummary.actualTotal, '1000.00');
    assert.equal(own.salesSummary.visibleTotal, '500.00');
    assert.equal(own.salesSummary.privateTotal, '500.00');
    for (const uid of [staff, admin]) {
      const scoped = await api(ordersPath, uid);
      assert.equal(scoped.visibilityScope, 'access-filtered');
      assert.deepEqual(scoped.orders.map(o => o.id), [visible.id]);
      assert.deepEqual(scoped.salesSummary, { visibleTotal: '500.00' });
      assert.ok(scoped.orders.every(row => !('ownerOnly' in row)));
      noPrivateMetadata(scoped, hidden);
      const bypass = await api(ordersPath + '&ownerOnly=true&includePrivate=true&orderId=' + hidden.id, uid);
      assert.deepEqual(bypass.orders.map(o => o.id), [visible.id]);
      noPrivateMetadata(bypass, hidden);
    }
    pass('Owner has actual1000/visible500/private500; staff/admin list and summary reveal no hidden id/contact/private aggregates, including query spoofing');
    const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const vatPath = '/api/vat/vat-summary?branchId=' + a + '&from=' + date(-1) + '&to=' + date(1);
    await api(vatPath, staff, 'GET', undefined, 403);
    for (const uid of [owner, admin]) {
      const official = await api(vatPath, uid);
      assert.equal(official.ordersIncluded, 2);
      assert.equal(official.grandTaxableValue, '800.00');
      assert.equal(official.grandTotalTax, '200.00');
      assert.equal(official.grandTotalValue, '1000.00');
    }
    await api(vatPath.replace(a, b), admin, 'GET', undefined, 403);
    pass('official report includes BOTH invoices and tax; POS-only staff denied; OFFICIAL_SALES_REPORTS admin remains branch-scoped');
    assert.equal((await api(audiencePath)).targetCount, 2);
    assert.equal((await api(audiencePath, staff)).targetCount, 1);
    assert.equal((await api('/api/whatsapp/offer-alert', staff)).targetCount, 1);
    // GET-only audience acceptance: never exercise the external-send path.
    // Removing the visible phone leaves only the private contact.
    await pool.query("update pos_orders set customer_phone='' where id=$1", [visible.id]);
    assert.equal((await api(audiencePath, staff)).targetCount, 0);
    assert.equal((await api(audiencePath)).targetCount, 1);
    await pool.query('update pos_orders set customer_phone=$1 where id=$2', ['+19999999991', visible.id]);
    assert.equal((await pool.query('select count(*)::int n from whatsapp_message_log where related_entity_id=any($1::text[])', [[a, b, visible.id, hidden.id]])).rows[0].n, 0);
    pass('GET audience excludes private-only contact for staff; zero sends/log entries');
    const closing = await api('/api/shift-runs/' + run.id + '/end', staff, 'POST', { branchId: a, note500Count: 2 }, 201);
    assert.equal(closing.cashExpected, '1000.00');
    assert.equal(closing.shortageExcessInr, '0.00');
    assert.equal(closing.handover.cashAmount, '1000.00');
    const drop = (await pool.query('select expected_cash_inr,counted_cash_inr from cash_drops where id=$1', [closing.handover.closingCashDropId])).rows[0];
    assert.deepEqual(drop, { expected_cash_inr: '1000.00', counted_cash_inr: '1000.00' });
    assert.deepEqual(await financialSnapshot(), baseline);
    pass('blind shift reconciliation includes private CASH sale without altering order/inventory/tax records');
    await change(hidden.id, false);
    await change(hidden.id, false);
    assert.equal((await pool.query('select count(*)::int n from audit_log where entity_id=$1', [hidden.id])).rows[0].n, 2);
    const restored = await api(ordersPath, staff);
    assert.equal(restored.orders.length, 2); assert.equal(restored.salesSummary.visibleTotal, '1000.00');
    assert.equal((await api(audiencePath, staff)).targetCount, 2);
    assert.deepEqual(await financialSnapshot(), baseline);
    pass('restore exposes both again, produces one additional audit, retains financial records');
  } finally {
    try { if (dbApproved) { await cleanup(); pass('exact UUID fixtures and scoped trigger/function removed'); } }
    finally { await pool.end(); }
  }
  assert.ok(bindingPassed);
  console.log('RESULT ' + checks + ' real HTTP/Postgres checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
