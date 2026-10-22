// Standalone real HTTP/Postgres acceptance. Start an app using the SAME isolated DB:
// PGDATABASE=restaurant_erp_branding_qa_20261022 APP_ORIGIN=http://localhost:3020 npm run dev -- -p 3020
// Then BASE_URL=http://localhost:3020 PGDATABASE=restaurant_erp_branding_qa_20261022 node tests/branding.integration.cjs
// PG* must be supplied (or loaded from local .env). Never permits production/ordinary local DB.
require('dotenv').config({quiet:true});
const {Pool}=require('pg');
const {randomUUID,randomBytes}=require('node:crypto');
const sharp=require('sharp');
const assert=require('node:assert/strict');
const fs=require('node:fs'), ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {hashPassword}=require('../src/lib/server/password.ts');
async function main(){
 const target=new URL(process.env.BASE_URL || 'http://localhost:3020');
 assert.ok(['localhost','127.0.0.1'].includes(target.hostname) && target.protocol==='http:' && !target.username && !target.password && target.pathname==='/' && !target.search && !target.hash,'BASE_URL must be plain loopback HTTP');
 assert.ok(['localhost','127.0.0.1'].includes(process.env.PGHOST),'Only loopback PGHOST allowed');
 assert.equal(process.env.PGPORT,'5436');
 assert.match(process.env.PGDATABASE||'',/^(restaurant_erp_branding_qa(?:_[a-zA-Z0-9]+)*|restaurant_erp_workforce_qa_\d{8})$/);
 const pool=new Pool({host:process.env.PGHOST,port:5436,user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,ssl:false});
 const origin=target.origin, run=randomUUID(), password=randomBytes(24).toString('hex');
 const ids=[],branches=[]; let acquired=false, constraint=false, count=0;
 const pass=name=>{count++;console.log('PASS '+name);};
 async function request(path,cookie='',method='GET',input,expected=200,originHeader=origin){
  const r=await fetch(origin+path,{method,redirect:'manual',headers:{origin:originHeader,'content-type':'application/json',...(cookie?{cookie}: {})},...(input===undefined?{}:{body:JSON.stringify(input)})});
  const data=await r.json(); assert.equal(r.status,expected,path+': '+JSON.stringify(data));
  return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};
 }
 try {
  assert.equal((await pool.query('select count(*)::int n from users')).rows[0].n,0,'Requires a fresh QA DB: no existing users');
  assert.equal((await pool.query('select count(*)::int n from settings')).rows[0].n,0,'Requires empty settings; never overwrites existing configuration');
  acquired=true;
  // Bind the HTTP app to this exact guarded DB before any bootstrap HTTP write.
  await pool.query('insert into settings(key,value) values ($1,$2)',['RESTAURANT_NAME',run]);
  assert.equal((await request('/api/branding')).data.name,run,'HTTP app must use the same QA database');
  await pool.query('delete from settings where key=$1',['RESTAURANT_NAME']);
  const logo=await sharp({create:{width:480,height:320,channels:3,background:'#219653'}}).jpeg().toBuffer();
  const input={restaurantName:'QA Cafe '+run,name:'QA Owner',phoneE164:'9876501234',password,logo:{type:'image/jpeg',data:logo.toString('base64')}};
  await request('/api/setup','','POST',{...input,logo:{type:'image/png',data:'bad'}},400);
  assert.equal((await pool.query('select count(*)::int n from users')).rows[0].n,0);
  assert.equal((await pool.query('select count(*)::int n from sessions')).rows[0].n,0);
  assert.equal((await pool.query('select count(*)::int n from settings')).rows[0].n,0); pass('invalid logo setup leaves no Owner, session or branding');
  // Real DB failure AFTER Owner/name inserts must roll all bootstrap writes back.
  await pool.query("alter table settings add constraint branding_qa_forced_failure check (key <> 'RESTAURANT_LOGO')"); constraint=true;
  await request('/api/setup','','POST',input,503);
  assert.equal((await pool.query('select count(*)::int n from users')).rows[0].n,0);
  assert.equal((await pool.query('select count(*)::int n from settings')).rows[0].n,0);
  assert.equal((await pool.query('select count(*)::int n from sessions')).rows[0].n,0);
  await pool.query('alter table settings drop constraint branding_qa_forced_failure'); constraint=false; pass('database branding failure rolls back Owner + session + settings');
  const created=await request('/api/setup','','POST',input,201); const owner=created.cookie; ids.push(created.data.user.id);
  assert.equal((await request('/api/setup')).data.setupRequired,false);
  await request('/api/auth/me',owner); pass('first Owner + normalized logo + session bootstrap');
  const dto=(await request('/api/branding')).data;
  assert.deepEqual(Object.keys(dto).sort(),['logoUrl','name']); assert.equal(dto.name,input.restaurantName);
  const stored=(await pool.query("select key,value from settings where key in ('RESTAURANT_NAME','RESTAURANT_LOGO')")).rows;
  assert.equal(stored.length,2); const png=Buffer.from(stored.find(x=>x.key==='RESTAURANT_LOGO').value,'base64');
  const metadata=await sharp(png).metadata(); assert.equal(metadata.format,'png'); assert.ok(metadata.width<=256 && metadata.height<=256); assert.ok(png.length<=131072);
  const image=await fetch(origin+dto.logoUrl); assert.equal(image.headers.get('content-type'),'image/png'); assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  const login=await (await fetch(origin+'/login')).text(); assert.ok(login.includes(input.restaurantName)); assert.ok(login.includes(dto.logoUrl.replaceAll('&','&amp;'))); assert.ok(login.includes('<title>'+input.restaurantName+'</title>')); pass('DB reload, public logo bytes, SSR title and favicon match');
  await pool.query('insert into settings(key,value) values ($1,$2)',['CHATXFLOW_API_TOKEN','QA_SENTINEL_'+run]);
  assert.ok(!JSON.stringify((await request('/api/branding')).data).includes('QA_SENTINEL')); pass('public DTO never returns provider token');
  await request('/api/admin/settings/restaurant','','POST',{restaurantName:'No'},401);
  await request('/api/admin/settings/restaurant',owner,'POST',{restaurantName:'No'},403,'http://evil.test');
  const anon=await fetch(origin+'/admin/settings/restaurant',{redirect:'manual'}); assert.equal(anon.status,307);
  const branchId=randomUUID(),managerId=randomUUID(); branches.push(branchId); ids.push(managerId);
  await pool.query('insert into branches(id,name,code,lat,lng) values ($1,$2,$3,0,0)',[branchId,'QA Branch','QA-'+run]);
  await pool.query('insert into users(id,name,phone_e164,role,branch_id,password_hash,module_access) values($1,$2,$3,$4,$5,$6,$7)',[managerId,'QA Manager','+919876501235','BRANCH_MANAGER',branchId,await hashPassword(password),['USER_ADMIN','WHATSAPP_LOGS']]);
  const manager=(await request('/api/auth/login','','POST',{phoneE164:'9876501235',password})).cookie;
  await request('/api/admin/settings/restaurant',manager,'GET',undefined,403);
  await request('/api/admin/settings/restaurant',manager,'POST',{restaurantName:'No'},403);
  const denied=await (await fetch(origin+'/admin/settings/restaurant',{headers:{cookie:manager}})).text(); assert.ok(denied.includes('Access denied')); assert.ok(!denied.includes('Save restaurant')); pass('anonymous, branch manager, direct page and CSRF writes denied');
  const nextLogo=await sharp({create:{width:50,height:50,channels:3,background:'#08f'}}).webp().toBuffer();
  const changed=(await request('/api/admin/settings/restaurant',owner,'POST',{restaurantName:'Changed QA Cafe',logo:{type:'image/webp',data:nextLogo.toString('base64')}})).data;
  assert.notEqual(changed.logoUrl,dto.logoUrl); assert.equal((await request('/api/branding')).data.name,'Changed QA Cafe');
  const page=await (await fetch(origin+'/login')).text(); assert.ok(page.includes('Changed QA Cafe')); assert.ok(page.includes(changed.logoUrl));
  assert.equal((await pool.query('select value from settings where key=$1',['RESTAURANT_NAME'])).rows[0].value,'Changed QA Cafe'); pass('Owner edit persists, public reload and favicon hash change');
  await request('/api/admin/settings/restaurant',owner,'POST',{restaurantName:'Changed QA Cafe',logo:{type:'image/png',data:'bad'}},400);
  assert.deepEqual((await request('/api/branding')).data,changed);
  await request('/api/setup','','POST',input,409); assert.equal((await request('/api/branding')).data.name,'Changed QA Cafe'); pass('invalid update and repeated setup preserve branding');
  await request('/api/admin/settings/restaurant',owner,'POST',{restaurantName:'Changed QA Cafe',logo:null});
  assert.equal((await request('/api/branding')).data.logoUrl,null);
  const fallback=await fetch(origin+'/api/branding/logo?v=default'); assert.equal(fallback.headers.get('content-type'),'image/svg+xml'); pass('Owner logo removal uses safe generic fallback');
  console.log('RESULT '+count+' real branding integration checks passed');
 } finally {
  if(acquired){
   if(constraint) await pool.query('alter table settings drop constraint if exists branding_qa_forced_failure');
   // This script admitted only an empty, dedicated QA DB; also cleans partial bootstrap.
   await pool.query('delete from sessions where user_id in (select id from users where phone_e164 in ($1,$2))',['+919876501234','+919876501235']);
   await pool.query('delete from users where phone_e164 in ($1,$2)',['+919876501234','+919876501235']);
   await pool.query('delete from branches where id=any($1::text[])',[branches]);
   await pool.query('delete from settings where key=any($1::text[])',[['RESTAURANT_NAME','RESTAURANT_LOGO','CHATXFLOW_API_TOKEN']]);
  }
  await pool.end();
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
