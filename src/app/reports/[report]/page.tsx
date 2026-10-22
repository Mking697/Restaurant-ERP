import { notFound } from "next/navigation";
import { REPORT_DEFS, type ReportSlug } from "@/lib/reports";
import { protectedPage } from "@/components/protected-page";
import ReportDetailContent from "./report-content";
export const dynamic = "force-dynamic";
export function generateStaticParams() { return REPORT_DEFS.map(r => ({ report: r.slug })); }
export default async function ReportDetailPage({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  return protectedPage(`/reports/${report}`, () => {
    if (!REPORT_DEFS.some(r => r.slug === report)) notFound();
    return <ReportDetailContent slug={report as ReportSlug} />;
  });
}
