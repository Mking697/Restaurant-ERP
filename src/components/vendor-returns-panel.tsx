"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { useTranslation } from "@/lib/i18n";

type Mode = "purchase" | "accounts";
type ReturnRow = {
  id: string; grnId: string; grnLineId: string; branchId: string; branch: string; poNumber: string;
  vendorId: string; vendor: string; itemName: string; unit: string; qtyReturned: string;
  refundAmountInr: string; reasonNote: string; submittedToAccountsAt: string | null; createdAt: string;
  status: "REFUND_OR_CREDIT_EXPECTED" | "RECONCILIATION_REQUIRED"; moneyReceived: null;
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
  return <VendorReturnsWorkspace key={scope} mode={mode} branchId={branchId} allowed={allowed} isCurrent={() => live.current === scope} />;
}

function VendorReturnsWorkspace({ mode, branchId, allowed, isCurrent }: { mode: Mode; branchId: string; allowed: boolean; isCurrent: () => boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = React.useState<ReturnRow[]>([]);
  const [grns, setGrns] = React.useState<Grn[]>([]);
  const [selected, setSelected] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [uncertain, setUncertain] = React.useState(false);
  const intent = React.useRef<Grn | null>(null);
  const busyRef = React.useRef(false);
  const version = React.useRef(0);
  const alive = React.useRef(true);
  const current = () => alive.current && isCurrent();
  const inBranch = (id: string) => branchId === "all" || id === branchId;
  const params = new URLSearchParams(); if (branchId !== "all") params.set("branchId", branchId);
  const endpoint = mode === "purchase" ? "/api/purchase/material-returns" : "/api/accounts/vendor-refunds";
  const url = endpoint + (params.size ? `?${params}` : "");
  const trusted = (g: Grn) => inBranch(g.branchId) && g.qualityRecorded === true && !!g.qualityRecordedAt && !g.reconciliationRequired && ["FAIL", "PARTIAL"].includes(g.qualityResult) && Array.isArray(g.lines) && g.lines.length > 0 && new Set(g.lines.map(l => l.id)).size === g.lines.length && g.lines.every(l => decimal(l.qtyFailed, 3) !== null && decimal(l.rateOrdered, 2) !== null) && g.lines.some(l => decimal(l.qtyFailed, 3)! > BigInt(0));
  const candidates = grns.filter(trusted);
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
  function matches(rows: ReturnRow[], source: Grn) {
    const failed = source.lines.filter(l => decimal(l.qtyFailed, 3)! > BigInt(0));
    return Array.isArray(rows) && rows.length === failed.length && new Set(rows.map(r => r.id)).size === failed.length && rows.every(row => {
      const line = failed.find(l => l.id === row.grnLineId);
      if (!line) return false;
      const expected = (decimal(line.qtyFailed, 3)! * decimal(line.rateOrdered, 2)! + BigInt(500)) / BigInt(1000);
      return row.id === `grn-return:${line.id}` && row.grnId === source.id && row.branchId === source.branchId && row.poNumber === source.poNumber && row.unit === line.unit && row.status === "REFUND_OR_CREDIT_EXPECTED" && row.moneyReceived === null && !!row.vendorId && !!row.submittedToAccountsAt && !!row.createdAt && row.reasonNote === (source.qualityNote ?? "") && decimal(row.qtyReturned, 3) === decimal(line.qtyFailed, 3) && decimal(row.refundAmountInr, 2) === expected;
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
      {row.status === "REFUND_OR_CREDIT_EXPECTED" ? <p>{t("Expected refund/credit", "Expected refund/credit")}: ₹{row.refundAmountInr}</p> : <p role="alert">{t("Reconciliation required — expected amount is unverified.", "Reconciliation chahiye — expected amount verify nahi hai.")}</p>}
      <p>{row.reasonNote}</p><p>{t("Queued for Accounts (not paid)", "Accounts ke liye queued (paid nahi)")}: {row.submittedToAccountsAt ?? "—"}</p>
    </article>)}</div>}
    {!loading && !error && !rows.length && <p>{t("No claims in this scope.", "Is scope mein koi claim nahi.")}</p>}
  </section>;
}
