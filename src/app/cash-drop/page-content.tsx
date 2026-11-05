"use client";
import { useUiCopy } from "@/lib/ui-copy";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatInr } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { useShiftStatus, ShiftHandoverGate, useShiftWriteGuard } from "@/lib/shift-gate";
import { ShiftSummaryPanel } from "./shift-summary-panel";
import { HoCashDispatchPanel } from "./ho-cash-dispatch-panel";

const DENOMS = [10000, 5000, 2000, 1000, 500] as const;

interface EndShiftResult { handover: { id: string; cashAmount: string; cardAmount: string; upiAmount: string; otherAmount: string }; toRun: { label: string }; cashExpected: string; shortageExcessInr: string }
interface DispatchResult { dispatch: { id: string; countedCashInr: string; retainedFloatInr: string; dispatchedAmountInr: string }; cashExpected: string; shortageExcessInr: string }

export default function CashDropPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  return <ScopedCashDrop key={JSON.stringify([actor.id, actor.role, actor.branchId, actor.authenticated, actor.moduleAccess, selected])} />;
}
function ScopedCashDrop() {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const allowed = hasCurrentModule(actor, "CASH_DROP");
  const branchId = actor.role === "SUPER_ADMIN" ? (selected !== "all" ? selected : "") : actor.branchId ?? "";
  const shiftStatus = useShiftStatus(branchId, allowed);

  const [counts, setCounts] = React.useState<Record<number, number>>({ 10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0 });
  const [coins, setCoins] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [submitted, setSubmitted] = React.useState<EndShiftResult | null>(null);
  const [dispatched, setDispatched] = React.useState<DispatchResult | null>(null);
  const [retainedFloat, setRetainedFloat] = React.useState("");
  // GAP-033: Branch Manager/Owner-only, optional opening float for the
  // branch's very first-ever shift. A plain cashier never sees these
  // fields and starts a shift exactly as before.
  const canRecordOpeningFloat = actor.role === "SUPER_ADMIN" || actor.role === "BRANCH_MANAGER";
  const [openingFloat, setOpeningFloat] = React.useState("");
  const [openingFloatReference, setOpeningFloatReference] = React.useState("");

  const writeGuard = useShiftWriteGuard(`${actor.id}:${branchId}`);
  const [summaryToken, setSummaryToken] = React.useState(0);
  const countRun = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (shiftStatus.run && countRun.current !== shiftStatus.run.id) {
      countRun.current = shiftStatus.run.id;
      setCounts({ 10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0 }); setCoins(0);
    }
  }, [shiftStatus.run]);
  const canWrite = allowed && !!branchId && !busy && !shiftStatus.loading && !shiftStatus.error && !shiftStatus.pendingHandover && writeGuard.ready && !writeGuard.blocked;
  const countedCashInr = DENOMS.reduce((sum, d) => sum + d * (counts[d] || 0), 0) + coins;

  async function startShift() {
    const payload: { branchId: string; openingFloatInr?: string; openingFloatReference?: string } = { branchId };
    if (canRecordOpeningFloat && openingFloat.trim()) { payload.openingFloatInr = openingFloat.trim(); payload.openingFloatReference = openingFloatReference.trim(); }
    if (!canWrite || !writeGuard.begin("/api/shift-runs", payload)) return;
    setBusy(true); setError("");
    try {
      const saved = await requestJson<{ run: { id: string; branchId: string } }>("/api/shift-runs", { method: "POST", body: JSON.stringify(payload) });
      if (!saved.run?.id || saved.run.branchId !== branchId) throw new Error("Could not confirm shift start. Verify saved records before continuing.");
      writeGuard.finish(); setOpeningFloat(""); setOpeningFloatReference(""); setSummaryToken(v => v + 1); await shiftStatus.reload();
    }
    catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected") writeGuard.finish();
      setError(err instanceof Error ? err.message : "Could not confirm shift start. Verify saved status before retrying.");
    }
    finally { setBusy(false); }
  }

  async function endShift() {
    if (!canWrite || !shiftStatus.run || countRun.current !== shiftStatus.run.id) return;
    if (!DENOMS.every((d) => Number.isSafeInteger(counts[d]) && counts[d] >= 0) || !Number.isFinite(coins) || coins < 0) { setError("Enter whole non-negative note counts and a valid coin amount."); return; }
    const url = `/api/shift-runs/${encodeURIComponent(shiftStatus.run.id)}/end`;
    const payload = { branchId, note10000Count: counts[10000], note5000Count: counts[5000], note2000Count: counts[2000], note1000Count: counts[1000], note500Count: counts[500], coinsInr: coins };
    if (!writeGuard.begin(url, payload)) return;
    setBusy(true); setError(""); setSubmitted(null);
    try {
      const data = await requestJson<EndShiftResult>(url, { method: "POST", body: JSON.stringify(payload) });
      // A malformed acknowledgement is unknown too; retain the original run journal.
      if (!data.handover?.id || !data.toRun?.label || typeof data.cashExpected !== "string" || typeof data.shortageExcessInr !== "string") throw new Error("Could not confirm shift closure. Verify saved records before continuing.");
      setSubmitted(data);
      writeGuard.finish();
      setCounts({ 10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0 }); setCoins(0);
      setSummaryToken(v => v + 1);
      await shiftStatus.reload();
    } catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected") writeGuard.finish();
      setError(err instanceof Error ? err.message : "Could not confirm shift closure. Verify saved records before continuing.");
    }
    finally { setBusy(false); }
  }

  // GAP-036: the branch's FINAL shift of the business day — cash goes to
  // Head Office instead of to another shift here. Never opens a next run.
  async function dispatchToHo() {
    if (!canWrite || !shiftStatus.run || countRun.current !== shiftStatus.run.id) return;
    if (!DENOMS.every((d) => Number.isSafeInteger(counts[d]) && counts[d] >= 0) || !Number.isFinite(coins) || coins < 0) { setError("Enter whole non-negative note counts and a valid coin amount."); return; }
    const url = `/api/shift-runs/${encodeURIComponent(shiftStatus.run.id)}/dispatch-ho`;
    const payload = { branchId, note10000Count: counts[10000], note5000Count: counts[5000], note2000Count: counts[2000], note1000Count: counts[1000], note500Count: counts[500], coinsInr: coins, retainedFloatInr: retainedFloat.trim() || undefined };
    if (!writeGuard.begin(url, payload)) return;
    setBusy(true); setError(""); setDispatched(null);
    try {
      const data = await requestJson<DispatchResult>(url, { method: "POST", body: JSON.stringify(payload) });
      if (!data.dispatch?.id || typeof data.cashExpected !== "string" || typeof data.shortageExcessInr !== "string") throw new Error("Could not confirm Head Office dispatch. Verify saved records before continuing.");
      setDispatched(data);
      writeGuard.finish();
      setCounts({ 10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0 }); setCoins(0); setRetainedFloat("");
      setSummaryToken(v => v + 1);
      await shiftStatus.reload();
    } catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected") writeGuard.finish();
      setError(err instanceof Error ? err.message : "Could not confirm Head Office dispatch. Verify saved records before continuing.");
    }
    finally { setBusy(false); }
  }

  return (
    <AppShell activeHref="/cash-drop">
      <PageHeader
        title={uiText("Blind Cash Drop")}
        description={uiText("Expected cash stays hidden until submission. Count the denominations, then end this shift manually to hand over cash, card and UPI totals to the next shift.", "Expected cash submit tak hidden hai. Denominations gino, phir shift manually end karke agli shift ko cash, card aur UPI totals handover karo.")}
      />

      <p className="mb-4 text-sm text-muted-foreground">{uiText("Actual cash reconciliation includes all real sales, including Owner-only orders. It is not the access-filtered sales view.", "Actual cash reconciliation mein sabhi real sales, Owner-only orders bhi included hain. Yeh access-filtered sales view nahi hai.")}</p>
      {actor.role === "SUPER_ADMIN" && <HoCashDispatchPanel />}
      <ShiftSummaryPanel branchId={branchId} allowed={allowed} refreshToken={summaryToken} />
      {!allowed ? <p role="alert">{uiText("Cash Drop permission is required.")}</p> : !branchId ? (
        <p role="alert">{uiText("Select one branch.")}</p>
      ) : (
        <div className="space-y-4">
          {submitted && (
            <Card className="min-w-0">
                <CardHeader><CardTitle>{uiText("Result")}</CardTitle></CardHeader>
                <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
                        <CheckCircle2 className="size-5 text-success" />
                        <div>
                          <div className="text-sm font-medium">{uiText("Shift ended — handed over to")} {submitted.toRun.label}</div>
                          <div className="text-xs text-muted-foreground">{uiText("Shortage/Excess:")} {formatInr(Number(submitted.shortageExcessInr))} ({uiText("Expected cash was")} {formatInr(Number(submitted.cashExpected))})</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("Cash")}</p><p className="break-words font-semibold">{formatInr(Number(submitted.handover.cashAmount))}</p></div>
                        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("Card")}</p><p className="break-words font-semibold">{formatInr(Number(submitted.handover.cardAmount))}</p></div>
                        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("UPI")}</p><p className="break-words font-semibold">{formatInr(Number(submitted.handover.upiAmount))}</p></div>
                        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{uiText("Other")}</p><p className="break-words font-semibold">{formatInr(Number(submitted.handover.otherAmount))}</p></div>
                      </div>
                    </div>
                </CardContent>
              </Card>)}
          {dispatched && (
            <Card className="min-w-0">
                <CardHeader><CardTitle>{uiText("Head Office dispatch result", "Head Office dispatch result")}</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
                      <CheckCircle2 className="size-5 text-success" />
                      <div>
                        <div className="text-sm font-medium">{uiText("Shift ended — cash dispatched to Head Office", "Shift end — cash Head Office ko dispatch ho gaya")}</div>
                        <div className="text-xs text-muted-foreground">{uiText("Dispatched:", "Dispatch kiya:")} {formatInr(Number(dispatched.dispatch.dispatchedAmountInr))} · {uiText("Retained float:", "Retained float:")} {formatInr(Number(dispatched.dispatch.retainedFloatInr))}</div>
                        <div className="text-xs text-muted-foreground">{uiText("Shortage/Excess:", "Shortage/Excess:")} {formatInr(Number(dispatched.shortageExcessInr))} ({uiText("Expected cash was")} {formatInr(Number(dispatched.cashExpected))})</div>
                        <div className="text-xs text-muted-foreground">{uiText("No new shift opened. Start the next one manually (use the retained float above as the opening float).", "Koi nayi shift nahi khuli. Agli shift manually start karo (retained float ko opening float ke roop mein use karo).")}</div>
                      </div>
                    </div>
                </CardContent>
              </Card>)}
          {writeGuard.blocked && !busy && <p role="alert" className="text-destructive">{uiText("A shift change has an unconfirmed outcome, or browser storage is unavailable. Further changes are blocked in this tab. Ask an administrator to verify saved records. Reloading status never retries or unlocks this change.")}</p>}
          {error && <p role="alert" className="text-destructive">{uiText(error)}</p>}
          <Button variant="outline" disabled={busy || shiftStatus.loading} onClick={() => { void shiftStatus.reload(); }}>{uiText("Reload shift status")}</Button>
          <ShiftHandoverGate branchId={branchId} pendingHandover={shiftStatus.pendingHandover} loading={shiftStatus.loading} error={shiftStatus.error} onRetry={shiftStatus.reload} onAccepted={shiftStatus.reload}>
          {!shiftStatus.run ? (
            <Card>
              <CardHeader><CardTitle>{uiText("No active shift")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{uiText("No shift is open for this branch. Start one below, or ask an administrator to configure shift windows first.", "Is branch mein koi shift open nahi hai. Neeche start karo ya admin se pehle shift windows configure karwao.")}</p>
                {canRecordOpeningFloat && <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{uiText("Opening cash float (optional)", "Opening cash float (optional)")}</p>
                  <p className="text-xs text-muted-foreground">{uiText("Only record this for a branch's first-ever shift — records the cash already in the drawer so it is not counted as an unexplained excess at close. Leave blank if this is not the first shift.", "Sirf branch ki pehli shift ke liye bharo — jo cash drawer mein already hai wo record hoga, taaki shift-end par galat excess na dikhe. Agar pehli shift nahi hai to khali chhodo.")}</p>
                  <input type="number" min={0} step="0.01" placeholder={uiText("Amount (TSh)")} value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} disabled={!canWrite} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
                  <input type="text" maxLength={200} placeholder={uiText("Source / reference (e.g. Owner cash box)")} value={openingFloatReference} onChange={(e) => setOpeningFloatReference(e.target.value)} disabled={!canWrite} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
                </div>}
                <Button disabled={!canWrite} onClick={startShift}>{busy ? uiText("Starting…") : uiText("Start Shift")}</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="max-w-2xl space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{uiText("Denomination count — ")}{shiftStatus.run.label} {uiText("closing")}</CardTitle>
                  <CardDescription>{uiText("Note ki ginti bharo. Expected amount submit ke baad hi dikhega.")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {DENOMS.map((d) => (
                    <div key={d} className="flex items-center justify-between gap-3">
                      <label htmlFor={`note-${d}`} className="text-sm font-medium">TSh {d}{uiText(" notes")}</label>
                      <input id={`note-${d}`} type="number" min={0} step={1} value={counts[d]} onChange={(e) => setCounts((c) => ({ ...c, [d]: Math.max(0, Number(e.target.value) || 0) }))} inputMode="decimal" disabled={!canWrite} className="w-28 min-w-0 rounded-md border border-input bg-card px-3 py-1.5 text-right text-base sm:text-sm" />
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 border-t pt-3">
                    <label htmlFor="coins-inr" className="text-sm font-medium">{uiText("Coins (TSh)")}</label>
                    <input id="coins-inr" type="number" min={0} step="0.01" value={coins} onChange={(e) => setCoins(Math.max(0, Number(e.target.value) || 0))} inputMode="decimal" disabled={!canWrite} className="w-28 min-w-0 rounded-md border border-input bg-card px-3 py-1.5 text-right text-base sm:text-sm" />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                    <span className="text-sm font-medium">{uiText("Counted total")}</span>
                    <span className="text-lg font-semibold">{formatInr(countedCashInr)}</span>
                  </div>
                  <Button className="w-full" disabled={!canWrite} onClick={endShift}>{busy ? uiText("Ending Shift…") : uiText(" End Shift & Handover ", " Shift End aur Handover Karo ")}</Button>
                  {canRecordOpeningFloat && <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">{uiText("Or: this is the final shift of the day — dispatch to Head Office", "Ya: aaj ki aakhri shift hai — Head Office ko dispatch karo")}</p>
                    <p className="text-xs text-muted-foreground">{uiText("No new shift opens. Enter how much cash stays at the branch (optional) — the rest is dispatched to HO for acceptance.", "Koi nayi shift nahi khulegi. Branch mein kitna cash rakhna hai likho (optional) — baaki HO ko dispatch hoga, jo wahan accept hoga.")}</p>
                    <input type="number" min={0} step="0.01" placeholder={uiText("Retained float for tomorrow (TSh, optional)")} value={retainedFloat} onChange={(e) => setRetainedFloat(e.target.value)} disabled={!canWrite} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
                    <Button variant="outline" className="w-full" disabled={!canWrite} onClick={dispatchToHo}>{busy ? uiText("Dispatching…") : uiText("Dispatch to Head Office", "Head Office ko dispatch karo")}</Button>
                  </div>}
                </CardContent>
              </Card>
            </div>
          )}
        </ShiftHandoverGate>
        </div>
      )}
    </AppShell>
  );
}
