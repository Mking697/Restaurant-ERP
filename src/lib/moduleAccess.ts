/**
 * Module keys for users.moduleAccess (text[]) — granular per-module access on
 * top of `role`. Mirrors Pro ERP's src/lib/moduleAccess.ts convention: role
 * decides the default bundle, moduleAccess can grant/narrow individual modules
 * without inventing a new role per combination.
 */
export const MODULE_KEYS = [
  "DASHBOARD_OWNER", // compiled + per-branch drill-down dashboard
  "BRANCH_ADMIN", // create/edit branches, clone branch wizard
  "USER_ADMIN", // create users, assign role + moduleAccess
  "MENU_BOM", // menu items + BOM recipes (HQ lock editing)
  "VENDOR_RATES", // vendor master + HQ-locked rates
  "INVENTORY", // stock, batches, wastage, night variance
  "PURCHASE_INDENT", // raise/approve indents
  "PURCHASE_ORDER", // PO + GRN + 3-way match
  "TASKS_RECURRING", // recurring FMS task definitions
  "TASKS_DELEGATION", // one-time delegation
  "CHECKLISTS", // multi-step checklist templates/runs (opening/closing, audits)
  "POS_CASHIER", // POS billing
  "CASH_DROP", // blind cash drop entry
  "PETTY_CASH", // petty cash ledger
  "AGGREGATOR_RECON", // Swiggy/Zomato reconciliation
  "MIS_PERFORMANCE", // MIS score leaderboard
  "REPORTS", // reports module
  "WHATSAPP_LOGS", // WhatsApp message log / audit viewer
  "ACCOUNTS_EXPENSES", // branch categorized operating expenses and P&L
  "PAYROLL", // employee compensation and finalized monthly payroll
  "ATTENDANCE", // branch daily attendance marking
  "LEAVE_APPROVAL", // branch leave review (never own leave)
  "LEAVE_SELF", // linked employee self-service applications
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
