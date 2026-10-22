"use client";
import * as React from "react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ActionState, DataTable, Field, inputClass, LoadState, Panel, post, query, today, useAction, useResource } from "./live-ui";
import type { Attendance } from "./types";
export default function AttendancePanel({branchId}:{branchId:string}) {
  const {t} = useTranslation(); const [date,setDate] = React.useState(today);
  return <div className="space-y-4"><div className="max-w-xs"><Field label={t("Attendance date", "Attendance ki tareekh")}><input className={inputClass} required type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></Field></div>{date && <AttendanceDay key={date} branchId={branchId} date={date} />}</div>;
}
function AttendanceDay({branchId,date}:{branchId:string;date:string}) {
  const {t} = useTranslation(); const resource = useResource<Attendance>(`/api/workforce/attendance?${query(branchId,{date})}`); const action = useAction();
  return <Panel><div className="flex justify-between gap-2"><h2 className="font-semibold">{t("Daily attendance", "Roz ki attendance")}</h2><Button variant="outline" disabled={resource.loading || action.busy} onClick={() => void resource.reload().catch(() => {})}>{t("Reload", "Reload karo")}</Button></div><p className="text-sm text-muted-foreground">{t("Present = 1 unit; half-day = 0.5; absent = 0. Missing dates are not assumed present or absent. Approved leave is read-only. Finalized payroll dates are locked by the server.", "Present = 1 unit; half-day = 0.5; absent = 0. Missing dates ko present ya absent nahi maana jata. Approved leave read-only hai. Final payroll ki dates server par locked hain.")}</p><LoadState {...resource} empty={!resource.data?.employees.length} /><ActionState action={action} />
    {resource.data && <DataTable headers={[t("Employee", "Employee"),t("Saved status", "Saved status"),t("Mark attendance", "Attendance mark karo")]}>{resource.data.employees.map(employee => {
      const mark = resource.data!.attendance.find(row => row.employeeId === employee.id); const leave = resource.data!.leaves.find(row => row.employeeId === employee.id && (!row.status || row.status === "APPROVED"));
      return <tr key={employee.id}><td className="min-w-40">{employee.name}</td><td>{leave ? <span>{t("Approved leave · read-only", "Approved chhutti · read-only")} · {leave.payType === "PAID" ? t("Paid", "Paid") : t("Unpaid", "Unpaid")}</span> : mark ? statusLabel(mark.status,t) : t("Unmarked", "Mark nahi hua")}</td><td>{!leave && <MarkForm key={`${employee.id}:${mark?.status ?? "missing"}`} employeeId={employee.id} employeeName={employee.name} date={date} initial={mark?.status ?? ""} disabled={action.busy || date > today()} save={async status => {await action.run(async () => {await post("/api/workforce/attendance",{employeeId:employee.id,date,status});await resource.reload();},t("Attendance saved and reloaded.", "Attendance save hui aur reload hui."));}} />}</td></tr>;
    })}</DataTable>}
  </Panel>;
}
function MarkForm({employeeId,employeeName,date,initial,disabled,save}:{employeeId:string;employeeName:string;date:string;initial:string;disabled:boolean;save:(status:string)=>Promise<void>}) {
  const {t} = useTranslation(); const [status,setStatus] = React.useState(initial);
  return <form className="flex min-w-60 items-center gap-2" onSubmit={e => {e.preventDefault();void save(status);}}><select className={inputClass} aria-label={`${t("Attendance", "Attendance")} ${employeeName} ${date}`} id={`attendance-${employeeId}`} required disabled={disabled} value={status} onChange={e => setStatus(e.target.value)}><option value="">{t("Select status", "Status chuno")}</option>{(["PRESENT","HALF_DAY","ABSENT"] as const).map(value => <option key={value} value={value}>{statusLabel(value,t)}</option>)}</select><Button type="submit" disabled={disabled || !status}>{t("Save", "Save karo")}</Button></form>;
}
function statusLabel(status:string,t:(en:string,hi?:string)=>string) {return status === "PRESENT" ? t("Present", "Present") : status === "HALF_DAY" ? t("Half-day", "Aadha din") : t("Absent", "Absent");}
