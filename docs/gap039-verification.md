# GAP-039 — local implementation verification

Status: VERIFIED_LOCAL. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## Owner-approved policy (this session, precondition per the acceptance's own wording — not invented)

- Eligibility: every PAID/COMPLETED order, no minimum amount.
- Earn rate: 1 point per TSh 1,000 spent (floor division — a TSh 1,999 order earns 1 point, never rounds up to 2).
- Redeem value: 1 point = TSh 50 discount, snapshotted onto the REDEEM event at redemption time (never recomputed later from a possibly-changed rate).
- Expiry: 12 months from each EARN event's own date, FIFO (the oldest still-unconsumed points expire first).
- Accounting: a redemption is treated as a discount reducing revenue directly, not a separate marketing expense line.

These five decisions are recorded verbatim in `src/db/schema/rewards.ts`'s doc comment and must not be changed without a fresh explicit owner approval.

## What was implemented

- Schema: new append-only `reward_events` table (migration `drizzle/0050_gap039_reward_events.sql`) — `type` (EARN/REDEEM/EXPIRE/REVERSE), `points` (always a positive magnitude; the signed effect on balance is derived from `type`, never stored as a sign), `sourceOrderId` (EARN only, UNIQUE — one earn per order), `expiresAt` (EARN only, frozen at earn time), `amountTsh` (REDEEM only), `reversesEventId` (REVERSE/EXPIRE's target event, UNIQUE — an event can be settled by at most one terminal event, ever). Rows are never updated or deleted once inserted. Added to the `src/db/schema/index.ts` barrel so the existing schema-driven branch-dependency discovery automatically covers `reward_events.branchId`.
- `src/lib/server/rewards.ts`:
  - `rewardBalance`: pure function over the full event list — a REVERSE and its target cancel to exactly zero net contribution, so everyday balance reads are a simple linear sum, never an independently mutable "points" field.
  - `earnPoints`: reads the REAL order row (never a client-supplied amount), verifies PAID/COMPLETED eligibility, computes points via floor division, and is idempotent per `sourceOrderId` (a retry returns the existing event via the DB's own unique-index violation path, never a second earn).
  - `redeemPoints`: serialized per customer via an advisory lock (same convention as `lockShiftState`) so two concurrent redemption requests can never both succeed beyond the real balance; rejects overspend; snapshots the TSh-50-per-point rate onto the event.
  - `reverseEarnForOrder`: claws back an order's earn (e.g. on void) — idempotent (a retry or an order that never earned anything is a safe no-op), structurally cannot double-reverse.
  - `expireOldEarns`: the one place that actually needs full FIFO lot replay — correctly sizes an aged-out lot's remaining (post-redemption) balance before posting its EXPIRE event, leaving a newer un-aged lot and already-redeemed points untouched; safe to call repeatedly (idempotent per lot via the same unique index).
- API: `GET /api/customers/[id]/rewards` (balance + history), `POST .../rewards/earn`, `POST .../rewards/redeem` (both POS_CASHIER-module), `POST .../rewards/reverse` (Branch Manager/Owner), `POST .../rewards/expire` (Owner-only maintenance action).

## Verification performed

- Full suite: 718/718 passing (added `gap039-service.test.cjs` — 7 tests covering: a REVERSE netting its target to exactly zero in `rewardBalance`; `earnPoints` reading the real order total with floor division and idempotency; rejection of a non-eligible order and a correct zero-point no-op for a sub-threshold order; `redeemPoints` overspend rejection and rate snapshotting; two sequential redemption calls proving the lock-then-recheck pattern prevents overspend; `reverseEarnForOrder`'s idempotent claw-back and no-op-for-never-earned cases; and `expireOldEarns`'s FIFO-correct partial-lot expiry, proving an already-redeemed portion is never double-charged and a fresh un-aged lot is untouched).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; all 5 new reward API routes compiled.
- Migration 0050: fresh apply (50 → 51) and no-op re-apply (51 → 51, no error) verified against a disposable local Postgres container (`restaurant-gap039-qa`, stopped and removed after use). BOTH unique constraints were directly exercised with real duplicate `INSERT` statements (`source_order_id` and `reverses_event_id`), each genuinely rejected by Postgres, not just application code.

## Explicit limits (deliberately deferred, same pattern as GAP-038)

No POS-time integration yet — nothing in `pos-orders.ts`/`pos-order-reversals.ts` automatically calls `earnPoints`/`reverseEarnForOrder`; these are standalone, independently callable/testable primitives, not yet wired into real order-creation or the real void flow. No admin/POS UI screen for staff to view a member's balance or trigger earn/redeem/reverse — API-only this pass. No scheduled job calls `expireOldEarns` automatically (it is callable on demand per customer via the Owner-only API; a cron wiring, if wanted, is a follow-on). No Accounts/VAT ledger wiring for the "redemption is a discount" decision — that accounting entry is not yet posted anywhere; recording it is deferred pending the actual POS-integration pass that would need to decide exactly where in the VAT/discount calculation a redemption applies. No production migration, commit/push, or deployment — batched with future gaps.
