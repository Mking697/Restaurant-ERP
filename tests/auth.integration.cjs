// Real HTTP + dedicated local Postgres acceptance. Leaves no QA fixtures behind.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, filename);
require('dotenv').config({quiet:true});
const {Pool} = require('pg');
const {randomUUID,randomBytes} = require('node:crypto');
const assert = require('node:assert/strict');
const {hashPassword} = require('../src/lib/server/password.ts');
const target = new URL(process.env.BASE_URL || 'http://localhost:3000');
assert.ok(['localhost','127.0.0.1'].includes(target.hostname) && target.protocol === 'http:' && target.pathname === '/' && !target.username && !target.password && !target.search && !target.hash, 'Only plain loopback HTTP allowed');
assert.equal(process.env.PGHOST,'127.0.0.1'); assert.equal(process.env.PGPORT,'5436');
assert.match(process.env.PGDATABASE || '', /^(restaurant_erp_local|restaurant_erp_workforce_qa_\d{8})$/);
const pool = new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT),user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,ssl:false});
const origin = target.origin;
const run = randomUUID();
const fixtureIds = [], branchIds = [], materialIds = [];
let count=0;
function passed(name){count++; console.log('PASS '+name);}
async function request(path, cookie='', method='GET', input, expected=200){
 const response=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}: {})},...(input===undefined?{}:{body:JSON.stringify(input)})});
 const data=await response.json();
 assert.equal(response.status,expected,path+': '+JSON.stringify(data));
 return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie};
}
async function login(user,password){return (await request('/api/auth/login','','POST',{phoneE164:user.phoneE164,password})).cookie;}
(async()=>{
 const ownerId=randomUUID(), pass=randomBytes(24).toString('hex'); fixtureIds.push(ownerId);
 const phone='+918'+String(Date.now()).slice(-9);
 try {
  await pool.query('insert into users (id,name,phone_e164,role,password_hash,module_access) values ($1,$2,$3,$4,$5,$6)',[ownerId,'QA Owner '+run,phone,'SUPER_ADMIN',await hashPassword(pass),[]]);
  const owner=await login({phoneE164:phone.slice(3)},pass); passed('ten-digit login resolves existing +91 account and issues session cookie');
  await request('/api/auth/me','', 'GET',undefined,401); passed('anonymous me denied');
  const a=(await request('/api/branches',owner,'POST',{name:'QA A '+run,code:'QA-A-'+run.slice(0,12)} ,201)).data.branch; branchIds.push(a.id);
  const b=(await request('/api/branches',owner,'POST',{name:'QA B '+run,code:'QA-B-'+run.slice(0,12)},201)).data.branch; branchIds.push(b.id);
  passed('owner creates two persisted branches');
  let phoneCounter=0;
  async function createUser(role,branchId,grants,cookie=owner){
   const user=(await request('/api/users',cookie,'POST',{name:'QA '+role+' '+run,phoneE164:'+917'+String(Date.now()+phoneCounter++).slice(-9),password:pass,role,branchId,moduleAccess:grants},201)).data.user;
   fixtureIds.push(user.id);return user;
  }
  const manager=await createUser('BRANCH_MANAGER',a.id,['INVENTORY','TASKS_RECURRING']);
  const other=await createUser('BRANCH_MANAGER',b.id,['INVENTORY']);
  const staff=await createUser('CASHIER',a.id,['POS_CASHIER']);
  const mc=await login(manager,pass), oc=await login(other,pass), sc=await login(staff,pass);
  const ownBranches=(await request('/api/branches',mc)).data.branches; assert.deepEqual(ownBranches.map(x=>x.id),[a.id]);
  await request('/api/branches?branchId='+b.id,mc,'GET',undefined,403);passed('branch admin sees only own branch; foreign branch request denied');
  const child=await createUser('KITCHEN_STAFF',a.id,['INVENTORY'],mc); passed('branch admin creates own-branch user with held grant');
  const invalid={name:'QA forbidden',phoneE164:'+916'+String(Date.now()).slice(-9),password:pass,role:'CASHIER',branchId:b.id,moduleAccess:[]};
  await request('/api/users',mc,'POST',invalid,403);
  await request('/api/users',mc,'POST',{...invalid,branchId:a.id,moduleAccess:['REPORTS']},403);
  await request('/api/users',mc,'POST',{...invalid,role:'SUPER_ADMIN',branchId:null},403);
  await request('/api/users/'+manager.id,mc,'PATCH',{moduleAccess:['REPORTS']},403);
  passed('cross-branch creation, unheld grants, HQ escalation and self escalation denied');
  await request('/api/users/'+other.id,mc,'GET',undefined,404);
  await request('/api/users',sc,'GET',undefined,403); passed('foreign user and ordinary user administration denied');
  async function addItem(cookie,branchId,qty){const item=(await request('/api/inventory',cookie,'POST',{branchId,name:'QA Ingredient '+run,unit:'kg',qtyOnHand:qty,minStockLevel:'5',maxStockLevel:'50'},201)).data.item;materialIds.push(item.rawMaterialId);return item;}
  const ai=await addItem(mc,a.id,'12'),bi=await addItem(oc,b.id,'33'); assert.equal(ai.rawMaterialId,bi.rawMaterialId);
  const own=(await request('/api/inventory',mc)).data.inventory;assert.equal(own.length,1);assert.equal(own[0].branchId,a.id);assert.equal(Number(own[0].qtyOnHand),12);
  const theirs=(await request('/api/inventory',oc)).data.inventory;assert.equal(theirs.length,1);assert.equal(Number(theirs[0].qtyOnHand),33);
  passed('same item catalog has separate persisted stock per branch');
  await request('/api/inventory?branchId='+b.id,mc,'GET',undefined,403);
  await request('/api/inventory',mc,'POST',{branchId:b.id,name:'Nope',unit:'kg'},403);
  await request('/api/inventory',sc,'GET',undefined,403);passed('inventory foreign reads/writes and missing grant denied');
  const all=(await request('/api/inventory',owner)).data.inventory;assert.ok(all.some(x=>x.id===ai.id));assert.ok(all.some(x=>x.id===bi.id));passed('owner compiled inventory includes both branches');
  const childCookie=await login(child,pass); await request('/api/inventory',childCookie);
  await request('/api/users/'+child.id,mc,'PATCH',{moduleAccess:[]});
  await request('/api/auth/me',childCookie,'GET',undefined,401);passed('permission change revokes already issued session');
  const reissued=await login(child,pass);await request('/api/inventory',reissued,'GET',undefined,403);passed('new login enforces revoked grant');
  const badOrigin=await fetch(origin+'/api/branches',{method:'POST',headers:{cookie:owner,origin:'http://evil.test','content-type':'application/json'},body:JSON.stringify({name:'Nope',code:'Nope'})});assert.equal(badOrigin.status,403);passed('authenticated cross-origin mutation denied');
  await request('/api/auth/logout',mc,'POST',{}); await request('/api/auth/me',mc,'GET',undefined,401);passed('logout revokes server session');
  await request('/api/admin/settings/whatsapp',sc,'GET',undefined,403);
  await request('/api/admin/settings/whatsapp','', 'GET',undefined,401);passed('WhatsApp global settings owner-only');
  const page=await fetch(origin+'/inventory',{redirect:'manual'});assert.equal(page.status,307);assert.ok(page.headers.get('location').includes('/login'));passed('anonymous direct page URL redirected');
  const forbiddenPage=await fetch(origin+'/admin/users',{headers:{cookie:sc}});const forbiddenHTML=await forbiddenPage.text();assert.ok(forbiddenHTML.includes('Access denied'));assert.ok(!forbiddenHTML.includes('QA Owner '+run));passed('direct forbidden page does not render user table');
  const ownerDTO=(await request('/api/auth/me',owner)).data.user;assert.equal('passwordHash' in ownerDTO,false);assert.equal('tokenVersion' in ownerDTO,false);passed('HTTP identity DTO has no credential material');
  console.log('RESULT '+count+' real integration checks passed');
 } finally {
  await pool.query('delete from sessions where user_id = any($1::text[])',[fixtureIds]);
  await pool.query('delete from inventory_stock where branch_id = any($1::text[])',[branchIds]);
  await pool.query('delete from users where id = any($1::text[])',[fixtureIds]);
  await pool.query('delete from branches where id = any($1::text[])',[branchIds]);
  await pool.query('delete from raw_materials where id = any($1::text[]) and name=$2',[[...new Set(materialIds)],'QA Ingredient '+run]);
  await pool.end(); console.log('QA fixtures cleaned');
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
