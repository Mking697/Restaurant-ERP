// Real PostgreSQL + HTTP acceptance. Only an explicitly disposable local DB.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { Pool } = require('pg');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGPORT, '5439');
assert.equal(process.env.PGDATABASE, 'gap2122_qa');
const base = process.env.BASE_URL;
assert.equal(base, 'http://localhost:3119');
const pool = new Pool({ host: '127.0.0.1', port: 5439, database: 'gap2122_qa', user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: false });
const results = [];
function check(name, actual, expected = true) { try { assert.deepEqual(actual, expected); results.push({ name, pass: true }); } catch { results.push({ name, pass: false, actual, expected }); } }
const cookies = {};
async function req(actor, path, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + path, { method, signal: AbortSignal.timeout(90000), headers: { origin: base, cookie: cookies[actor] || '', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { nonJson: true }; }
  return { status: res.status, ...data };
}
async function seed() {
  const tables = await pool.query("select tablename from pg_tables where schemaname='public'");
  await pool.query('TRUNCATE ' + tables.rows.map(r => '"' + r.tablename + '"').join(',') + ' RESTART IDENTITY CASCADE');
  await pool.query("insert into branches(id,code,name,lat,lng) values('b1','B1','QA Branch One',0,0),('b2','B2','QA Branch Two',0,0)");
  for (const [id, role, branch, grants] of [['owner','SUPER_ADMIN',null,[]],['hq','CENTRAL_STORE_MGR',null,['HO_STOCK_REVIEW']],['mgr','BRANCH_MANAGER','b1',['INVENTORY','PURCHASE_INDENT','HO_STOCK_REVIEW','PURCHASE_ORDER']],['mgr2','BRANCH_MANAGER','b2',['INVENTORY','PURCHASE_INDENT']],['nogrant','CENTRAL_STORE_MGR',null,[]]]) {
    await pool.query("insert into users(id,name,phone_e164,role,branch_id,module_access,status) values($1,$1,$2,$3,$4,$5,'Active')", [id, '+25570000' + String(Object.keys(cookies).length).padStart(4,'0'), role, branch, grants]);
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '4 hours')", [crypto.createHash('sha256').update(token).digest('hex'), id]);
    cookies[id] = 'restaurant_session=' + token;
  }
}
async function reviews() {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam'}).format(new Date());
  const report = await req('mgr','/api/reports/eod-stock',{branchId:'b1',reportDate:today,requestKey:crypto.randomUUID(),regenerate:false});
  check('report generated',report.status,201);
  const id = report.report.id;
  check('EOD requires explicit integer revision', (await req('mgr',`/api/reports/eod-stock/${id}/submit-ho`,{})).status,400);
  const submitted = await req('mgr',`/api/reports/eod-stock/${id}/submit-ho`,{revision:1});
  check('EOD exact revision submitted',submitted.status,200);
  const sid = submitted.subject.id;
  const payload = {action:'ESCALATE',actionKey:crypto.randomUUID(),reason:'Short delivery needs follow-up'};
  const action = await req('owner',`/api/ho-stock-review/${encodeURIComponent(sid)}/action`,payload);
  check('Owner escalation saved',action.status,200);
  check('same actor exact replay', (await req('owner',`/api/ho-stock-review/${encodeURIComponent(sid)}/action`,payload)).replayed,true);
  check('unauthorized actor cannot replay event',(await req('mgr',`/api/ho-stock-review/${encodeURIComponent(sid)}/action`,payload)).status,403);
  check('different authorized actor cannot replay identity',(await req('hq',`/api/ho-stock-review/${encodeURIComponent(sid)}/action`,payload)).status,409);
  check('no HO grant denied',(await req('nogrant','/api/ho-stock-review?branchId=b1')).status,403);
  const queue = await req('hq','/api/ho-stock-review?branchId=b1&unresolved=true');
  check('escalation remains unresolved',queue.reviews.some(r=>r.id===sid&&!r.acknowledged),true);
  const ack = {action:'ACKNOWLEDGE',actionKey:crypto.randomUUID()};
  const race = await Promise.all([req('owner',`/api/ho-stock-review/${encodeURIComponent(sid)}/action`,ack),req('owner',`/api/ho-stock-review/${encodeURIComponent(sid)}/action`,ack)]);
  check('concurrent same-key acknowledgment once',race.map(r=>r.status),[200,200]);
  const events = await pool.query('select * from ho_stock_review_events where subject_id=$1',[sid]);
  check('escalate then ACK exactly two events',events.rowCount,2);
  await req('mgr','/api/reports/eod-stock',{branchId:'b1',reportDate:today,requestKey:crypto.randomUUID(),regenerate:true});
  check('stale EOD revision rejected',(await req('mgr',`/api/reports/eod-stock/${id}/submit-ho`,{revision:1})).status,409);
  check('latest EOD revision explicitly submitted',(await req('mgr',`/api/reports/eod-stock/${id}/submit-ho`,{revision:2})).subject?.sourceRevision,2);
  const revisions = await pool.query('select source_revision from ho_stock_review_subjects where source_id=$1 order by source_revision',[id]);
  check('immutable separate review subjects',revisions.rows.map(r=>r.source_revision),[1,2]);
  await pool.query("insert into ho_stock_review_subjects(id,branch_id,subject_type,source_id,source_revision,summary_json,submitted_at) values('GRN:old-unresolved:r1','b1','GRN','old-unresolved',1,'{}',now()-interval '1 year')");
  await pool.query("insert into ho_stock_review_subjects(id,branch_id,subject_type,source_id,source_revision,summary_json) select 'qa-resolved-'||n,'b1','GRN','qa-resolved-'||n,1,'{}'::jsonb from generate_series(1,301) n");
  await pool.query("insert into ho_stock_review_events(id,subject_id,action,action_key,actor_id) select 'qa-resolved-event-'||n,'qa-resolved-'||n,'ACKNOWLEDGE','qa-resolved-key-'||n,'owner' from generate_series(1,301) n");
  const unresolvedPage=await req('hq','/api/ho-stock-review?branchId=b1&unresolved=true');
  check('older unresolved exception is not hidden by 301 newer acknowledgments',unresolvedPage.reviews.some(r=>r.id==='GRN:old-unresolved:r1'),true);
  await pool.query("delete from ho_stock_review_events where id like 'qa-resolved-event-%'; delete from ho_stock_review_subjects where id like 'qa-resolved-%' or id='GRN:old-unresolved:r1'");
  if (process.argv.includes('--keep')) fs.writeFileSync(process.env.QA_COOKIE_FILE, JSON.stringify({owner:cookies.owner,mgr:cookies.mgr}));
}
async function replenishment() {
  await pool.query("insert into raw_materials(id,name,unit) values('mat','QA Reorder Flour','kg')");
  await pool.query("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level) values('inv','b1','mat',6,8,20)");
  await pool.query("insert into warehouses(id,type,branch_id,name) values('central','CENTRAL',null,'QA Central')");
  await pool.query("insert into warehouse_stock(id,warehouse_id,raw_material_id,qty_on_hand) values('central-stock','central','mat',4)");
  await pool.query("insert into stock_batches(id,branch_id,warehouse_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status,expiry_date) values('good','b1',null,'mat','GOOD',2,2,'NON_EXPIRING',null),('expired','b1',null,'mat','EXPIRED',2,2,'DATED','2000-01-01'),('unknown','b1',null,'mat','UNKNOWN',2,2,'UNKNOWN',null),('central-good',null,'central','mat','CENTRAL',4,4,'NON_EXPIRING',null)");
  await pool.query("insert into vendors(id,name,phone_e164) values('vendor','QA Vendor','+255700009999')");
  await pool.query("insert into purchase_orders(id,po_number,branch_id,vendor_id,status) values('old-po','OLD','b1','vendor','CLOSED'),('open-po','OPEN','b1','vendor','PARTIALLY_RECEIVED')");
  await pool.query("insert into purchase_order_lines(id,po_id,raw_material_id,qty,rate) values('old-line','old-po','mat',100,1),('open-line','open-po','mat',3,1),('open-line2','open-po','mat',2,1)");
  await pool.query("insert into grns(id,po_id,branch_id,received_by_id,quality_result,status) values('old-grn','old-po','b1','owner','PASS','APPROVED'),('open-grn','open-po','b1','owner','PENDING','PENDING')");
  await pool.query("insert into grn_lines(id,grn_id,raw_material_id,qty_ordered,qty_received,rate_ordered) values('old-grn-line','old-grn','mat',100,100,1),('open-grn-line','open-grn','mat',5,1,1)");
  const preview = await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'});
  check('preview HTTP succeeds',preview.status,200);
  const row = preview.suggestions[0];
  check('eligible branch batches exclude expired and unknown',row.usable,'2.000');
  check('open PO receipt subtraction excludes historical completed PO and duplicate item lines',row.externalPoOutstanding,'4.000');
  check('pending quality counted once',row.qualityPending,'1.000');
  check('nonduplicated inventory position',row.inventoryPosition,'7.000');
  const key = crypto.randomUUID();
  const convertPath = `/api/inventory/reorder-suggestions/${row.id}/convert`;
  const converted = await Promise.all([req('mgr',convertPath,{requestKey:key}),req('mgr',convertPath,{requestKey:key})]);
  check('concurrent conversion both return saved links',converted.map(r=>r.status),[200,200]);
  check('one saved conversion and one replay',converted.filter(r=>r.replayed).length,1);
  const saved = converted[0].suggestion;
  const linked = await pool.query('select r.status as internal_status,l.qty_requested,i.status as external_status,il.qty from internal_requisitions r join internal_requisition_lines l on l.requisition_id=r.id cross join indents i join indent_lines il on il.indent_id=i.id where r.id=$1 and i.id=$2',[saved.internalRequisitionId,saved.externalIndentId]);
  check('internal first 4kg submitted and remainder 9kg draft',linked.rows,[{internal_status:'SUBMITTED',qty_requested:'4.000',external_status:'DRAFT',qty:'9.000'}]);
  check('cross branch replay denied',(await req('mgr2',convertPath,{requestKey:key})).status,403);
  check('saved suggestion readback returns committed request links',(await req('mgr',`/api/inventory/reorder-suggestions/${row.id}`)).suggestion?.internalRequisitionId,saved.internalRequisitionId);
  check('saved suggestion readback enforces branch',(await req('mgr2',`/api/inventory/reorder-suggestions/${row.id}`)).status,403);
  check('different actor cannot replay conversion key',(await req('owner',convertPath,{requestKey:key})).status,409);
  const after = await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'});
  check('fresh preview counts pending requests without second replenishment',after.suggestions.length,0);
  await pool.query("update internal_requisition_lines set status='CANCELLED' where requisition_id=$1",[saved.internalRequisitionId]);
  await pool.query("update indents set status='REJECTED' where id=$1",[saved.externalIndentId]);
  const cycle = await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'});
  check('same numeric position after cancellation starts a genuine new cycle',cycle.suggestions[0]?.id!==row.id,true);
  check('new cycle is not returned as already converted',Boolean(cycle.suggestions[0]?.convertedAt),false);
  await pool.query("update inventory_stock set qty_on_hand=7 where id='inv'");
  const branchMismatch = await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'});
  check('unreconciled branch stock blocks conversion',branchMismatch.suggestions[0]?.convertible,false);
  await pool.query("update inventory_stock set qty_on_hand=6 where id='inv'");
  await pool.query("update warehouse_stock set qty_on_hand=5 where id='central-stock'");
  const centralMismatch = await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'});
  check('unreconciled central stock blocks conversion',centralMismatch.suggestions[0]?.convertible,false);
  await pool.query("update warehouse_stock set qty_on_hand=4 where id='central-stock'");
  const staleId = cycle.suggestions[0].id;
  await pool.query("update inventory_stock set max_stock_level=21 where id='inv'");
  check('stale preview conflict before any request creation',(await req('mgr',`/api/inventory/reorder-suggestions/${staleId}/convert`,{requestKey:crypto.randomUUID()})).status,409);
  await pool.query("update inventory_stock set max_stock_level=20 where id='inv'");
  await pool.query("create function qa_reject_indent_line() returns trigger language plpgsql as $$ begin raise exception 'QA forced rollback'; end $$");
  await pool.query("create trigger qa_reject before insert on indent_lines for each row execute function qa_reject_indent_line()");
  const before = await pool.query('select count(*)::int as n from internal_requisitions');
  try {
    check('forced downstream insert failure returns unknown-safe 503',(await req('mgr',`/api/inventory/reorder-suggestions/${staleId}/convert`,{requestKey:crypto.randomUUID()})).status,503);
    const rolledBack = await pool.query('select count(*)::int as n from internal_requisitions');
    check('internal request rolled back when external insert fails',rolledBack.rows[0].n,before.rows[0].n);
    const unconverted = await pool.query('select converted_at from reorder_suggestions where id=$1',[staleId]);
    check('suggestion conversion remains unwritten on rollback',unconverted.rows[0].converted_at,null);
  } finally { await pool.query('drop trigger qa_reject on indent_lines; drop function qa_reject_indent_line()'); }
  await pool.query("insert into audit_log(id,user_id,action,entity_type,entity_id,metadata_json) values('grn-origin:open-grn','owner','GRN_CREATED','GRN','open-grn',$1)",[{version:1,branchId:'b1',poId:'open-po'}]);
  const qualityPayload={result:'PASS',lines:[{id:'open-grn-line',qtyFailed:'0',nonExpiring:true,evidence:'QA Owner verified lot'}],note:'',photoUrl:''};
  const quality=await req('owner','/api/purchase/grns/open-grn/quality',qualityPayload);
  check('real GRN quality finalization succeeds',quality.status,200);
  const reviewSubjects=await pool.query("select id,exception,summary_json from ho_stock_review_subjects where subject_type='GRN' and source_id='open-grn'");
  check('quality-finalized GRN autoqueues exactly once',reviewSubjects.rowCount,1);
  check('short receipt is marked an HO exception',reviewSubjects.rows[0]?.exception,true);
  check('quality replay does not requeue',(await req('owner','/api/purchase/grns/open-grn/quality',qualityPayload)).replayed,true);
  check('GRN queue readback includes finalized shortage',(await req('hq','/api/ho-stock-review?branchId=b1&unresolved=true')).reviews.some(r=>r.sourceId==='open-grn'&&r.exception&&!r.acknowledged),true);
  await pool.query("insert into raw_materials(id,name,unit) values('pieces','QA Reorder Pieces','pcs')");
  await pool.query("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level) values('piece-inv','b1','pieces',0,1,3.001)");
  await pool.query("insert into warehouse_stock(id,warehouse_id,raw_material_id,qty_on_hand) values('piece-stock','central','pieces',2.750)");
  await pool.query("insert into stock_batches(id,warehouse_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status) values('piece-batch','central','pieces','PIECES',2.750,2.750,'NON_EXPIRING')");
  const piecePreview=await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'});
  const piece=piecePreview.suggestions.find(r=>r.rawMaterialId==='pieces');
  check('HTTP pcs total upward integer and internal downward integer',[piece.suggestedQty,piece.internalQty,piece.externalQty],['4.000','2.000','2.000']);
  await pool.query("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level) values('inv-b2','b2','mat',0,1,20)");
  const other=await req('mgr2','/api/inventory/reorder-suggestions/preview',{branchId:'b2'});
  const own=piecePreview.suggestions.find(r=>r.rawMaterialId==='mat');
  const concurrent=await Promise.all([req('mgr',`/api/inventory/reorder-suggestions/${own.id}/convert`,{requestKey:crypto.randomUUID()}),req('mgr2',`/api/inventory/reorder-suggestions/${other.suggestions[0].id}/convert`,{requestKey:crypto.randomUUID()})]);
  check('two branches cannot allocate same proven central capacity',concurrent.map(r=>r.status).sort(),[200,409]);
  const requestCount=await pool.query("select count(*)::int n from internal_requisitions");
  check('only winning branch adds an internal request',requestCount.rows[0].n,2);
  const winner=concurrent.find(r=>r.status===200).suggestion;
  const externalLine=(await pool.query('select qty from indent_lines where indent_id=$1',[winner.externalIndentId])).rows[0];
  await pool.query("insert into purchase_orders(id,po_number,branch_id,vendor_id,indent_id,status) values('converted-po','CONVERTED',$1,'vendor',$2,'CREATED')",[winner.branchId,winner.externalIndentId]);
  await pool.query("insert into purchase_order_lines(id,po_id,raw_material_id,qty,rate) values('converted-po-line','converted-po','mat',$1,1)",[externalLine.qty]);
  await pool.query("update indents set status='PO_RAISED' where id=$1",[winner.externalIndentId]);
  const afterPo=await req(winner.branchId==='b1'?'mgr':'mgr2','/api/inventory/reorder-suggestions/preview',{branchId:winner.branchId});
  check('draft-to-PO lifecycle replaces reservation without duplicated demand',afterPo.suggestions.some(r=>r.rawMaterialId==='mat'),false);
  await pool.query("insert into raw_materials(id,name,unit) values('transit','QA Linked Transit','ltr')");
  await pool.query("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level) values('transit-inv','b1','transit',0,5,10)");
  await pool.query("insert into warehouse_stock(id,warehouse_id,raw_material_id,qty_on_hand) values('transit-central','central','transit',8)");
  await pool.query("insert into stock_batches(id,warehouse_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status) values('transit-central-lot','central','transit','TRANSIT',10,8,'NON_EXPIRING')");
  await pool.query("insert into warehouses(id,type,branch_id,name) values('branch-wh','BRANCH','b1','QA Branch Store')");
  await pool.query("insert into internal_requisitions(id,branch_id,requested_by_id,status) values('linked-req','b1','owner','APPROVED')");
  await pool.query("insert into internal_requisition_lines(id,requisition_id,line_type,raw_material_id,qty_requested,qty_approved,status) values('linked-line','linked-req','RAW','transit',4,4,'APPROVED')");
  await pool.query("insert into stock_transfers(id,from_warehouse_id,to_warehouse_id,raw_material_id,qty_dispatched,dispatched_by_id,requisition_line_id) values('linked-transfer','central','branch-wh','transit',2,'owner','linked-line')");
  const linkedPreview=(await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'})).suggestions.find(r=>r.rawMaterialId==='transit');
  check('approved remaining plus linked transit counted once in real SQL',[linkedPreview.requisitionOutstanding,linkedPreview.transferInTransit,linkedPreview.inventoryPosition],['2.000','2.000','4.000']);
  check('central commitment deducts only undispatched remainder',linkedPreview.internalAvailable,'6.000');
  await pool.query("update stock_transfers set status='RECEIVED',qty_received=1.5,received_by_id='owner',received_at=now() where id='linked-transfer'; update inventory_stock set qty_on_hand=1.5 where id='transit-inv'; insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status) values('transit-received','b1','transit','TRANSIT-RECEIVED',1.5,1.5,'NON_EXPIRING')");
  const receivedPreview=(await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'})).suggestions.find(r=>r.rawMaterialId==='transit');
  check('short transfer receipt replaces transit with actual usable stock',[receivedPreview.usable,receivedPreview.transferInTransit,receivedPreview.inventoryPosition],['1.500','0.000','3.500']);
  await pool.query("update internal_requisition_lines set status='CANCELLED' where id='linked-line'");
  const cancelledPreview=(await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'})).suggestions.find(r=>r.rawMaterialId==='transit');
  check('cancel remaining releases demand and central commitment',[cancelledPreview.requisitionOutstanding,cancelledPreview.internalAvailable,cancelledPreview.suggestedQty],['0.000','8.000','8.500']);




  await pool.query("insert into raw_materials(id,name,unit) values('healthy','QA Above Minimum','kg'); insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level) values('healthy-inv','b1','healthy',5,2,10); insert into stock_batches(id,branch_id,raw_material_id,batch_no,qty_received,qty_remaining,expiry_status) values('healthy-lot','b1','healthy','HEALTHY',5,5,'NON_EXPIRING')");
  const healthy=await req('mgr','/api/inventory/reorder-suggestions/preview',{branchId:'b1'});
  check('position above minimum does not trigger a max-fill request',healthy.suggestions.some(r=>r.rawMaterialId==='healthy'),false);
}
(async()=>{try{await seed(); await reviews(); await replenishment(); for(const result of results)console.log(JSON.stringify(result)); console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length})); if(results.some(r=>!r.pass))process.exitCode=1;}finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
