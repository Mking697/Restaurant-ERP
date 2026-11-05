# GAP-033 — local implementation verification

Status: VERIFIED_LOCAL. Owner-confirmed minimal scope: literally "first opening cash/float entry" only — not the larger proposed drawer-movements ledger (top-up/cash-expense/refund/HO-dispatch), and Branch Manager/Owner-only authorization. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## The problem

`endShiftAndHandover`'s expected-cash baseline came only from an incoming ACCEPTED handover's `cashAmount`. A branch's very first-ever shift run has no such handover — the baseline silently defaulted to 0, so any real cash actually placed in the drawer that morning (an owner-funded float) would show up as a fabricated "excess" at close, with no way to explain or trace it.

## What was implemented

- Schema: additive `shift_runs.opening_float_inr` (numeric, nullable — null means "not recorded", the pre-existing unaffected default), `opening_float_reference` (text, default `""`), `opening_float_recorded_by` (FK users.id, nullable), `opening_float_recorded_at` (timestamptz, nullable). Migration `drizzle/0045_gap033_shift_opening_float.sql`.
- `startFirstShift` now optionally accepts `openingFloatInr`/`openingFloatReference`. Recording a non-empty amount (including an explicit `"0"`, which is a deliberate recorded entry distinct from "not provided") requires the actor to be `BRANCH_MANAGER` (own branch) or `SUPER_ADMIN` (any branch) — a plain cashier is rejected 403 and nothing is written, but can still start a shift normally without a float, exactly as before. The amount is validated non-negative with at most 2 decimals; a negative or non-numeric value is rejected 400.
- Immutability/no-double-count: the float is set only once, at the moment the run row is created. There is no update path, and `startFirstShift` already rejects a second attempt with 409 ("A shift is already open for this branch") before it could ever try to persist a second float for the same branch — so "duplicate float" is structurally impossible, not just policy.
- `endShiftAndHandover`'s expected-cash baseline is now `incoming?.cashAmount ?? run.openingFloatInr ?? "0"` — a run with no incoming accepted handover (only ever the branch's first run) falls back to its own recorded opening float, or to `"0"` if none was ever recorded (identical to the pre-existing behavior for every branch that doesn't use this). Every later run always has a real incoming handover and ignores its own `openingFloatInr` (which stays `null` for those runs).
- UI: the Cash Drop "Start Shift" card shows an optional opening-float amount + source/reference field, visible only to Branch Manager/Owner roles — a plain cashier sees the unchanged, plain "Start Shift" button.

## Verification performed

- Full suite: 680/680 passing (added `gap033-service.test.cjs` — 5 tests covering: a recorded float becoming the real close baseline with no incoming handover; cashier denial with no write, cashier still starting normally without one; owner authorization and explicit-zero handling; negative/invalid amount rejection; structural impossibility of a duplicate float via the existing "shift already open" 409; and a later run correctly ignoring its own null float and using the carried-forward drawer balance instead).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/cash-drop` and `/api/shift-runs` both compiled.
- Migration 0045: fresh apply (45 → 46 migrations) and no-op re-apply (46 → 46, no error) verified against a disposable local Postgres container (`restaurant-gap033-qa`, stopped and removed after use), confirming the four new columns and the FK land on `shift_runs` exactly as declared.

## Explicit limits

No mid-shift top-up, cash-expense, refund, or HO-dispatch movement types — that is the larger drawer-movements ledger the blueprint proposed, explicitly deferred by the owner's scope decision this session. No production migration, commit/push, or deployment — batched with future gaps.
