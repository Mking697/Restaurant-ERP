const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { randomUUID } = require('node:crypto');
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key), values }; };
const deferred = () => { let resolve,reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve=>setImmediate(resolve));
function environment(storage = memoryStorage()) {
  const actor = {id:'test-actor',branchId:'test-branch',role:'ACCOUNTANT',moduleAccess:['ACCOUNTS_EXPENSES'],authenticated:true,ready:true};
  const sends = []; let send = async () => {throw new Error('Lost acknowledgement');}; let rows = [];
  const cache = new Map(); let current;
  const react = {...React,
    useState(initial) { const h=current,i=h.cursor++; if (!(i in h.slots)) h.slots[i]=typeof initial==='function'?initial():initial;return [h.slots[i],value=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value;}]; },
    useRef(initial) {const h=current,i=h.cursor++;if (!(i in h.slots)) h.slots[i]={current:initial};return h.slots[i];},
    useEffect(effect,deps) {const h=current,i=h.cursor++;if (!h.slots[i] || deps?.some((v,j)=>v!==h.slots[i].deps?.[j])) h.effects.push(()=>{h.slots[i]?.cleanup?.();h.slots[i]={deps,cleanup:effect()};});},
    useCallback(fn) {return fn;},
  };
  const stubs = {
    'react':react, '@/lib/current-user':{useCurrentUser:()=>actor},
    '@/lib/i18n':{useTranslation:()=>({t:en=>en})},
    '../workforce/live-ui':{Panel:()=>{},Field:()=>{},DataTable:()=>{},ActionState:()=>{},LoadState:()=>{},today:()=> '2026-10-22',monthNow:()=> '2026-10',monthEnd:()=> '2026-10-31',query:()=>'',money:x=>x,inputClass:'',
      useResource:()=>({data:{expenses:rows,totals:{}},loading:false,error:'',reload:async()=>({expenses:rows,totals:{}})}),
      useAction:()=>({busy:false,error:'',message:'',run:async operation=>{try {await operation();return true;} catch{return false;}}}),
      post:async (url,body)=>{sends.push(JSON.parse(JSON.stringify(body)));return send(url,body);}},
  };
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    let source=fs.readFileSync(filename,'utf8');if(filename.endsWith('page-content.tsx')) source+='\nexport { ExpensePanel as TestExpensePanel };';
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const requireLocal=name=>{if(stubs[name])return stubs[name];if(name==='@/lib/expense-attempt')return load(path.resolve(__dirname,'../src/lib/expense-attempt.ts'));if(name.startsWith('@/')||name.startsWith('.'))return {};return require(name);};
    vm.runInNewContext(output,{module,exports:module.exports,require:requireLocal,window:{get sessionStorage(){if(storage instanceof Error)throw storage;return storage;},confirm:()=>true},crypto:{randomUUID},console,Error,Set,Map,JSON},{filename});return module.exports;
  }
  const Panel=load(path.resolve(__dirname,'../src/app/accounts/page-content.tsx')).TestExpensePanel;
  function mount(branchId='test-branch',month='2026-10') {
    const h={cursor:0,slots:[],effects:[],tree:null};
    h.render=()=>{current=h;h.cursor=0;h.tree=Panel({branchId,month});while(h.effects.length)h.effects.shift()();return h.tree;};
    h.nodes=()=>{const all=[];const walk=x=>{if(!x)return;if(Array.isArray(x)){x.forEach(walk);return;}if(typeof x==='object'){all.push(x);walk(x.props?.children);}};walk(h.render());return all;};
    h.fill=(label,value)=>{const field=h.nodes().find(n=>n.props?.label===label);const control=field.props.children;control.props.onChange({target:{value}});};
    h.submit=()=>h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
    h.unmount=()=>{for(const s of h.slots)s?.cleanup?.();};h.render();return h;
  }
  return {mount,storage,sends,actor,setSend:fn=>send=fn,setRows:value=>rows=value};
}
function fill(panel) {panel.fill('Amount (INR)','120.00');panel.fill('Description','Synthetic fixture rent');panel.fill('Reference','QA-RENT-ONLY');}
test('uncertain POST survives expense tab unmount/remount with exact payload and key',async()=>{
  const env=environment();let panel=env.mount();fill(panel);await panel.submit();assert.equal(env.sends.length,1);
  panel.unmount();panel=env.mount();await panel.submit();assert.equal(env.sends.length,2);
  assert.deepEqual(env.sends[1],env.sends[0]);assert.ok(env.sends[0].idempotencyKey);
});
test('concurrent retry after panel remount never sends a second POST',async()=>{
  const env=environment();const gate=deferred();env.setSend(()=>gate.promise);
  let panel=env.mount();fill(panel);const first=panel.submit();panel.unmount();panel=env.mount();const second=panel.submit();await tick();
  const count=env.sends.length;gate.reject(new Error('lost ack'));await Promise.all([first,second]);assert.equal(count,1);
});
test('definite first rejection permits edits and new key; rejection after unknown retains original identity',async()=>{
  const env=environment();env.setSend(async()=>{throw Object.assign(new Error('Invalid reference'),{outcome:'rejected',status:400});});
  const panel=env.mount();fill(panel);await panel.submit();panel.fill('Reference','QA-CORRECTED');await panel.submit();
  assert.equal(env.sends[1].reference,'QA-CORRECTED');assert.notEqual(env.sends[1].idempotencyKey,env.sends[0].idempotencyKey);
  env.setSend(async()=>{throw Object.assign(new Error('timeout'),{outcome:'unknown'});});await panel.submit();
  const uncertain=env.sends.at(-1);env.setSend(async()=>{throw Object.assign(new Error('Permission changed'),{outcome:'rejected',status:403});});
  await panel.submit();panel.unmount();await env.mount().submit();assert.deepEqual(env.sends.at(-1),uncertain);
});
test('session recovery survives page reload and separates actor, branch and month journals',async()=>{
  const first=environment();let panel=first.mount();fill(panel);await panel.submit();const original=first.sends[0];panel.unmount();
  const reloaded=environment(first.storage);await reloaded.mount().submit();assert.deepEqual(reloaded.sends[0],original);
  const branch=reloaded.mount('another-test-branch');fill(branch);await branch.submit();assert.equal(reloaded.sends.at(-1).branchId,'another-test-branch');assert.notEqual(reloaded.sends.at(-1).idempotencyKey,original.idempotencyKey);
  const month=reloaded.mount('test-branch','2026-09');fill(month);await month.submit();assert.equal(reloaded.sends.at(-1).date,'2026-09-01');assert.notEqual(reloaded.sends.at(-1).idempotencyKey,original.idempotencyKey);
  reloaded.actor.id='different-test-actor';const actor=reloaded.mount();fill(actor);await actor.submit();assert.notEqual(reloaded.sends.at(-1).idempotencyKey,original.idempotencyKey);
  reloaded.actor.id='test-actor';await reloaded.mount().submit();assert.deepEqual(reloaded.sends.at(-1),original);
});
test('unavailable, corrupt or non-durable storage blocks posting rather than losing identity',async()=>{
  for(const storage of [new Error('Storage denied'),{getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}},{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},{getItem:()=>'{broken',setItem:()=>{},removeItem:()=>{}},{getItem:()=>JSON.stringify({branchId:'foreign-branch'}),setItem:()=>{},removeItem:()=>{}}]) {
    const env=environment(storage);const panel=env.mount();fill(panel);await panel.submit();assert.equal(env.sends.length,0);
  }
});
test('a malformed success stays unresolved; a returned saved expense clears replay protection',async()=>{
  const env=environment();let panel=env.mount();fill(panel);env.setSend(async()=>({}));await panel.submit();
  const original=env.sends[0];panel.unmount();panel=env.mount();env.setSend(async(url,body)=>({expense:{...body,id:'saved-test-expense',createdById:'test-actor',status:'POSTED'}}));
  await panel.submit();assert.deepEqual(env.sends[1],original);panel.fill('Reference','QA-NEXT');await panel.submit();
  assert.equal(env.sends[2].reference,'QA-NEXT');assert.notEqual(env.sends[2].idempotencyKey,original.idempotencyKey);
});
test('a remounted pending form cannot mint a new key after the original POST finishes',async()=>{
  const env=environment();const gate=deferred();env.setSend(()=>gate.promise);
  let first=env.mount();fill(first);const saving=first.submit();const original=env.sends[0];first.unmount();const replacement=env.mount();
  gate.resolve({expense:{...original,id:'saved-test-expense',createdById:'test-actor',status:'POSTED'}});await saving;
  await replacement.submit();assert.equal(env.sends.length,1);
});
test('trimmed saved text and equivalent currency spelling reconcile without changing replay payload',async()=>{
  for (const amount of ['120','120.0','120.00']) {
    const env=environment();let panel=env.mount();fill(panel);
    panel.fill('Description','  Synthetic fixture rent  ');panel.fill('Reference','  QA-RENT-ONLY  ');
    panel.fill('Subcategory','  Fixture office  ');panel.fill('Amount (INR)',amount);
    await panel.submit();const original=env.sends[0];panel.unmount();panel=env.mount();
    env.setSend(async(url,body)=>({expense:{...body,id:'saved-normalized-expense',createdById:'test-actor',status:'POSTED',
      description:body.description.trim(),reference:body.reference.trim(),subcategory:body.subcategory.trim(),amount:'120.00'}}));
    await panel.submit();assert.deepEqual(env.sends[1],original);
    assert.equal(env.storage.values.size,0,'matching normalized acknowledgment must retire the journal');
    panel.fill('Reference','QA-NEXT');await panel.submit();
    assert.equal(env.sends[2].reference,'QA-NEXT');assert.notEqual(env.sends[2].idempotencyKey,original.idempotencyKey);
  }
});
module.exports={environment,memoryStorage,deferred,tick,fill};
