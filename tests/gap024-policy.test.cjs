const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name) {
  const filename = path.join(__dirname, '../src/lib/server', `${name}.ts`);
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}\n})`,{filename})(r=>r.startsWith('./')?load(r.slice(2)):r.startsWith('../')?load(r):require(r),module,module.exports);
  return module.exports;
}
test('ticket progression separates preparation and cashier service and rejects stale/skipped transitions',()=>{
  const p=load('pos-lifecycle-policy');
  const kitchen={role:'KITCHEN_STAFF',moduleAccess:['POS_KITCHEN']};
  const cashier={role:'CASHIER',moduleAccess:['POS_CASHIER']};
  assert.equal(p.ticketTransition(kitchen,'SENT','START',1,1),'PREPARING');
  assert.equal(p.ticketTransition(kitchen,'PREPARING','READY',2,2),'READY');
  assert.equal(p.ticketTransition(cashier,'READY','SERVE',3,3),'SERVED');
  for(const args of [[kitchen,'SENT','READY',1,1],[kitchen,'READY','SERVE',3,3],[cashier,'SENT','START',1,1],[cashier,'READY','SERVE',3,2]]) assert.throws(()=>p.ticketTransition(...args),e=>[403,409].includes(e.status));
});

test('policy validates raw action types, positive integer revisions and terminal ticket states',()=>{
  const p=load('pos-lifecycle-policy'),owner={role:'SUPER_ADMIN',moduleAccess:[]};
  for(const expected of [undefined,null,0,-1,1.5,'1',NaN,Infinity]) assert.throws(()=>p.revisionGuard(1,expected),e=>e.status===400);
  for(const action of [null,undefined,['START'],{},'PREPARE']) assert.throws(()=>p.ticketTransition(owner,'SENT',action,1,1),e=>e.status===400);
  for(const status of ['SERVED','CANCELLED']) for(const action of ['START','READY','SERVE']) assert.throws(()=>p.ticketTransition(owner,status,action,4,4),e=>e.status===409);
  assert.deepEqual(p.lifecycleCapabilities({role:'BRANCH_MANAGER',moduleAccess:['POS_KITCHEN']}),{canCashier:false,canPrepare:true,canCancel:false});
  assert.deepEqual(p.lifecycleCapabilities({role:'BRANCH_MANAGER',moduleAccess:['POS_CASHIER']}),{canCashier:true,canPrepare:false,canCancel:true});
});
