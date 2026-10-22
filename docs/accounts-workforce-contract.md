# Accounts + Workforce acceptance contract

Status: implemented and locally acceptance-verified on October 22, 2026 (91 automated tests, 64 real HTTP/Postgres checks; details in workforce-resume-verification.md). NOT deployed. Latest user correction wins: NO WEEKLY OFF concept. Employee can apply leave, a different authorized manager must approve/reject; neither the linked employee nor the submitter may review, including Owner.

Confirmed pay rules
- ON_ROLL: monthly salary / actual calendar days in month (28/29/30/31) * payable units, rounded half-up to paise once per employee/month.
- OFF_ROLL: daily wage * worked units. Approved leave is unpaid for off-roll.
- PRESENT 1, HALF_DAY 0.5, ABSENT 0. No automatic off/holiday or missing-day assumption.
- Approved ON_ROLL leave can be PAID or UNPAID, explicitly selected by manager on approval; pending/rejected leave has no pay effect.
- Inclusive employment join/exit dates; no payroll outside employment interval. Require all eligible past dates marked or approved leave before finalization. No future attendance/leave backdoor; leave may be applied for future dates, payroll only at completed month end.
- No payroll statutory/tax/PF/ESI/overtime calculation, bank transfer or compliance claim in this basic implementation.
- Immutable finalized monthly payroll snapshot; cannot regenerate duplicate payouts or edit rate/attendance/leave for finalized covered month. Rate changes cannot rewrite previous finalized periods. Keep rate effective-dated or deny changes after attendance exists until explicit next effective date is chosen.

Security
- Owner all branches; all other roles strictly own branch plus grants. Add ACCOUNTANT branch role without HQ-wide bypass.
- New module grants ACCOUNTS_EXPENSES, PAYROLL, ATTENDANCE, LEAVE_APPROVAL, LEAVE_SELF. Branch Admin delegation stays subset-of-held and own branch.
- PAYROLL manages employee/rate records and payroll generation; ATTENDANCE daily marks; LEAVE_SELF own linked employee applications only; LEAVE_APPROVAL permits review own-branch employees (no self approval). Owner may review any other employee; no self approval.
- API live auth+branch scope on every read/write and related ID. Explicit CSRF same-origin and existing mutate lock for writes. Every page protectedPage wrapper.
- Employee record separate from login; optional userId link must belong same branch; one employee per user. Self-service leave requires link. Accountants/managers with grant can submit on behalf, actor recorded.

UI/API contract (amounts decimal INR strings, dates YYYY-MM-DD, month YYYY-MM)
Expense routes:
 GET /api/accounts/expenses?branchId=&month= -> {expenses:[id,branchId,date,category,subcategory,amount,description,reference,status,createdById],totals:{RENT,UTILITIES,MARKETING,OTHER},month}
 POST same -> {expense}, body branchId,date,category RENT|UTILITIES|MARKETING|OTHER,subcategory,amount,description,reference,idempotencyKey. Persist posted expenses only, immutable; duplicate key no duplicate expense.
 POST /api/accounts/expenses/[id]/void -> {expense}, body reason; void once and retain original/audit.
 GET /api/accounts/profit-loss?branchId=&month= -> {month,expenses:{RENT,UTILITIES,MARKETING,OTHER},laborCost,totalOperatingExpenses,revenue:null,cogs:null,grossProfit:null,netProfit:null,salesConnected:false,notes:string[]}. Real expense sums + FINAL payroll snapshots only, not draft payroll; no dummy revenue blended with real entries. Branch/month filters mandatory validated.

Workforce routes:
 GET /api/workforce/employees?branchId= -> {employees:[id,branchId,userId,name,employmentType ON_ROLL|OFF_ROLL,rate,joinedOn,leftOn,rateEffectiveFrom], users:[id,name] permitted candidates optional}
 POST employees -> {employee} body branchId,name,userId?,employmentType,rate,joinedOn. PATCH /employees/[id] explicit safe editable fields and effective-dated rate, no branch transfer after activity.
 GET /api/workforce/attendance?branchId=&date= -> {employees:[...],attendance:[id,employeeId,date,status PRESENT|HALF_DAY|ABSENT],leaves:[approved per date]}
 POST attendance -> {attendance} body employeeId,date,status, optional note; upsert unique employee/date; deny conflicting approved leave/final payroll date/future date/outside employment.
 GET /api/workforce/leaves?branchId= -> {leaves:[id,employeeId,employeeName,branchId,startDate,endDate,reason,status PENDING|APPROVED|REJECTED,payType PAID|UNPAID|null,reviewNote,requestedById],employees:[id,name]} scope self or permitted manager.
 POST leaves -> {leave}, body employeeId,startDate,endDate,reason; reject overlaps pending/approved, employment boundaries, marked attendance or finalized period. No user-provided approval.
 POST /api/workforce/leaves/[id]/review -> {leave}, body decision APPROVED|REJECTED,payType PAID|UNPAID,reviewNote. Reject own leave and stale decision, mixed payroll-finalized interval. OFF_ROLL PAID forbidden. Approved leave derives attendance/payroll; never double mark.
 GET /api/workforce/payroll?branchId=&month= -> {month,rows:[employeeId,employeeName,branchId,employmentType,rate,calendarDays,presentDays,halfDays,paidLeaveDays,unpaidDays,missingDates:string[],payableUnits,amount,status DRAFT|FINAL],total,finalized:boolean}. Real preview; missing dates explicit; no future-month finalization.
 POST /api/workforce/payroll/finalize -> same aggregate shape; body branchId,month (single branch required), rejects missing marks and unfinished month, idempotent under lock+unique employee/month snapshot; repeated finalize returns same rows, no duplicates. Finalization records salary expense exactly once; disallow adding/backdating employees into finalized branch/month to avoid incomplete runs.

Pages
- /accounts new real Expenses and P&L views; old pettycash/recon/balance-sheet demo remain explicitly per-tab labelled or hidden pending, never call whole Accounts fully live.
- /workforce with tabs Employees, Daily Attendance, Leave Requests, Payroll; show only granted tabs, LEAVE_SELF sees own leave form/history not salary/others.
- Bilingual English default/Hinglish; use existing theme/preferences, branch hooks, safe form option values.
- Manager approve/reject explicit; final payroll confirmation and warning immutable/no money sent.
- Guides update real vs pending boundaries and practical examples after behavior verified.

Tests/migration/deployment
- Parent owns schema export+auth enum/grants/migrations/build/deploy. Agents own disjoint new files.
- Strict TDD per vertical behavior; deterministic calendar/paise arithmetic tests, permission/date validation, overlap/missing days, duplicate finalization, finalized edit lock, two-branch tests, true persisted rollback/readback.
- Use dedicated loopback QA database; no business fixtures/payroll records on Neon. Additive migration first verified QA, only then apply Neon before deployment (no literal connection URLs/credential output).
