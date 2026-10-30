# UX-1b historical purchase lookup verification — October 30, 2026

Status: COMPLETE — LOCAL FUNCTIONAL ACCEPTANCE. Local/uncommitted only.

## Implemented

- `GET /api/purchase/orders/approved-indents/[id]?branchId=...` — branch-bound exact read of one APPROVED indent (id, branchId, lines with rawMaterialId/qty/name/unit). PURCHASE_ORDER-gated, exactly one branchId query param, strict unknown-field/duplicate rejection, 404 on missing/ineligible/wrong-branch indent.
- `GET /api/purchase/grns/[id]?branchId=...` — reuses the existing locked `readGrns` DTO (quality/receipt/line state untouched); same strict query/permission rules, 404 if not found in the explicit branch.
- Purchase "New Purchase" dialog: bilingual "Full indent ID" input + "Look up approved indent" action; found indent's locked quantities flow into the existing rate-entry UI unchanged. Branch/dialog/type changes discard stale lookup results.
- Vendor Returns panel (Purchase mode only, not Accounts): bilingual "Full GRN ID" input + "Look up finalized GRN"; only a GRN passing the existing client `trusted()` check (qualityRecorded, not reconciliationRequired, FAIL/PARTIAL) can be selected and registered as a claim. No stock/money side effect from the lookup itself.
- GRN quality's unknown-outcome recovery now reads the exact GRN by ID + original branch instead of searching the bounded latest-200 list, preserving all existing receipt/line verification and retained-intent locks.
- Existing latest-200 list endpoints/disclaimers unchanged; lookup is an additional path, not a replacement.

## Parent-run gates

- Focused: `historical-purchase-lookup.test.cjs`, `purchase-ui.test.cjs`, `grn-quality-ui.test.cjs`, `vendor-returns-ui.test.cjs`, `purchase.test.cjs`, `grn-quality.test.cjs`, `vendor-return.test.cjs` — all pass (123 tests across this set).
- Full `node --test tests/*.test.cjs`: 357/357, no failures/skips.
- `tsc --noEmit --incremental false`: clean before and after QA.
- Isolated `.next-historybuild` production build: exit 0.
- Guarded `tests/historical-purchase-lookup.integration.cjs` (34 real HTTP/Postgres checks): 34/34 on dev (port 4322) AND on the compiled app (port 4323, `.next-historybuild`). Covers >200 newer approved indents/GRNs hiding historical targets in bounded lists, minimal/complete exact DTOs, every permission/branch/query-shape denial (anonymous, Accounts-only, inventory-only, missing/duplicate/foreign branchId, status-override attempt, unknown query key, foreign branch, foreign ID in own branch, missing/blank/overlong ID) for both indent and GRN readers, scoped404 on ineligible own-branch indent, no-write readback on every GET, idempotent concurrent-replay registration of an authorized historical failure, immutable claim amounts (never money received), lost-quality-response recovery by exact ID outside the list, and live-grant recheck on the exact GET.

## Browser acceptance

Dedicated dev app (port 4322) with a disposable synthetic Owner session (no password typed): opened New Purchase, selected the branch, entered a historical indent's full ID (not present in the latest-200 list), clicked Look up approved indent — locked quantity (7.000 kg) appeared and was selectable for Step 1. Opened Vendor Returns (Purchase mode), entered a historical finalized PARTIAL GRN's full ID, clicked Look up finalized GRN — it appeared as a selectable trusted option, was selected, Register failed-quantity claim submitted successfully with a non-money confirmation. Exact Postgres readback after the browser action confirmed the claim row (`qty_returned=1.000`, `refund_amount_inr=10.00`) — not a toast-only claim. No pixel/device-matrix screenshot acceptance claimed this pass; DOM/state-based verification only (Radix tab triggers needed a CDP box-model click, consistent with this project's known quirk).

## Independent review

Independent reviewer `deleg_659cea04` ran the four requested focused `.cjs` files, found zero security/logic blockers; `passed:true`. Two nonblocking stylistic suggestions: (a) add a one-line comment on why the indent route doesn't wrap auth in `locked()` while the GRN route does (intentional — GRN reuses the tx-based `readGrns` helper), (b) `historicalId`'s control-character regex doesn't reject some non-control Unicode whitespace/format characters — flagged as a hardening idea, not a vulnerability given existing length/trim checks.

## Isolation and cleanup

Dedicated database `restaurant_erp_purchase_history_qa_20261030` on 127.0.0.1:5436, migrated using the existing chain only. Dev/start servers (ports 4322/4323) stopped; both dist dirs removed. Browser fixture script created/read-back/cleaned up its own rows; final exact-count readback across branches/users/sessions/indents/grns/material_returns/vendors/inventory_stock all zero. `tsconfig.json`/`next-env.d.ts` diff-clean against the pre-session baseline; final `tsc` clean.

## Remaining

Historical-lookup pagination/UX across other modules, broader UX-1 desktop/laptop/tablet/mobile/pixel QA, FINANCE-1/2, AUTOMATION-1, EVIDENCE-1, PURCHASE-3 settlement, and SECURITY-1 dependency upgrades are unchanged and still open. See `historical-purchase-lookup-contract.md` and `pending-work-resume-20261030.md`.
