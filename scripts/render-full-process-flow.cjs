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
  ['cashcustody','Shift Cash Custody / HO Dispatch'], ['crm','Customer CRM / Loyalty / QR'], ['pwaapps','Waiter / Installable Apps'],
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
node('payment_capture','pos',3,'Payment Capture','Verified evidence set','database',0,'Collector + shift run');
node('void_order','pos',4,'Void / Reversal','Manager or Owner only','security',0,'Append-only record');
node('recipe','kitchen',0,'Recipe Builder','Atomic recipe save');
node('produce','kitchen',1,'Semi-FG Batch','Consumes + produces','backend');
node('stock_check','kitchen',2,'Stock Check','Direct raw + Semi-FG','backend');
node('kot','kitchen',3,'KOT / BOT Tickets','Kitchen / Bar; no price');
node('semifg_check','kitchen',4,'Semi-FG Check','Prepared stock view','security');
node('menu_image','kitchen',5,'Dish Photo Upload','Public resized JPEG','backend');
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
node('receipt','billing',0,'Paid POS Receipt','After full settlement','frontend',0,'Stock: posted at dispatch');
node('vat_invoice','billing',1,'VAT Invoice','Branch / item VAT','database',0,'Tender: FX Snapshot');
node('thankyou_billing','billing',2,'Thank You','Optional send','message',-38);
node('vat_summary','billing',2,'VAT Summary','All eligible sales','security',38);
node('fx','billing',4,'FX Snapshot','Configured tender rate','database',0,'Legacy INR keys remain');
node('thankyou','whatsapp',0,'Thank You','After sale commits','message');
node('offer','whatsapp',1,'Create Offer','Text + validity');
node('audience','whatsapp',2,'Audience Filter','Actor-visible contacts','security');
node('broadcast','whatsapp',3,'Send Broadcast','Best effort + log','message');
node('optout','whatsapp',4,'Opt-Out','Public, phone-only','security');
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
node('login_auth','admin',5,'Email Login','Password + throttle','security');
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
node('opening_float','cashcustody',0,'Opening Float','First run only','security',0,'Manager/Owner, non-negative');
node('live_summary','cashcustody',1,'Live Shift Summary','Read-model, no table','frontend',0,'Collected tenders + OPEN orders');
node('shift_expense','cashcustody',2,'Cash Expense Link','DB CHECK enforced','database',0,'Subtracts expected cash once');
node('ho_dispatch','cashcustody',3,'HO Cash Dispatch','Ends run, no next run','database',0,'Separate table, not handover');
node('ho_accept','cashcustody',4,'HO Acceptance','Owner only, no self-accept','security',0,'Signed discrepancy recorded');
node('register_member','crm',0,'Register Member','Explicit staff action','database',0,'Global identity, unique phone');
node('qr_issue','crm',1,'Issue QR','Revokes prior token','security',0,'Hash only persisted');
node('qr_lookup','crm',2,'Scan / Lookup','Identity only','backend',0,'Same error unknown vs revoked');
node('reward_earn','crm',3,'Earn Points','Server-read order total','database',0,'1 pt / TSh 1000, idempotent');
node('reward_redeem','crm',4,'Redeem Points','Advisory-locked per member','database',0,'1 pt = TSh 50, 12mo FIFO expiry');
node('repeat_order','crm',5,'Repeat Order Preview','Read-only, current catalog','backend',0,'Cashier re-confirms as new order');
node('waiter_order','pwaapps',0,'Waiter Order-Taking','Conventional dine-in only','frontend',0,'No price/payment fields sent');
node('pwa_install','pwaapps',1,'Installable Manifests','Waiter/Kitchen/POS','frontend',0,'Branded icon, shared sw.js');
node('app_downloads','pwaapps',2,'App Downloads Page','Module-filtered list','frontend',0,'Android/iOS install steps');
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
edge('confirm','payment_capture','write','evidence set created');
edge('payment_capture','void_order','reference','manager/owner may void');
edge('void_order','stock_deduct','reference','unserved lines restocked');
edge('payment_capture','receipt','reference','','note');
edge('recipe','menu_image','reference','optional dish photo');
edge('thankyou','optout','reference','skipped if opted out');
edge('optout','audience','reference','excluded from offer broadcast');
edge('login_auth','user','reference','session establishes identity');
chain(['opening_float','live_summary','shift_expense','ho_dispatch','ho_accept']);
edge('shift_start','opening_float','write','first run only');
edge('payment_capture','live_summary','reference','live tender read');
edge('blind_count','ho_dispatch','reference','alternative to next-shift close');
edge('shift_expense','blind_count','reference','','note');
edge('register_member','qr_issue','write');
edge('qr_issue','qr_lookup','reference');
edge('payment_capture','reward_earn','reference','standalone, not auto-wired');
edge('reward_earn','reward_redeem','reference');
edge('register_member','repeat_order','reference','phone-scoped history');
edge('repeat_order','confirm','reference','cashier re-adds as new order');
edge('waiter_order','kot','write','kitchen-first, no payment');
chain(['waiter_order','pwa_install','app_downloads'],'reference');
const cards = [];
function card(title, bullets, sources, kind='backend') { cards.push({title,bullets,sources,kind}); }
card('Order Capture - Branch POS',[
  'Select channel/table, counter and sellable same-branch menu items. Server checks session, grants, branch and the configured shift before accepting a sale.',
  'Persisted drafts can be edited/cancelled with no stock, cost, ticket or receipt effect. Dispatch preserves Fast Food/non-dine-in payment-first and Conventional dine-in KOT/BOT-first. Add items posts only the new dispatch; settlement never repeats stock/COGS. Draft revisions and exact replay prevent concurrent duplicate admission.'
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
  'The /kitchen screen flow: SENT -> PREPARING -> READY -> SERVED. Explicit POS_KITCHEN can prepare/ready but not bill; cashier serves. Item/quantity snapshots and action history exclude prices/customer/payment data. View/browser reprint posts no stock. Legacy missing snapshots remain unavailable; no physical printer/device integration is claimed.',
  'Preparation and payment stay separate. Cashier closes only a paid order whose tickets are served. Manager may cancel unpaid OPEN orders with a reason; original lines/cost/consumption remain, with no automatic restock/refund. Paid financial reversal is handled separately via the Void action.',
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
  'Persisted-source PROFORMA and automatic paid FINAL documents use permanent PF-/INV- branch/EAT-year sequence numbers. FINAL links the existing receipt and applicable proforma; it is not another sale. Immutable seller, item/name/code/price/effective VAT and FX snapshots survive master changes. TIN/VRN stay null/unverified; old missing snapshots remain unavailable. POS_CASHIER reads/prints after current branch/Owner-only checks; POS_KITCHEN alone has no financial access. Invoice-only browser print is separate from KOT/BOT. Issue/read/reprint creates no stock, payment or revenue.',
  'Counter 1/2 is saved on the sale. Counters share branch inventory and shift rules; the code does not promise independent cash-drawer ledgers.',
  'Overnight OPEN tables are retained with priority within the disclosed 200-row bound. Paid totals cover the full Tanzania settlement-day scope, including legacy completed sales, not just displayed rows. A lost acknowledgment permits only exact-key replay, not another payment.'
],['src/app/api/pos/orders/route.ts']);
card('Tanzania VAT - Current Implemented Rate Path',[
  'Line product-code snapshots preserve VAT export grouping even if the catalog code changes; captured effective rates remain authoritative. Only uncaptured legacy values fall back to existing live configuration. Documents do not create a second reporting/revenue source or change tax policy.',
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
  "Expected cash = accepted incoming counted cash (or, for a branch's first-ever run, its own recorded Manager/Owner opening float) + this run cash sales, minus every POSTED CASH expense linked to this run (a VOIDed expense is excluded live). Physical counted cash carries forward; card/UPI/other remain run-only summaries, not cumulative cash or bank transfers.",
  "A branch's first-ever opening float is modeled; no separate mid-shift top-up or safe-withdrawal movement type exists beyond linked CASH expenses. Time reminders alone do not auto-close a run. Ending a run instead as an HO cash dispatch (see the new Cash Custody lane) opens no next run at all — that is a deliberately different ending from this ordinary handover."
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
  'Current application reference: main 6e3b9ad, deployed November 5, 2026. Neon migration 0052 was applied and tracked (0044 through 0052 cover takeaway tokens, opening float, shift-linked expenses, HO cash dispatch, WhatsApp opt-out, customer registry, reward ledger and QR tokens). Guide status for Purchase and Accounts is Live DB.',
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
card('Payment Capture - Verified Collection Evidence',[
  "capturePosPayment posts one immutable payment + allocation row, sets paymentCaptured and stamps the collecting cashier, collectedAt and the open shift run — it is called once at CREATE (Fast Food/non-dine-in payment-first) or once at SETTLE (Conventional dine-in, after KOT). listPosPayments and verifiedPosPayment then cross-check every field (amount, tender, FX, shift run, receipt/FINAL linkage) and label a row CAPTURED only if the full evidence set is internally consistent — any mismatch reports UNAVAILABLE rather than inventing a figure.",
  "An OPEN (unpaid, dispatched-to-kitchen) order reports coverage: 'OPEN' with the real outstanding amount; an older paid order with no payment evidence reports coverage: 'LEGACY' using only its originally recorded total. This module never itself decides payment-first vs kitchen-first — that branching lives in pos-orders.ts's order flow."
],['src/lib/server/pos-payments.ts','src/db/schema/pos-payments.ts']);
card('Void / Reversal of a Paid Order',[
  "Voiding an order lets a Manager or Owner void an already PAID/COMPLETED order with a 3-500 character reason. It NEVER edits the original payment/receipt/FINAL/COGS rows — those stay immutable — and instead inserts one append-only pos_order_reversals record capturing the prior status, the cogsAmount at void time and the payment amount as refundLiabilityAmount (a recorded liability figure, not a bank refund or cash-drawer movement).",
  "Each order line is individually classified: a line whose kitchen ticket never reached SERVED (or had no ticket at all is treated conservatively as already handed over) is restocked through the real stock-ledger seam; an already-SERVED line is recorded as wastedLines only, with no new wastage-ledger posting in this pass. If the recipe/BOM used for restock lookup fails for any reason, the void still proceeds — affected lines fall back to wasted, never a silent partial restock. An exact-reason replay on an already-voided order returns the existing record; a different reason on an already-voided order is rejected with 409.",
  "Void authority requires lifecycleCapabilities(actor).canCancel and the actor's own branch (or Owner/SUPER_ADMIN); an OPEN (never-paid) order uses the separate existing cancel action, not this void path."
],['src/lib/server/pos-order-reversals.ts','src/db/schema/pos-order-reversals.ts'],'security');
card('Shift Cash Custody - Opening Float, Live Summary, Linked Expense',[
  "A branch's first-ever shift run may record an optional Manager/Owner-only opening float (non-negative, explicit zero distinct from not-provided); every later run instead carries forward the real accepted handover balance, so this float can never silently re-apply to a second run.",
  "The live shift summary is a pure read-model over the CURRENT open run — no new table — showing actual collected Cash/Card/UPI/Other via the same collection seam shift-close uses, completed/paid totals with the established visible/actual/owner-only split, and every branch-wide currently-OPEN order (carried over by policy, never force-completed, flagged if dispatched under an earlier already-ended run).",
  "A branch_expenses row can only carry a shiftRunId when its payment_method is CASH, and a CASH expense's shiftRunId is always resolved server-side from the branch's own currently-open run (never an accepted client field) — both enforced by Postgres CHECK constraints, not just application code. endShiftAndHandover subtracts every POSTED (non-VOIDed) such CASH expense from expected cash exactly once; a NON_CASH expense never touches drawer cash."
],['src/lib/server/shifts.ts','src/lib/server/shift-summary.ts','src/db/schema/shifts.ts'],'database');
card('HO Cash Dispatch - Final Handover to Head Office',[
  "dispatchShiftCashToHo ends a run exactly like the ordinary next-shift close (same shared expected-cash helper, so the two paths cannot drift apart) but opens NO successor run — a deliberately separate ending from the Blind Count / Accept Shift cycle above. It writes a dedicated ho_cash_dispatches row (not a reuse of shift_handovers, whose toRunId stays a real required next-run reference) recording counted/retained-float/dispatched amounts and the dispatcher.",
  "acceptHoCashDispatch is Owner/SUPER_ADMIN only — no branch-scoped role can reach this endpoint at all, which structurally rules out cross-branch substitution. Self-acceptance (the same actor who dispatched) and a second accept on an already-ACCEPTED dispatch are both rejected. A counted-vs-accepted mismatch is accepted immediately with the signed difference recorded in discrepancyInr — there is no separate DISPUTED workflow."
],['src/lib/server/shifts.ts','src/app/api/ho-cash-dispatches/route.ts','src/app/cash-drop/ho-cash-dispatch-panel.tsx'],'security');
card('Customer Membership Registry - Global Identity, Branch-Scoped Edit',[
  "findOrCreateCustomer is an explicit staff action (never inferred from merely capturing a phone/name on a POS order) keyed on a unique normalized phone — a genuine insert race between two equivalent-phone-variant registrations resolves to the same one row via the database's own 23505 unique-violation path, re-read rather than surfaced as an error. Membership identity itself is GLOBAL (one shared record across every branch), but editing or merging a record is restricted to the Branch Manager who originally registered it, or the Owner for any record.",
  "mergeCustomers folds one record into another (never the reverse) and rejects self-merge, double-merge, and merging into an already-merged record; both the source and target sides are independently checked for edit authority. getCustomerWithConsent reads WhatsApp opt-out status live from the opt-out table by phone — it is never duplicated onto the customer row itself."
],['src/lib/server/customers.ts','src/db/schema/customers.ts']);
card('Membership QR Issuance and Scan Lookup',[
  "issueMemberQrToken generates a random opaque token (not a URL, not derived from phone/name/id) and persists only its sha256 hash — the same convention as session tokens — returning the raw value exactly once for display as a QR PNG; it is never retrievable again afterward. Issuing a new token implicitly revokes any previous one (a lost code is invalidated simply by re-issuing), and a partial unique index backs \"at most one ACTIVE token per customer\" at the database layer itself, not only in application code.",
  "lookupMemberByQrToken resolves a scanned/typed code to identity ONLY — it does not itself authorize a redemption, a sale, or any other action; that is exactly equivalent to a staff member typing the customer's phone in manually. An unknown token and a revoked token return the byte-identical generic error, leaking no detail about which case occurred. Scanning assumes a standard HID barcode/QR scanner that types decoded text into a focused input; there is no camera-based scanning mode or printable membership card."
],['src/lib/server/customer-qr.ts','src/db/schema/customer-qr.ts'],'security');
card('Reward Points Ledger - Earn, Redeem, Expire, Reverse',[
  "The ledger is append-only: a balance is always derived by replaying reward_events (earnPoints/redeemPoints/reverseEarnForOrder/expireOldEarns), never an independently mutable points counter. Owner-approved policy: 1 point per TSh 1,000 of a PAID/COMPLETED order's real server-read total (never a client-supplied amount, floor division, no minimum order), 1 point redeems for a TSh 50 discount snapshotted at redemption time, and an earned lot expires 12 months after it was earned on a true FIFO basis.",
  "earnPoints is idempotent per sourceOrderId (one EARN per order, DB-unique-enforced); redeemPoints is serialized per customer via a Postgres advisory lock so two concurrent redemption requests cannot both read the same balance and overspend it. reverseEarnForOrder nets a voided order's own earn back to zero and cannot double-reverse (unique index on reversesEventId).",
  "This ledger is NOT auto-wired into the real POS checkout/void flow in this pass — it is a standalone, independently callable/testable primitive only. No staff-facing redemption UI and no scheduled expiry cron exist yet, and redemption is not yet posted as a discount line in Accounts/VAT; the edge from Payment Capture to Earn Points on the map above is a dashed reference for exactly this reason, not a write."
],['src/lib/server/rewards.ts','src/db/schema/rewards.ts']);
card('Repeat Order Preview - Current Catalog, Never Historical Price',[
  "recentOrdersForMember lists a member's own PAID/COMPLETED orders at one specific branch, phone-matched, with the same operationalOrderVisibility filter every other order read applies — a hidden (ownerOnly) order never surfaces here for a non-Owner. There is deliberately no cross-branch matching: a cloned menu item's identity on another branch is a separately unresolved mapping problem, not silently assumed safe.",
  "repeatOrderPreview is read-only and never posts an order itself. Every still-available line is re-priced from the CURRENT menuItems row, never the historical snapshot, and flags a removed or now-inactive item plus any price change. Placing the repeat order reuses the existing, unmodified order-creation flow — the cashier adding the same items as a normal new order is the required explicit confirmation. A foreign-member, different-branch, hidden or nonexistent order id all return the identical generic 404."
],['src/lib/server/repeat-orders.ts']);
card('WhatsApp Opt-Out - Voluntary, Phone-Only',[
  "A customer's own explicit \"stop messaging me\" click on the public, unauthenticated /whatsapp-optout page records their phone in a dedicated opt-out table — never inferred from merely capturing a phone on an order, and never tied to the fuller membership registry above. A repeat opt-out click is a harmless no-op, never an error or a duplicate row.",
  "Both the POS thank-you send and the offer-alert broadcast (preview and send) check this table and skip or exclude an opted-out phone accordingly; the underlying sale or offer preview itself still succeeds — only the WhatsApp send is skipped. The thank-you and offer messages carry an opt-out link only once an app public URL is configured."
],['src/lib/server/whatsapp-preferences.ts','src/db/schema/whatsapp.ts'],'message');
card('Dish Photo Upload - Public, Resized Thumbnail',[
  "A menu item's photo is validated by real file-signature sniffing (PNG/JPEG/WebP only, animated frames rejected, 8 MB cap, pixel-count ceiling), then always resized/recompressed to a consistent JPEG thumbnail (max 640x640) before it is stored — the original upload is never kept verbatim.",
  "Unlike task evidence or purchase documents (private, signed URLs), a dish photo is a decorative, customer-facing POS tile asset and is stored in a PUBLIC Vercel Blob store with a plain URL. This validation is not a claim of malware scanning or any content moderation beyond the stated format/size/dimension checks."
],['src/lib/server/menu-images.ts']);
card('Waiter Order-Taking + Installable PWA Apps',[
  "A new POS_WAITER module grants table order-taking only — no billing, payment or settle UI reaches a waiter-only actor; createPosOrder itself rejects a POS_WAITER-only actor with 403 if the branch/channel combination would require payment-first (Fast Food, or any non-dine-in channel), so a waiter can never silently create an order marked paid with no money collected. settlePosOrder stays reachable only to POS_CASHIER. The /waiter screen picks an open Conventional dine-in table or starts a new one, adds items via the existing menu tile picker, shows a running total for telling the customer, and sends straight to the kitchen — it never submits a price or payment field.",
  "Waiter, Kitchen and POS each ship as a separately installable PWA: a per-app web manifest (/api/pwa/{waiter,kitchen,pos}) branded with the restaurant's own configured name/logo, scoped to that app's own route, sharing one minimal service worker (public/sw.js). This is a standard browser \"Add to Home Screen\" install — there is no native app-store binary, push notifications, or offline data sync claimed.",
  "/app-downloads lists only the installable apps the current user's own module access actually grants, each with an Open link and separate Android/iOS install instructions; it grants no additional access itself — module checks happen at the real API/page layer exactly as before."
],['src/app/waiter/page-content.tsx','src/app/app-downloads/page-content.tsx','src/lib/server/pwa-manifest.ts','src/lib/moduleAccess.ts']);
card('Email + Password Login, Self-Service Change Password',[
  "Sign-in now identifies a user by email + password (verifyPassword against a stored hash), not by phone — a per-email AND a per-source-IP login throttle (10 / 30 attempts) both block before any password check runs, using a separately-committed transaction so the throttle write itself can never be rolled back by the login attempt it is guarding.",
  "/api/auth/change-password is reachable by ANY authenticated user for their OWN account only (no admin override here — deliberately the same authority model as the login form itself): it requires the correct current password, a new password of at least 12 characters, and bumps the account's tokenVersion so every OTHER device's existing session is revoked immediately while a fresh session is issued for the request making the change, so the user is not logged out by their own password change."
],['src/app/api/auth/login/route.ts','src/app/api/auth/change-password/route.ts','src/lib/server/password.ts'],'security');
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
  return `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="application-revision" content="7a8d790"/><title>Restaurant ERP — Full System Process Flow (Current)</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;padding:28px 24px 60px;background:#020617;color:#dbe5f4;font-family:Consolas,monospace}.wrap{max-width:1720px;margin:auto}h1{font-size:24px;margin:0 0 12px;color:#f1f5f9}p{line-height:1.65;font-size:14px;max-width:1250px}.muted{color:#a3b2c8}.release{display:inline-block;padding:6px 10px;border:1px solid #166b56;border-radius:6px;color:#6ee7b7;background:#052b23;font-size:12px}.boundary{border-left:3px solid #fbbf24;background:#251b0c;padding:12px 16px;color:#fde7b3;max-width:1500px}.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;margin:18px 0}.legend span{display:flex;align-items:center;gap:7px}.legend i{width:9px;height:9px;border-radius:50%}.diagram-card{overflow-x:auto;border:1px solid #26344b;border-radius:12px;padding:12px;margin:22px 0;background:#080f20}.diagram-card:focus-visible{outline:2px solid #22d3ee}svg{display:block;font-family:Consolas,monospace}h2{font-size:18px;padding-top:18px}nav{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}a{color:#67d6ef}a:focus-visible{outline:2px solid #fbbf24}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px}.card{border:1px solid #26344b;border-top:3px solid var(--accent);border-radius:9px;padding:17px;background:#0c1628;scroll-margin-top:20px}h3{font-size:15px;line-height:1.45;margin:0 0 12px;color:#eff6ff}ul{margin:0;padding-left:18px}li{font-family:system-ui,sans-serif;font-size:14px;line-height:1.65;margin:0 0 10px}.sources{border-top:1px solid #273448;padding-top:10px;margin-top:12px;font-size:10px;color:#9fb0c8;line-height:1.7;overflow-wrap:anywhere}footer{border-top:1px solid #26344b;margin-top:30px;padding-top:18px;font-size:12px;line-height:1.6;color:#94a3b8}@media(max-width:600px){body{padding:20px 12px 36px}h1{font-size:21px}.diagram-card{padding:6px}.cards{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white;color:#172033}h1,h2,h3{color:#172033}.card{background:white;break-inside:avoid}.diagram-card{overflow:visible}svg{max-width:100%;height:auto}.release,.boundary{background:#f5f5f5;color:#172033}a{color:#172033}}
</style></head><body><main class="wrap"><header><span class="release">CURRENT SYSTEM SNAPSHOT · 5 NOVEMBER 2026</span><h1>Restaurant ERP — Full System Process Flow (Connected)</h1><p class="muted">Proforma and Final documents are internal sales documents — not a fiscal receipt. No TRA/EFD integration or compliance claim is made.</p><p class="muted">One hand-built connected map of the current project: ${lanes.length} lanes, ${nodes.length} steps, ${edges.filter(e=>e.route!=='note').length} drawn arrows and ${cards.length} detailed source-backed cards. Purchase &amp; GRN, Accounts, Tasks, Reports, MIS and clone are database-backed—not the old demo flows. Actual Food Cost, low-stock daily summary and fail-closed COGS default are included.</p><p class="boundary">Scope: current released implementation; not a guarantee of provider delivery or statutory compliance. Display currency is TSh; business calendar uses Tanzania EAT while internal FX compatibility identifiers retain legacy names. See cards 11, 12 and 45. Tall/wide map scrolls intentionally; distant links use matching connector notes.</p><nav aria-label="Explanation shortcuts"><a href="#card-23">Purchase / GRN</a><a href="#card-29">Invoice / payment</a><a href="#card-28">Actual COGS</a><a href="#card-30">Daily low stock</a><a href="#card-45">Known boundaries</a></nav><div class="legend">${legend}<span>→ direct flow</span><span>⇢ dashed reference (not a write)</span><span style="color:#34d399">→ green: transactional stock/confirmed flow</span></div></header><section class="diagram-card" tabindex="0" aria-label="Connected process map; scroll horizontally on small screens">${svg.join('\n')}</section><h2>Detailed Explanation — ${cards.length} Current Flows</h2><section class="cards" aria-label="Source-backed process details">${cards.map((c,i)=>`<article class="card" id="card-${i+1}" style="--accent:${palette[c.kind][1]}"><h3>${i+1}. ${esc(c.title)}</h3><ul>${c.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul><div class="sources">Source: ${c.sources.map(esc).join('<br/>')}</div></article>`).join('\n')}</section><footer>Offline documentation artifact. Source: scripts/render-full-process-flow.cjs. Application release: 6e3b9ad; migrations 0044 through 0052, including the Waiter/PWA/email-login release. Existing stock, accounting and notification behavior is documented, not executed, by this file. Production signed-in UI acceptance and actual WhatsApp delivery are separate from local QA/release smoke evidence.</footer></main></body></html>\n`;
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
