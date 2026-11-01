"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Save } from "lucide-react";

// P0 decision (October 31, 2026): both thresholds below are explicitly
// Owner-configurable at runtime, not fixed in code. Empty = disabled/not
// enforced; see src/lib/server/business-policy.ts for the real contract.
export default function BusinessPolicySettingsPage() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const scope = JSON.stringify([actor.id, actor.role, actor.ready, actor.authenticated, actor.error]);
  const live = React.useRef(scope); live.current = scope;
  const allowed = actor.ready && actor.authenticated && !actor.error && actor.role === "SUPER_ADMIN";
  const [loadedScope, setLoadedScope] = React.useState("");
  const [indentValueThresholdTsh, setIndentValueThresholdTsh] = React.useState("");
  const [costYieldTolerancePercent, setCostYieldTolerancePercent] = React.useState("");
  const [nearExpiryWarningDays, setNearExpiryWarningDays] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "loading" | "saved" | "error">("idle");
  const [error, setError] = React.useState("");
  type Policy = { indentValueThresholdTsh: string | null; costYieldTolerancePercent: string | null; nearExpiryWarningDays: string | null };
  function apply(data: Policy) { setIndentValueThresholdTsh(data.indentValueThresholdTsh ?? ""); setCostYieldTolerancePercent(data.costYieldTolerancePercent ?? ""); setNearExpiryWarningDays(data.nearExpiryWarningDays ?? ""); }
  React.useEffect(() => {
    let active = true; setLoadedScope(""); setError(""); setStatus("loading");
    if (allowed) void requestJson<Policy>("/api/admin/settings/business-policy").then(data => { if (active && live.current === scope) { apply(data); setLoadedScope(scope); setStatus("idle"); } }).catch(err => { if (active && live.current === scope) { setError(err.message); setStatus("error"); } });
    return () => { active = false; };
  }, [scope, allowed]);
  async function save() {
    if (!allowed || live.current !== scope || loadedScope !== scope || status === "loading") return;
    if (nearExpiryWarningDays !== "" && (!/^\d+$/.test(nearExpiryWarningDays) || Number(nearExpiryWarningDays) > 365)) { setError("Near-expiry warning must be a whole number from 0 to 365, or blank to disable."); setStatus("error"); return; }
    setStatus("loading"); setError("");
    try {
      await requestJson("/api/admin/settings/business-policy", { method: "POST", body: JSON.stringify({ indentValueThresholdTsh, costYieldTolerancePercent, nearExpiryWarningDays }) });
      if (live.current !== scope) return;
      const data = await requestJson<Policy>("/api/admin/settings/business-policy");
      if (live.current === scope) { apply(data); setStatus("saved"); }
    } catch (err) { if (live.current === scope) { setError(err instanceof Error ? err.message : "Save unconfirmed; reload before retrying."); setStatus("error"); } }
  }

  return (
    <AppShell activeHref="/admin/settings/business-policy">
      <PageHeader
        title={uiText("Business Policy Settings", "Business Policy Settings")}
        description={uiText(
          "Owner only. These values are empty by default (gate/feature disabled) until you set them — nothing here is assumed automatically.",
          "Sirf Owner. Yeh values default khali hain (gate/feature band hai) jab tak aap set na karein — kuch bhi automatically assume nahi hota.",
        )}
      />

      {!allowed ? <p role="alert">{uiText("Owner access required.")}</p> : loadedScope !== scope ? <p role="status">{uiText(error || "Loading policy…")}</p> : <fieldset disabled={status === "loading"}>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{uiText("Indent HO-approval value threshold", "Indent HO-approval value threshold")}</CardTitle>
          <CardDescription>
            {uiText(
              "An Indent whose estimated value (latest locked vendor rate × requested qty) is at or above this TSh amount always requires Owner/HO approval, even if the quantity-spike check alone would auto-approve it. Leave blank to use only the existing quantity-spike check. If any requested material has no vendor rate recorded yet, the estimate is unknown and is treated the same as exceeding the threshold.",
              "Jis Indent ki andaazan value (latest locked vendor rate × requested qty) is TSh amount ke barabar ya zyada ho, uspar hamesha Owner/HO approval chahiye hogi, chahe quantity-spike check auto-approve kar raha ho. Khali rakhein to sirf existing quantity-spike check chalega. Agar kisi material ka vendor rate set nahi hai, to value unknown maani jayegi aur threshold cross karne jaisa treat hogi.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{uiText("Threshold (TSh)", "Threshold (TSh)")}</label>
            <input
              aria-label="Threshold (TSh)"
              value={indentValueThresholdTsh}
              onChange={(e) => setIndentValueThresholdTsh(e.target.value)}
              placeholder={uiText("e.g. 500000.00 — leave blank to disable", "jaise 500000.00 — khali rakhein to band")}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl mt-6">
        <CardHeader>
          <CardTitle>{uiText("Cost/yield variance tolerance (%)", "Cost/yield variance tolerance (%)")}</CardTitle>
          <CardDescription>
            {uiText(
              "Stored for the Owner now; NOT YET enforced anywhere. Actual production yield/cost tracking (a separate, not-yet-built feature) will read this value once it exists — saving it here does not change any behavior today.",
              "Abhi sirf Owner ke liye store ho raha hai; kahin bhi enforce NAHI ho raha. Actual production yield/cost tracking (ek alag, abhi tak na-bani feature) jab banegi tabhi yeh value use hogi — abhi save karne se koi behavior change nahi hota.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{uiText("Tolerance (%)", "Tolerance (%)")}</label>
            <input
              aria-label="Tolerance (%)"
              value={costYieldTolerancePercent}
              onChange={(e) => setCostYieldTolerancePercent(e.target.value)}
              placeholder={uiText("e.g. 5 — leave blank, not enforced yet", "jaise 5 — khali rakhein, abhi enforce nahi hota")}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm"
            />
          </div>
          <label className="block space-y-1 text-xs font-medium">{uiText("Near-expiry warning (days)")}<input type="number" min="0" max="365" step="1" aria-label="Near-expiry warning days" value={nearExpiryWarningDays} onChange={e => setNearExpiryWarningDays(e.target.value)} placeholder={uiText("Blank = warning disabled")} className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm" /></label>
          <p className="text-xs">{uiText("Owner-configured warning only. Blank disables near-expiry highlighting; expired and unknown-expiry stock remain blocked regardless. No default number of days is assumed.")}</p>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={status === "loading"}>
              <Save /> {uiText("Save Settings", "Settings Save karein")}</Button>
            {status === "saved" && (
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="size-4" /> {uiText("Saved", "Save ho gaya")}</span>
            )}
            {status === "error" && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>
      </fieldset>}
    </AppShell>
  );
}
