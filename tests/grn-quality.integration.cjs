// Local disposable integration only; never use shared dev or managed databases.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool}=require('pg');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGPORT,'5436');
assert.match(process.env.PGDATABASE||'',/^restaurant_erp_purchase_qa_\d{8}$/);
assert.equal(process.env.GRN_QA_DATABASE,process.env.PGDATABASE);
const url=new URL(process.env.BASE_URL||'');assert.equal(url.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
const pool=new Pool({host:process.env.PGHOST,port:5436,user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,ssl:false});
const run=crypto.randomBytes(5).toString('hex'),prefix=`qa-grn-${run}`;
const a=prefix+'-a',b=prefix+'-b',mat=prefix+'-rice',oil=prefix+'-oil',vendor=prefix+'-vendor';
const actors={owner:{id:prefix+'-owner',role:'SUPER_ADMIN',branch:null,grants:[]},manager:{id:prefix+'-manager',role:'BRANCH_MANAGER',branch:a,grants:['PURCHASE_ORDER','INVENTORY']},buyer:{id:prefix+'-buyer',role:'CASHIER',branch:a,grants:['PURCHASE_ORDER']},inventory:{id:prefix+'-inventory',role:'CASHIER',branch:a,grants:['INVENTORY']}};
const grnIds=[],poIds=[];let checks=0;
async function request(method,path,body,actor='manager',origin=url.origin){
 const res=await fetch(url.origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',origin,...(actor?{cookie:actors[actor].cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 let data;const text=await res.text();try{data=JSON.parse(text);}catch{data={nonJson:true};}return {status:res.status,data};
}
function check(label,fn){fn();checks++;console.log('PASS '+label);}
async function createGrn({branch=a,general=false,lines}={}){
 const id=prefix+'-g-'+grnIds.length,po=prefix+'-po-'+poIds.length;grnIds.push(id);poIds.push(po);
 const spec=lines||[{material:mat,qty:'10'},{material:oil,qty:'5'}];
 await pool.query("insert into purchase_orders(id,po_number,branch_id,vendor_id,is_general_purchase,status,material_received_at) values($1,$1,$2,$3,$4,'RECEIVED',now())",[po,branch,vendor,general]);
 await pool.query("insert into grns(id,po_id,branch_id,received_by_id) values($1,$2,$3,$4)",[id,po,branch,actors.manager.id]);
 const saved=[];
 for(const [i,line]of spec.entries()){
  const lineId=id+'-l'+i;
  await pool.query("insert into grn_lines(id,grn_id,raw_material_id,item_description,qty_ordered,qty_received,rate_ordered) values($1,$2,$3,$4,$5,$5,'10')",[lineId,id,general?null:line.material,general?'General repair':'',line.qty]);
  saved.push({id:lineId,qtyFailed:'0'});
 }
 await pool.query("insert into audit_log(id,user_id,action,entity_type,entity_id,metadata_json) values($1,$2,'GRN_CREATED','GRN',$3,$4)",['grn-origin:'+id,actors.manager.id,id,{version:1,branchId:branch,poId:po}]);
 return {id,lines:saved};
}
const payload=(g,result='PASS',fails=g.lines.map(()=> '0'),note='')=>({result,lines:g.lines.map((l,i)=>({...l,qtyFailed:fails[i]})),note});
const post=(g,input,actor='manager',origin)=>request('POST',`/api/purchase/grns/${g.id}/quality`,input,actor,origin);
async function state(id){
 return {grn:(await pool.query('select status,quality_result,quality_note,quality_photo_url from grns where id=$1',[id])).rows,
 lines:(await pool.query('select id,qty_failed from grn_lines where grn_id=$1 order by id',[id])).rows,
 stock:(await pool.query('select id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level from inventory_stock where branch_id=$1 order by id',[a])).rows,
 audit:(await pool.query("select id,metadata_json from audit_log where entity_type='GRN' and entity_id=$1 order by id",[id])).rows};
}
async function stock(material=mat){return (await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2',[a,material])).rows;}
async function cleanup(){
 for(const table of ['audit_log','grn_lines','grns','purchase_order_lines','purchase_orders']){
  const column={audit_log:'entity_id',grn_lines:'grn_id',grns:'id',purchase_order_lines:'po_id',purchase_orders:'id'}[table];
  await pool.query(`delete from ${table} where ${column}=any($1)`,[table.startsWith('purchase_')?poIds:grnIds]);
 }
 await pool.query('delete from inventory_stock where branch_id=any($1)',[[a,b]]);
 await pool.query('delete from sessions where user_id=any($1)',[Object.values(actors).map(x=>x.id)]);
 await pool.query('delete from users where id=any($1)',[Object.values(actors).map(x=>x.id)]);
 await pool.query('delete from vendors where id=$1',[vendor]);await pool.query('delete from raw_materials where id=any($1)',[[mat,oil]]);await pool.query('delete from branches where id=any($1)',[[a,b]]);
}
async function main(){
 await pool.query("insert into branches(id,code,name,lat,lng) values($1,$1,'GRN QA A','0','0'),($2,$2,'GRN QA B','0','0')",[a,b]);
 for(const actor of Object.values(actors)){
  await pool.query("insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,$1,$2,$3,$4,'Active',$5)",[actor.id,'qa-'+actor.id,actor.role,actor.branch,actor.grants]);
  const token=crypto.randomBytes(32).toString('hex');actor.cookie='restaurant_session='+token;
  await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,'0',now()+interval '1 hour')",[crypto.createHash('sha256').update(token).digest('hex'),actor.id]);
 }
 // A random session issued only in this guarded DB must resolve in this app.
 const identity=await request('GET','/api/auth/me');assert.equal(identity.status,200);assert.equal(identity.data.user.id,actors.manager.id,'QA app bound to another DB');
 await pool.query("insert into raw_materials(id,name,unit) values($1,'GRN QA Rice','kg'),($2,'GRN QA Oil','l')",[mat,oil]);
 await pool.query("insert into vendors(id,name,phone_e164) values($1,'GRN QA Vendor',$1)",[vendor]);
 await pool.query("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand,min_stock_level,max_stock_level) values($1,$2,$3,'1.000','2.000','100.000')",[prefix+'-stock',a,mat]);
 const g=await createGrn();
 const list=await request('GET','/api/purchase/grns');const row=list.data.grns.find(r=>r.id===g.id);
 check('list returns every GRN line with IDs and string quantities',()=>{assert.equal(row.lines?.length,2);assert.equal(typeof row.lines[0].qtyReceived,'string');assert.equal(row.inventoryPosted,false);assert.equal(row.qualityRecorded,false);});
 const pass=await post(g,payload(g));
 check('PASS saves decision and all accepted stock atomically',()=>{assert.equal(pass.status,200);assert.equal(pass.data.grn.qualityResult,'PASS');assert.equal(pass.data.grn.qualityRecorded,true);assert.equal(pass.data.grn.inventoryPosted,true);assert.equal(pass.data.replayed,false);});
 check('PASS credits existing and new material rows, preserving par levels',()=>assert.equal(pass.data.grn.lines.length,2));
 assert.equal((await stock())[0].qty_on_hand,'11.000');assert.equal((await stock(oil))[0].qty_on_hand,'5.000');
 const reload=(await request('GET','/api/purchase/grns')).data.grns.find(r=>r.id===g.id);
 check('fresh GET retains durable posted marker and failed/accepted quantities',()=>{assert.equal(reload.qualityRecorded,true);assert.equal(reload.inventoryPosted,true);assert.ok(reload.qualityRecordedAt);assert.ok(reload.lines.every(l=>l.qtyFailed==='0.000'&&Number(l.qtyAccepted)>0));});
 const before=await state(g.id);const replay=await post(g,{...payload(g),lines:g.lines.slice().reverse().map(l=>({...l,qtyFailed:'0.000'}))});
 check('equivalent full replay never writes another stock credit/receipt',()=>{assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);});assert.deepEqual(await state(g.id),before);
 const conflict=await post(g,payload(g,'FAIL',['10','5'],'spoiled'));
 check('conflicting final decision returns 409 and leaves committed state intact',()=>assert.equal(conflict.status,409));assert.deepEqual(await state(g.id),before);
 const partial=await createGrn();const partialResult=await post(partial,payload(partial,'PARTIAL',['2.125','5'],'oil damaged'));
 check('PARTIAL persists every failed qty and credits only accepted quantities',()=>{assert.equal(partialResult.status,200);assert.deepEqual(partialResult.data.grn.lines.map(l=>l.qtyFailed),['2.125','5.000']);assert.deepEqual(partialResult.data.grn.lines.map(l=>l.qtyAccepted),['7.875','0.000']);});
 assert.equal((await stock())[0].qty_on_hand,'18.875');assert.equal((await stock(oil))[0].qty_on_hand,'5.000');
 const failed=await createGrn();const failedBefore=await stock();const fail=await post(failed,payload(failed,'FAIL',['10','5'],'all spoiled'));
 check('FAIL persists QUALITY_HOLD and failed lines without posting stock',()=>{assert.equal(fail.status,200);assert.equal(fail.data.grn.status,'QUALITY_HOLD');assert.equal(fail.data.grn.qualityRecorded,true);assert.equal(fail.data.grn.inventoryPosted,false);});assert.deepEqual(await stock(),failedBefore);
 const general=await createGrn({general:true});const generalBefore=await stock();const gp=await post(general,payload(general),'buyer');
 check('general PO-only quality persists but never creates material stock',()=>{assert.equal(gp.status,200);assert.equal(gp.data.grn.inventoryPosted,false);assert.equal(gp.data.grn.qualityRecorded,true);});assert.deepEqual(await stock(),generalBefore);
 const validation=await createGrn();
 for(const [label,body]of [
  ['missing line',{...payload(validation),lines:validation.lines.slice(0,1)}],
  ['foreign line',{...payload(validation),lines:[validation.lines[0],{id:g.lines[1].id,qtyFailed:'0'}]}],
  ['unknown branch override',{...payload(validation),branchId:b}],
  ['failed above received',payload(validation,'PARTIAL',['10.001','0'],'damaged')],
  ['PASS with failure',payload(validation,'PASS',['1','0'])],
  ['FAIL with accepted quantity',payload(validation,'FAIL',['9','5'],'damaged')],
  ['PARTIAL without failures',payload(validation,'PARTIAL',['0','0'],'damaged')],
  ['missing reason',payload(validation,'PARTIAL',['1','0'])],
 ]){const snap=await state(validation.id);const r=await post(validation,body);check(label+' rejected with no writes',()=>assert.equal(r.status,400));assert.deepEqual(await state(validation.id),snap);}
 for(const [label,actor,expected,origin]of [['anonymous',null,401],['inventory-only','inventory',403],['PO-only store','buyer',403],['CSRF','manager',403,'https://evil.test']]){const snap=await state(validation.id);const r=await post(validation,payload(validation),actor,origin);check(label+' denied without writes',()=>assert.equal(r.status,expected));assert.deepEqual(await state(validation.id),snap);}
 const foreign=await createGrn({branch:b});const denied=await post(foreign,payload(foreign));
 check('foreign GRN ID denied',()=>assert.equal(denied.status,403));
 const foreignList=await request('GET','/api/purchase/grns?branchId='+b);check('foreign GRN list denied',()=>assert.equal(foreignList.status,403));
 const race=await createGrn({lines:[{material:mat,qty:'0.100'},{material:mat,qty:'0.200'}]});const raceBefore=(await stock())[0].qty_on_hand;
 const equal=await Promise.all([post(race,payload(race)),post(race,payload(race))]);
 check('concurrent equivalent decisions share exactly one receipt',()=>{assert.deepEqual(equal.map(r=>r.status),[200,200]);assert.deepEqual(equal.map(r=>r.data.replayed).sort(),[false,true]);});
 assert.equal(raceBefore,'18.875');
 assert.equal((await stock())[0].qty_on_hand,'19.175');assert.equal((await state(race.id)).audit.filter(row=>row.id.startsWith('grn-quality:')).length,1);
 const competing=await createGrn();const different=await Promise.all([post(competing,payload(competing)),post(competing,payload(competing,'FAIL',['10','5'],'spoiled'))]);
 check('concurrent conflicting decisions commit one outcome only',()=>{assert.deepEqual(different.map(r=>r.status).sort(),[200,409]);});assert.equal((await state(competing.id)).audit.filter(row=>row.id.startsWith('grn-quality:')).length,1);
 const ambiguous=await createGrn();await pool.query('delete from audit_log where id=$1',['grn-origin:'+ambiguous.id]);const ambiguousBefore=await state(ambiguous.id);const ambiguousPost=await post(ambiguous,payload(ambiguous));
 check('legacy PENDING without creation marker is ambiguous and never auto-posts',()=>assert.equal(ambiguousPost.status,409));assert.deepEqual(await state(ambiguous.id),ambiguousBefore);
 const ambiguousRead=(await request('GET','/api/purchase/grns')).data.grns.find(r=>r.id===ambiguous.id);assert.equal(ambiguousRead.qualityReady,false);assert.equal(ambiguousRead.reconciliationRequired,true);
 const legacy=await createGrn();await pool.query("update grns set quality_result='PASS',status='APPROVED' where id=$1",[legacy.id]);const legacyBefore=await state(legacy.id);const legacyPost=await post(legacy,payload(legacy));
 check('legacy finalized decision without receipt requires reconciliation, never reposts',()=>assert.equal(legacyPost.status,409));assert.deepEqual(await state(legacy.id),legacyBefore);
 const legacyRead=(await request('GET','/api/purchase/grns')).data.grns.find(r=>r.id===legacy.id);assert.equal(legacyRead.qualityRecorded,false);assert.equal(legacyRead.inventoryPosted,false);
 const duplicate=await createGrn();await pool.query("insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,'1')",[prefix+'-duplicate',a,mat]);const dupBefore=await state(duplicate.id);const dup=await post(duplicate,payload(duplicate));
 check('duplicate stock rows fail closed rather than arbitrarily crediting one',()=>assert.equal(dup.status,409));assert.deepEqual(await state(duplicate.id),dupBefore);await pool.query('delete from inventory_stock where id=$1',[prefix+'-duplicate']);
 const capacity=await createGrn();await pool.query("update inventory_stock set qty_on_hand='999999999.999' where branch_id=$1 and raw_material_id=$2",[a,oil]);const capBefore=await state(capacity.id);const cap=await post(capacity,payload(capacity));
 check('later material overflow rolls back every credit and quality write',()=>assert.equal(cap.status,409));assert.deepEqual(await state(capacity.id),capBefore);await pool.query("update inventory_stock set qty_on_hand='5' where branch_id=$1 and raw_material_id=$2",[a,oil]);
 const rollback=await createGrn();const rbBefore=await state(rollback.id);
 await pool.query("create function qa_grn_audit_failure() returns trigger language plpgsql as $$ begin if NEW.action='GRN_QUALITY_RECORDED' then raise exception 'QA forced audit failure'; end if; return NEW; end $$");
 await pool.query('create trigger qa_grn_audit_failure before insert on audit_log for each row execute function qa_grn_audit_failure()');
 try{const r=await post(rollback,payload(rollback,'PARTIAL',['1','2'],'damaged'));check('receipt insertion failure rolls back all stock, line failures and GRN result',()=>assert.equal(r.status,503));assert.deepEqual(await state(rollback.id),rbBefore);}finally{await pool.query('drop trigger qa_grn_audit_failure on audit_log');await pool.query('drop function qa_grn_audit_failure()');}
 const lineRollback=await createGrn();const lineBefore=await state(lineRollback.id);
 await pool.query("create function qa_grn_line_failure() returns trigger language plpgsql as $$ begin if NEW.qty_failed>0 then raise exception 'QA forced quality-line failure'; end if; return NEW; end $$");
 await pool.query('create trigger qa_grn_line_failure before update on grn_lines for each row execute function qa_grn_line_failure()');
 try{const r=await post(lineRollback,payload(lineRollback,'PARTIAL',['1','0'],'damaged'));check('line update failure rolls back earlier inventory credits',()=>assert.equal(r.status,503));assert.deepEqual(await state(lineRollback.id),lineBefore);}finally{await pool.query('drop trigger qa_grn_line_failure on grn_lines');await pool.query('drop function qa_grn_line_failure()');}
 const replayWithoutGrant=await post(g,payload(g),'buyer');check('live INVENTORY authority required even for exact finalized replay',()=>assert.equal(replayWithoutGrant.status,403));
 const retiredBefore=await stock();const retired=await request('POST','/api/inventory/receive',{branchId:a,rawMaterialId:mat,qty:'100'});
 check('old unbound inventory receive is retired and cannot bypass quality',()=>assert.equal(retired.status,410));assert.deepEqual(await stock(),retiredBefore);
 const approvedList=(await request('GET','/api/purchase/grns?status=APPROVED')).data.grns;
 check('persisted status filtering reflects recorded quality decisions',()=>assert.ok(approvedList.some(r=>r.id===g.id)&&!approvedList.some(r=>r.id===failed.id)));
 console.log(JSON.stringify({total:checks,passed:checks,failed:0}));
}
main().then(async()=>{await cleanup();await pool.end();}).catch(async e=>{console.error(e.stack);try{await cleanup();}catch(err){console.error('Cleanup failure:',err.message);}await pool.end();process.exitCode=1;});
