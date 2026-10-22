const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const branding = require('../src/lib/server/branding-input.ts');
const vm = require('node:vm');
const path = require('node:path');
function load(file, overrides = {}) {
 const filename=path.resolve(__dirname,'..',file), mod={exports:{}};
 const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(output,{module:mod,exports:mod.exports,require:name=>name in overrides?overrides[name]:require(name.startsWith('.')?path.resolve(path.dirname(filename),name):name),Buffer,Request,Response,Uint8Array,console,process});
 return mod.exports;
}
test('body budget remains 16KB by default; only opted-in branding requests allow upload payloads', async()=>{
 const {body}=require('../src/lib/server/http.ts');
 const request=()=>new Request('http://localhost/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:'x'.repeat(20000)})});
 await assert.rejects(()=>body(request()),e=>e.status===413);
 assert.equal((await body(request(),branding.BRANDING_BODY_BYTES)).data.length,20000);
 await assert.rejects(()=>body(new Request('http://localhost/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:'x'.repeat(branding.BRANDING_BODY_BYTES)})}),branding.BRANDING_BODY_BYTES),e=>e.status===413);
});
test('setup rejects invalid branding before entering the locked transaction',async()=>{
 let locks=0;
 const permissions=require('../src/lib/server/permissions.ts');
 const route=load('src/app/api/setup/route.ts',{
  '@/lib/server/branding-input':branding,'@/lib/server/branding':{saveBranding:()=>{throw new Error('must not write');}},
  '@/db/client':{db:{}},'@/db/schema/auth':{users:{}},'@/lib/moduleAccess':{MODULE_KEYS:[]},
  '@/lib/server/auth':{locked:async()=>{locks++;},issueSession:()=>{},setSession:()=>{}},
  '@/lib/server/http':require('../src/lib/server/http.ts'),'@/lib/server/permissions':permissions,
  '@/lib/server/password':require('../src/lib/server/password.ts')
 });
 const request=new Request('http://localhost/api/setup',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({restaurantName:'QA',logo:{type:'image/png',data:'bad'},name:'Owner',phoneE164:'9876501234',password:'qa-password-12345'})});
 const response=await route.POST(request); assert.equal(response.status,400); assert.equal(locks,0);
});
test('public DB read queries only the two branding keys and selects key/value columns',async()=>{
 let selected,keys;
 const executor={select:columns=>{selected=columns;return {from:()=>({where:async condition=>{keys=condition;return [{key:'RESTAURANT_NAME',value:'Cafe'}];}})}}};
 const server=load('src/lib/server/branding.ts',{'drizzle-orm':{inArray:(_column,values)=>values},'@/db/client':{db:executor},'@/db/schema/settings':{settings:{key:'key',value:'value'}},'@/lib/branding':require('../src/lib/branding.ts')});
 assert.equal((await server.readBranding()).name,'Cafe');
 assert.deepEqual(Array.from(keys),['RESTAURANT_NAME','RESTAURANT_LOGO']); assert.deepEqual(Object.keys(selected).sort(),['key','value']);
});
test('mutation checks Owner again inside the lock, not only before parsing',async()=>{
 const permissions=require('../src/lib/server/permissions.ts'); let writes=0;
 const route=load('src/app/api/admin/settings/restaurant/route.ts',{
  '@/lib/server/http':require('../src/lib/server/http.ts'),'@/lib/server/permissions':permissions,
  '@/lib/server/branding-input':branding,
  '@/lib/server/branding':{saveBranding:async()=>{writes++;},readBranding:async()=>({name:'Cafe',logoUrl:null})},
  '@/lib/server/auth':{requireIdentity:async()=>({role:'SUPER_ADMIN'}),mutate:async(_request,action)=>action({}, {role:'BRANCH_MANAGER'})}
 });
 const response=await route.POST(new Request('http://localhost/api/admin/settings/restaurant',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({restaurantName:'Cafe'})}));
 assert.equal(response.status,403); assert.equal(writes,0);
});
test('branding SSR provider keeps independent request brands and omits the old subtitle',()=>{
 const React=require('react'); const {renderToString}=require('react-dom/server');
 const {BrandingProvider,RestaurantBrand}=load('src/components/branding-provider.tsx');
 const render=name=>renderToString(React.createElement(BrandingProvider,{initial:{name,logoUrl:'/api/branding/logo?v=abc'}},React.createElement(RestaurantBrand)));
 assert.match(render('Cafe One'),/Cafe One/); assert.doesNotMatch(render('Cafe Two'),/Cafe One|ERP \+ WhatsApp/);
});
test('rejects invalid, mismatched, oversized, animated and excessive-pixel content', async () => {
 const png = await sharp({create:{width:4,height:4,channels:3,background:'#fff'}}).png().toBuffer();
 const huge = await sharp({create:{width:2001,height:2000,channels:3,background:'#fff'}}).png().toBuffer();
 const animated = Buffer.concat([png.subarray(0,33),Buffer.from([0,0,0,8]),Buffer.from('acTL'),Buffer.alloc(12),png.subarray(33)]);
 for (const value of [null,{}, {type:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')},{type:'image/jpeg',data:png.toString('base64')},{type:'image/png',data:'a==='},{type:'image/png',data:Buffer.alloc(1048577).toString('base64')},{type:'image/png',data:huge.toString('base64')},{type:'image/png',data:animated.toString('base64')},{type:'image/png',data:png.subarray(0,40).toString('base64')}]) await assert.rejects(()=>branding.normalizeLogo(value));
});
test('name and edit semantics are strict and setup defaults to no logo', async () => {
 assert.deepEqual(await branding.brandingInput({restaurantName:' Cafe '}),{name:'Cafe',logo:undefined});
 assert.deepEqual(await branding.brandingInput({restaurantName:'Cafe'},true),{name:'Cafe',logo:''});
 assert.deepEqual(await branding.brandingInput({restaurantName:'Cafe',logo:null}),{name:'Cafe',logo:''});
 for (const value of ['',null,'a'.repeat(101),'a\u0000b']) assert.throws(()=>branding.restaurantName(value));
});
test('public branding DTO is allowlisted and hashes logo bytes', () => {
 const {publicBranding} = require('../src/lib/branding.ts');
 const dto=publicBranding({RESTAURANT_NAME:'Cafe',RESTAURANT_LOGO:'aGVsbG8=',CHATXFLOW_API_TOKEN:'secret'});
 assert.deepEqual(Object.keys(dto).sort(),['logoUrl','name']); assert.equal(dto.name,'Cafe'); assert.match(dto.logoUrl,/^\/api\/branding\/logo\?v=[a-f0-9]{64}$/); assert.ok(!JSON.stringify(dto).includes('secret'));
 assert.deepEqual(publicBranding({}),{name:'Restaurant',logoUrl:null});
});
test('branding route is Owner-only, including nested paths; persisted page',()=>{
 const {canOpenPath,isPersistedPath}=require('../src/lib/server/page-access.ts');
 for(const role of ['BRANCH_MANAGER','CASHIER','CENTRAL_STORE_MGR']) assert.equal(canOpenPath({role,moduleAccess:['WHATSAPP_LOGS','USER_ADMIN']},'/admin/settings/restaurant'),false);
 assert.equal(canOpenPath({role:'SUPER_ADMIN',moduleAccess:[]},'/admin/settings/restaurant'),true);
 assert.equal(canOpenPath({role:'BRANCH_MANAGER',moduleAccess:[]},'/admin/settings/restaurant/nested'),false);
 assert.equal(isPersistedPath('/admin/settings/restaurant'),true);
});
test('normalizes a JPEG upload to a compact metadata-free PNG', async () => {
 const source = await sharp({create:{width:600,height:400,channels:3,background:'#f80'}}).jpeg().withMetadata().toBuffer();
 const result = await branding.normalizeLogo({type:'image/jpeg',data:source.toString('base64')});
 const png = Buffer.from(result,'base64'); const meta = await sharp(png).metadata();
 assert.equal(meta.format,'png'); assert.ok(meta.width<=256 && meta.height<=256); assert.ok(png.length<=131072); assert.equal(meta.exif,undefined);
});
