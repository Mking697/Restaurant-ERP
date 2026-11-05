# GAP-035 — local implementation verification

Status: VERIFIED_LOCAL. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## What was implemented

- Schema: additive `branch_expenses.payment_method` (text, default `""` — unspecified/legacy, the pre-existing behavior) and `branch_expenses.shift_run_id` (text, default `""`), plus two DB-level CHECK constraints: `payment_method in ('', 'CASH', 'NON_CASH')`, and `(payment_method = 'CASH' and shift_run_id <> '') or (payment_method <> 'CASH' and shift_run_id = '')` — the invariant "only CASH ever carries a shift link, and CASH always does" is enforced by Postgres itself, not just application code. Migration `drizzle/0046_gap035_expense_drawer_cash.sql`.
- `parseExpense` (`src/lib/server/expenses.ts`) accepts an optional `paymentMethod` (`""` | `"CASH"` | `"NON_CASH"`, defaulting to `""`). **`shiftRunId` is not an accepted client field at all** — it is not in the allowed-fields list, so a client attempting to supply one directly is rejected 400 outright. This is what makes a backdated/foreign/closed-run bypass structurally impossible, not just policy: there is no input path that could ever name one.
- `POST /api/accounts/expenses`: when `paymentMethod === "CASH"`, the server resolves `shiftRunId` itself from the branch's actual currently-open run (`lockShiftState` + `currentOpenRun`, the same primitives shift-close already uses) — rejecting 409 if there is no open shift. A NON_CASH or unspecified expense never gets a shift link at all.
- `endShiftAndHandover` (`src/lib/server/shifts.ts`) now subtracts every `POSTED` `CASH`-method expense linked to the run being closed from expected cash, exactly once. A `VOID`ed expense is excluded live (read at the one close checkpoint, so a correction made before close never double-subtracts or needs a second compensating entry). A `NON_CASH`/unspecified expense, or one linked to a different run, never touches this calculation.
- `postExpenseJournal` (Accounts P&L posting) is unchanged — a cash OR non-cash expense is still a real operating cost either way; only the DRAWER reconciliation differs by payment method, not the accounting entry.
- UI: the Accounts "Post expense" form gained a "Payment method" selector (Not specified / Cash from today's shift drawer / Bank/Card/Other), with a plain-language note that a CASH choice requires an active shift. The saved-expenses table shows the resolved payment method per row. The session-recovery/retry journal (`src/lib/expense-attempt.ts`) was updated in lockstep so a recovered pending attempt's own internal consistency check still matches the new field — this is a safety-critical module (never fabricate a result on retry), so it was updated together with the entry shape, not left stale.

## Verification performed

- Full suite: 690/690 passing (added `gap035-service.test.cjs` — 6 tests: `paymentMethod` validation including rejection of a directly-supplied `shiftRunId`; the exact "TSh 20,000 cash expense closes with zero shortage" example from the acceptance criteria; proof a NON_CASH expense at the same amount never touches expected cash; proof a VOIDed cash expense is excluded live; proof a cash expense linked to a *different* run never leaks into this close; and proof multiple real cash expenses in the same run sum exactly).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/accounts`, `/cash-drop`, and `/api/accounts/expenses` all compiled.
- Migration 0046: fresh apply (46 → 47 migrations) and no-op re-apply (47 → 47, no error) verified against a disposable local Postgres container (`restaurant-gap035-qa`, stopped and removed after use). The two new CHECK constraints were directly exercised with real `INSERT` statements: a CASH expense with an empty `shift_run_id` was genuinely rejected by Postgres (not just application code), and a CASH expense with a real run id was accepted.

## Explicit limits

No partial/split cash+non-cash single expense (an expense is one payment method, in full). No automatic reversal journal entry on void (voiding retains the existing audit-only behavior; a correcting entry, if needed on the Accounts side, is a separate manual posting, consistent with this codebase's existing append-only correction convention). No production migration, commit/push, or deployment — batched with future gaps.
