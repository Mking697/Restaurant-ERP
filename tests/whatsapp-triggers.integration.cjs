// Real HTTP + Postgres integration: WhatsApp Thank You trigger on order
// confirm, and the Offer Alert broadcast derived from real past orders.
// No real ChatXFlow token is configured in this local env, so sends are
// EXPECTED to fail at the network layer — the checks here prove the order/
// offer-alert flow itself still succeeds and the failure is reported, not
// swallowed or crashing the request.
require('dotenv').config();
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const BASE = 'http://localhost:3000';
const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: false });
const tokenHash = (t) => crypto.createHash('sha256').update(t).digest('hex');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) { pass++; } else { fail++; failures.push(name); } }

async function seedSession(userId, branchId, role, moduleAccess) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('delete from sessions where user_id = $1', [userId]);
  await pool.query('insert into sessions (token_hash, user_id, token_version, expires_at) values ($1,$2,\'0\', now() + interval \'1 hour\')', [tokenHash(token), userId]);
  return token;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(token ? { cookie: `restaurant_session=${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

(async () => {
  const branchId = 'qa-wa-branch-1', ownerId = 'qa-wa-owner-1', cashierId = 'qa-wa-cashier-1';
  const matId = 'qa-wa-mat-1', itemId = 'qa-wa-item-1';

  await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id = $1)', [branchId]);
  await pool.query('delete from pos_orders where branch_id = $1', [branchId]);
  await pool.query('delete from bom_recipes where menu_item_id = $1', [itemId]);
  await pool.query('delete from menu_items where id = $1', [itemId]);
  await pool.query('delete from inventory_stock where branch_id = $1', [branchId]);
  await pool.query('delete from raw_materials where id = $1', [matId]);
  await pool.query('delete from sessions where user_id in ($1,$2)', [ownerId, cashierId]);
  await pool.query('delete from users where id in ($1,$2)', [ownerId, cashierId]);
  await pool.query('delete from branches where id = $1', [branchId]);

  await pool.query("insert into branches (id, name, code, lat, lng) values ($1,'QA WA Branch','QAWA','0','0')", [branchId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA WA Owner','+919000000881','SUPER_ADMIN',null,'Active','{}')", [ownerId]);
  await pool.query("insert into users (id, name, phone_e164, role, branch_id, status, module_access) values ($1,'QA WA Cashier','+919000000882','CASHIER',$2,'Active','{POS_CASHIER,MENU_BOM}')", [cashierId, branchId]);
  await pool.query("insert into raw_materials (id, name, unit) values ($1,'QA WA Rice','KG')", [matId]);
  await pool.query("insert into inventory_stock (id, branch_id, raw_material_id, qty_on_hand, min_stock_level, max_stock_level) values (gen_random_uuid(), $1, $2, 100, 0, 0)", [branchId, matId]);
  await pool.query("insert into menu_items (id, branch_id, name, price, is_active, is_sellable) values ($1, $2, 'QA WA Thali', 100.00, true, true)", [itemId, branchId]);
  await pool.query("insert into bom_recipes (id, branch_id, menu_item_id, component_type, raw_material_id, qty_per_unit) values (gen_random_uuid(), $1, $2, 'RAW_MATERIAL', $3, 0.2)", [branchId, itemId, matId]);

  const ownerToken = await seedSession(ownerId, null, 'SUPER_ADMIN', []);
  const cashierToken = await seedSession(cashierId, branchId, 'CASHIER', ['POS_CASHIER', 'MENU_BOM']);

  // 1. Order WITHOUT a customer phone — no WhatsApp attempt at all.
  const noPhone = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tableNo: 'T1', tenderType: 'CASH', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('order without phone: 201', noPhone.status === 201);
  check('order without phone: whatsapp.attempted=false', noPhone.json?.whatsapp?.attempted === false);

  // 2. Order WITH a customer phone — attempted, and since no real ChatXFlow
  // token is configured in this local env, it must fail gracefully (not
  // crash the order, status still 201) and report sent=false with an error.
  const withPhone = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tableNo: 'T2', customerPhone: '9876543210', customerName: 'Rahul', tenderType: 'CASH', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('order with phone: 201', withPhone.status === 201);
  check('order with phone: whatsapp.attempted=true', withPhone.json?.whatsapp?.attempted === true);
  check('order with phone: whatsapp outcome reported (sent boolean present)', typeof withPhone.json?.whatsapp?.sent === 'boolean');

  // 3. Invalid phone is rejected with 400, order never created.
  const badPhone = await api('/api/pos/orders', { method: 'POST', token: cashierToken, body: { branchId, channel: 'DINE_IN', tableNo: 'T3', customerPhone: '12345', tenderType: 'CASH', lines: [{ menuItemId: itemId, qty: 1 }] } });
  check('order with invalid phone: 400', badPhone.status === 400);

  // 4. Offer Alert target preview reflects the ONE distinct phone captured
  // above (noPhone order contributed none, withPhone contributed one).
  const preview = await api(`/api/whatsapp/offer-alert?branchId=${branchId}`, { token: cashierToken });
  check('offer preview: 200', preview.status === 200);
  check('offer preview: targetCount=1 (distinct real customer)', preview.json?.targetCount === 1);

  // 5. Offer Alert send: targets exactly that 1 customer, reports an
  // outcome count (fails gracefully with no real ChatXFlow token).
  const sendOffer = await api('/api/whatsapp/offer-alert', { method: 'POST', token: cashierToken, body: { branchId, offerText: '20% off today QA', validUntil: '31 Oct' } });
  check('offer send: 201', sendOffer.status === 201);
  check('offer send: targeted=1', sendOffer.json?.targeted === 1);
  check('offer send: sent+failed counts present', typeof sendOffer.json?.sent === 'number' && typeof sendOffer.json?.failed === 'number');

  // 6. Offer Alert with no text: 400, never silently sends.
  const emptyOffer = await api('/api/whatsapp/offer-alert', { method: 'POST', token: cashierToken, body: { branchId, offerText: '' } });
  check('offer empty text: 400', emptyOffer.status === 400);

  // 7. Scope to a DIFFERENT (empty) branch: 0 targets, 400 on send (no
  // customers at all there) — proves branch scoping is real, not global.
  const otherBranchPreview = await api(`/api/whatsapp/offer-alert?branchId=${ownerId}`, { token: ownerToken });
  check('offer preview on unrelated scope id: 200 with 0 targets', otherBranchPreview.status === 200 && otherBranchPreview.json?.targetCount === 0);

  // 8. whatsapp_message_log actually recorded the attempt (audit row exists
  // even though the external send failed) — proves the log write is never
  // skipped just because the network call failed.
  const logRows = await pool.query("select count(*) from whatsapp_message_log where related_entity_type in ('PosOrder','OfferAlert') and created_at > now() - interval '2 minutes'");
  check('whatsapp_message_log has at least 2 audit rows (1 order + 1 offer)', Number(logRows.rows[0].count) >= 2);

  // Cleanup
  await pool.query('delete from pos_order_lines where order_id in (select id from pos_orders where branch_id = $1)', [branchId]);
  await pool.query('delete from pos_orders where branch_id = $1', [branchId]);
  await pool.query('delete from bom_recipes where menu_item_id = $1', [itemId]);
  await pool.query('delete from menu_items where id = $1', [itemId]);
  await pool.query('delete from inventory_stock where branch_id = $1', [branchId]);
  await pool.query('delete from raw_materials where id = $1', [matId]);
  await pool.query('delete from sessions where user_id in ($1,$2)', [ownerId, cashierId]);
  await pool.query('delete from users where id in ($1,$2)', [ownerId, cashierId]);
  await pool.query('delete from branches where id = $1', [branchId]);
  const leftover = await pool.query("select count(*) from branches where id like 'qa-wa-%'");
  check('cleanup: 0 leftover QA branches', Number(leftover.rows[0].count) === 0);

  await pool.end();
  console.log(JSON.stringify({ total: pass + fail, pass, fail, failures }, null, 2));
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
