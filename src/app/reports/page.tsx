import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { REPORT_DEFS } from "@/lib/reports";
import { ArrowRight } from "lucide-react";

export default function ReportsPage() {
  return (
    <AppShell activeHref="/reports">
      <PageHeader
        title="Reports"
        description="Har report ke apne charts hain — click karke kholo. Excel export button Phase 3 mein wire hoga."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_DEFS.map((r) => (
          <Link key={r.slug} href={`/reports/${r.slug}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-semibold text-foreground">
                  {r.title}
                  <ArrowRight className="size-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
