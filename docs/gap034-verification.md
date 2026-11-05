# GAP-034 — local implementation verification

Status: VERIFIED_LOCAL. Pure read-model — no schema change, no migration needed. No commit/push or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## What was implemented

- `src/lib/server/shift-summary.ts` — `liveShiftSummary(tx, actor, branchId)`, a read-only live summary for the branch's CURRENT open shift run:
  - **Actual collected tenders** (Cash/Card/UPI/Other) for the current run so far — reuses the exact GAP-026 collection seam (`readPosCollectionTenders`) that shift-close already uses, read live without ending the run. Always real custody cash, same convention as the Cash Drop screen (never owner-only filtered).
  - **Completed/paid orders this run** — count plus visible-vs-actual-vs-owner-only split, same dual-labeling convention as `/api/pos/orders`' `salesSummary`.
  - **Pending (OPEN/unpaid) orders** — every currently open order for the branch, regardless of which run originally dispatched it (an order dispatched under an earlier, already-ended run and never force-marked completed — true carryover by policy), visibility-filtered the same way as every other operational order list, with an honest outstanding total.
  - No open run → an empty-but-honest summary (never an error), so the screen works before the first shift of the day starts.
- `GET /api/shift-runs/summary?branchId=` — same operational gate (POS_CASHIER/CASH_DROP/SHIFT_MANAGEMENT) as the existing `GET /api/shift-runs`.
- UI: a new read-only `ShiftSummaryPanel` on the Cash Drop screen, auto-reloading on shift start/end, showing the live collected-tenders breakdown, completed-orders total, and the pending-orders list with a clear "carried over from an earlier run" flag per order and a truncation notice that never understates the real total.

## Verification performed

- Full suite: 684/684 passing (added `gap034-service.test.cjs` — 4 tests covering: an honest empty summary with no open run; a run correctly separating this-run-only collected tenders/completed orders from a carried-over OPEN order dispatched under an earlier, already-ended run, and excluding a VOIDED order entirely; owner-only visibility filtering on both completed and pending totals, with the Owner alone seeing the actual/visible/private split; and a missing branch selection failing closed with 400).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/cash-drop` and `/api/shift-runs/summary` both compiled.
- No schema/migration change — this gap is a pure read-model over existing GAP-024/026 data, so there is nothing to migrate.

## Explicit limits

No new independent totals table — by design, so this can never drift from the real GAP-026 collection seam or the real shift-close figure (the close figure remains authoritative; this is a live preview only). No commit/push or deployment — batched with future gaps.
