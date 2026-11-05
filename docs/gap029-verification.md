# GAP-029 — local implementation verification

Status: VERIFIED_LOCAL. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## What was implemented

- Schema: additive `pos_token_sequences` (branchId, businessDate, channel, lastValue; unique on the (branch, business-day, channel) triple) and `pos_orders.pickup_token` (text, default `""`). Migration `drizzle/0044_gap029_pos_token_sequences.sql`.
- Allocator: `src/lib/server/pos-tokens.ts` — `allocatePickupToken(tx, branchId, channel, now)`. Scoped to TAKEAWAY only (the gap's explicit title); every other channel (DINE_IN, SWIGGY, ZOMATO) returns `""` — a dine-in table never gets a pickup token, and a platform-specific display token is GAP-030's separate scope to layer on top later. Atomic under concurrency via a single `INSERT ... ON CONFLICT (branch, business_date, channel) DO UPDATE SET last_value = last_value + 1 RETURNING last_value` — the same raw-SQL-via-`tx.execute` pattern already used elsewhere in this codebase (`pos-documents.ts`'s `nextval()`, `debit-notes.ts`), so two concurrent takeaway orders in the same branch/business-day can never receive the same number. The counter only ever increases — a cancelled/voided order's token is never freed or reassigned. Rollover is implicit: a new Tanzania EAT business day is a new scope row starting at 1. Cross-branch collision is structurally impossible since `branchId` is part of the unique scope key.
- Wiring: `createPosOrder` allocates the token once per real (non-replayed) order creation and persists it on the order row; it is echoed on the order result, the receipt result, and every production ticket (KOT) in the response — distinct from the internal order id (`orderId`) and from the separate statutory invoice number (`pos_documents.number`). An exact idempotency-key replay returns the already-assigned token from the cached attempt, never allocates a second one.
- UI (POS New Order): the pickup token is shown prominently on the order-confirmation panel, on each KOT line, and on the receipt line, when one was assigned (i.e. for TAKEAWAY orders only).

## Verification performed

- Full suite: 673/673 passing (added `gap029-service.test.cjs` — 1 test on the allocator directly, covering channel scoping, sequential allocation, cross-branch isolation and a real Tanzania-EAT business-day rollover — and `gap029-orders-service.test.cjs` — 1 integration test through the real `createPosOrder` confirming the token lands on order/receipt/KOT and survives exact replay unchanged. Four pre-existing harnesses — gap023/024/025/026/027-service — were updated to mock/support the new allocator call path so no existing test's coverage was weakened).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/pos` compiled with the new allocator wired in.
- Migration 0044: fresh apply (44 → 45 migrations) and no-op re-apply (45 → 45, no error) verified against a disposable local Postgres container (`restaurant-gap029-qa`, stopped and removed after use).
- Real-database concurrency smoke (actual Postgres, no mocks): 40 genuinely concurrent connections allocating a token in the same branch/business-day/channel produced exactly `1..40` with zero duplicates and zero gaps; a second branch running concurrently against the first started its own sequence at 1 with no cross-branch collision. This is the strongest proof available that the atomic-allocation requirement actually holds under real concurrency, not just in a single-threaded mock.

## Explicit limits

No platform-specific display token for SWIGGY/ZOMATO on top of this allocator — that is GAP-030's separate scope. No UI/report for browsing historical pickup tokens by day (only the at-creation display). No production schema, commit/push, or deployment — batched with future gaps.
