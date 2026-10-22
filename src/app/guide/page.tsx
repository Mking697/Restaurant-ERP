"use client";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser, hasCurrentModule } from "@/lib/current-user";
import { GUIDE_MODULES, CAT_LABEL, CAT_CLASS, type GuideModule } from "@/lib/guide-content";
import { BookOpenCheck } from "lucide-react";

export default function GuideBookPage() {
  const user = useCurrentUser();
  const [open, setOpen] = React.useState<GuideModule | null>(null);

  const visible = GUIDE_MODULES.filter((m) => hasCurrentModule(user, m.module));
  const hiddenCount = GUIDE_MODULES.length - visible.length;

  return (
    <AppShell activeHref="/guide">
      <PageHeader
        title="Guide Book"
        description={`Jo module aapko access hai, sirf wahi yahan dikh raha hai — logged in as ${user.name} (${user.role.replace(/_/g, " ")}).`}
      />

      {visible.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Aapke role mein abhi koi module access nahi hai. Admin se Users &amp; Access mein apna Module Access set
          karwao.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => (
          <button
            key={m.module}
            onClick={() => setOpen(m)}
            className={`rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5 hover:shadow-lg ${CAT_CLASS[m.cat]}`}
          >
            <div className="mb-2 flex items-start justify-between">
              <span className="text-2xl">{m.icon}</span>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {CAT_LABEL[m.cat]}
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
                {m.status === "live" ? "Live DB" : "Pending"}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{m.short}</p>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
              <BookOpenCheck className="size-3.5" /> Click karo pura samajhne ke liye
            </div>
          </button>
        ))}
      </div>

      {hiddenCount > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          {hiddenCount} aur module hain jo aapke role ke access mein nahi hain, isliye yahan nahi dikhaye gaye.
        </p>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
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
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-orange-500">Yeh kya hai?</div>
                <p className="text-muted-foreground">{open.what}</p>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-orange-500">
                  Kaise use hota hai?
                </div>
                <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                  {open.how.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-orange-500">Real Example</div>
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
