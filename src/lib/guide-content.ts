import type { ModuleKey } from "@/lib/moduleAccess";
export interface GuideModule {
  module: ModuleKey; route: string; icon: string;
  cat: "frontend" | "backend" | "finance" | "admin" | "whatsapp";
  status: "live" | "pending";
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
    "module": "PETTY_CASH",
    "route": "/accounts",
    "icon": "💰",
    "cat": "finance",
    "status": "pending",
    "title": "Accounts",
    "short": "Sample cash book, aggregator reconciliation and financial statements.",
    "what": "Petty Cash Book, Aggregator Recon, Profit & Loss and Balance Sheet are demonstrations. Cash entries change this page’s running balance only. No ledger entry or financial posting is persisted.",
    "how": [
      "Choose a tab to inspect the sample data.",
      "Petty Cash Entry: choose IN for top-up/refund or OUT for expense, then enter the branch, amount and description.",
      "Treat balance-sheet equality and profit figures as illustrative, not audited statements."
    ],
    "example": "Illustration: add a ₹500 OUT expense. The page balance changes; reloading restores sample data and no real expense was posted.",
    "hinglish": {
      "title": "Accounts",
      "short": "Sample cash book, aggregator reconciliation aur financial statements.",
      "what": "Petty Cash Book, Aggregator Recon, P&L aur Balance Sheet demo hain. Cash entry sirf page ka running balance badalti hai. Real ledger ya financial posting save nahi hoti.",
      "how": [
        "Sample data dekhne ke liye tab chuno.",
        "Petty Cash Entry mein top-up/refund ke liye IN ya expense ke liye OUT chuno, phir branch, amount aur description bharo.",
        "Balance-sheet equality aur profit figures sirf examples hain, audited statements nahi."
      ],
      "example": "Example: ₹500 OUT expense jodo. Page balance badlega; reload par sample data aayega aur real expense post nahi hua."
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
