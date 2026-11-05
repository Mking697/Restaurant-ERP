"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";
import { ListChecks } from "lucide-react";

interface PendingWorkItem { type: string; count: number; href: string }
interface PendingWorkResponse { items: PendingWorkItem[] }

const LABELS: Record<string, [string, string]> = {
  my_tasks: ["pending task(s) assigned to you", "aapko assign kiye gaye pending task"],
  shift_handover: ["shift handover waiting for acceptance", "shift handover accept karna baki hai"],
  ho_cash_dispatch: ["HO cash dispatch waiting for your acceptance", "HO cash dispatch aapke accept karne ka intezaar kar raha hai"],
  leave_review: ["leave request(s) waiting for your review", "leave request(s) aapke review ka intezaar kar rahe hain"],
  indent_approval: ["indent(s) waiting for your approval", "indent(s) aapke approval ka intezaar kar rahe hain"],
  stock_count_review: ["stock count(s) submitted, waiting for review", "stock count(s) submit hue hain, review baaki hai"],
  grn_quality: ["GRN(s) waiting for quality check", "GRN(s) ka quality check baaki hai"],
  invoice_approval: ["vendor invoice(s) matched, waiting for approval", "vendor invoice(s) match ho gaye, approval baaki hai"],
  invoice_payment: ["vendor invoice(s) approved, waiting for payment", "vendor invoice(s) approve ho gaye, payment baaki hai"],
  ho_stock_review: ["HO stock review item(s) still open", "HO stock review ke item abhi open hain"],
};

/**
 * Compact "what's waiting on you" banner. Federated read across existing
 * module tables (no new central table) — see src/lib/server/pending-work.ts.
 * Drop this near the top of any module page; it silently renders nothing
 * when the actor has no pending items for that module.
 */
export function PendingWorkWidget() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const [items, setItems] = React.useState<PendingWorkItem[]>([]);

  React.useEffect(() => {
    if (!actor.authenticated) return;
    const controller = new AbortController();
    requestJson<PendingWorkResponse>("/api/pending-work", { signal: controller.signal })
      .then((data) => setItems(data.items))
      .catch((err) => { if (!(err instanceof RequestJsonError && err.outcome === "unknown")) setItems([]); });
    return () => controller.abort();
  }, [actor.authenticated, actor.id]);

  if (!items.length) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <span className="flex items-center gap-1.5 text-sm font-medium"><ListChecks className="size-4 text-primary" />{uiText("Pending for you:", "Aapke liye pending:")}</span>
      {items.map((item) => {
        const label = LABELS[item.type];
        return (
          <a key={item.type} href={item.href} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary/50">
            <Badge variant="warning">{item.count}</Badge>
            <span>{label ? uiText(label[0], label[1]) : item.type}</span>
          </a>
        );
      })}
    </div>
  );
}
