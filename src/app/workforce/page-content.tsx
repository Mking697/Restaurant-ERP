"use client";
import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrentUser, hasCurrentModule } from "@/lib/current-user";
import { useBranches, useSelectedBranchId } from "@/lib/current-branch";
import { useTranslation } from "@/lib/i18n";
import { Field, inputClass, Panel } from "./live-ui";
import EmployeesPanel from "./employees-panel";
import AttendancePanel from "./attendance-panel";
import LeavesPanel from "./leaves-panel";
import PayrollPanel from "./payroll-panel";
export default function WorkforcePage() {
  const actor = useCurrentUser(); const selected = useSelectedBranchId();
  const identity = `${actor.id}:${actor.authenticated}:${actor.role}:${actor.branchId}:${actor.moduleAccess.join(",")}:${selected}`;
  return <AppShell activeHref="/workforce"><WorkforceScope key={identity} selected={selected} /></AppShell>;
}
function WorkforceScope({ selected }: {selected:string}) {
  const {t} = useTranslation(); const actor = useCurrentUser(); const {branches,error} = useBranches();
  const [choice,setChoice] = React.useState("");
  const branchId = actor.role === "SUPER_ADMIN" ? (selected === "all" ? choice : selected) : actor.branchId ?? "";
  const payroll = hasCurrentModule(actor,"PAYROLL"); const attendance = hasCurrentModule(actor,"ATTENDANCE");
  const leaves = hasCurrentModule(actor,"LEAVE_SELF","LEAVE_APPROVAL","PAYROLL");
  const defaultTab = payroll ? "employees" : attendance ? "attendance" : "leaves";
  return <><PageHeader title={t("Workforce", "Staff aur payroll")} description={t("Branch employees, daily attendance, approved leave and monthly payroll records. No automatic holidays or bank transfers.", "Branch employees, roz ki attendance, approved leave aur monthly payroll records. Automatic chhutti ya bank transfer nahi.")} />
    {error && <p role="alert" className="mb-3 text-destructive">{error}</p>}
    {!payroll && !attendance && !leaves ? <p role="alert">{t("Workforce permission is required.", "Workforce permission chahiye.")}</p> : <>
      <div className="mb-4 max-w-sm"><Field label={t("Branch", "Branch")}><select className={inputClass} disabled={actor.role !== "SUPER_ADMIN" || selected !== "all"} value={branchId === "__no_branch__" ? "" : branchId} onChange={e => setChoice(e.target.value)}><option value="">{t("Select one branch", "Ek branch chuno")}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></Field></div>
      <Tabs key={branchId} defaultValue={defaultTab}><TabsList>{payroll && <TabsTrigger value="employees">{t("Employees", "Employees")}</TabsTrigger>}{attendance && <TabsTrigger value="attendance">{t("Daily attendance", "Roz ki attendance")}</TabsTrigger>}{leaves && <TabsTrigger value="leaves">{t("Leave requests", "Chhutti requests")}</TabsTrigger>}{payroll && <TabsTrigger value="payroll">{t("Payroll", "Payroll")}</TabsTrigger>}</TabsList>
        {branchId && branchId !== "__no_branch__" ? <>{payroll && <TabsContent value="employees"><EmployeesPanel branchId={branchId} /></TabsContent>}{attendance && <TabsContent value="attendance"><AttendancePanel branchId={branchId} /></TabsContent>}{leaves && <TabsContent value="leaves"><LeavesPanel branchId={branchId} /></TabsContent>}{payroll && <TabsContent value="payroll"><PayrollPanel branchId={branchId} /></TabsContent>}</> : <Panel>{t("Select a branch to load its records.", "Records load karne ke liye ek branch chuno.")}</Panel>}
      </Tabs>
    </>}
  </>;
}
