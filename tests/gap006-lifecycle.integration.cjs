// Real HTTP/PostgreSQL acceptance; never use a shared dev or production DB.
require('dotenv').config({quiet:true});
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {Pool} = require('pg');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGPORT,'5436');
assert.match(process.env.PGDATABASE || '',/^restaurant_erp_gap006_qa_\d{8}$/);
assert.equal(process.env.GAP006_QA_DATABASE,process.env.PGDATABASE);
const target = new URL(process.env.BASE_URL);
assert.equal(target.origin,'http://127.0.0.1:5016');
const pool = new Pool({host:'127.0.0.1',port:5436,user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,ssl:false});
const prefix = 'qa-g6-'+crypto.randomUUID();
const ids = Object.fromEntries(['branch','otherBranch','owner','manager','outsider','mat','legacy','semi','central','dest'].map(n=>[n,prefix+'-'+n]));
const tokens = Object.fromEntries(['owner','manager','outsider'].map(n=>[n,crypto.randomBytes(32).toString('hex')]));
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;}
async function request(method,path,input,role='owner') {
 const headers={'content-type':'application/json',origin:target.origin};
 if(role)headers.cookie='restaurant_session='+tokens[role];
 const res=await fetch(target.origin+path,{method,headers,body:input===undefined?undefined:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
 const text=await res.text();let body;try{body=JSON.parse(text);}catch{body={error:text.slice(0,150)};}
 return {status:res.status,body};
}
function status(res,expected,label){assert.equal(res.status,expected,label+': '+JSON.stringify(res.body));checks++;return res.body;}
async function setup(){
 await pool.query('insert into branches(id,name,code,lat,lng) values($1,$2,$3,0,0),($4,$5,$6,0,0)',[ids.branch,'G6 QA',prefix+'A',ids.otherBranch,'G6 Other',prefix+'B']);
 for(const role of ['owner','manager','outsider']){
  await pool.query('insert into users(id,name,phone_e164,role,branch_id,status,module_access) values($1,$2,$3,$4,$5,\'Active\',$6)',[ids[role],'G6 '+role,'+255'+crypto.randomInt(600000000,799999999),role==='owner'?'SUPER_ADMIN':'BRANCH_MANAGER',role==='owner'?null:role==='manager'?ids.branch:ids.otherBranch,['INVENTORY','MENU_BOM','PURCHASE_INDENT','PURCHASE_ORDER']]);
  await pool.query("insert into sessions(token_hash,user_id,token_version,expires_at) values($1,$2,0,now()+interval '1 hour')",[crypto.createHash('sha256').update(tokens[role]).digest('hex'),ids[role]]);
 }
 await pool.query('insert into raw_materials(id,name,unit) values($1,$2,\'kg\'),($3,$4,\'kg\')',[ids.mat,prefix+' flour',ids.legacy,prefix+' legacy']);
 await pool.query('insert into menu_items(id,branch_id,name,price,is_semi_fg) values($1,$2,$3,1,true)',[ids.semi,ids.branch,prefix+' gravy']);
 await pool.query('insert into bom_recipes(id,branch_id,menu_item_id,raw_material_id,qty_per_unit) values($1,$2,$3,$4,1)',[crypto.randomUUID(),ids.branch,ids.semi,ids.mat]);
 await pool.query("insert into warehouses(id,type,branch_id,name) values($1,'CENTRAL',null,'G6 Central'),($2,'BRANCH',$3,'G6 Dest')",[ids.central,ids.dest,ids.branch]);
}
async function run(){
 await setup();
 // A server-issued session exercising a newly seeded scope proves app/DB binding.
 const opening = status(await request('POST','/api/inventory',{branchId:ids.branch,rawMaterialId:ids.mat,qtyOnHand:'10',minStockLevel:'0',maxStockLevel:'0'}),201,'opening stock');
 check(opening.item.rawMaterialId===ids.mat,'app is serving the intended isolated QA DB');
 const consume=await request('POST','/api/semi-fg/production',{branchId:ids.branch,menuItemId:ids.semi,quantity:'1',idempotencyKey:prefix+'-unknown'});
 status(consume,409,'unknown-expiry stock must NOT feed production');
 const list=status(await request('GET','/api/inventory/batches?branchId='+ids.branch),200,'batch list');
 check(list.batches.length===1&&list.batches[0].held===true,'unknown-expiry lot visibly held');
 const listed = list.batches[0];
 status(await request('GET','/api/inventory/batches?branchId='+ids.branch,undefined,null),401,'authentication required');
 status(await request('GET','/api/inventory/batches?branchId='+ids.branch,undefined,'outsider'),403,'foreign branch excluded');
 status(await request('POST','/api/inventory/batches/'+listed.id+'/verify',{expiryDate:'2099-01-01',evidence:'QA label observed'},'manager'),403,'only Owner can release unknown expiry');
 status(await request('POST','/api/inventory/batches/'+listed.id+'/verify',{expiryDate:'2099-02-30',evidence:'QA label observed'}),400,'impossible calendar date rejected');
 status(await request('POST','/api/inventory/batches/'+listed.id+'/verify',{expiryDate:'2099-01-01',evidence:''}),400,'release requires evidence');
 status(await request('POST','/api/inventory/batches/'+listed.id+'/verify',{expiryDate:'2099-01-01',evidence:'QA supplier label inspected'}),200,'Owner verifies expiry');
 const produce = {branchId:ids.branch,menuItemId:ids.semi,quantity:'1',idempotencyKey:prefix+'-valid'};
 status(await request('POST','/api/semi-fg/production',produce),201,'verified stock feeds production');
 status(await request('POST','/api/semi-fg/production',produce),200,'production idempotent replay');
 check((await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2',[ids.branch,ids.mat])).rows[0].qty_on_hand==='9.000','replay never double-debits');
 const concurrent=await Promise.all([1,2].map(n=>request('POST','/api/semi-fg/production',{...produce,quantity:'6',idempotencyKey:prefix+'-race-'+n})));
 check(concurrent.filter(r=>r.status===201).length===1&&concurrent.filter(r=>r.status===409).length===1,'concurrent consumption cannot oversell batches');
 // Historical stock is explicitly unbatched, not fabricated into eligible stock.
 await pool.query('insert into inventory_stock(id,branch_id,raw_material_id,qty_on_hand) values($1,$2,$3,5)',[crypto.randomUUID(),ids.branch,ids.legacy]);
 const reconPath='/api/inventory/batches/reconcile';
 const reconciliation={branchId:ids.branch,rawMaterialId:ids.legacy,evidence:'QA counted legacy stock and inspected labels',lots:[{batchNo:'legacy-dated',qty:'3',expiryDate:'2099-01-02'},{batchNo:'legacy-salt',qty:'2',nonExpiring:true}]};
 status(await request('POST',reconPath,reconciliation,'manager'),403,'legacy reconciliation Owner only');
 status(await request('POST',reconPath,{...reconciliation,lots:[{batchNo:'bad-total',qty:'6',expiryDate:'2099-01-02'}]}),409,'reconciliation rejects invented quantity');
 status(await request('POST',reconPath,reconciliation),201,'reconciliation allocates exact existing stock');
 const retryRecon=await request('POST',reconPath,reconciliation);
 check([200,409].includes(retryRecon.status),'reconciliation replay never recredits stock');
 check((await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2',[ids.branch,ids.legacy])).rows[0].qty_on_hand==='5.000','reconciliation preserves aggregate');
 // Central warehouse uses known lots, not quantity-only receipt that sheds expiry.
 const stockIn=async(qty,batchNo,expiryDate)=>request('POST','/api/warehouses/'+ids.central+'/stock-in',{rawMaterialId:ids.mat,qty,batchNo,...(expiryDate?{expiryDate}:{})});
 status(await stockIn('4','near-lot','2098-12-20'),201,'central known lot one');
 status(await stockIn('6','later-lot','2099-01-10'),201,'central known lot two');
 status(await stockIn('2','expired-lot','2020-01-01'),201,'expired physically received stock stays held');
 status(await stockIn('3','unknown-lot',null),201,'unknown central receipt stays held');
 const dispatch={fromWarehouseId:ids.central,toWarehouseId:ids.dest,rawMaterialId:ids.mat,qtyDispatched:'11'};
 status(await request('POST','/api/stock-transfers',dispatch),409,'expired/unknown stock cannot cover a central shortfall');
 const transfer=status(await request('POST','/api/stock-transfers',{...dispatch,qtyDispatched:'7'}),201,'central dispatch uses eligible FEFO lots').stockTransfer;
 const transfers=status(await request('GET','/api/stock-transfers?branchId='+ids.branch),200,'transfer list');
 const sent=transfers.stockTransfers.find(t=>t.id===transfer.id);
 check(sent.allocations.length===2,'dispatch records both actual source lots');
 const sentQty=Object.fromEntries(sent.allocations.map(a=>[a.batchNo,a.qtyDispatched]));
 check(sentQty['near-lot']==='4.000'&&sentQty['later-lot']==='3.000','FEFO draws soonest expiry first');
 status(await request('POST','/api/stock-transfers/'+transfer.id+'/receive',{qtyReceived:'6'}),400,'ambiguous multi-lot shortfall needs per-lot count');
 const allocations=sent.allocations.map(a=>({allocationId:a.id,qtyReceived:a.batchNo==='near-lot'?'3':'3'}));
 const receipt={qtyReceived:'6',allocations};
 status(await request('POST','/api/stock-transfers/'+transfer.id+'/receive',receipt),200,'receipt preserves per-lot actual quantity');
 const beforeReplay=(await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2',[ids.branch,ids.mat])).rows[0].qty_on_hand;
 status(await request('POST','/api/stock-transfers/'+transfer.id+'/receive',receipt),200,'receipt retry is idempotent');
 status(await request('POST','/api/stock-transfers/'+transfer.id+'/receive',{qtyReceived:'5',allocations:allocations.map((a,i)=>({...a,qtyReceived:i?'2':'3'}))}),409,'different receipt replay rejected');
 check((await pool.query('select qty_on_hand from inventory_stock where branch_id=$1 and raw_material_id=$2',[ids.branch,ids.mat])).rows[0].qty_on_hand===beforeReplay,'receipt replay never double-credits');
 const afterTransfer=status(await request('GET','/api/inventory/batches?branchId='+ids.branch),200,'branch batches after transfer');
 check(afterTransfer.batches.some(b=>b.batchNo==='near-lot'&&b.expiryDate==='2098-12-20'&&b.qtyRemaining==='3.000'),'first lot expiry and quantity preserved');
 check(afterTransfer.batches.some(b=>b.batchNo==='later-lot'&&b.expiryDate==='2099-01-10'&&b.qtyRemaining==='3.000'),'second lot expiry and quantity preserved');
 const central=status(await request('GET','/api/inventory/batches?warehouseId='+ids.central),200,'central exception view');
 check(central.batches.some(b=>b.batchNo==='expired-lot'&&b.expired&&b.held),'expired central lot visibly held');
 check(central.batches.some(b=>b.batchNo==='unknown-lot'&&b.expiryStatus==='UNKNOWN'&&b.held),'unknown central lot visibly held');
 status(await request('GET','/api/inventory/batches?warehouseId='+ids.central,undefined,'manager'),403,'central lots restricted to Owner');
 // Verify summary/projection reconciliation with real PostgreSQL numeric values.
 const sums=(await pool.query('select s.qty_on_hand::text, coalesce(sum(b.qty_remaining),0)::numeric(12,3)::text as batch_qty from inventory_stock s left join stock_batches b on b.branch_id=s.branch_id and b.raw_material_id=s.raw_material_id where s.branch_id=$1 group by s.id',[ids.branch])).rows;
 check(sums.every(r=>r.qty_on_hand===r.batch_qty),'every branch aggregate reconciles exactly to remaining batches');
 const wh=(await pool.query('select s.qty_on_hand::text,coalesce(sum(b.qty_remaining),0)::numeric(12,3)::text as batch_qty from warehouse_stock s left join stock_batches b on b.warehouse_id=s.warehouse_id and b.raw_material_id=s.raw_material_id where s.warehouse_id=$1 group by s.id',[ids.central])).rows;
 check(wh.every(r=>r.qty_on_hand===r.batch_qty),'central aggregate reconciles exactly to remaining batches');
 console.log(JSON.stringify({checks,passed:checks,qaDatabase:process.env.PGDATABASE}));
}
// Disposable DB owner drops it after testing. We deliberately retain failed-case
// evidence until that cleanup; no foreign-key cleanup broad enough to touch real data.
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
