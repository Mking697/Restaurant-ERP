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
    "status": "pending",
    "title": "Owner Dashboard",
    "short": "Sample branch KPIs and charts; not live business totals.",
    "what": "Compare illustrative sales, inventory value, prime cost, overdue tasks and MIS scores. Branch filtering is a demo presentation filter, not evidence of database isolation.",
    "how": [
      "Select a branch or the compiled view in the branch selector.",
      "Review KPI cards, revenue charts, channel mix and the branch table.",
      "Use Guide Book for workflow details. Dashboard metrics remain sample data, even when Inventory has real stock."
    ],
    "example": "Illustration: a sample branch shows ₹1,42,500 revenue and four overdue tasks. Do not use these values for business decisions.",
    "hinglish": {
      "title": "Owner Dashboard",
      "short": "Sample branch KPIs aur charts; live business totals nahi.",
      "what": "Sample sales, inventory value, prime cost, overdue tasks aur MIS compare karo. Branch filter sirf demo presentation hai, database isolation ka proof nahi.",
      "how": [
        "Branch selector se branch ya compiled view chuno.",
        "KPI cards, revenue charts, channel mix aur branch table dekho.",
        "Workflow details ke liye Guide Book kholo. Inventory real hone par bhi dashboard sample data hi hai."
      ],
      "example": "Example: sample branch mein ₹1,42,500 revenue aur chaar overdue tasks hain. In numbers se business decisions mat lo."
    }
  },
  {
    "module": "REPORTS",
    "route": "/reports",
    "icon": "📑",
    "cat": "frontend",
    "status": "pending",
    "title": "Reports",
    "short": "Six sample reports with charts, tables and CSV export.",
    "what": "Sales Trend, MIS Scorecard, Food Cost & Menu Margin, Inventory Variance, Cash Reconciliation and Aggregator Reconciliation use mock datasets. They are not connected to live transactions.",
    "how": [
      "Open a report card.",
      "Review its charts and table.",
      "Export CSV downloads the same sample dataset for spreadsheet review."
    ],
    "example": "Illustration: a ₹420 dish with a sample ₹138 ingredient cost appears in Food Cost. These are demo values, not a verified recipe cost.",
    "hinglish": {
      "title": "Reports",
      "short": "Charts, tables aur CSV export ke saath chhe sample reports.",
      "what": "Sales Trend, MIS, Food Cost, Inventory Variance, Cash aur Aggregator reports mock data use karti hain. Live transactions connected nahi hain.",
      "how": [
        "Report card kholo.",
        "Charts aur table dekho.",
        "Export CSV se wahi sample dataset spreadsheet ke liye download hota hai."
      ],
      "example": "Example: ₹420 ki dish aur ₹138 sample ingredient cost Food Cost mein dikhti hai. Yeh demo values hain, verified recipe cost nahi."
    }
  },
  {
    "module": "MIS_PERFORMANCE",
    "route": "/performance",
    "icon": "🏆",
    "cat": "frontend",
    "status": "pending",
    "title": "MIS Leaderboard",
    "short": "Illustrative staff rankings, completion counts and weighted scores.",
    "what": "The displayed task/delegation/variance/cashier weighting is 40/30/20/10. Scores and timestamps are sample data; live score calculation is pending.",
    "how": [
      "Compare On Time, Delay and Not Done counts.",
      "Review the score chart and table.",
      "Export CSV to inspect the illustrative rankings."
    ],
    "example": "Illustration: Rahul’s sample score is 93.1%. It is not an assessment of a real employee.",
    "hinglish": {
      "title": "MIS Leaderboard",
      "short": "Staff ranking, completion counts aur weighted score ka demo.",
      "what": "Task/delegation/variance/cashier weighting 40/30/20/10 dikhayi gayi hai. Scores aur timestamps sample hain; live calculation pending hai.",
      "how": [
        "On Time, Delay aur Not Done counts compare karo.",
        "Score chart aur table dekho.",
        "Sample ranking inspect karne ke liye Export CSV use karo."
      ],
      "example": "Example: Rahul ka sample score 93.1% hai. Yeh kisi real employee ka assessment nahi."
    }
  },
  {
    "module": "TASKS_DELEGATION",
    "route": "/tasks",
    "icon": "✅",
    "cat": "frontend",
    "status": "pending",
    "title": "Tasks & Checklists",
    "short": "Try recurring checklists and one-time task delegation.",
    "what": "This interactive demo keeps tasks in browser page state. Reloading resets changes. Automatic recurrence, reminders, file upload storage and task persistence are not connected.",
    "how": [
      "Create a recurring checklist with title, branch, doer, frequency and shift time.",
      "Delegate a one-time task with priority and due time.",
      "Mark Done: evidence selection is optional for recurring tasks and required for delegation. Only the selected file name is retained, not an uploaded file."
    ],
    "example": "Illustration: create a fridge-check task, then mark it Done. Reloading removes your demo changes; no recurring schedule was created.",
    "hinglish": {
      "title": "Tasks & Checklists",
      "short": "Recurring checklist aur one-time delegation try karo.",
      "what": "Demo tasks browser page state mein rehte hain. Reload par changes reset hote hain. Auto recurrence, reminders, file storage aur task persistence connected nahi hain.",
      "how": [
        "Title, branch, doer, frequency aur shift time se recurring checklist banao.",
        "Priority aur due time se one-time task saunpo.",
        "Mark Done mein recurring evidence optional aur delegation evidence zaroori hai. Sirf selected file ka naam rehta hai, file upload nahi hoti."
      ],
      "example": "Example: fridge-check task banao aur Done karo. Reload par changes hat jaayenge; recurring schedule create nahi hua."
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
    "status": "pending",
    "title": "Purchase & GRN",
    "short": "Interactive indent, purchase and quality-check demo.",
    "what": "Try the workflow without posting real purchases. Indents, POs and GRNs are page-local mock records. Quality decisions do not update live Inventory, create vendor returns or post Accounts refunds.",
    "how": [
      "Raise an indent, submit for approval, then approve or reject it.",
      "Create a store or general purchase. Try Buy, optional Bill Upload and Material Receive.",
      "Open the GRN quality check and choose Pass, Fail or Partial. The result is a demo only; no stock/refund posting occurs."
    ],
    "example": "Illustration: mark a demo GRN Partial with 2 kg failed. Its row changes, but live inventory and accounts remain unchanged.",
    "hinglish": {
      "title": "Purchase & GRN",
      "short": "Indent, purchase aur quality-check ka interactive demo.",
      "what": "Real purchase post kiye bina workflow try karo. Indents, POs aur GRNs page-local mock records hain. Quality decision se live Inventory, vendor return ya Accounts refund nahi banta.",
      "how": [
        "Indent banao, approval ke liye bhejo, phir approve/reject karo.",
        "Store ya general purchase banao. Buy, optional Bill Upload aur Material Receive try karo.",
        "GRN quality check mein Pass, Fail ya Partial chuno. Sirf demo result hai; stock/refund posting nahi hoti."
      ],
      "example": "Example: demo GRN Partial karo aur 2 kg failed bharo. Row badlegi, par live inventory aur accounts nahi badlenge."
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
    "what": "Confirming an order checks and atomically deducts its direct raw-material stock plus any already-PRODUCED Semi-FG stock (never a Semi-FG's own embedded raw ingredients) in real branch inventory — insufficient stock, or a Semi-FG that hasn't been produced yet, rejects the whole order, never a partial sale. The order splits into a kitchen KOT (item + qty, no price) and a customer receipt (price + GST). Each branch supports 2 billing counters. An optional foreign payment currency locks its exchange rate at sale time (GST invoice always stays in INR). A customer WhatsApp number triggers a real Thank You message after confirm. Operational confidentiality only: only Owner can set or restore Owner-only visibility, with a 3-500 character reason and audit history. All non-Owner operational users, including an accountant with official-report access, see filtered orders and visible totals only. Owner sees actual, visible and private totals for the selected scope. Visibility never cancels a sale, reverses stock or removes official records: authorized OFFICIAL_SALES_REPORTS exports remain actual. Existing printouts/downloads cannot be revoked; other dashboards/reports remain mock demos, not private live records.",
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
      "what": "Order confirm karte hi uska direct raw-material stock aur jo bhi Semi-FG pehle se PRODUCE ho chuka hai uska stock check+deduct hota hai (Semi-FG ke apne embedded raw ingredients kabhi dobara nahi) — stock kam ho, ya koi Semi-FG abhi produce nahi hua, to poora order reject hota hai, kabhi partial sale nahi. Order 2 jagah split hota hai: kitchen ke liye KOT (item+qty, price nahi) aur customer ke liye receipt (price+GST). Har branch mein 2 billing counters hain. Optional foreign payment currency sale time par apna FX rate lock kar leti hai (GST invoice hamesha INR mein). Customer WhatsApp number do to confirm hote hi real Thank You message jaata hai. Yeh sirf operational confidentiality hai: sirf Owner, 3-500 character reason aur audit history ke saath, Owner-only visibility set ya restore kar sakta hai. Har non-Owner, official-report access wala accountant bhi, operational POS mein filtered orders aur visible totals hi dekhega. Owner selected scope ke actual, visible aur private totals dekhta hai. Visibility se sale cancel, stock reverse ya official records remove nahi hote: authorized OFFICIAL_SALES_REPORTS exports actual rehte hain. Existing printouts/downloads revoke nahi hote; doosre dashboards/reports mock demos hain, private live records nahi.",
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
    "short": "Real branch expenses and payroll costs; other accounting areas remain clearly marked demos.",
    "what": "Permitted accountants enter Rent, Utilities, Marketing and Other operating expenses with branch, date, amount and reference. Expenses persist and can be voided with a reason. P&L shows actual posted expenses and finalized salary snapshots. Sales and food-cost integration remain pending, so gross/net profit are not invented. Petty cash, aggregator reconciliation and balance-sheet areas remain demo or pending, as labelled.",
    "how": [
      "Choose branch and month, then open Expenses or P&L.",
      "Add an expense with category, date, subcategory, amount, description and bill/reference; save and reload to confirm persistence.",
      "Use Void with a reason to reverse an incorrect expense without deleting its history. Do not enter payroll again as an operating expense: finalized payroll supplies labor cost."
    ],
    "example": "Example: save ₹5,000 Rent for a test branch in September. Its real September rent total increases by ₹5,000. Net profit remains unavailable until sales and COGS are connected.",
    "hinglish": {
      "title": "Accounts",
      "short": "Real branch expenses aur payroll costs; baaki accounting areas labelled demo hain.",
      "what": "Permission wala accountant Rent, Utilities, Marketing aur Other expense branch/date/amount/reference ke saath daalta hai. Expenses save hote hain aur reason dekar Void kiye ja sakte hain. P&L mein real expenses aur finalized salary cost aati hai. Sales/food-cost integration pending hai, isliye gross/net profit invent nahi hota. Baaki accounting areas par demo/pending label dekho.",
      "how": [
        "Branch aur month chuno, phir Expenses ya P&L kholo.",
        "Category, date, subcategory, amount, description aur bill/reference se expense add karo; save ke baad reload se persistence check karo.",
        "Galat expense ko reason dekar Void karo; history delete nahi hoti. Salary dobara expense mein mat daalo: finalized payroll se labor cost aati hai."
      ],
      "example": "Example: test branch mein September ka ₹5,000 Rent save karo. Real rent total ₹5,000 badhega. Sales/COGS connect hone tak Net Profit unavailable rahega."
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
