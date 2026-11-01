"use client";
import * as React from "react";
import { useUiCopy } from "@/lib/ui-copy";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import { Button } from "@/components/ui/button";

type CountLine = { id: string; rawMaterialId: string; name: string; unit: string; expectedQty: string | null; physicalQty: string | null };
type CountDetail = { id: string; branchId: string; status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED"; startedById: string; submittedById: string | null; approvedById: string | null; reviewNote: string; lines: CountLine[] };
type CountSummary = { id: string; branchId: string; status: CountDetail["status"]; startedAt: string; submittedAt: string | null; approvedAt: string | null };
type RawMaterial = { id: string; name: string; unit: string };
const inputClass = "w-full rounded border p-2";

export function StockCountPanel({ branchId, refreshToken = 0 }: { branchId: string; refreshToken?: number }) {
  const uiText = useUiCopy();
  const actor = useCurrentUser();
  const allowed = hasCurrentModule(actor, "INVENTORY");
  const reviewer = actor.role === "SUPER_ADMIN" || actor.role === "BRANCH_MANAGER";
  const scope = JSON.stringify([actor.id, actor.ready, actor.authenticated, actor.error, actor.role, actor.branchId, actor.moduleAccess, branchId]);
  const live = React.useRef(scope); live.current = scope;
  const current = () => live.current === scope && allowed;

  const [counts, setCounts] = React.useState<CountSummary[] | null>(null);
  const [materials, setMaterials] = React.useState<RawMaterial[]>([]);
  const [detail, setDetail] = React.useState<CountDetail | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [physical, setPhysical] = React.useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const version = React.useRef(0);
  const listUrl = `/api/inventory/counts${branchId && branchId !== "all" ? `?branchId=${encodeURIComponent(branchId)}` : ""}`;

  async function loadList() {
    const token = ++version.current;
    const response = await requestJson<{ stockCounts: CountSummary[] }>(listUrl);
    if (current() && token === version.current) setCounts(response.stockCounts);
  }
  React.useEffect(() => {
    let active = true; setCounts(null); setDetail(null); setStarting(false); setError("");
    const token = ++version.current;
    if (allowed) {
      void Promise.all([requestJson<{ stockCounts: CountSummary[] }>(listUrl), requestJson<{ rawMaterials: RawMaterial[] }>("/api/raw-materials")])
        .then(([countsResponse, materialsResponse]) => { if (active && current() && token === version.current) { setCounts(countsResponse.stockCounts); setMaterials(materialsResponse.rawMaterials); } })
        .catch((err) => { if (active && current()) setError(err.message); });
    }
    return () => { active = false; version.current++; };
  }, [scope, listUrl, refreshToken, allowed]);

  async function openDetail(id: string) {
    setError("");
    try {
      const response = await requestJson<{ stockCount: CountDetail }>(`/api/inventory/counts/${id}`);
      if (!current()) return;
      setDetail(response.stockCount);
      setPhysical(Object.fromEntries(response.stockCount.lines.map((line) => [line.id, line.physicalQty ?? ""])));
      setReviewNote(""); setRejecting(false);
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Could not load this count"); }
  }

  async function startCount(event: React.FormEvent) {
    event.preventDefault();
    if (!current() || busy || picked.size === 0) return;
    setBusy(true); setError("");
    try {
      await requestJson(`/api/inventory/counts`, { method: "POST", body: JSON.stringify({ branchId: branchId === "all" ? undefined : branchId, rawMaterialIds: [...picked] }) });
      if (!current()) return;
      setStarting(false); setPicked(new Set()); await loadList();
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Could not start count. Reload and check before retrying."); }
    finally { if (current()) setBusy(false); }
  }

  async function submitCount(event: React.FormEvent) {
    event.preventDefault();
    if (!current() || busy || !detail) return;
    setBusy(true); setError("");
    try {
      const lines = detail.lines.map((line) => ({ rawMaterialId: line.rawMaterialId, physicalQty: physical[line.id] ?? "0" }));
      const response = await requestJson<{ stockCount: CountDetail }>(`/api/inventory/counts/${detail.id}/submit`, { method: "POST", body: JSON.stringify({ lines }) });
      if (!current()) return;
      setDetail(response.stockCount); await loadList();
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Submit unconfirmed. Reload and check before retrying."); }
    finally { if (current()) setBusy(false); }
  }

  async function review(action: "approve" | "reject") {
    if (!current() || busy || !detail) return;
    setBusy(true); setError("");
    try {
      const response = await requestJson<{ stockCount: CountDetail }>(`/api/inventory/counts/${detail.id}/${action}`, { method: "POST", body: action === "reject" ? JSON.stringify({ reviewNote }) : undefined });
      if (!current()) return;
      setDetail(response.stockCount); await loadList();
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Review unconfirmed. Reload and check before retrying."); }
    finally { if (current()) setBusy(false); }
  }

  const canApproveThis = !!detail && detail.status === "SUBMITTED" && reviewer && detail.submittedById !== actor.id;

  return <section className="my-6 space-y-3" aria-label={uiText("Physical stock counts")}>
    <div className="flex items-center justify-between">
      <h2 className="font-semibold">{uiText("Physical stock counts")}</h2>
      {allowed && !starting && <Button onClick={() => { setError(""); setDetail(null); setPicked(new Set()); setStarting(true); }}>{uiText("Start Count")}</Button>}
    </div>
    <p className="text-sm">{uiText("A started count is blind: you will not see the system's expected quantity until after you submit your physical count. A different Branch Manager/Owner must review and approve or reject before stock changes.")}</p>
    {error && <p role="alert">{uiText(error)}</p>}

    {starting && <form onSubmit={startCount}><fieldset disabled={busy} className="space-y-3 rounded border p-3">
      <h3>{uiText("Select raw materials to count")}</h3>
      <div className="grid gap-1" role="group" aria-label={uiText("Raw materials to count")}>
        {materials.map((material) => <label key={material.id} className="flex items-center gap-2">
          <input type="checkbox" checked={picked.has(material.id)} onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(material.id); else next.delete(material.id); return next; })} />
          {material.name} ({material.unit})
        </label>)}
      </div>
      <Button type="submit" disabled={busy || picked.size === 0}>{busy ? uiText("Starting…") : uiText("Start Count")}</Button>
      <Button type="button" variant="outline" onClick={() => setStarting(false)}>{uiText("Cancel")}</Button>
    </fieldset></form>}

    {!counts ? <p>{uiText("Loading counts…")}</p> : <div className="space-y-2">
      {counts.map((count) => <article key={count.id} className="flex items-center justify-between rounded border p-3">
        <span>{uiText(count.status)} — {new Date(count.startedAt).toLocaleString()}</span>
        <Button variant="outline" onClick={() => openDetail(count.id)}>{uiText("Open")}</Button>
      </article>)}
      {!counts.length && <p>{uiText("No stock counts in this scope.")}</p>}
    </div>}

    {detail && <div className="space-y-3 rounded border p-3">
      <h3>{uiText("Count")} {detail.id.slice(0, 8)} — {uiText(detail.status)}</h3>
      {detail.status === "DRAFT" ? <form onSubmit={submitCount}><fieldset disabled={busy} className="space-y-2">
        {detail.lines.map((line) => <label className="flex items-center justify-between gap-2" key={line.id}>
          {line.name} ({line.unit})
          <input required type="number" min="0" step="0.001" aria-label={`Physical quantity for ${line.name}`} className="w-32 rounded border p-1" value={physical[line.id] ?? ""} onChange={(e) => setPhysical((prev) => ({ ...prev, [line.id]: e.target.value }))} />
        </label>)}
        <Button type="submit" disabled={busy}>{busy ? uiText("Submitting…") : uiText("Submit Count")}</Button>
      </fieldset></form> : <>
        {detail.lines.map((line) => <p key={line.id}>{line.name}: {uiText("expected")} {line.expectedQty ?? uiText("hidden")}, {uiText("physical")} {line.physicalQty ?? "—"}</p>)}
        {detail.status === "REJECTED" && detail.reviewNote && <p>{uiText("Review note")}: {detail.reviewNote}</p>}
        {canApproveThis && <div className="space-y-2">
          <Button onClick={() => void review("approve")} disabled={busy}>{uiText("Approve")}</Button>
          <label className="block">{uiText("Rejection reason (required to reject)")}<textarea aria-label="Review rejection reason" className={inputClass} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} /></label>
          <Button variant="outline" disabled={busy || reviewNote.trim().length < 3} onClick={() => void review("reject")}>{uiText("Reject")}</Button>
        </div>}
        {detail.status === "SUBMITTED" && !canApproveThis && <p className="text-xs">{uiText("Only a different Branch Manager or Owner can review this count — the submitter cannot approve their own count.")}</p>}
      </>}
      <Button variant="outline" onClick={() => setDetail(null)}>{uiText("Close")}</Button>
    </div>}
  </section>;
}
