"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PendingWorkWidget } from "@/components/pending-work-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestJsonError, requestJson } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

type Branch = { id: string; code: string; name: string };
type Review = { id: string; subjectType: "GRN" | "EOD_STOCK"; sourceId: string; sourceRevision: number; branchId: string; exception: boolean; summaryJson: Record<string, unknown>; submittedAt: string; acknowledged: boolean; eventCount: number; latestEvent: null | { actionKey: string; action: string; reason: string; actorName: string; createdAt: string } };

export default function HoStockReviewPage() {
  const t = useUiCopy();
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [branchId, setBranchId] = React.useState("");
  const [rows, setRows] = React.useState<Review[]>([]);
  const [unresolvedOnly, setUnresolvedOnly] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [uncertainId, setUncertainId] = React.useState("");
  const { confirm, ConfirmHost } = useConfirm();
  const { notify, notifyError, ToastHost } = useToast();
  const inFlight = React.useRef(false);
  const intents = React.useRef(new Map<string, { action: "ACKNOWLEDGE" | "ESCALATE"; actionKey: string; reason: string }>());

  React.useEffect(() => {
    let active = true;
    requestJson<{ branches: Branch[] }>("/api/ho-stock-review/branches").then(data => {
      if (!active) return; setBranches(data.branches); setBranchId(current => current || data.branches[0]?.id || "");
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load branches."); });
    return () => { active = false; };
  }, []);

  async function load() {
    if (!branchId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const data = await requestJson<{ reviews: Review[] }>(`/api/ho-stock-review?branchId=${encodeURIComponent(branchId)}&unresolved=${uncertainId ? false : unresolvedOnly}`);
      if (uncertainId) {
        const saved = data.reviews.find(row => row.id === uncertainId);
        if (saved?.latestEvent?.actionKey !== intents.current.get(uncertainId)?.actionKey) {
          setError(t("The exact action is not confirmed by this queue. Replay the saved exact action; do not change intent."));
          return;
        }
        intents.current.delete(uncertainId); setUncertainId("");
        setMessage(t("The exact saved action was confirmed by readback."));
      }
      setRows(data.reviews.filter(row => !unresolvedOnly || !row.acknowledged));
    }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load HO queue."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function act(row: Review, action: "ACKNOWLEDGE" | "ESCALATE", replay = false) {
    if (inFlight.current || (uncertainId && (!replay || uncertainId !== row.id))) return;
    if (action === "ESCALATE" && !replay) {
      const ok = await confirm({
        title: t("Escalate this subject?"),
        description: t("This cannot be undone."),
        confirmLabel: t("Escalate"),
        destructive: true,
      });
      if (!ok) return;
    }
    let intent = intents.current.get(row.id);
    const reason = action === "ESCALATE" ? (reasons[row.id] ?? "").trim() : "";
    if (replay && !intent) return;
    if (!replay && (!intent || intent.action !== action || intent.reason !== reason)) {
      intent = { action, reason, actionKey: crypto.randomUUID() };
      intents.current.set(row.id, intent);
    }
    inFlight.current = true;
    setBusy(true); setError(""); setMessage("");
    let actionConfirmed = false;
    try {
      const result = await requestJson<{ replayed: boolean }>(`/api/ho-stock-review/${encodeURIComponent(row.id)}/action`, { method: "POST", body: JSON.stringify(intent) });
      actionConfirmed = true;
      const successMessage = result.replayed ? t("The saved HO action was confirmed; no duplicate event was created.") : t("HO action saved with actor and time.");
      setMessage(successMessage);
      notify(successMessage);
      intents.current.delete(row.id); setUncertainId("");
      const data = await requestJson<{ reviews: Review[] }>(`/api/ho-stock-review?branchId=${encodeURIComponent(branchId)}&unresolved=${unresolvedOnly}`); setRows(data.reviews);
    } catch (err) {
      if (!actionConfirmed && err instanceof RequestJsonError && err.outcome === "unknown") setUncertainId(row.id);
      const failMessage = err instanceof Error ? err.message : replay ? "Could not confirm replay." : "Could not save HO action.";
      setError(failMessage);
      notifyError(failMessage);
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <AppShell activeHref="/ho-stock-review"><PageHeader title={t("HO stock review")} description={t("Audited cross-branch queue for finalized GRNs/shortages and explicitly submitted EOD report revisions. Up to 300 subjects are loaded; resolve and reload to work through older unresolved subjects.")} />
    <ConfirmHost />
    <ToastHost />
    <PendingWorkWidget />
    <div className="mb-4 flex flex-wrap items-end gap-3"><label className="text-sm">{t("Branch")}<select disabled={busy || Boolean(uncertainId)} className="ml-2 rounded border bg-card p-2" value={branchId} onChange={e => { setBranchId(e.target.value); setRows([]); }}><option value="">{t("Select branch")}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></label><label className="text-sm"><input type="checkbox" disabled={busy || Boolean(uncertainId)} checked={unresolvedOnly} onChange={e => { setUnresolvedOnly(e.target.checked); setRows([]); }} /> {t("Unresolved only")}</label><Button disabled={busy || !branchId} onClick={load}>{busy ? t("Working…") : t("Load queue")}</Button></div>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}{message && <p role="status" className="mb-3 text-sm">{message}</p>}
    <Card><CardContent className="pt-5">{rows.length ? <Table><TableHeader><TableRow><TableHead>{t("Subject")}</TableHead><TableHead>{t("Revision")}</TableHead><TableHead>{t("Exception")}</TableHead><TableHead>{t("Submitted")}</TableHead><TableHead>{t("Resolution")}</TableHead><TableHead>{t("Action")}</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell>{row.subjectType} · {row.sourceId}<pre className="mt-1 max-w-md whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(row.summaryJson)}</pre></TableCell><TableCell>r{row.sourceRevision}</TableCell><TableCell>{row.exception ? t("Yes") : t("No")}</TableCell><TableCell>{new Date(row.submittedAt).toLocaleString("en-TZ", { timeZone: "Africa/Dar_es_Salaam" })}</TableCell><TableCell>{row.latestEvent ? `${row.latestEvent.action} · ${row.latestEvent.actorName}${row.latestEvent.reason ? ` · ${row.latestEvent.reason}` : ""}` : t("Unresolved")}</TableCell><TableCell>{!row.acknowledged && <div className="space-y-2"><input disabled={busy || Boolean(uncertainId)} aria-label={`Escalation reason ${row.id}`} className="w-full rounded border bg-card p-2 text-xs" placeholder={t("Reason required for escalation")} value={reasons[row.id] ?? ""} onChange={e => setReasons(current => ({ ...current, [row.id]: e.target.value }))} /><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || Boolean(uncertainId)} onClick={() => act(row, "ACKNOWLEDGE")}>{t("Acknowledge")}</Button><Button size="sm" variant="destructive" disabled={busy || Boolean(uncertainId) || !(reasons[row.id] ?? "").trim()} onClick={() => act(row, "ESCALATE")}>{t("Escalate")}</Button></div>{uncertainId === row.id && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={load}>{t("Check saved queue")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { const intent = intents.current.get(row.id); if (intent) void act(row, intent.action, true); }}>{t("Replay exact action")}</Button></div>}</div>}</TableCell></TableRow>)}</TableBody></Table> : <p>{t("No loaded review subjects for this branch/filter.")}</p>}</CardContent></Card>
  </AppShell>;
}
