# GAP-026 — local implementation verification

Status: VERIFIED_LOCAL. Scope and authorization: `docs/gap026-contract.md`. No commit/push, production migration or deployment authorized at this checkpoint.

## What was implemented

- Schema: additive `pos_payments` (one per order/receipt, unique-indexed) and `pos_payment_allocations` (one full allocation per payment/order/receipt), plus `posOrders.paymentCaptured` boolean (default false, legacy rows stay false — no backfill). Migration `drizzle/0041_gap026_pos_payments.sql`.
- Capture: `capturePosPayment` runs inside the SAME existing transaction as payment-first `createPosOrder` and full `settlePosOrder`, after the receipt/applicable FINAL and before the saved acknowledgment. Records actual collector id/name, settling shift run, collected timestamp, saved tender/FX, source action (CREATE/SETTLE) and the linked FINAL (nullable). Exact retry/replay returns the identical persisted payment — no duplicate row.
- Read: `listPosPayments` / GET `/api/pos/payments` returns truthful OPEN / CAPTURED / LEGACY / UNAVAILABLE coverage per order — OPEN shows 0 collected and full outstanding (never debt for a standalone proforma); CAPTURED shows the verified payment; LEGACY (paid before this gap, `paymentCaptured=false`) shows only the preserved total with no invented collector; UNAVAILABLE fails closed when marked evidence is missing/inconsistent, never falling back to a fabricated paid/zero projection. Bounded (200), branch/privacy-scoped before the limit, POS_CASHIER-gated, Kitchen denied.
- Shift close: new shared seam `readPosCollectionTenders` (src/lib/server/pos-collections.ts) replaces the old separate COMPLETED/PAID tender queries in `endShiftAndHandover`. Captured-ledger rows are read through verified payment evidence; legacy rows keep using their own order projection — each collected amount is counted exactly once. A captured row with missing/inconsistent evidence throws HttpError 409 and blocks the close rather than silently re-using the order projection.
- UI: new read-only `PosPaymentsPanel` mounted on `/pos`, refreshed after confirmed New Order / Add items / Settle / visibility writes and after the lifecycle/documents panels' own confirmed changes — without remounting on a mutation or discarding in-flight document/lifecycle quarantine. Validates DTO bounds/identities client-side and fails closed on any malformed server response.

## Verification performed

- Full suite: 655/655 passing (added gap026-service.test.cjs — 2 tests — and gap026-ui.test.cjs — 7 tests; fixed three pre-existing GAP-023/024/025 service-test mocks that didn't yet model the new payment tables/`actor.name`/`paymentCaptured` default, with no weakening of their original assertions).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/pos` and `/api/pos/payments` both compiled.
- Migration: generated cleanly (0041, additive only — 2 new tables + 1 new boolean column, 5 FKs, 3 unique indexes). Verified fresh apply (0 → 42 migrations) and no-op re-apply (42 → 42, no error) against a disposable local Postgres container (`restaurant-gap026-qa`, stopped and removed after use).
- Real-database smoke (actual Postgres, actual Drizzle schema, actual service functions — no mocks): payment-first create captures an immutable payment (amount/collector/shift correct); exact replay returns the identical payment with no duplicate row persisted; a Conventional OPEN dine-in order has no payment until full settlement, then captures one at settle; the shared shift-close seam totalled two real orders' cash exactly once (TSh 30.00, not double-counted); the GET-equivalent listing reported exactly 2 CAPTURED orders with truthful coverage. All checks passed; the disposable DB/fixtures were torn down afterward.

## Explicit limits

No partial/split tender, overpayment/change handling, refund, or provider-send integration. No production schema, commit/push, or deployment — those require a separate release authorization, distinct from GAP-025's.
