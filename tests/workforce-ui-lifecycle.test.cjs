// Exercise the actual request/action hooks with deterministic hook scheduling.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function harness(requestJson, DateImpl = Date) {
  const slots = []; let cursor=0; const pending=[];
  const same = (a,b) => a && b && a.length === b.length && a.every((x,i)=>Object.is(x,b[i]));
  const react = {
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]= typeof initial==='function'?initial():initial; return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}]; },
    useRef(initial) { const i=cursor++; if (!(i in slots)) slots[i]={current:initial};return slots[i]; },
    useCallback(callback,deps) { const i=cursor++; if (!same(slots[i]?.deps,deps)) slots[i]={deps,callback}; return slots[i].callback; },
    useEffect(effect,deps) { const i=cursor++; if (!same(slots[i]?.deps,deps)) pending.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:effect()};}); },
  };
  const filename = path.join(__dirname,'../src/app/workforce/live-ui.tsx');
  const source = ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module = {exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,Intl,Date:DateImpl,Error,URLSearchParams,require:name=>name==='react'?react:name==='@/lib/current-user'?{requestJson}:name==='@/lib/i18n'?{}:name==='@/components/ui/button'?{}:require(name)},{filename});
  return {hooks:module.exports,render(fn,flush=true){cursor=0;const result=fn();if(flush)while(pending.length)pending.shift()();return result;},flush(){while(pending.length)pending.shift()();},unmount(){for (const slot of slots) slot?.cleanup?.();}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('stale branch reads and reloads cannot replace the newest resource',async()=>{
  const requests=[];const h=harness(url=>{const d=deferred();requests.push({url,...d});return d.promise;});
  let url='/branch-a';let resource=h.render(()=>h.hooks.useResource(url));
  url='/branch-b';resource=h.render(()=>h.hooks.useResource(url),false);
  assert.equal(resource.data,null); // hidden before the old effect cleanup
  h.flush(); requests[1].resolve({branch:'B'});await tick();
  requests[0].resolve({branch:'A'});await tick();
  resource=h.render(()=>h.hooks.useResource(url));assert.equal(resource.data.branch,'B');
  const first=resource.reload();const second=resource.reload();requests[3].resolve({branch:'B newest'});await second;requests[2].resolve({branch:'B stale'});await first;
  resource=h.render(()=>h.hooks.useResource(url));assert.equal(resource.data.branch,'B newest');h.unmount();
});
test('a failed finalization never emits success; synchronous double clicks submit once',async()=>{
  const h=harness(()=>Promise.resolve({}));let action=h.render(()=>h.hooks.useAction());const gate=deferred();let writes=0;
  const first=action.run(async()=>{writes++;await gate.promise;},'FINAL saved');
  const duplicate=await action.run(async()=>{writes++;},'WRONG duplicate');assert.equal(duplicate,false);assert.equal(writes,1);
  gate.reject(new Error('Missing attendance dates block payroll finalization'));assert.equal(await first,false);
  action=h.render(()=>h.hooks.useAction());assert.match(action.error,/Missing attendance/);assert.equal(action.message,'');assert.equal(action.busy,false);
  assert.equal(await action.run(async()=>{},'Saved after readback'),true);action=h.render(()=>h.hooks.useAction());assert.equal(action.message,'Saved after readback');assert.equal(action.error,'');h.unmount();
});
test('an unmounted action or read cannot update a replacement scope',async()=>{
  const gate=deferred();const h=harness(()=>gate.promise);let resource=h.render(()=>h.hooks.useResource('/old'));h.unmount();gate.resolve({secret:'old branch'});await tick();resource=h.render(()=>h.hooks.useResource('/old'));assert.equal(resource.data,null);
  const actionGate=deferred();const a=harness(()=>{});const action=a.render(()=>a.hooks.useAction());const task=action.run(()=>actionGate.promise,'Stale success');a.unmount();actionGate.resolve();assert.equal(await task,false);
});
test('business date uses Asia/Kolkata rather than the browser local calendar',()=>{
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-31T19:30:00.000Z']));}getFullYear(){return this.getUTCFullYear();}getMonth(){return this.getUTCMonth();}getDate(){return this.getUTCDate();}}
  const h=harness(()=>{},FixedDate);assert.equal(h.hooks.today(),'2026-11-01');assert.equal(h.hooks.monthNow(),'2026-11');
});
