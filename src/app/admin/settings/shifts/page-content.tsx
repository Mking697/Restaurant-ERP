"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hasCurrentModule, requestJson, RequestJsonError, useCurrentUser } from "@/lib/current-user";
import { useSelectedBranchId } from "@/lib/current-branch";
import { useTranslation } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";
import { useShiftWriteGuard } from "@/lib/shift-gate";

interface ShiftRow { id: string; branchId: string; label: string; startTime: string; endTime: string; sortOrder: number }
interface ShiftRun { id: string; branchId: string; shiftDefinitionId: string; label: string; status: string; startedAt: string; endedAt: string | null }
interface Handover { id: string; toRunId: string; cashAmount: string; cardAmount: string; upiAmount: string; otherAmount: string; status: string }

const inputClass = "min-w-0 w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm";

export default function ShiftsSettingsPage() {
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  return <ScopedShiftsSettings key={JSON.stringify([actor.id, actor.role, actor.branchId, actor.authenticated, actor.moduleAccess, selected])} />;
}
function ScopedShiftsSettings() {
  const { t } = useTranslation();
  const actor = useCurrentUser();
  const selected = useSelectedBranchId();
  const allowed = hasCurrentModule(actor, "SHIFT_MANAGEMENT");
  const branchId = actor.role === "SUPER_ADMIN" ? (selected !== "all" ? selected : "") : actor.branchId ?? "";

  const [shifts, setShifts] = React.useState<ShiftRow[]>([]);
  const [draft, setDraft] = React.useState<{ label: string; startTime: string; endTime: string }[]>([]);
  const [run, setRun] = React.useState<ShiftRun | null>(null);
  const [pendingHandover, setPendingHandover] = React.useState<Handover | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const writeGuard = useShiftWriteGuard(`${actor.id}:${branchId}`);
  const generation = React.useRef(0);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  async function load() {
    if (!mounted.current) return;
    const ticket = ++generation.current;
    setRun(null); setPendingHandover(null); setShifts([]); setDraft([]);
    if (!allowed || !branchId) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const [shiftData, runData] = await Promise.all([
        requestJson<{ shifts: ShiftRow[] }>(`/api/branch-shifts?branchId=${encodeURIComponent(branchId)}`),
        requestJson<{ run: ShiftRun | null; pendingHandover: Handover | null }>(`/api/shift-runs?branchId=${encodeURIComponent(branchId)}`),
      ]);
      if (!mounted.current || generation.current !== ticket) return;
      setShifts(shiftData.shifts);
      setDraft(shiftData.shifts.length ? shiftData.shifts.map((s) => ({ label: s.label, startTime: s.startTime, endTime: s.endTime })) : [{ label: "Shift A", startTime: "00:00", endTime: "00:00" }]);
      setRun(runData.run);
      setPendingHandover(runData.pendingHandover);
    } catch (err) { if (mounted.current && generation.current === ticket) setError(err instanceof Error ? err.message : "Load failed"); }
    finally { if (mounted.current && generation.current === ticket) setLoading(false); }
  }
  React.useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [allowed, branchId]);

  function updateDraft(i: number, patch: Partial<{ label: string; startTime: string; endTime: string }>) {
    setDraft((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() { setDraft((prev) => [...prev, { label: `Shift ${String.fromCharCode(65 + prev.length)}`, startTime: "00:00", endTime: "00:00" }]); }
  function removeRow(i: number) { if (draft.length > 1) setDraft((prev) => prev.filter((_, idx) => idx !== i)); }

  async function save() {
    const payload = { branchId, shifts: draft };
    if (!allowed || !branchId || loading || busy || error || !writeGuard.begin("/api/branch-shifts", payload)) return;
    setBusy(true); setError("");
    try {
      const saved = await requestJson<{ shifts: ShiftRow[] }>(`/api/branch-shifts`, { method: "POST", body: JSON.stringify(payload) });
      if (!Array.isArray(saved.shifts) || !saved.shifts.length || !saved.shifts.every((shift) => shift.id && shift.branchId === branchId)) throw new Error("Could not confirm saved shifts. Verify saved records before continuing.");
      writeGuard.finish();
      await load();
    } catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected") writeGuard.finish();
      setError(err instanceof Error ? err.message : "Could not confirm save. Verify saved shifts before retrying.");
    }
    finally { setBusy(false); }
  }

  async function startShift() {
    const payload = { branchId };
    if (!allowed || !branchId || loading || busy || error || !writeGuard.begin("/api/shift-runs", payload)) return;
    setBusy(true); setError("");
    try {
      const saved = await requestJson<{ run: ShiftRun }>("/api/shift-runs", { method: "POST", body: JSON.stringify(payload) });
      if (!saved.run?.id || saved.run.branchId !== branchId) throw new Error("Could not confirm shift start. Verify saved records before continuing.");
      writeGuard.finish(); await load();
    }
    catch (err) {
      if (err instanceof RequestJsonError && err.outcome === "rejected") writeGuard.finish();
      setError(err instanceof Error ? err.message : "Could not confirm start. Verify shift status before retrying.");
    }
    finally { setBusy(false); }
  }

  return (
    <AppShell activeHref="/admin/settings/shifts">
      <PageHeader
        title={t("Shift Management", "Shift Management")}
        description={t("Configure this branch's shift windows (must tile a full 24h day, no gaps). Changing times only affects future shifts — past runs keep their real recorded times.", "Is branch ke shift windows set karo (pura 24 ghante cover karein, koi gap nahi). Time change karne se sirf future shifts asar hoti hain — purane runs apna real time rakhte hain.")}
      />
      {!allowed ? <p role="alert">{t("Shift Management permission is required.", "Shift Management permission chahiye.")}</p> : !branchId ? (
        <p role="alert">{t("Select one branch to manage its shifts.", "Shifts manage karne ke liye ek branch chuno.")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("Current status", "Current status")}</CardTitle>
              <CardDescription>{t("The live operational cycle for this branch.", "Is branch ka live operational cycle.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? <p role="status">{t("Loading…", "Load ho raha hai…")}</p> : error ? null : run ? (
                <>
                  <p className="text-sm">{t("Open run:", "Open run:")} <strong>{run.label}</strong> <Badge variant="success">{run.status}</Badge></p>
                  <p className="text-xs text-muted-foreground">{t("Started:", "Shuru hua:")} {new Date(run.startedAt).toLocaleString("en-IN")}</p>
                  <ShiftReminder run={run} definition={shifts.find((shift) => shift.id === run.shiftDefinitionId)} />
                  {pendingHandover && <p className="text-sm text-destructive">{t("A handover into this run is still PENDING acceptance on the POS/Cash Drop page.", "Is run ka handover abhi PENDING hai — POS/Cash Drop page par accept karna hoga.")}</p>}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t("No shift is currently open.", "Abhi koi shift open nahi hai.")}</p>
                  {!!shifts.length && <Button disabled={busy || !writeGuard.ready || writeGuard.blocked} onClick={startShift}>{busy ? t("Starting…", "Shuru ho raha hai…") : t("Start Shift", "Shift Shuru Karo")}</Button>}
                </>
              )}
              {error && <p role="alert" className="text-destructive">{t(error)}</p>}
              {writeGuard.blocked && !busy && <p role="alert" className="text-destructive">{t("A shift change has an unconfirmed outcome, or browser storage is unavailable. Further changes are blocked in this tab. Ask an administrator to verify saved records; reloading status does not retry the change.", "Shift change ka result confirm nahi hai ya browser storage available nahi hai. Is tab mein naye changes blocked hain. Admin se saved records verify karwao; status reload se change dobara submit nahi hota.")}</p>}
              <Button variant="outline" disabled={loading || busy} onClick={() => { void load(); }}>{t("Reload saved status", "Saved status reload karo")}</Button>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("Shift windows", "Shift windows")}</CardTitle>
              <CardDescription>{t("One row per shift, in handover order. Each row's end time must equal the next row's start time (last row wraps to the first).", "Har shift ek row — handover order mein. Har row ka end time agle row ke start time ke barabar hona chahiye (last row wapas first se judta hai).")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <fieldset disabled={loading || busy || !!error || !writeGuard.ready || writeGuard.blocked} className="min-w-0 space-y-3">
              {draft.map((row, i) => (
                <div key={i} className="grid min-w-0 grid-cols-2 items-end gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_auto]">
                  <label className="col-span-2 min-w-0 space-y-1 text-xs font-medium xl:col-span-1"><span>{t("Label", "Label")}</span><input className={inputClass} maxLength={40} value={row.label} onChange={(e) => updateDraft(i, { label: e.target.value })} /></label>
                  <label className="min-w-0 space-y-1 text-xs font-medium"><span>{t("Start", "Start")}</span><input type="time" className={inputClass} value={row.startTime} onChange={(e) => updateDraft(i, { startTime: e.target.value })} /></label>
                  <label className="min-w-0 space-y-1 text-xs font-medium"><span>{t("End", "End")}</span><input type="time" className={inputClass} value={row.endTime} onChange={(e) => updateDraft(i, { endTime: e.target.value })} /></label>
                  <Button type="button" aria-label={t("Remove shift", "Shift hatao")} variant="outline" size="sm" disabled={draft.length <= 1} onClick={() => removeRow(i)}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" disabled={draft.length >= 12} onClick={addRow}><Plus className="size-4" /> {t("Add Shift", "Shift Add Karo")}</Button>
              <div className="flex flex-col items-stretch gap-3 border-t pt-3 sm:flex-row sm:items-center">
                <p className="text-xs text-muted-foreground">{t("Total must be exactly 24h. Same start/end on one row means it covers the whole day.", "Total exactly 24h hona chahiye. Ek row mein same start/end matlab wo pura din cover karti hai.")}</p>
                <Button className="shrink-0" disabled={busy} onClick={save}>{busy ? t("Saving…", "Save ho raha hai…") : t("Save Shifts", "Shifts Save Karo")}</Button>
              </div>
              </fieldset>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function ShiftReminder({ run, definition }: { run: ShiftRun; definition?: ShiftRow }) {
  const { t } = useTranslation();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  if (!definition) return <p className="text-sm text-muted-foreground">{t("End this shift manually on Cash Drop. Its original window is no longer in the active configuration, so no scheduled due time is shown.", "Cash Drop par shift manually end karo. Original window active configuration mein nahi hai, isliye due time nahi dikhaya gaya hai.")}</p>;
  // Same IST wall-clock convention as the server; this is a reminder only.
  const started = new Date(run.startedAt);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(started);
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  let due = new Date(`${part("year")}-${part("month")}-${part("day")}T${definition.endTime}:00+05:30`).getTime();
  if (due <= started.getTime()) due += 24 * 60 * 60 * 1000;
  return <p role="status" className={now >= due ? "text-sm font-medium text-amber-700 dark:text-amber-400" : "text-sm text-muted-foreground"}>
    {now >= due ? t("Scheduled shift end is due. End it manually on Cash Drop; time alone never closes a shift.", "Scheduled shift end due hai. Cash Drop par manually end karo; time se shift auto-close nahi hoti.") : t("Scheduled end reminder:", "Scheduled end reminder:")} {new Date(due).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.
    {now < due && <> {t("End manually on Cash Drop when ready; this is not an automatic cutoff.", "Ready hone par Cash Drop par manually end karo; yeh automatic cutoff nahi hai.")}</>}
  </p>;
}

