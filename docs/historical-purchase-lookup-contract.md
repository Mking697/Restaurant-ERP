# UX-1b — historical purchasing lookup

Local scope: remove the latest-200 discovery barrier for approved-indent selection and trusted historical GRN selection by adding authorized exact-ID reads, without uncapped scans or schema changes. Preserve accepted TASKS-1/UX-1a uncommitted work. No production, dependency, financial-posting or settlement changes.

## Read contract

- `GET /api/purchase/orders/approved-indents/[id]?branchId=...` returns `{indent: {id,branchId,lines:[{rawMaterialId,qty,name,unit}]}}` only for an APPROVED indent in the explicit authorized branch.
- `GET /api/purchase/grns/[id]?branchId=...` returns `{grn: ...}` using the existing receipt-aware `readGrns` DTO and locked/live-identity snapshot. This is an exact read, not a new stock/claim mutation.
- Both require live PURCHASE_ORDER authority, exactly one explicit branch (including Owner), strict unknown/duplicate query rejection and valid nonempty bounded text IDs. Do not add user-admin, INVENTORY, VENDOR_REFUNDS or indent-approval authority. Accounts-only users remain read-only without new purchase lookup access.
- Scope before selecting records; foreign branch query is denied, absent/ineligible ID in authorized branch is404 without revealing foreign existence. Exact filters apply before the existing list limit; neither reader discovers unrelated history nor accepts a client-provided receipt/trust flag.
- Preserve existing latest-200 list endpoints and bounded claims display. Advertise those bounds honestly; exact lookup is an alternative discovery path, not an all-history balance or general pagination implementation.

## UI contract

- PO store dialog: bilingual full-indent-ID input + explicit read-only lookup action for its selected branch. Use returned approved quantities and rate-entry UI unchanged; clear obsolete indent selection/rates while looking up or after failed lookup. Branch/type/dialog/identity changes discard stale results; missing/foreign/wrong-id/malformed responses must not enable submission.
- Purchase vendor-returns panel: bilingual full-GRN-ID input + exact lookup, selecting only a current-branch trusted finalized FAIL/PARTIAL record through existing trust rules. Lookup cannot create claims, post stock or money. Loading/error/new lookup cannot replace a retained uncertain mutation intent. Accounts mode has no new purchase controls/reads.
- Quality unknown-outcome recovery must use exact GRN ID + original branch instead of searching the bounded latest list. Keep original payload/intention locked until every persisted line/receipt check passes. No automatic mutation retry or success inferred from missing/latest rows.

## Acceptance

Observe RED then GREEN for new exported routes/helper/UI behavior. Test >200 newer approved indents and >200 newer GRNs hiding the historical targets in the list, while exact authorized reads return the intended complete document. Cover narrow grants, Owner explicit branch, cross-branch/unknown/status query rejection, duplicate/unknown parameters, malformed DTOs, stale branch/identity/late-response/error paths, retained unknown-outcome safety and no-money/no-stock side effects. Parent full tests/typecheck/isolated build, real HTTP/Postgres dev and compiled suites, browser lookup/select/reload with committed readback, guide parity and independent scoped review required. Historical list/pagination and broader UX-1 visual/device work remain distinct.
