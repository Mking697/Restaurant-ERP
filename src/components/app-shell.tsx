"use client";
import * as React from "react";
import { RestaurantBrand } from "@/components/branding-provider";
import Link from "next/link";
import { PreferencesControls } from "@/components/preferences-controls";
import { useTranslation } from "@/lib/i18n";
import { LayoutDashboard, FileBarChart, Trophy, ListChecks, Boxes, ShoppingCart, CreditCard, Wallet, Landmark, Users, Building2, MessageCircle, BookOpenCheck, ChefHat, Warehouse as WarehouseIcon, Menu, Clock, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { Sheet, SheetContent, SheetCloseButton } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { clearCurrentUser, hasCurrentModule, refreshCurrentUser, requestJson, useCurrentUser, type CurrentUser } from "@/lib/current-user";
import { useBranches, useSelectedBranchId, setSelectedBranchId } from "@/lib/current-branch";
const ICONS: Record<string, LucideIcon> = { LayoutDashboard, FileBarChart, Trophy, ListChecks, Boxes, ShoppingCart, CreditCard, Wallet, Landmark, Users, Building2, MessageCircle, BookOpenCheck, ChefHat, WarehouseIcon, Clock };
export function canNavigate(user: CurrentUser, href: string, module: string) {
  if (!user.ready || !user.authenticated) return false;
  if (href === "/admin/users" || href === "/admin/branches") return ["SUPER_ADMIN", "BRANCH_MANAGER"].includes(user.role);
  if (href === "/admin/settings/restaurant" || href === "/admin/settings/whatsapp") return user.role === "SUPER_ADMIN";
  const groups: Record<string, string[]> = {
    "/tasks": ["TASKS_RECURRING", "CHECKLISTS", "TASKS_DELEGATION"],
    "/purchase": ["PURCHASE_INDENT", "PURCHASE_ORDER"],
    "/accounts": ["PETTY_CASH", "AGGREGATOR_RECON", "ACCOUNTS_EXPENSES", "PAYROLL", "OFFICIAL_SALES_REPORTS"],
    "/workforce": ["PAYROLL", "ATTENDANCE", "LEAVE_APPROVAL", "LEAVE_SELF"],
  };
  return hasCurrentModule(user, ...(groups[href] ?? [module]));
}
function Logo() { return <RestaurantBrand />; }
const NAV_HINGLISH: Record<string, string> = {
  "/dashboard": "Owner ka Dashboard", "/reports": "Reports", "/performance": "MIS Ranking",
  "/tasks": "Kaam aur Checklists", "/inventory": "Stock", "/purchase": "Kharid aur GRN", "/menu": "Menu aur BOM", "/warehouse": "Warehouse aur Transfer",
  "/workforce": "Staff, Attendance aur Salary", "/pos": "POS / Cashier", "/cash-drop": "Blind Cash Jama", "/accounts": "Hisaab",
  "/admin/settings/restaurant": "Restaurant ki Settings", "/admin/users": "Users aur Permissions", "/admin/branches": "Branches", "/admin/settings/whatsapp": "WhatsApp Settings", "/guide": "Guide Book",
};
function NavList({ user, activeHref, onNavigate }: { user: CurrentUser; activeHref?: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const items = [...NAV_ITEMS.filter(item => canNavigate(user, item.href, item.module)), { href: "/guide", label: "Guide Book", icon: "BookOpenCheck" }];
  return <nav className="flex-1 overflow-y-auto p-2">{items.map(item => {
    const Icon = ICONS[item.icon];
    return <Link key={item.href} href={item.href} prefetch={false} onClick={onNavigate} className={cn("mb-1 flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium", activeHref === item.href ? "bg-primary text-primary-foreground" : "hover:bg-accent")}><Icon className="size-4 shrink-0" />{t(item.label, NAV_HINGLISH[item.href])}</Link>;
  })}</nav>;
}
export function AppShell({ children, activeHref }: { children: React.ReactNode; activeHref?: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const selected = useSelectedBranchId();
  const { branches, loading, error: branchError } = useBranches();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loggingOut, setLoggingOut] = React.useState(false);
  React.useEffect(() => {
    // Login handles first-owner setup; do not block on a second setup fetch.
    if (user.ready && !user.authenticated && !user.error) router.replace("/login");
  }, [user.ready, user.authenticated, user.error, router]);
  React.useEffect(() => {
    if (user.role === "SUPER_ADMIN" && !loading && !branchError && selected !== "all" && !branches.some(branch => branch.id === selected)) setSelectedBranchId("all");
  }, [user.role, branches, loading, branchError, selected]);
  async function logout() {
    setLoggingOut(true); setError("");
    try { await requestJson("/api/auth/logout", { method: "POST" }); clearCurrentUser(); router.replace("/login"); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : t("Logout failed", "Logout nahi hua")); }
    finally { setLoggingOut(false); }
  }
  if (!user.ready || !user.authenticated) return <main className="p-6" aria-busy={!user.ready}>
    <p role={user.error || error ? "alert" : "status"}>{user.error || error || (user.ready ? t("Redirecting to login…", "Login par le ja rahe hain…") : t("Verifying session…", "Session verify ho raha hai…"))}</p>
    {(user.error || error) && <Button className="mt-3" onClick={() => { setError(""); void refreshCurrentUser(); }}>{t("Retry", "Dobara koshish karein")}</Button>}
  </main>;
  const owner = user.role === "SUPER_ADMIN";
  return <div className="flex min-h-screen">
    <aside className="hidden w-64 flex-col border-r bg-card md:flex"><div className="flex h-14 items-center border-b px-4"><Logo /></div><NavList user={user} activeHref={activeHref} /></aside>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent><div className="flex h-14 items-center justify-between border-b px-4"><Logo /><SheetCloseButton /></div><NavList user={user} activeHref={activeHref} onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2"><button type="button" aria-label={t("Open menu", "Menu kholein")} onClick={() => setMobileOpen(true)} className="p-2 md:hidden"><Menu className="size-5" /></button>
          <select aria-label={t("Branch", "Branch")} value={selected} disabled={!owner || loading || !!branchError} onChange={event => setSelectedBranchId(event.target.value)} className="max-w-52 rounded-md border bg-card p-2 text-sm disabled:opacity-70">
            {owner && <option value="all">{t("All branches (compiled)", "Saari branches (compiled)")}</option>}
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}
            {!owner && !branches.length && <option value={selected}>{loading ? t("Loading branch…", "Branch load ho rahi hai…") : user.branchId ? t("Own branch", "Apni branch") : t("No branch assigned", "Branch assign nahi hai")}</option>}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm"><PreferencesControls /><span className="hidden sm:inline">{user.name}</span><Link href="/guide" className="flex items-center gap-1"><BookOpenCheck className="size-4" />{t("Guide", "Guide")}</Link><Button variant="outline" size="sm" disabled={loggingOut} onClick={logout}>{t("Log out", "Logout karein")}</Button></div>
      </header>
      {(error || branchError) && <p role="alert" className="p-3 text-sm text-destructive">{error || branchError}</p>}
      <main className="flex-1 overflow-x-hidden bg-background p-3 sm:p-4 md:p-6">{children}</main>
    </div>
  </div>;
}

