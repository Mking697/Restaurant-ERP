const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const test = require('node:test');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const req = createRequire(root + '/package.json');
const ts = req('typescript');
let actor = {id:'owner', role:'SUPER_ADMIN', branchId:null, ready:true, authenticated:true, moduleAccess:[]};
let selected = 'A';
let active;
let transport = () => { throw new Error('Unexpected request'); };
const storage = new Map();
const sessionStorage = { getItem:k=>storage.get(k) ?? null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) };
const equalDeps = (a,b) => a && b && a.length===b.length && a.every((x,i)=>Object.is(x,b[i]));
const React = {
 useState(initial) { const r=active, i=r.cursor++; if (!(i in r.slots)) r.slots[i]=typeof initial==='function'?initial():initial; return [r.slots[i], value=>{ r.slots[i]=typeof value==='function'?value(r.slots[i]):value; }]; },
 useRef(initial) { const r=active,i=r.cursor++; return r.slots[i] ?? (r.slots[i]={current:initial}); },
 useCallback(fn,deps) { const r=active,i=r.cursor++; const old=r.slots[i]; if (!old || !equalDeps(old.deps,deps)) r.slots[i]={fn,deps}; return r.slots[i].fn; },
 useEffect(fn,deps) { const r=active,i=r.cursor++; const old=r.slots[i]; if (!old || !equalDeps(old.deps,deps)) { r.slots[i]={deps, cleanup:old?.cleanup}; r.effects.push(()=>{r.slots[i].cleanup?.();r.slots[i].cleanup=fn();}); } }
};
class Runner {
 slots=[]; effects=[];
 render(fn,args=[],effects=true) { this.cursor=0;active=this;const value=fn(...args);active=null;if(effects)this.flush();return value; }
 flush() { const list=this.effects.splice(0);list.forEach(fn=>fn()); }
 unmount() { this.slots.forEach(s=>s?.cleanup?.()); }
}
const jsx = (type,props,key) => ({type,props:props??{},key});
class RequestJsonError extends Error { constructor(message,outcome){super(message);this.outcome=outcome;} }
let status = {run:null,pendingHandover:null,loading:false,error:'',reload:async()=>{}};
let shiftModule;
function load(file, extra='', overrides={}) {
 let source = fs.readFileSync(root+'/'+file,'utf8');
 const code=ts.transpileModule(source+'\n'+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};
 const mocks = {
  react:React, 'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  '@/lib/current-user':{useCurrentUser:()=>actor,hasCurrentModule:()=>actor.authenticated,requestJson:(...args)=>transport(...args),RequestJsonError},
  '@/lib/i18n':{useTranslation:()=>({t:text=>text})}, '@/lib/ui-copy':{useUiCopy:()=>text=>text},
  '@/lib/current-branch':{useSelectedBranchId:()=>selected,useBranches:()=>({branches:[]})},
  '@/lib/utils':{formatInr:n=>'INR '+n},
  '@/lib/shift-gate':shiftModule && {...shiftModule,useShiftStatus:()=>status}, ...overrides
 };
 vm.runInNewContext(code,{exports,require:name=>mocks[name] ?? new Proxy({}, {get:(_,key)=>key==='__esModule'?true:String(key)}),sessionStorage,Date,Intl,Error,Number,JSON,setInterval:()=>1,clearInterval:()=>{}},{filename:file});
 return exports;
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function nodes(tree,predicate){const out=[];function walk(x){if(Array.isArray(x))return x.forEach(walk);if(!x || typeof x!=='object')return;if(predicate(x))out.push(x);walk(x.props?.children);}walk(tree);return out;}
const button=(tree,text)=>nodes(tree,x=>x.type==='Button' && JSON.stringify(x.props.children).includes(text))[0];
async function main(){
 shiftModule=load('src/lib/shift-gate.tsx');
 const h=new Runner();let pending=[];transport=()=>{const d=deferred();pending.push(d);return d.promise;};
 h.render(shiftModule.useShiftStatus,['A',true]);pending.shift().resolve({run:{id:'run-A'},pendingHandover:{id:'handover-A'}});await tick();
 let value=h.render(shiftModule.useShiftStatus,['A',true]);assert.equal(value.run.id,'run-A');const oldReload=value.reload;
 value=h.render(shiftModule.useShiftStatus,['B',true],false);assert.equal(value.run,null,'branch switch must synchronously hide former run');assert.equal(value.pendingHandover,null);assert.equal(value.loading,true);h.flush();
 await oldReload();assert.equal(pending.length,1,'stale reload must not request former branch');
 pending.shift().resolve({run:{id:'run-B'},pendingHandover:null});await tick();value=h.render(shiftModule.useShiftStatus,['B',true]);assert.equal(value.run.id,'run-B');
 const first=value.reload(),second=value.reload();const older=pending.shift(),newer=pending.shift();newer.resolve({run:{id:'newest'},pendingHandover:null});await second;older.resolve({run:{id:'stale'},pendingHandover:null});await first;value=h.render(shiftModule.useShiftStatus,['B',true]);assert.equal(value.run.id,'newest');
 actor={...actor,id:'other-owner'};value=h.render(shiftModule.useShiftStatus,['B',true]);assert.equal(value.run,null,'identity switch hides previous actor state');pending.shift().reject(new Error('read denied'));await tick();value=h.render(shiftModule.useShiftStatus,['B',true]);assert.equal(value.run,null);assert.equal(value.error,'read denied');assert.equal(value.loading,false);
 value=h.render(shiftModule.useShiftStatus,['B',false]);assert.equal(value.run,null);assert.equal(value.loading,false);const unmountedReload=value.reload;h.unmount();await unmountedReload();assert.equal(pending.length,0,'unmounted hook must not issue a stale reload');
 console.log('PASS status hook: synchronous branch/user invalidation, stale reload suppression, latest-read wins, errors fail closed, disabled scope');
 const g=new Runner();g.render(shiftModule.useShiftWriteGuard,['owner:A']);let guard=g.render(shiftModule.useShiftWriteGuard,['owner:A']);assert.equal(guard.begin('/api/shift-runs/old-run/end',{branchId:'A',note500Count:2}),true);assert.equal(guard.begin('/api/shift-runs/new-run/end',{}),false);g.unmount();
 const next=new Runner();next.render(shiftModule.useShiftWriteGuard,['owner:A']);guard=next.render(shiftModule.useShiftWriteGuard,['owner:A']);assert.equal(guard.blocked,true);assert.equal(guard.begin('/api/shift-runs/new-run/end',{}),false);assert.equal(JSON.parse(storage.get('shift-write:owner:A')).url,'/api/shift-runs/old-run/end');guard.finish();assert.equal(next.render(shiftModule.useShiftWriteGuard,['owner:A']).blocked,false);
 const bad=load('src/lib/shift-gate.tsx','',{});const original=sessionStorage.setItem;sessionStorage.setItem=()=>{throw new Error('storage denied')};const failed=new Runner();failed.render(bad.useShiftWriteGuard,['owner:C']);let failure=failed.render(bad.useShiftWriteGuard,['owner:C']);assert.equal(failure.begin('/write',{}),false);sessionStorage.setItem=original;
 console.log('PASS write journal: exact original run/payload retained, concurrent/replacement writes blocked across remount, acknowledged finish unlocks, storage failure blocks dispatch');
 const gateProps={branchId:'B',pendingHandover:null,onAccepted:async()=>{},children:'SECRET OPERATIONS',loading:true};
 const outer=new Runner();const content=outer.render(shiftModule.ShiftHandoverGate,[gateProps]);const inner=new Runner();let tree=inner.render(content.type,[content.props]);assert(!JSON.stringify(tree).includes('SECRET OPERATIONS'));assert(JSON.stringify(tree).includes('Checking shift status'));
 tree=inner.render(content.type,[{...content.props,loading:false,error:'Status unavailable'}]);assert(!JSON.stringify(tree).includes('SECRET OPERATIONS'));assert(JSON.stringify(tree).includes('Status unavailable'));
 console.log('PASS gate: loading and read failure hide operational children');
 const cash=load('src/app/cash-drop/page-content.tsx','export { ScopedCashDrop };');
 const cr=new Runner();status={run:{id:'old-run',label:'Old Shift'},pendingHandover:null,loading:false,error:'',reload:async()=>{status={...status,run:{id:'new-run',label:'New Shift'},pendingHandover:{id:'pending',cashAmount:'0',cardAmount:'0',upiAmount:'0',otherAmount:'0'}};}};
 cr.render(cash.ScopedCashDrop);tree=cr.render(cash.ScopedCashDrop);const success={handover:{id:'saved',cashAmount:'0',cardAmount:'0',upiAmount:'0',otherAmount:'0'},toRun:{label:'New Shift'},cashExpected:'0',shortageExcessInr:'0'};transport=async()=>success;await button(tree,'End Shift & Handover').props.onClick();tree=cr.render(cash.ScopedCashDrop);assert(JSON.stringify(tree).includes('Shift ended — handed over to'));const gateNode=nodes(tree,x=>x.type===shiftModule.ShiftHandoverGate)[0];assert(gateNode);assert(!JSON.stringify(gateNode.props.children).includes('Shift ended — handed over to'),'success result must be outside acceptance gate');
 console.log('PASS cash close: acknowledged result remains outside pending-acceptance gate');
 status={...status,pendingHandover:null,run:{id:'unknown-run',label:'Unknown Shift'}};storage.clear();const uncertain=new Runner();uncertain.render(cash.ScopedCashDrop);tree=uncertain.render(cash.ScopedCashDrop);let writes=0;transport=async()=>{writes++;throw new RequestJsonError('lost acknowledgment','unknown')};await button(tree,'End Shift & Handover').props.onClick();status={...status,run:{id:'next-after-unknown',label:'Next Shift'}};tree=uncertain.render(cash.ScopedCashDrop);tree=uncertain.render(cash.ScopedCashDrop);assert.equal(button(tree,'End Shift & Handover').props.disabled,true);await button(tree,'End Shift & Handover').props.onClick();assert.equal(writes,1);assert.equal(JSON.parse(storage.get('shift-write:other-owner:A')).url,'/api/shift-runs/unknown-run/end');
 console.log('PASS unknown cash close: refreshing to a different run cannot resubmit the count');
 const cashWrap=new Runner();selected='A';const a=cashWrap.render(cash.default);selected='B';const b=cashWrap.render(cash.default);assert.notEqual(a.key,b.key,'branch switch remounts count/result state');actor={...actor,id:'third-owner'};const c=cashWrap.render(cash.default);assert.notEqual(b.key,c.key,'actor switch remounts count/result state');
 console.log('PASS cash page: branch/user-scoped form and result lifetime');
 const pos=load('src/app/pos/page-content.tsx','export { ScopedPos };');status={...status,loading:true,pendingHandover:null,error:''};transport=async(url)=>url.includes('menu-items')?{menuItems:[{id:'dish',isSellable:true,isActive:true}]}:url.includes('currency')?{currencyRates:[]}:{orders:[],visibilityScope:'actual',salesSummary:{actualTotal:'0.00',visibleTotal:'0.00',privateTotal:'0.00'}};const pr=new Runner();pr.render(pos.ScopedPos);await tick();tree=pr.render(pos.ScopedPos);assert.equal(button(tree,'New Order').props.disabled,true);status={...status,loading:false,error:'Unreadable shift'};tree=pr.render(pos.ScopedPos);assert.equal(button(tree,'New Order').props.disabled,true);status={...status,error:'',pendingHandover:{id:'pending'}};tree=pr.render(pos.ScopedPos);assert.equal(button(tree,'New Order').props.disabled,true);status={...status,pendingHandover:null};tree=pr.render(pos.ScopedPos);assert.equal(button(tree,'New Order').props.disabled,false);const dialog=nodes(tree,x=>x.type==='Dialog' && x.props.open===false).find(x=>JSON.stringify(x.props.children).includes('New Order'));dialog.props.onOpenChange(true);tree=pr.render(pos.ScopedPos);assert(nodes(tree,x=>x.type==='Dialog' && x.props.open===true).length);status={...status,loading:true};tree=pr.render(pos.ScopedPos);assert(!nodes(tree,x=>x.type==='Dialog' && x.props.open===true).length);
 console.log('PASS POS: New Order blocked while loading/error/pending acceptance; open dialog hidden when gate closes');
 const settings=load('src/app/admin/settings/shifts/page-content.tsx','export { ShiftReminder, ScopedShiftsSettings };');
 const reminder=new Runner();let reminderTree=reminder.render(settings.ShiftReminder,[{run:{startedAt:'2026-10-27T18:00:00+05:30'},definition:{endTime:'06:00'}}]);
 assert(JSON.stringify(reminderTree).includes(new Date('2026-10-28T06:00:00+05:30').toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})));
 reminderTree=reminder.render(settings.ShiftReminder,[{run:{startedAt:'2026-10-27T08:00:00+05:30'},definition:{endTime:'08:00'}}]);
 assert(JSON.stringify(reminderTree).includes(new Date('2026-10-28T08:00:00+05:30').toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})));
 reminderTree=reminder.render(settings.ShiftReminder,[{run:{startedAt:'2026-10-27T08:00:00+05:30'}}]);assert(JSON.stringify(reminderTree).includes('no scheduled due time is shown'));
 console.log('PASS reminders: IST overnight and full-day boundary; no guessed deadline after definition replacement');
 const settingsWrap=new Runner();selected='A';const settingsA=settingsWrap.render(settings.default);selected='B';const settingsB=settingsWrap.render(settings.default);assert.notEqual(settingsA.key,settingsB.key);
 const settingRunner=new Runner();transport=async()=>{throw new Error('definitions unavailable')};settingRunner.render(settings.ScopedShiftsSettings);await tick();tree=settingRunner.render(settings.ScopedShiftsSettings);assert(JSON.stringify(tree).includes('definitions unavailable'));assert(!button(tree,'Start Shift'));assert.equal(nodes(tree,x=>x.type==='fieldset')[0].props.disabled,true);
 console.log('PASS settings: scoped editor lifetime; read error never shows no-active-run/start action and disables editing');
 console.log('ALL SHIFT UI REGRESSION CHECKS PASSED');
}
test('shift UI isolates scoped reads, blocks uncertain writes and gates operational controls', main);
