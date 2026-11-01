// Rebuild the existing hand-built, offline connected map. No Archify or runtime dependencies.
// This is documentation of implementation, never a migration/deployment command.
const fs = require('node:fs');
const path = require('node:path');
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const palette = { frontend: ['#083344','#22d3ee'], backend: ['#064e3b','#34d399'], database: ['#4c1d95','#a78bfa'], security: ['#881337','#fb7185'], message: ['#78350f','#fbbf24'] };
const lanes = [
  ['shifts','Branch Shift Cycle'], ['pos','Branch POS'], ['kitchen','Recipe / Semi-FG / Kitchen'],
  ['inventory','Inventory / Warehouse'], ['purchase','Purchase / GRN'], ['billing','Billing / VAT'],
  ['whatsapp','Customer WhatsApp'], ['privacy','Privacy / Official Records'], ['tasks','Tasks / Checklists'],
  ['workforce','Attendance / Leave / Payroll'], ['admin','Users / Branches / Access'], ['insights','Dashboard / Reports / MIS'],
  ['invoice','Vendor Invoice / Settlement'], ['accounts','Accounts / Posted Costs'], ['automation','Scheduled Staff Summary'],
];
const nodes = [];
function node(id, lane, col, label, sub, type = 'frontend', dy = 0, note = '') { nodes.push({ id, lane, col, label, sub, type, dy, note }); }
node('shift_setup','shifts',0,'Shift Setup','Branch windows','security',0,'Access: Module Grants');
node('shift_start','shifts',1,'Start Shift','Current IST window','backend');
node('shift_gate','shifts',2,'Shift Gate','Open + accepted','security');
node('blind_count','shifts',3,'Blind Count','TSh notes + coins');
node('shift_next','shifts',4,'Next Shift','Pending handover','database');
node('accept_handover','shifts',5,'Accept Shift','Manual acceptance','security');
node('table','pos',0,'Table / Channel','Counter 1 or 2');
node('items','pos',1,'Add Items','Same-branch menu');
node('confirm','pos',2,'Confirm Order','One transaction','backend',0,'Cost: Posted COGS below');
node('recipe','kitchen',0,'Recipe Builder','Atomic recipe save');
node('produce','kitchen',1,'Semi-FG Batch','Consumes + produces','backend');
node('stock_check','kitchen',2,'Stock Check','Direct raw + Semi-FG','backend');
node('kot','kitchen',3,'KOT Ticket','Names + qty; no price');
node('semifg_check','kitchen',4,'Semi-FG Check','Prepared stock view','security');
node('warehouse','inventory',0,'Warehouse Receive','Credits branch stock','backend');
node('stock_deduct','inventory',1,'Stock Deduct','Atomic, no double-use','database',0,'Receipt: Billing lane');
node('low_stock','inventory',2,'Low Stock','Configured min/max','security',0,'Count: Staff Summary');
node('inventory_stock','inventory',4,'Branch Raw Stock','Unique branch + item','database',0,'Transfer / GRN / sale');
node('indent','purchase',0,'Raise Indent','Branch + materials');
node('indent_approve','purchase',1,'Indent Decision','History / spike gate','security',0,'Spike: approver ping');
node('po','purchase',2,'Purchase Order','Locked quantities');
node('bill','purchase',3,'Bill + Receive','Private bill upload','backend');
node('grn','purchase',4,'GRN Quality','PASS / FAIL / PARTIAL','backend');
node('vendor_return','purchase',5,'Vendor Claim','Failed qty at PO rate','database',0,'Settle: Invoice lane');
node('receipt','billing',0,'POS Receipt','Counter 1 / 2 copy','frontend',0,'Stock: Inventory lane');
node('vat_invoice','billing',1,'VAT Invoice','Branch / item VAT','database',0,'Tender: FX Snapshot');
node('thankyou_billing','billing',2,'Thank You','Optional send','message',-38);
node('vat_summary','billing',2,'VAT Summary','All eligible sales','security',38);
node('fx','billing',4,'FX Snapshot','Configured tender rate','database',0,'Legacy INR keys remain');
node('thankyou','whatsapp',0,'Thank You','After sale commits','message');
node('offer','whatsapp',1,'Create Offer','Text + validity');
node('audience','whatsapp',2,'Audience Filter','Actor-visible contacts','security');
node('broadcast','whatsapp',3,'Send Broadcast','Best effort + log','message');
node('owner_only','privacy',0,'Owner-only','Owner action + reason','security');
node('audit','privacy',1,'Reason + Audit','Atomic visibility edit','database');
node('staff_view','privacy',2,'Staff View','Visible sales only','frontend',-38);
node('actual_records','privacy',2,'Actual Records','VAT / stock / cash','database',38);
node('official_access','privacy',3,'Official VAT Grant','Separate permission','security',38);
node('recurring','tasks',0,'Recurring Task','Frequency + anchor','frontend',-38);
node('delegate','tasks',0,'Delegate Task','One-time + assignee','frontend',38);
node('task_generate','tasks',1,'Due Occurrences','Cron creates rows','backend',-38);
node('mark_done','tasks',2,'Mark Done','Evidence if one-time','backend');
node('checklist','tasks',3,'Checklist','Recurring task engine');
node('escalation','tasks',4,'Overdue / Remind','One-shot claims','message',0,'Send after DB commit');
node('attendance','workforce',0,'Attendance','Actual daily marks');
node('leave','workforce',1,'Apply Leave','Employee / own scope');
node('leave_review','workforce',2,'Manager Review','No self-approval','security');
node('payroll','workforce',3,'Payroll Finalize','Calendar / immutable','database',0,'Cost: Accounts lane');
node('user','admin',0,'Create User','Role + branch');
node('grants','admin',1,'Module Grants','Server-side scope','security',0,'Gates: Shift Setup');
node('branch','admin',2,'Branch Setup','Real clone wizard','database');
node('branding','admin',3,'Brand / Settings','Owner configuration');
node('guide','admin',4,'Guide Book','English / Hinglish');
node('dashboard','insights',0,'Dashboard','Real scoped KPIs');
node('reports','insights',1,'Reports','Six reports + CSV');
node('mis','insights',2,'MIS Score','Saved branch ranks','database');
node('food_actual','insights',3,'Food Cost','Actual vs Estimate','database',0,'Saved cost: Posted COGS');
node('vendor_invoice','invoice',0,'Vendor Invoice','After GRN quality','database');
node('three_way','invoice',1,'3-way Match','Accepted vs adjusted','security');
node('payment_approve','invoice',2,'Approve Payment','Accounts grant','security');
node('paid','invoice',3,'Mark Paid','Manual saved status','database');
node('refund_settle','invoice',5,'Settle Claim','Amount / date / note','database',0,'Claim: Purchase lane');
node('posted_cogs','accounts',0,'Posted COGS','Saved at order time','database',0,'Source: Confirm Order');
node('profit_loss','accounts',1,'Profit / Loss','Withhold if incomplete','database');
node('expense','accounts',2,'Expenses + Payroll','Posted cost sources','database');
node('journal','accounts',3,'Double-entry','Idempotent journal','database');
node('balance','accounts',4,'Balance Sheet','Saved journal totals','database');
node('petty_agg','accounts',5,'Petty / Aggregator','Real entries + recon','database');
node('cron_auth','automation',0,'Cron Auth','Bearer secret only','security');
node('summary_claim','automation',1,'Daily Claim','Branch + IST day','database');
node('summary_metrics','automation',2,'Branch Metrics','Sales / overdue / shift','backend');
node('summary_stock','automation',3,'Low-stock Count','Qty < positive min','backend');
node('summary_send','automation',4,'Owner / Manager','Privacy-aware summary','message');
node('message_log','automation',5,'Delivery Outcome','Provider result log','database');
const edges = [];
function edge(from, to, kind = 'normal', label = '', route = 'auto') { edges.push({ from, to, kind, label, route }); }
function chain(ids, kind = 'normal') { ids.slice(1).forEach((id,i) => edge(ids[i],id,kind)); }
chain(['shift_setup','shift_start','shift_gate','blind_count','shift_next','accept_handover']);
edge('accept_handover','shift_gate','reference','next run ready','return');
edge('shift_gate','confirm','write','sale allowed');
chain(['table','items','confirm']); edge('confirm','stock_check','write');
chain(['recipe','produce','stock_check']); edge('stock_check','kot'); edge('kot','semifg_check','reference');
edge('stock_check','stock_deduct','write','consume once');
edge('warehouse','stock_deduct','reference'); edge('stock_deduct','low_stock','reference');
chain(['indent','indent_approve','po','bill','grn']); edge('grn','vendor_return','reference');
edge('grn','inventory_stock','write','accepted qty only');
edge('receipt','vat_invoice'); edge('vat_invoice','thankyou_billing','write'); edge('vat_invoice','vat_summary','reference');
edge('vat_invoice','thankyou','reference','optional text');
edge('vat_invoice','fx','reference','','note');
chain(['offer','audience','broadcast']);
edge('owner_only','audit'); edge('audit','staff_view'); edge('audit','actual_records','reference','unchanged'); edge('actual_records','official_access','reference');
edge('recurring','task_generate'); edge('task_generate','mark_done'); edge('delegate','mark_done');
edge('recurring','checklist','reference','','top'); edge('task_generate','escalation','reference','','bottom');
chain(['attendance','leave','leave_review','payroll']); chain(['user','grants','branch']); chain(['branch','branding','guide']);
chain(['dashboard','reports','mis'],'reference'); edge('reports','food_actual','reference','','bottom');
chain(['vendor_invoice','three_way','payment_approve','paid']);
edge('vendor_return','refund_settle','reference','','note');
edge('posted_cogs','profit_loss'); edge('expense','profit_loss','reference'); chain(['expense','journal','balance']); edge('petty_agg','journal','reference','','bottom');
chain(['cron_auth','summary_claim','summary_metrics','summary_stock','summary_send','message_log']);
const cards = [];
function card(title, bullets, sources, kind='backend') { cards.push({title,bullets,sources,kind}); }
card('Order Capture - Branch POS',[
  'Select channel/table, counter and sellable same-branch menu items. Server checks session, grants, branch and the configured shift before accepting a sale.',
  'One transaction validates stock, deducts direct requirements, captures order cost and saves the order/lines. A shortage rejects the whole sale, not a partial order.'
],['src/app/api/pos/orders/route.ts']);
card('Recipe Builder - Atomic Setup',[
  'Save dish/Semi-FG, yield, output unit and raw-material or same-branch Semi-FG component rows together. Recipe setup never credits inventory.',
  'Circular recipes are rejected. A dish needing gravy and chicken uses prepared gravy stock plus direct chicken; its recipe is not virtual stock.'
],['src/lib/server/bom.ts','src/app/menu/menu-workspace.tsx']);
card('Semi-FG Production - Real Prepared Stock',[
  'Record a batch to consume its direct raw materials/nested prepared stock and credit semi_fg_stock. Production history uses a replay key so an exact retry cannot double-consume.',
  'Example: produce 1 kg gravy from its recipe, then sell plates using that prepared stock. Production and later sale are separate stock movements.'
],['src/lib/server/production.ts']);
card('Stock Check - Direct Requirements Only',[
  'Sale checks direct raw and already-produced Semi-FG requirements. It does not deduct the raw ingredients embedded in prepared stock for a second time.',
  'Missing recipe, malformed requirements or insufficient stock blocks the entire sale. Recursive recipe expansion for costing is separate from physical consumption.'
],['src/lib/server/production-quantity.ts','src/lib/server/production.ts']);
card('Kitchen KOT + Prepared Stock View',[
  'Confirmed sale returns KOT item names/quantities without prices, plus a billing receipt. No independent kitchen-device delivery or automatic physical printer integration is claimed.',
  'Prepared-stock preview helps identify Semi-FG shortage. The new daily low-stock count concerns raw inventory minimums, not an automatic Semi-FG alert.'
],['src/app/pos/page-content.tsx']);
card('Central + Branch Warehouse Records',[
  'Warehouse and transfer records are saved. A dispatch records quantity and destination; dispatch alone does not credit destination inventory.',
  'Do not read the Central warehouse label as proof of a complete central-stock debit ledger. This map distinguishes transfer paperwork from the destination receipt posting.'
],['src/app/api/stock-transfers/route.ts','src/db/schema/warehouses.ts']);
card('Warehouse Receive - Destination Stock Credit',[
  'Receiving a DISPATCHED transfer credits qtyReceived to its destination branch raw inventory, creates a missing stock row and marks the transfer received.',
  'The response records dispatched-versus-received variance. It is not an automatic vendor refund or a second GRN quality decision.'
],['src/app/api/stock-transfers/[id]/receive/route.ts']);
card('Inventory - Sale, GRN and Thresholds',[
  'Branch inventory is real PostgreSQL stock. A unique branch/material index prevents duplicate stock rows; stock transactions use the application locking convention.',
  'GRN quality credits accepted raw quantity once. FAIL credits zero; a descriptive general purchase posts no raw stock. Min/max values are branch-specific; zero means unconfigured.',
  'The green GRN arrow goes to Branch Raw Stock, not Central warehouse or dispatch paperwork.'
],['src/db/schema/inventory.ts','src/lib/server/grn-quality.ts']);
card('POS Receipt - Two Billing Counters',[
  'Counter 1/2 is saved on the sale. Counters share branch inventory and shift rules; the code does not promise independent cash-drawer ledgers.',
  'The order table is capped at the latest 200 records. Its completed-sale totals cover the full endpoint day/scope rather than just those displayed rows.'
],['src/app/api/pos/orders/route.ts']);
card('Tanzania VAT - Current Implemented Rate Path',[
  'The app computes flat VAT per line: branch vatRatePercent override if present, otherwise the item rate (default 18%). It has no Indian state-tax split.',
  'Illustration: TSh 300 taxable at 18% gives TSh 54 VAT and TSh 354 total. This describes application configuration, not legal certification or tax filing.'
],['src/lib/server/vat.ts','src/app/api/pos/orders/route.ts']);
card('Currency + FX - Display and Legacy Boundaries',[
  'User-facing currency is TSh/TZS and Tanzanian mobile input uses +255. Configured foreign tender snapshots rate and payment amount at sale time.',
  'Legacy database fields and the default internal tender code still use INR/rateToInr names. The display conversion did not fully migrate those internal FX identifiers; do not infer an independently audited TZS FX model.'
],['src/lib/utils.ts','src/db/schema/currency.ts','src/app/api/pos/orders/route.ts']);
card('Accounts VAT Summary - Official Access',[
  'Accounts VAT Summary requires OFFICIAL_SALES_REPORTS (Owner bypass applies). It includes eligible completed Owner-only orders; ordinary POS/REPORTS grants do not grant this official view.',
  'Rows group product code/rate with taxable and VAT values and CSV download. The current export reconstructs from order lines and current branch/item tax configuration; it is not an immutable tax-rate snapshot or statutory submission.'
],['src/app/api/vat/vat-summary/route.ts','src/app/accounts/page-content.tsx']);
card('Customer Thank You - After Commit',[
  'Optional customer phone triggers a best-effort ChatXFlow message after the order transaction commits. Provider failure never rolls back stock or the sale.',
  'The text includes order number, TSh total and branch. No generated invoice-link delivery or ability to recall a previously delivered message is implied.'
],['src/lib/server/whatsapp-triggers.ts','src/app/api/pos/orders/route.ts'],'message');
card('WhatsApp Offers - Scoped Audience',[
  'Offer preview/send uses distinct customer contacts from actual orders. Non-Owners exclude contacts available only from Owner-only orders.',
  'Broadcast is an external action with delivery logging and bounded best-effort transport, not guaranteed delivery. Updating this offline map sends nothing.'
],['src/app/api/whatsapp/offer-alert/route.ts','src/lib/chatxflow.ts'],'message');
card('Shift Setup + Start - Deployed',[
  'Owner or permitted branch administrator defines contiguous 24-hour windows; one same-start/end definition covers a full day. Start selects the current application IST window.',
  'One run is open per branch. Without configured shifts, legacy POS behavior remains; the code has not migrated its business calendar to Africa/Dar_es_Salaam.'
],['src/lib/server/shifts.ts'],'security');
card('Blind Count - End Shift - Next Run',[
  'Cash count uses TSh 10000/5000/2000/1000/500 notes plus coins. Manual End Shift atomically saves count/variance, ends the old run, opens the successor and creates a pending handover.',
  'Expected cash = accepted incoming counted cash + this run cash sales. Physical counted cash carries forward; card/UPI/other remain run-only summaries, not cumulative cash or bank transfers.',
  'An initial cash float and safe withdrawals are not modeled. Time reminders alone do not auto-close a run.'
],['src/lib/server/shifts.ts','src/app/cash-drop/page-content.tsx']);
card('Handover Acceptance - Repeat Cycle',[
  'Incoming authorized cashier accepts the saved handover. POS and another closing remain blocked while acceptance is pending.',
  'A single-window branch opens a fresh run ID for the next cycle. An uncertain write acknowledgment is reconciled rather than treated as proof the closing failed.'
],['src/lib/server/shifts.ts','src/app/api/shift-handovers/[id]/accept/route.ts']);
card('Owner-only Operational Privacy - Deployed',[
  'Owner alone can hide/restore operational visibility of a saved order with a reason. The order flag and audit event commit together.',
  'Non-Owner operational POS, dashboard, reports and P&L select only permitted orders. Their numbers are access-filtered, not necessarily total actual branch sales.'
],['src/lib/server/order-visibility.ts','src/app/api/pos/orders/[id]/visibility/route.ts'],'security');
card('Privacy Is Not Erasure or Accounting Reversal',[
  'Owner-only does not delete a sale, undo stock, reduce actual cash reconciliation or remove eligible sales from official VAT Summary. The dashed unchanged arrow is a reference, not a mutation.',
  'Important distinction: operational Accounts P&L and Food Cost follow order visibility; official VAT, journals and cash follow their own authorized sources. Downloads, prior views and delivered messages cannot be recalled.'
],['src/app/api/accounts/profit-loss/route.ts','src/app/api/vat/vat-summary/route.ts','src/lib/server/order-visibility.ts'],'security');
card('Accounts - Real Ledgers and Costs',[
  'Expenses with void history, finalized payroll, petty cash and aggregator reconciliation persist. Approved source events post idempotent double-entry journal legs; balance sheet reads account/journal records.',
  'P&L combines permitted completed-sale revenue, captured COGS, posted expenses and finalized labor. With incomplete order costs it withholds COGS/gross profit rather than presenting a partial sum as complete.'
],['src/lib/server/accounts-ledger.ts','src/lib/server/expenses.ts','src/app/api/accounts/profit-loss/route.ts']);
card('Release Snapshot + What Live Means',[
  'Current application reference: main 4d4d268 (feature 619f11d), deployed October 31, 2026. Neon migration 0017 was applied and tracked. Guide status for Purchase and Accounts is Live DB.',
  'Tasks, Purchase, Dashboard, Reports, MIS, clone and Workforce now use real server/database workflows; the old demo/not-deployed labels in this artifact have been removed.',
  'Deployed code is not proof of configured provider delivery, completed statutory filing, full bank integration or every feature in a generic ERP product. This artifact is documentation only.'
],['CLAUDE.md','src/lib/guide-content.ts'],'frontend');
card('Tasks - Real Recurring + One-Time Work',[
  'Recurring/checklist definitions save frequency and anchor. Authenticated cron generates due task_instances, including bounded catch-up. One-time delegation saves a branch-bound assignee and deadline.',
  'Doer/authorized completion is persisted; one-time work requires evidence. Checklist is the recurring engine, not a separate automatic next-step chain. Due reminders and overdue escalation use one-shot claims and send after transaction commit.',
  'The configured Vercel task cron is daily at 03:00 UTC. Overdue processing happens when a tick runs; the code does not guarantee delivery exactly 30 minutes after a deadline.'
],['src/app/tasks/page-content.tsx','src/app/api/cron/tasks/route.ts','src/lib/server/task-generation.ts']);
card('Purchase / GRN - Real Persisted Chain',[
  'Indent lines save to DB. Complete purchase-history coverage drives the spike decision; insufficient/spiking history routes for approval and best-effort approver WhatsApp ping.',
  'Store PO binds every quantity to the approved indent and saves rates; general purchases use descriptions. Bought / Bill / Material Received stages save and receiving creates GRN lines.',
  'Every quality line records accepted/failed quantities atomically. PASS/PARTIAL posts accepted raw stock once; failed quantities create expected vendor claims at saved PO rates. Claims are not proof of money received.'
],['src/lib/server/purchase.ts','src/lib/server/grn-quality.ts','src/lib/server/vendor-returns.ts']);
card('Users, Branches, Access + Clone',[
  'Roles, branch membership and module grants are enforced on server reads/writes as well as navigation. Job title alone does not supply a module permission.',
  'Owner-only Clone Branch is a real backend transaction copying approved menu/BOM/checklist configuration, not sales, stock, employees or financial history. Deletion readiness is a read-only linked-record check, not forced deletion.'
],['src/lib/server/branch-clone.ts','src/lib/server/permissions.ts','src/app/api/branches/[id]/deletion-check/route.ts'],'security');
card('Dashboard / Reports / MIS - Database-backed',[
  'Dashboard reads scoped real sales/stock/tasks/closing/MIS inputs. Six reports cover sales trend, food cost, MIS, inventory variance, cash reconciliation and aggregator reconciliation, with CSV export.',
  'MIS Compute saves branch/period ranks using measured components; missing components are excluded and weights re-normalized. It is not an employee appraisal or an automatically scheduled score.',
  'Food Cost branch summary now separates Actual (Posted) saved cost from current-recipe/rate Estimate. Item-level recipe costing and dashboard food-cost metric remain estimates; prime cost is unavailable.'
],['src/app/api/reports/_data.ts','src/app/api/dashboard/kpis/route.ts','src/app/api/mis/compute/route.ts']);
card('Attendance + Leave - Real Records',[
  'Attendance is marked per employee/day. Leave approval requires a different authorized reviewer; self-approval of own linked employee/request is denied.',
  'Payroll uses actual calendar days, not a weekly-off or fixed-26-day assumption. Only approved paid ON_ROLL leave qualifies; OFF_ROLL earnings follow worked days.'
],['src/lib/server/workforce.ts','src/app/workforce/live-ui.tsx']);
card('Payroll Finalization - Immutable Snapshot',[
  'Historical compensation rate segments, actual calendar days and exact money rounding feed payroll. Missing attendance blocks finalization; future/pending leave cannot be invented as pay.',
  'Finalization persists immutable payroll snapshots and a journal source. This records an obligation/cost; it is not automatic salary disbursement.'
],['src/lib/server/workforce.ts','src/lib/server/accounts-ledger.ts']);
card('Actual COGS - Capture Once, Fail Closed',[
  'At order confirmation, recursive recipe expansion prices ingredients at the latest locked vendor rate and saves cogsAmount/cogsComplete. It is a recipe-based sale-time cost snapshot, not warehouse-batch FIFO or historical production-lot valuation.',
  'Saved cost is never recomputed from a later rate. Missing nested recipe/rate marks it incomplete. Migration 0017 makes omitted capture default incomplete; it does not rewrite any existing valid zero/nonzero cost.',
  'Actual Food Cost sums permitted saved costs exactly. Empty/incomplete periods return unavailable plus reason; zero revenue has no food-cost percentage.'
],['src/lib/server/cogs.ts','src/app/api/reports/_aggregation.ts','drizzle/0017_groovy_lizard.sql']);
card('Invoice Match - Approve - Mark Paid',[
  'After GRN quality, one vendor invoice per PO saves invoice number, amount, optional document and signed tax adjustment with a reason. PURCHASE_ORDER is required to record it.',
  'Three-way display retains PO total as informational. Only GRN accepted value versus adjusted invoice, within the configured fixed tolerance, gates matched/payment status. A mismatch stays locked.',
  'ACCOUNTS_EXPENSES authorizes Approve then Mark Paid. These are manual persisted status changes, not bank transfer or automatic journal/payment execution. A vendor claim can separately be marked settled with amount/date/note.'
],['src/lib/server/vendor-invoices.ts','src/lib/server/vendor-returns.ts']);
card('Daily Summary - Including Raw Low Stock',[
  'Vercel daily-summary schedule is 02:30 UTC. Bearer-authenticated cron claims branch + IST date once before best-effort staff messages.',
  'Active Owner and branch-manager destinations receive completed-sale count, overdue tasks, pending handover and raw items with minStockLevel > 0 and qtyOnHand < minStockLevel. Equality and unconfigured zero thresholds do not count.',
  'Non-Owner/shared destinations get restricted sale counts. The summary is not an immediate stock-crossing push. Real production delivery is provider-dependent and was not force-triggered during this release.'
],['src/lib/server/daily-summary.ts','src/lib/server/task-notifications.ts','vercel.json'],'message');
card('Private Evidence + Purchase Documents',[
  'Task evidence supports private photo storage and protected retrieval using the task workflow. Legacy text references remain distinct from uploaded photos.',
  'Purchase bills/vendor invoices accept supported image/PDF uploads through private Vercel Blob and signed viewing URLs. Application upload validation is not a claim of malware scanning, legal invoice approval or guaranteed full platform upload-size acceptance.'
],['src/lib/server/task-evidence.ts','src/lib/server/purchase-documents.ts']);
card('Verification / Release Boundaries',[
  'Release evidence: 459 unit/UI tests, 61 compiled HTTP + PostgreSQL report checks, separate real low-stock cron acceptance, fresh/upgrade/replay migration proofs, clean TypeScript/build and independent review.',
  'Cron QA first binds the app to its disposable DB through a random session; provider credentials are absent and no real WhatsApp is sent. Production smoke checks cover login and auth boundaries, not a signed-in walkthrough of every business screen.',
  'This documentation update does not rerun all business integrations or deploy the app. Source paths under each card make implementation claims traceable.'
],['tests/dashboard-reports.integration.cjs','tests/low-stock-summary.integration.cjs','tests/cogs-default.integration.cjs'],'security');
card('Known Limits - Do Not Infer Missing Features',[
  'Application business-day/shift/payroll helpers still use Asia/Kolkata, while some endpoints use their own date windows. Tanzania display/phone/VAT changes did not migrate the business timezone.',
  'Legacy internal INR identifiers remain in FX/money field names. VAT Summary currently reads current menu/branch tax settings. No automatic bank transfer, statutory tax filing, instant guaranteed alerts or complete central warehouse stock ledger is established.',
  'Configured raw-stock alerts differ from prepared Semi-FG stock. Missing cost data is not a zero-cost success; recorded vendor claims differ from actual refund settlement.'
],['src/lib/server/shifts.ts','src/app/api/pos/orders/route.ts','src/app/api/vat/vat-summary/route.ts'],'security');
const WIDTH=1660, ROW=170, TOP=14, START=220, GAP=235, BW=176, BH=60;
const index = new Map(nodes.map(n=>[n.id,n]));
for(const n of nodes){n.x=START+n.col*GAP;n.y=TOP+lanes.findIndex(l=>l[0]===n.lane)*ROW+86+n.dy;}
function text(x,y,value,size=12,fill='#e2e8f0',other=''){return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" ${other}>${esc(value)}</text>`;}
const height=TOP+lanes.length*ROW+34;
const svg=[`<svg role="img" aria-labelledby="map-title map-desc" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg"><title id="map-title">Restaurant ERP connected process flow</title><desc id="map-desc">${lanes.length} swimlanes; ${nodes.length} steps. Short arrows show operations and references; paired notes identify distant links. Detailed source-linked explanations follow.</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#94a3b8"/></marker><marker id="write-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#34d399"/></marker></defs><rect width="${WIDTH}" height="${height}" fill="#020617"/>`];
for(const [i,l] of lanes.entries()){
  svg.push(`<g data-lane="${l[0]}"><rect x="4" y="${TOP+i*ROW}" width="${WIDTH-8}" height="${ROW}" rx="6" fill="${i%2?'#0b1529':'#0c192b'}" stroke="#1e293b"/>`);
  const parts=l[1].split(' / '); parts.forEach((p,j)=>svg.push(text(18,TOP+i*ROW+25+j*17,p,12,'#94a3b8','font-weight="600"'))); svg.push('</g>');
}
for(const n of nodes){const [fill,stroke]=palette[n.type];svg.push(`<g data-node="${n.id}" data-lane-ref="${n.lane}"><rect x="${n.x}" y="${n.y-BH/2}" width="${BW}" height="${BH}" rx="7" fill="#0f172a"/><rect x="${n.x}" y="${n.y-BH/2}" width="${BW}" height="${BH}" rx="7" fill="${fill}" fill-opacity=".58" stroke="${stroke}" stroke-width="1.4"/>${text(n.x+BW/2,n.y-5,n.label,12,'#f1f5f9','text-anchor="middle" font-weight="600"')}${text(n.x+BW/2,n.y+14,n.sub,10,'#b8c6da','text-anchor="middle"')}${n.note?text(n.x+BW/2,n.y+46,n.note,9,'#94a3b8','text-anchor="middle" font-style="italic"'):''}</g>`);}
// Edge labels sit in lane padding, never on top of a node's text. Return/backward
// references route through clear channels rather than crossing intermediate boxes.
for(const e of edges){if(e.route==='note')continue; const a=index.get(e.from),b=index.get(e.to);if(!a||!b)throw Error('Unknown edge node');let d,lx,ly;
  if(e.route==='return'){const y=TOP+46;d=`M ${a.x+BW/2} ${a.y-BH/2} V ${y} H ${b.x+BW/2} V ${b.y-BH/2}`;lx=(a.x+b.x+BW)/2;ly=y-7;}
  else if(e.route==='top'||e.route==='bottom'){const sign=e.route==='top'?-1:1;const channel=TOP+lanes.findIndex(l=>l[0]===a.lane)*ROW+(sign<0?8:163);d=`M ${a.x+BW/2} ${a.y+sign*BH/2} V ${channel} H ${b.x+BW/2} V ${b.y+sign*BH/2}`;lx=(a.x+b.x+BW)/2;ly=channel-7;}
  else if(a.lane===b.lane){const forward=b.x>=a.x;const x1=a.x+(forward?BW:0),x2=b.x+(forward?0:BW);d=`M ${x1} ${a.y} C ${(x1+x2)/2} ${a.y} ${(x1+x2)/2} ${b.y} ${x2} ${b.y}`;lx=(x1+x2)/2;ly=Math.min(a.y,b.y)-39;}
  else {const down=b.y>a.y;const x1=a.x+BW/2,x2=b.x+BW/2,y1=a.y+(down?BH/2:-BH/2),y2=b.y+(down?-BH/2:BH/2);d=`M ${x1} ${y1} C ${x1} ${(y1+y2)/2} ${x2} ${(y1+y2)/2} ${x2} ${y2}`;lx=(x1+x2)/2+10;ly=(y1+y2)/2-5;}
  svg.push(`<path data-edge="${e.from}--${e.to}" d="${d}" fill="none" stroke="${e.kind==='write'?'#34d399':'#71849f'}" stroke-width="1.6" ${e.kind==='reference'?'stroke-dasharray="5 4"':''} marker-end="url(#${e.kind==='write'?'write-arrow':'arrow'})"/>`);
  if(e.label)svg.push(text(lx,ly,e.label,9,'#cbd5e1','text-anchor="middle" style="paint-order:stroke;stroke:#020617;stroke-width:4px;stroke-linejoin:round"'));
}
svg.push('</svg>');
function render(){
  const legend=Object.entries(palette).map(([k,v])=>`<span><i style="background:${v[1]}"></i>${esc(k)}</span>`).join('');
  return `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="application-revision" content="4d4d268"/><title>Restaurant ERP — Full System Process Flow (Current)</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;padding:28px 24px 60px;background:#020617;color:#dbe5f4;font-family:Consolas,monospace}.wrap{max-width:1720px;margin:auto}h1{font-size:24px;margin:0 0 12px;color:#f1f5f9}p{line-height:1.65;font-size:14px;max-width:1250px}.muted{color:#a3b2c8}.release{display:inline-block;padding:6px 10px;border:1px solid #166b56;border-radius:6px;color:#6ee7b7;background:#052b23;font-size:12px}.boundary{border-left:3px solid #fbbf24;background:#251b0c;padding:12px 16px;color:#fde7b3;max-width:1500px}.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;margin:18px 0}.legend span{display:flex;align-items:center;gap:7px}.legend i{width:9px;height:9px;border-radius:50%}.diagram-card{overflow-x:auto;border:1px solid #26344b;border-radius:12px;padding:12px;margin:22px 0;background:#080f20}.diagram-card:focus-visible{outline:2px solid #22d3ee}svg{display:block;font-family:Consolas,monospace}h2{font-size:18px;padding-top:18px}nav{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}a{color:#67d6ef}a:focus-visible{outline:2px solid #fbbf24}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px}.card{border:1px solid #26344b;border-top:3px solid var(--accent);border-radius:9px;padding:17px;background:#0c1628;scroll-margin-top:20px}h3{font-size:15px;line-height:1.45;margin:0 0 12px;color:#eff6ff}ul{margin:0;padding-left:18px}li{font-family:system-ui,sans-serif;font-size:14px;line-height:1.65;margin:0 0 10px}.sources{border-top:1px solid #273448;padding-top:10px;margin-top:12px;font-size:10px;color:#9fb0c8;line-height:1.7;overflow-wrap:anywhere}footer{border-top:1px solid #26344b;margin-top:30px;padding-top:18px;font-size:12px;line-height:1.6;color:#94a3b8}@media(max-width:600px){body{padding:20px 12px 36px}h1{font-size:21px}.diagram-card{padding:6px}.cards{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white;color:#172033}h1,h2,h3{color:#172033}.card{background:white;break-inside:avoid}.diagram-card{overflow:visible}svg{max-width:100%;height:auto}.release,.boundary{background:#f5f5f5;color:#172033}a{color:#172033}}
</style></head><body><main class="wrap"><header><span class="release">CURRENT DEPLOYED CODE · 31 OCTOBER 2026 · main 4d4d268</span><h1>Restaurant ERP — Full System Process Flow (Connected)</h1><p class="muted">One hand-built connected map of the current project: ${lanes.length} lanes, ${nodes.length} steps, ${edges.filter(e=>e.route!=='note').length} drawn arrows and ${cards.length} detailed source-backed cards. Purchase &amp; GRN, Accounts, Tasks, Reports, MIS and clone are database-backed—not the old demo flows. Actual Food Cost, low-stock daily summary and fail-closed COGS default are included.</p><p class="boundary">Scope: deployed implementation, not a guarantee of provider delivery or statutory compliance. Display currency is TSh; business-timezone helpers and internal FX identifiers still have legacy behavior. See cards 11, 12 and 33. Tall/wide map scrolls intentionally; distant links use matching connector notes.</p><nav aria-label="Explanation shortcuts"><a href="#card-23">Purchase / GRN</a><a href="#card-29">Invoice / payment</a><a href="#card-28">Actual COGS</a><a href="#card-30">Daily low stock</a><a href="#card-33">Known boundaries</a></nav><div class="legend">${legend}<span>→ direct flow</span><span>⇢ dashed reference (not a write)</span><span style="color:#34d399">→ green: transactional stock/confirmed flow</span></div></header><section class="diagram-card" tabindex="0" aria-label="Connected process map; scroll horizontally on small screens">${svg.join('\n')}</section><h2>Detailed Explanation — ${cards.length} Current Flows</h2><section class="cards" aria-label="Source-backed process details">${cards.map((c,i)=>`<article class="card" id="card-${i+1}" style="--accent:${palette[c.kind][1]}"><h3>${i+1}. ${esc(c.title)}</h3><ul>${c.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul><div class="sources">Source: ${c.sources.map(esc).join('<br/>')}</div></article>`).join('\n')}</section><footer>Offline documentation artifact, maintained without Archify as originally requested. Source: scripts/render-full-process-flow.cjs. Reference release: 4d4d268 / 619f11d; migration 0017. Existing stock, accounting and notification behavior is documented, not executed, by this file. Production signed-in UI acceptance and actual WhatsApp delivery are separate from local QA/release smoke evidence.</footer></main></body></html>\n`;
}
function validate(){
  if(index.size!==nodes.length)throw Error('Duplicate node ID');
  const laneIds=new Set(lanes.map(l=>l[0]));
  for(const n of nodes){if(!laneIds.has(n.lane)||n.col<0||n.col>5)throw Error('Invalid node placement');}
  for(const e of edges)if(!index.has(e.from)||!index.has(e.to))throw Error('Unknown edge endpoint');
  for(const c of cards)for(const src of c.sources)if(!fs.existsSync(path.join(__dirname,'..',src)))throw Error('Missing source: '+src);
}
if(require.main===module){validate();const output=path.join(__dirname,'..','docs','restaurant-erp-full-process-flow.html');fs.writeFileSync(output,render());console.log(JSON.stringify({output,lanes:lanes.length,nodes:nodes.length,drawnEdges:edges.filter(e=>e.route!=='note').length,cards:cards.length}));}
module.exports={render,validate,lanes,nodes,edges,cards};
