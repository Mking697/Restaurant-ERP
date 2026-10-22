"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell, canNavigate } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/lib/current-user";
import { GUIDE_MODULES, getGuideModules, CAT_LABEL, CAT_CLASS } from "@/lib/guide-content";
import { useTranslation } from "@/lib/i18n";
import { BookOpenCheck } from "lucide-react";

export default function GuideBookPage() {
  const uiText = useUiCopy();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const [openKey, setOpenKey] = React.useState<string | null>(null);

  const visible = getGuideModules(t).filter((m) => canNavigate(user, m.route, m.module));
  const open = visible.find(m => m.module === openKey);
  const hiddenCount = GUIDE_MODULES.length - visible.length;

  return (
    <AppShell activeHref="/guide">
      <PageHeader
        title={uiText("Guide Book")}
        description={t(`Only modules you can access are shown. Signed in as ${user.name} (${user.role.replace(/_/g, " ")}).`, `Sirf aapke access wale modules dikhte hain. Login: ${user.name} (${user.role.replace(/_/g, " ")}).`)}
      />

      <section className="mb-6 space-y-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="font-semibold text-foreground">{t("Language, theme and demo status", "Language, theme aur demo status")}</h2>
        <p>{t("English is the default. Switch to Hinglish with the Language selector. Choose Amber (light), Dark, Blue or Emerald with the Theme selector. Sign in with your 10-digit mobile number, without +91. Preferences are remembered in this browser and do not change permissions or business records.", "English default hai. Language selector se Hinglish chuno. Theme selector mein Amber (light), Dark, Blue ya Emerald chuno. Login mein sirf 10-digit mobile number bharo, +91 nahi. Preferences isi browser mein yaad rehti hain; permissions ya business records nahi badalte.")}</p>
        <p>{t("Four modules use the real database: Inventory, Users & Access, Branches and WhatsApp Settings. Eight are interactive demos: Dashboard, Reports, MIS, Tasks, Purchase, POS, Cash Drop and Accounts. Demo data is illustrative; page-local changes reset on reload and do not post to the database. Automated reminders, approvals and stock/refund postings remain pending.", "Chaar modules real database use karte hain: Inventory, Users & Access, Branches aur WhatsApp Settings. Aath interactive demos hain: Dashboard, Reports, MIS, Tasks, Purchase, POS, Cash Drop aur Accounts. Demo data sample hai; reload par local changes reset hote hain aur database mein post nahi hote. Auto reminders, approvals aur stock/refund posting pending hain.")}</p>
      </section>
      {visible.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          {uiText(" Aapke role mein abhi koi module access nahi hai. Admin se Users & Access mein apna Module Access set karwao. ")}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => (
          <button
            key={m.module}
            onClick={() => setOpenKey(m.module)}
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
                {m.status === "live" ? uiText("Live DB") : t("Demo · not saved", "Demo · save nahi hota")}
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
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-orange-500">{uiText("Real Example")}</div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
                  {open.example}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
