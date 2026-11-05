# GAP-027 — approved local implementation plan

Status: PENDING exact-plan confirmation recorded; owner confirmed via clarify (both Qs answered) on November 4, 2026 chat turn. This document records the inspected approach. No commit/push/production migration/deployment is authorized by this plan — those are explicitly deferred to a later combined release per the owner's own words ("last me commit, push, migration, deploy krenge sb ek saath").

## Inspected current behavior

- `src/db/schema/pos.ts`: orderStatusEnum already has `VOIDED`; `voidReason`/`voidedAt` columns exist but are only set by the EXISTING unpaid-OPEN cancellation path (`actPosOrder` CANCEL action, `src/lib/server/pos-lifecycle.ts:229`), which explicitly refuses PAID orders: `"Paid orders cannot be cancelled here; use GAP-027 void/refund"`.
- `src/lib/server/pos-lifecycle-policy.ts:6`: `lifecycleCapabilities(actor).canCancel` is already `owner || (BRANCH_MANAGER && canCashier)` — the correct manager-authority gate to reuse for void too.
- `src/db/schema/pos.ts:157` `posAlerts`: a lightweight owner-notification row (VOID/HIGH_DISCOUNT + reason + sentToOwner), NOT a structured reversal/audit record with references to stock/payment/COGS. Reused as a notification side-effect only, not the reversal ledger itself.
- GAP-026 `pos_payments`/`pos_payment_allocations` are immutable (no update/delete service) — void must NOT mutate or delete them; it creates a new linked reversal fact instead.
- `src/lib/server/stock-ledger.ts` `postStockMovement`: the one posting seam; a genuine restock uses a negative-of-original (reversing) `qtyDelta` with a distinct `movementType`/`sourceType` so it is auditable as a reversal, not a fresh receipt.
- Reward ledger (GAP-039) does not exist yet in this codebase — void reward reversal is explicitly out of scope until that feature exists.

## Owner-confirmed scope decisions

1. Waste stock from a paid/prepared void is recorded ONLY in the new reversal record (which items/qty became unusable); no new wastage-ledger/cost posting in this pass.
2. Order status stays `VOIDED` (existing field/value); reversal detail (reason, actor, what restocked vs wasted, refund-liability amount) is shown in a separate read-only panel, not a new status/badge.

## Proposed approved-scope candidate

1. Server-enforced void action on a PAID/COMPLETED order: BRANCH_MANAGER (own branch only) or SUPER_ADMIN (any branch), reusing `lifecycleCapabilities(actor).canCancel`. Cashier-only access is explicitly denied; cross-branch denied via existing `branchScope`.
2. One new immutable, append-only `pos_order_reversals` row per voided order (unique on orderId — exactly one void per order, retry-safe): records reason (required, 3-500 chars, mirroring the existing visibility-reason pattern), actor id/name, prior status, timestamp, linked payment/receipt/FINAL ids (nullable — a void before payment capture has none), per-ticket-line restock-vs-waste breakdown, and the refund-liability amount (nullable — 0 only if nothing was ever collected).
3. Stock reversal by original ticket-line status at void time: lines whose production ticket never reached `SERVED` (still SENT/PREPARING/READY/CANCELLED) genuinely restock via one reversing `postStockMovement` entry (negative-of-original delta, new `movementType: "ORDER_VOID_RESTOCK"`); lines already `SERVED` are recorded as waste in the reversal row only (owner-confirmed: no new wastage-ledger posting this pass). COGS for the voided order is explicitly excluded from forward-looking COGS aggregates once voided (reversal row carries the original COGS amount for audit, existing COGS record itself stays untouched/historical).
4. Payment/refund liability: if the order had a captured GAP-026 payment, the reversal row records `refundLiabilityAmount` = that payment's amount; the original `pos_payments`/`pos_payment_allocations` rows are never edited or deleted. No bank/provider refund execution — liability is a recorded fact only.
5. API: `POST /api/pos/orders/[id]/void` (new route, mirrors `settle`'s auth/branch-scope/HttpError pattern) calling a new `voidPosOrder(tx, actor, orderId, { reason })` in `pos-orders.ts` (co-located with the other order-lifecycle mutations it must coordinate with). Idempotent: voiding an already-VOIDED order with the same reason replays the existing reversal; a different reason on an already-voided order is rejected (no silent second reversal).
6. Read: extend the existing POS lifecycle/documents reads with reversal detail only for orders that have one (new `GET` is unnecessary — fold into the existing order read used by `listPosLifecycle`/history, or a small dedicated panel reading by orderId, decided during implementation against the exact current DTO shape).
7. UI: a new read-only "Void order" action gated by `canCancel`, visible only for PAID/COMPLETED orders in-scope, with a confirmation dialog (reason textarea, expected restock/waste/refund-liability preview) — no auto-execute. A separate read-only reversal detail panel/section shows the recorded outcome once voided. Existing Owner-only visibility hide stays a fully separate, unrelated action.
8. Preserve: original invoice/FINAL/receipt/COGS records (never rewritten), existing COMPLETED/VOIDED report filters (must now correctly treat GAP-027 voids the same way as any other VOIDED row), duplicate-reversal prevention, and GAP-026's payment immutability.

Example: a paid dine-in order with 2 served items + 1 only-SENT item is voided by the branch manager. Reversal row records: 1 item restocked (its ticket never reached SERVED), 2 items marked waste, refund liability = the order's captured payment amount, reason and manager's name/time. Retry with the same reason returns the same reversal; a cashier or a different branch's manager gets 403.

## Verification before local completion (same discipline as GAP-023/024/025/026)

Strict RED/GREEN tests (service + UI); full suite/TypeScript/build must stay green; one coherent additive migration proof (fresh/legacy/no-op) against a disposable QA Postgres; real-DB smoke (no mocks) proving: manager void of a paid order creates exactly one reversal with correct restock/waste split and refund-liability amount; cashier/foreign-branch-manager/already-voided-with-different-reason are rejected; exact-reason replay returns the identical reversal with no duplicate row or second stock reversal; voided order's original FINAL/receipt/COGS/payment rows are byte-for-byte unchanged. No commit/push/production migration/deployment — deferred per owner's explicit instruction to batch that with future gaps.
