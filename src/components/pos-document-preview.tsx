"use client";
import * as React from "react";
import { hasCurrentModule, requestJson, useCurrentUser } from "@/lib/current-user";
import type { Document } from "@/lib/pos-documents";

const disclaimer = "INTERNAL SALES DOCUMENT — NOT A FISCAL RECEIPT";
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
function verified(d: Document, id: string) {
  return !!d && d.id === id && !!d.branchId && ["PROFORMA", "FINAL"].includes(d.kind) && !!d.number && !!d.issuedAt && ["DRAFT", "ORDER"].includes(d.sourceType) && !!d.sourceId && Number.isInteger(d.sourceRevision) && d.sourceRevision > 0 && d.seller && typeof d.seller.name === "string" && typeof d.seller.branchName === "string" && d.seller.tin === null && d.seller.vrn === null && Array.isArray(d.lines) && d.lines.length > 0 && d.lines.every(l => typeof l.name === "string" && !!l.name && typeof l.productCode === "string" && Number.isInteger(l.qty) && l.qty > 0 && money(l.price) && money(l.vatRatePercent) && money(l.lineTotal)) && money(d.subtotal) && money(d.taxAmount) && money(d.totalAmount) && Array.isArray(d.vat?.rates) && d.vat.rates.every(r => money(r.ratePercent) && money(r.taxableAmount) && money(r.vatAmount)) && money(d.vat.grandTaxable) && money(d.vat.grandTotalTax) && money(d.vat.grandTotal) && d.currency?.baseCode === "TZS" && money(d.currency.fxRateToInr) && money(d.currency.tenderCurrencyAmount) && typeof d.disclaimer === "string";
}
function documentHtml(d: Document) {
  const e = escapeHtml;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(d.number)}</title><style>body{font:14px sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #bbb;text-align:left}h1{font-size:20px}</style></head><body><h1>${disclaimer}</h1><h2>${e(d.kind)} — ${e(d.number)}</h2><p>${e(d.issuedAt)} · ${e(d.seller.name)} · ${e(d.seller.branchName)} (${e(d.seller.branchCode)}) · ${e(d.seller.address)}</p><p>TIN / VRN: unverified, not configured (null). Internal-only; no TRA/EFD integration.</p><p>Customer: ${e(d.customer?.name || "not recorded")} ${e(d.customer?.phone || "")}</p><p>${e(d.channel)} · Table ${e(d.tableNo || "—")} · Order ${e(d.orderNumber || d.orderId || "not linked")} · Receipt ${e(d.receiptNumber || "none")} · Applicable proforma ${e(d.proformaId || "none")}</p><p>Source ${e(d.sourceType)} ${e(d.sourceId)} / revision ${e(d.sourceRevision)}</p><table><thead><tr><th>Item / code</th><th>Qty</th><th>Unit price TZS</th><th>VAT %</th><th>Line total TZS</th></tr></thead><tbody>${d.lines.map(l => `<tr><td>${e(l.name)} / ${e(l.productCode || "(known blank)")}</td><td>${e(l.qty)}</td><td>${e(l.price)}</td><td>${e(l.vatRatePercent)}</td><td>${e(l.lineTotal)}</td></tr>`).join("")}</tbody></table><p>Subtotal TZS ${e(d.subtotal)} · VAT TZS ${e(d.taxAmount)} · Total TZS ${e(d.totalAmount)}</p><h3>VAT breakdown</h3><ul>${d.vat.rates.map(r => `<li>${e(r.ratePercent)}%: taxable TZS ${e(r.taxableAmount)}, VAT TZS ${e(r.vatAmount)}</li>`).join("")}</ul><p>Grand taxable TZS ${e(d.vat.grandTaxable)} · Grand tax TZS ${e(d.vat.grandTotalTax)} · Grand total TZS ${e(d.vat.grandTotal)}</p><p>Tender ${e(d.currency.tenderCurrencyCode === "INR" ? "TZS" : d.currency.tenderCurrencyCode)} ${e(d.currency.tenderCurrencyAmount)} · FX to TZS ${e(d.currency.fxRateToInr)}</p><p>${e(d.disclaimer)}</p><p>Immutable saved financial snapshot. Reprint adds no payment, stock or revenue. ${disclaimer}</p></body></html>`;
}
export function PosDocumentPreview({ documentId, onClose }: { documentId: string | null; onClose: () => void }) {
  const actor = useCurrentUser();
  const identity = JSON.stringify([actor.id, actor.role, actor.branchId, actor.ready, actor.authenticated, actor.moduleAccess]);
  if (!documentId) return null;
  return <DocumentPreview key={JSON.stringify([identity, documentId])} documentId={documentId} onClose={onClose} />;
}
function DocumentPreview({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const actor = useCurrentUser();
  const allowed = hasCurrentModule(actor, "POS_CASHIER");
  const [saved, setSaved] = React.useState<Document | null>(null), [loading, setLoading] = React.useState(true), [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0), [printDoc, setPrintDoc] = React.useState("");
  const [printing, setPrinting] = React.useState(false), [sequence, setSequence] = React.useState(0);
  const mounted = React.useRef(true), version = React.useRef(0), printingNow = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; version.current++; }; }, []);
  React.useEffect(() => {
    const generation = ++version.current;
    setSaved(null); setPrintDoc(""); setError("");
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    requestJson<{ document: Document }>(`/api/pos/documents/${encodeURIComponent(documentId)}`).then(response => {
      if (!mounted.current || generation !== version.current) return;
      if (!verified(response.document, documentId)) throw new Error("Saved document snapshot unavailable or unverified. Legacy history is not fabricated.");
      setSaved(response.document);
    }).catch(err => { if (mounted.current && generation === version.current) setError(err instanceof Error ? err.message : "Could not load document."); }).finally(() => { if (mounted.current && generation === version.current) setLoading(false); });
    return () => { version.current++; };
  }, [allowed, documentId, attempt]);
  async function print() {
    if (!mounted.current || !allowed || !saved || loading || printingNow.current) return;
    printingNow.current = true; setPrinting(true); setPrintDoc(""); setError("");
    const generation = version.current;
    try {
      // Reauthorize live target before each financial print, not just initial preview.
      const response = await requestJson<{ document: Document }>(`/api/pos/documents/${encodeURIComponent(documentId)}`);
      if (!mounted.current || generation !== version.current) return;
      if (!verified(response.document, documentId)) throw new Error("Document print snapshot is unverified.");
      setSaved(response.document); setPrintDoc(documentHtml(response.document)); setSequence(n => n + 1);
    } catch (err) { if (mounted.current && generation === version.current) { setSaved(null); setError(err instanceof Error ? err.message : "Could not authorize print."); } }
    finally { printingNow.current = false; if (mounted.current && generation === version.current) setPrinting(false); }
  }
  const renderedVersion = version.current;
  return <section role="dialog" aria-modal="true" aria-label="Internal sales document snapshot" className="fixed inset-0 z-50 overflow-auto bg-background p-6"><div className="mx-auto max-w-3xl space-y-3 rounded border bg-card p-6">
    <h2 className="text-xl font-semibold">{disclaimer}</h2>
    <button className="mr-3 rounded-md border px-3 py-2 text-sm disabled:opacity-50" type="button" onClick={() => { version.current++; setPrintDoc(""); onClose(); }}>Close document preview</button>
    {!allowed ? <p role="alert">POS / Cashier permission is required. Kitchen-only access cannot read financial documents.</p> : <>
      {loading && <p role="status">Loading saved document…</p>}{error && <p role="alert">{error}</p>}
      <button className="mr-3 rounded-md border px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={loading || printing} onClick={() => { version.current++; setSaved(null); setPrintDoc(""); setAttempt(n => n + 1); }}>Refresh document snapshot</button>
      {!loading && !error && saved && <>
        <h3>{saved.kind} — {saved.number}</h3><p>{saved.issuedAt}; {saved.seller.name}; {saved.seller.branchName} ({saved.seller.branchCode}); {saved.seller.address}</p>
        <p>TIN / VRN: unverified, not configured (null). Internal-only; no TRA/EFD integration.</p>
        <p>Original customer: {saved.customer ? `${saved.customer.name || "not recorded"} ${saved.customer.phone || ""}` : "not recorded"}. {saved.channel}; table {saved.tableNo || "—"}.</p>
        <p>Source {saved.sourceType} {saved.sourceId} / revision {saved.sourceRevision}; order {saved.orderNumber || saved.orderId || "not linked"}; receipt {saved.receiptNumber || "none"}; applicable proforma {saved.proformaId || "none"}.</p>
        <table className="w-full text-sm"><thead><tr><th>Saved item / code</th><th>Qty</th><th>Unit price TZS</th><th>VAT %</th><th>Line total TZS</th></tr></thead><tbody>{saved.lines.map((l, i) => <tr key={l.orderLineId ?? i}><td>{l.name} / {l.productCode || "(known blank)"}</td><td>{l.qty}</td><td>{l.price}</td><td>{l.vatRatePercent}</td><td>{l.lineTotal}</td></tr>)}</tbody></table>
        <p>Subtotal TZS {saved.subtotal}; VAT TZS {saved.taxAmount}; total TZS {saved.totalAmount}.</p>
        <ul>{saved.vat.rates.map((r, i) => <li key={i}>{r.ratePercent}%: taxable TZS {r.taxableAmount}; VAT TZS {r.vatAmount}</li>)}</ul>
        <p>Grand taxable TZS {saved.vat.grandTaxable}; grand tax TZS {saved.vat.grandTotalTax}; grand total TZS {saved.vat.grandTotal}.</p>
        <p>Tender {saved.currency.tenderCurrencyCode === "INR" ? "TZS" : saved.currency.tenderCurrencyCode}: {saved.currency.tenderCurrencyAmount}; FX to TZS {saved.currency.fxRateToInr}.</p>
        <p>{saved.disclaimer}</p><button className="mr-3 rounded-md border px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={printing} onClick={print}>Print / reprint document</button>
      </>}
      <p>Browser print of the immutable sales document only. No payment, inventory or revenue posting. No provider sends or printer-device delivery is performed or verified.</p>
      {printDoc && <iframe key={sequence} title="Invoice-only print document" srcDoc={printDoc} style={{ position: "fixed", left: "-10000px", width: "1px", height: "1px", border: 0 }} onLoad={event => { if (!mounted.current || !allowed || version.current !== renderedVersion) return; const target = event.currentTarget.contentWindow; target?.focus(); target?.print(); }} />}
    </>}
  </div></section>;
}
