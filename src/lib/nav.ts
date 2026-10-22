export const NAV_ITEMS = [
  { href: "/admin/settings/restaurant", label: "Restaurant Settings", icon: "Building2", module: "USER_ADMIN" },
  { href: "/dashboard", label: "Owner Dashboard", icon: "LayoutDashboard", module: "DASHBOARD_OWNER" },
  { href: "/reports", label: "Reports", icon: "FileBarChart", module: "REPORTS" },
  { href: "/performance", label: "MIS Leaderboard", icon: "Trophy", module: "MIS_PERFORMANCE" },
  { href: "/tasks", label: "Tasks & Checklists", icon: "ListChecks", module: "TASKS_DELEGATION" },
  { href: "/inventory", label: "Inventory", icon: "Boxes", module: "INVENTORY" },
  { href: "/purchase", label: "Purchase & GRN", icon: "ShoppingCart", module: "PURCHASE_ORDER" },
  { href: "/pos", label: "POS / Cashier", icon: "CreditCard", module: "POS_CASHIER" },
  { href: "/cash-drop", label: "Blind Cash Drop", icon: "Wallet", module: "CASH_DROP" },
  { href: "/accounts", label: "Accounts", icon: "Landmark", module: "PETTY_CASH" },
  { href: "/admin/users", label: "Users & Access", icon: "Users", module: "USER_ADMIN" },
  { href: "/admin/branches", label: "Branches", icon: "Building2", module: "BRANCH_ADMIN" },
  { href: "/admin/settings/whatsapp", label: "WhatsApp Settings", icon: "MessageCircle", module: "WHATSAPP_LOGS" },
] as const;

export const BRANCHES = [
  { id: "all", code: "ALL", name: "All 6 Branches (Compiled)" },
  { id: "b1", code: "B1", name: "Branch 1 — Connaught Place" },
  { id: "b2", code: "B2", name: "Branch 2 — Saket" },
  { id: "b3", code: "B3", name: "Branch 3 — Gurugram" },
  { id: "b4", code: "B4", name: "Branch 4 — Noida" },
  { id: "b5", code: "B5", name: "Branch 5 — Dwarka" },
  { id: "b6", code: "B6", name: "Branch 6 — Rohini" },
] as const;
