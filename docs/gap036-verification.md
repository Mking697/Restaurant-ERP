# GAP-036 — local implementation verification

Status: VERIFIED_LOCAL. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## Owner decisions (this session)

- Discrepancy on acceptance (HO's actual count differs from what was dispatched): accepted immediately, with the signed difference recorded as `discrepancyInr` — no separate DISPUTED workflow.
- Acceptance authority: Owner/SUPER_ADMIN only. This single decision is also what makes "cross-branch substitution" structurally impossible — no branch-scoped role can ever reach the accept path at all.

## What was implemented

- Schema: new, deliberately SEPARATE table `ho_cash_dispatches` (migration `drizzle/0047_gap036_ho_cash_dispatch.sql`) — not a reuse of `shiftHandovers`, whose `toRunId` is `NOT NULL` by design (a same-branch next-shift reference, never a fake one for an HO dispatch). Columns: `countedCashInr` (full blind count), `retainedFloatInr` (kept at the branch), `dispatchedAmountInr` (= counted - retained, what is actually in transit), `dispatchedBy`/`dispatchedAt`, `status` (PENDING/ACCEPTED), `acceptedBy`/`acceptedAt`/`acceptedAmountInr`/`discrepancyInr`. A unique index on `fromRunId` prevents more than one dispatch per run (defense in depth; the run's own OPEN-status check already prevents a double dispatch at the app layer).
- `src/lib/server/shifts.ts`:
  - Extracted the expected-cash calculation (opening float/carried balance + this run's real tenders minus GAP-035 POSTED cash expenses) out of `endShiftAndHandover` into a shared `computeExpectedCashCents` helper, reused by the new path — so both close paths always agree on what "expected cash" means, with zero duplicated logic to drift.
  - New `dispatchShiftCashToHo`: ends the given OPEN run exactly like `endShiftAndHandover` (same blind count, same cash-drop record, same expected/shortage math) but creates a `ho_cash_dispatches` row instead of a `shiftHandovers` row, and **does not open a next run** — the branch has no OPEN shift again until someone explicitly starts one (typically the next business day, referencing `retainedFloatInr` as that new run's existing GAP-033 `openingFloatInr` — a manual, separate act, never automatic).
  - New `acceptHoCashDispatch`: SUPER_ADMIN-only (403 otherwise); rejects if the accepting actor is the same as `dispatchedBy` (self-acceptance, 403); rejects if the dispatch isn't PENDING (404 — covers both "already accepted" retries and unknown/foreign ids); records `acceptedAmountInr` (defaults to the dispatched amount when HO doesn't type one in, meaning "it matched exactly") and the signed `discrepancyInr = acceptedAmountInr - dispatchedAmountInr`.
  - `endShiftAndHandover` (the ordinary same-branch next-shift path) is functionally unchanged — same signature, same behavior, same return shape — only its internal expected-cash computation was hoisted into the shared helper.
- API: `POST /api/shift-runs/[id]/dispatch-ho` (dispatch), `GET /api/ho-cash-dispatches` (branch-scoped history for a branch actor; the Owner with no branch filter sees every branch's dispatches — the HO review queue), `POST /api/ho-cash-dispatches/[id]/accept` (accept).
- UI: Cash Drop page gained an optional "Or: this is the final shift of the day — dispatch to Head Office" panel (Branch Manager/Owner only, same gate as GAP-033's opening float) with a retained-float input and its own result card explicitly stating no new shift was opened. A new Owner-only "Head Office — incoming cash dispatches" panel on the same page lists every PENDING dispatch across branches with an accept action and an optional "amount actually received" field.

## Verification performed

- Full suite: 698/698 passing (added `gap036-service.test.cjs` — 8 tests: HO dispatch ends the run without opening a next run and computes the exact dispatched/retained split; retained float defaults to 0 when omitted; retained float above the counted total is rejected; double dispatch rejected (run already ENDED); acceptance rejected for a non-Owner, rejected for the dispatching actor even if they hold SUPER_ADMIN, and rejected on retry after being accepted once; a genuine discrepancy is recorded as a signed difference while custody still transfers; accepting an unknown/foreign dispatch id is rejected; and the ordinary NEXT_SHIFT handover path is proven completely unaffected — still opens a next run exactly as before).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/cash-drop` and all new API routes compiled.
- Migration 0047: fresh apply (47 → 48 migrations) and no-op re-apply (48 → 48, no error) verified against a disposable local Postgres container (`restaurant-gap036-qa`, stopped and removed after use); table shape (columns, FKs, unique/branch indexes) confirmed directly via `\d ho_cash_dispatches`.

## Explicit limits

No HO-side physical bank-deposit confirmation — acceptance records custody transfer at Head Office, not a bank reconciliation (that remains a separate, later Accounts step, consistent with this codebase's existing boundary between operational acceptance and bank-statement reconciliation). No automatic retained-float carry into the next run's opening float — it is a snapshot for a human to reference, entered manually via the existing GAP-033 field when the next shift is actually started. No production migration, commit/push, or deployment — batched with future gaps.
