"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { useTranslation } from "@/lib/i18n";
import { formatInr } from "@/lib/utils";

type Mode = "purchase" | "accounts";
type ReturnRow = {
  id: string; grnId: string; grnLineId: string; branchId: string; branch: string; poNumber: string;
  vendorId: string; vendor: string; itemName: string; unit: string; qtyReturned: string;
  refundAmountInr: string; reasonNote: string; submittedToAccountsAt: string | null; createdAt: string;
  status: "REFUND_OR_CREDIT_EXPECTED" | "RECONCILIATION_REQUIRED"; moneyReceived: boolean;
  settledAmountInr: string | null; settledAt: string | null; settledById: string | null; settledNote: string;
};

type Grn = {
  id: string; branchId: string; poNumber: string; qualityResult: string; qualityRecorded: boolean;
  qualityRecordedAt: string | null; reconciliationRequired: boolean; qualityNote: string | null;
  lines: { id: string; name: string; itemDescription: string; unit: string; qtyFailed: string; rateOrdered: string }[];
};
function decimal(value: string, scale: number): bigint | null {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d+)?$/.test(value) || (value.split(".")[1]?.length ?? 0) > scale) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * (BigInt(10) ** BigInt(scale)) + BigInt(fraction.padEnd(scale, "0"));
}

/** Authorization/scope changes hide data synchronously, before effect cleanup. */
export function VendorReturnsPanel({ mode }: { mode: Mode }) {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const branchId = actor.role === "SUPER_ADMIN" ? selected : actor.branchId ?? "__no_branch__";
  const scope = JSON.stringify([mode, actor.id, actor.ready, actor.authenticated, actor.error, actor.role, actor.branchId, [...actor.moduleAccess].sort(), branchId]);
  const live = React.useRef(scope); live.current = scope;
  const allowed = !actor.error && hasCurrentModule(actor, mode === "purchase" ? "PURCHASE_ORDER" : "VENDOR_REFUNDS") && !!branchId && branchId !== "__no_branch__" && (actor.role === "SUPER_ADMIN" || branchId !== "all");
  const canSettle = mode === "accounts" && !actor.error && hasCurrentModule(actor, "ACCOUNTS_EXPENSES");
  return <VendorReturnsWorkspace key={scope} mode={mode} branchId={branchId} allowed={allowed} canSettle={canSettle} isCurrent={() => live.current === scope} />;
}

function VendorReturnsWorkspace({ mode, branchId, allowed, canSettle, isCurrent }: { mode: Mode; branchId: string; allowed: boolean; canSettle: boolean; isCurrent: () => boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = React.useState<ReturnRow[]>([]);
  const [grns, setGrns] = React.useState<Grn[]>([]);
  const [lookupId, setLookupId] = React.useState("");
  const [historical, setHistorical] = React.useState<Grn | null>(null);
  const [lookupError, setLookupError] = React.useState("");
  const [selected, setSelected] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [uncertain, setUncertain] = React.useState(false);
  const [settleAmounts, setSettleAmounts] = React.useState<Record<string, string>>({});
  const [settleNotes, setSettleNotes] = React.useState<Record<string, string>>({});
  const [settleBusy, setSettleBusy] = React.useState<string | null>(null);
  const [settleError, setSettleError] = React.useState<Record<string, string>>({});
  const intent = React.useRef<Grn | null>(null);
  const busyRef = React.useRef(false);
  const version = React.useRef(0);
  const alive = React.useRef(true);
  const current = () => alive.current && isCurrent();
  const inBranch = (id: string) => branchId === "all" || id === branchId;
  const params = new URLSearchParams(); if (branchId !== "all") params.set("branchId", branchId);
  const endpoint = mode === "purchase" ? "/api/purchase/material-returns" : "/api/accounts/vendor-refunds";
  const url = endpoint + (params.size ? `?${params}` : "");
  const trusted = (g: Grn) => !!g && typeof g.id === "string" && !!g.id && typeof g.poNumber === "string" && inBranch(g.branchId) && g.qualityRecorded === true && typeof g.qualityRecordedAt === "string" && !!g.qualityRecordedAt && g.reconciliationRequired === false && ["FAIL", "PARTIAL"].includes(g.qualityResult) && (g.qualityNote === null || typeof g.qualityNote === "string") && Array.isArray(g.lines) && g.lines.length > 0 && g.lines.length <= 50 && g.lines.every(l => !!l && typeof l.id === "string" && !!l.id && typeof l.unit === "string" && typeof l.name === "string" && typeof l.itemDescription === "string" && decimal(l.qtyFailed, 3) !== null && decimal(l.rateOrdered, 2) !== null) && new Set(g.lines.map(l => l.id)).size === g.lines.length && g.lines.some(l => decimal(l.qtyFailed, 3)! > BigInt(0));
  const candidates = (historical ? [historical, ...grns.filter(g => g.id !== historical.id)] : grns).filter(trusted);
  async function lookupGrn() {
    if (!allowed || mode !== "purchase" || branchId === "all" || !current() || busyRef.current || loading || intent.current) return;
    setSelected(""); setHistorical(null); setLookupError("");
    const id = lookupId;
    if (!id.length || id.length > 200 || id.trim() !== id || /[\u0000-\u001f\u007f]/.test(id)) { setLookupError(t("Enter the full GRN ID.", "Poora GRN ID bharo.")); return; }
    const token = ++version.current;
    busyRef.current = true; setBusy(true);
    try {
      const data = await requestJson<{ grn: Grn }>(`/api/purchase/grns/${encodeURIComponent(id)}?${new URLSearchParams({ branchId })}`);
      if (!current() || token !== version.current) return;
      if (!data?.grn || data.grn.id !== id || data.grn.branchId !== branchId || !trusted(data.grn)) throw new Error("Untrusted GRN");
      setHistorical(data.grn); setSelected(data.grn.id);
    } catch { if (current() && token === version.current) setLookupError(t("No trusted finalized FAIL/PARTIAL GRN found. Check the full ID and branch, then try again.", "Trusted finalized FAIL/PARTIAL GRN nahi mili. Poora ID aur branch check karke dobara try karo.")); }
    finally { if (current() && token === version.current) { busyRef.current = false; setBusy(false); } }
  }
  async function readSnapshot() {
    const [claims, quality] = await Promise.all([
      requestJson<{ returns: ReturnRow[] }>(url),
      mode === "purchase" ? requestJson<{ grns: Grn[] }>(`/api/purchase/grns${params.size ? `?${params}` : ""}`) : Promise.resolve({ grns: [] as Grn[] }),
    ]);
    if (!Array.isArray(claims.returns) || claims.returns.some(row => !inBranch(row.branchId)) || !Array.isArray(quality.grns)) throw new Error("Invalid claim scope");
    return { rows: claims.returns, grns: quality.grns };
  }
  async function reload() {
    if (!allowed || !current() || busyRef.current) return;
    const token = ++version.current;
    busyRef.current = true; setBusy(true); setLoading(true); setRows([]); setGrns([]); setError(""); setMessage("");
    try { const data = await readSnapshot(); if (current() && token === version.current) { setRows(data.rows); setGrns(data.grns); } }
    catch { if (current() && token === version.current) setError(t("Could not load claims. Reload to try again.", "Claims load nahi hue. Dobara reload karo.")); }
    finally { if (current() && token === version.current) { setLoading(false); busyRef.current = false; setBusy(false); } }
  }
  React.useEffect(() => {
    alive.current = true; void reload();
    return () => { alive.current = false; version.current++; busyRef.current = false; };
    // The keyed workspace captures an immutable authorization scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function settle(row: ReturnRow) {
    if (!canSettle || !current() || settleBusy) return;
    const amount = (settleAmounts[row.id] ?? "").trim();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      setSettleError(prev => ({ ...prev, [row.id]: t("Enter a valid settled amount.", "Valid settled amount bharo.") }));
      return;
    }
    setSettleBusy(row.id); setSettleError(prev => ({ ...prev, [row.id]: "" }));
    try {
      await requestJson(`/api/purchase/material-returns/${encodeURIComponent(row.id)}/settle`, {
        method: "POST",
        body: JSON.stringify({ settledAmountInr: amount, settledNote: (settleNotes[row.id] ?? "").trim() }),
      });
      if (!current()) return;
      const snapshot = await readSnapshot();
      if (!current()) return;
      setRows(snapshot.rows); setGrns(snapshot.grns);
      setMessage(t("Marked settled and records reloaded.", "Settled mark kiya aur records reload hue."));
    } catch (err) {
      if (!current()) return;
      setSettleError(prev => ({ ...prev, [row.id]: t("Could not mark settled.", "Settled mark nahi hua.") + (err instanceof Error ? ` ${err.message}` : "") }));
    } finally { if (current()) setSettleBusy(null); }
  }
  function matches(rows: ReturnRow[], source: Grn) {
    const failed = source.lines.filter(l => decimal(l.qtyFailed, 3)! > BigInt(0));
    return Array.isArray(rows) && rows.length === failed.length && new Set(rows.map(r => r.id)).size === failed.length && rows.every(row => {
      const line = failed.find(l => l.id === row.grnLineId);
      if (!line) return false;
      const expected = (decimal(line.qtyFailed, 3)! * decimal(line.rateOrdered, 2)! + BigInt(500)) / BigInt(1000);
      return row.id === `grn-return:${line.id}` && row.grnId === source.id && row.branchId === source.branchId && row.poNumber === source.poNumber && row.unit === line.unit && row.status === "REFUND_OR_CREDIT_EXPECTED" && row.moneyReceived === false && !!row.vendorId && !!row.submittedToAccountsAt && !!row.createdAt && row.reasonNote === (source.qualityNote ?? "") && decimal(row.qtyReturned, 3) === decimal(line.qtyFailed, 3) && decimal(row.refundAmountInr, 2) === expected;
    });
  }
  async function register(recovery: "new" | "replay" | "read" = "new") {
    if (!allowed || mode !== "purchase" || !current() || busyRef.current || loading || (recovery === "new" ? !!intent.current || !!error : !intent.current)) return;
    const source = recovery === "new" ? candidates.find(g => g.id === selected) : intent.current;
    if (!source || !trusted(source)) return;
    intent.current = source;
    const token = ++version.current;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    let confirmedResponse = false;
    try {
      const filter = new URLSearchParams(); filter.set("branchId", source.branchId); filter.set("grnId", source.id);
      const result = recovery === "read" ? await requestJson<{ returns: ReturnRow[] }>(`${endpoint}?${filter}`) : await requestJson<{ returns: ReturnRow[] }>(`/api/purchase/grns/${encodeURIComponent(source.id)}/returns`, { method: "POST", body: "{}" });
      if (!current() || token !== version.current) return;
      if (!matches(result.returns, source)) throw new Error(t("Saved claims do not confirm every original failed line.", "Saved claims har original failed line ko confirm nahi karte."));
      confirmedResponse = true;
      // The latest-200 list may omit a historical replay. Confirm by exact GRN,
      // not by absence from that bounded list, before publishing write success.
      const saved = recovery === "read" ? result : await requestJson<{ returns: ReturnRow[] }>(`${endpoint}?${filter}`);
      if (!current() || token !== version.current) return;
      if (!matches(saved.returns, source)) throw new Error(t("Readback did not confirm the original claim batch.", "Readback ne original claim batch confirm nahi kiya."));
      const snapshot = await readSnapshot();
      if (!current() || token !== version.current) return;
      setRows(snapshot.rows); setGrns(snapshot.grns); setSelected(""); intent.current = null; setUncertain(false);
      setMessage(t("Claim confirmed and records reloaded. Expected refund/credit only; no money received.", "Claim confirm hua aur records reload hue. Sirf expected refund/credit hai; paisa receive nahi hua."));
    } catch (err) {
      if (!current() || token !== version.current) return;
      if (recovery === "new" && !confirmedResponse && err instanceof RequestJsonError && err.outcome === "rejected") { intent.current = null; setUncertain(false); }
      else setUncertain(true);
      setRows([]);
      setError(t("Claim not confirmed/reloaded. Check saved claims or explicitly replay the exact request.", "Claim confirm/reload nahi hua. Saved claims check karo ya wahi exact request explicitly replay karo.") + (err instanceof Error ? ` ${err.message}` : ""));
    } finally { if (current() && token === version.current) { busyRef.current = false; setBusy(false); } }
  }
  if (!allowed) return <p role="alert">{t("Claim access requires a verified session, permission and branch.", "Claims ke liye verified session, permission aur branch chahiye.")}</p>;
  return <section className="min-w-0 space-y-4 rounded-lg border p-4">
    <h2 className="font-semibold">{mode === "purchase" ? t("Vendor returns", "Vendor returns") : t("Vendor refunds", "Vendor refunds")}</h2>
    <p className="text-sm">{t("Expected refund/credit claims only, not actual money received or proof of physical dispatch/vendor acceptance. No cash, journal or settlement is posted here.", "Sirf expected refund/credit claims hain; actual paisa milna, physical dispatch ya vendor acceptance ka proof nahi. Yahan cash, journal ya settlement post nahi hota.")}</p>
    <p className="text-xs text-muted-foreground">{t("Latest 200 claim rows only; this is not an all-history balance. Amounts use saved PO rates, not invoice/tax adjustments.", "Sirf latest 200 claim rows; yeh all-history balance nahi hai. Amount saved PO rates par hai, invoice/tax adjustment nahi.")}</p>
    <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>{t("Reload claims", "Claims reload karo")}</Button>
    {mode === "purchase" && <div className="min-w-0 space-y-3">
      <p className="text-sm">{t("New FAIL/PARTIAL quality decisions queue claims automatically. Register a trusted historical failure once; no quantities, rates or money can be entered here.", "Naye FAIL/PARTIAL quality decisions claims apne aap queue karte hain. Trusted purani failure ek baar register karo; yahan quantity, rate ya paisa enter nahi hota.")}</p>
      <p className="text-xs text-muted-foreground">{t("Latest 200 GRNs in the selector. For older history, select a branch and look up the full GRN ID. Lookup is read-only.", "Selector mein latest 200 GRNs. Purani history ke liye branch chuno aur poora GRN ID lookup karo. Lookup sirf read karta hai.")}</p>
      <label className="block min-w-0 text-sm">{t("Full GRN ID", "Poora GRN ID")}<input aria-label="Full GRN ID" maxLength={200} className="mt-1 w-full min-w-0 rounded border bg-card p-2" value={lookupId} disabled={busy || loading || uncertain || branchId === "all"} onChange={e => { if (current() && !busyRef.current && !intent.current) { setLookupId(e.target.value); setSelected(""); setHistorical(null); setLookupError(""); } }} /></label>
      <Button type="button" variant="outline" disabled={busy || loading || uncertain || branchId === "all"} onClick={lookupGrn}>{t("Look up finalized GRN", "Finalized GRN lookup karo")}</Button>
      {lookupError && <p role="alert">{lookupError}</p>}
      <label className="block min-w-0 text-sm">{t("Finalized failed GRN", "Finalized failed GRN")}
        <select className="mt-1 w-full min-w-0 max-w-full rounded border bg-card p-2" value={selected} disabled={busy || loading || uncertain || !!error} onChange={e => { if (!busyRef.current && !intent.current && !loading && !error && current()) setSelected(e.target.value); }}>
          <option value="">{t("Select a trusted FAIL/PARTIAL GRN", "Trusted FAIL/PARTIAL GRN chuno")}</option>
          {candidates.map(g => <option key={g.id} value={g.id}>{g.poNumber} · {g.id} · {g.qualityResult}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || loading || uncertain || !!error || !candidates.some(g => g.id === selected)} onClick={() => register()}>{t("Register failed-quantity claim", "Failed-quantity claim register karo")}</Button>
      {uncertain && <><Button type="button" variant="outline" disabled={busy} onClick={() => register("read")}>{t("Check saved claims", "Saved claims check karo")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => register("replay")}>{t("Replay exact request", "Exact request replay karo")}</Button></>}</div>
      {uncertain && <p role="status">{t("Outcome unconfirmed. Original GRN retained; no automatic write retry. Keep this panel open until resolved.", "Outcome unconfirmed hai. Original GRN retained hai; write apne aap retry nahi hoti. Resolve hone tak yeh panel khula rakho.")} {intent.current?.id}</p>}
    </div>}
    {message && <p role="status">{message}</p>}
    {loading && <p role="status">{t("Loading claims…", "Claims load ho rahe hain…")}</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && <div className="grid min-w-0 gap-3 sm:grid-cols-2">{rows.map(row => <article key={row.id} className="min-w-0 space-y-1 break-words rounded border p-3 text-sm">
      <p className="font-medium">{row.poNumber} · {row.vendor}</p><p>{row.branch} · {row.grnId}</p><p>{row.itemName}</p>
      <p>{t("Claimed failed quantity", "Claim ki gayi failed quantity")}: {row.qtyReturned} {row.unit}</p>
      {row.status === "REFUND_OR_CREDIT_EXPECTED" ? <p>{t("Expected refund/credit", "Expected refund/credit")}: {formatInr(Number(row.refundAmountInr))}</p> : <p role="alert">{t("Reconciliation required — expected amount is unverified.", "Reconciliation chahiye — expected amount verify nahi hai.")}</p>}
      <p>{row.reasonNote}</p><p>{t("Queued for Accounts (not paid)", "Accounts ke liye queued (paid nahi)")}: {row.submittedToAccountsAt ?? "—"}</p>
      {row.moneyReceived ? (
        <p role="status">{t("Settled", "Settled")}: {formatInr(Number(row.settledAmountInr))} ({row.settledAt}){row.settledNote ? ` — ${row.settledNote}` : ""}</p>
      ) : canSettle && row.status === "REFUND_OR_CREDIT_EXPECTED" ? (
        <div className="space-y-1 rounded border border-dashed p-2">
          <label className="block text-xs">{t("Settled amount", "Settled amount")} (TSh)<input aria-label={`Settled amount for ${row.id}`} className="mt-1 w-full rounded border bg-card p-1" inputMode="decimal" value={settleAmounts[row.id] ?? ""} disabled={settleBusy === row.id} onChange={e => setSettleAmounts(prev => ({ ...prev, [row.id]: e.target.value }))} /></label>
          <label className="block text-xs">{t("Note (optional)", "Note (optional)")}<input aria-label={`Settlement note for ${row.id}`} className="mt-1 w-full rounded border bg-card p-1" maxLength={500} value={settleNotes[row.id] ?? ""} disabled={settleBusy === row.id} onChange={e => setSettleNotes(prev => ({ ...prev, [row.id]: e.target.value }))} /></label>
          <Button type="button" variant="outline" disabled={settleBusy === row.id} onClick={() => void settle(row)}>{t("Mark as Settled", "Settled mark karo")}</Button>
          {settleError[row.id] && <p role="alert">{settleError[row.id]}</p>}
        </div>
      ) : null}
    </article>)}</div>}
    {!loading && !error && !rows.length && <p>{t("No claims in this scope.", "Is scope mein koi claim nahi.")}</p>}
  </section>;
}
