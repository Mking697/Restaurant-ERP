"use client";
import * as React from "react";
import { requestJson } from "@/lib/current-user";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export const inputClass = "w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm";
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
export function Panel({ children }: { children: React.ReactNode }) { return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">{children}</section>; }
export function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:p-3 [&_th]:text-muted-foreground [&_td]:p-3 [&_tr]:border-b"><thead><tr>{headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function money(value: string) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(value)); }
export function today() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function monthNow() { return today().slice(0, 7); }
export function monthEnd(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}
export function query(branchId: string, extra: Record<string, string> = {}) { return new URLSearchParams({ branchId, ...extra }).toString(); }
/** Suppress stale reads, including a reload superseded before JSON decoding completes. */
export function useResource<T>(url: string | null) {
  const [state, setState] = React.useState<{ url: string | null; data: T | null; loading: boolean; error: string }>({ url, data: null, loading: !!url, error: "" });
  const version = React.useRef(0);
  const mounted = React.useRef(false);
  const reload = React.useCallback(async () => {
    if (!url || !mounted.current) return null;
    const current = ++version.current;
    setState({ url, data: null, loading: true, error: "" });
    try {
      const data = await requestJson<T>(url);
      if (mounted.current && current === version.current) setState({ url, data, loading: false, error: "" });
      return data;
    } catch (error) {
      if (mounted.current && current === version.current) setState({ url, data: null, loading: false, error: error instanceof Error ? error.message : "Request failed" });
      throw error;
    }
  }, [url]);
  React.useEffect(() => { mounted.current = true; void reload().catch(() => {}); return () => { mounted.current = false; version.current++; }; }, [reload]);
  return { ...(state.url === url ? state : { data: null, loading: !!url, error: "" }), reload };
}
export function LoadState({ loading, error, empty, reload }: { loading: boolean; error: string; empty?: boolean; reload: () => Promise<unknown> }) {
  const { t } = useTranslation();
  return <>{loading && <p role="status">{t("Loading saved records…", "Saved records load ho rahe hain…")}</p>}{error && <div role="alert" className="space-y-2 text-destructive"><p>{t("Could not load records:", "Records load nahi hue:")} {error}</p><Button variant="outline" onClick={() => void reload().catch(() => {})}>{t("Retry", "Phir try karo")}</Button></div>}{!loading && !error && empty && <p>{t("No records in this scope.", "Is branch/date mein koi record nahi hai.")}</p>}</>;
}
export function useAction() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const lock = React.useRef(false);
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(operation: () => Promise<void>, success: string) {
    if (lock.current || !mounted.current) return false;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await operation(); if (mounted.current) setMessage(success); return mounted.current; }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "Request failed"); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return { busy, error, message, run };
}
export function ActionState({ action }: { action: ReturnType<typeof useAction> }) {
  const {t} = useTranslation();
  return <>{action.error && <p role="alert" className="text-destructive">{t("Action failed; check saved records before retrying:", "Action fail hua; retry se pehle saved records check karo:")} {action.error}</p>}{action.message && <p role="status" className="text-success">{action.message}</p>}</>;
}
export async function post(url: string, body: unknown, method = "POST") { return requestJson(url, {method, body: JSON.stringify(body)}); }
