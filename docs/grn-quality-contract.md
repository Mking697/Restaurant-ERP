# GRN-1 acceptance contract — October 29, 2026

Scope: local implementation and isolated QA only. No application schema/dependency changes, production writes, commit/push/deployment without separate authorization. Preserve existing post-release documentation edits. GRN-2 vendor-return/refund receivables remain separate; no invented cash receipt or journal.

## API and durable state

- POST `/api/purchase/grns/[id]/quality` body: `{ result: 'PASS'|'FAIL'|'PARTIAL', lines: [{ id: <grnLineId>, qtyFailed: <decimal string> }], note?: string, photoUrl?: string }`.
- Strict field allowlists, 1–50 unique lines; every persisted GRN line exactly once. Never accept client branch/material/received/accepted quantities. Quantities are decimal strings with at most 3 places; perform stock arithmetic in integer thousandths. Failed qty between zero and received qty. PASS: all failed zero; FAIL: every line fully failed; PARTIAL: at least one failed and at least one accepted quantity across the lines. Failure note required for FAIL/PARTIAL (3–1000 trimmed chars); photoUrl optional bounded text/reference (not uploaded bytes).
- PO receive atomically inserts deterministic audit origin `grn-origin:<id>` / GRN_CREATED with version 1, persisted branch and PO ID. First quality posting requires this marker: old PENDING rows may already have posted via the legacy route, so absence is ambiguous and requires reconciliation. Do not infer unposted merely from PENDING.
- Same-origin + live identity under existing mutate advisory lock. PURCHASE_ORDER always; store GRNs additionally require INVENTORY, including FAIL/replay. General GRNs require PURCHASE_ORDER only and never post inventory. Branch comes from persisted GRN and must match its PO and actor scope. GRN/line/material-kind corruption fails closed.
- Use existing grns qualityResult/status/note/photo and grnLines.qtyFailed. Persist PASS/PARTIAL status APPROVED, FAIL status QUALITY_HOLD.
- Exactly one transaction credits all accepted material quantities (aggregate duplicate materials), records line failures and final decision, and inserts a deterministic audit receipt `grn-quality:<id>` into existing audit_log with action GRN_QUALITY_RECORDED/entityType GRN. Receipt metadata version 1 stores normalized request, branch and per-material credits; inventoryPosted is derived from validated positive credits. This receipt is the durable writer-election evidence; no schema migration. Audit failure rolls back stock/quality, never swallowed.
- Same normalized full payload replay (line ordering and decimal spelling irrelevant) returns existing result with replayed:true and no writes. Different result/line failures/note/reference after finalization returns 409. Live permissions checked before replay. Old finalized GRNs without a receipt, or pending rows with unexplained failures, reject with reconciliation-required rather than guessing/posting.
- Reject duplicate inventory rows and capacity overflow with 409; preserve min/max levels. No partial stock post if any line or receipt write fails. Keep existing global→branch recipe-stock lock ordering.
- Retire unbound POST `/api/inventory/receive`: authenticated INVENTORY callers receive 410 with new endpoint guidance, no stock changes. This was only a purchase-quality caller plus its integration test; inventory opening balances/transfers/production retain their own workflows. Do not leave a stock-posting bypass usable by old clients.

## Read response / UI contract

GET `/api/purchase/grns` remains PURCHASE_ORDER/branch scoped. Return all lines with `id, rawMaterialId, name, itemDescription, unit, qtyOrdered, qtyReceived, qtyFailed, qtyAccepted, rateOrdered` (quantities strings). No flattened first-material fields.

Each GRN also includes `isGeneralPurchase`, persisted `qualityResult/status/qualityNote/qualityPhotoUrl`, and receipt-backed `qualityRecorded:boolean, inventoryPosted:boolean, qualityRecordedAt:string|null, qualityReady:boolean, reconciliationRequired:boolean`. Only mark Posted from the durable receipt, not a client flag or inference from any old non-PENDING row. Bound child/audit reads to returned GRN IDs. Return deterministic line ordering.

POST response: `{ grn: <same complete row shape>, replayed: boolean }`.

UI: render every line/failed/accepted quantity with its own unit. Quality dialog lists all received lines with per-line qtyFailed controls for PARTIAL; PASS sends zeros, FAIL sends full quantities. Show note/reference fields and honest GRN-2 disclaimer. Submit only to new quality endpoint, never generic inventory receive. Store controls disclose INVENTORY prerequisite without widening grants. Await server response and replace row from server; reload GET shows same final state and no repeat action. For unknown response, retain exact original payload and permit only read/replay (do not silently allow editing/re-posting); one final decision per GRN makes exact replay safe across reload. No automatic POST retry. Prevent double submission while busy and ignore stale dialog completions after scope/GRN changes. Preserve approved-indent PO behavior.

## Parent acceptance gates

RED→GREEN pure parsing and real HTTP regressions. Full unit suite/typecheck/build; real guarded disposable-DB tests for PASS/FAIL/PARTIAL, multiple/general/duplicate-material lines, identical/conflicting replay, concurrent equal/conflicting requests, auth/CSRF/grants/branch denial, legacy receipt absence, duplicate stock/overflow, forced line/audit failures and committed-state rollback. Update prior purchase integration for new all-line quality handoff and retired endpoint.

Real browser: multi-line decision→save→reload; verify all persisted line failures/accepted quantities and exact stock. Include failure-note validation and 390px geometry; do not claim pixel-level visual review without inspected screenshot. Independent scoped review and parent reruns before marking GRN-1 COMPLETE. Related audit findings need concrete evidence and tests; record approval-dependent/unrelated roadmap items rather than silently expanding this stage.
