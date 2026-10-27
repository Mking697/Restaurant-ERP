import type { Identity } from "./permissions";
import type { ModuleKey } from "../moduleAccess";

const RULES: Array<[string, ModuleKey[]]> = [
 ["/admin/settings/whatsapp", ["WHATSAPP_LOGS"]],
 ["/admin/branches", ["BRANCH_ADMIN"]], ["/admin/users", ["USER_ADMIN"]],
 ["/dashboard", ["DASHBOARD_OWNER"]], ["/reports", ["REPORTS"]],
 ["/performance", ["MIS_PERFORMANCE"]],
 ["/tasks", ["TASKS_RECURRING", "CHECKLISTS", "TASKS_DELEGATION"]],
 ["/menu", ["MENU_BOM"]],
 ["/purchase", ["PURCHASE_INDENT", "PURCHASE_ORDER"]],
 ["/inventory", ["INVENTORY"]], ["/pos", ["POS_CASHIER"]],
 ["/warehouse", ["INVENTORY"]],
 ["/cash-drop", ["CASH_DROP"]], ["/accounts", ["PETTY_CASH", "AGGREGATOR_RECON", "ACCOUNTS_EXPENSES", "PAYROLL", "OFFICIAL_SALES_REPORTS"]],
 ["/admin/settings/shifts", ["SHIFT_MANAGEMENT"]],
 ["/workforce", ["PAYROLL", "ATTENDANCE", "LEAVE_APPROVAL", "LEAVE_SELF"]],
];
export function canOpenPath(user: Identity, path: string) {
 if (path === "/guide" || path === "/") return true;
 if (path === "/admin/settings/restaurant" || path.startsWith("/admin/settings/restaurant/")) return user.role === "SUPER_ADMIN";
 if (path === "/admin/settings/whatsapp") return user.role === "SUPER_ADMIN";
 if ((path === "/admin/users" || path === "/admin/branches") && user.role === "BRANCH_MANAGER") return true;
 const rule = RULES.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
 return !!rule && (user.role === "SUPER_ADMIN" || rule[1].some(key => user.moduleAccess.includes(key)));
}
// No mock business records are exposed as if persisted and branch-isolated.
// Enable each remaining route only after its DB-backed acceptance is complete.
export function isPersistedPath(path: string) {
 return ["/", "/guide", "/accounts", "/workforce", "/admin/users", "/admin/branches", "/inventory", "/menu", "/pos", "/warehouse", "/admin/settings/whatsapp", "/admin/settings/restaurant", "/admin/settings/shifts", "/cash-drop"].includes(path);
}
