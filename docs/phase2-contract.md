# Phase 2 — Tasks, Purchase, Accounts-ledger real DB wiring

Status: IN PROGRESS. Local/QA only — no production migration/deploy/commit
without separate approval. Schema for all three already exists
(`src/db/schema/tasks.ts`, `purchase.ts`, `accounts.ts`) with zero API
routes; this phase adds the routes + wires each page off `mock-data.ts`.

Shared conventions every new route MUST follow (already established
elsewhere in this codebase — do not invent a new pattern):
- Every mutation goes through `mutate(request, async (tx, actor) => {...})`
  from `@/lib/server/auth` (CSRF + identity + the single advisory-lock
  transaction). Every read still calls `requireIdentity(request)`.
- Every body is parsed with `body(request)` from `@/lib/server/http` and
  every writable field is allowlisted — unknown fields get a 400, not a
  silent drop.
- Branch scoping via `branchScope(actor, requestedBranchId)` from
  `@/lib/server/permissions` on every branch-scoped read/write. Non-Owner
  cross-branch access must 403, not leak data.
- Module/grant checks via `assertModule(actor, "...")` — reuse/extend
  `src/lib/moduleAccess.ts` `MODULE_KEYS`, do not invent ad-hoc role checks.
- IDs via `randomUUID()`, matching every existing table.
- `json(data, status)` / `HttpError` from existing helpers for responses —
  never a raw `NextResponse.json` for a new mutating route (match the
  pattern in `purchase`/`accounts`/`workforce` routes, not the older
  `admin/settings/whatsapp` style the audit just flagged).

## 2a — Tasks & Checklist engine

Scope for THIS pass (deliberately bounded — explicitly NOT in scope: WebRTC
live-camera capture, GPS geofence verification, cron-based recurring
generation/escalation — those need infra beyond a page/API pass and are a
later increment; leave `taskProofs`/`checklistRuns` tables unused by this
pass's routes beyond basic CRUD if simple, don't build fake geofence math):

- `POST /api/tasks/recurring` — create a `recurringTaskDefinitions` row.
  Body: `branchId,title,description?,assignedToId,frequency,assignDate,shiftTime?,attachmentHint?,requiresGeofence?`.
  Branch-scoped, `assignedToId` must be a real user in the same branch.
- `GET /api/tasks/recurring?branchId=` — list for a branch (Owner: all).
- `PATCH /api/tasks/recurring/[id]` — status Active/Paused only (no silent
  full-row overwrite); branch-scoped.
- `POST /api/tasks/delegate` — create a ONE_TIME `taskInstances` row. Body:
  `branchId,title,description?,assignedToId,priority,dueAt,voiceNoteUrl?`.
  `delegatedById` = actor.
- `GET /api/tasks/instances?branchId=&type=&status=` — list, branch-scoped.
- `POST /api/tasks/instances/[id]/complete` — mark DONE. Body:
  `attachmentUrl?`. Enforce: ONE_TIME tasks REQUIRE a non-empty
  `attachmentUrl` to complete (400 if missing) — RECURRING tasks do not.
  Sets `completedAt`, `status=DONE`. Branch-scoped; only the assignee OR
  someone with the relevant module grant may complete it (match existing
  `assertDelegation`-style self-vs-grant pattern used in workforce.ts).
- Migration: generate via `drizzle-kit generate` after any schema tweak (no
  schema change should actually be NEEDED — tables already exist).
- Wire `src/app/tasks/page-content.tsx` off `mock-data.ts` onto these
  routes (keep the existing two-tab UI: Recurring/Checklist + Delegation,
  keep the Mark Done dialog's required-attachment-for-ONE_TIME client-side
  check backed by the real server-side 400).
- Tests: unit tests for the attachment-required rule and branch scoping;
  real HTTP+Postgres integration test script
  (`tests/tasks.integration.cjs`, follow `tests/bom.integration.cjs`'s
  shape) against an isolated loopback QA DB — cover create/list/complete,
  cross-branch denial, missing-attachment-on-ONE_TIME 400, CSRF/auth 401/403.

## 2b — Purchase: Indent approval + PO 3-step money workflow

GRN quality-check → Inventory stock posting is ALREADY real
(`src/app/api/inventory/receive/route.ts`, wired from the GRN dialog) — do
NOT rebuild that. This pass adds the Indent and PO/GRN CREATE side that
currently has no API at all (page is 100% `mock-data.ts` for these parts).

- `POST /api/purchase/indents` — create DRAFT. Body:
  `branchId,lines:[{rawMaterialId,qty}]` (1–50 lines).
- `GET /api/purchase/indents?branchId=&status=` — list, branch-scoped.
- `POST /api/purchase/indents/[id]/submit` — DRAFT→PENDING_APPROVAL.
  Compute `spikePercent` vs a trivial rolling average placeholder (or skip
  the spike computation and just move to PENDING_APPROVAL — don't fabricate
  a fake analytics number; if no real daily-average data exists yet, leave
  `dailyAvgQtyJson`/`spikePercent` null and say so in the response, matching
  this project's "don't fabricate a number with no real data" convention).
- `POST /api/purchase/indents/[id]/approve` and `.../reject` — Owner/
  CENTRAL_STORE_MGR/branch-manager-with-grant only; sets APPROVED/REJECTED.
- `POST /api/purchase/orders` — create a PO from an APPROVED indent OR as a
  general purchase (`isGeneralPurchase=true`, free-text lines). Body per
  `purchaseOrders`/`purchaseOrderLines` shape already in schema comments.
- `POST /api/purchase/orders/[id]/bill` — Step 2, optional bill upload
  (reuse `normalizeLogo`-style image validation conventions if a photo is
  attached, or keep it a URL/text field if no real upload pipeline exists
  yet — don't invent a fake S3 upload, say explicitly if this is
  text/URL-only for now).
- `POST /api/purchase/orders/[id]/receive` — Step 3, creates the `grns` row
  (PENDING quality) — this is the point that already hands off to the
  existing quality-check + `/api/inventory/receive` flow; don't duplicate
  that logic, just create the GRN row correctly shaped for it.
- Wire `src/app/purchase/page-content.tsx` off `mock-data.ts` for the
  Indents and Purchase Orders tabs (GRN tab's quality-check dialog already
  calls the real inventory receive endpoint — leave that intact, just make
  sure the GRN rows it operates on now come from real data too).
- Tests: `tests/purchase.integration.cjs` — indent create/submit/approve/
  reject, branch scoping, PO create from approved indent vs rejected (must
  deny), general purchase with no raw material, GRN creation handing off
  correctly to the existing inventory-receive path (reuse/extend that
  existing test rather than duplicating its assertions).

## 2c — Accounts: real ledger (Petty Cash Book, Aggregator Recon, Balance Sheet)

Expenses/P&L are ALREADY real (`/api/accounts/expenses`, `/profit-loss`) —
do not touch those. This pass replaces `accounts/legacy-demos.tsx`'s 3
mock tabs.

- `POST /api/accounts/petty-cash` — IN or OUT entry. Body:
  `branchId,entryType,amount,description,photoUrl?`. Compute
  `balanceAfterInr` atomically inside the transaction (read the branch's
  last entry's balance, +amount for IN, -amount for OUT; reject OUT that
  would go negative — a petty cash book can't go below zero).
- `GET /api/accounts/petty-cash?branchId=&month=` — ledger listing + running
  balance, branch-scoped.
- `POST /api/accounts/aggregator-orders` — record one Swiggy/Zomato
  settlement row (`channel,orderValue,commissionAmount,adsAmount,refundPenalty,orderDate`;
  `netPayout` computed server-side as `orderValue - commission - ads - refundPenalty`,
  never trust a client-sent netPayout).
- `GET /api/accounts/aggregator-orders?branchId=&month=` — list + totals.
- `GET /api/accounts/balance-sheet?branchId=` — real aggregation from
  `ledgerAccounts`+`journalEntries`: sum debits-minus-credits per account
  grouped by `type` (ASSET/LIABILITY/EQUITY), with the
  `Assets = Liabilities + Equity` check line computed from real rows, not
  hardcoded. If no `ledgerAccounts`/`journalEntries` rows exist yet for a
  branch, return zeros with a clear `seeded: false` flag — never fabricate
  a balanced-looking number from nothing.
- You will likely need a few seed `ledgerAccounts` rows (Cash, Petty Cash,
  Sales Revenue, COGS, Accounts Payable, Owner's Equity) per branch or
  HQ-level — add a small idempotent seeding helper, not a one-off script
  left outside the app; document exactly what it creates.
- Wire `src/app/accounts/legacy-demos.tsx` off `mock-data.ts` for these 3
  tabs onto the new routes.
- Tests: `tests/accounts-ledger.integration.cjs` — petty cash running
  balance across multiple entries (including the OUT-below-zero 400),
  aggregator netPayout server-computed correctly, balance-sheet real zero
  state vs after seeding + journal entries, branch isolation, CSRF/auth.

## Verification required before reporting any of 2a/2b/2c done

- `npx tsc --noEmit --incremental false` — 0 errors.
- `npm test` — all existing + new unit tests passing (no regressions).
- `npx next build` — clean.
- `npx drizzle-kit generate` — confirm no unexpected schema drift; if a
  genuinely new migration is needed, generate it but do NOT apply it to
  the shared local dev DB or production — apply only to your own disposable
  QA database, and say explicitly what migration file (if any) was created.
- Real HTTP+Postgres integration test script run against your own isolated
  QA app+DB (own port, own `NEXT_DIST_DIR`, own disposable Postgres
  database — never the shared local dev DB/port 3000, never production).
- Clean up all your own QA fixtures/servers/dist dirs when done; leave
  `tsconfig.json`/`next-env.d.ts` diff-clean against the committed version
  (known recurring gotcha on this project — a QA dist dir name can leak
  into `tsconfig.json`'s `include` array; diff both files before finishing).
- Report exact file paths touched, exact test counts, and anything you
  could NOT verify (be honest about gaps, this project's own convention).
