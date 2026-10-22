import type { ModuleKey } from "@/lib/moduleAccess";
export interface GuideModule {
  module: ModuleKey; route: string; icon: string;
  cat: "frontend" | "backend" | "finance" | "admin" | "whatsapp";
  status: "live" | "pending" | "mixed";
  title: string; short: string; what: string; how: string[]; example: string;
}
interface BilingualGuideModule extends GuideModule { hinglish: Pick<GuideModule, "title" | "short" | "what" | "how" | "example">; }
// Four persisted modules and eight interactive, non-persisted demos. Keep standalone guide in sync.
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
    "status": "pending",
    "title": "POS / Cashier",
    "short": "Create sample order headers across dine-in and delivery channels.",
    "what": "Orders use mock page state, not a live billing ledger. Line items, payment collection, invoice posting and database persistence are not implemented.",
    "how": [
      "New Order: enter branch, channel, table if applicable, amount and tender.",
      "Create Order adds a row to this page.",
      "Reload to restore the original sample dataset."
    ],
    "example": "Illustration: enter a ₹1,840 dine-in order paid by UPI. The demo row is not a real bill or payment receipt.",
    "hinglish": {
      "title": "POS / Cashier",
      "short": "Dine-in aur delivery channels ke sample order headers banao.",
      "what": "Orders mock page state use karte hain, live billing ledger nahi. Line items, payment collection, invoice posting aur database persistence implement nahi hain.",
      "how": [
        "New Order mein branch, channel, table (agar ho), amount aur tender bharo.",
        "Create Order se is page par row aati hai.",
        "Reload par original sample dataset wapas aata hai."
      ],
      "example": "Example: ₹1,840 ka dine-in order UPI tender se bharo. Demo row real bill ya payment receipt nahi hai."
    }
  },
  {
    "module": "CASH_DROP",
    "route": "/cash-drop",
    "icon": "🔒",
    "cat": "frontend",
    "status": "pending",
    "title": "Blind Cash Drop",
    "short": "Count denominations and submit an illustrative closing total.",
    "what": "The page totals notes and coins locally. No expected-cash API, saved cash-drop record or shortage/excess calculation is connected yet. Do not treat demo submission as shift closure.",
    "how": [
      "Enter counts for each note denomination.",
      "Add the total coin value.",
      "Submit Cash Drop to see the counted total. Reloading resets it."
    ],
    "example": "Illustration: a counted ₹18,350 is displayed after submission. No shortage is calculated and no closing entry is saved.",
    "hinglish": {
      "title": "Blind Cash Drop",
      "short": "Notes aur coins gino aur sample closing total submit karo.",
      "what": "Page notes aur coins locally total karta hai. Expected-cash API, saved cash-drop record aur shortage/excess calculation connected nahi hain. Demo submission ko shift closure mat samjho.",
      "how": [
        "Har denomination ke notes ki ginti bharo.",
        "Coins ki total value bharo.",
        "Submit Cash Drop se counted total dekho. Reload par reset hota hai."
      ],
      "example": "Example: submission ke baad gina hua ₹18,350 dikhta hai. Shortage calculate ya closing entry save nahi hoti."
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
  }
];
export function getGuideModules(t: (english: string, hinglish?: string) => string): GuideModule[] {
  return GUIDE_MODULES.map(m => ({ ...m, title: t(m.title, m.hinglish.title), short: t(m.short, m.hinglish.short), what: t(m.what, m.hinglish.what), how: m.how.map((s, i) => t(s, m.hinglish.how[i])), example: t(m.example, m.hinglish.example) }));
}
export const CAT_LABEL: Record<GuideModule["cat"], string> = { frontend: "Daily Operations", finance: "Finance", backend: "Purchase / Stock", admin: "Admin / Setup", whatsapp: "WhatsApp Connection" };
export const CAT_CLASS: Record<GuideModule["cat"], string> = { frontend: "border-sky-500/50 bg-sky-500/10", finance: "border-violet-500/50 bg-violet-500/10", backend: "border-emerald-500/50 bg-emerald-500/10", admin: "border-amber-500/50 bg-amber-500/10", whatsapp: "border-rose-500/50 bg-rose-500/10" };
