"use client";
import { useUiCopy } from "@/lib/ui-copy";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { REPORT_DEFS, reportReadModule } from "@/lib/reports";
import { hasCurrentModule, useCurrentUser } from "@/lib/current-user";
import { ArrowRight } from "lucide-react";

export default function ReportsPage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  return (
    <AppShell activeHref="/reports">
      <PageHeader
        title={uiText("Reports")}
        description={uiText("Har report ke apne charts hain — click karke kholo. Excel export button Phase 3 mein wire hoga.")}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_DEFS.map((r) => (
          hasCurrentModule(actor, reportReadModule(r.slug)) ? <Link key={r.slug} href={`/reports/${r.slug}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-semibold text-foreground">
                  {uiText(r.title)}
                  <ArrowRight className="size-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription>{uiText(r.description)}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link> : <Card key={r.slug} className="opacity-70"><CardHeader><CardTitle>{uiText(r.title)}</CardTitle></CardHeader><CardContent><p className="text-sm">{uiText(`Requires ${reportReadModule(r.slug)} access. Ask an administrator to grant it.`, `${reportReadModule(r.slug)} access chahiye. Administrator se grant maango.`)}</p></CardContent></Card>
        ))}
      </div>
    </AppShell>
  );
}
