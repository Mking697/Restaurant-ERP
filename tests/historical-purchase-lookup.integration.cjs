// Parent-run only: explicit local app + exact disposable PG target. No dotenv.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const DATABASE = 'restaurant_erp_purchase_history_qa_20261030';
function target(env) {
  assert.equal(env.PGHOST, '127.0.0.1'); assert.equal(env.PGPORT, '5436');
  assert.equal(env.PGDATABASE, DATABASE); assert.equal(env.HISTORY_QA_DATABASE, DATABASE);
  assert.ok(env.PGUSER && Object.hasOwn(env, 'PGPASSWORD'), 'Explicit PGUSER/PGPASSWORD required');
  assert.ok(env.BASE_URL, 'Explicit BASE_URL required');
  const url = new URL(env.BASE_URL);
  assert.equal(url.protocol, 'http:'); assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.ok(url.port && url.port !== '5436'); assert.equal(url.pathname, '/');
  assert.equal(url.username + url.password + url.search + url.hash, '');
  return { origin: url.origin, database: { host: '127.0.0.1', port: 5436, database: DATABASE, user: env.PGUSER, password: env.PGPASSWORD, ssl: false } };
}
module.exports = { target };
async function run(env = process.env) {
  const config = target(env);
  const { Client } = require('pg'); const db = new Client(config.database);
  const prefix = 'qa-history-' + crypto.randomBytes(12).toString('hex');
  const a = prefix+'-a', b = prefix+'-b', rice = prefix+'-rice', oil = prefix+'-oil', vendor = prefix+'-vendor';
  const oldIndent = prefix+'-old-indent', foreignIndent = prefix+'-foreign-indent', draft = prefix+'-draft';
  const fillerIndents = Array.from({ length: 201 }, (_, i) => prefix+'-indent-'+i);
  const indentIds = [oldIndent, foreignIndent, draft, ...fillerIndents];
  const history = prefix+'-history', recovery = prefix+'-recovery', foreign = prefix+'-foreign';
  const fillerGrns = Array.from({ length: 201 }, (_, i) => prefix+'-grn-'+i);
  const grnIds = [history, recovery, foreign, ...fillerGrns];
  const poIds = grnIds.map(id => id+'-po');
  const actors = {
    owner: { id: prefix+'-owner', role: 'SUPER_ADMIN', branch: null, grants: [] },
    buyer: { id: prefix+'-buyer', role: 'CASHIER', branch: a, grants: ['PURCHASE_ORDER'] },
    accounts: { id: prefix+'-accounts', role: 'ACCOUNTANT', branch: a, grants: ['VENDOR_REFUNDS'] },
    inventory: { id: prefix+'-inventory', role: 'KITCHEN_STAFF', branch: a, grants: ['INVENTORY'] },
  };
  const checks = []; let connected = false, fixtures = false;
  const check = (name, fn) => { fn(); checks.push(name); console.log('PASS '+name); };
  async function http(method, path, body, who = 'buyer') {
    const response = await fetch(config.origin+path, { method, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { origin: config.origin, 'content-type': 'application/json', ...(who ? { cookie: actors[who].cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  const exactIndent = (id, branch = a) => '/api/purchase/orders/approved-indents/'+encodeURIComponent(id)+'?'+new URLSearchParams({ branchId: branch });
  const exactGrn = (id, branch = a) => '/api/purchase/grns/'+encodeURIComponent(id)+'?'+new URLSearchParams({ branchId: branch });
  const privateFields = new Set(['phoneE164','phone_e164','passwordHash','password_hash','salary','baseSalary','tokenHash','token_hash','moduleAccess']);
  function privateFree(value) { if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { assert.equal(privateFields.has(key), false, 'private DTO field: '+key); privateFree(child); } }
  async function snapshot() {
    const value = {};
    // Full committed row readback, not just counts. Read-only GETs may change none.
    for (const table of ['indents','indent_lines','purchase_orders','purchase_order_lines','grns','grn_lines','material_returns','inventory_stock','audit_log','journal_entries','petty_cash_entries','ledger_accounts']) value[table] = (await db.query(`select * from ${table} order by id`)).rows;
    return value;
  }
  async function moneyStock() { const all = await snapshot(); return { stock: all.inventory_stock, journals: all.journal_entries, cash: all.petty_cash_entries, accounts: all.ledger_accounts }; }
  const decision = id => ({ result: 'PARTIAL', note: 'Historical damaged packs', photoUrl: '', lines: [{ id: id+'-rice', qtyFailed: '2.125' }, { id: id+'-oil', qtyFailed: '0.500' }] });
  async function quality(id) { const value = await http('POST', '/api/purchase/grns/'+id+'/quality', decision(id), 'owner'); assert.equal(value.status, 200); return value; }
  async function cleanup() {
    // Only exact randomly owned identifiers; never prefix-wide or fixture-wide cleanup.
    await db.query('begin');
    try {
      for (const [table, column, ids] of [['material_returns','grn_id',grnIds],['audit_log','entity_id',grnIds],['grn_lines','grn_id',grnIds],['grns','id',grnIds],['purchase_order_lines','po_id',poIds],['purchase_orders','id',poIds],['indent_lines','indent_id',indentIds],['indents','id',indentIds]]) await db.query(`delete from ${table} where ${column}=any($1::text[])`, [ids]);
      const stocks = (await db.query('select id from inventory_stock where branch_id=any($1::text[])', [[a,b]])).rows.map(row => row.id);
      await db.query('delete from inventory_stock where id=any($1::text[])', [stocks]);
      const users = Object.values(actors).map(actor => actor.id);
      await db.query('delete from sessions where user_id=any($1::text[])', [users]);
      await db.query('delete from users where id=any($1::text[])', [users]);
      await db.query('delete from vendors where id=$1', [vendor]); await db.query('delete from raw_materials where id=any($1::text[])', [[rice,oil]]);
      await db.query('delete from branches where id=any($1::text[])', [[a,b]]); await db.query('commit');
      for (const [table, column, ids] of [['branches','id',[a,b]],['users','id',users],['sessions','user_id',users],['vendors','id',[vendor]],['raw_materials','id',[rice,oil]],['inventory_stock','id',stocks],['audit_log','entity_id',grnIds],['material_returns','grn_id',grnIds],['grns','id',grnIds],['grn_lines','grn_id',grnIds],['purchase_orders','id',poIds],['purchase_order_lines','po_id',poIds],['indents','id',indentIds],['indent_lines','indent_id',indentIds]]) assert.equal((await db.query(`select count(*)::int n from ${table} where ${column}=any($1::text[])`, [ids])).rows[0].n, 0, 'owned cleanup: '+table);
      console.log('PASS exact owned cleanup readback');
    } catch (error) { await db.query('rollback'); throw error; }
  }
  let failure;
  try {
    await db.connect(); connected = true;
    const actual = (await db.query('select current_database() db, inet_server_port() port')).rows[0]; assert.equal(actual.db, DATABASE); // Host socket is explicitly 127.0.0.1:5436; container-internal port may differ.
    fixtures = true; // Cleanup also covers partial fixture setup/uncertain COMMIT.
    await db.query('begin');
    try {
      await db.query("insert into branches(id,code,name,lat,lng) values($1,$1,$1,'0','0'),($2,$2,$2,'0','0')", [a,b]);
      for (const actor of Object.values(actors)) {
        await db.query("insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,$1,$1,$2,$3,'Active',$4)", [actor.id,actor.role,actor.branch,actor.grants]);
        const token = crypto.randomBytes(32).toString('hex'); actor.cookie = 'restaurant_session='+token;
        await db.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')", [crypto.createHash('sha256').update(token).digest('hex'),actor.id]);
      }
      await db.query('commit'); fixtures = true;
    } catch (error) { await db.query('rollback'); throw error; }
    // A random actor/session inserted only in this DB must resolve through this app
    // before any purchase, quality, claims or stock fixture is created.
    const marker = await http('GET','/api/auth/me'); assert.equal(marker.status,200); assert.equal(marker.data.user.id, actors.buyer.id, 'App/DB random marker mismatch');
    await db.query("insert into raw_materials(id,name,unit) values($1,$1,'kg'),($2,$2,'l')", [rice,oil]);
    await db.query("insert into vendors(id,name,phone_e164) values($1,'Historical QA vendor',$1)", [vendor]);
    await db.query("insert into indents(id,branch_id,raised_by_id,status,created_at) values($1,$4,$6,'APPROVED','2020-01-01'),($2,$5,$6,'APPROVED','2020-01-01'),($3,$4,$6,'DRAFT','2020-01-01')", [oldIndent,foreignIndent,draft,a,b,actors.owner.id]);
    await db.query("insert into indents(id,branch_id,raised_by_id,status) select unnest($1::text[]),$2,$3,'APPROVED'::indent_status", [fillerIndents,a,actors.owner.id]);
    for (const [i, material, qty] of [[0,rice,'10.000'],[1,oil,'5.000']]) await db.query('insert into indent_lines(id,indent_id,raw_material_id,qty) values($1,$2,$3,$4)', [oldIndent+'-line-'+i,oldIndent,material,qty]);
    for (const id of grnIds) {
      const branch = id === foreign ? b : a; const old = [history,recovery,foreign].includes(id);
      await db.query("insert into purchase_orders(id,po_number,branch_id,vendor_id,status,material_received_at) values($1,$1,$2,$3,'RECEIVED',now())", [id+'-po',branch,vendor]);
      await db.query("insert into grns(id,po_id,branch_id,received_by_id,created_at) values($1,$2,$3,$4,case when $5 then '2020-01-01'::timestamptz else now() end)", [id,id+'-po',branch,actors.owner.id,old]);
      for (const [suffix, material, qty, rate] of [['rice',rice,'10.000','10.25'],['oil',oil,'5.000','100.00']]) await db.query('insert into grn_lines(id,grn_id,raw_material_id,qty_ordered,qty_received,rate_ordered) values($1,$2,$3,$4,$4,$5)', [id+'-'+suffix,id,material,qty,rate]);
      await db.query("insert into audit_log(id,user_id,action,entity_type,entity_id,metadata_json) values($1,$2,'GRN_CREATED','GRN',$3,$4)", ['grn-origin:'+id,actors.owner.id,id,{ version:1,branchId:branch,poId:id+'-po' }]);
    }
    await quality(history);
    // Represent a legitimate GRN-1 receipt: no automatic backfill by GET/replay.
    await db.query('begin');
    try {
      await db.query('delete from material_returns where grn_id=$1',[history]); await db.query('delete from audit_log where id=$1',['grn-returns:'+history]);
      await db.query("update audit_log set metadata_json=metadata_json-'vendorReturnsVersion' where id=$1",['grn-quality:'+history]); await db.query('commit');
    } catch (error) { await db.query('rollback'); throw error; }
    const beforeReads = await snapshot();
    const indents = await http('GET','/api/purchase/orders/approved-indents?branchId='+a);
    check('201 newer approved indents hide historical target in bounded list',()=>{ assert.equal(indents.status,200); assert.equal(indents.data.indents.length,200); assert.equal(indents.data.indents.some(row=>row.id===oldIndent),false); });
    const grns = await http('GET','/api/purchase/grns?branchId='+a);
    check('201 newer GRNs hide both historical targets in bounded list',()=>{ assert.equal(grns.status,200); assert.equal(grns.data.grns.length,200); assert.equal(grns.data.grns.some(row=>[history,recovery].includes(row.id)),false); });
    const exactI = await http('GET',exactIndent(oldIndent)); const exactG = await http('GET',exactGrn(history));
    check('PO-only exact approved read returns minimal complete quantity DTO',()=>{ assert.equal(exactI.status,200); assert.deepEqual(Object.keys(exactI.data.indent).sort(),['branchId','id','lines']); assert.equal(exactI.data.indent.id,oldIndent); assert.equal(exactI.data.indent.branchId,a); assert.equal(exactI.data.indent.lines.length,2); assert.deepEqual(exactI.data.indent.lines.map(l=>l.qty).sort(),['10.000','5.000']); for(const line of exactI.data.indent.lines) assert.deepEqual(Object.keys(line).sort(),['name','qty','rawMaterialId','unit']); privateFree(exactI.data); });
    check('PO-only exact GRN read retains all failed/accepted lines and trusted receipt state',()=>{ assert.equal(exactG.status,200); assert.equal(exactG.data.grn.id,history); assert.equal(exactG.data.grn.branchId,a); assert.equal(exactG.data.grn.qualityRecorded,true); assert.equal(exactG.data.grn.reconciliationRequired,false); assert.equal(exactG.data.grn.inventoryPosted,true); assert.equal(exactG.data.grn.lines.length,2); assert.deepEqual(exactG.data.grn.lines.map(l=>l.qtyFailed).sort(),['0.500','2.125']); privateFree(exactG.data); });
    for (const [kind, base, id, foreignId] of [['indent','/api/purchase/orders/approved-indents/',oldIndent,foreignIndent],['GRN','/api/purchase/grns/',history,foreign]]) {
      for (const [label,path,who,status] of [
        ['anonymous',base+id+'?branchId='+a,null,401],['Accounts-only',base+id+'?branchId='+a,'accounts',403],['inventory-only',base+id+'?branchId='+a,'inventory',403],['Owner explicit branch required',base+id,'owner',400],['duplicate branch',base+id+'?branchId='+a+'&branchId='+a,'owner',400],['status override',base+id+'?branchId='+a+'&status=APPROVED','owner',400],['unknown query',base+id+'?branchId='+a+'&limit=201','owner',400],['foreign branch',base+id+'?branchId='+b,'buyer',403],['foreign ID in own branch',base+foreignId+'?branchId='+a,'buyer',404],['missing ID',base+prefix+'-missing?branchId='+a,'buyer',404],['blank ID',base+'%20?branchId='+a,'buyer',400],['overlong ID',base+'x'.repeat(201)+'?branchId='+a,'buyer',400],
      ]) { const response = await http('GET',path,undefined,who); check(kind+' '+label,()=>assert.equal(response.status,status)); }
      const permitted = await http('GET',base+id+'?branchId='+a,undefined,'owner'); assert.equal(permitted.status,200);
    }
    const ineligible = await http('GET',exactIndent(draft)); check('ineligible own-branch indent is scoped404',()=>assert.equal(ineligible.status,404));
    assert.deepEqual(await snapshot(),beforeReads); check('all exact/list/denied GETs have exact no-write readback',()=>{});
    const beforeClaim = await moneyStock();
    const register = () => http('POST','/api/purchase/grns/'+history+'/returns',{});
    const claims = await Promise.all([register(),register()]);
    check('authorized old exact failure registers once under concurrent exact replays',()=>{ assert.deepEqual(claims.map(r=>r.status),[200,200]); assert.deepEqual(claims.map(r=>r.data.replayed).sort(),[false,true]); assert.ok(claims.every(r=>r.data.returns.length===2)); });
    const readClaims = await http('GET','/api/purchase/material-returns?'+new URLSearchParams({branchId:a,grnId:history}));
    check('exact claims readback confirms immutable expected amounts, never money received',()=>{ assert.equal(readClaims.status,200); assert.deepEqual(readClaims.data.returns.map(r=>r.refundAmountInr).sort(),['21.78','50.00']); assert.ok(readClaims.data.returns.every(r=>r.grnId===history&&r.branchId===a&&r.status==='REFUND_OR_CREDIT_EXPECTED'&&r.moneyReceived===null)); });
    assert.deepEqual(await moneyStock(),beforeClaim); const stable = await snapshot(); await register(); assert.deepEqual(await snapshot(),stable);
    const saved = await quality(recovery); const afterQuality = await snapshot();
    const recovered = await http('GET',exactGrn(recovery));
    check('lost quality response is recoverable by exact ID/original branch outside list',()=>{ assert.equal(recovered.status,200); assert.deepEqual(recovered.data.grn,saved.data.grn); assert.equal(recovered.data.grn.lines.length,2); assert.equal(recovered.data.grn.qualityRecorded,true); });
    const replay = await quality(recovery); assert.equal(replay.data.replayed,true); assert.deepEqual(await snapshot(),afterQuality);
    const deniedLive = await http('GET',exactGrn(history),undefined,'accounts'); assert.equal(deniedLive.status,403);
    await db.query('update users set module_access=$1 where id=$2',[[],actors.buyer.id]);
    const revoked = await http('GET',exactGrn(history)); check('exact GET rechecks live grants',()=>assert.equal(revoked.status,403));
    console.log(JSON.stringify({ total: checks.length, passed: checks.length, failed: 0 }));
  } catch (error) { failure = error; }
  finally {
    if (connected && fixtures) try { await cleanup(); } catch (error) { failure = failure ? new AggregateError([failure,error], 'Acceptance and cleanup failed') : error; }
    if (connected) await db.end();
  }
  if (failure) throw failure;
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
