const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
class RequestJsonError extends Error { constructor(message,outcome){super(message);this.outcome=outcome;} }
async function harness(file, request, props={}) {
  const state=[],effects=[],calls=[];let cursor=0;
  const hooks={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}];},useRef(initial){const [v]=hooks.useState(()=>({current:initial}));return v;},useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((v,n)=>v!==state[i][n])){state[i]=deps;effects.push(fn);}}};
  const deps={react:hooks,'react/jsx-runtime':require('react/jsx-runtime'),'@/lib/ui-copy':{useUiCopy:()=>s=>s},'@/lib/current-user':{RequestJsonError,requestJson:async(url,init)=>{calls.push({url,init});return request(url,init);}}};
  for(const [path,names]of Object.entries({'@/components/app-shell':['AppShell'],'@/components/page-header':['PageHeader'],'@/components/pending-work-widget':['PendingWorkWidget'],'@/components/ui/button':['Button'],'@/components/ui/card':['Card','CardContent','CardHeader','CardTitle'],'@/components/ui/table':['Table','TableBody','TableCell','TableHead','TableHeader','TableRow']}))deps[path]=Object.fromEntries(names.map(n=>[n,n]));
  const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>{assert.ok(n in deps,n);return deps[n]},crypto,encodeURIComponent});
  const Component=module.exports.default||module.exports.ReorderSuggestionsPanel;
  const render=()=>{cursor=0;return Component(props)};
  const all=(n,p)=>Array.isArray(n)?n.flatMap(v=>all(v,p)):!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...all(n.props.children,p)];
  const text=n=>Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props.children):String(n??'');
  const find=p=>all(render(),p);
  const button=label=>{const n=find(n=>n.type==='Button'&&text(n)===label)[0];assert.ok(n,'Missing '+label);return n;};
  async function flush(){render();while(effects.length)effects.shift()();await new Promise(r=>setImmediate(r));render()}
  await flush();return{calls,render,find,button,flush,text};
}
const row={id:'s1',subjectType:'GRN',sourceId:'g1',sourceRevision:1,branchId:'b1',summaryJson:{},submittedAt:'2026-11-02T00:00:00Z',acknowledged:false,eventCount:0,latestEvent:null};
test('HO unknown outcome freezes intent and replays the exact saved payload',async()=>{
  let unknown=true;const h=await harness('src/app/ho-stock-review/page-content.tsx',async(url,init)=>{if(url.endsWith('/branches'))return{branches:[{id:'b1',code:'B1',name:'QA'}]};if(init?.method==='POST'){if(unknown)throw new RequestJsonError('lost','unknown');return{replayed:true}}return{reviews:[row]}});
  await h.button('Load queue').props.onClick();
  h.find(n=>n.type==='input'&&n.props['aria-label'])[0].props.onChange({target:{value:'Original reason'}});
  await h.button('Escalate').props.onClick();
  assert.equal(h.button('Acknowledge').props.disabled,true);
  assert.equal(h.find(n=>n.type==='select')[0].props.disabled,true);
  h.find(n=>n.type==='input'&&n.props['aria-label'])[0].props.onChange({target:{value:'Different reason'}});
  unknown=false;await h.button('Replay exact action').props.onClick();
  const posts=h.calls.filter(c=>c.init?.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].init.body,posts[1].init.body);
});
test('HO same-tick conflicting clicks cannot submit two intents',async()=>{
  let release;const h=await harness('src/app/ho-stock-review/page-content.tsx',async(url,init)=>{if(url.endsWith('/branches'))return{branches:[{id:'b1'}]};if(init?.method==='POST')return new Promise(r=>release=r);return{reviews:[row]}});
  await h.button('Load queue').props.onClick();h.find(n=>n.type==='input'&&n.props['aria-label'])[0].props.onChange({target:{value:'QA escalation'}});
  const ack=h.button('Acknowledge'),escalate=h.button('Escalate');const p1=ack.props.onClick(),p2=escalate.props.onClick();
  assert.equal(h.calls.filter(c=>c.init?.method==='POST').length,1);
  release({replayed:false});await Promise.all([p1,p2]);
});
const suggestion={id:'r1',rawMaterialId:'mat',name:'QA Flour',unit:'kg',usable:'2.000',inventoryPosition:'2.000',maxStock:'10.000',suggestedQty:'8.000',internalQty:'4.000',externalQty:'4.000',convertible:true};
test('reorder unknown readback keeps intent locked until the exact committed request is proven',async()=>{
  let committed=false,key;const h=await harness('src/app/inventory/reorder-suggestions-panel.tsx',async(url,init)=>{
    if(url.endsWith('/preview'))return{suggestions:[suggestion]};
    if(url.endsWith('/convert')){key=JSON.parse(init.body).requestKey;throw new RequestJsonError('lost','unknown')}
    return{suggestion:{...suggestion,convertedAt:committed?'2026-11-02':null,conversionRequestKey:committed?key:null,internalRequisitionId:committed?'req-1':null}};
  },{branchId:'b1'});
  await h.button('Preview fresh suggestions').props.onClick();await h.button('Create reviewed requests').props.onClick();
  assert.equal(h.button('Create reviewed requests').props.disabled,true);
  await h.button('Check saved results').props.onClick();assert.equal(h.button('Preview fresh suggestions').props.disabled,true);
  committed=true;await h.button('Check saved results').props.onClick();assert.match(h.text(h.render()),/Req req-1/);
  assert.equal(h.calls.filter(c=>c.url.endsWith('/convert')).length,1);
});
test('reorder synchronous preview clicks issue only one request',async()=>{
  let release;const h=await harness('src/app/inventory/reorder-suggestions-panel.tsx',()=>new Promise(r=>release=r),{branchId:'b1'});
  const button=h.button('Preview fresh suggestions');const a=button.props.onClick(),b=button.props.onClick();
  assert.equal(h.calls.length,1);release({suggestions:[]});await Promise.all([a,b]);
});
