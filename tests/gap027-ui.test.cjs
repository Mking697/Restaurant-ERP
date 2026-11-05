const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test'),ts=require('typescript'),path=require('node:path');
let active,transport,actor; const jsx=(type,props,key)=>({type,props:props??{},key});
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
const React={useState(v){const r=active,i=r.cursor++;if(!(i in r.slots))r.slots[i]=typeof v==='function'?v():v;return[r.slots[i],v=>r.slots[i]=typeof v==='function'?v(r.slots[i]):v];},useRef(v){const r=active,i=r.cursor++;return r.slots[i]??(r.slots[i]={current:v});},useCallback(fn,deps){const r=active,i=r.cursor++;if(!same(r.slots[i]?.deps,deps))r.slots[i]={fn,deps};return r.slots[i].fn;},useEffect(fn,deps){const r=active,i=r.cursor++;if(!same(r.slots[i]?.deps,deps)){const old=r.slots[i];r.slots[i]={deps};r.effects.push(()=>{old?.cleanup?.();r.slots[i].cleanup=fn();});}}};
class Runner{slots=[];effects=[];render(fn){active=this;this.cursor=0;const v=fn();active=null;this.effects.splice(0).forEach(fn=>fn());return v;}unmount(){this.slots.forEach(s=>s?.cleanup?.());}}
class RequestJsonError extends Error{constructor(message,outcome,status){super(message);this.outcome=outcome;this.status=status;}}
function load(relative='src/app/pos/void-panel.tsx'){const file=path.resolve(__dirname,'..',relative);assert(fs.existsSync(file),'void UI must exist');const mod={};const mocks={react:React,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'@/lib/current-user':{useCurrentUser:()=>actor,hasCurrentModule:()=>actor.authenticated,requestJson:(...args)=>transport(...args),RequestJsonError}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,require:n=>mocks[n]??new Proxy({},{get:(_,k)=>k==='__esModule'?true:String(k)}),Error,Number,JSON,Date,Math,console});return mod;}
const nodes=(tree,p)=>{const out=[];function walk(x){if(Array.isArray(x))return x.forEach(walk);if(!x||typeof x!=='object')return;if(p(x))out.push(x);walk(x.props?.children);}walk(tree);return out;};
const text=t=>JSON.stringify(t);const button=(t,label)=>{const found=nodes(t,x=>(x.type==='button'||x.type==='Button')&&x.props.children===label);assert(found.length,'missing '+label);return found.at(-1);};
const textarea=t=>{const n=nodes(t,x=>x.type==='textarea')[0];assert(n,'missing textarea');return n;};
const tick=()=>new Promise(r=>setImmediate(r));

const paidOrder=()=>({id:'order-a',branchId:'A',orderNumber:'SALE-ORIGINAL',status:'PAID',totalAmount:'25.00',coverage:'CAPTURED',collectedAmount:'25.00',outstandingAmount:'0.00',legacyRecordedAmount:null,unavailableReason:null,payment:null});
const openOrder=()=>({id:'order-open',branchId:'A',orderNumber:'SALE-OPEN',status:'OPEN',totalAmount:'10.00',coverage:'OPEN',collectedAmount:'0.00',outstandingAmount:'10.00',legacyRecordedAmount:null,unavailableReason:null,payment:null});
const listing=(orders=[paidOrder()])=>({orders,visibilityScope:'actual',limit:200,truncated:false,legacyNotice:'Legacy collection evidence unavailable.'});
const reversal=(overrides={})=>({id:'rev-a',orderId:'order-a',branchId:'A',reason:'Customer complaint',actorId:'manager-a',actorName:'Actual manager',priorStatus:'PAID',paymentId:null,receiptId:'receipt-a',finalDocumentId:'final-a',cogsAmountAtVoid:'5.00',refundLiabilityAmount:'25.00',restockedLines:[{menuItemId:'dish',name:'Saved dish',qty:1}],wastedLines:[],createdAt:'2026-11-04T01:00:00.000Z',...overrides});
async function setup(value=listing(),role='BRANCH_MANAGER'){actor={id:'manager-a',role,branchId:'A',authenticated:true,moduleAccess:['POS_CASHIER']};transport=async()=>value;const props={branchId:'A',branchName:'Branch A',identity:'manager-A',allowed:true,refreshToken:0},mod=load(),runner=new Runner(),h={props,runner,render:()=>runner.render(()=>mod.PosVoidPanel(props))};h.render();await tick();h.render();return h;}

test('branch manager sees voidable PAID order and can start/cancel void',async()=>{
  const h=await setup();const tree=h.render();
  assert.match(text(tree),/SALE-ORIGINAL/);assert.match(text(tree),/Void order/);
  button(tree,'Void order').props.onClick();
  const opened=h.render();
  textarea(opened).props.onChange({target:{value:'Customer complaint'}});
  assert.match(text(h.render()),/Void reason/);
  button(h.render(),'Cancel').props.onClick();
  assert.doesNotMatch(text(h.render()),/Void reason/);
});

test('cashier and read-only actor cannot see a void action, only read-only notice',async()=>{
  const h=await setup(listing(),'CASHIER');
  assert.match(text(h.render()),/not authorized to void/);
  assert.doesNotMatch(text(h.render()),/Void order/);
});

test('confirmed void shows restock/waste/refund-liability breakdown and refreshes the order list',async()=>{
  const h=await setup();
  button(h.render(),'Void order').props.onClick();
  textarea(h.render()).props.onChange({target:{value:'Customer complaint'}});
  let posted=null;
  transport=async(url,init)=>{if(init){posted={url,body:JSON.parse(init.body)};return {order:{id:'order-a',status:'VOIDED'},reversal:reversal()};}return listing([]);};
  await button(h.render(),'Confirm void').props.onClick();
  assert.equal(posted.url,'/api/pos/orders/order-a/void');assert.equal(posted.body.reason,'Customer complaint');
  const tree=h.render();
  assert.match(text(tree),/1 line\(s\) restocked/);assert.match(text(tree),/0 line\(s\) recorded as waste/);assert.match(text(tree),/refund liability TZS 25\.00/);
  assert.match(text(tree),/Recent void reversals/);assert.match(text(tree),/Actual manager/);
  assert.doesNotMatch(text(tree),/SALE-ORIGINAL/); // order list reloaded and no longer shows the now-VOIDED order
});

test('short reason is rejected and unknown outcome freezes the exact same reason for retry',async()=>{
  const h=await setup();
  button(h.render(),'Void order').props.onClick();
  textarea(h.render()).props.onChange({target:{value:'ab'}});
  assert.equal(button(h.render(),'Confirm void').props.disabled,true);
  textarea(h.render()).props.onChange({target:{value:'Reason long enough'}});
  transport=async()=>{throw new Error('network dropped');};
  await button(h.render(),'Confirm void').props.onClick();
  assert.match(text(h.render()),/outcome unknown/);
  assert.equal(button(h.render(),'Retry void').props.disabled,false);
  assert.equal(textarea(h.render()).props.disabled,true); // frozen reason text, no silent edit mid-retry
});

test('identity/branch/permission transition clears recent reversals and stale list',async()=>{
  const h=await setup();
  button(h.render(),'Void order').props.onClick();
  textarea(h.render()).props.onChange({target:{value:'Customer complaint'}});
  transport=async(url,init)=>init?{order:{id:'order-a',status:'VOIDED'},reversal:reversal()}:listing([]);
  await button(h.render(),'Confirm void').props.onClick();
  assert.match(text(h.render()),/Recent void reversals/);
  h.props.refreshToken++;
  transport=async()=>listing([paidOrder()]);
  await tick();h.render();await tick();
  assert.doesNotMatch(text(h.render()),/Recent void reversals/);
});
