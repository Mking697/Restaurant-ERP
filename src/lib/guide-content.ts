import type { ModuleKey } from "@/lib/moduleAccess";

/**
 * Guide Book content — one entry per NAV_ITEMS route (see src/lib/nav.ts),
 * `module` matches that route's gating key so the Guide Book page can show
 * ONLY the modules the current demo user actually has access to (see
 * src/lib/current-user.ts). Keep `how` as short imperative bullets matching
 * the REAL current UI (re-check against the live page before editing, don't
 * guess), and keep `example` concrete with real-sounding names/numbers —
 * that's what makes it readable for a non-technical owner/staff member.
 */
export interface GuideModule {
  module: ModuleKey;
  route: string;
  icon: string;
  cat: "frontend" | "backend" | "finance" | "admin" | "whatsapp";
  /** "live" = real Postgres-backed + branch-isolated + access-controlled today.
   *  "pending" = still placeholder/demo data, shown honestly so no one treats
   *  it as real branch-separated numbers until its own DB migration lands. */
  status: "live" | "pending";
  title: string;
  short: string;
  what: string;
  how: string[];
  example: string;
}

export const GUIDE_MODULES: GuideModule[] = [
  {
    module: "DASHBOARD_OWNER",
    route: "/dashboard",
    icon: "📊",
    cat: "frontend",
    status: "pending",
    title: "Owner Dashboard",
    short: "Pehli screen — sabhi branches ka business health ek nazar mein. (Abhi demo data — real DB integration pending.)",
    what: "Yeh poore restaurant chain ka 'control room' hai. Aaj ka total sale, total inventory value, average prime cost %, kitne tasks overdue hain, aur kaunsi branch sabse achha perform kar rahi hai — sab ek screen par. ABHI: is module ka real database integration pending hai, isliye login ke baad yeh 'DB integration pending' panel dikhata hai, purana demo data nahi dikhata.",
    how: [
      "Top-left mein branch selector hai — 'All 6 Branches' ya ek specific branch choose kar sakte ho.",
      "5 KPI cards: Total Sales, Total Inventory Value, Avg Prime Cost %, Overdue Tasks, Top MIS Branch.",
      "Charts: Revenue trend, order channel split, branch-wise revenue.",
      "Sabse neeche: har branch ka pura drill-down table.",
    ],
    example:
      "Owner subah dashboard kholta hai, dekhta hai Connaught Place ne kal ₹1,42,500 sale kiya, lekin Noida mein 4 tasks overdue hain — turant Noida manager ko WhatsApp karta hai.",
  },
  {
    module: "REPORTS",
    route: "/reports",
    icon: "📑",
    cat: "frontend",
    status: "pending",
    title: "Reports",
    short: "6 detailed reports — Sales, MIS, Food Cost, Inventory, Cash, Aggregator.",
    what: "Dashboard sirf summary deta hai; Reports mein deep-dive karne ka option hai. Har report apna chart + table leke aata hai, 'Export CSV' se Excel mein download bhi kar sakte ho.",
    how: [
      "Sales Trend — revenue aur prime cost % ka 14-din graph.",
      "MIS Scorecard, Food Cost & Menu Margin, Inventory Variance, Cash Reconciliation, Aggregator Recon.",
    ],
    example:
      "Owner 'Food Cost' report kholta hai — Butter Chicken ₹420 mein bikta hai, ingredients ka cost sirf ₹138 — 33% food cost, healthy range mein.",
  },
  {
    module: "MIS_PERFORMANCE",
    route: "/performance",
    icon: "🏆",
    cat: "frontend",
    status: "pending",
    title: "MIS Leaderboard",
    short: "Har employee/branch ka performance score — kaun best kaam kar raha hai.",
    what: "MIS Score ek number hai (0-100%) jo batata hai koi employee apna kaam time pe karta hai ya nahi — 40% tasks, 30% delegation, 20% inventory variance, 10% cashier accuracy ke weightage se.",
    how: [
      "Table mein har person ka On-Time/Delay/Not-Done count dikhta hai.",
      "Score % — green (85%+) achha, orange (70-85%) theek-thaak, red (<70%) chinta ki baat.",
    ],
    example:
      "Rahul Sharma ka score 93.1% (42 on-time, 2 late) — No.1. Noida team ka score sirf 61.8% — owner ko pata chal jaata hai wahan training badhani hai.",
  },
  {
    module: "TASKS_DELEGATION",
    route: "/tasks",
    icon: "✅",
    cat: "frontend",
    status: "pending",
    title: "Tasks & Checklists",
    short: "Recurring checklist (daily/weekly/...) + one-time delegation — dono ek jagah.",
    what: "Do tarah ke kaam: (1) Recurring/Checklist — jaise roz fridge temp check, set karo ek baar system khud naya task banata rahega. (2) Delegation — one-time kaam, Priority ke saath.",
    how: [
      "'New Recurring / Checklist' — Frequency (Daily/Weekly/15-days/Monthly/Quarterly/Half-Yearly/Yearly) choose karo.",
      "'Delegate Task' — one-time kaam, Priority (High/Medium/Low).",
      "Recurring mein evidence photo OPTIONAL hai. Delegation mein evidence ZAROORI hai — bina photo Done nahi hoga.",
    ],
    example:
      "Priya ka 'Fridge temp log' daily checklist bina photo ke bhi Done ho jaata hai. Noida ka 'Exhaust fan repair' (one-time, HIGH priority) tab tak Done nahi hota jab tak repair ki photo attach na ho.",
  },
  {
    module: "INVENTORY",
    route: "/inventory",
    icon: "📦",
    cat: "backend",
    status: "live",
    title: "Inventory",
    short: "Har branch ka stock — real database, branch-se-branch alag, UOM + low-stock/overstock alerts.",
    what: "Har raw material ka current stock, UOM (kg/ltr/pcs), Minimum level (kam ho to red alert) aur Maximum level (zyada ho to overstock warning). YEH MODULE REAL DATABASE PAR HAI: ek hi item (jaise 'Chicken') ka naam har branch mein common catalog se aata hai, lekin stock qty/min/max har branch ka bilkul alag record hai — Gurugram ka 9kg dikhayega, Noida ka apna alag number. Branch Manager sirf apni branch ka stock dekh/add kar sakta hai; Owner sabhi branches dekh sakta hai.",
    how: [
      "'Add Item' — naya raw material register karo.",
      "Stock min se neeche → red 'Low Stock' badge. Max se upar → orange 'Overstock' badge.",
      "'Raise Indent' shortcut seedha Purchase module mein.",
    ],
    example: "Gurugram mein Chicken sirf 9kg bacha, minimum 20kg set hai — turant red 'Low Stock' badge dikh jaata hai.",
  },
  {
    module: "PURCHASE_ORDER",
    route: "/purchase",
    icon: "🛒",
    cat: "backend",
    status: "pending",
    title: "Purchase & GRN",
    short: "Indent → Manager Approval → 3-Step Purchase → Quality Check → Inventory.",
    what: "Poora 'kuch khareedna hai' ka process — Indent se lekar stock mein aane tak. 3 tabs: Indents, Purchase Orders, GRN/Quality.",
    how: [
      "Indent raise karo → 'Submit for Approval' → manager Approve/Reject karta hai.",
      "PO ke 3 steps: Buy → Bill Upload (optional) → Material Receive.",
      "GRN Quality Check: PASS = poora stock Inventory mein. FAIL/PARTIAL = kharab qty vendor ko wapas + Accounts mein refund entry.",
    ],
    example:
      "GRN-3309 Quality Check mein FAIL mila, 5kg wapas vendor ko, ₹2,250 Accounts mein refund entry ban gayi.",
  },
  {
    module: "POS_CASHIER",
    route: "/pos",
    icon: "💳",
    cat: "frontend",
    status: "pending",
    title: "POS / Cashier",
    short: "Restaurant ka billing system — Dine-in, Takeaway, Swiggy, Zomato sab ek jagah.",
    what: "Jab bhi customer order karta hai, uska bill yahan record hota hai — amount, channel, table, payment mode, kaunse cashier ne banaya.",
    how: ["'New Order' — branch, channel, table, amount, tender type bharo."],
    example: "Table T-12 par ₹1,840 ka Dine-in order, UPI se payment — CP-9981 turant POS table mein dikhne lagta hai.",
  },
  {
    module: "CASH_DROP",
    route: "/cash-drop",
    icon: "🔒",
    cat: "frontend",
    status: "pending",
    title: "Blind Cash Drop",
    short: "Shift end par cashier cash gin kar enter karta hai — bina expected amount dekhe.",
    what: "Shift khatam hone par cashier apna cash denomination-wise gin kar enter karta hai. 'Expected amount' submit karne se PEHLE kabhi nahi dikhta — isiliye 'Blind'.",
    how: ["₹500/200/100/50/20/10 notes + coins ginti enter karo.", "Submit karne ke baad hi shortage/excess reveal hota hai."],
    example: "Amit ne total ₹18,350 gina, submit ke baad pata chala expected ₹18,500 tha — ₹150 shortage.",
  },
  {
    module: "PETTY_CASH",
    route: "/accounts",
    icon: "💰",
    cat: "finance",
    status: "pending",
    title: "Accounts",
    short: "Petty Cash Book, Aggregator Recon, Profit & Loss, Balance Sheet — sab ek jagah.",
    what: "4 tabs: Petty Cash Book (chhoti expenses ka ledger), Aggregator Recon, Profit & Loss, Balance Sheet.",
    how: [
      "Petty Cash Entry — IN (top-up/refund) ya OUT (expense), running balance khud update.",
      "Balance Sheet: Assets = Liabilities + Equity match hona chahiye.",
    ],
    example: "Balance Sheet: Total Assets ₹52,53,400 = Liabilities+Equity ₹52,53,400 — books sahi hain.",
  },
  {
    module: "USER_ADMIN",
    route: "/admin/users",
    icon: "👥",
    cat: "admin",
    status: "live",
    title: "Users & Access",
    short: "Naya employee add karo, uska role aur exact kya-kya dekh sakta hai decide karo. Real login + real password ke saath.",
    what: "Har employee ka role hota hai, aur fine-grained 'Module Access' — jaise Cashier role ho par sirf POS + Cash Drop access do. YEH MODULE REAL DATABASE PAR HAI: Owner sabhi users bana/edit kar sakta hai (kisi bhi branch mein, HQ role bhi), Branch Admin (Branch Manager) SIRF apni branch ke users bana/edit kar sakta hai, aur sirf wahi module-access de sakta hai jo khud uske paas hai — apne se zyada access kisi ko nahi de sakta, aur khud ko bhi edit nahi kar sakta. Password change hote hi us user ka purana session turant revoke ho jaata hai.",
    how: ["'New User' — Name, WhatsApp phone, Password, Role, Branch.", "Module Access checkboxes — jo-jo dikhna chahiye wo tick karo (sirf wahi grants dikhte hain jo khud dene wale ke paas hain)."],
    example: "Amit Kumar ko Cashier role + sirf POS_CASHIER/CASH_DROP access diya — wo Accounts ya Users jaise modules bilkul nahi dekh payega, aur login karte hi sidebar mein sirf POS/Cash Drop hi dikhega.",
  },
  {
    module: "BRANCH_ADMIN",
    route: "/admin/branches",
    icon: "🏢",
    cat: "admin",
    status: "live",
    title: "Branches",
    short: "Branches ki real list — sirf Owner naya branch bana sakta hai.",
    what: "YEH MODULE REAL DATABASE PAR HAI. Owner naya branch create kar sakta hai, kisi bhi branch ko edit kar sakta hai, aur agar us branch mein koi data (users, stock) ho to use delete nahi kar sakta (safety check). Branch Admin apni hi branch dekh/edit kar sakta hai, naya branch nahi bana sakta. Clone Branch Wizard (ek branch ka pura menu/recipe/checklist doosre mein copy karna) abhi implement nahi hua hai — agar zaroorat ho to alag se banwana padega.",
    how: ["'New Branch' — sirf Owner ke liye: naam, code, address, geofence radius.", "Kisi bhi branch ko edit karne ke liye uski row par Edit dabao."],
    example: "Owner ne 'B7 — Vasant Kunj' naam se naya branch banaya — turant database mein save ho gaya aur Users & Access ke branch-dropdown mein bhi dikhne laga.",
  },
  {
    module: "WHATSAPP_LOGS",
    route: "/admin/settings/whatsapp",
    icon: "📲",
    cat: "whatsapp",
    status: "live",
    title: "WhatsApp Settings (ChatXFlow)",
    short: "Restaurant ka WhatsApp number yahan se connect hota hai — ab sirf Owner hi khol/save kar sakta hai.",
    what: "ChatXFlow se WhatsApp number connect karne ke baad, poora ERP automatically WhatsApp messages bhej sakta hai — task reminders, approval buttons, 8AM summary.",
    how: ["ChatXFlow.online par QR scan se number connect karo.", "API Token yahan paste karke Save Settings dabao."],
    example: "Indent approval pending hote hi owner ko WhatsApp par [Approve][Reject] buttons wala message aata hai.",
  },
];

export const CAT_LABEL: Record<GuideModule["cat"], string> = {
  frontend: "Daily Operations",
  finance: "Paisa / Finance",
  backend: "Khareedna / Stock",
  admin: "Admin / Setup",
  whatsapp: "WhatsApp Connection",
};

export const CAT_CLASS: Record<GuideModule["cat"], string> = {
  frontend: "border-sky-500/50 bg-sky-500/10",
  finance: "border-violet-500/50 bg-violet-500/10",
  backend: "border-emerald-500/50 bg-emerald-500/10",
  admin: "border-amber-500/50 bg-amber-500/10",
  whatsapp: "border-rose-500/50 bg-rose-500/10",
};
