"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell, canNavigate } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/lib/current-user";
import { GUIDE_MODULES, getGuideModules, CAT_LABEL, CAT_CLASS } from "@/lib/guide-content";
import { useTranslation } from "@/lib/i18n";
import { getGuideExample } from "@/lib/guide-examples";
import { BookOpenCheck } from "lucide-react";

export default function GuideBookPage() {
  const uiText = useUiCopy();
  const { t, language } = useTranslation();
  const user = useCurrentUser();
  const [openKey, setOpenKey] = React.useState<number | null>(null);

  const visible = getGuideModules(t).filter((m) => canNavigate(user, m.route, m.module));
  const open = openKey !== null ? visible[openKey] : undefined;
  const walkthrough = open ? getGuideExample(open.exampleKey ?? open.route, language) : undefined;
  const hiddenCount = GUIDE_MODULES.length - visible.length;

  return (
    <AppShell activeHref="/guide">
      <PageHeader
        title={uiText("Guide Book")}
        description={t(`Only modules you can access are shown. Signed in as ${user.name} (${user.role.replace(/_/g, " ")}).`, `Sirf aapke access wale modules dikhte hain. Login: ${user.name} (${user.role.replace(/_/g, " ")}).`)}
      />

      <section className="mb-6 space-y-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="font-semibold text-foreground">{t("Language, theme and demo status", "Language, theme aur demo status")}</h2>
        <p>{t("English is the default. Switch to Hinglish with the Language selector. Choose Amber (light), Dark, Blue or Emerald with the Theme selector. Sign in with your 9-digit Tanzanian mobile number, without +255. Preferences are remembered in this browser and do not change permissions or business records.", "English default hai. Language selector se Hinglish chuno. Theme selector mein Amber (light), Dark, Blue ya Emerald chuno. Login mein sirf 9-digit mobile number bharo, +255 nahi. Preferences isi browser mein yaad rehti hain; permissions ya business records nahi badalte.")}</p>
        <p>{t("Inventory, Users, Branches, provider/restaurant settings and Staff/Attendance/Leave/Payroll use the database. Accounts Expenses and payroll costs are real; sales/COGS and full profit reporting remain unconnected. Other labelled accounting areas and Dashboard, Reports, MIS, Tasks, Purchase, POS and Cash Drop remain demos. Demo records are not real financial postings.", "Inventory, Users, Branches, provider/restaurant settings aur Staff/Attendance/Leave/Payroll DB-backed hain. Accounts Expenses aur payroll costs real hain; sales/COGS aur full profit reporting abhi connected nahi. Baaki labelled accounting areas aur Dashboard, Reports, MIS, Tasks, Purchase, POS, Cash Drop demo hain. Demo records real financial posting nahi hain.")}</p>
      </section>
      {user.role === "SUPER_ADMIN" && <section className="mb-6 space-y-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="font-semibold text-foreground">{t("Example: set your restaurant name and logo", "Example: restaurant ka naam aur logo set karo")}</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t("Open Restaurant Settings as Owner. First-time Owners can enter the same details during signup.", "Owner se Restaurant Settings kholo. Naya Owner signup ke time bhi yahi details bhar sakta hai.")}</li>
          <li>{t("Enter your restaurant name, for example Garden Restaurant, and choose your own PNG, JPEG or WebP logo (up to 1 MB).", "Restaurant ka naam, jaise Garden Restaurant, bharo aur apna PNG, JPEG ya WebP logo chuno (1 MB tak).")}</li>
          <li>{t("Check the preview and click Save restaurant. Use Remove logo followed by Save to clear it.", "Preview check karke Save restaurant dabao. Logo hatane ke liye Remove logo aur phir Save dabao.")}</li>
          <li>{t("Expected result: the saved name/logo appear in the sidebar, login page and browser tab/favicon across the chain. This is a real global setting, not demo data.", "Result: saved naam/logo sidebar, login aur browser tab/favicon mein saari chain ke liye dikhenge. Yeh real global setting hai, demo data nahi.")}</li>
        </ol>
      </section>}
      {visible.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          {uiText(" Aapke role mein abhi koi module access nahi hai. Admin se Users & Access mein apna Module Access set karwao. ")}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m, i) => (
          <button
            key={`${m.module}-${m.route}`}
            onClick={() => setOpenKey(i)}
            className={`rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5 hover:shadow-lg ${CAT_CLASS[m.cat]}`}
          >
            <div className="mb-2 flex items-start justify-between">
              <span className="text-2xl">{m.icon}</span>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {uiText(CAT_LABEL[m.cat])}
              </span>
            </div>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{m.title}</h3>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  m.status === "live"
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-amber-500/15 text-amber-600"
                }`}
              >
                {m.status === "live" ? uiText("Live DB") : m.status === "mixed" ? t("Partly live", "Kuch hissa real") : t("Demo · not saved", "Demo · save nahi hota")}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{m.short}</p>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
              <BookOpenCheck className="size-3.5" /> {uiText(" Click karo pura samajhne ke liye ")}</div>
          </button>
        ))}
      </div>

      {hiddenCount > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          {hiddenCount} {uiText(" aur module hain jo aapke role ke access mein nahi hain, isliye yahan nahi dikhaye gaye. ")}</p>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenKey(null)}>
        {open && (
          <DialogContent>
            <DialogHeader>
              <div className="mb-1 inline-block w-fit rounded-md border bg-muted px-2 py-1 font-mono text-[11px] text-cyan-600">
                {open.route}
              </div>
              <DialogTitle className="text-xl">
                {open.icon} {open.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm leading-relaxed">
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-orange-500">{uiText("Yeh kya hai?")}</div>
                <p className="text-muted-foreground">{open.what}</p>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-orange-500">
                  {uiText(" Kaise use hota hai? ")}</div>
                <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                  {open.how.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-orange-500">{t("Try this example — step by step", "Yeh example try karo — step by step")}</div>
                <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-200">
                  {walkthrough ? <>
                    <p className="font-medium">{walkthrough.scenario}</p>
                    <ol className="list-decimal space-y-2 pl-5">{walkthrough.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                    <p className="border-t border-emerald-500/30 pt-2"><strong>{t("Expected result: ", "Result kya hoga: ")}</strong>{walkthrough.result}</p>
                    <p className="text-xs">{t("These are practice instructions, not a button that creates data automatically. Only try real-record steps in a test branch/account.", "Yeh practice instructions hain; data apne aap create nahi hota. Real-record steps sirf test branch/account mein try karo.")}</p>
                  </> : open.example}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
