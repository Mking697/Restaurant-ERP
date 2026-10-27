"use client";
import * as React from "react";
import { requestJson, useCurrentUser } from "@/lib/current-user";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/utils";

export interface ShiftRun { id: string; branchId: string; shiftDefinitionId: string; label: string; status: string; startedAt: string; endedAt: string | null }
export interface ShiftHandover { id: string; toRunId: string; cashAmount: string; cardAmount: string; upiAmount: string; otherAmount: string; status: string }

// Tab-scoped safety journal: an uncertain write must not become a new action
// against a freshly loaded run. Retained across branch switches and page reloads.
// No automatic replay or unlock: an administrator must reconcile an unknown write.
export function useShiftWriteGuard(scope: string) {
  const key = `shift-write:${scope}`;
  const [ready, setReady] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const held = React.useRef(false);
  React.useEffect(() => {
    try { held.current = sessionStorage.getItem(key) !== null; }
    catch { held.current = true; }
    setBlocked(held.current); setReady(true);
  }, [key]);
  function begin(url: string, payload: unknown) {
    if (!ready || held.current) return false;
    try {
      if (sessionStorage.getItem(key) !== null) { held.current = true; setBlocked(true); return false; }
      const entry = JSON.stringify({ url, payload });
      sessionStorage.setItem(key, entry);
      if (sessionStorage.getItem(key) !== entry) throw new Error("Cannot retain write identity");
      held.current = true; setBlocked(true);
      return true;
    } catch { held.current = true; setBlocked(true); return false; }
  }
  function finish() {
    try { sessionStorage.removeItem(key); held.current = false; setBlocked(false); }
    catch { held.current = true; setBlocked(true); }
  }
  return { ready, blocked, begin, finish };
}

export function useShiftStatus(branchId: string, enabled: boolean) {
  const actor = useCurrentUser();
  const scope = JSON.stringify([actor.id, actor.role, actor.branchId, actor.authenticated, actor.ready, [...actor.moduleAccess].sort(), branchId, enabled]);
  const liveScope = React.useRef(scope);
  liveScope.current = scope;
  const generation = React.useRef(0);
  const mounted = React.useRef(true);
  const [state, setState] = React.useState<{ scope: string; run: ShiftRun | null; pendingHandover: ShiftHandover | null; loading: boolean; error: string }>({ scope: "", run: null, pendingHandover: null, loading: true, error: "" });
  const reload = React.useCallback(async () => {
    if (!mounted.current || liveScope.current !== scope) return;
    const ticket = ++generation.current;
    setState({ scope, run: null, pendingHandover: null, loading: enabled && !!branchId, error: "" });
    if (!enabled || !branchId) return;
    try {
      const data = await requestJson<{ run: ShiftRun | null; pendingHandover: ShiftHandover | null }>(`/api/shift-runs?branchId=${encodeURIComponent(branchId)}`);
      if (liveScope.current === scope && generation.current === ticket) setState({ scope, ...data, loading: false, error: "" });
    } catch (err) {
      if (liveScope.current === scope && generation.current === ticket) setState({ scope, run: null, pendingHandover: null, loading: false, error: err instanceof Error ? err.message : "Could not load shift status." });
    }
  }, [scope, branchId, enabled]);
  React.useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; generation.current++; }; }, [reload]);
  // Hide old data synchronously on scope change, not one effect/render later.
  const current = state.scope === scope ? state : { run: null, pendingHandover: null, loading: enabled && !!branchId, error: "" };
  return { ...current, reload };
}

// Wrap any operational page's content with this — shows an Accept Handover
// screen when the current shift run has a handover still PENDING, and
// otherwise renders children untouched. No-op (renders children) when the
// branch hasn't opted into shift management at all (no run, no handover).
type GateProps = { branchId: string; pendingHandover: ShiftHandover | null; onAccepted: () => void | Promise<void>; children: React.ReactNode; loading?: boolean; error?: string; onRetry?: () => void | Promise<void> };
export function ShiftHandoverGate(props: GateProps) {
  const actor = useCurrentUser();
  return <HandoverGateContent key={`${actor.id}:${props.branchId}:${props.pendingHandover?.id ?? ""}`} {...props} />;
}
function HandoverGateContent({ branchId, pendingHandover, onAccepted, children, loading = false, error: loadError = "", onRetry }: GateProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [unconfirmed, setUnconfirmed] = React.useState(false);
  const inFlight = React.useRef(false);
  if (loading) return <p role="status">{t("Checking shift status…", "Shift status check ho raha hai…")}</p>;
  if (loadError) return <div role="alert" className="space-y-2"><p className="text-destructive">{t(loadError)}</p>{onRetry && <Button variant="outline" onClick={() => { void onRetry(); }}>{t("Reload shift status", "Shift status reload karo")}</Button>}</div>;
  if (!pendingHandover) return <>{children}</>;

  async function accept() {
    if (inFlight.current || unconfirmed || !pendingHandover) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      await requestJson(`/api/shift-handovers/${encodeURIComponent(pendingHandover.id)}/accept`, { method: "POST", body: JSON.stringify({ branchId }) });
      setUnconfirmed(true);
      // Keep write acknowledgment separate from a failed status reload.
      try { await onAccepted(); } catch { setError("Handover accepted. Reload shift status to continue."); }
    } catch (err) {
      setUnconfirmed(true);
      setError(err instanceof Error ? err.message : "Could not confirm acceptance. Reload shift status before continuing.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader>
        <CardTitle>{t("Accept Shift Handover", "Shift Handover Accept Karo")}</CardTitle>
        <CardDescription>{t("Actual cash custody and the previous shift's electronic receipts are handed over below. These reconciliation amounts include every real sale, regardless of operational order visibility. Accept to continue.", "Neeche actual cash custody aur pichhli shift ki electronic receipts ka handover hai. Reconciliation mein har real sale included hai, operational order visibility se farq nahi padta. Aage badhne ke liye accept karo.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{t("Cash", "Cash")}</p><p className="break-words text-lg font-semibold">{formatInr(Number(pendingHandover.cashAmount))}</p></div>
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{t("Card", "Card")}</p><p className="break-words text-lg font-semibold">{formatInr(Number(pendingHandover.cardAmount))}</p></div>
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{t("UPI", "UPI")}</p><p className="break-words text-lg font-semibold">{formatInr(Number(pendingHandover.upiAmount))}</p></div>
          <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{t("Other", "Other")}</p><p className="break-words text-lg font-semibold">{formatInr(Number(pendingHandover.otherAmount))}</p></div>
        </div>
        {error && <p role="alert" className="text-destructive">{t(error)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || unconfirmed} onClick={accept}>{busy ? t("Accepting…", "Accept ho raha hai…") : t("Accept Handover", "Handover Accept Karo")}</Button>
          {unconfirmed && <Button variant="outline" disabled={busy} onClick={() => { void (onRetry ?? onAccepted)(); }}>{t("Reload shift status", "Shift status reload karo")}</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
