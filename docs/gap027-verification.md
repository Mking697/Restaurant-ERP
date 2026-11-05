# GAP-027 — local implementation verification

Status: VERIFIED_LOCAL. Scope and authorization: `docs/gap027-plan.md`, with the two owner-confirmed scope decisions recorded there. No commit/push, production migration or deployment authorized at this checkpoint — owner's explicit instruction is to batch that with future gaps.

## What was implemented

- Schema: additive `pos_order_reversals` (unique on orderId — one void per order), and the `stock_movement_type` enum extended with `ORDER_VOID_RESTOCK`. Migration `drizzle/0042_gap027_order_reversals.sql`.
- Authority: `voidPosOrder` requires BRANCH_MANAGER (own branch, with POS_CASHIER module access) or SUPER_ADMIN (any branch), reusing the existing `lifecycleCapabilities(actor).canCancel` gate. Cashier and foreign-branch manager are rejected with 403. An `ownerOnly` order is invisible to a non-Owner, same as every other POS action.
- Scope boundary: only a PAID/COMPLETED order can be voided this way (409 otherwise, directing to the existing OPEN-order cancel action).
- Reversal: one append-only `pos_order_reversals` row per void — reason, actual actor id/name, prior status, links to the original payment/receipt/FINAL (nullable), a COGS-at-void snapshot (audit only, never edits the order's own `cogsAmount`), refund-liability amount (= the captured GAP-026 payment's amount, or null), and a per-line restocked/wasted breakdown. The original payment/receipt/FINAL/order rows are never mutated or deleted — proven by real-DB check (payment row count and content unchanged after void).
- Stock reversal: a line is genuinely restocked only if its production ticket never reached SERVED; a line already SERVED, or whose BOM recipe can no longer be computed (edited/removed after the sale), is recorded as waste in the reversal row only — no new wastage-ledger posting in this pass (owner-confirmed scope). Restock posts through the existing `stock-ledger.ts` seam with a new `ORDER_VOID_RESTOCK` movement type, crediting `inventory_stock`/`semi_fg_stock` back.
- Idempotency: voiding an already-VOIDED order with the exact same reason replays the existing reversal (no duplicate row, no second stock movement); a different reason on an already-voided order is rejected with 409, not silently accepted as a second reversal.
- API: `GET/POST /api/pos/orders/[id]/void` — GET reads the existing reversal (null if none, branch/privacy-scoped); POST performs the void.
- UI: new read-only `PosVoidPanel` on `/pos`. Branch Manager/Owner see a "Void order" action on each PAID/COMPLETED order with a reason prompt; everyone else sees a read-only notice. A successful void shows the restock/waste/refund-liability breakdown in a dedicated "Recent void reversals" section (separate from the main order list, per the owner's confirmed answer), and the voided order naturally drops out of the payment-history list on refresh (GAP-026's listing already excludes VOIDED orders). An unknown outcome freezes the exact same reason text for a safe retry.

## Verification performed

- Full suite: 664/664 passing (added `gap027-service.test.cjs` — 4 tests — and `gap027-ui.test.cjs` — 5 tests; no existing test was weakened).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/pos` and `/api/pos/orders/[id]/void` both compiled.
- Migration 0042: fresh apply (42 → 43 migrations, including the `ALTER TYPE ... ADD VALUE`) and no-op re-apply (43 → 43, no error) verified against a disposable local Postgres container (`restaurant-gap027-qa`, stopped and removed after use).
- Real-database smoke (actual Postgres, actual Drizzle schema, actual service functions — no mocks): cashier and foreign-branch manager void rejected 403; branch manager void of a real paid TAKEAWAY order persisted VOIDED status/reason and a reversal linking the real payment/receipt/FINAL; the original GAP-026 payment row was provably untouched (count and content unchanged); a never-served ticket line genuinely restocked (+2.000 units, correct movement); exact-reason replay returned the identical reversal with no duplicate row; a different reason on an already-voided order was rejected 409; a Conventional dine-in order's never-served line restocked exactly 1.000 unit with exactly one `ORDER_VOID_RESTOCK` ledger entry; `readOrderReversal` returned the persisted reversal and correctly rejected a foreign-branch read. All checks passed; the disposable DB/fixtures were torn down afterward.

## Explicit limits

No new wastage-ledger posting for waste-classified lines in this pass (owner-confirmed scope — recorded in the reversal row only). No refund execution (bank/provider) — refund liability is a recorded fact only. No reward-points reversal (that feature, GAP-039, does not exist yet). No partial void (an order is voided in full). No production schema, commit/push, or deployment — batched with future gaps per the owner's explicit instruction.
