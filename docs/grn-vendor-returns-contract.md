# GRN-2 vendor return/refund claims — October 29, 2026

Scope: local implementation/isolated QA, existing material_returns + audit_log only. No schema/dependency change, production writes or commit/push/deploy authorized by this task. GRN-1 release must remain intact.

## Meaning and permissions

FAIL/PARTIAL creates an immutable vendor return/refund CLAIM for every positive failed GRN line, in the same quality transaction. qtyReturned is the failed quantity submitted in this claim, NOT proof of physical dispatch or vendor acceptance. Explicitly label expected refund/credit, not actual money received. General descriptive purchase lines also support claims; no invented material stock movement. Amount = failed thousandths x saved PO-rate paise, rounded half-up once per line to paise; PO-rate value only, not an invented invoice/tax adjustment. Numeric(12,2) overflow blocks atomically. Zero-rate claims are allowed with 0.00 amount. No journal, cash/petty-cash/bank entry, inventory second deduction, settlement or vendor-confirmed credit is generated.

Existing trusted GRN-1 finalized failures can be registered explicitly once. New failures auto-register. PASS has no claim. Legacy quality/return records without trustworthy receipts require reconciliation, never automatic backfill or repair. Quality replay is no-write: it never silently creates missing old claims. For new quality receipts carrying vendorReturnsVersion:1, validate claims on replay and fail closed if missing/inconsistent.

Purchase record/list requires PURCHASE_ORDER, persisted branch scope and trustworthy quality receipt. No INVENTORY authority needed to register a historical claim because it never moves stock. New quality keeps GRN-1's PURCHASE_ORDER + INVENTORY store rule. Accounts read uses NEW VENDOR_REFUNDS read-only grant (Owner bypass), no automatic grants or user-admin/expense authority. Include Accounts navigation/page/guide visibility for this grant; it grants no settlement/write/purchase access.

## Persistence and API

Deterministic row ID `grn-return:<grnLineId>` for each failed line; one claim batch per GRN. All rows + `grn-returns:<grnId>` audit receipt with action GRN_VENDOR_RETURN_RECORDED/entity GRN share the existing mutate transaction. Metadata version 1 binds branchId, poId, vendorId and normalized immutable claim lines; no raw JSONB object-order comparison. submittedToAccountsAt means queued for Accounts, not paid. Reject partial/duplicate/foreign legacy rows, mismatched receipt or current quality/rates with 409; no partial registration.

- POST `/api/purchase/grns/[id]/returns` body `{}` only. Response `{ returns: ReturnRow[], replayed:boolean }`. Exact repeats/concurrency return original records; no new cash/stock/audit rows. Conflicting saved state returns 409. Already-trusted historical FAIL/PARTIAL only; pending/PASS/ambiguous legacy denied.
- GET `/api/purchase/material-returns?branchId=&grnId=` → `{ returns: ReturnRow[] }`, PURCHASE_ORDER only.
- GET `/api/accounts/vendor-refunds?branchId=&grnId=` → same shape, VENDOR_REFUNDS only, read-only (no mutation method).
- Optional grnId filter must be branch-authorized even if no return rows exist. Bounded latest 200 claim rows; disclose list bound, do not call displayed sum an all-history balance.

ReturnRow: `{id,grnId,grnLineId,branchId,branch,poNumber,vendorId,vendor,itemName,unit,qtyReturned,refundAmountInr,reasonNote,submittedToAccountsAt,createdAt,status:'REFUND_OR_CREDIT_EXPECTED'|'RECONCILIATION_REQUIRED',moneyReceived:null}`. Quantities/money are exact decimal strings, timestamps serialized ISO. Never expose phone/salary/credentials. Unverifiable saved rows are visibly reconciliation-required, not invented expected/received money.

## UI

Purchase adds Vendor returns tab with list + trusted FAIL/PARTIAL GRN selector and explicit Register failed-quantity claim action for historical records. Use existing GRN GET to obtain candidates; no client-entered amount/qty/vendor/branch. New quality dialog tells that failed quantities queue expected refund/credit claims, not paid money/physical dispatch evidence. Accounts adds Vendor refunds read-only tab. Component can share `VendorReturnsPanel` with purchase/accounts mode. Owner all-branch read or selected branch; ordinary staff own branch only. State must be keyed to live actor/grants/branch, fail closed on loading/error, suppress obsolete reads/writes, busy guard. Unknown registration outcome retains exact GRN intent and offers explicit same-request replay or read recovery; no automatic write retry and no false success on failed reload. Bilingual English/Hinglish, accessible fields/buttons and narrow-phone layout.

UI-agent owned files: new `src/components/vendor-returns-panel.tsx`, new `tests/vendor-returns-ui.test.cjs`, Purchase/Accounts page-content.tsx integration, and minimal dependency stubs in existing GRN/purchase UI tests if needed. Parent owns policies/services/APIs/permissions/nav/guides/integration tests/build. Preserve all GRN-1 component behaviors and existing purchase approved-indent checks.

## Gates

RED→GREEN policy + actual-handler UI tests; guarded real HTTP/Postgres for new quality atomic registration, historical explicit registration, exact rates/rounding/capacity, PASS/general/zero, replay/concurrent/legacy/conflict, no cash/journal/stock changes on registration, grant/branch/CSRF, injected late-return/audit failures with complete rollback, Accounts-only reads and page/nav access. Parent full unit/type/build, dev+compiled suites, browser quality→Purchase return→Accounts reload and exact PG readback, independent scoped review, bilingual guide sync and cleanup before closure. Separate money receipt/credit settlement and invoice three-way match remain PURCHASE-3/FINANCE work.
