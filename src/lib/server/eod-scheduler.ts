import { db } from "@/db/client";
import { branches } from "@/db/schema/platform";
import { locked } from "./auth";
import { previousBusinessDate } from "./business-calendar";
import { generateEodStockReport } from "./eod-report";
import type { Identity } from "./permissions";

const scheduledActor: Identity = {
  id: "system:eod-scheduler",
  name: "EOD scheduler",
  phoneE164: "",
  role: "SUPER_ADMIN",
  branchId: null,
  moduleAccess: ["INVENTORY"],
  status: "Active",
};

export interface ScheduledEodResult { generated: number; skipped: number; failed: { branchId: string; error: string }[]; }

export async function runScheduledEodReports(now = new Date()): Promise<ScheduledEodResult> {
  const reportDate = previousBusinessDate(now);
  const allBranches = await db.select({ id: branches.id }).from(branches);
  const result: ScheduledEodResult = { generated: 0, skipped: 0, failed: [] };
  for (const branch of allBranches) {
    try {
      const outcome = await locked((tx) => generateEodStockReport(tx, scheduledActor, branch.id, reportDate, {
        requestKey: `scheduled:${branch.id}:${reportDate}`,
        regenerate: false,
        source: "SCHEDULED",
        capturedAt: now,
      }));
      if (outcome.skipped || outcome.replayed) result.skipped++;
      else result.generated++;
    } catch (error) {
      result.failed.push({ branchId: branch.id, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return result;
}
