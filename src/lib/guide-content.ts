import type { ModuleKey } from "@/lib/moduleAccess";
export interface GuideModule {
  module: ModuleKey; route: string; icon: string;
  cat: "frontend" | "backend" | "finance" | "admin" | "whatsapp";
  status: "live" | "pending" | "mixed";
  title: string; short: string; what: string; how: string[]; example: string;
  /** Lookup key for GUIDE_EXAMPLES when two modules share the same route (e.g. Accounts tabs) — defaults to `route`. */
  exampleKey?: string;
}
interface BilingualGuideModule extends GuideModule { hinglish: Pick<GuideModule, "title" | "short" | "what" | "how" | "example">; }
// Seventeen bilingual chapters. "live" means database-backed functionality, not a production-deployment claim. Keep standalone guide in sync.
export const GUIDE_MODULES: BilingualGuideModule[] = [
  {
  "module": "DASHBOARD_OWNER",
  "route": "/dashboard",
  "icon": "📊",
  "cat": "frontend",
  "status": "live",
  "title": "Owner Dashboard",
  "short": "Real branch KPIs, charts and saved MIS snapshots.",
  "what": "Reads completed POS sales, branch inventory, overdue tasks, saved MIS and actual closing variances. Inventory valuation excludes missing vendor rates. Food cost uses current recipes/rates: an estimate, not historical posted COGS. Prime cost remains null (N/A); unavailable MIS/cash metrics show —. Compiled food cost is an arithmetic mean of measured branch estimates, not a weighted chain ratio.",
  "how": [
    "Select a permitted branch or the Owner compiled view.",
    "Review Sales — Today, Inventory Value, Avg. Food Cost %, Overdue Tasks and branch detail.",
    "Inspect missing-rate notes, saved MIS coverage, 14-day revenue trend and month-to-date channel mix; viewing writes nothing."
  ],
  "example": "Example: a material without a vendor rate is excluded from value with a missing-rate warning. No saved MIS snapshot means —, not an invented score.",
  "hinglish": {
    "title": "Owner Dashboard",
    "short": "Real branch KPIs, charts aur saved MIS snapshots.",
    "what": "Completed POS sales, branch inventory, overdue tasks, saved MIS aur actual closing variance padhta hai. Missing vendor rate wale material value se exclude hain. Food cost current recipes/rates ka estimate hai, historical posted COGS nahi. Prime cost null (N/A); unavailable MIS/cash par — hai. Compiled food cost measured branch estimates ka arithmetic mean hai, weighted chain ratio nahi.",
    "how": [
      "Permitted branch ya Owner compiled view chuno.",
      "Sales — Today, Inventory Value, Avg. Food Cost %, Overdue Tasks aur branch detail dekho.",
      "Missing-rate notes, saved MIS coverage, 14-day revenue trend aur month-to-date channel mix dekho; viewing se write nahi hota."
    ],
    "example": "Example: vendor rate na ho to material value se exclude aur warning aati hai. Saved MIS snapshot na ho to — dikhega, invented score nahi."
  }
},
  {
  "module": "REPORTS",
  "route": "/reports",
  "icon": "📑",
  "cat": "frontend",
  "status": "live",
  "title": "Reports",
  "short": "Six database-backed reports with scoped rows and CSV exports.",
  "what": "Sales Trend reads POS sales; MIS reads saved branch snapshots; Food Cost estimates sold-item recipe cost at current vendor rates, not historical posted COGS. Inventory Variance reads recorded counts, Cash Reconciliation actual shift closings, and Aggregator Reconciliation saved settlements. Missing recipes/rates are disclosed; incomplete cost totals stay unavailable. Reports estimates do not connect Accounts P&L revenue/COGS; prime cost is unavailable.",
  "how": [
    "Open a report card and select a permitted branch.",
    "Set Days, Month (IST), or From/To as offered; review rows, coverage and exclusion reasons.",
    "Export CSV downloads displayed real rows; Food Cost also offers branch-summary export."
  ],
  "example": "Example: Food Cost shows sold quantities and current BOM cost where available; missing recipe/rate reasons prevent silently understated branch cost.",
  "hinglish": {
    "title": "Reports",
    "short": "Chhe DB-backed reports, scoped rows aur CSV exports.",
    "what": "Sales Trend real POS sales, MIS saved branch snapshots aur Food Cost sold items ka current recipe/vendor-rate estimate padhta hai, historical posted COGS nahi. Inventory Variance recorded counts, Cash actual shift closings aur Aggregator saved settlements se aate hain. Missing recipe/rate disclose hain; incomplete cost total unavailable hai. Reports estimate se Accounts P&L revenue/COGS connect nahi hote; prime cost unavailable hai.",
    "how": [
      "Report card kholo aur permitted branch chuno.",
      "Diye gaye Days, Month (IST), ya From/To set karo; rows, coverage aur exclusion reason padho.",
      "Export CSV displayed real rows deta hai; Food Cost ka branch-summary export bhi hai."
    ],
    "example": "Example: Food Cost sold qty aur current BOM estimate dikhata hai; missing recipe/rate reason aata hai, cost silently kam nahi hoti."
  }
},
  {
  "module": "MIS_PERFORMANCE",
  "route": "/performance",
  "icon": "🏆",
  "cat": "frontend",
  "status": "live",
  "title": "MIS Leaderboard",
  "short": "Saved branch-level MIS rankings and measured-component coverage.",
  "what": "Manual Compute MIS uses real recurring tasks, one-time delegation, night variance and closed shifts with base weights 40/30/20/10. Missing components are excluded; remaining weights re-normalize to 100%. Components used preserves snapshot coverage. Branches without measurable data are skipped. These persisted branch/period snapshots are not employee scores, payroll results or cron updates.",
  "how": [
    "Set Period start and Period end for a window of at most 31 days.",
    "Owner or CENTRAL_STORE_MGR clicks Compute MIS to save/recompute; other permitted readers view saved scores.",
    "Compare branch On Time, Delay, Not Done and Components used before ranking; Export CSV exports visible scores."
  ],
  "example": "Example: only recurring/delegation data exists: weights become 40/70 and 30/70. Missing variance/cashier is not scored zero.",
  "hinglish": {
    "title": "MIS Leaderboard",
    "short": "Saved branch-level MIS rank aur measured-component coverage.",
    "what": "Manual Compute MIS real recurring tasks, one-time delegation, night variance aur closed shifts par 40/30/20/10 base weights lagata hai. Missing components exclude karke baaki weights 100% par re-normalize hote hain. Components used snapshot coverage rakhta hai. Data na ho to branch skip; saved branch/period snapshots employee scores, payroll ya cron updates nahi hain.",
    "how": [
      "Period start aur Period end mein maximum 31-day window chuno.",
      "Owner ya CENTRAL_STORE_MGR Compute MIS se save/recompute kare; doosre permitted readers saved scores dekhein.",
      "Rank se pehle branch On Time, Delay, Not Done aur Components used dekho; Export CSV visible scores deta hai."
    ],
    "example": "Example: sirf recurring/delegation data ho to weights 40/70 aur 30/70 hain. Missing variance/cashier ko zero nahi milta."
  }
},
  {
  "module": "TASKS_DELEGATION",
  "route": "/tasks",
  "icon": "✅",
  "cat": "frontend",
  "status": "live",
  "title": "Tasks & Checklists",
  "short": "Persisted recurring definitions, one-time delegation and completion.",
  "what": "Definitions and delegated completion save to PostgreSQL. Enter an existing same-branch assignee user ID manually; no dropdown. Pause/Resume changes definitions, not generated occurrences. No cron recurrence/escalation, reminders, camera capture, geofence verification or file-upload storage exists. Evidence saves a reference link/filename, not file bytes.",
  "how": [
    "Practice only in a QA branch: New Recurring / Checklist saves title, doer user ID, frequency, anchor assign date and shift time.",
    "Delegate Task saves a one-time task with same-branch user ID, priority and due time.",
    "Mark Done requires non-empty evidence for ONE_TIME on both client and server. Recurring instance completion permits no attachment, but this UI manages definitions, not generated recurring instances."
  ],
  "example": "Example: delegate Clean fridge to an existing QA user ID. Mark Done with a reference: DONE persists after reload; no image is uploaded and no cron job is scheduled.",
  "hinglish": {
    "title": "Tasks & Checklists",
    "short": "Recurring definitions, one-time delegation aur completion persist hote hain.",
    "what": "Definitions aur delegated completion PostgreSQL mein save hain. Existing same-branch assignee user ID manually daalo; dropdown nahi. Pause/Resume definitions badalta hai, generated occurrences nahi. Cron recurrence/escalation, reminders, camera, geofence verification aur file-upload storage nahi hain. Evidence sirf reference link/filename save karta hai, file bytes nahi.",
    "how": [
      "Sirf QA branch mein New Recurring / Checklist se title, doer user ID, frequency, anchor assign date aur shift time save karo.",
      "Delegate Task mein same-branch user ID, priority aur due time se one-time task save karo.",
      "Mark Done mein ONE_TIME ko non-empty evidence client aur server dono maangte hain. Recurring instance completion par optional hai, par UI definitions manage karta hai, generated recurring instances nahi."
    ],
    "example": "Example: existing QA user ID ko Clean fridge do. Reference ke saath Mark Done: DONE reload ke baad rehta hai; image upload aur cron scheduling nahi hoti."
  }
},
  {
    "module": "INVENTORY",
    "route": "/inventory",
    "icon": "📦",
    "cat": "backend",
    "status": "live",
    "title": "Inventory",
    "short": "Real branch stock, units, minimum/maximum levels and alerts.",
    "what": "Stock records are saved in PostgreSQL. Material names share a common catalog, but quantities and alert levels belong to individual branches. Owner can view all branches; permitted branch staff operate within their own branch.",
    "how": [
      "Choose a permitted branch and review stock.",
      "Add Item: enter name, branch, unit, opening quantity and minimum/maximum levels.",
      "An existing catalog name reuses its material/unit. Below minimum shows Low stock; above a positive maximum shows Overstock.",
      "This screen does not create purchase indents or manage expiry batches."
    ],
    "example": "Illustration: Chicken at 9 kg against a 20 kg minimum shows Low stock for that branch. Adding stock does not change another branch’s record.",
    "hinglish": {
      "title": "Inventory",
      "short": "Real branch stock, units, min/max levels aur alerts.",
      "what": "Stock PostgreSQL mein save hota hai. Material catalog common hai, par quantity aur alert levels har branch ke alag hain. Owner sab branches dekh sakta hai; permitted branch staff sirf apni branch mein kaam karte hain.",
      "how": [
        "Permitted branch chuno aur stock dekho.",
        "Add Item mein naam, branch, unit, opening qty aur min/max bharo.",
        "Existing catalog naam par wahi material/unit use hoti hai. Minimum se kam par Low stock; positive maximum se zyada par Overstock aata hai.",
        "Is screen se purchase indent nahi banti aur expiry batches manage nahi hote."
      ],
      "example": "Example: Chicken 9 kg aur minimum 20 kg ho to us branch mein Low stock dikhta hai. Doosri branch ka stock nahi badalta."
    }
  },
  {
  "module": "PURCHASE_ORDER",
  "route": "/purchase",
  "icon": "🛒",
  "cat": "backend",
  "status": "mixed",
  "title": "Purchase & GRN",
  "short": "Saved GRN quality, once-only stock and expected vendor refund/credit claims.",
  "what": "Indent approvals, PO, bill-step metadata and every GRN line persist. Quality and accepted stock commit atomically once. New FAIL/PARTIAL decisions also create failed-quantity vendor return/refund claims at saved PO rates, rounded per line. These are expected refund/credit claims, NOT proof of physical return, vendor acceptance or money received; no cash, journal or second stock deduction is created. Store quality needs PURCHASE_ORDER and INVENTORY; descriptive general claims do not post stock. Vendor returns lists saved claims; trusted earlier failures can be registered explicitly once. Ambiguous legacy quality/claims require reconciliation. Invoice tax adjustments, settlement, real uploads and spike automation are separate work.",
  "how": [
    "Use only a QA branch: raise/submit an indent, then approve/reject with the relevant permission.",
    "New Purchase selects an existing vendor and an Approved indent for the same branch. All approved materials/quantities are locked; enter each line rate. General purchase uses description/amount without an indent. Upload Bill (optional) only marks the step; Mark Material Received creates a real GRN.",
    "Open Quality Check on a ready GRN. Inspect all received lines; choose PASS, FAIL or PARTIAL. For PARTIAL enter each failed quantity in its own unit; add a failure note for FAIL/PARTIAL and Save quality. Reload to inspect persisted failed/accepted quantities and posting state. New FAIL/PARTIAL also queues expected refund/credit claims; inspect Vendor returns.",
    "For an unconfirmed outcome use Check saved quality or explicitly Replay exact request; inputs stay locked and no automatic retry occurs. A legacy reconciliation warning must be reviewed by an administrator, not reposted. Vendor returns can register trusted historical failures with the same no-edit request; it cannot record money received."
  ],
  "example": "Example: rice failed 2.125 kg at saved rate INR 10.25/kg creates a saved INR 21.78 expected claim. Accounts VENDOR_REFUNDS can read it; neither a cash receipt nor a second stock deduction is posted.",
  "hinglish": {
    "title": "Purchase & GRN",
    "short": "Saved GRN quality, ek baar stock aur expected vendor refund/credit claims.",
    "what": "Indent approvals, PO, bill-step metadata aur har GRN line persist hain. Quality aur accepted stock ek atomic transaction mein sirf ek baar post hote hain. Naye FAIL/PARTIAL par failed qty ke saved PO rate se rounded expected vendor return/refund claims bhi bante hain. Yeh expected refund/credit claim hai, physical return, vendor acceptance ya paisa received ka proof NAHI; cash, journal aur dobara stock deduction nahi hota. Store quality ko PURCHASE_ORDER aur INVENTORY chahiye; general descriptive claims stock nahi badhate. Vendor returns mein saved claims aur trusted purane failed GRN ka explicit once-only registration hai. Ambiguous legacy records par reconciliation required. Invoice tax adjustment, settlement, real upload aur spike automation alag kaam hai.",
    "how": [
      "Sirf QA branch mein indent raise/submit karo; relevant permission se approve/reject karo.",
      "New Purchase mein existing vendor aur same branch ki Approved indent chuno. Saare approved materials/quantities locked hain; har line ka rate bharo. General purchase description/amount se bina indent banti hai. Upload Bill (optional) sirf step mark hai; Mark Material Received real GRN banata hai.",
      "Ready GRN ka Quality Check kholo aur har received line dekho. PASS, FAIL ya PARTIAL chuno. PARTIAL par har line ki apni unit mein failed qty bharo; FAIL/PARTIAL ka note likhkar Save quality karo. Reload par saved failed/accepted quantities aur posting state verify karo. Naye FAIL/PARTIAL ka expected refund/credit claim Vendor returns mein dekho.",
      "Outcome unconfirmed ho to Check saved quality ya explicitly Replay exact request use karo. Inputs locked rehte hain; automatic retry nahi. Purane GRN ki reconciliation warning ko administrator review kare; repost mat karo. Vendor returns se trusted historical failure ka same no-edit request register kar sakte ho; paisa received record nahi hota."
    ],
    "example": "Example: rice 2.125 kg failed, saved rate INR 10.25/kg par INR 21.78 ka expected claim save hota hai. VENDOR_REFUNDS wale Accounts ko dikhega; cash receipt ya dobara stock deduction nahi."
  }
},
  {
    "module": "POS_CASHIER",
    "route": "/pos",
    "icon": "💳",
    "cat": "frontend",
    "status": "live",
    "title": "POS / Cashier",
    "short": "Real billing: BOM-driven KOT + GST invoice + 2 counters + multi-currency + WhatsApp Thank You.",
    "what": "Confirming an order checks and atomically deducts its direct raw-material stock plus any already-PRODUCED Semi-FG stock (never a Semi-FG's own embedded raw ingredients) in real branch inventory — insufficient stock, or a Semi-FG that hasn't been produced yet, rejects the whole order, never a partial sale. The order splits into a kitchen KOT (item + qty, no price) and a customer receipt (price + GST). Each branch supports 2 billing counters. An optional foreign payment currency locks its exchange rate at sale time (GST invoice always stays in INR). A customer WhatsApp number triggers a real Thank You message after confirm. Operational confidentiality only: only Owner can set or restore Owner-only visibility, with a 3-500 character reason and audit history. All non-Owner operational users, including an accountant with official-report access, see filtered orders and visible totals only. Owner sees actual, visible and private totals for the selected scope. Visibility never cancels a sale, reverses stock or removes official records: authorized OFFICIAL_SALES_REPORTS exports remain actual. Existing printouts/downloads cannot be revoked; Dashboard/Reports now use database-backed permission-scoped data, not mock demos; official exports remain separate actual-record disclosure.",
    "how": [
      "In a QA test branch/account with POS_CASHIER, first Start Shift if shifts are configured but no run is open. Review and Accept Handover if PENDING: sales are blocked until acceptance. Unconfigured branches retain legacy POS but cannot real-close until shifts are configured. New Order writes real orders and stock; choose channel, counter (1 or 2), items and tender.",
      "Confirm Order checks and deducts direct raw + produced Semi-FG stock, and posts the order — a shortfall, or a dish whose Semi-FG hasn't been produced yet (see Menu & BOM's Production panel), rejects the whole order with a 409.",
      "The receipt shows GST (CGST/SGST or IGST) when the branch and company GST state codes are configured, else it bills tax-free with a clear note.",
      "Pick a non-INR payment currency (configured via the Owner-only Currency Rates panel) to also show the payable amount in that currency alongside the INR invoice total."
    ],
    "example": "Example: 2 plates of Butter Chicken on Counter 2, paid in USD. Receipt shows ₹363.20 (GST invoice, incl. 5% GST) and Payable in USD: $4.30 (rate locked at ₹84.50). Real direct raw material (chicken) + already-produced Semi-FG gravy stock both deduct from that branch's inventory — the gravy's own raw ingredients were already consumed when it was produced, not again at sale.",
    "hinglish": {
      "title": "POS / Cashier",
      "short": "Real billing: BOM-driven KOT + GST invoice + 2 counters + multi-currency + WhatsApp Thank You.",
      "what": "Order confirm karte hi uska direct raw-material stock aur jo bhi Semi-FG pehle se PRODUCE ho chuka hai uska stock check+deduct hota hai (Semi-FG ke apne embedded raw ingredients kabhi dobara nahi) — stock kam ho, ya koi Semi-FG abhi produce nahi hua, to poora order reject hota hai, kabhi partial sale nahi. Order 2 jagah split hota hai: kitchen ke liye KOT (item+qty, price nahi) aur customer ke liye receipt (price+GST). Har branch mein 2 billing counters hain. Optional foreign payment currency sale time par apna FX rate lock kar leti hai (GST invoice hamesha INR mein). Customer WhatsApp number do to confirm hote hi real Thank You message jaata hai. Yeh sirf operational confidentiality hai: sirf Owner, 3-500 character reason aur audit history ke saath, Owner-only visibility set ya restore kar sakta hai. Har non-Owner, official-report access wala accountant bhi, operational POS mein filtered orders aur visible totals hi dekhega. Owner selected scope ke actual, visible aur private totals dekhta hai. Visibility se sale cancel, stock reverse ya official records remove nahi hote: authorized OFFICIAL_SALES_REPORTS exports actual rehte hain. Existing printouts/downloads revoke nahi hote; Dashboard/Reports ab DB-backed permission-scoped data hain, mock demo nahi; official exports alag actual-record disclosure hain.",
      "how": [
        "POS_CASHIER wale QA test branch/account mein configured shifts par run open na ho to Start Shift karo. PENDING handover check karke Accept Handover karo: acceptance tak sale blocked hai. Unconfigured branch ka legacy POS chalta hai par config ke bina real-close nahi. New Order real orders/stock likhta hai; channel, counter (1 ya 2), items aur tender chuno.",
        "Confirm Order direct raw + produced Semi-FG stock check+deduct karta hai aur order post karta hai — kami ho, ya kisi dish ka Semi-FG abhi produce na hua ho (Menu & BOM ke Production panel se produce karo), to 409 ke saath poora order reject.",
        "Receipt GST dikhati hai (CGST/SGST ya IGST) jab branch aur company ke GST state code set hon, warna clear note ke saath tax-free bill ban jaata hai.",
        "Non-INR payment currency chuno (Owner-only Currency Rates panel se configured) to INR invoice total ke saath us currency mein payable amount bhi dikhta hai."
      ],
      "example": "Example: 2 plate Butter Chicken Counter 2 par, USD mein payment. Receipt ₹363.20 (GST invoice, 5% GST samet) aur Payable in USD: $4.30 (rate lock ₹84.50) dikhati hai. Real direct raw material (chicken) + pehle se produced Semi-FG gravy dono stock us branch ki inventory se minus hote hain — gravy ka apna raw ingredient production ke time hi consume ho chuka tha, sale par dobara nahi."
    }
  },
  {
    "module": "CASH_DROP",
    "route": "/cash-drop",
    "icon": "🔒",
    "cat": "frontend",
    "status": "live",
    "title": "Blind Cash Drop",
    "short": "Locally implemented real database closing: blind count, End Shift & Handover, then acceptance.",
    "what": "With CASH_DROP access, count physical notes and coins without seeing expected cash before submission. End Shift & Handover saves a real PostgreSQL cash-drop record, ends the current run and opens the next run with a PENDING handover. Expected cash equals accepted incoming physical cash plus this run's completed CASH sales; shortage/excess is counted minus expected. Card/UPI/Other are this run's receipts only, never carried-forward drawer balances or real bank/payment transfers. The next run cannot sell or close until its handover is accepted. Branches without configured shifts retain legacy POS, but cannot real-close until configured. Initial cash float and safe withdrawals are not modeled. This is local implementation status, not a production-live claim. Owner-only orders still count in actual cash and every tender receipt summary; reconciliation is unaffected by POS visibility. Closing and handover indirect totals can disclose true cash custody intentionally: custody accuracy takes priority over operational privacy.",
    "how": [
      "Use a QA test branch/account with CASH_DROP. Ask Owner or an authorized Branch Admin to configure shift windows; click Start Shift if none is open. Accept any pending incoming handover first.",
      "Enter whole, non-negative counts of ₹500/₹200/₹100/₹50/₹20/₹10 notes and the total coin value in rupees, not the number of coins. Count all physical cash including accepted incoming cash.",
      "Click End Shift & Handover once. Only after submission does the result reveal expected cash and shortage/excess; the server calculates Card/UPI/Other from this run's orders.",
      "The next cashier checks the displayed handover and clicks Accept Handover on POS or Cash Drop before selling or closing. For an unconfirmed write, ask an administrator to verify saved records; do not blindly resubmit."
    ],
    "example": "QA example: accepted incoming cash ₹6,000 plus current CASH sales ₹550 gives expected ₹6,550. Count ₹6,550: variance is zero. Only that counted physical cash carries forward; this run's Card/UPI/Other receipts are recorded separately, not transferred. Practice writes persist after reload.",
    "hinglish": {
      "title": "Blind Cash Drop",
      "short": "Locally implemented real DB closing: blind count, End Shift & Handover, phir acceptance.",
      "what": "CASH_DROP access se physical notes/coins gino; submit se pehle expected cash hidden hai. End Shift & Handover real PostgreSQL cash-drop record save karta hai, current run end karke next run aur PENDING handover kholta hai. Expected cash = accepted incoming physical cash + is run ki completed CASH sales; shortage/excess = counted minus expected. Card/UPI/Other sirf is run ki receipts hain, carry-forward drawer balance ya real bank/payment transfer nahi. Next run handover accept hone tak sale ya close nahi kar sakta. Unconfigured branches ka legacy POS chalta hai, par config ke bina real-close nahi. Initial cash float aur safe withdrawals modeled nahi hain. Yeh local implementation hai, production-live claim nahi. Owner-only orders actual cash aur har tender receipt summary mein count hote hain; POS visibility se reconciliation nahi badalti. Closing/handover ke indirect totals true cash custody disclose kar sakte hain; yeh intentional hai, custody accuracy ko operational privacy se pehle rakha gaya hai.",
      "how": [
        "CASH_DROP wala QA test branch/account use karo. Owner ya authorized Branch Admin se shift windows configure karwao; run open na ho to Start Shift dabao. Pending incoming handover pehle accept karo.",
        "₹500/₹200/₹100/₹50/₹20/₹10 notes ki whole non-negative ginti aur coins ki total rupee value bharo, coin count nahi. Accepted incoming cash samet saara physical cash gino.",
        "End Shift & Handover ek baar dabao. Submit ke baad hi expected cash aur shortage/excess dikhenge; server Card/UPI/Other is run ke orders se calculate karta hai.",
        "Next cashier POS ya Cash Drop par handover amounts check karke Accept Handover kare, tab sale ya close chalega. Write ka result unconfirmed ho to admin se saved records verify karwao; blindly resubmit mat karo."
      ],
      "example": "QA example: accepted incoming cash ₹6,000 + current CASH sales ₹550 = expected ₹6,550. ₹6,550 count par variance zero. Sirf counted physical cash aage carry hota hai; Card/UPI/Other is run ki alag receipts hain, transfer nahi. Practice writes reload ke baad bhi rehti hain."
    }
  },
  {
  "module": "ACCOUNTS_EXPENSES",
  "route": "/accounts",
  "icon": "💰",
  "cat": "finance",
  "status": "mixed",
  "title": "Accounts",
  "short": "Real expenses, payroll costs, petty cash, settlements and journal-based balances.",
  "what": "Expenses persist with void history; P&L reads posted expenses and finalized payroll. P&L revenue/COGS and gross/net profit remain disconnected despite Reports recipe-cost estimates. Petty Cash stores IN/OUT and rejects negative balance; Aggregator Recon stores manual settlements with server-computed net payout. Balance Sheet aggregates shared HQ accounts plus branch journals, showing real zeros/unseeded state until Owner explicitly seeds the chart. Petty cash/settlements do not auto-post journals or transfer money. VENDOR_REFUNDS grants read-only Vendor refunds access to branch-scoped expected vendor return/refund claims. This is an amount claimed at saved PO rates, not money received, a settled credit, physical-dispatch proof or an automatic journal. No other Accounts or Purchase grant is automatically assigned.",
  "how": [
    "Choose a QA branch/month and add an expense with category, date, amount, description and reference; save and reload.",
    "Void mistakes with a reason; never duplicate finalized payroll as operating expense. P&L revenue/COGS remain unavailable.",
    "With the relevant grants, log Petty Cash IN/OUT or Aggregator settlement values and inspect Balance Sheet; chart seeding creates accounts, not transactions or balances.",
    "With VENDOR_REFUNDS, open Vendor refunds and compare PO/vendor/failed quantity/expected claim amount; reconciliation-required rows are not confirmed claims. Money receipt and credit settlement remain separate."
  ],
  "example": "Example: ₹5,000 Rent raises real expense cost. Petty-cash top-up is not revenue and does not automatically enter the journal-based Balance Sheet.",
  "hinglish": {
    "title": "Accounts",
    "short": "Real expenses, payroll costs, petty cash, settlements aur journal-based balances.",
    "what": "Expenses void history ke saath persist; P&L posted expenses aur finalized payroll padhta hai. Reports recipe-cost estimate ke bawajood P&L revenue/COGS aur gross/net profit disconnected hain. Petty Cash real IN/OUT aur negative balance rejection deta hai; Aggregator manual settlement ka net payout server nikalta hai. Balance Sheet shared HQ accounts aur branch journals padhta hai; Owner explicitly chart seed kare tab tak real zeros/unseeded state. Petty cash/settlements auto-journal ya money transfer nahi karte. VENDOR_REFUNDS se branch-scoped expected vendor return/refund claims ka read-only Vendor refunds view milta hai. Saved PO rate ka claim paisa received, settled credit, physical dispatch proof ya automatic journal nahi. Doosre Accounts/Purchase grants auto assign nahi hote.",
    "how": [
      "QA branch/month mein category, date, amount, description aur reference se expense save karke reload karo.",
      "Galti reason se Void karo; finalized payroll ko operating expense dobara mat daalo. P&L revenue/COGS unavailable hain.",
      "Relevant grants se Petty Cash IN/OUT ya Aggregator settlement daalo aur Balance Sheet dekho; chart seeding accounts banati hai, transactions/balances nahi.",
      "VENDOR_REFUNDS ke saath Vendor refunds kholo; PO/vendor/failed qty/expected claim dekho. Reconciliation-required row confirmed claim nahi. Money receipt aur credit settlement alag pending hain."
    ],
    "example": "Example: ₹5,000 Rent se real expense badhta hai. Petty-cash top-up revenue nahi aur journal-based Balance Sheet mein auto-entry nahi karta."
  }
},
{
  "module": "PAYROLL",
  "route": "/workforce",
  "icon": "👥",
  "cat": "finance",
  "status": "live",
  "title": "Staff, Attendance & Payroll",
  "short": "Real employee rates, daily attendance, approved leave and monthly salary snapshots.",
  "what": "Set ON_ROLL monthly salary or OFF_ROLL daily wages once. There is no Weekly Off status. Present is one unit, Half Day is half, Absent is zero. Employees apply leave; an authorized manager other than the applicant approves or rejects. Only approved paid ON_ROLL leave contributes paid units. OFF_ROLL leave is unpaid. ON_ROLL uses the actual calendar days in each month, including leap years. Missing attendance blocks finalization. Final payroll is immutable and does not transfer money. After ANY leave history (PENDING/APPROVED/REJECTED), the employee login link cannot be assigned, replaced or cleared, even by Owner. Keeping the existing link and other safe edits are allowed.",
  "how": [
    "With PAYROLL access, create an employee in a test branch, set employment type/rate/join date and optionally link their same-branch login for self-service leave.",
    "With ATTENDANCE access, mark each eligible day Present, Half Day or Absent. Approved leave is shown separately and cannot be double marked.",
    "Employee applies leave with dates/reason. A different authorized reviewer selects Approved or Rejected; paid/unpaid is explicit for on-roll, off-roll leave stays unpaid.",
    "Preview a completed month, resolve missing dates and finalize a single branch. Final payroll feeds P&L labor cost once; future rate changes take effect from an explicit future month boundary."
  ],
  "example": "Example: September has 30 days. A ₹30,000 monthly employee with 29 Present days and one approved Paid Leave earns ₹30,000. An ₹800 daily-wage employee with 20 full days and one half-day earns ₹16,400; all other eligible dates must be marked/covered before finalizing.",
  "hinglish": {
    "title": "Staff, Attendance aur Salary",
    "short": "Real employee rates, daily attendance, approved leave aur monthly salary snapshots.",
    "what": "ON_ROLL ki monthly salary ya OFF_ROLL ki daily wage ek baar set karo. Weekly Off status nahi hai. Present 1, Half Day 0.5, Absent 0 units. Employee leave apply karta hai; applicant se alag authorized manager approve/reject karta hai. Sirf approved paid ON_ROLL leave paid units mein aati hai. OFF_ROLL leave unpaid hai. ON_ROLL calculation actual 28/29/30/31 calendar days se hoti hai. Missing attendance par finalization blocked; final payroll immutable hai, paisa transfer nahi hota. Koi bhi leave history (PENDING/APPROVED/REJECTED) hone ke baad employee login link assign, replace ya clear nahi kar sakte, Owner bhi nahi. Existing link rakhna aur doosre safe edits allowed hain.",
    "how": [
      "PAYROLL access se test branch mein employee banao; employment type/rate/join date set karo aur self-service leave ke liye same-branch login optionally link karo.",
      "ATTENDANCE access se har eligible din Present, Half Day ya Absent mark karo. Approved leave alag dikhti hai aur double attendance mark nahi hoti.",
      "Employee dates/reason se leave apply kare. Doosra authorized reviewer Approved/Rejected chune; on-roll par paid/unpaid explicit, off-roll leave unpaid rahegi.",
      "Completed month preview karo, missing dates resolve karke single branch finalize karo. Salary cost P&L mein ek baar aati hai; rate change explicit future month se hota hai."
    ],
    "example": "Example: September mein 30 din hain. ₹30,000 monthly employee ke 29 Present aur 1 approved Paid Leave par ₹30,000 bante hain. ₹800 daily wage ke 20 full aur 1 half-day par ₹16,400. Finalize se pehle baaki eligible dates bhi marked/covered honi chahiye."
  }
},
  {
    "module": "USER_ADMIN",
    "route": "/admin/users",
    "icon": "👥",
    "cat": "admin",
    "status": "live",
    "title": "Users & Access",
    "short": "Create real users with roles, branch assignment and module grants.",
    "what": "Owner manages all branches and HQ roles. Branch Admin manages only own-branch users and cannot grant more access than they hold, edit themselves or create HQ roles. Server-side permissions govern real records.",
    "how": [
      "New User: enter name, 10-digit mobile number (without +91), a password of at least 12 characters, role and branch.",
      "Select allowed module grants and save. Branch Admin sees only delegable grants.",
      "Edit a user to change access/status/password. Saved changes revoke the user’s existing sessions; blank password retains the existing password."
    ],
    "example": "Illustration: give a cashier only POS and Cash Drop grants. Other modules remain inaccessible; grants do not make demo modules database-backed.",
    "hinglish": {
      "title": "Users & Access",
      "short": "Real users banao: role, branch aur module grants ke saath.",
      "what": "Owner sab branches aur HQ roles manage karta hai. Branch Admin sirf apni branch ke users manage karta hai; apne se zyada grants nahi de sakta, khud ko edit ya HQ role create nahi kar sakta. Server permissions real records par lagti hain.",
      "how": [
        "New User mein naam, 10-digit mobile number (without +91), kam se kam 12-character password, role aur branch bharo.",
        "Allowed module grants chuno aur save karo. Branch Admin ko sirf delegable grants dikhte hain.",
        "Edit se access/status/password badlo. Save par purane sessions revoke hote hain; blank password par purana password rehta hai."
      ],
      "example": "Example: cashier ko sirf POS aur Cash Drop grants do. Doosre modules accessible nahi honge; grants demo modules ko DB-backed nahi banate."
    }
  },
  {
    "module": "BRANCH_ADMIN",
    "route": "/admin/branches",
    "icon": "🏢",
    "cat": "admin",
    "status": "live",
    "title": "Branches",
    "short": "Real branch records; only Owner creates branches.",
    "what": "Owner can create and edit branches. Branch Admin sees and maintains only their own branch. Creating a branch does not clone menus, recipes, checklists or stock. The clone wizard is not implemented.",
    "how": [
      "Owner: New Branch, then enter code, name, address, coordinates and geofence radius.",
      "Edit a permitted row and save. The screen reads the saved record back from PostgreSQL.",
      "New branches start empty. Branch deletion is not offered by this screen."
    ],
    "example": "Illustration: Owner creates B7 — Vasant Kunj. It becomes a real branch option in user administration; no menu or stock is copied.",
    "hinglish": {
      "title": "Branches",
      "short": "Real branch records; sirf Owner nayi branch banata hai.",
      "what": "Owner branches create/edit kar sakta hai. Branch Admin sirf apni branch dekhta aur maintain karta hai. Branch banane se menu, recipes, checklist ya stock clone nahi hote. Clone wizard implement nahi hai.",
      "how": [
        "Owner: New Branch mein code, naam, address, coordinates aur geofence radius bharo.",
        "Permitted row Edit karke save karo. Screen PostgreSQL se saved record dobara padhti hai.",
        "Nayi branch khali shuru hoti hai. Is screen par branch delete option nahi hai."
      ],
      "example": "Example: Owner B7 — Vasant Kunj banata hai. User administration mein real branch option aata hai; menu ya stock copy nahi hota."
    }
  },
  {
    "module": "SHIFT_MANAGEMENT",
    "route": "/admin/settings/shifts",
    "icon": "🕒",
    "cat": "admin",
    "status": "live",
    "title": "Shift Management",
    "short": "Locally implemented branch shift windows, manual runs and accepted cash handovers.",
    "what": "Owner can configure a selected branch; a Branch Admin (BRANCH_MANAGER) with SHIFT_MANAGEMENT can configure only their own branch. Save 1-12 ordered windows covering a full 24h in IST with no gaps or overlaps: each end meets the next start and the last wraps to the first. A single window with identical start/end covers 24h. Start Shift is manual and selects the current window; scheduled end is a reminder, never an automatic cutoff. Cash Drop's manual End Shift & Handover ends the current run and opens the next cycle run, even for a single-shift setup. PENDING acceptance blocks POS sales and further closing. Replacing windows preserves historical definition rows and recorded run times; it does not rewrite past runs. Unconfigured branches retain legacy POS but cannot real-close without configuration. Local database functionality does not mean production deployment.",
    "how": [
      "Use a QA test branch/account. Owner selects one branch; Branch Admin needs SHIFT_MANAGEMENT and is restricted to their own branch. English is default; Hinglish is optional in preferences.",
      "In Shift windows, set Shift A 00:00-12:00 and Shift B 12:00-00:00 with Add Shift, then Save Shifts. Use 24h HH:MM; for one daily shift use 00:00-00:00.",
      "Click Start Shift when no run is open, then Reload saved status. Times do not auto-start/end runs. With CASH_DROP, manually End Shift & Handover after counting physical cash.",
      "On POS or Cash Drop, review the incoming amounts and Accept Handover before the next run sells or closes. Editing windows affects future cycle selection, not historical rows. These actions are real writes; do not use business branches for practice."
    ],
    "example": "QA example: one 00:00-00:00 shift can cycle repeatedly. A manual close preserves the ended run, opens a new run with the same label and creates a PENDING handover. Accept it before the next sale. Card/UPI/Other are per-run receipts, not money transfers; initial cash float and safe withdrawals are not modeled.",
    "hinglish": {
      "title": "Shift Management",
      "short": "Locally implemented branch shift windows, manual runs aur accepted cash handovers.",
      "what": "Owner selected branch configure kar sakta hai; SHIFT_MANAGEMENT wala Branch Admin (BRANCH_MANAGER) sirf apni branch configure karega. 1-12 ordered windows IST mein pura 24h cover karein, gap/overlap nahi: har end agle start se mile aur last first se jude. Single window ka same start/end matlab 24h. Start Shift manual hai aur current window chunta hai; scheduled end sirf reminder hai, automatic cutoff nahi. Cash Drop ka manual End Shift & Handover current run end karke next cycle run kholta hai, single-shift setup mein bhi. PENDING acceptance par POS sale aur next closing blocked hain. Windows replace karne se historical definition rows aur recorded run times preserve rehte hain, past runs rewrite nahi hote. Unconfigured branch ka legacy POS chalta hai par config ke bina real-close nahi. Local DB functionality ka matlab production deployment nahi.",
      "how": [
        "QA test branch/account use karo. Owner ek branch chune; Branch Admin ko SHIFT_MANAGEMENT chahiye aur sirf apni branch milegi. English default hai; preferences mein Hinglish optional hai.",
        "Shift windows mein Shift A 00:00-12:00 aur Add Shift se Shift B 12:00-00:00 set karke Save Shifts dabao. 24h HH:MM use karo; single daily shift ke liye 00:00-00:00.",
        "Run open na ho to Start Shift, phir Reload saved status dabao. Time se runs auto-start/end nahi hote. CASH_DROP se physical cash ginkar manually End Shift & Handover karo.",
        "POS ya Cash Drop par incoming amounts check karke Accept Handover karo, tab next run sale/close kar sakega. Windows edit future cycle selection badalta hai, historical rows nahi. Yeh real writes hain; practice business branch mein mat karo."
      ],
      "example": "QA example: ek 00:00-00:00 shift baar-baar cycle kar sakti hai. Manual close ended run preserve karta hai, same label ka naya run aur PENDING handover kholta hai. Next sale se pehle accept karo. Card/UPI/Other per-run receipts hain, money transfer nahi; initial cash float aur safe withdrawals modeled nahi hain."
    }
  },
  {
    "module": "WHATSAPP_LOGS",
    "route": "/admin/settings/whatsapp",
    "icon": "📲",
    "cat": "whatsapp",
    "status": "live",
    "title": "WhatsApp Settings (ChatXFlow)",
    "short": "Owner-only provider configuration saved in the real database.",
    "what": "Connect a number in ChatXFlow, then save the provider token, phone and pinned base URL here. Saving credentials does not enable task reminders, approval messages, 8AM summaries or inbound webhooks; these automation workflows are still pending.",
    "how": [
      "Owner: connect the WhatsApp number using ChatXFlow’s own QR flow.",
      "Paste the Developer API Token and set the WhatsApp phone number.",
      "Save Settings. Leave the token blank to retain an existing saved token. Custom hosts are not allowed."
    ],
    "example": "Illustration: Owner saves provider settings. This proves configuration storage only, not automatic delivery of task reminders or approval buttons.",
    "hinglish": {
      "title": "WhatsApp Settings (ChatXFlow)",
      "short": "Owner-only provider configuration real database mein save hoti hai.",
      "what": "ChatXFlow mein number connect karo, phir provider token, phone aur fixed base URL yahan save karo. Credentials save karne se task reminders, approval messages, 8AM summary ya inbound webhooks enable nahi hote; yeh automation pending hain.",
      "how": [
        "Owner: ChatXFlow ke apne QR flow se WhatsApp number connect karo.",
        "Developer API Token paste karo aur WhatsApp phone number set karo.",
        "Save Settings dabao. Existing token rakhne ke liye token blank chhodo. Custom hosts allowed nahi hain."
      ],
      "example": "Example: Owner provider settings save karta hai. Isse sirf configuration storage verify hoti hai, automatic reminders ya approval buttons ki delivery nahi."
    }
  },
  {
    "module": "MENU_BOM",
    "route": "/menu",
    "icon": "🍲",
    "cat": "backend",
    "status": "live",
    "title": "Menu & BOM",
    "short": "Real dish recipes with explicit units, live stock preview, and real Semi-FG production stock.",
    "what": "Create menu items (sellable dishes, or Semi-FG bases like gravy/marinade that are not directly orderable) with an explicit output unit (portion/kg/ltr/pcs). Recipe Builder saves the whole recipe — multiple ingredient rows, each a raw material OR an existing same-branch Semi-FG, normalized per one output unit — in one atomic save; saving a recipe never touches stock. A cycle (A needs B needs A) is rejected at save time. A Semi-FG dish only has real stock after it is actually PRODUCED (its own panel on this page) — production consumes the Semi-FG's own direct raw/nested-Semi-FG ingredients and credits prepared stock. Selling a dish then consumes its direct raw materials plus any produced Semi-FG stock directly — never the Semi-FG's embedded raw ingredients a second time. Preview stock & cost shows the theoretical raw-cost rollup (planning estimate) alongside what will ACTUALLY be consumed (direct raw + direct Semi-FG, with required/available/shortage) — it is a preview only, never a reservation.",
    "how": [
      "Recipe Builder: enter the dish/Semi-FG name, branch, price (for sellable dishes), output unit and batch yield, then add ingredient rows (search, pick raw material or Semi-FG, enter batch quantity) — one Save writes the dish and its whole recipe together.",
      "Preview stock & cost on a saved recipe: shows the theoretical raw-material rollup/cost estimate, and separately the direct raw + Semi-FG stock this item will actually consume, with any shortage.",
      "Semi-FG production & stock panel: pick a Semi-FG and an output quantity, Record production — this is the only action that credits real prepared stock; selling a dish never substitutes for production.",
      "POS then only needs direct raw material stock and any already-produced Semi-FG stock on hand — a dish referencing an unproduced Semi-FG is blocked from sale until it's produced."
    ],
    "example": "Example: Butter Chicken needs 0.1kg Gravy (Semi-FG) + 0.25kg Chicken per portion. Gravy's own recipe needs Tomato + Butter. Producing 1kg of Gravy consumes that Tomato/Butter directly and credits 1kg to Gravy's Semi-FG stock; selling 10 plates of Butter Chicken then consumes 1kg of that Gravy stock plus 2.5kg Chicken — never the Gravy's Tomato/Butter again.",
    "hinglish": {
      "title": "Menu aur BOM",
      "short": "Real dish recipes explicit units ke saath, live stock preview, aur real Semi-FG production stock.",
      "what": "Menu items banao (sellable dish, ya Semi-FG base jaise gravy/marinade jo directly order nahi hoti) explicit output unit (portion/kg/ltr/pcs) ke saath. Recipe Builder poori recipe ek saath save karta hai — multiple ingredient rows, har ek raw material YA existing isi-branch ka Semi-FG, 1 output unit ke hisaab se normalized — ek atomic save mein; recipe save karne se stock kabhi nahi badalta. Cycle (A ko B chahiye, B ko A chahiye) save time par reject hota hai. Semi-FG dish ka real stock tabhi hota hai jab usey actually PRODUCE kiya jaye (isi page par apna panel) — production us Semi-FG ke apne direct raw/nested-Semi-FG ingredients consume karke prepared stock credit karta hai. Dish bechne par uska direct raw material + jo bhi produced Semi-FG stock available hai, wahi directly consume hota hai — Semi-FG ke embedded raw ingredients dobara kabhi nahi. Preview stock & cost theoretical raw-cost rollup (planning estimate) ke saath yeh bhi dikhata hai ki ACTUALLY kya consume hoga (direct raw + direct Semi-FG, required/available/shortage ke saath) — yeh sirf preview hai, reservation nahi.",
      "how": [
        "Recipe Builder: dish/Semi-FG naam, branch, price (sellable dish ke liye), output unit aur batch yield bharo, phir ingredient rows add karo (search karo, raw material ya Semi-FG chuno, batch quantity daalo) — ek Save se dish aur poori recipe ek saath save hoti hai.",
        "Saved recipe par Preview stock & cost: theoretical raw-material rollup/cost estimate aur alag se direct raw + Semi-FG stock dikhata hai jo yeh item actually consume karega, shortage samet.",
        "Semi-FG production & stock panel: Semi-FG aur output quantity chuno, Record production — yahi ek action hai jo real prepared stock credit karta hai; dish bechna production ka substitute kabhi nahi.",
        "POS ko ab sirf direct raw material stock aur jo bhi Semi-FG pehle se produced hai, wahi chahiye — agar Semi-FG abhi produce nahi hua to us par depend karne wali dish ki sale block ho jayegi jab tak produce na ho."
      ],
      "example": "Example: Butter Chicken ko per portion 0.1kg Gravy (Semi-FG) + 0.25kg Chicken chahiye. Gravy ki apni recipe mein Tomato + Butter chahiye. 1kg Gravy produce karne se wahi Tomato/Butter directly consume hota hai aur Gravy ke Semi-FG stock mein 1kg credit hota hai; 10 plate Butter Chicken bechne se us 1kg Gravy stock + 2.5kg Chicken consume hota hai — Gravy ka Tomato/Butter dobara kabhi nahi."
    }
  },
  {
    "module": "INVENTORY",
    "route": "/warehouse",
    "icon": "🏭",
    "cat": "backend",
    "status": "live",
    "title": "Warehouse & Transfers",
    "short": "Real 2-level stock: Central warehouse dispatches, branch confirms receipt.",
    "what": "Owner creates one CENTRAL warehouse plus one BRANCH warehouse per branch. Dispatching a stock transfer (Central → Branch only) is a paper/audit record — it does NOT move any quantity by itself, since the central warehouse has no live quantity ledger yet. Receiving is the ONLY step that mutates real branch inventory_stock; any shortfall between dispatched and received quantity is recorded as transit variance.",
    "how": [
      "Owner: New Warehouse to create the CENTRAL warehouse and each branch's BRANCH warehouse.",
      "Dispatch Transfer: pick the Central source, the destination branch, a raw material and quantity dispatched.",
      "On the branch side, Receive: enter the actual quantity received — this is the step that adds to that branch's real stock.",
      "A received quantity less than dispatched shows as a shortfall; it's recorded, not auto-blocked or auto-refunded."
    ],
    "example": "Example: Central dispatches 50 kg Rice to Branch B2. Branch stock does NOT change yet. B2 receives 48 kg — now B2's real inventory gets +48 kg, and a 2 kg shortfall is recorded against that transfer.",
    "hinglish": {
      "title": "Warehouse aur Transfer",
      "short": "Real 2-level stock: Central warehouse dispatch karta hai, branch receipt confirm karti hai.",
      "what": "Owner ek CENTRAL warehouse aur har branch ka ek BRANCH warehouse banata hai. Stock transfer dispatch (sirf Central → Branch) ek paper/audit record hai — khud se koi quantity move nahi karta, kyunki central warehouse ka abhi koi live quantity ledger nahi hai. Receive hi aisa step hai jo real branch inventory_stock badalta hai; dispatched aur received quantity ke beech kami transit variance ki tarah record hoti hai.",
      "how": [
        "Owner: New Warehouse se CENTRAL warehouse aur har branch ka BRANCH warehouse banao.",
        "Dispatch Transfer: Central source, destination branch, raw material aur dispatched quantity chuno.",
        "Branch side par Receive: actual received quantity bharo — yahi step branch ki real stock mein add karta hai.",
        "Received quantity dispatched se kam ho to shortfall dikhta hai; yeh sirf record hota hai, auto-block ya auto-refund nahi."
      ],
      "example": "Example: Central 50 kg Rice Branch B2 ko dispatch karta hai. Branch stock abhi nahi badalti. B2 48 kg receive karta hai — ab B2 ki real inventory mein +48 kg add hota hai, aur 2 kg shortfall us transfer ke against record hoti hai."
    }
  },
  {
    "module": "OFFICIAL_SALES_REPORTS",
        "route": "/accounts",
        "exampleKey": "/accounts-gstr",
    "icon": "🧾",
    "cat": "finance",
    "status": "live",
    "title": "GSTR-1 HSN Summary Export",
    "short": "Real GSTR-1 Table 12 style HSN-wise export, built from actual completed orders — now a tab inside Accounts.",
    "what": "Owner or a user explicitly granted OFFICIAL_SALES_REPORTS can open the Accounts GSTR Export tab. POS_CASHIER alone does not grant this access; existing grants are not automatically backfilled. This official report uses actual records including Owner-only orders, never filtered staff POS totals. Pick a date range and branch scope; it pulls every real completed order in range, groups taxable value + CGST/SGST/IGST by HSN/SAC code and rate, and lets you export it as CSV ready for the GST portal's offline tool. Orders from a branch (or before the company) had its GST state code configured are excluded from the summary and counted separately — a GSTR filing never silently includes tax-free sales as if they were GST-compliant.",
    "how": [
      "As Owner or with an explicit OFFICIAL_SALES_REPORTS grant, open Accounts, then click the GSTR Export tab. This grant authorizes actual official sales disclosure, not private operational POS access.",
      "Pick From/To dates and (optionally) a branch, then Generate.",
      "Review the HSN-wise table: rate, quantity, taxable value, CGST/SGST/IGST, total tax and total value, with a Grand Total row.",
      "If any orders in range are excluded for missing GST configuration, a clear warning states exactly how many.",
      "Export CSV downloads the exact on-screen summary."
    ],
    "example": "Example: two orders in October both have menu items under HSN 2106 at 5% GST — the export merges them into one row: Qty 3, Taxable ₹400.00, CGST ₹10.00, SGST ₹10.00, Total ₹420.00.",
    "hinglish": {
      "title": "GSTR-1 HSN Summary Export",
      "short": "Real GSTR-1 Table 12 jaisa HSN-wise export, real completed orders se bana — ab Accounts ke andar ek tab hai.",
      "what": "Owner ya explicit OFFICIAL_SALES_REPORTS grant wala user Accounts ka GSTR Export tab khole. Sirf POS_CASHIER se access nahi milta; existing grants ka auto-backfill nahi hota. Official report actual records se banti hai, Owner-only orders samet; filtered staff POS totals se nahi. Date range aur branch scope chuno; page us range ke saare real completed orders uthati hai, HSN/SAC code aur rate ke hisaab se taxable value + CGST/SGST/IGST group karti hai, aur CSV export deti hai jo GST portal ke offline tool mein seedha ja sake. Jin branch (ya jab tak company) ka GST state code configure nahi tha unke orders summary se exclude hote hain aur alag count hote hain — GSTR filing mein kabhi tax-free sales GST-compliant jaisi silently nahi dikhti.",
      "how": [
        "Owner ya explicit OFFICIAL_SALES_REPORTS grant se Accounts ka GSTR Export tab kholo. Yeh actual official sales disclose karne ka access hai, private operational POS access nahi.",
        "From/To dates aur (optional) branch chuno, phir Generate dabao.",
        "HSN-wise table dekho: rate, quantity, taxable value, CGST/SGST/IGST, total tax aur total value, saath mein Grand Total row.",
        "Agar range ke kuch orders GST configuration na hone ki wajah se exclude hue hain, ek clear warning exact count batati hai.",
        "Export CSV se wahi on-screen summary download hoti hai."
      ],
      "example": "Example: October ke 2 orders dono mein HSN 2106 @ 5% GST ke menu items hain — export unhe ek row mein merge karta hai: Qty 3, Taxable ₹400.00, CGST ₹10.00, SGST ₹10.00, Total ₹420.00."
    }
  }
];
export function getGuideModules(t: (english: string, hinglish?: string) => string): GuideModule[] {
  return GUIDE_MODULES.map(m => ({ ...m, title: t(m.title, m.hinglish.title), short: t(m.short, m.hinglish.short), what: t(m.what, m.hinglish.what), how: m.how.map((s, i) => t(s, m.hinglish.how[i])), example: t(m.example, m.hinglish.example), exampleKey: m.exampleKey }));
}
export const CAT_LABEL: Record<GuideModule["cat"], string> = { frontend: "Daily Operations", finance: "Finance", backend: "Purchase / Stock", admin: "Admin / Setup", whatsapp: "WhatsApp Connection" };
export const CAT_CLASS: Record<GuideModule["cat"], string> = { frontend: "border-sky-500/50 bg-sky-500/10", finance: "border-violet-500/50 bg-violet-500/10", backend: "border-emerald-500/50 bg-emerald-500/10", admin: "border-amber-500/50 bg-amber-500/10", whatsapp: "border-rose-500/50 bg-rose-500/10" };
