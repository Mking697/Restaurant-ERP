# GAP-041 — local implementation verification

Status: VERIFIED_LOCAL. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## What was implemented

No schema change — this is a read-only service over existing tables (`posOrders`, `posOrderLines`, `menuItems`), plus two new GET API routes. `src/lib/server/repeat-orders.ts`:

- `recentOrdersForMember(tx, actor, branchId, customerId)`: resolves the member's phone (GAP-038's `customers` table), then queries `posOrders` scoped to that EXACT branch + phone + PAID/COMPLETED status, with `operationalOrderVisibility(actor)` applied at the query boundary itself — a hidden (`ownerOnly`) order never surfaces in the list for a non-Owner, before any limiting/returning happens. Deliberately does **not** attempt cross-branch matching — a cloned-menu item's identity on a different branch is a separately unresolved mapping problem, out of this pass's scope (not silently assumed safe).
- `repeatOrderPreview(tx, actor, branchId, customerId, orderId)`: a READ-ONLY preview that maps a specific past order's lines onto the branch's CURRENT catalog — an item that no longer exists is flagged `removed`, one that still exists but is `isActive: false` is flagged `inactive`, and every still-available line's price/total is computed from the CURRENT `menuItems.price`, never the historical snapshot stored on the order line (so "no silent historical-price reuse" holds by construction — there is no code path that could serve a stale price). The target order must belong to this exact member, this exact branch, and pass the actor's own visibility — a foreign-member order, a different-branch order, a hidden order, and a genuinely nonexistent order id all return the IDENTICAL generic 404, never distinguishable (same posture as GAP-040's lookup).
- This function **never posts an order**. Actually placing a repeat order reuses the EXISTING, already-tested `createPosOrder`/`addPosOrderLines` flow unchanged — the cashier adds the same `menuItemId`s shown in the preview as an ordinary new order, which already always prices from the live catalog. This is a deliberate design choice, not an oversight: it means there is zero new order-submission code path to get wrong, and the cashier's own act of building that new order IS the "explicit confirmation" the acceptance requires — there is no automatic reorder-posting anywhere.
- API: `GET /api/customers/[id]/repeat-orders?branchId=...` (list), `GET /api/customers/[id]/repeat-orders/[orderId]?branchId=...` (preview). Both POS_CASHIER-module gated, reusing GAP-038/040's authority conventions.
- This feature has zero dependency on GAP-039's reward ledger — it never imports or calls any reward function, so a reward-system outage cannot affect ordinary member lookup/reordering (the acceptance's own explicit requirement), verified by construction (nothing to disable, nothing to catch) rather than by an added defensive try/catch.

## Verification performed

- Full suite: 729/729 passing (added `gap041-service.test.cjs` — 5 tests: `recentOrdersForMember` correctly excludes a different branch's order, a different customer's order, a non-PAID order, and a hidden order for a non-Owner — while proving the Owner alone sees the hidden one too; `repeatOrderPreview` uses the current (changed) price rather than the frozen snapshot and flags the change; a removed item and an inactive item are both flagged and excluded from the preview total while a still-available line counts correctly; a foreign-member/different-branch/hidden/nonexistent order id all produce byte-identical 404 messages; and an unknown/non-ACTIVE member throws rather than silently returning an empty list).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; both new routes compiled.
- No migration needed (no schema change) — nothing to verify against a disposable database for this gap.

## Explicit limits

No POS UI panel yet showing "recent orders" / "add again" after a QR/manual lookup — API-only this pass, consistent with GAP-038/039/040's same deferral pattern. No cross-branch repeat-order support (a cloned-menu item's identity across branches is an unresolved mapping problem, explicitly not solved here). No production migration, commit/push, or deployment — batched with future gaps.
