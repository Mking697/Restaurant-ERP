"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestJsonError, requestJson } from "@/lib/current-user";
import { useUiCopy } from "@/lib/ui-copy";

type Suggestion = {
  id: string | null; rawMaterialId: string; name: string; unit: string; usable: string; inventoryPosition: string;
  maxStock: string; suggestedQty: string; internalAvailable: string | null; internalAvailabilityReason: string;
  internalQty: string | null; externalQty: string | null; convertible: boolean;
  internalRequisitionId?: string | null; externalIndentId?: string | null; convertedAt?: string | null;
};

export function ReorderSuggestionsPanel({ branchId }: { branchId: string }) {
  const t = useUiCopy();
  const [rows, setRows] = React.useState<Suggestion[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [uncertainId, setUncertainId] = React.useState("");
  const requestKeys = React.useRef(new Map<string, string>());
  const inFlight = React.useRef(false);

  async function preview() {
    if (inFlight.current || uncertainId || branchId === "all") return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const data = await requestJson<{ suggestions: Suggestion[] }>("/api/inventory/reorder-suggestions/preview", { method: "POST", body: JSON.stringify({ branchId }) });
      setRows(data.suggestions); setUncertainId("");
      setMessage(data.suggestions.length ? t("Fresh supply positions loaded under the inventory lock.") : t("No configured item currently needs replenishment."));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not preview suggestions."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function convert(row: Suggestion, replay = false) {
    if (!row.id || inFlight.current || (uncertainId && (!replay || row.id !== uncertainId))) return;
    let key = requestKeys.current.get(row.id);
    if (!key) { key = crypto.randomUUID(); requestKeys.current.set(row.id, key); }
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const data = await requestJson<{ suggestion: Suggestion; replayed: boolean }>(`/api/inventory/reorder-suggestions/${encodeURIComponent(row.id)}/convert`, { method: "POST", body: JSON.stringify({ requestKey: key }) });
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...data.suggestion } : item));
      setUncertainId(""); requestKeys.current.delete(row.id);
      setMessage(data.replayed ? t("Existing requisition/indent links were confirmed; nothing was duplicated.") : t("Reviewed supply requests were created. They still require the normal human approval steps."));
    } catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "unknown") setUncertainId(row.id);
      setError(err instanceof Error ? err.message : replay ? "Could not confirm replay." : "Could not convert suggestion.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function checkSaved(row: Suggestion) {
    if (!row.id || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const data = await requestJson<{ suggestion: Suggestion & { conversionRequestKey: string | null } }>(`/api/inventory/reorder-suggestions/${encodeURIComponent(row.id)}`);
      if (!data.suggestion.convertedAt || data.suggestion.conversionRequestKey !== requestKeys.current.get(row.id)) {
        setError(t("The exact request is not confirmed. Replay the saved exact request; do not create a new intent."));
        return;
      }
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...data.suggestion } : item));
      requestKeys.current.delete(row.id); setUncertainId("");
      setMessage(t("Saved requisition/indent links confirmed by readback."));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check saved request."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  if (branchId === "all") return null;
  return <Card className="mt-4"><CardHeader><CardTitle>{t("Reorder suggestions")}</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">{t("Only a position below configured minimum triggers a top-up to max. Usable stock, non-duplicated inbound supply and pending request reservations count once. Proven central stock is routed first; the remainder becomes a draft purchase indent. Nothing is approved, ordered or paid automatically.")}</p>
    <Button type="button" disabled={busy || Boolean(uncertainId)} onClick={preview}>{busy ? t("Working…") : t("Preview fresh suggestions")}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    {rows.length > 0 && <Table><TableHeader><TableRow><TableHead>{t("Item")}</TableHead><TableHead>{t("Position / Max")}</TableHead><TableHead>{t("Suggested")}</TableHead><TableHead>{t("Internal first")}</TableHead><TableHead>{t("External draft")}</TableHead><TableHead>{t("Action")}</TableHead></TableRow></TableHeader><TableBody>
      {rows.map(row => <TableRow key={row.id ?? row.rawMaterialId}><TableCell>{row.name}<div className="text-xs text-muted-foreground">{row.unit}</div></TableCell><TableCell>{row.inventoryPosition} / {row.maxStock}</TableCell><TableCell>{row.suggestedQty}</TableCell><TableCell>{row.internalQty ?? "—"}{row.internalRequisitionId && <div className="text-xs">Req {row.internalRequisitionId}</div>}</TableCell><TableCell>{row.externalQty ?? "—"}{row.externalIndentId && <div className="text-xs">Indent {row.externalIndentId}</div>}</TableCell><TableCell>
        {!row.convertible ? <span className="text-xs text-destructive">{row.internalAvailabilityReason}</span> : row.convertedAt ? <span className="text-xs">{t("Converted; approvals pending")}</span> : <Button size="sm" disabled={busy || Boolean(uncertainId)} onClick={() => convert(row)}>{t("Create reviewed requests")}</Button>}
        {uncertainId === row.id && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => checkSaved(row)}>{t("Check saved results")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => convert(row, true)}>{t("Replay exact request")}</Button></div>}
      </TableCell></TableRow>)}
    </TableBody></Table>}
  </CardContent></Card>;
}
