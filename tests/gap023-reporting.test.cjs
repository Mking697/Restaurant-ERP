const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const NOW = new Date('2026-11-01T00:30:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } }

// Execute real handlers and shared calendar/aggregation helpers, replacing only
// persistence, identity and provider I/O. Expressions are evaluated against rows,
// including projected sale timestamps; assertions below are on handler results.
function harness(orders, role = 'BRANCH_MANAGER') {
  const cache = {}, tables = {}, sent = [], queries = [];
  const table = name => tables[name] ??= new Proxy({ _table: name }, { get: (t, k) => k in t ? t[k] : { column: k } });
  const value = (r, x) => x?.column ? r[x.column] : x?.eval ? x.eval(r) : x;
  const compare = (a, b, fn) => r => value(r, a) != null && value(r, b) != null && fn(value(r, a), value(r, b));
  const sql = (s, ...xs) => {
    const text = s.join('?').toLowerCase();
    const expr = { mapWith() { return expr; } };
    if (text.includes('coalesce') && text.includes('case when') && !text.includes('sum(')) expr.eval = r => r.status === 'PAID' ? r.settledAt ?? r.createdAt : r.createdAt;
    else if (text.includes('case when') && !text.includes('sum(')) expr.eval = r => r.status === 'OPEN' ? 0 : 1;
    else if (text.includes('sum(')) expr.aggregate = rows => rows.reduce((n, r) => n + (text.includes('case when') && r.ownerOnly !== false ? 0 : Number(value(r, xs[text.includes('case when') ? 1 : 0]))), 0).toFixed(2);
    else if (text.includes('bool_and')) expr.aggregate = rows => rows.every(r => value(r, xs[0]));
    else if (text.includes('> 0')) return r => Number(value(r,xs[0])) > 0;
    else if (text.includes('count(*)')) expr.aggregate = rows => rows.length;
    else throw new Error(`Unsupported SQL ${text}`);
    return expr;
  };
  const orm = { sql, and: (...ps) => r => ps.filter(Boolean).every(p => p(r)), or: (...ps) => r => ps.filter(Boolean).some(p => p(r)), eq: (a,b) => compare(a,b,(x,y)=>x===y), gte:(a,b)=>compare(a,b,(x,y)=>x>=y), lt:(a,b)=>compare(a,b,(x,y)=>x<y), lte:(a,b)=>compare(a,b,(x,y)=>x<=y), inArray:(a,vs)=>r=>vs.includes(value(r,a)), notInArray:(a,vs)=>r=>!vs.includes(value(r,a)), desc:x=>({sort:x, direction:-1}), min:x=>x };
  const data = { posOrders: orders, branches: [{id:'a', name:'A', vatRatePercent:'0.00'}], posOrderLines: orders.map(r=>({id:r.id+'-line', orderId:r.id, menuItemId:'dish', qty:1, price:r.totalAmount, vatRatePercent:'0.00'})), menuItems:[{id:'dish',name:'Dish',productCode:'D',vatRatePercent:'0.00'}] };
  const db = { select(columns) {
    let rows = [], ordering = [], bound = Infinity;
    const q = { from(t) { rows = data[t._table] ?? []; queries.push(t._table); return q; }, where(p) { if(p) rows=rows.filter(p); return q; }, orderBy(...xs) { ordering=xs; return q; }, limit(n) {bound=n;return q;}, innerJoin(){return q;}, groupBy(){return q;}, then(resolve,reject) {
      rows=[...rows].sort((a,b)=>{for(const x of ordering){const d=x.direction??1, col=x.sort??x; const av=value(a,col),bv=value(b,col);if(av<bv)return -d;if(av>bv)return d;}return 0;}).slice(0,bound);
      const entries=Object.entries(columns??{});
      const result=entries.some(([,x])=>x?.aggregate) ? [Object.fromEntries(entries.map(([k,x])=>[k,x.aggregate(rows)]))] : columns ? rows.map(r=>Object.fromEntries(entries.map(([k,x])=>[k,value(r,x)]))) : rows;
      return Promise.resolve(result).then(resolve,reject);
    } }; return q;
  }, insert(){return {values:async()=>{}};} };
  const actor = {role, branchId:'a', moduleAccess:[]};
  const deps = {
    'drizzle-orm':orm, '@/db/client':{db},
    '@/lib/server/auth':{requireIdentity:async()=>actor, locked:fn=>fn(db)},
    '@/lib/server/http':{api:fn=>fn(),json:x=>x},
    '@/lib/server/permissions':{assertModule(){},branchScope:()=> 'a',HttpError:class extends Error{}},
    '@/lib/server/order-visibility':{operationalOrderVisibility:a=>a.role==='SUPER_ADMIN'?undefined:orm.eq(table('posOrders').ownerOnly,false),salesSummaryFor:(a,t)=>a.role==='SUPER_ADMIN'?t:{visibleTotal:t.visibleTotal}},
    '@/lib/server/pos-orders':{}, '@/lib/server/whatsapp-triggers':{}, '@/lib/chatxflow':{sendWhatsAppMessage:async(...args)=>{sent.push(args);return {ok:true};}},
    '@/app/api/mis/_shared':{listMisScores:async()=>[]}, '@/lib/server/accounts-ledger':{queryBranchId:x=>x},
    '@/lib/server/expenses':{expensePermission(){},expenseScope:()=> 'a',expenseMonth:()=>({month:'2026-11',start:'2026-10-31T21:00:00Z',end:'2026-11-30T21:00:00Z'}),expenseProfitLoss:(month,expenses,payroll,revenue,cogs,cogsComplete)=>({revenue,cogs,cogsComplete})},
  };
  function load(file) {
    if(deps[file])return deps[file];
    if(file.startsWith('@/db/schema/'))return new Proxy({}, {get:(_,k)=>table(k)});
    let filename=file.startsWith('@/')?path.join(root,'src',file.slice(2)):file;
    if(!path.extname(filename))filename+='.ts';
    if(cache[filename])return cache[filename].exports;
    if(filename.endsWith(path.normalize('server/auth.ts')))return deps['@/lib/server/auth'];
    if(filename.endsWith(path.normalize('server/task-notifications.ts')))return {branchEscalationRecipients:async()=>[{phone:'manager',role:'BRANCH_MANAGER'},{phone:'owner',role:'SUPER_ADMIN'}]};
    if(filename.endsWith(path.normalize('server/prepared-stock-thresholds.ts')))return {countPreparedStockBreaches:async()=>({preparedLowStockCount:0,preparedHighStockCount:0})};
    if(filename.endsWith(path.normalize('accounts/_shared.ts')))return {ensureExpenseBranch:async()=>{},expenseWindow:()=>undefined};
    const mod={exports:{}};cache[filename]=mod;
    const source=fs.readFileSync(filename,'utf8');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports:mod.exports,module:mod,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(filename),name)):name.startsWith('node:')?require(name):load(name),Date:Clock,Intl,Map,Set,URL,console});
    return mod.exports;
  }
  return {load:p=>load(path.join(root,p)),sent,queries};
}
const order = (id, extra={}) => ({id,branchId:'a',status:'PAID',ownerOnly:false,createdAt:new Date('2026-10-30T12:00:00Z'),settledAt:new Date('2026-10-31T22:00:00Z'),totalAmount:'10.00',cogsAmount:'3.00',cogsComplete:true,channel:'DINE_IN',operatingConcept:'CONVENTIONAL',...extra});

test('sales trend filters and buckets settlement at Tanzania month/day boundary with legacy fallback',async()=>{
  const h=harness([order('overnight'),order('legacy',{status:'COMPLETED',createdAt:new Date('2026-10-31T22:30:00Z'),settledAt:null}),order('legacy-paid',{createdAt:new Date('2026-10-31T23:00:00Z'),settledAt:null}),order('open',{status:'OPEN'}),order('private',{ownerOnly:true}),order('foreign',{branchId:'b'}),order('void',{status:'VOIDED'})]);
  const result=await h.load('src/app/api/reports/sales-trend/route.ts').GET({url:'http://local/?days=2'});
  const today=result.trend.find(r=>r.date==='2026-11-01');
  assert.equal(today.revenueInr,'30.00');assert.equal(today.orderCount,3);
  assert.equal(result.trend.find(r=>r.date==='2026-10-31').revenueInr,'0.00');
});

test('P&L recognizes overnight revenue and posted COGS in settlement month, preserving operational privacy',async()=>{
  const rows=[order('overnight'),order('old-settlement',{createdAt:new Date('2026-11-01T00:00:00Z'),settledAt:new Date('2026-10-31T20:00:00Z'),totalAmount:'99.00'}),order('open',{status:'OPEN'}),order('private',{ownerOnly:true}),order('foreign',{branchId:'b'})];
  const result=await harness(rows).load('src/app/api/accounts/profit-loss/route.ts').GET({url:'http://local/?month=2026-11'});
  assert.equal(result.revenue,'10.00');assert.equal(result.cogs,'3.00');assert.equal(result.cogsComplete,true);
});

test('food cost and dashboard use settlement month and settlement day for the same visible sales',async()=>{
  const rows=[order('overnight'),order('old-settlement',{createdAt:new Date('2026-11-01T00:00:00Z'),settledAt:new Date('2026-10-31T20:00:00Z'),totalAmount:'99.00'}),order('private',{ownerOnly:true}),order('open',{status:'OPEN'})];
  const h=harness(rows);
  const food=await h.load('src/app/api/reports/_data.ts').branchFoodCost({role:'BRANCH_MANAGER'},'a',{start:new Date('2026-10-31T21:00:00Z'),end:NOW},new Map());
  assert.equal(food.revenueInr,'10.00');assert.equal(food.actualCogsInr,'3.00');
  const dashboard=await h.load('src/app/api/dashboard/kpis/route.ts').GET({url:'http://local/'});
  assert.equal(dashboard.branches[0].revenueTodayInr,'10.00');assert.equal(dashboard.branches[0].revenueMtdInr,'10.00');
  assert.equal(dashboard.channelSplit[0].revenueInr,10);
});

test('official VAT includes private overnight settlements on requested Tanzania day, excluding OPEN/VOIDED',async()=>{
  const rows=[order('overnight'),order('private',{ownerOnly:true}),order('open',{status:'OPEN'}),order('void',{status:'VOIDED'}),order('foreign',{branchId:'b'}),order('legacy',{status:'COMPLETED',settledAt:null,createdAt:new Date('2026-10-31T22:30:00Z')}),order('end',{settledAt:new Date('2026-11-01T21:00:00Z')})];
  const result=await harness(rows).load('src/app/api/vat/vat-summary/route.ts').GET({url:'http://local/?from=2026-11-01&to=2026-11-01'});
  assert.equal(result.ordersIncluded,3);assert.equal(result.grandTotalValue,'30.00');
});

test('daily summary counts settled-today sales without leaking owner-only sales to managers',async()=>{
  const h=harness([order('overnight'),order('private',{ownerOnly:true}),order('open',{status:'OPEN'}),order('void',{status:'VOIDED'}),order('foreign',{branchId:'b'})]);
  const result=await h.load('src/lib/server/daily-summary.ts').runDailySummary(NOW);
  assert.equal(result.notified,2);
  assert.match(h.sent.find(([phone])=>phone==='manager')[1],/1 completed sale\(s\)/);
  assert.match(h.sent.find(([phone])=>phone==='owner')[1],/2 completed sale\(s\)/);
});

test('POS list retains overnight OPEN snapshot and EAT-today sales, with independent paid totals',async()=>{
  const rows=[order('overnight-open',{status:'OPEN',settledAt:null}),order('overnight-paid'),order('legacy',{status:'COMPLETED',createdAt:new Date('2026-10-31T22:00:00Z'),settledAt:null}),order('private',{ownerOnly:true}),order('foreign',{branchId:'b'}),order('old-paid',{settledAt:new Date('2026-10-31T20:59:59Z')})];
  const result=await harness(rows).load('src/app/api/pos/orders/route.ts').GET({url:'http://local/'});
  assert.deepEqual(Array.from(result.orders,r=>r.id).sort(),['legacy','overnight-open','overnight-paid']);
  assert.equal(result.orders[0].id,'overnight-open');assert.equal(result.orders[0].operatingConcept,'CONVENTIONAL');
  assert.equal(result.salesSummary.visibleTotal,'20.00');
});

test('POS bound prioritizes OPEN rows without truncating paid summary and discloses truncation',async()=>{
  const rows=[order('old-open',{status:'OPEN',settledAt:null}),...Array.from({length:205},(_,i)=>order(`paid-${i}`,{createdAt:new Date('2026-11-01T00:00:00Z')}))];
  const result=await harness(rows).load('src/app/api/pos/orders/route.ts').GET({url:'http://local/'});
  assert.equal(result.orders.length,200);assert.equal(result.orders[0].id,'old-open');
  assert.equal(result.orderList.limit,200);assert.equal(result.orderList.truncated,true);
  assert.equal(result.salesSummary.visibleTotal,'2050.00');
  const exact=await harness(rows.slice(0,200)).load('src/app/api/pos/orders/route.ts').GET({url:'http://local/'});
  assert.equal(exact.orderList.truncated,false);
});

test('shared sale-time expression emits real PostgreSQL CASE and decodes selected timestamps as Dates',()=>{
  const { pgTable, text, timestamp, PgDialect }=require('drizzle-orm/pg-core');
  const posOrders=pgTable('pos_orders',{status:text('status'),createdAt:timestamp('created_at',{withTimezone:true}),settledAt:timestamp('settled_at',{withTimezone:true})});
  const mod={exports:{}};
  const source=fs.readFileSync(path.join(root,'src/lib/server/pos-reporting.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,require:name=>name==='drizzle-orm'?require(name):{posOrders}});
  const expr=mod.exports.posSaleTime;
  assert.equal(new PgDialect().sqlToQuery(expr).sql,`case when "pos_orders"."status" = 'PAID' then coalesce("pos_orders"."settled_at", "pos_orders"."created_at") else "pos_orders"."created_at" end`);
  assert.equal(expr.decoder.mapFromDriverValue('2026-10-31 22:00:00+00').toISOString(),'2026-10-31T22:00:00.000Z');
});
