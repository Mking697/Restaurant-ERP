# GAP-032 — local verification (generalized scope, no real online provider)

Status: VERIFIED_LOCAL. Owner confirmed (November 4, 2026) generalizing this gap's acceptance to "any order dispatched to fulfillment before payment is confirmed" — today that is the existing CONVENTIONAL dine-in OPEN order — rather than requiring a real online-platform provider, which does not exist (see GAP-030/031 BLOCKED). No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## Finding: this gap's generalized acceptance was already substantially satisfied

Inspecting the existing GAP-023/024/025/026 lifecycle code showed every piece of this gap's acceptance criteria already implemented, with **no application code changes needed** in this pass:

- **Order/fulfillment status distinct from payment status**: `pos_orders.status` (`OPEN`→`PAID`) already represents exactly this. A `PRODUCTION_FIRST` order is created `OPEN` — KOT fires, stock is deducted, COGS is captured — with `tenderType` empty and no payment row, and is never falsely marked paid (`src/lib/server/pos-orders.ts`).
- **Unpaid amounts are shown; controlled settlement/receipt transition exists**: `listPosPayments` (`src/lib/server/pos-payments.ts`) already returns `coverage: 'OPEN'` with the real `outstandingAmount`, surfaced in the POS Payments panel (`src/app/pos/payments-panel.tsx`). `settlePosOrder` is the one controlled transition from OPEN to PAID, producing the receipt/FINAL/payment at that point, not before.
- **Shift tender inclusion follows policy, not automatic cash treatment**: `readPosCollectionTenders` (`src/lib/server/pos-collections.ts`) already filters to `status === "COMPLETED" || status === "PAID"` — an OPEN order's amount is structurally excluded from shift-close cash/card/UPI totals, proven directly in this pass's new test.
- **Repeated settlement cannot double-post**: `settlePosOrder` requires `order.status === "OPEN"` to settle at all, so a second settlement attempt (a different idempotency key) on an already-PAID order is rejected 409 — only an exact-key retry replays the cached result. Proven end-to-end in this pass's new test.
- **Stock/COGS are captured once, at dispatch, never recomputed at settlement**: `deductStock`/`computeOrderCogs` are called only inside `createPosOrder`, never inside `settlePosOrder` — proven by call-count assertions in this pass's new test.

## What this pass added

- `tests/gap032-service.test.cjs` (2 tests): a direct unit proof that `readPosCollectionTenders` excludes an OPEN order's amount from shift cash entirely, and an end-to-end integration proof through the real `createPosOrder`/`settlePosOrder`/`listPosPayments`/`readPosCollectionTenders` functions covering the full chain: dispatch-before-pay → unpaid amount shown → excluded from shift cash → settled once → included in shift cash once → a second distinct settlement attempt rejected 409 with no re-deduction → an exact-key replay returns the same result with no duplicate payment.

## Verification performed

- Full suite: 675/675 passing (2 new tests; zero existing tests modified or weakened — this pass touched no application source file, only added a new test file).
- TypeScript: `tsc --noEmit` clean.
- No schema/migration/build change — nothing to migrate or rebuild, since no application code changed.

## Explicit limits

"Reconcile with provider reference" from the original acceptance remains out of scope — there is no real online-platform provider (GAP-030/031 BLOCKED) to reconcile against. For the generalized dine-in scope used here, the equivalent identity is the existing `tableNo`, which is already present. If/when the owner names a real delivery-platform provider, GAP-030/031 unblock and this gap's online-specific "provider reference" piece can be layered on top of the state machine verified here. No production migration or commit/push/deployment is authorized — batched with future gaps.
