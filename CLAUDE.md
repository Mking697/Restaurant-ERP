# CLAUDE.md — Multi-Branch Restaurant Chain ERP + WhatsApp Automation

Project root: `G:\restaurant erp`
Scope: 6 branches now, scalable to N via `branch_id` multi-tenant isolation.
Stack explicitly confirmed with user: **Next.js + Drizzle ORM + Postgres**,
matching the user's other project Pro ERP (github Mking697/Pro-ERP) for
pattern/code reuse. Prisma was discarded — do not resurrect `prisma/`.

This file is the single source of truth for where this build stands. Read this
first every time work resumes on this project.

---

## ACTIVE RELEASE + REMAINING-WORK TRACKER (October 29, 2026)

User authorized committing/pushing/deploying the completed Phase 2/3 snapshot,
then starting the remaining work and marking each item COMPLETE only after
implementation, parent-run tests and review. Future schema changes, breaking
dependency upgrades, paid providers and production business writes still need
separate approval. Pending follow-up changes are not automatically part of the
current authorized release snapshot.

- [COMPLETE] RELEASE-1: Phase 2/3 deployed as `5686996` after the store-PO approval fix
  in the real POST and UI; parent ran 213/213 unit tests, clean
  typecheck/build and 50/50 HTTP/PG checks on dev AND compiled app, including
  no-write rejections, decimal concurrency and forced rollback. Browser
  create/reload and exact two-line PG readback passed; pixel-level review is
  not claimed. Evidence: `docs/purchase-release-verification.md` (October 29).
  Independent scoped review passed with no blocking security/logic findings;
  reviewer reran 14/14 focused DB-free purchase tests. Nonblocking suggestion:
  paginate approved-indent choices beyond the current 200-row list cap.
  Committed/pushed `5686996af6cf58b6d8d9ef9f23caea65663b30c6`; Vercel
  `dpl_EoA3JV6ZkwLkMQBrx1UWV7JhCNYK` READY for that exact SHA, public alias
  read back to that deployment and GitHub Vercel status success. Public smoke
  16/16 passed; no authenticated production workflow/Owner login or fixtures.
  Fresh Neon read-only preflight AND postflight: all 11 migrations (0000–0010),
  correct timestamps and LF-normalized SHA-256 hashes; local 0002 checkout has
  CRLF only. owner_only and login_attempts verified. No pending migration.
  Production counts unchanged: 6 branches, 1 user, 12 inventory rows, 0 POS
  orders/POs/GRNs. All remaining items below stay open, not part of this release.
- [COMPLETE — LOCAL FUNCTIONAL ACCEPTANCE] GRN-1: All-line quality/failures,
  atomic once-only accepted stock, durable audit/origin evidence, safe exact
  replay and legacy reconciliation are implemented. Parent: 247/247 unit,
  clean typecheck/build; dev AND compiled HTTP/PG: GRN 34/34, purchase 50/50,
  transfer receipt 15/15. Browser PASS/FAIL/PARTIAL/general save+reload,
  note validation, buyer permission prerequisite, legacy block and exact PG
  stock/line/receipt readback passed; phone width 390 without page overflow.
  English/Hinglish guides synced. Independent application review passed;
  reviewer ran 32/32 focused tests. Related transfer omission, duplicate-row,
  capacity and exact-quantity/field-validation gaps fixed with regressions.
  Evidence: `docs/grn-quality-verification.md`; contract:
  `docs/grn-quality-contract.md`. Own QA fixtures/processes/output cleaned;
  default generated-type config diff-clean. Pixel review unavailable (image
  provider 404); exhaustive visual/device QA remains UX-1, not claimed here.
  Application release `9df29c646c99d102ec19f9e7d95582615716cc9b` committed,
  pushed and deployed after explicit user approval. Vercel deployment
  `dpl_8pXgwBNZS5yvyAKmERxMXef9LQBh` READY for that exact SHA; public alias
  readback matched and GitHub Vercel status succeeded. Public smoke 18/18.
  Fresh Neon read-only pre/postflight: all 11 migration hashes/timestamps
  matched; no pending migration or dependency change. Production counts
  unchanged: 6 branches, 1 user, 12 inventory rows, 0 orders/POs/GRNs.
  No authenticated production workflow, fixtures or messages. A docs-only
  follow-up carries this release checkpoint. GRN-2 and all items below stay open.
- [PENDING] GRN-2: Persist failed-material vendor-return/refund receivable
  records and expose them to Accounts. Distinguish an owed refund/credit from
  actual receipt of money; no invented cash payment or automatic journals.
- [PENDING] TASKS-1: Add minimal branch-scoped assignee lookup/dropdown without
  granting user administration or exposing salary/phone/credential fields.
- [PENDING] FINANCE-1: Real, idempotent journal posting for agreed source events;
  agree posting/reversal rules first. Current petty-cash/aggregator records do
  not automatically create journal entries.
- [PENDING] FINANCE-2: Connect actual revenue/COGS and labor allocation to P&L
  and prime cost. Current recipe/rate food-cost report is an estimate, not a
  historical posted COGS source; never silently treat it as an actual ledger.
- [PENDING] AUTOMATION-1: Recurring occurrence generation, overdue escalation,
  scheduled summaries/expiry alerts and real indent rolling-average/spike data.
  Require authenticated, bounded/idempotent cron; no test messages to customers.
- [PENDING — INFRA/APPROVAL] EVIDENCE-1: Real attachment storage, signed access,
  camera/GPS capture and geofence checks. Current text/URL references are not
  uploaded evidence; provider/retention/consent decisions precede deployment.
- [PENDING] PURCHASE-3: Vendor invoices/three-way match/refund reconciliation
  end-to-end acceptance; do not infer a complete money workflow from GRN stock.
- [PENDING — APPROVAL] SECURITY-1: Separate tested breaking Drizzle/Next upgrade
  passes for the recorded dependency advisories, then fresh dependency audit.
- [PENDING] UX-1: Linked-data precheck for branch deletion; real Clone Branch
  Wizard remains deferred. Complete hardened multi-device/pixel-level UI QA;
  current DOM/geometry evidence is not a claim of exhaustive visual acceptance.

## GPT TAKEOVER — PHASE 3 LOCAL INTEGRATION (October 28, 2026)

Resumed exactly after Claude's quota stopped: Phase 3 agents had delivered
MIS + Dashboard/Reports code, but parent integration/review was not done.
Preserved all uncommitted Phase 2/3 work. No production operation, schema
change/migration, dependency upgrade, commit/push/deploy authorized or done.

Parent executed: full unit suite **207/207**, typecheck clean, isolated
production build clean, Drizzle generation **57 tables/no schema changes**,
compiled-app Dashboard/Reports **54/54** and MIS **17/17** real HTTP/Postgres
checks. Evidence, exact coverage and limitations: `docs/phase3-verification.md`.
Initial independent read-only review found four MEDIUM items; fixes and focused
regressions are in place. Final bounded incremental review found **no blockers**
in all four fixes (read-only source/test review, not a separate test execution).
Phase 3 local integration is accepted within the documented scope.

Takeover fixes: remove Dashboard MIS's production-breaking APP_ORIGIN/self-HTTP
dependency; suppress obsolete shared useResource reloads after period changes;
shared inclusive IST calendar UI -> half-open compute timestamps; exact-period
Performance snapshot reads (historical Reports disclose periods); explicit
cross-module permission prerequisite states without widening API grants;
remove obsolete demo banners including report details, correct descriptions,
and sync bilingual in-app/offline guides. No actual source imports mock-data
remain in the consumer pages (one matching comment is not an import).

Real browser interactions: Compute MIS persisted 100.0% task-only snapshot;
Owner/staff operational privacy 579 vs 123; Sales Trend CSV matched filtered
579 / 2-order row; Dashboard-only and Reports-only grant states checked;
390px Dashboard/Reports document width 390. Screenshot/image analysis blocked,
so do not claim complete visual/device/report acceptance. Own QA processes
stopped, ports 4317/3043 free, own dist removed, both disposable QA databases
read back empty; unrelated servers preserved; generated config diff-clean.

Remaining project work is NOT silently complete: GRN quality persistence +
repeat-posting risk and vendor returns/refunds; Tasks manual assignee IDs and
future cron/upload/camera/GPS; current-rate recipe estimates are not historical
COGS, Accounts P&L revenue/COGS and allocated labor/prime cost still unavailable;
separate approval needed for breaking dependency upgrades and production release.

## PHASE 2 — TASKS / PURCHASE / ACCOUNTS-LEDGER REAL DB WIRING (October 28, 2026)

Dispatched 3 parallel bounded agents against `docs/phase2-contract.md`, same
pattern as the earlier Workforce/Accounts build — disjoint files, each with
its own isolated QA database+app port, no production/commit/push.

**2a — Tasks & Checklist engine**: `src/lib/server/tasks.ts` +
`src/app/api/tasks/{recurring,delegate,instances}/**` + rewired
`src/app/tasks/page-content.tsx` off mock-data. Scope deliberately excludes
WebRTC camera capture, GPS geofence math, and cron-based recurring
generation/escalation (flagged as separate future infra). ONE_TIME tasks
require a non-empty attachment to complete (400 without it); RECURRING
does not. Self-vs-grant visibility on task instances. Known gap: no
assignee dropdown (manual user-ID entry) because `GET /api/users` is
gated `assertUserAdmin`, which a `TASKS_DELEGATION`-only role wouldn't
pass — needs a follow-up `/api/users` read-scope relaxation, didn't widen
it unilaterally since it's outside this module's lane. 21/21 real
HTTP+Postgres checks passed on isolated QA.

**2b — Purchase Indent + PO 3-step money workflow**: `src/lib/server/purchase.ts`
+ `src/app/api/purchase/{indents,orders,grns,vendors}/**` + rewired
`src/app/purchase/page-content.tsx`'s Indents/PO tabs (GRN tab's existing
quality-check dialog and its real `/api/inventory/receive` call left
untouched, exactly as instructed — no duplicate logic). Indent
DRAFT→submit→approve/reject, PO from an APPROVED indent or as a general
purchase, Step 2 bill (text/URL only, no real upload pipeline — same
"don't fake a file upload" convention as elsewhere), Step 3 creates the
GRN row that feeds the already-real quality-check flow. Spike/
daily-average deliberately left `null` rather than fabricated (no real
rolling-average data source exists yet). Known gap: the GRN quality-check
dialog's PASS/FAIL/PARTIAL result still isn't written back to the `grns`
row itself (only the inventory stock posting persists) — a reload shows
PENDING in the DB even after a real quality check; flagged for a future
pass, not fixed here since the dialog/call was explicitly left intact.
34/34 real HTTP+Postgres checks passed, including the real hand-off into
unmodified `/api/inventory/receive` (+10kg stock verified).

**2c — Accounts real ledger**: `src/lib/server/accounts-ledger.ts` +
`src/app/api/accounts/{petty-cash,aggregator-orders,balance-sheet}/**` +
rewired `src/app/accounts/legacy-demos.tsx`'s 3 tabs. Petty cash balance
is a real SUM-of-all-rows (race-safe, not "last row read"). Aggregator
`netPayout` always server-computed, never trusts a client value. Chart of
accounts seeded HQ-level (`branchId: null`) because `ledgerAccounts.code`
has a global unique constraint; a branch's balance sheet = shared HQ
accounts + that branch's own journal entries. `GET /balance-sheet` never
seeds as a side effect (`seeded:false` + real zeros until an Owner-only
`POST` seeds it) — no fabricated "already balanced" number from nothing.
Real bug caught by the agent's own unit test and fixed: the debit/credit
sign flip for credit-normal accounts (LIABILITY/EQUITY/INCOME) vs
debit-normal (ASSET/EXPENSE) was missing, which would have made
Assets ≠ Liabilities + Equity. Petty-cash/aggregator writes do not
auto-post journal entries yet (future work, scoped out of this pass).
8/8 real HTTP+Postgres checks passed.

**Parent-level integration verification** (after merging all 3 agents'
disjoint changes into one tree — each agent only tested their own module
in isolation): `npx tsc --noEmit --incremental false` — 0 errors across
the combined tree. `npm test` — 174/174 (166 pre-existing + 8 new Tasks +
8 new Purchase... — exact per-agent counts above). `npx next build` —
clean, all new `/api/tasks`, `/api/purchase`, `/api/accounts/*` routes
compiled. `npx drizzle-kit generate` — "No schema changes, nothing to
migrate" (confirms no agent silently drifted the schema). Combined-module
live smoke test against the local dev DB (not just each agent's own
isolated QA DB): created a recurring task, listed indents, posted a petty
cash entry, and confirmed the same-branch-assignee validation path for
tasks all work correctly with all three modules' routes loaded together
in one running server — no import collisions, no cross-module breakage.
`tsconfig.json`/`next-env.d.ts` confirmed diff-clean against committed
baseline after all three agents' QA runs.

**NOT done yet**: nothing from Phase 2 has been committed/pushed or
migrated to production — ask before either. Phase 3 (Dashboard/Reports/MIS
aggregation) is now implemented and parent-verified as described in the GPT
takeover checkpoint above; this older Phase 2 paragraph is historical. The two flagged
gaps above (Tasks assignee dropdown needs a `/api/users` read-scope
relaxation; GRN quality-check result not persisted to the `grns` row
itself) are real, open items for a future pass.

---

User asked to go fully live: remove dummy data, run security/audit/review,
then build out all remaining mock-data modules phase-wise, with explicit
approval before every schema change/migration/production deploy.

Ground-truth re-audit (code, not notes): confirmed via grep which pages
still import `mock-data.ts` — exactly 6: Dashboard, Reports
(`/reports/[report]`), Performance/MIS leaderboard, Tasks & Checklists,
Purchase (money/Indent/PO — GRN→Inventory stock posting is already real),
and `accounts/legacy-demos.tsx` (Petty Cash/Aggregator Recon/Balance Sheet
tabs). POS is NOT on this list — it is already real/DB-backed (confirmed:
schema+API exist from the earlier Owner-only-order-privacy work). Schema
already exists for Tasks/Purchase/Accounts-ledger but NO API routes exist
yet for them — that is the real Phase 2/3 scope, not yet started.

Production Neon check before any change: 0 real `pos_orders` exist yet —
only the seeded demo fixtures (6 demo branches, 12 demo inventory rows,
3 demo-staff users) plus the one real Owner account ("Manoj"). Deleted the
3 demo-staff users (Rahul Sharma/Priya Nair/Amit Kumar) from production —
user explicitly approved keeping the 6 seeded branches + 12 inventory rows
as-is for the Owner to edit via the UI later, not deleting them.

Dispatched a read-only security-audit subagent across the whole codebase;
full report at `docs/security-audit-phase1.md`. Verdict: auth/session core
(scrypt+timing-safe passwords, httpOnly/sameSite cookies, SHA-256 session
hash at rest, tokenVersion revocation, single advisory-lock mutate()
pattern, branchScope() isolation, Drizzle-parameterized queries only, no
secrets in tree or git history) was already solid. Found 3 HIGH / 5 MEDIUM
/ 4 LOW findings.

**Fixed this pass** (all verified with real HTTP checks against an isolated
QA build, not just read): H2 (login brute-force throttle moved from a
per-process in-memory Map to a new Postgres-backed `login_attempts` table —
migration `0010_stiff_virginia_dare.sql`, additive-only, applied to LOCAL
DB only so far); L1 (added a secondary IP-keyed throttle alongside the
existing phone-keyed one); L2 (opportunistic cleanup of stale throttle
rows). M1 (`/api/admin/settings/whatsapp` now routes through the shared
`body()` helper and rejects unknown fields). M2 (`/api/currency-rates` POST
now uses the shared `mutate()` transaction instead of an unlocked
select-then-upsert). M3 (`/api/whatsapp/offer-alert` POST now uses
`mutate()` too, for consistency/defence-in-depth). M4 (added
`next.config.ts` `headers()`: X-Frame-Options DENY, X-Content-Type-Options
nosniff, Referrer-Policy, Permissions-Policy, a `frame-ancestors 'none'`
CSP — closes the clickjacking gap). M5 (`brandingInput()` now rejects
unknown fields, same allowlist convention as every other parser).

**Two real bugs found and fixed DURING verification of the H2 fix itself**
(not in the original audit — found by actually exercising the throttle with
real repeated login attempts, not just reading the code): (1) the first
version recorded throttle increments inside the SAME Postgres transaction
as credential verification — a wrong password threw an error that rolled
back that transaction, which silently undid the attempt-counter write too,
making the throttle a complete no-op for every failed login. Fixed by
moving the throttle check into its own transaction that always commits,
decided/thrown only after it commits. (2) Even after that split, the
block-flag write (`blockedUntil`) was set in the same transaction as the
`return true`/throw path and a `throw` inside `checkLoginThrottle` itself
rolled back that very write too. Fixed by making `checkLoginThrottle` never
throw internally — it only returns a boolean after its own write commits;
the caller (`login/route.ts`) throws 429 only after that transaction has
already committed. Verified end-to-end with real repeated curl requests
against a live isolated QA server+DB: 10 failed attempts on one phone pass
(401), the 11th and 12th correctly return 429 and stay 429 across the
block window, a different phone number from the same IP is unaffected until
its own/the IP's separate cap, and `login_attempts` rows persist correctly
with real `blocked_until` timestamps (not silently rolled back).

**Not fixed yet, flagged for a separate approval** (breaking dependency
upgrades, each needs its own tested pass): H1 (`drizzle-orm@^0.36.0` has an
unpatched HIGH SQL-injection advisory, fix needs ≥0.45.2, breaking); H3
(`next@^15.0.0` pulls a HIGH-severity `postcss` path-traversal advisory via
a transitive dep, fix needs a Next major bump). L4 (branches DELETE has no
pre-check listing linked data before attempting delete — cosmetic UX only,
not a security issue, low priority).

**Verification after all fixes**: `npx tsc --noEmit --incremental false` —
0 errors. `npm test` — 148/148 passed. `npx next build` — clean, same
routes. Migration `0010` applied cleanly to local Docker Postgres
(`restaurant-erp-local-db`). Full regression run on a live isolated QA
server+DB confirmed every M1–M5 fix behaves correctly end-to-end (security
headers present on every response, unknown-field rejection returns 400,
legit writes still succeed, currency-rate upsert still works).

**NOT done yet**: migration `0010` has NOT been applied to production
Neon — ask before that. `0009` (Owner-only order privacy, from an earlier
session) also still hasn't reached production. H1/H3 dependency upgrades
not attempted — ask before doing a breaking major-version bump. Nothing
committed/pushed this pass.

---

## CURRENT PROCESS FLOW CHART — now covers the entire system, all modules

User asked the chart to leave nothing out: Tasks (Recurring + Delegation),
Purchase & GRN, Users/Branches/Access, Dashboard/Reports/MIS were missing from
the first update and have now been added. Updated the same existing
`.archify/workflow-restaurant-erp-process-flow-20261027-143000/candidate.json`
and `restaurant-erp-process-flow.html` in place again. Preserved all 15
original node IDs and 14 original edge IDs from the very first chart; the map
now has 10 lanes, 41 nodes, 36 edges, 5 guided views (schema caps views at 5 —
merged Shift+Privacy into one view and Tasks/Purchase/Admin/Insights into
another) and 25 explanatory cards.

- Added 4 new lanes: Tasks: Recurring + Delegation; Purchase & GRN; Users,
  Branches & Access; Dashboard, Reports & MIS — one node chain each, matching
  the real current UI flow (Indent→Approve→PO→GRN Quality→Return;
  Recurring/Delegate→Mark Done→Checklist Step; Create User→Module
  Grants→Branch Setup; Dashboard→Reports→MIS Score).
- Labelled honestly per this file's own known gaps: Users/Branches/Grants are
  real DB-backed; Tasks, Purchase & GRN, Dashboard, Reports and MIS Leaderboard
  are still interactive demo UI on `mock-data.ts`, not wired to Postgres —
  cards 22/23/25 say this explicitly, matching the "Known remaining gaps" notes
  already in this file. Did not draw a cross-lane edge from Module Grants to
  Shift Setup after Archify's visual-review flagged it as a 3-bend detour
  across the whole diagram; folded that real relationship into card 24's text
  instead (grants gate Shift configuration to Owner/Branch Admin).
- All 4 Archify gates (validate/deliver/check/browser-check) pass with zero
  diagnostics after fixing: views-count schema cap (5 max), a node-overlap in
  the new Tasks lane (fixed with yOffset spacing), 3 node labels wider than
  their node width (shortened), and the recurring stale browser-check receipt
  ownership conflict (moved the old receipt aside before re-finalizing, same
  pattern as every prior pass on this artifact).
- Verified in a real browser: full-page screenshot shows all 25 cards and a
  zoomed crop of the 4 new lanes shows no overlap/clipping, correct per-lane
  labels, and the legend's node-type counts match the new total.
- This pass only changes chart artifacts; no deployment, migration, commit or
  push was performed by this update.
- (First pass of this chart, superseded above: 6 lanes/26 nodes/21 cards
  covering Order→Recipe/Semi-FG→Stock→Billing/GST→Shift→Privacy only.)

## FULL SYSTEM PROCESS FLOW — hand-built, no Archify (all modules, nothing left out)

User explicitly said no Archify this time, and wanted every module included —
Tasks, Purchase, Users/Branches, MIS/Reports/Dashboard, Workforce, WhatsApp —
nothing missing. Built a new standalone hand-crafted dark-theme HTML artifact
(same visual language as the `architecture-diagram` skill's design system,
written directly, not run through Archify's validator):

`docs/restaurant-erp-full-process-flow.html` (NEW, ~35KB, self-contained,
works fully offline via `file://`, no build step).

- 12 flow lanes, 49 step chips, rendered as plain flexbox rows with → arrows
  (no SVG path routing, so no layout-engine fights): Branch Shift Cycle,
  Branch POS, Recipe/Semi-FG/Kitchen, Inventory & Warehouse, Billing & GST,
  WhatsApp (Thank You + Offer Campaign), Owner Privacy/Accounts, Tasks
  (Recurring + Delegation), Purchase & GRN, Workforce (attendance/leave/
  payroll — new, not in the Archify version), Users/Branches/Access,
  Dashboard/Reports/MIS.
- Each chip is colour-coded by type (frontend/backend/database/security/
  message) with a small legend; cross-lane relationships that matter (e.g.
  Confirm Order → Stock Check, Shift Gate → sale allowed, Module Grants →
  gates Shift Setup) render as a dashed note under the source chip instead of
  a drawn arrow across lanes, kept deliberately simple and accurate.
- 27 explanation cards below the flow, reusing the previously-authored
  Archify card content (1–25) plus 2 new Workforce cards (Attendance+Leave
  real-manager-review rule, Payroll Finalize immutability) — same honesty
  convention as everywhere else in this file: Users/Branches/Grants are real
  DB-backed; Tasks, Purchase & GRN, Dashboard, Reports, MIS Leaderboard stay
  labelled as demo UI on mock data, not wired to Postgres.
- Verified in a real browser: `document.querySelectorAll` confirms exactly
  12 lanes / 49 chips / 27 cards render; full-page and zoomed-header
  screenshots show no overlap, legible text, correct legend/arrow alignment.
- The Archify-generated chart at `.archify/workflow-.../restaurant-erp-process-flow.html`
  was left untouched by this pass — this is a separate, additional artifact.
- No deployment, migration, commit or push was performed by this update.

## CHART RENDER-BUG FIX + SYSTEM REVIEW — text hidden behind cards

User caught a real rendering bug with screenshots: in the connected flowchart,
edge labels and sublabel text were partially hidden behind neighbouring boxes
("card ke peeche text chupp raha hai") — e.g. fragments like "ck re", "chen c"
visible at box edges. Root cause found and fixed, plus a system-wide gap
review as asked.

- **Root cause**: the SVG drew edges+labels BEFORE boxes, so any label whose
  position landed near/under a box got mostly covered, leaving only edge
  fragments peeking out. Also, after the earlier lane reorder (Purchase moved
  next to Inventory), two edges — `Stock Deduct -> POS Receipt` and
  `Payroll Finalize -> Actual Records` — ended up spanning 2 lanes each,
  dragging their labels and paths visibly through an unrelated lane's boxes.
- **Fix**: reordered the SVG so boxes are drawn FIRST and all edges/arrows/
  labels are drawn on top (foreground layer) — labels can now never be hidden
  by a box, by construction. Converted both 2-lane-spanning edges into small
  italic connector notes on each endpoint box instead of a drawn line (same
  "long-distance relationship = annotate, don't draw" rule already used for
  Module Grants -> Shift Setup). Widened the column grid (185px -> 225px) and
  moved same-row (intra-lane) edge labels to float in the lane's own top
  padding instead of sitting on the arrow line at box height, so they never
  crowd a neighbouring box even when adjacent columns are close together.
  Re-verified via real browser + zoomed screenshots across every lane —
  every label and connector note is now fully legible, nothing hidden/cut.
- **System-wide gap review** (`search_files` across `src/` for "not
  wired"/"not connected"/"not implemented"/"TODO"/"not saved to database"):
  confirms every other instance is an intentionally-labelled demo boundary
  already documented throughout this file (Tasks/Dashboard/Reports/MIS/
  Purchase money-tracking/Clone Branch Wizard run on `mock-data.ts`, GST
  auto-split scaffolding in `src/lib/server/gst.ts` not wired into POS yet) —
  not a hidden bug, a deliberate and already-honestly-labelled scope boundary.
  No second silent gap of the "claims a real action but doesn't do it" kind
  (the actual class of bug the GRN fix closed) was found elsewhere in this
  pass. Full regression re-run clean after all edits: `tsc --noEmit
  --incremental false` and `next build` both clean.
- Browser automation (`browser_exec`) hit repeated daemon timeouts during this
  pass for an extra interactive click-through of the changed Purchase page —
  recovered partway through for the chart screenshots, but the Purchase page
  UI itself was NOT re-driven click-by-click this round; its correctness
  rests on the clean `tsc`/build and the real HTTP+Postgres checks from the
  prior GRN-posting pass, not a fresh interactive screenshot. Flagging this
  gap honestly rather than claiming full UI acceptance.
- QA fixtures/server/`.next-reviewqa` dist dir and the disposable QA database
  used for this pass were all cleaned up; `tsconfig.json`/`next-env.d.ts`
  restored to default references again (same recurring gotcha every QA round
  on this project hits — always diff those two files before any commit).

## REAL FEATURE — GRN Quality PASS/PARTIAL now posts to Inventory (known gap closed)

User flagged the known gap called out on the earlier chart ("GRN Quality PASS
— Inventory posting on PASS is not yet wired") and asked it be resolved, not
just documented. Implemented for real, not mocked:

- `src/app/api/inventory/receive/route.ts` (NEW) — `POST { branchId,
  rawMaterialId, qty }`, `INVENTORY` module + same-origin + the shared
  `mutate`/xact-lock pattern every other write uses. Atomically increments
  `inventory_stock.qtyOnHand` for an existing branch+material row, or creates
  it (min/max 0 = not configured) on the first-ever receipt. Never decreases
  stock, never touches min/max par levels.
- `src/app/purchase/page-content.tsx` — the New Purchase dialog's Branch field
  is now a real branch `<select>` (`useBranches()`, same hook Inventory uses)
  instead of free text; store (non-general) purchases now also require a real
  Raw Material select (`GET /api/raw-materials`) and an ordered quantity.
  These carry through PO -> GRN (`src/lib/mock-data.ts` `PurchaseOrderRow`/
  `GrnRow` gained optional `branchId`/`rawMaterialId`/`qty`/`unit` fields).
  Quality Check PASS posts the full received qty; PARTIAL posts
  `received - failQty`; FAIL posts nothing. On success the GRN row gets a
  real "Posted ✓" badge and the toast shows the real new on-hand qty read
  back from Postgres. General purchases (no raw material) correctly post
  nothing and say so. Indent approval, PO money-tracking, and the FAIL/PARTIAL
  vendor-return + Accounts-refund side are still demo-only — only the
  Inventory-posting half of this module is now real, labelled accordingly.
- Verified with real HTTP+Postgres against a disposable QA database
  (`restaurant_erp_grn_qa_20261028`, migrated, dropped after): first receive
  creates a row at 20.000kg, a second receive on the same branch+material
  atomically increments to 25.500kg (not overwritten), zero/negative qty
  rejected 400, unknown branch/material rejected 400, no-auth-cookie rejected
  401 — 7/7 checks passed. Re-read via the real `GET /api/inventory` and
  confirmed the same 25.500kg row is what the actual Inventory page would
  show. QA fixtures, server, `.next-grnqa` dist dir and the QA database were
  all cleaned up after; `tsconfig.json`/`next-env.d.ts` restored to their
  default (non-QA) references same as every prior QA round.
- Full regression: 148/148 unit tests, `tsc --noEmit --incremental false`
  clean, `next build` clean (`/purchase` now includes the new endpoint).

## HAND-BUILT CONNECTED PROCESS FLOW CHART — no Archify, real drawn arrows

User rejected the earlier chip-grid chart ("Archify use na kro... Process Flow
Chart aise chahiye connected") and wanted a genuinely connected flowchart —
real arrows drawn between every box across the whole system, like a classic
process-flow diagram, not isolated per-module groups with text-only
cross-references. Rebuilt `docs/restaurant-erp-full-process-flow.html`
in place (same file, no Archify involved):

- One large hand-computed SVG (Python-generated absolute x/y grid: lane =
  row, step = column) with 49 node boxes and 44 real drawn, arrow-headed
  connections — intra-lane sequential flow AND the cross-lane relationships
  that matter (Confirm Order -> Stock Check -> Stock Deduct -> POS Receipt,
  Shift Gate -> sale allowed -> Confirm Order, GST Invoice -> optional
  WhatsApp Thank You, Payroll Finalize -> Actual Records, and the new GRN
  Quality -> Central WH real-posting edge), color-coded solid/dashed/emphasis
  by edge kind with a legend.
- Reordered lanes so Purchase & GRN sits directly under Inventory & Warehouse
  — keeps the new real GRN->Inventory arrow short and legible instead of
  spanning the whole page. The one genuinely far-apart relationship (Module
  Grants gating Shift Setup, top and near-bottom lanes) is shown as a small
  italic connector note on each of the two boxes instead of one ugly
  page-spanning line — same "don't force an ugly long edge, annotate it
  instead" principle used throughout this project's diagram work.
- Reused the same 27 explanation cards as the chip-grid version, with cards
  8 and 23 rewritten to state the GRN->Inventory gap is now closed (not just
  flagged) and to cite the real verification numbers (20kg create, +5.5kg ->
  25.5kg).
- Verified in a real browser: `document.querySelectorAll` confirms 44 drawn
  edges / 27 cards; zoomed screenshots confirm the Shift Gate->Confirm Order
  and the new GRN Quality->Central WH arrows render short, legible, and
  correctly directed with no overlapping text.
- No commit, push, deploy or production migration was performed by either
  change in this pass; the inventory/receive feature IS new application code
  (not just a chart) and has not been committed — ask before committing.

## LOCAL IMPLEMENTATION — Owner-only operational order visibility

User approved confidentiality only, NOT false official sales. No commit/push/
production migration/deploy authorized. Preserve previous uncommitted Shift/GSTR
work. Contract: `docs/order-visibility-contract.md`.

- Parent implemented `pos_orders.owner_only` default false; generated/reviewed
  additive `0009_tan_loki.sql` (one column). Applied ONLY to disposable QA DB
  `restaurant_erp_recipe_qa_20261027`; checked all 10 ordered migration hashes/
  timestamps match. Main local DB has NOT received 0009; migrate it deliberately
  before using the changed app against it. Production untouched.
- Parent added Owner-role-only PATCH `/api/pos/orders/[id]/visibility`, strict
  boolean + reason, atomic `POS_ORDER_VISIBILITY_CHANGED` audit, idempotent
  same-desired-state no-op. It changes no amounts/status/stock/tax.
- POS GET SQL filters operational rows/totals for all non-Owners; only Owner gets
  ownerOnly flags and actual/visible/private summary. Staff gets visibleTotal and
  access-filtered label. Read shares mutation lock for consistent list+summary.
- GSTR is deliberately UNFILTERED, now gated by OFFICIAL_SALES_REPORTS rather
  than POS_CASHIER; Accounts API/page/nav updated. No grants auto-assigned. Shift
  actual custody remains unfiltered and labelled as actual reconciliation.
- Parent final verification: **148/148 unit/regression tests pass**, full
  `tsc --noEmit --incremental false` and production build pass. Privacy HTTP/PG
  suite **12/12** passed on dev AND freshly built `next start`; shift **24/24**,
  Semi-FG **9/9**, POS **21/21**, BOM **17/17** passed (83 HTTP checks across
  the five suites). Scoped audit-failure trigger proves rollback; concurrent
  desired-state toggles create one audit only. Guide/offline parity passes.
- Real browser screenshots: Owner view shows Actual 1000 / Staff-visible 500 /
  Private 500 and both per-order visibility actions. Staff 390px view shows only
  QA-ORDER-1 / 500, no private row or controls; document width 390 (no overflow).
  Browser action chooser lacked a key, so dialog-click/submit acceptance was NOT
  performed through browser; its logic is exercised by eight UI tests and real
  PATCH HTTP tests. Later browser navigation became unstable; do not claim full
  interactive/multi-device browser acceptance.
- Found pre-existing POS-only cashier menu-read denial during browser QA; fixed
  read-only menu GET to allow own-branch active sellable billing items with
  POS_CASHIER. MENU_BOM-only create/edit authority was not widened. Captured
  RED 403 and GREEN HTTP checks including denied cashier menu writes.
- Both own QA servers stopped, exact HTTP/browser fixtures and temporary audit
  trigger/function removed, scratch session JSON and `.next-qa` removed.
  tsconfig.json/next-env.d.ts diff-clean after restoring default references.
- Guide Book/offline guidance updated for confidentiality vs true official
  accounting, new OFFICIAL_SALES_REPORTS grant, and no retroactive recall of
  prior copies. No external messages sent. Main local DB still lacks 0009;
  production untouched and nothing staged/committed/pushed.

## LOCAL SHIFT MANAGEMENT — implemented, final acceptance gaps (October 27, 2026)

Current working root is `D:\restaurant erp` (older G: references below are historical).
User approved branch shifts + manual blind closing + explicit incoming acceptance.
No commit/push/deployment or production migration is authorized for this stage.

- Added `branch_shifts`, `shift_runs`, `shift_handovers`; additive migration
  `0008_glamorous_mother_askani.sql` was applied to local/QA only during this
  stage. Production remains at the previous deployed migration.
- Owner/Branch Admin with SHIFT_MANAGEMENT configures 1–12 contiguous full-day
  IST windows; admin is own-branch-only. Even a cashier granted that module
  cannot configure windows. Definitions are deactivated, not deleted on edits.
- First run uses the current IST window. Manual Cash Drop closing atomically
  records denominations/variance, closes the run, opens its cyclic successor
  and creates a pending handover. POS and further closing deny until accepted.
- Fixed opening-cash loss: expected closing cash includes accepted incoming
  COUNTED cash plus current run CASH sales. Card/UPI/Other are current-run
  receipt summaries only, never cumulative bank transfers. Paise coins work.
- POS/end/start/config/accept use the existing global auth mutation lock;
  POS eligibility also acquires the shared branch shift lock. No claim of a
  reproduced HTTP race: existing global locking already serialized requests.
- Fixed stale branch/user reads and forms; operational UI fails closed while
  loading/unreadable/pending. Closing result stays visible outside the incoming
  gate. Retained per-tab write journal blocks unknown-outcome duplicate changes;
  no automatic retry/unlock. Administrator reconciliation is required. Scope is
  one tab/session; not a cross-tab protocol, initial cash float/safe withdrawal
  accounting is not implemented. Settings-only due reminder is manual, not cron.
- Parent final full unit/regression suite **135/135 passed**, including retained
  UI stale-response/journal/gating harness and paise-input checks. Parent
  `tsc --noEmit --incremental false` passed after guide sync; `npm run build`
  passed before the final guide-only synchronization,
  with `/admin/settings/shifts` and all new APIs included. Built-app real QA
  HTTP/Postgres suites: shift handover 24/24, Semi-FG 9/9, POS 21/21, BOM 17/17
  (71 checks total). All suite-owned fixtures cleaned in finally.
- Browser: earlier basic DOM configure/start/end/accept lifecycle succeeded.
  Final hardened editor screenshot checked at 390x844, loaded inputs stacked
  correctly and document width exactly 390 (no horizontal overflow). Subsequent
  interactive/other-size acceptance is NOT complete: Jev chooser returned
  `no_key`, then browser daemon refused connection. Do not claim laptop/tablet
  or full hardened UI click-through acceptance. Exact final browser fixture IDs
  were cleaned and scratch session JSON deleted.
- QA dev and production-mode QA servers were stopped after verification;
  own `.next-qa` output removed. Generated tsconfig/next-env references restored.
- Guide Book and standalone HTML synced: 17 bilingual chapters including Shift
  Management, real local Cash Drop and POS acceptance gate. Parent final suite
  verifies full MODULES/EXAMPLES parity and real-write warnings. Contract:
  `docs/shift-management-contract.md`. Remaining acceptance gap is the hardened
  multi-device interactive browser workflow blocked by automation availability;
  no production/deploy claim is made.

## RESUMED — Recipe Builder + real Semi-FG stock (October 27, 2026, same day)

User said "pending kaam shuru kro" — resumed from the paused checkpoint below.
What this pass actually closed, with real evidence:

1. **Missing `menu-workspace.tsx` written** (`src/app/menu/menu-workspace.tsx`,
   NEW) — the file `page-content.tsx` was re-exporting but that didn't exist
   at pause, so `/menu` was a dead route. Assembles the already-partial
   `recipe-builder.tsx` + `production-panel.tsx` + `menu-ui-helpers.ts` into
   one page: item list, Recipe Builder dialog (multi-ingredient, +Add Item,
   remove, searchable raw/Semi-FG rows, HQ-lock badges), recipe view,
   stock/cost preview panel, Semi-FG production panel.
2. **Real bug fixed**: `tests/semi-fg.integration.cjs`'s concurrency check
   passed `undefined` as the `request()` helper's `expected` status arg,
   which resolves to the default `200` — but a first-create concurrent
   production response is legitimately `201`. Fixed to pass `null` (the
   helper's existing accept-200-or-201 path). Confirmed this was a real gap,
   not a false flag, by watching it actually fail before the fix.
3. **Schema drift migration generated**: `semi_fg_stock`, `semi_fg_productions`
   and `menu_items.output_unit` existed in `src/db/schema/*.ts` but were
   never in the committed migration chain — `drizzle/0007_equal_ultragirl.sql`
   (NEW) closes that gap, additive only (2 new tables + 1 new column + FKs/
   indexes), reviewed and applied cleanly to a real Postgres below.
4. **`tests/pos-orders.integration.cjs` rewritten**: the old version still
   asserted the pre-Semi-FG-stock "virtual recursive raw deduction" (selling
   a dish with a Semi-FG component used to deduct that Semi-FG's own butter/
   tomato directly). That's no longer how the system works. Rewrote the
   scenario: sale is blocked 409 until the Semi-FG is actually produced,
   production consumes its own raw, sale then consumes direct raw + the
   produced Semi-FG stock (never the embedded raw again), insufficient
   Semi-FG stock rejects atomically. Also parametrized `BASE_URL`/`APP_ORIGIN`
   (was hardcoded to `localhost:3000`) so it can target an isolated QA app
   port, matching `semi-fg.integration.cjs`'s existing convention. Same
   env-based parametrization applied to `tests/bom.integration.cjs`.

### Real verification performed this pass (not claimed, executed)
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — clean, `/menu` now compiles (9.59 kB route, was a
  dead import before).
- `npm test` — **115/115 unit tests pass** (includes the fixed
  production-quantity/production-policy/menu-ui suites).
- Docker Desktop was found stopped; started it, found the project's
  `restaurant-erp-local-db` container existed but was stopped (volume
  intact) — restarted it, did not recreate/drop it.
- `npx drizzle-kit migrate` against the local dev DB — `0007` applied
  cleanly on top of the existing 6 migrations.
- Created dedicated QA database `restaurant_erp_recipe_qa_20261027` (per
  the original checkpoint's naming), migrated it independently, started an
  isolated `next dev` on port 3911 with `NEXT_DIST_DIR=.next-qa` bound only
  to that QA DB (never touched the main dev DB/port).
- **Real HTTP+Postgres integration suites, run against that isolated QA
  app+DB**: `tests/semi-fg.integration.cjs` **9/9 passed** (auth/grants/CSRF,
  nested Semi-FG blocked without stock, idempotent replay never double-
  writes, POS consumes direct raw + stocked Semi-FG without double-consuming
  embedded raw, shortages roll back every row, inactive components rejected,
  immutable replay survives recipe/name changes, concurrent same-key
  production returns one shared record). `tests/bom.integration.cjs`
  **17/17 passed** unmodified (cycle prevention, explode, cost, delete).
  Rewrote and ran `tests/pos-orders.integration.cjs` — **21/21 passed**
  (blocked-until-produced, production deducts its own raw once, sale
  deducts direct raw + Semi-FG only, no double-deduction, shortage leaves
  stock untouched, exactly 1 order persisted, Semi-FG can't be ordered
  directly).
- **Real browser acceptance** against the isolated QA app (390px bugs not
  re-checked this pass, desktop only): logged in via a disposable QA
  session row (no password typed in the browser tool, per the vault rule —
  generated server-side and injected as a cookie), opened `/menu`, opened
  Recipe Builder, filled dish/branch/price/output unit, searched and picked
  a raw-material ingredient, confirmed live "per 1 output" normalization,
  added then removed a second ingredient row (both worked), saved — "Recipe
  saved." banner, new row appeared in the table live. Clicked View recipe —
  correct component/qty/HQ-locked badge. Clicked Preview stock & cost —
  correctly showed "no vendor rate" cost warning and a Required/Available/
  Shortage table (0.2kg required, 0kg available, 0.2kg shortage) — matches
  the "preview only, not a reservation" contract text verbatim.
- All QA fixtures (test users/branches/items/materials/sessions) were
  deleted from the QA DB after; the QA DB itself was left migrated and
  empty for reuse, same convention as prior sessions. QA dev server and
  `.next-qa` build output were stopped/removed. Did not touch the main
  dev server, main dev DB data, or any other container.
- **NOT run this pass**: `auth.integration.cjs` (its own guard only accepts
  `PGDATABASE` = `restaurant_erp_local` or a workforce-QA name, and no app
  was bound to `restaurant_erp_local` on a free port this pass — this is a
  gap, not a pass, flag before claiming full regression coverage). No
  mobile/390px re-check this pass. No production/Neon migration or deploy —
  not authorized, not attempted.

### Still open before this can be called fully accepted
- No production (Neon) migration applied — `0007` exists locally/QA only.
- Nothing was committed or pushed this pass — ask before doing either.

### Second pass — remaining gaps closed (same day)
User said "baaki gap close kro" after the resume above. Closed all three
items the resume note had flagged as still open:
- **`auth.integration.cjs` full regression**: started the app bound to the
  real (empty, no business data) `restaurant_erp_local` DB on port 3000 in
  an isolated `NEXT_DIST_DIR=.next-authqa` output — **18/18 real HTTP/
  Postgres checks passed** (login, branch isolation, grant delegation,
  session revocation, CSRF, anonymous/forbidden-page denial, DTO safety).
  Stopped that server and removed its dist dir after.
- **390px mobile check on the new Recipe Builder dialog**: logged into the
  QA app via a disposable session row (generated server-side, injected as a
  cookie — no password typed in the browser tool), set a 390×844 mobile
  viewport, opened Recipe Builder — screenshot-confirmed single-column
  fields, a correctly-stacked ingredient row (type/search/select/quantity/
  unit/remove), and full-width Cancel/Save buttons with no clipping or
  horizontal overflow.
- **Guide Book / standalone HTML sync**: the `MENU_BOM` and `POS` entries in
  `src/lib/guide-content.ts` (both languages) and the `/menu` practice
  walkthrough in `src/lib/guide-examples.ts` still described the OLD
  behavior — one-line-at-a-time "Add Item"/"Add Component" BOM editing, and
  POS "explodes the BOM recursively through Semi-FG" at sale time. Rewrote
  both to the real current behavior: Recipe Builder's single atomic
  multi-ingredient save, the Preview stock & cost required/available/
  shortage table, the Semi-FG production panel as the only thing that
  credits real stock, and POS deducting direct raw + already-produced
  Semi-FG only (never that Semi-FG's embedded raw a second time). Synced
  `docs/restaurant-erp-archify.html`'s `MODULES`/`EXAMPLES` JSON blobs to
  match via a small Node script (parses+rewrites the minified JSON, same
  approach as the project's own parity test). `node --test
  tests/guide-examples.test.cjs tests/menu-ui.test.cjs` — **5/5 pass**,
  including the exact-deepEqual standalone/app parity tests.
- **Real bug found and fixed in this verification pass, unrelated to the
  feature**: after several `source .env` calls in the same persistent
  terminal session, `APP_ORIGIN` (and other `PG*` vars) stayed exported and
  leaked into a later plain `npm test` run, flipping one branding CSRF test
  from an expected 400 to a 403 — **not a product bug**, a shell-session
  contamination artifact from this verification work. Unset the leaked vars
  and reran: **115/115 unit tests pass, `tsc --noEmit` 0 errors, `next
  build` clean** (same 26 routes). Flagging this because the same
  contamination risk applies to any future session that chains multiple
  `source .env`-prefixed commands in one terminal — prefer a fresh
  subshell/explicit env override per command instead of accumulating
  exports, or `unset` before a plain `npm test`/`next build` run.

All QA DB fixtures and dev-server/dist-dir artifacts from this pass were
removed again afterward; `restaurant-erp-local-db` container and its two
databases (`restaurant_erp_local`, `restaurant_erp_recipe_qa_20261027`)
were left running/migrated for reuse, same as before. Still nothing
committed/pushed, no production/Neon migration — ask before either.

### Third pass — responsive check across device classes (same day)
User asked that desktop/laptop/tablet/mobile users all get a user-friendly
experience. Screenshot-verified the Recipe Builder + full `/menu` workspace
(item table, recipe view, stock/cost preview) at 5 real viewport widths
against the isolated QA app: 390×844 (phone), 768×1024 (tablet portrait),
1024×768 (tablet landscape/small laptop), 1440×900 (laptop), 1920×1080
(desktop). All five render correctly — no horizontal overflow, no clipped
fields, the ingredient row degrades from the full 6-column desktop grid to
a clean 2-column layout at `sm`/`md` and a single column below that, and
the dialog itself stays sensibly capped at `max-w-5xl` (never stretches
edge-to-edge) on the 1920px desktop shot. No code changes were needed —
this confirmed the existing responsive patterns (from the earlier Mobile
Responsiveness Pass) already cover the new Recipe Builder correctly.
QA fixtures (branch/user/session/dish/recipe) and the QA dev server/dist
dir were removed again after.

## DEPLOYED TO PRODUCTION (same day) — commit 6e58ae8

User explicitly said "Commit+push Deploy kro" after the gaps above were
closed. Before committing, found and fixed two leftover QA-session
artifacts that must never ship: `tsconfig.json`'s `include` array had
accumulated `.next-qa/types/**/*.ts` and `.next-authqa/types/**/*.ts`
entries (Next.js auto-appends these when `NEXT_DIST_DIR` is overridden for
isolated QA runs, never cleans up stale ones), and `next-env.d.ts` pointed
at `.next-qa/types/routes.d.ts` instead of `.next/types/routes.d.ts`. Fixed
both, rebuilt with the default dist dir, confirmed `git diff` on those two
files was empty before staging anything.

- Committed `6e58ae8` to `main` (34 files, the full Recipe Builder + real
  Semi-FG production feature from the sections above). Pushed — Vercel
  auto-deploy triggered per the existing GitHub integration.
- **Vercel's own build command is `npm run db:migrate && npm run build`**
  (`vercel.json`) — this means migration `0007` (adds `semi_fg_stock`,
  `semi_fg_productions`, `menu_items.output_unit`, additive only) ran
  against the live Neon production database as part of this deploy, not a
  separately-approved step. Flagging this because it's a standing risk
  noted earlier in this file ("be deliberate about what lands on main") —
  this push was the user's explicit deploy instruction, not an incidental
  side effect.
- Verified via GitHub's commit status API: Vercel deployment for `6e58ae8`
  is `state: success` ("Deployment has completed").
- Verified via direct `curl` against the live URL
  `https://restaurant-erp-tau.vercel.app`: `/api/setup` →
  `{"setupRequired":false}` (the existing Owner account survived the
  migration, not reset), `/login` → 200, `/` → 307 (auth redirect intact),
  `/menu` unauthenticated → 307 (still gated, not exposed). Did not log in
  with the real Owner account or touch any production business data.
- Did NOT verify the new Recipe Builder UI itself against production data
  (no production login performed) — the build/deploy succeeding and the
  DB migration completing cleanly is the evidence here, not an
  authenticated production click-through. If an authenticated production
  smoke test is wanted, that needs the user's own Owner login, same
  vault-safe convention as every other live-credential step in this file.

## PAUSED AT USER REQUEST — Recipe Builder + real Semi-FG stock (October 27, 2026) — historical, superseded above

This section is the original pause note, kept for history. The "resumed"
section above is the current state — read that first.

### Authorized next-session scope
- One dish/Semi-FG form with multiple searchable ingredient rows, +Add Item,
  remove, Raw Material vs Semi-FG badges, quantities and explicit stock units.
- Yield-aware recipe entry normalized per one output unit; clear recipe view,
  expandable nested Semi-FG, cost/food-cost estimate only when rates exist,
  direct-stock required/available/shortage preview (not a reservation).
- Real Semi-FG production: consume raw/already-produced nested Semi-FG stock,
  credit prepared stock. Sale consumes prepared Semi-FG + direct raw only;
  never deduct embedded raw twice. Recipe save never changes inventory.
- See `docs/recipe-builder-contract.md` for the acceptance/API contract.
- English-default UI with Hinglish option; preserve branch isolation/HQ locks.
- User approved local implementation, NOT a new production migration/deploy,
  commit or push. Do not push main: Vercel build auto-runs DB migrations.

### State actually observed at pause (PARTIAL / NOT ACCEPTED)
- Repo `G:\restaurant erp`, branch `main`, HEAD `de6a7b9` (previous English
  Process Flow Chart commit). All current feature edits are UNCOMMITTED;
  untracked files must travel with this folder, not just a fresh git clone.
- Parent added atomic menu+components POST support, whole-recipe PUT,
  component input validation, same-branch/cycle/HQ-lock checks and shared
  recipe-stock lock in `src/lib/server/recipe-write.ts`, `bom.ts`,
  `/api/menu-items`, `/api/bom-recipes`, `/api/bom-recipes/[id]`.
- Parent extended `/api/bom-recipes/explode` with direct-stock `consumption`
  preview alongside theoretical raw-cost expansion. This is UNVERIFIED and
  depends on the new production schema. Check precision against production
  helper arithmetic; incomplete nested recipes must not yield fake zero costs.
- Agent partial stock backend exists: `src/db/schema/production.ts` exports
  `semiFgStock` / `semiFgProductions`, menu schema adds `outputUnit`, index
  exports production. Helpers `src/lib/server/production.ts`,
  `production-policy.ts`, `production-quantity.ts`; API
  `src/app/api/semi-fg/production/route.ts`; POS order route modified to use
  stocked components. New `tests/semi-fg.test.cjs` and
  `tests/semi-fg.integration.cjs` exist. Inspect rather than re-create blindly.
- Agent partial UI exists: `menu-ui-helpers.ts`, `recipe-builder.tsx`,
  `production-panel.tsx`, and `tests/menu-ui.test.cjs`.
  CRITICAL: at pause `src/app/menu/page-content.tsx` was reduced to
  `export { default } from "./menu-workspace";` BUT `menu-workspace.tsx`
  did NOT exist. UI work was interrupted mid-extraction; /menu is NOT a
  working accepted artifact. Finish that workspace before claiming compile.
- Both implementation agents received stop requests. Delayed child messages
  are interruption reports only, NOT permission to restart implementation.
- No parent-run tests/typecheck/build/browser acceptance performed for this
  changed tree. Historical 109 unit / 110 HTTP checks belong to the PRIOR
  release; they are NOT evidence for the unfinished current feature.
- NO new migration generated/applied. Dedicated loopback database
  `restaurant_erp_recipe_qa_20261027` was CREATED, otherwise not migrated or
  populated by parent. Never drop/recreate an existing DB to resume.
- Existing Docker DB container was healthy at pause, port 127.0.0.1:5436.
  Existing local port 3000 listener was observed but not started/stopped by
  this stage; preserve unrelated/user-owned processes. Parent started NO
  new dev server, build or test job in this stage.
- `next.config.ts` now supports `NEXT_DIST_DIR` (default `.next`), `.gitignore`
  ignores `.next-*/`, enabling isolated QA output without corrupting the
  existing dev server. Recheck tsconfig generated-type includes as needed.
- Production untouched by this stage. Current live app still uses the old
  recursive/virtual Semi-FG raw deduction. Do NOT claim real production stock
  is live. Existing Guide Book/Process Flow Chart have NOT been synced to this
  new, unfinished behavior.

### Exact resume sequence after explicit user instruction
1. Re-read this checkpoint + contract; `git status`, branch and diff. Inspect
   preserved source and any child completion summaries for partial writes.
   No blanket reset/stash/clean, no duplicate implementation.
2. Finish missing UI workspace, reconcile POST/PUT/explode/production payloads,
   explicit output units, same-branch Semi-FG options, idempotent response-loss
   handling, and stale user/branch/request suppression.
3. Inspect stock backend end to end: no recursive raw fallback; empty recipe
   denial, decimal-safe quantities, same lock order, atomic shortages,
   immutable production history, key replay/payload mismatch and no oversell.
   Legacy single-row BOM writes/delete and other stock writers must agree.
4. Write/run focused tests for atomic multi-row creation/replacement rollback,
   HQ locks, duplicates/cycles/branch isolation; finish new test harnesses.
   Existing POS integration expectations of virtual raw deduction need an
   explicit prepared-stock setup + no-double-deduction assertions, not weakened
   assertions. Keep raw-only GST/currency/WhatsApp behavior intact.
5. Generate/review additive migration locally ONLY. Apply against the dedicated
   QA DB using inherited local PG* fields (never print secrets). New Semi-FG
   harness requires PGHOST=127.0.0.1, PGPORT=5436,
   PGDATABASE=restaurant_erp_recipe_qa_20261027,
   SEMI_FG_QA_DATABASE=<same> and explicit BASE_URL to a dedicated QA app port.
   Bind HTTP app to the same DB before writes; inspect harness safety first.
6. Run project unit/typecheck/build and true HTTP+PG suites, then desktop/phone
   browser create -> multi-ingredient save -> reload -> edit -> preview ->
   production -> sale -> stock readback. Use isolated NEXT_DIST_DIR for QA;
   never dev/build concurrently in the same output directory. Clean only own
   fixtures and stop only own QA processes; leave existing app/DB intact.
7. Review settled diff independently; sync in-app/offline guides and client
   process flow honestly, with examples and explicit deferred yield-variance,
   wastage and expiry-lot scope. Update checkpoint with actual evidence.
8. Ask separately before production migration/deployment or commit/push.

## ACTIVE IMPLEMENTATION — expenses, attendance, approved leave and payroll

User requested real Accountant expense inputs and basic attendance payroll.
Confirmed monthly per-day basis: actual calendar days (28/29/30/31).
Latest correction: NO WEEKLY OFF concept. Leave Apply form -> different
manager review Approve/Reject. Only approved paid ON_ROLL leave is paid;
OFF_ROLL earns worked days only. Missing attendance blocks payroll final.
Detailed acceptance/API contract: `docs/accounts-workforce-contract.md`;
workforce backend notes: `docs/workforce-api-notes.md` when available.

Three bounded agents implement expenses/P&L backend, workforce backend and
shared UI in parallel. Parent shared changes: ACCOUNTANT branch role,
ACCOUNTS_EXPENSES/PAYROLL/ATTENDANCE/LEAVE_APPROVAL/LEAVE_SELF grants, nav
and page permissions; 13 auth tests passed. Guide content/examples updated
for the new flows with 13 chapters, but implementation is NOT yet accepted
or deployed. Do not mistake these staged guide entries for verified live
features until the gates below pass.

Remaining parent gates: settle agent interfaces; export new schemas; generate
additive migration; apply to dedicated loopback DB
`restaurant_erp_workforce_qa_20261022` (already created, initially empty);
run all focused tests, true HTTP+PG suites and browser workflows; review
branch leakage, leave double count, missing attendance, immutable/idempotent
payroll, rate history and no mock profit blending. Then apply approved
additive migration to production BEFORE deploying code. No expense/payroll
fixtures or statutory/bank-payment behavior are authorized on production.
No new finance migration has been generated/applied yet at this checkpoint.

## CURRENT BRANDING + PRACTICAL GUIDE CHECKPOINT

Restaurant branding is persisted chain-wide in the existing `settings` table:
`RESTAURANT_NAME` and normalized `RESTAURANT_LOGO` only. No schema migration.
First Owner setup requires restaurant name and accepts optional PNG/JPEG/WebP
logo. Owner + branding + session save atomically under existing bootstrap lock.
Existing Owners use `/admin/settings/restaurant` to edit name, replace/remove
logo; this page/API is Owner-only. Desktop/mobile brand, login, browser title
and favicon use saved branding; the `ERP + WhatsApp` subtitle is removed.
No production restaurant name/logo has been invented or set by the assistant.

Uploads: at most 1 MB, strict MIME/signature, no SVG/animation, max 4M decoded
pixels, sharp re-encodes metadata-free PNG <=256px /128KB. PNG base64 lives in
Postgres, not Vercel ephemeral disk. Public branding/logo endpoints intentionally
expose only branding allowlisted keys, never ChatXFlow/provider configuration.
Logo URL includes content hash; changing branding updates sidebar/title/favicon.
Default API body limit remains 16KB; only setup/branding opt into bounded larger
streaming body reads. `sharp` is a direct dependency.

Guide Book: all 12 module chapters have bilingual scenario + four exact practice
steps + expected result (`src/lib/guide-examples.ts`). Static HTML embeds the same
data and an automated parity test prevents drift. Examples are instructions,
not auto-created records; real-write examples warn to use a test branch/account,
and demo examples state their persistence limitations. Owner sees an additional
restaurant-branding walkthrough. Both in-app and offline guide updated.

Parent verified: 42 unit/regression checks; 18 existing real HTTP/Postgres auth
checks; 9 branding HTTP/Postgres checks in isolated loopback DB
`restaurant_erp_branding_qa_20261022` (migrated existing schema, no real data),
including first-owner rollback on invalid logo AND forced DB failure, public
DTO token isolation, same logo/favicon bytes, owner update and removal, denied
anonymous/manager/CSRF writes. Real browser upload/preview/save/reload confirmed
brand+favicon, login branding and no old subtitle. All 12 guide examples in both
languages checked in authenticated app and offline guide (24 combinations each).
Final production build/typecheck passed. Temporary QA user/session/settings and
scratch session file cleaned; isolated QA database retained empty for reuse.
Deploy this checkpoint through existing GitHub→Vercel pipeline and verify Ready
before reporting live. Existing eight domain modules remain interactive demos.

## CURRENT UI CHECKPOINT — bilingual preferences and navigation

English is the default UI language; Hinglish is selectable from the header
and login/setup screens. Preferences persist per browser in localStorage,
not per account or database. Four palettes: Amber (light), Dark, Blue,
Emerald. Controls also work at 390px width. In-app Guide Book and standalone
`docs/restaurant-erp-archify.html` now explain both languages/themes and the
honest 4 Live DB / 8 interactive-demo boundary. Offline guide preferences
are independent from app preferences. Business names/IDs/input values are
not translated.

Login/setup and user administration use a 10-digit Indian mobile field,
without +91. Shared server `phone()` normalizes to the existing +91
identifier so accounts/passwords, uniqueness and WhatsApp integration remain
compatible; existing E.164 API callers still work. No account migration or
password reset needed.

Blank navigation fix: Next Links replace shell document reloads; safe
server identity hydrates client consumers immediately. Refresh has a shared
lifecycle, coalesces concurrent calls and times out after 8 seconds per
attempt (one retry), then fails closed with Retry. Critical follow-up:
App Router root layouts are cached during Link navigation. Every protected
`page.tsx` is now a dynamic server wrapper calling `protectedPage()` with
its own route before rendering adjacent `page-content.tsx`. The guard
rechecks live identity and permissions and owns demo/denial notices. Do not
move these guards back into root layout or rely on a client branch selector.
Root layout retains initial authentication as defense-in-depth only.

Parent verification: `npm test` 29 passed; real local HTTP/Postgres suite
18 passed including 10-digit login to an existing +91 account; full build
and project typecheck passed. Real authenticated browser: all 13 module
routes plus a report detail navigate without document reload/verification
blank; demo banner disappears on Inventory/Guide and appears on demo routes.
An isolated QA Owner narrowed to Cash Drop was denied Inventory through an
already-visible client Link (no Add Item controls), and Guide narrowed to
one card. Four themes, preference reload, English/Hinglish and 390px layout
were checked. No Neon records, real user passwords or provider settings were
changed during this pass. Temporary QA user/session is removed after QA.

Deployment parent-verified: feature commit `85e3013` pushed to main; Vercel
production deployment `dpl_DfZpAQ8vLnCdz8fPQt1eSU1jkZoB` Ready and GitHub's
Vercel status success. Public alias `https://restaurant-erp-tau.vercel.app`
checked in a real browser: English-default 10-digit login, Hinglish switch
and Dark theme work. Authenticated navigation was tested locally with QA
fixtures, not the user's production credentials. QA user/session and scratch
session file removed. Existing business persistence gaps remain unchanged.

## CURRENT LOCAL IMPLEMENTATION CHECKPOINT — branch isolation

User confirmed local PostgreSQL now, VPS migration later. Permission contract:
Owner manages all branches/users and compiled reporting; Branch Admin
(BRANCH_MANAGER) manages only own branch and can delegate no more than own
grants; ordinary users need both own branch and permitted module/action.
Guide Book and standalone HTML must reflect verified implementation, not demo claims.

Local infrastructure parent-verified: dedicated Docker container
`restaurant-erp-local-db`, Postgres 16, loopback-only `127.0.0.1:5436`,
database `restaurant_erp_local`, user `restaurant_app`, persistent Docker volume
`restaurant_erp_local_pgdata`. Fresh database, no real business records imported.
Private `.env` stores split PG fields; `.gitignore` added. Never print credentials.
Existing unrelated Postgres on 5432 and other project containers left intact.
Docker Desktop startup also auto-started existing restart-policy containers.
`npm run db:migrate` actually succeeded; information_schema count: 40 public tables.
Drizzle config now uses separate credential fields + local `ssl:false`; inherited
SSL settings initially caused failure, corrected and migration rerun successfully.
No Git repository exists in this working folder (git status fails); ignore file
is prepared but cannot yet be verified with git check-ignore.

Auth foundation implemented and parent-verified: additive sessions migration generated
and applied (41 tables); `node --test tests/auth.test.cjs` 11 passed;
`node tests/auth.integration.cjs` 18 real HTTP/Postgres checks passed, including
two-branch users/stock separation, foreign ID denial, grant escalation denial,
session revocation/logout, owner compiled inventory, CSRF, anonymous direct page
redirect and forbidden page content suppression. QA fixtures cleaned in finally.
WhatsApp settings API now Owner-only; old unauthenticated TODO closed.
Server root page gates use middleware-overwritten pathname and live DB identity.
Persisted routes: branch/user admin, inventory, provider settings and guide.
Other demo business screens temporarily show an explicit DB-integration-pending
panel rather than exposing cross-branch mock records. Their domain integration
is still pending, NOT silently accepted as complete. Login landing changed /guide.
### Guide Book + standalone HTML updated to real status (this session)
Both `/guide` (in-app) and `docs/restaurant-erp-archify.html` (standalone)
now carry a per-module `status: "live" | "pending"` badge — green "Live DB"
on Inventory, Users & Access, Branches, WhatsApp Settings (the 4 modules
that actually run against the dedicated local Postgres with real branch
isolation + grant-scoped delegation today); amber "Pending" on Dashboard,
Reports, MIS Leaderboard, Tasks & Checklists, Purchase & GRN, POS/Cashier,
Blind Cash Drop, Accounts (still `mock-data.ts` placeholders — the running
app shows these as an explicit "DB integration pending" panel after login,
never fake branch-filtered numbers). Content for the 4 live modules was
rewritten to describe the REAL behavior (Owner all-branch + HQ-role create,
Branch Admin own-branch-only + can't exceed own grants + can't self-edit,
password change revokes old sessions) instead of the old demo-switcher
story. Verified live in both places via `browser_exec` screenshots — badges
render correctly, in-app `/guide` uses `hasCurrentModule()` (Owner bypass
safe) instead of a raw array `.includes()` so an Owner with an empty/odd
moduleAccess array still sees every live module.

### Remaining real work (explicitly NOT done yet)
- Dashboard/Reports/MIS/Tasks/Purchase/POS/Cash-Drop/Accounts still need
  their own schema-backed API routes + branch-scoped queries + UI rewiring,
  same pattern as Inventory/Users/Branches. This is a comparable amount of
  work per module — treat each as its own bounded stage with its own
  integration test script (follow `tests/auth.integration.cjs`'s real
  HTTP+Postgres pattern, not just unit tests) before calling it done.
- Password for the live Owner account ("Manoj") was typed into chat by the
  user and is now compromised — user has deferred changing it; remind again
  before this goes anywhere internet-reachable or before a second real user
  is onboarded. Change is self-service via Users & Access → Edit own row.
- No VPS changes made — still local-only Docker Postgres, per user's
  explicit "abhi local rakho, baad mein VPS shift karenge" instruction.

## LIVE DEPLOYMENT — Neon + Vercel (for client demo)

User asked to deploy for client demo: Neon (managed Postgres) + Vercel hosting.

- **GitHub**: pushed to `github.com/Mking697/Restaurant-ERP` (currently PUBLIC —
  user created this repo themselves; flagged that it's public since the repo
  contains full business logic/schema, offered to make it private, user
  hasn't responded yet — revisit before sharing the repo link anywhere).
- **Neon Postgres**: project `restaurant-erp` (id `wild-glade-34334923`),
  org `org-sparkling-dream-15526287` (account nantultiwari697@gmail.com,
  authenticated via `neonctl auth` device flow — NOT the Claimable/no-signup
  path, so this is a permanent project, no 72h expiry). Region
  `aws-ap-southeast-1`. Schema migrated with `drizzle-kit migrate` against
  the DIRECT (non-pooler) host — 41 tables, verified via
  `information_schema.tables` count. Fresh/empty database — no business
  records, `/api/setup` correctly reports `setupRequired: true`.
- **`drizzle.config.ts` / `src/db/client.ts`** — both gained a `PGSSLMODE`
  env var (`"require"` → `ssl: true`/`{rejectUnauthorized:true}` for Neon,
  default `"disable"` → `ssl:false` for local Docker Postgres). Keep this
  pattern in sync between the two files, same as the existing PG*-split
  convention (never a composed `scheme://user:pass@host` literal written to
  any file — still true for Neon credentials, same Windows AV/DLP redaction
  risk as local).
- **Vercel**: project `restaurant-erp` under team
  `manojs-projects-30be2a32`, auto-connected to the GitHub repo at link time
  (future pushes to `main` will auto-deploy — confirm this is desired before
  merging anything experimental to `main`). Production env vars set via
  `vercel env add ... production`: `PGHOST`, `PGPORT`, `PGUSER`,
  `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE=require` (all marked Secret/hidden
  in `vercel env ls`, never printed to chat). `APP_ORIGIN` NOT set — Vercel's
  edge correctly reflects the public hostname in `request.url` (unlike the
  self-hosted-behind-nginx case this project's other skill warns about), so
  the CSRF same-origin check's `new URL(request.url).origin` fallback is
  accurate here; revisit only if a custom domain + proxy layer gets added.
- **Deployment Protection**: Vercel's default `ssoProtection` ("all except
  custom domains") was blocking anonymous/client access behind a Vercel
  login wall — disabled via a direct `PATCH
  https://api.vercel.com/v9/projects/restaurant-erp` call (`ssoProtection:
  null`) using the CLI's own stored token (never printed). This is the
  single most important step for a client-facing demo link; if the project
  is ever relinked/recreated, re-check `vercel.com → project → Settings →
  Deployment Protection` is off, or the client will just see a Vercel login
  wall instead of the app.
- **Live URL**: `https://restaurant-erp-tau.vercel.app` — verified via
  `curl` (`/api/setup` → `200 {"setupRequired":true}`, `/login` → `200`) AND
  a real `browser_exec` screenshot showing the "Create the first owner"
  setup screen. No owner account created on production yet — that's the
  client's/user's first action once they're ready to demo.
- **Local dev untouched**: local Docker Postgres (`restaurant-erp-local-db`,
  port 5436) and its `.env` are completely separate from this Neon database
  — local dev work does not affect the live demo, and vice versa, until
  someone explicitly re-runs migrations against Neon.

### Resume checklist for next deployment-related session
1. Ask whether the GitHub repo should go private.
2. Decide the first production Owner credential path the same way local did
   (never type a password yourself — user sets it themselves on the live
   `/setup` page, same vault-safe flow as the local walkthrough).
3. If a custom domain gets added later, re-verify the CSRF `APP_ORIGIN`
   assumption above still holds.
4. Every push to `main` now auto-deploys to this same Vercel project —
   be deliberate about what lands on `main` from here on.

### CLIENT DEMO MODE — dummy data live on production (this session)

User asked to seed every module with dummy data so the WHOLE app looks and
works for a client walkthrough, with an explicit promise to clear it before
real go-live. Two changes shipped:

1. **`src/app/layout.tsx`** — the previous hard "DB integration pending"
   block (full-page, replaced `children` entirely) is now a **non-blocking
   amber banner** rendered above the page's own content for any path that
   isn't yet DB-migrated (`isPersistedPath()` false — still Dashboard,
   Reports, MIS, Tasks, Purchase, POS, Cash Drop, Accounts). Those pages'
   already-built interactive UI (dialogs, Mark Done, GRN quality check, POS
   New Order, etc. — all from earlier sessions, running on `mock-data.ts`)
   now actually renders and is clickable for a live demo, instead of being
   hidden behind the pending screen. **To revert**: swap the `<>...banner +
   children</>` branch back to the old full-block `<AppShell>...pending
   message...</AppShell>` (git history on this file has the exact prior
   version) once each module gets its own real DB migration — don't leave
   the banner in place after modules go live, or it'll look unfinished.
2. **`scripts/seed-demo.cjs`** (NEW, committed) — idempotent direct-SQL seed
   against whatever `PG*` env vars it's run with (safe to point at Neon or
   local Docker). Seeds on the REAL/live-DB modules only (Branches,
   Inventory — the mock-data modules need no seeding, their rows are
   already hardcoded in `src/lib/mock-data.ts`):
   - 6 branches (B1 Connaught Place … B6 Rohini) matching the
     `mock-data.ts` `BRANCH_NAMES` naming so the (still-mock) Dashboard/
     Reports/etc. branch names line up with the (now-real) Branches page.
   - 5 raw materials × 12 branch-scoped `inventory_stock` rows, deliberately
     including 2 low-stock rows (below `minStockLevel`) and 1 near-max row
     so Inventory's alert badges have something real to show.
   - 3 demo staff users (Rahul Sharma/Priya Nair as `BRANCH_MANAGER` on
     different branches, Amit Kumar as `CASHIER`) — **fixture accounts
     only**, phones `+91987650000{1,2,3}`, random 12-char passwords
     generated by the script itatself via `hashPassword()` (same helper the
     real auth routes use) — these are NOT anyone's personal login, they
     exist purely so the client demo can show role/branch-scoped access by
     actually switching accounts. Rotate or delete these before any real
     second user is onboarded on this project; re-run the script with
     `DELETE FROM users WHERE phone_e164 LIKE '+919876500%'` first if
     starting over.
   - Idempotent: every insert is preceded by an existence check on a
     natural key (branch `code`, material `name`, `(branch_id,
     raw_material_id)` pair, `phone_e164`) — safe to re-run after this
     session without creating duplicates.
3. **Real bug found and fixed while seeding**: `/api/setup`'s
   `setupRequired` check was `SELECT ... FROM users LIMIT 1` — "any user
   row at all" — so seeding the 3 demo staff BEFORE the real Owner existed
   permanently locked the live `/setup` page with `409 Setup already
   completed`, even though no Owner had been created yet. Fixed in both the
   `GET` (setupRequired flag) and `POST` (bootstrap guard) to filter
   `WHERE role = 'SUPER_ADMIN'` instead — correct semantics regardless of
   the demo-seeding trigger (an Owner should always be creatable if none
   exists yet, even with other rows already in the table). Verified live:
   `/api/setup` → `{"setupRequired":true}` again, `/setup` page loads the
   "Create the first owner" form correctly post-fix.
4. Live Owner account is still NOT created on production — the user (or
   whoever demos to the client) creates it themselves via `/setup`, same
   vault-safe convention as local (assistant never types/sees the
   password).

**Before real go-live**: delete the 3 demo-staff rows, clear the seeded
Inventory/Branches rows if they don't match the client's real branches, and
flip the `layout.tsx` banner branch back to a hard block (or, better,
finish migrating each remaining module to the real DB so the branch
disappears entirely rather than needing to be reverted).

- Phase 1 (Archify architecture diagram): DONE, verified, all gates passed.
- Phase 2 (DB schema): DONE — rewritten in Drizzle (was Prisma), VALIDATED via
  `npx drizzle-kit generate` (37 tables, 0 errors, migration SQL emitted).
  `npx tsc --noEmit` also clean across schema + lib + API route files.
- Phase 3 (Backend API + WhatsApp webhook + cron jobs): STARTED — ChatXFlow
  WhatsApp integration wired (see "ChatXFlow integration" section below).
  Everything else in Phase 3 still NOT STARTED.
- Phase 4 (Frontend dashboard): STARTED — core screens + charts built with
  shadcn/ui-style components + Recharts (21st.dev Magic MCP unavailable in
  this Hermes setup, user approved this substitute; see "Phase 4" section).

---

## PHASE 4 — FRONTEND DASHBOARD — ⚠️ STARTED

**21st.dev "Magic" MCP server was requested but is NOT connected in this
Hermes setup** (only agency_agents/computer_use/cronjob/terminal-type
deferred tools are available — confirmed via `tool_search`, no 21st.dev
match). User explicitly approved the fallback: build the frontend with the
SAME component system Pro ERP already uses — shadcn/ui (`new-york` style) +
Tailwind v4 + Radix primitives + `lucide-react` icons + `recharts` for
charts — hand-written rather than pulled from the shadcn CLI registry (no
network registry fetch available), same visual/API contract either way. If
21st.dev access becomes available later (API key), components can be
regenerated through it without changing any page — they'd still land in
`src/components/ui/*` with the same props.

### What's built
- **Design system**: `src/app/globals.css` (Tailwind v4 `@theme inline` +
  OKLCH tokens) — warm amber/charcoal brand palette, deliberately different
  from Pro ERP's neutral palette so the two apps are visually distinguishable
  even though they share the same component code. Light + dark CSS variables
  both defined (`.dark` class toggle, no toggle UI wired yet).
- **Primitives** (`src/components/ui/`): `button.tsx`, `card.tsx`,
  `badge.tsx`, `table.tsx`, `tabs.tsx`, `progress.tsx` — same
  `cva`/`class-variance-authority` variant pattern as shadcn/ui.
- **Shell**: `src/components/app-shell.tsx` (sidebar nav driven by
  `src/lib/nav.ts` `NAV_ITEMS`, which mirrors `src/lib/moduleAccess.ts`
  `MODULE_KEYS` — add a module there and its nav entry here, not in two
  places) + branch selector in the topbar (`src/lib/nav.ts` `BRANCHES`,
  currently local state only, not yet filtering any page's data — wire that
  in Phase 3 once real queries exist).
- **Charts** (`src/components/charts/charts.tsx`, Recharts): revenue trend
  (area), prime-cost-% trend (line), MIS leaderboard (horizontal bar),
  branch revenue (bar), order-channel split (donut). All themed off the
  `--chart-1..5` CSS variables, not hardcoded hex, so a future palette change
  is one `globals.css` edit.
- **Pages** (all under `src/app/`, Next.js App Router):
  - `/dashboard` — Owner Dual Dashboard: 4 KPI cards, revenue trend +
    channel-split charts, branch revenue bar chart, pilferage watch list,
    full branch drill-down table.
  - `/reports` — report picker grid (6 reports).
  - `/reports/[report]` — dynamic route, one `ReportBody` switch per slug:
    sales-trend (2 charts), mis-scorecard (chart + table), food-cost,
    inventory-variance, cash-reconciliation, aggregator-recon (each a
    themed table with conditional badges). Excel-export button present but
    not wired (TODO Phase 3, same convention as Pro ERP's
    `/api/analytics/export?range=...`).
  - `/performance` — MIS leaderboard (bar chart + ranked table).
  - `/tasks` — recurring + one-time task board with status badges.
  - `/inventory` — stock table with low-stock/high-value flags.
  - `/cash-drop` — blind denomination-entry screen; **expected cash is
    never shown pre-submit**, matching the schema's own
    `cashDrops.expectedCashInr` API-layer rule.
  - `/admin/users` — user list + create/edit panel with role select AND
    `moduleAccess` checkboxes sourced live from `MODULE_KEYS` (18 keys) —
    this is the concrete UI for Phase 2's access-control gap fill.
  - `/admin/settings/whatsapp` — real working form against the
    `/api/admin/settings/whatsapp` route built for ChatXFlow (GET loads
    masked token, POST saves) — this one is NOT mock, it actually calls the
    DB-backed API (will error until Postgres is actually connected, see
    Phase 2 resume checklist).
- **Data**: `src/lib/mock-data.ts` — every function is shaped EXACTLY like
  the eventual Drizzle query result for that screen (see each interface),
  so swapping a function body for a real `db.select()...` is a drop-in
  replacement, not a page rewrite. Nothing here reads Postgres — there's no
  DB connection yet (Phase 2 resume checklist item 1 still pending).

### Validated this session
- `npx tsc --noEmit` — 0 errors (one real bug fixed: `Button`'s `render`
  prop typing against `React.cloneElement` needed an explicit
  `React.ReactElement<{ className?: string }>` generic, not a bare
  `ReactElement`).
- `npx next build` — compiled clean, 19 routes (6 of them the static
  `/reports/[slug]` pages via `generateStaticParams`).
- Visually verified via `browser_exec` + screenshots against a real
  `next start` server: dashboard charts, reports grid, a report detail page,
  MIS leaderboard, tasks board, cash-drop screen, users/access screen all
  render correctly with real chart data (confirmed via raw SVG path
  inspection for the MIS bar chart, not just a screenshot glance — the bars
  DO scale correctly, 93.1 vs 61.8 renders as 263px vs 172px).
- **Bug found and fixed in review**: Tailwind CSS Grid's implicit
  `min-width: auto` on `1fr` tracks let the `/admin/users` table blow out
  the page horizontally when the edit panel was closed. Fixed by using
  `minmax(0,1fr)` instead of a bare `1fr` column + `min-w-0` on the card and
  on `app-shell.tsx`'s main content wrapper. **If any future page has a wide
  table inside a CSS grid column, apply the same `minmax(0,1fr)` + `min-w-0`
  pattern up front** — don't wait for it to show up as a horizontal
  scrollbar again.

### NOT done yet (explicitly out of scope this session)
- No real Postgres connection — every page except `/admin/settings/whatsapp`
  reads `src/lib/mock-data.ts`, not the DB.
- No auth/session layer — nothing gates any page or the settings API route
  (see the chatxflow section's TODO).
- Branch selector in the topbar doesn't filter any page's data yet.
- Excel export buttons are inert.
- No dark-mode toggle UI (the CSS variables exist, nothing flips the `.dark`
  class).

### Remaining pages added in the follow-up pass (same session)
All five previously-404ing nav items now have real pages, same
`AppShell`/`PageHeader`/`Card`/`Table`/`Tabs` pattern as everything else:
- `/checklists` — flat view over `checklistRuns` (step-level rows); a richer
  "group by instanceId, show the chain visually" UI is a good Phase-4-part-2
  upgrade once real data exists, not needed for the mock-data stage.
- `/purchase` — tabbed (Indents / Purchase Orders / GRN), indent spike %
  badge turns destructive above 25% (matches the schema's own spike-approval
  threshold).
- `/pos` — live order list across DINE_IN/TAKEAWAY/SWIGGY/ZOMATO channels.
- `/accounts` — tabbed (Petty Cash / Aggregator Recon / Branch P&L), petty
  cash amount badge turns destructive if it exceeds `dailyCapInr`.
- `/admin/branches` — branch list + Clone Branch Wizard button (UI only,
  wizard flow itself not built — that's a real multi-step form, do it as its
  own task when Phase 3 branch-clone API exists).
Re-verified after adding these: `npx tsc --noEmit` 0 errors, `npx next
build` 24 routes 0 errors, `/purchase` tabs screenshot-checked live.

Nav is now fully wired — every item in `src/lib/nav.ts` `NAV_ITEMS` has a
matching page, nothing 404s anymore.

### Button audit + fix pass (user-reported: "New Branch" and others did nothing)
User caught a real gap: most action buttons across the app were visually
present but inert (no `onClick`, server components with no interactivity).
Audited every page with `grep -rln "Button\|onClick" src/app` and fixed all
of them — every button now does something real against client-side state
(not the DB — there's still no Postgres connection, see below).

**New shared pieces added to support this:**
- `src/components/ui/dialog.tsx` — Radix `Dialog` wrapper, shadcn
  conventions. Use `<DialogTrigger asChild><Button>...</Button></DialogTrigger>`
  — Radix's own `asChild`, NOT this project's custom `Button` `render` prop
  pattern (those are two different mechanisms; don't mix them up, this was
  the actual TypeScript error hit and fixed this session).
- `src/components/toast.tsx` — `useToast()` hook, dependency-free
  bottom-right toast stack, 3s auto-dismiss. Used for "created"/"saved"
  confirmations everywhere a dialog submits.
- `src/lib/csv-export.ts` — `downloadCsv(filename, rows)`, pure client-side
  CSV blob download, opens fine in Excel. Every "Excel export" button was
  renamed to **"Export CSV"** so the label matches what's actually shipped —
  a true `.xlsx` export is a real Phase 3 backend job (streamed
  ExcelJS-style generation), not something to fake client-side under a
  misleading label.
- `src/components/export-button.tsx` — tiny client component wrapping
  `downloadCsv`, used by the (still server-component) `/reports/[report]`
  page so that page doesn't need `"use client"` just for one button.

**Per-page fixes** (each converted to `"use client"` where it wasn't
already, each dialog-submit appends to that page's own `useState` list +
fires a toast):
- `/admin/branches` — **New Branch** (blank branch form) and **Clone
  Branch** (pick source template branch + new code/name) both now add a
  real row to the table. This is the exact bug the user screenshotted.
- `/tasks` — **New Recurring** (frequency D/W/15D/M/Q/Y + shift time) and
  **Delegate Task** (one-time, assignee + due) both add a row.
- `/checklists` — **New Template** adds a Step 1 row (multi-step builder
  UI is a Phase-3-part-2 item, not re-attempted here).
- `/inventory` — **Raise Indent** opens a dialog (raw material dropdown
  sourced from the inventory table itself + branch + qty); submits a toast
  rather than mutating Inventory's own table, since the indent actually
  belongs on the Purchase page — see the note in that file.
- `/purchase` — **Raise Indent** adds a real `DRAFT` row to the Indents tab.
- `/pos` — **New Order** (channel/table/amount/tender) adds a row.
- `/performance` and `/reports/[report]` — **Export CSV** downloads the
  page's actual on-screen data as CSV (not a stub).
- `/admin/users` and `/cash-drop` — already worked before this pass (not
  touched; confirmed still fine).
- `/admin/settings/whatsapp` — already a real DB-backed API call (not
  touched).

### Real bug found and fixed during verification: CSS 404 after `next build`
While visually verifying the fixes, the running `next dev` background
server's CSS started 404ing. Root cause: **running `npx next build`
overwrites the SAME `.next/` directory a concurrently-running `next dev`
instance depends on** — both default to `.next` as the output dir, and they
are not safe to run against each other. The dev server's hot-reload module
graph gets corrupted (stale JS chunk references, missing CSS).
**Rule for future sessions on this project: never run `next build` while a
`next dev` background process is live on the same working directory.** If
you need to verify a production build, either (a) stop the dev server
first, build, verify, then restart dev, or (b) build into a different `-d
.next-build` output dir (needs `next.config.ts` `distDir` set). This
session used (a): kill dev → `rm -rf .next` → restart dev.

### Verified after the fix pass
- `npx tsc --noEmit` — 0 errors (after fixing the `DialogTrigger
  render={...}` → `DialogTrigger asChild` mistake across 8 occurrences in 6
  files, done with a small Node regex script since it was the same
  mechanical fix repeated identically).
- `npx next build` — clean, same 24 routes.
- Live-verified via `browser_exec` against a freshly-restarted `next dev`:
  New Branch dialog opens, form submits, **B7 — Vasant Kunj row actually
  appears in the table** (not just a toast) — confirmed by screenshot.
  Raise Indent dialog on `/purchase` also confirmed opening correctly.

---

## MOBILE RESPONSIVENESS PASS

User will use this ERP on both desktop and phone — audited and fixed.

### Critical gap found: no way to navigate on mobile at all
`app-shell.tsx`'s sidebar was `hidden md:flex` with **no mobile
replacement** — below the `md` breakpoint the entire left nav vanished and
there was nothing to open it with. On a phone this ERP was unusable beyond
whatever page you landed on directly. This was the single most important
fix in this pass.

### Fix: hamburger + slide-over drawer
- `src/components/ui/sheet.tsx` (NEW) — left-anchored slide-over drawer
  built on the same `@radix-ui/react-dialog` primitive as `ui/dialog.tsx`
  (full focus-trap/escape/overlay-click for free), styled differently
  (`inset-y-0 left-0 w-72`, slide-in transform instead of center-fade).
  **Lesson learned mid-build**: `tailwindcss-animate` (the plugin that
  backs shadcn's usual `animate-in`/`slide-in-from-left`/`fade-in-0`
  utility classes) is NOT installed in this project. Using those classes
  compiles with zero errors but silently does nothing at runtime — no
  animation, easy to miss in a quick glance. Fixed by hand-rolling the
  transition with plain Tailwind (`transition-transform duration-200
  data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0`),
  which needs no plugin. Also retrofitted onto `ui/dialog.tsx`'s overlay
  fade for the same reason. **If any future component reaches for
  `animate-in`-family classes, either install `tailwindcss-animate` first
  or use this same manual-transition pattern — don't assume it's there.**
- `app-shell.tsx` rewritten: `NavList` extracted as a shared component so
  the exact same nav (icons, active-state highlight, labels) renders both
  in the desktop `<aside>` and inside the mobile `<Sheet>` — one source of
  list, not two copies that can drift. A hamburger (`lucide-react` `Menu`
  icon) button appears only `md:hidden` in the header; clicking it opens
  the drawer (plain controlled `useState`, not a Radix `Trigger` — see the
  build-breaking mistake below). Tapping a nav link inside the drawer both
  navigates AND closes the drawer (`onNavigate` callback clears
  `mobileNavOpen`).
- Header compacted on mobile: branch-selector `<select>` shrinks
  (`max-w-[9.5rem]` + smaller text/padding below `sm`), the "Viewing: ..."
  label now needs `lg:` (was `sm:`) to show — it was still clipping/
  crowding the header on a 390px-wide phone at the old `sm:` threshold.
  `main`'s padding drops to `p-3` below `sm` (was a flat `p-4 md:p-6`).

### Real build-breaking bug found and fixed: `DialogTrigger`/`SheetTrigger` outside its `Root`
First attempt wired the hamburger button as `<SheetTrigger asChild><button
.../></SheetTrigger>` sitting in the header, with `<Sheet>...<SheetContent>`
declared separately elsewhere in the same component's JSX. Radix's
`Trigger` reads React Context from its `Root` ancestor — **it must be a
JSX descendant of `<Sheet>`/`<Dialog>`, not just "present somewhere on the
page"**. This didn't fail `tsc` or `next build`'s compile step; it failed
at **prerender time** with `Error: DialogTrigger must be used within
Dialog`, and confusingly pointed at `/admin/settings/whatsapp` (an
unrelated page) because Next.js prerenders routes in an order where that
page's static generation happened to surface the shared-component error
first. Fixed by dropping the `Sheet`/`Trigger` pairing entirely for this
specific case — since the drawer's open state was already a plain
controlled `useState` (`mobileNavOpen`/`setMobileNavOpen`), the hamburger
is just a plain `<button onClick={() => setMobileNavOpen(true)}>`, no Radix
Trigger component needed at all. **Rule: only reach for
`<XTrigger asChild>` when you're NOT already manually controlling
open-state with your own useState — the two approaches are redundant
together, and splitting Trigger from Root across different return blocks
breaks the context contract, as it did here.**

### Other mobile-specific fixes
- `ui/dialog.tsx` `DialogContent`: was `w-full max-w-lg` with no horizontal
  margin — on a narrow phone it touched both screen edges. Changed to
  `w-[calc(100%-2rem)] max-w-lg` (1rem breathing room each side) plus
  `max-h-[85vh] overflow-y-auto` so a long form (e.g. the module-access
  checkbox grid on `/admin/users`) doesn't get clipped off-screen on a
  short viewport.
- `ui/tabs.tsx` `TabsList`: added `max-w-full overflow-x-auto` so three
  tabs with longer labels (`/purchase`'s "Indents / Purchase Orders / GRN
  & Quality") degrade to horizontal scroll instead of silently overflowing
  the card on a narrow phone, same `overflow-x-auto` convention already
  used by the `Table` wrapper.

### Verified
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — 0 errors, same 24 routes (first attempt caught the
  DialogTrigger-outside-Root bug via the prerender failure above; fixed,
  rebuilt clean).
- Live-verified via `browser_exec` with `Emulation.setDeviceMetricsOverride`
  at 390×844 (iPhone-class viewport): dashboard KPI cards stack to one
  column, hamburger button appears and opens the drawer with full nav +
  overlay, tapping a nav item inside the drawer navigates AND auto-closes
  it, a data table (`/purchase` Indents) scrolls horizontally inside its
  card instead of breaking the page layout, and the Raise Indent dialog
  renders centered with visible margins on both sides and tap-sized
  buttons and tap-sized buttons — all screenshot-confirmed, not just code-reviewed.

---

## BUSINESS WORKFLOW REWRITE — Checklist/Recurring merge, Purchase 3-step, GRN quality, Accounts ledger

User sent a detailed functional spec covering 6 areas. Schema (Drizzle,
validated 39 tables) and frontend were both rewritten to match. Summary per
area — read the referenced schema file's comments for the full reasoning,
this is the index.

1. **Checklist = Recurring Task** (explicitly the same thing per the user,
   not two systems). Merged `/checklists` INTO `/tasks` — deleted the
   separate page/nav entry. `src/db/schema/tasks.ts`:
   `taskFrequencyEnum` now the fixed 7-value set DAILY/WEEKLY/FORTNIGHTLY/
   MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY (was free text). `taskInstances`
   gained `priority` (HIGH/MEDIUM/LOW, ONE_TIME only) and `attachmentUrl`
   (always present; REQUIRED enforcement for ONE_TIME is an API-layer rule,
   not a DB constraint — see the column comment). `/tasks` page now has two
   tabs (Recurring/Checklist, Delegation) each with their own create dialog
   and a shared "Mark Done" dialog that blocks submission for ONE_TIME tasks
   with no attachment (verified live — button stays disabled, red Hinglish
   warning shown) and allows submission either way for RECURRING.
2. **Inventory**: `inventoryStock` gained branch-scoped `minStockLevel`/
   `maxStockLevel` (replacing the old single `reorderLevel` mock-only
   concept) — low-stock fires on `qty < min`, overstock on `qty > max`,
   either can be 0 = "not configured" (no false alert). `/inventory` now has
   a working "Add Item" dialog (name, branch, UOM dropdown — `UOM_OPTIONS` in
   mock-data.ts — opening qty, min, max) and the alert counts are in the
   page description live, not just in the table.
3. **Purchase 3-step + general items**: `purchaseOrders` gained
   `isGeneralPurchase`, `boughtAt`/`billUploadedAt`/`materialReceivedAt`.
   `purchaseOrderLines`/`grnLines` now accept EITHER `rawMaterialId` OR
   `itemDescription` (general, non-store purchase — same flow, no Indent
   behind it). Indent approval is a real manager action now — DRAFT →
   "Submit for Approval" → PENDING_APPROVAL → Approve/Reject buttons
   (verified live). `/purchase`'s Purchase Orders tab shows live
   step-progress badges (1. Bought / 2. Bill — optional, has its own
   "skip" affordance / 3. Mark Material Received), and Step 3 auto-creates
   a PENDING GRN row.
4. **GRN quality check PASS/FAIL/PARTIAL**: new `grnQualityResultEnum` on
   `grns`, `qtyFailed` on `grnLines`, and a new `materialReturns` table (the
   money side — qty returned + refund amount, linked back to the GRN line).
   `/purchase`'s GRN tab has a working Quality Check dialog: PASS needs
   nothing further (full qty would post to Inventory in Phase 3); FAIL/
   PARTIAL require a fail-qty-in-UOM input and the submit toast explicitly
   states "qty kg returned to vendor, ₹X submitted to Accounts as a refund
   entry" — verified live end-to-end (GRN-3309 FAIL 5kg → toast fired).
5. **Branch isolation / Owner compiled view**: true per-user branch-scoped
   access needs the Phase 3 auth/session layer (not built yet — flagged
   again, same as earlier phases). What WAS done now: Dashboard gained a
   **Total Inventory Value** KPI (5th card) and a matching column in the
   branch drill-down table, so the owner's "all branches compiled, or
   branch-wise" ask has total sales + total inventory + MIS + cash variance
   all on the one screen already built. The branch-selector dropdown still
   doesn't filter data yet (same known gap as before — needs the DB).
6. **Accounts — Petty Cash Book + Balance Sheet + P&L**: `pettyCashEntries`
   gained `entryType` (IN/OUT, was OUT-only) and `balanceAfterInr` (an
   append-only running balance written at insert time — a real ledger, not
   recomputed-on-read). New `ledgerAccounts` (Chart of Accounts: ASSET/
   LIABILITY/EQUITY/INCOME/EXPENSE) + `journalEntries` (minimal real
   double-entry debit/credit backbone) tables — deliberately scoped small
   (no sub-ledgers, no period locking) per the comment in `accounts.ts`;
   extend it later if the brief asks for more, don't over-build now.
   `/accounts` is now 4 tabs: Petty Cash Book (IN/OUT ledger with running
   balance + a working entry dialog), Aggregator Recon (unchanged),
   Profit & Loss (revenue → COGS → gross profit → opex lines → net profit),
   Balance Sheet (Assets/Liabilities/Equity three-column with a visible
   `Assets = Liabilities + Equity` check line — verified live, balances:
   ₹52,53,400 = ₹52,53,400).

### Validated
- `npx tsc --noEmit` — 0 errors.
- `npx drizzle-kit generate` — 39 tables, 0 errors (migration regenerated
  after every schema file change in this pass).
- `npx next build` — 0 errors, 23 routes (24 → 23: `/checklists` correctly
  gone, merged into `/tasks`).
- Live-verified via `browser_exec` end to end, not just screenshotted:
  Mark Done blocked without attachment on a delegation task (button
  disabled + red warning), optional on a recurring task; Indent
  Approve/Reject actually flips status and the resulting toast confirms it
  now shows in Purchase Orders; GRN Quality FAIL path actually updates the
  row to FAIL + fail qty AND fires the correct return/refund toast message;
  Inventory low-stock alert count is live in the header; Balance Sheet's
  three totals actually sum correctly (not just three unrelated numbers).

### Known remaining gaps (explicitly out of scope this pass)
- No DB — everything above is still `src/lib/mock-data.ts`, shaped to match
  the new schema exactly so swapping in real queries is mechanical.
- No auth — "Owner sees all branches" and "each branch separate for users"
  both need the session/role layer before they're real; right now every
  page shows all data to anyone who opens it.
- PASS on GRN quality check doesn't visibly move a row into the Inventory
  page's own state (separate `useState` per page, no shared client store) —
  noted as a toast-only confirmation; real cross-entity stock posting
  needs the DB transaction it was always going to need anyway.

---

## PROCESS FLOW CHART — fully rebuilt for current system (same day)

User asked to fully update the Process Flow Chart based on the whole
current system ("Abhi pure System ke base pr Flow Chat Fully Update kro").
The existing chart at
`.archify/workflow-restaurant-erp-process-flow-20261027-143000/restaurant-erp-process-flow.html`
still described the OLD, now-removed "virtual/recursive Semi-FG raw
deduction at sale time" model — completely wrong after the Recipe Builder +
real Semi-FG production rebuild above. Rebuilt via the Archify workflow
diagram CLI (`archify-diagrams` skill), editing
`.archify/workflow-restaurant-erp-process-flow-20261027-143000/candidate.json`
in place (same output path, so the delivered HTML stays at the same URL).

What changed in the diagram:
- Added "Recipe Builder" and "Semi-FG Batch" (production) as real nodes
  feeding into "Stock Check" — making explicit that a Semi-FG must be
  PRODUCED (crediting real stock) before Stock Check will ever let it be
  sold, replacing the old virtual-deduction description.
- "Stock Check" node (was "n_bom"/BOM explode) now explicitly says "Raw +
  Semi-FG only" — direct raw + already-produced Semi-FG stock, never a
  Semi-FG's own embedded raw a second time.
- Added a "Semi-FG Alert" node (produced stock running low → produce
  again) off the KOT step.
- Dropped the dedicated WhatsApp lane/sub-flow nodes (Owner Creates Offer →
  Broadcast → Customer) to fit Archify's desktop-readability + aspect-ratio
  layout budgets at this node count — that behavior is still fully
  documented in card 14 text, just not drawn as separate diagram nodes.
  "Thank You" (order-confirmation WhatsApp message, which IS on the main
  order-to-invoice path) was kept as a real node, moved into the Billing
  lane next to GST Invoice/GSTR-1 Export.
- Cards expanded from 12 to 14, renumbered, with Recipe Builder (card 2)
  and Semi-FG Production (card 3) as new dedicated cards with worked
  examples (Gravy: 0.3kg Tomato + 0.3kg Butter → 1kg produced stock), and
  the Stock Check / KOT cards rewritten to match the real no-double-
  deduction contract.
- Real layout-fight resolved during this pass: Archify's installed
  validator enforces both a per-node label/sublabel width-fit check AND a
  separate whole-diagram desktop-readability downscale budget (~930px
  "legacy" available width at a 1440 viewport) AND a showcase-only
  composition/viewport-height aspect-ratio check (wide ratio ≥1.55, or
  height ≤713 at the resulting width) — these three interact: widening
  nodes to fix label-fit blew the width budget; widening further for
  aspect-ratio then re-blew the width budget the other way. Node
  "height"/"width" tweaks and dropping `groups`/`tag` had ZERO effect on
  total diagram height (confirmed empirically) — only LANE COUNT drives
  total height in this renderer. Fixed by shortening every long label to
  fit the default node width AND dropping the diagram from 5 lanes to 4
  (per the exact pattern in this skill's own pitfall notes: "when
  something doesn't fit, drop it and describe in a card instead" — applied
  here to a whole sub-flow, not just one edge). All 4 Archify gates
  (validate/deliver/check/browser-check) pass clean with zero diagnostics.
- Verified visually via `browser_exec` against the finalized
  `restaurant-erp-process-flow.html` opened over `file://` — full 4-lane
  flow renders correctly (Recipe Builder → Semi-FG Batch → Stock Check →
  KOT/Stock Deduct → POS Receipt → GST Invoice → Thank You/GSTR-1 Export),
  all 14 numbered cards render with their worked examples.
- This is a local, offline HTML artifact only — nothing was committed,
  pushed, or deployed as part of this diagram update; ask separately if
  it should also be committed to the repo or shared with the client.

## GSTR EXPORT MOVED INTO ACCOUNTS — no longer a separate nav item (same day)

User asked: "GSTR Export ko Accounts Section me Hi shift kro Alag se na Dikho
Left side Panel Me" — GSTR-1 HSN Export is no longer its own left-sidebar nav
item; it is now a tab inside the Accounts page.

- `src/app/accounts/page-content.tsx` — added a `GSTR Export` tab (gated on
  `POS_CASHIER` module access, same permission the standalone page used) with
  the full existing export UI (From/To date range, Generate, HSN-wise table,
  Export CSV) ported in as `GstrExportPanel`, reading the page's own branch
  selector instead of its own.
- `src/lib/nav.ts` — removed the `/gst-export` entry; left sidebar no longer
  shows it separately.
- `src/app/gst-export/page.tsx` — now a plain redirect to `/accounts` (old
  bookmarks/links still work); `page-content.tsx` for that route deleted
  (dead code, fully superseded by the Accounts tab).
- `src/lib/server/page-access.ts` — `/accounts` rule now also accepts
  `POS_CASHIER` (so a POS-only user can reach the GSTR tab); removed the
  standalone `/gst-export` rule and its `isPersistedPath` entry.
- `src/components/app-shell.tsx` — removed the now-dead `/gst-export` entry
  from the Hinglish nav-title map.
- **Real pre-existing bug found and fixed while doing this**: the in-app
  Guide Book (`/guide`) keyed its card grid AND its open-dialog state purely
  by `module`, and the old GSTR module entry already shared `module:
  "POS_CASHIER"` with the actual POS/Cashier guide card — a duplicate React
  key, and `visible.find(m => m.module === openKey)` meant clicking the GSTR
  card could silently show the POS card's content instead (or vice versa).
  Fixed `src/app/guide/page-content.tsx` to key by array index instead of by
  module string. The exact same duplicate-key pattern existed in the
  hand-written standalone `docs/restaurant-erp-archify.html` JS
  (`MODULES.find(m=>m.module===openKey)`) — fixed there too, keyed by
  `module+"|"+route`. Since GSTR's guide route is now `/accounts` — which
  the Accounts module's OWN guide card already uses — a second collision
  would have hit `GUIDE_EXAMPLES` (two entries both keyed `/accounts`, one
  silently overwriting the other). Fixed by adding an explicit
  `exampleKey?: string` field to `GuideModule` (`src/lib/guide-content.ts`),
  set to `/accounts-gstr` on the GSTR entry only, with
  `getGuideExample(open.exampleKey ?? open.route, ...)` as the lookup — same
  pattern applied in the standalone HTML (`EXAMPLES[m.exampleKey||m.route]`)
  and in `tests/guide-examples.test.cjs`'s route/key assertions.
  `docs/restaurant-erp-archify.html`'s `MODULES`/`EXAMPLES` consts
  re-synced from the TS source via the same small Node script used before.

### Verified
- `npx tsc --noEmit` — 0 errors. `npx next build` — clean (two transient
  Windows `fstat`/worker-exit errors on the first two attempts were pure
  filesystem flakiness, not code — a third plain rebuild succeeded clean).
  `npm test` (in a clean env, unset leaked `APP_ORIGIN`/`PG*` from earlier
  `source .env` calls this session, same known contamination risk as
  before) — **115/115 pass**, including `node --test
  tests/guide-examples.test.cjs tests/menu-ui.test.cjs` (5/5, updated for
  the `exampleKey` lookup and the standalone-HTML regex change).
- Real browser, isolated QA app/DB (disposable owner session injected via
  cookie, no password typed): left sidebar confirmed NO standalone "GSTR
  Export" item; opened `/accounts`, confirmed a 4th tab "GSTR Export" next
  to Expenses/Profit & Loss/Other accounts; clicked it (via AX-tree + CDP
  box-model click, since Radix `Tabs` doesn't respond to a synthetic JS
  `.click()`), confirmed the tab switches and the GSTR panel loads live
  (`0 GST-compliant order(s)` on the empty QA DB, HSN table header
  rendered, Export CSV button present). Navigated to `/gst-export` directly
  — confirmed it redirects to `/accounts`. QA fixture (disposable owner
  user/session) and the leftover `.next-qa` `tsconfig.json`/`next-env.d.ts`
  artifacts were cleaned up again, same recurring gotcha as every prior QA
  round on this project — always diff those two files before any commit.
- Nothing committed or pushed yet — ask before doing either.

File: `docs/restaurant-erp-archify.html` — **REPLACED** this session with a
hand-built interactive module guide (see "INTERACTIVE MODULE GUIDE" section
below). The original Archify tier-diagram is preserved as
`docs/restaurant-erp-archify-v1-tierdiagram.html.bak` in case the high-level
trust-boundary view is needed again later.

Source candidate (if the diagram ever needs editing):
`.archify/architecture-restaurant-erp-20261022-090634/candidate.json`

Content delivered:
- 4 trust-boundary regions matching the brief exactly:
  - Tier 1: Super Admin & HQ Master Control (Master BOM Recipes, Locked
    Vendor Rates, Clone Branch Wizard, HQ Owner Dashboard)
  - Tier 2: Official WhatsApp Cloud API Hub (Zero-Login Staff UI, WhatsApp
    Webhook, 1-Tap Owner Approval, Auto Vendor PDF PO, 8AM Coffee Summary)
  - Tier 3: Branch Operations branch_id scoped B1-B6+ (Recurring Tasks FMS,
    Live Cam + 50m GPS Anti-Cheat, One-Time Delegation, Purchase Indent &
    GRN, Smart Inventory, POS + Blind Cash Drop)
  - Tier 4: Finance, 3-Way Match & MIS Engine (Swiggy/Zomato Recon, 3-Way
    Match Lock, Petty Cash Ledger, 100-Point MIS Engine)
- 5 interactive "guided views" (route filters) built into the HTML: All
  Flows, Task & Delegation Loop, Inventory & Purchase Loop, Cashier &
  Accounts Loop, WhatsApp Bot Loop.
- Hinglish explanations + sample WhatsApp interactive-message previews on
  the tier summary cards (bot message text, owner approval buttons, vendor
  PO message, 8AM report text).

Known limitation: Archify's schema (v1, architecture diagram type) has no
true per-node "click node for full inspector panel" feature — the
Hinglish/WhatsApp-preview detail lives in the 4 tier summary cards and the 5
view notes, not as a popup on every single node. This was a deliberate
trade-off to pass Archify's layout validator (see "Archify lessons" below).
If a literal per-node inspector popup is required later, that needs a
hand-built HTML/JS layer on top of (or instead of) Archify — flag this to
the user before doing more diagram work.

### Archify lessons learned (for next time a diagram is edited)
- Never put long free-text in a node's `tag` field — it forces the node
  wider than its `size` and fails `layout/constraint`. Keep Hinglish/preview
  text in `cards` or view `note` fields instead.
- Same-row (same y) components must be connected only to their PHYSICALLY
  ADJACENT column neighbor — reaching past another node in the same row
  triggers `clean-flow/edge-through-node`.
- A connection that runs flush along a boundary's top/bottom edge (rather
  than crossing it perpendicularly) triggers `composition/container-border-run`.
  Only connect components so the line visibly enters/exits a boundary box at
  roughly 90°.
- Vertical edges between tiers must line up in the SAME column (same x) and
  that column must be clear of any other node sitting between the two
  tiers, or you get `composition/ambiguous-corridor` / edge-through-node.
- When a relationship doesn't fit cleanly into the grid without crossing
  something, don't fight the router — drop the drawn edge and describe that
  relationship in a `cards` bullet instead. Cheaper and reads fine.
- `node "<path>/archify/bin/archify.mjs" finalize architecture candidate.json
  output.html --quality showcase --json` — success needs ALL 4 gates
  (validate/deliver/check/browser-check) = pass, not just validate.
- `write_file` on an existing file the tool thinks is "stale" (even right
  after read_file) can false-positive-block. Workaround used: write to a new
  filename, then `mv` it into place via `terminal`.

---

## INTERACTIVE MODULE GUIDE — replaces Archify tier diagram

User asked for `docs/restaurant-erp-archify.html` to be updated to reflect
the CURRENT system AND to have real **per-module click-to-expand detail
panels** explaining each module in plain Hinglish (layman-readable) with a
concrete example — something Archify's schema explicitly does not support
(flagged as a known limitation back in the Phase 1 section; this session
delivers the hand-built HTML/JS layer that was flagged as the fix).

**File replaced**: `docs/restaurant-erp-archify.html` (same path, so
anything already pointing at it keeps working) — now a self-contained
~23KB dark-theme HTML+vanilla-JS page (no external deps except nothing —
no Google Fonts even, pure system font stack). Old 779KB Archify tier
diagram backed up as
`docs/restaurant-erp-archify-v1-tierdiagram.html.bak` — restore it instead
if a literal trust-boundary/network diagram is ever needed again; the two
serve different purposes (tier/security-boundary view vs. per-module
how-to-use guide) and should not be conflated.

### Structure
- Top flow strip: WhatsApp → ChatXFlow → ERP → Postgres → Owner Dashboard
  (the one-sentence mental model of how data moves).
- Color-coded legend matching 5 categories: cyan=daily ops, violet=finance,
  green=purchase/stock, amber=admin/setup, rose=WhatsApp connection.
- 12 clickable module cards (one per real `/route` in `src/lib/nav.ts`:
  Dashboard, Reports, MIS Leaderboard, Tasks & Checklists, Inventory,
  Purchase & GRN, POS/Cashier, Blind Cash Drop, Accounts, Users & Access,
  Branches, WhatsApp Settings) — each opens a modal (plain `div` + vanilla
  JS, no framework) with three sections: **Yeh kya hai?** (what it is, in
  Hinglish), **Kaise use hota hai?** (bulleted how-to steps matching the
  ACTUAL current UI — e.g. Tasks explicitly calls out the
  optional-vs-required attachment rule, Purchase explicitly walks the
  Indent→3-step→Quality-Check chain), and a green-bordered **Real Example**
  box with concrete names/numbers (e.g. "Rahul Sharma ka MIS score 93.1%",
  "GRN FAIL 2.5kg → vendor ko wapas + Accounts refund entry").
- Content was written from this session's own verified build (the Tasks
  attachment-required rule, Purchase 3-step + GRN quality flow, Accounts
  4-tab ledger, etc.) — not from the original brief or Phase-1-era
  assumptions, so it's accurate to what actually ships today, including
  gaps still described honestly elsewhere in this file.

### Verified
- Opened directly via `file://` in `browser_exec` (works fully offline —
  no server needed, same as the old Archify file).
- Clicked a card (Purchase & GRN) — modal opens with correct route badge
  (`/purchase`), full 4-point how-to list, and the GRN quality example —
  confirmed by screenshot.
- Scrolled through all 12 cards — colors, icons, and text all render
  correctly in the grid.

### If this needs updating again later
Edit the `MODULES` array in the `<script>` tag near the bottom of the file
— each entry is `{ id, cat, route, icon, title, short, what, how: [...],
example }`. Keep `how` as short imperative bullets matching the real UI at
the time of editing (re-check against the live page, don't guess), and
keep `example` concrete with real-sounding names/numbers — that's what
makes it readable for a non-technical owner.

---

## IN-APP GUIDE BOOK — per-user access-filtered, inside the ERP itself

User asked for the standalone HTML guide's content to ALSO live inside the
running ERP app, on every user's own dashboard, showing ONLY the modules
that user actually has access to (per `moduleAccess`). Built this session.

**No real auth/session layer exists yet** (Phase 3, still not started — see
RESUME CHECKLIST). To make per-user filtering actually demoable end-to-end
today rather than just described, added a DEMO "who's logged in" layer:

- `src/lib/current-user.ts` (NEW) — `DEMO_USERS` (4 users: Owner/all-access,
  Rahul Sharma/branch-manager subset, Priya Nair/different subset, Amit
  Kumar/cashier narrow subset), `useCurrentUser()` hook
  (`useSyncExternalStore` + `localStorage`, no Context/Provider needed — any
  client component can call it directly), `setCurrentUserId()` to switch.
  Clearly commented as DEMO ONLY — swap for a real session hook once Phase 3
  auth exists, call sites elsewhere don't need to change.
- `src/app/admin/users/page.tsx` — its `INITIAL_USERS` now imports
  `DEMO_USERS` from the same shared file (was a separate hardcoded copy
  before this session) so the Users & Access table and the demo switcher
  show the same 4 people. NOTE: edits made in that page's UI are still
  page-local React state (no DB) — they won't reflect back into the
  switcher until `current-user.ts` itself is edited; this is an accepted
  demo-stage gap, not a bug.
- `src/lib/guide-content.ts` (NEW) — `GUIDE_MODULES`, one entry per
  `NAV_ITEMS` route (same Hinglish what/how/example content as the
  standalone HTML guide, kept as a separate TS copy — NOT imported from the
  HTML file — because the HTML is meant to stay a zero-dependency
  stand-alone artifact; if content changes, update BOTH `guide-content.ts`
  and the `MODULES` array in `docs/restaurant-erp-archify.html`, they will
  drift otherwise).
- `src/app/guide/page.tsx` (NEW route `/guide`) — renders `GUIDE_MODULES`
  filtered to `useCurrentUser().moduleAccess`, same click-to-expand modal
  pattern as the standalone HTML (ported to the app's own `Dialog`
  component). Shows a "N aur module hain jo access mein nahi hain" note
  when some are hidden.
- `src/components/app-shell.tsx` — `NavList` now filters `NAV_ITEMS` by
  `moduleAccess` too (was showing all 12 to everyone before this session —
  this was the actual mechanism needed to make "jis chiz ki access hai wo hi
  dikhna chahiye" real, not just true for the Guide Book). **Guide Book
  itself is never filtered out** — it's a teaching screen, not a data
  screen, appended as the last nav item for every user regardless of
  moduleAccess, with a `border-t` visual separator. Header's static "HQ"
  avatar replaced with the demo user-switcher `<select>` (shows initials +
  name/role tooltip) — switching it re-filters the sidebar AND `/guide` in
  real time via the shared `useSyncExternalStore` state.
- `src/app/dashboard/page.tsx` — added a dismissible-looking (not actually
  dismissible, just a banner) "Naya ho yahan? Guide Book kholo" link card
  right under the page header, satisfying the literal "dashboard pe guide
  book dikhni chahiye" ask with one click through to `/guide`.

### Verified
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — 0 errors, 24 routes (23 → 24: new `/guide`).
- Live-verified via `browser_exec`: Owner (default) sees all 12 nav items +
  Guide Book, and all 12 module cards on `/guide`. Switched to Amit Kumar
  (Cashier, moduleAccess = POS_CASHIER + CASH_DROP only) — sidebar
  immediately narrowed to exactly POS/Cashier + Blind Cash Drop + Guide
  Book, and `/guide` itself narrowed to those same 2 cards plus a "10 aur
  module hain..." note — clicked the Blind Cash Drop card, modal opened
  with correct route/what/how/example. Switched back to Owner — both
  sidebar and dashboard banner confirmed back to full access.

### Known remaining gap
This is a UI-only access simulation — there's still no real login, no
server-side enforcement, and no branch-scoped data filtering (a user could
still type any URL directly and the page would render — nothing blocks
navigation at the route level, only the NAV LINKS are hidden). Real
enforcement needs the Phase 3 session/auth layer; this session's work
makes the INTENDED behavior demoable and gets the nav-filtering UX fully
built so wiring real auth later is additive, not a rewrite.

---

Rebuilt from scratch in Drizzle (Postgres dialect), replacing the earlier
Prisma draft, after the user asked for Pro ERP's module set (Recurring,
Delegation, MIS scoring, Inventory, Reports, User-create/Access) to be
reflected here, plus explicitly chose Next.js+Drizzle to match Pro ERP.

Reference inspected to extract these patterns: `Mking697/Pro-ERP` on GitHub
(`src/db/schema/*.ts`, `src/app/performance/page.tsx`, `src/app/fms/*`,
`src/app/tasks/*`, `src/app/admin/*`) via `gh api repos/Mking697/Pro-ERP/...`.

### File structure
```
src/db/schema/
  platform.ts    branches
  auth.ts        users (role enum + moduleAccess text[] + reportingManagerId)
  menu.ts        menuItems, rawMaterials, bomRecipes
  vendors.ts     vendors, vendorRates
  inventory.ts   inventoryStock, stockBatches, wastageLogs, nightVarianceEntries
  purchase.ts    indents(+Lines), purchaseOrders(+Lines), grns(+Lines),
                 vendorInvoices, threeWayMatch
  tasks.ts       holidayCalendar, recurringTaskDefinitions, taskInstances,
                 taskProofs, checklistTemplates, checklistRuns
  pos.ts         posOrders(+Lines), posAlerts, cashDrops, employeeLedger
  accounts.ts    pettyCashEntries, aggregatorOrders, branchFinancials
  mis.ts         misScores
  whatsapp.ts    whatsAppMessageLog, auditLog
  index.ts       re-exports all of the above
src/lib/moduleAccess.ts   MODULE_KEYS constant (18 keys) for users.moduleAccess
drizzle.config.ts         builds DATABASE_URL in-memory from PG* env vars
                          (see "Windows AV quirk" below — never build it in a file)
.env.example              PGHOST/PGUSER/PGPASSWORD/PGDATABASE pieces, NOT a
                          composed connection-string literal
drizzle/0000_*.sql        generated migration (36 tables), committed as proof
                          `drizzle-kit generate` passed clean
```

### GAPS FILLED this session (vs the original Prisma draft, per user's ask)
1. **User access control** — `users.moduleAccess: text[]` added (Pro ERP
   pattern) on top of the existing `role` enum, so access can be granted/
   narrowed per module without inventing a new role per combination. Module
   keys live in `src/lib/moduleAccess.ts` (`MODULE_KEYS`). Also added
   `reportingManagerId` (text, not FK-enforced — matches Pro ERP) and
   `tokenVersion` (bump on role/access/password change → old session JWT
   invalid immediately, don't rely on cookie TTL alone).
2. **Recurring tasks** — split the old single `TaskTemplate` (just an RRULE
   string) into `recurringTaskDefinitions` (the rule: frequency code
   D/W/15D/M/Q/Y + assignDate anchor + Active/Paused) and `taskInstances`
   (each generated occurrence). Added `holidayCalendar` (branch-scoped skip
   list) and `naturalCycleStartDate` + two unique indexes on `taskInstances`
   so a double-fired cron can never double-create an occurrence — see the
   column/index comments in `tasks.ts` before touching the generator logic.
3. **Multi-step checklist/delegation chaining engine** — NEW tables
   `checklistTemplates` (one row per step, composite PK
   `(templateId, stepNo)`, with `nextStepMap` jsonb for outcome-based step
   routing, TAT, outcome type, notifyOnComplete) and `checklistRuns` (one row
   per step execution, grouped by `instanceId`). Mirrors Pro ERP's FMS engine.
   Use this — not a single flat task — for Opening/Closing checklists,
   Hygiene Audits, GRN quality-check chains: anything that is a SEQUENCE of
   steps where step N's outcome can route to a different step N+1.
   KNOWN DEBT (flagged, not fixed): Pro ERP's own `nextStepMap` is actually a
   legacy semicolon string ("Pass:3;Fail:5") in production despite being
   typed jsonb — when writing the Phase 3 checklist engine code here, persist
   it as REAL JSON (`{"Pass":"3","Fail":"5"}`) from day one, don't repeat
   Pro ERP's debt.
4. **MIS leaderboard breakdown** — kept the existing 40/30/20/10 weighted
   `totalScore` (task/delegation/variance/cashier) but added
   `onTimeCount`/`delayCount`/`notDoneCount` alongside it so the leaderboard
   page can show both the % score and Pro-ERP-style raw counts in one query.

### Deliberate design notes carried over from the Prisma draft (still true)
- `menu_items`/`bom_recipes` are branch-scoped rows (not one global row per
  item) so the Clone Branch Wizard is a literal row-copy into a new
  `branchId` — matches "clone wizard clones Menu Items, BOM Recipes,
  Checklists" in the brief. The new `checklistTemplates.branchId` (nullable
  = global template) follows the same clone-by-copy convention.
  `bomRecipes.lockedByHq` + `vendorRates.lockedByUserId` encode the "HQ
  locked, branch can't edit" rule at the data level; enforce it again in the
  API layer (don't rely on schema alone).
- `cashDrops.expectedCashInr` exists in the row from creation but the API/
  frontend must never return it to the cashier's client until after they
  submit counted denominations — that's an API-layer rule, not a schema one.

### Windows AV quirk — relevant to this project specifically
This host's Avast silently redacts `scheme://user:pass@host` written to ANY
file (regardless of writer). `drizzle.config.ts` and runtime DB code MUST
build the connection string in memory from separate `PGHOST`/`PGUSER`/
`PGPASSWORD`/`PGDATABASE` env vars (see `.env.example`) — never write a
composed URL literal to a file. `drizzle.config.ts` already does this
correctly; copy that pattern into the Phase 3 DB client, don't regress it.

---

## CHATXFLOW INTEGRATION — WhatsApp sending, same provider as Pro ERP

User already has a ChatXFlow (chatxflow.online) account/token from Pro ERP
and asked for the SAME integration pattern here. Code was read directly from
`Mking697/Pro-ERP` (`src/lib/chatxflow.ts`,
`src/app/api/admin/settings/whatsapp/route.ts`) and ported, not reinvented —
its transport security was already reasoned through there.

### What ChatXFlow is
A bulk/transactional WhatsApp sender: connect your own WhatsApp number once
via QR scan on chatxflow.online, then call `POST https://chatxflow.online/api/v1/send`
with `Authorization: Bearer <token>` and `{ phone, message }` to send. One
token per account (here: one token for the whole HQ, not per-branch — see
below).

### Files added this session
- `src/db/schema/settings.ts` — generic key/value `settings` table
  (`CHATXFLOW_API_TOKEN` / `CHATXFLOW_PHONE_NUMBER` / `CHATXFLOW_BASE_URL`
  rows). **Deliberately GLOBAL, not per-branch** — unlike Pro ERP (multi-
  tenant SaaS, settings scoped per org), this is one restaurant chain with
  one WhatsApp business number for the whole HQ. If a future need arises for
  a *branch-specific* WhatsApp number, add a nullable `branchId` column
  then — don't pre-guess it now.
- `src/db/client.ts` — Drizzle `node-postgres` client. Builds the connection
  from `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/`PGPORT` env vars **in
  memory**, same pattern as `drizzle.config.ts` — keep both in sync, never
  regress to a composed URL literal written to a file (Windows AV quirk).
- `src/lib/settings.ts` — `getSetting`/`getAllSettings`/`upsertSetting`
  thin DB wrappers over the `settings` table.
- `src/lib/chatxflow.ts` — the actual send layer, ported close to Pro ERP's
  version on purpose. Carries over its security properties verbatim:
  - `approvedChatXFlowBaseUrl()` pins the origin to exactly
    `https://chatxflow.online` — rejects custom hosts/subdomains/
    credentials/ports/paths/queries. **Do not relax this with a hostname
    regex later** — a genuinely different provider needs its own separately
    reviewed, connection-pinned transport.
  - `fetch(..., { redirect: "error" })` so no redirect destination ever
    receives a replayed token/message.
  - Per-call `CALL_BUDGET_MS` (20s) and per-batch `BATCH_BUDGET_MS` (60s)
    abort budgets; a deadline is logged as "delivery outcome unknown", never
    auto-retried (a lost ack may have already delivered).
  - `sendWhatsAppBatch()` — 4-worker pool, one settings snapshot shared
    across the whole batch — for the 8AM Owner Coffee Summary fan-out,
    vendor PO blasts, etc. once those are built.
  - `normalizePhone()` — bare 10-digit Indian numbers get `91` prefixed
    automatically (most people type a bare mobile number with no country
    code; this was a real silent-failure cause in Pro ERP).
  - DIFFERENCE from Pro ERP: every send is also written to this project's
    own `whatsAppMessageLog` table (Pro ERP doesn't need this since it
    doesn't have that audit table; we do, per the brief's WhatsApp audit
    requirement). Audit-log failure is swallowed — it must never block or
    undo an actual send.
- `src/app/api/admin/settings/whatsapp/route.ts` — GET (masked token +
  phone + base URL) / POST (save) admin settings endpoint, ported from Pro
  ERP's same route. **TODO Phase 3**: this route has NO auth guard yet
  (commented as a TODO in the file) — Pro ERP's equivalent is
  `requireRole(["Admin"])`; wire the same once this project's session/auth
  layer exists. Don't ship this route to anything internet-reachable before
  that TODO is closed.

### Validated this session
- `npx tsc --noEmit` — 0 errors across schema + `src/lib/*` + the new API
  route (confirms the `@/*` path alias, Next.js route-handler types, and
  Drizzle's inferred types all actually compile together, not just that the
  schema alone parses).
- `npx drizzle-kit generate` — 37 tables (36 + `settings`), 0 errors.

### Where to call `sendWhatsAppMessage`/`sendWhatsAppBatch` once Phase 3 proper starts
Same call sites Pro ERP uses for the same kind of event — task/checklist
completion confirmations, indent spike owner-approval buttons, overdue
escalation alerts, 8AM summary, vendor PO send. Import from
`@/lib/chatxflow`, pass `relatedEntityType`/`relatedEntityId` so the
resulting `whatsAppMessageLog` row is traceable back to the
Indent/TaskInstance/GRN/etc. that triggered it.

---

## PHASE 3 — BACKEND API + WHATSAPP WEBHOOK — ⚠️ STARTED (ChatXFlow only)

Planned scope (unchanged from original brief, now targeting Next.js API
routes / route handlers instead of a framework-agnostic REST layer, since
stack is confirmed Next.js):
- API routes for every module above (CRUD + workflow transitions:
  indent→approve→PO, GRN entry, 3-way match lock, cash drop submit,
  checklist step complete → chain to next step, etc).
- WhatsApp Cloud API webhook handler (inbound buttons/text/media/voice,
  outbound templates/interactive messages, live-camera signed-link token
  generator feeding `taskProofs`/`checklistRuns.proofPhotoUrl`).
- Cron jobs: overdue task escalation, 8AM Owner Coffee Summary, batch expiry
  alert (reads `stockBatches.expiryDate`), indent spike detection
  (>25% vs rolling average → `indents.status = PENDING_APPROVAL`).
- User admin API: create user + assign `role` + `moduleAccess` (Phase 2's new
  columns exist; no endpoint uses them yet).

Not started — no code written yet.

---

## PHASE 4 — FRONTEND DASHBOARD — ❌ NOT STARTED

Planned scope (unchanged): Owner Dual Dashboard with branch selector, MIS
Leaderboard view (now has raw counts + % score to show, per Phase 2's gap
fill), Cashier Blind Drop screen, Clone Branch Wizard UI, Reports module
(`/reports/[report]` dynamic route pattern, Pro-ERP-style, with Excel export
per report/user/range), User Admin screen (role + moduleAccess checkboxes).

Not started — no code written yet.

---

## FILE STRUCTURE SO FAR

```
G:\restaurant erp\
  CLAUDE.md
  package.json              next + drizzle-orm + pg (deps installed)
  tsconfig.json
  drizzle.config.ts          builds DATABASE_URL from PG* env vars in-memory
  .env.example               PG* pieces, no composed URL literal
  docs\
    restaurant-erp-archify.html   <- Phase 1 deliverable
  src\
    db\schema\*.ts           <- Phase 2 deliverable (see list above)
    lib\moduleAccess.ts       <- MODULE_KEYS constant
  drizzle\
    0000_majestic_roulette.sql   <- generated migration, 36 tables, validated
  .archify\
    architecture-restaurant-erp-20261022-090634\
      candidate.json         <- Archify source spec (edit here if diagram changes)
```

---

## RESUME CHECKLIST FOR NEXT SESSION

1. Postgres connection: set `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` in a
   local (gitignored) `.env`, then `npx drizzle-kit push` (or `migrate`) to
   actually create the tables in a running Postgres instance — ask the user
   whether local Postgres or a hosted instance (Hostinger VPS, matching how
   Pro ERP is self-hosted) before running it.
2. Scaffold the Next.js app itself (`src/app/` routes, `src/db/client.ts`
   Drizzle client using the same env-var-pieces pattern as
   `drizzle.config.ts` — do not regress the Windows AV quirk).
3. Start Phase 3: User Admin API first (unblocks everyone else logging in),
   then WhatsApp webhook + the checklist/recurring cron jobs.
4. Then Phase 4 frontend, starting with Owner Dashboard + MIS Leaderboard
   (highest-value screens per the original brief).
