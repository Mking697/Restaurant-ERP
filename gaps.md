# Client Flow Coverage Gaps and Phased Delivery Plan

Baseline: October 31, 2026. Scope: the client's three spreadsheet screenshots, the code comparison in this conversation, and the existing source-backed process map. This is a delivery backlog, not a claim that the client has approved every proposed design or that implementation has started.

## 1. Authority and scope

- `gaps.md` is the detailed source of truth for CLIENT-FLOW gaps, acceptance criteria and completion evidence. `CLAUDE.md` carries the matching active/done ID index and resume instructions. Update both together.
- Existing historical completed releases stay completed. A module's `live` badge means it has database-backed functionality; it does NOT establish coverage of every requirement in the client sheet.
- Current working-code reference: `619f11d` on `work/phase-01-safety`; the current process map records main release `4d4d268`. Recheck Git/Vercel before relying on release state. The map, renderer and its regression tests were already local modifications before this backlog was added.
- This baseline is a screenshot + implementation review, NOT a fresh production UAT or a complete security/accounting audit. No coverage percentage or calendar delivery promise is inferred.
- The user authorized this backlog and tracking policy. Explain the intended implementation of each phase in plain language and obtain explicit approval before changing application code, schema or production. This document is not that approval.
- Owners, delivery dates, provider contracts and unresolved business policies are unassigned/unconfirmed until recorded under GAP-001/GAP-002. Do not invent them.

### Client source register

| Source | Local attachment | Visible scope |
| --- | --- | --- |
| S1 | `C:\Users\hp\AppData\Local\hermes\cache\documents\native-inputs\ce983514dccafd55971968d10f367283fae6c3ded906713ad0e4dc726763980a\upload_zz515r2_.png` | Rows 3-12: Purchase, Fast Food billing, Conventional Restaurant & Bar (explicitly separate database and workflow), Shift Management, Base Kitchen conversion/sub-recipes. |
| S2 | `C:\Users\hp\AppData\Local\hermes\cache\documents\native-inputs\2e37233a135c8ae3f799639b598b6931317c94abed902a0076b550f8c52afafc\upload_od6u9jpf.png` | Rows 17-22: Base Kitchen receipt/production/cost bands, kg input and pcs output, branch issue, end-of-day stock, POS images/tokens/payment sequence/platform orders, WhatsApp community/loyalty QR. |
| S3 | `C:\Users\hp\AppData\Local\hermes\cache\documents\native-inputs\49b687ffa5a28d22ca70851bec2da7a876e350ed563d4bcde12e142cbbcaef34\upload_ipl3raok.png` | Rows 25-31: Branch requisition, external PO pending HO approval, quantity/quality/GRN and HO reporting, stock deduction, end-of-day stock count/reconciliation, min/max reorder. |

These attachments are local references, not committed assets. Some sentences are cropped at screenshot boundaries, especially the order-flow text in S2. GAP-001 must resolve that text with the client rather than treating an inferred sentence as an approved requirement.

### Code evidence register

References establish the current boundary; they are not future implementation instructions. Trace definitions/usages again before editing.

| Evidence | Current implementation sources | Boundary observed |
| --- | --- | --- |
| E01 | `src/app/api/purchase/orders/route.ts`; `src/app/api/purchase/indents/[id]/submit/route.ts`; `src/db/schema/vendors.ts` | PO/indent workflows exist; rolling-history rules can auto-approve indents. Vendor master is not an approval lifecycle. |
| E02 | `src/app/api/purchase/orders/[id]/receive/route.ts`; `src/lib/server/grn-quality.ts`; `src/db/schema/purchase.ts` | Existing-PO receipt/quality and once-only accepted-stock posting exist; receipt initially uses ordered quantity. Independent shortage/partial-delivery capture needs design. |
| E03 | `src/lib/server/vendor-invoices.ts`; `src/lib/server/vendor-returns.ts` | Invoice match/approve/manual paid state and failed-quality claims/manual settlement exist. Those states do not execute a bank transfer, physical dispatch or formal debit-note workflow. |
| E04 | `src/app/api/stock-transfers/route.ts`; `src/app/api/stock-transfers/[id]/receive/route.ts`; `src/db/schema/warehouses.ts` | Raw-material transfers/branch receipt exist. No complete central-stock debit ledger or prepared Semi-FG transfer is established. |
| E05 | `src/lib/server/production.ts`; `src/lib/server/production-policy.ts`; `src/db/schema/production.ts`; `src/db/schema/menu.ts` | Fixed recipe/raw and Semi-FG production/stock exist; no actual variable cutting yield, actual production-lot valuation or approved deviation bands. |
| E06 | `src/app/inventory/page-content.tsx`; `src/app/api/inventory/variance/route.ts`; `src/db/schema/inventory.ts` | Raw min/max display and reads of saved variance rows exist. Full physical-count submission/approval/adjustment and usable batch-expiry lifecycle are not established. |
| E07 | `src/app/api/pos/orders/route.ts`; `src/db/schema/pos.ts`; `src/app/pos/page-content.tsx` | Common completed-order flow, manual channel/table/tender, KOT and receipt exist. VOIDED schema fields alone do not supply a manager void route/UI. |
| E08 | `src/lib/server/shifts.ts`; `src/db/schema/shifts.ts`; `src/db/schema/expenses.ts` | Blind count, cash reconciliation and next-shift handover exist. First opening float, shift-linked expenses and final HO cash custody do not. |
| E09 | `src/lib/server/whatsapp-triggers.ts`; `src/lib/server/daily-summary.ts` | Thank-you/offer paths and branch low-stock daily summary exist; provider delivery remains external. Community membership/rewards/customer QR do not follow from these paths. |
| E10 | `src/db/client.ts`; `src/lib/server/permissions.ts` | Shared database/pool with role/branch controls. This is not the explicitly requested conventional-restaurant database separation. |
| E11 | `src/lib/server/cogs.ts`; `src/app/api/reports/_aggregation.ts`; `src/app/api/vat/vat-summary/route.ts` | Saved sale-time recipe-cost COGS/Actual-vs-Estimate exist, not production-lot/FIFO valuation. Current VAT settings are read for the summary; do not promise historical tax snapshots or statutory filing. |
| E12 | `scripts/render-full-process-flow.cjs`; `docs/restaurant-erp-full-process-flow.html`; `tests/full-process-flow.test.cjs` | Reproducible current-system map documents legacy business-timezone/FX boundaries and implemented workflows. It is not a client acceptance certificate. |

## 2. Already-covered foundation: do not rebuild or mislabel as missing

- Vendor creation, purchase indents/approvals, approved-indent store PO, existing-PO GRN, quality PASS/FAIL/PARTIAL, once-only accepted raw-stock posting.
- Private purchase/invoice evidence upload; vendor invoice entry/match/approval/manual paid recording; failed-quality vendor claims and manual settlement recording.
- Basic POS, table/channel/tender entry, KOT and receipt/tax result, sale-time raw/prepared-stock deduction.
- Fixed/nested recipe BOM, actual persisted Semi-FG production, branch Semi-FG balances, captured sale-time COGS and posted-vs-estimate reporting.
- Blind shift count, shortage/excess, tender breakup at close, next-shift cash handover/acceptance and POS gating.
- Raw min/max indicators, branch low-stock daily summary, customer thank-you and scoped offer messaging.
- Existing access controls, branch isolation, Accounts, Tasks, Workforce, MIS and reports remain in place. They are not newly reopened as missing modules by this client-flow backlog.

Coverage labels below describe ONLY the remaining delta: `PARTIAL` = useful foundation exists; `MISSING` = requested end-to-end capability is not established; `DECISION` = business/architecture clarification needed. Delivery status is separate.

## 3. Execution phases and dependencies

| Phase | Delivery items | Deliverable and exit condition | Prerequisites |
| --- | --- | --- | --- |
| P0 - Scope and architecture gate | GAP-001, GAP-002 | Confirm client policies, database separation and acceptance scenarios. Record decisions; no silent scope substitution. | Client/owner clarification. DONE October 31, 2026 (see section 6) - shared DB kept, 14 policy decisions recorded. |
| P1 - Stock/data foundation | GAP-004 through GAP-007 (GAP-003 superseded, GAP-008 DONE - see section 6) | Central ledger, real receipt counts, lots and physical counts on the existing shared database and the now-settled Tanzania EAT business-day contract. | Implementation approval for GAP-004 through GAP-007 (still pending). |
| P2 - Base Kitchen and internal supply | GAP-009 through GAP-014 | Actual kg-to-pcs batches/costs, deviations, prepared-stock controls, mixed requisitions and transfers. | P1 stock/location/lot model. |
| P3 - Procurement and branch control | GAP-015 through GAP-022 | Approved vendors, HO purchase controls, settlements/returns/debit notes, stock reports/reorder and HO acknowledgments. | P1; P2 for prepared-stock reporting/requisitions. |
| P4 - Client POS workflows | GAP-023 through GAP-032 | Fast Food vs Conventional lifecycle, correct payment/invoice/KOT sequence, voids, visual ordering, tokens and platform order intake. | P0/P1 database contract; P2 stock/cost integration. Provider intake also needs approved credentials/contracts. |
| P5 - Shift cash custody | GAP-033 through GAP-036 | Opening float, live/pending order summary, shift expenses and final HO cash handover. | P4 lifecycle/payment events; P1 business-day contract. |
| P6 - Customer CRM and loyalty | GAP-037 through GAP-041 | Voluntary community link, membership, reward ledger and QR-assisted repeat orders. | P4 completed/void/payment events; approved privacy/reward/provider policies. |
| P7 - Client acceptance and final release | GAP-042 | Full client-sheet traceability, safe end-to-end UAT, release proof and current documentation. | All required P0-P6 items completed or explicitly re-scoped by client; no waived item may be called DONE. |

Recommended sequence is P0 -> P1 -> P2 -> P3 -> P4 -> P5 -> P6 -> P7. After contracts are stable, independent UI/CRM work may run in parallel; never parallelize competing schema/stock/payment state changes without an agreed ownership boundary. No implementation ETA is promised until scope, owner and estimates are approved.

### 3.1 How these capabilities fit the CURRENT project

This is an integration proposal, not implemented behavior or client-approved design. Every GAP must retain a project-specific six-part blueprint: current reuse, proposed data/server change, proposed API/UI fit, compatibility/rollout, concrete proof scenario and business improvement. Existing paths/symbols name inspected code. Anything marked PROPOSED is a design candidate, not a file/API/table already available. Re-read definitions/usages before implementing.

1. Extend the current Next.js + Drizzle + PostgreSQL app, existing app-shell/UI/localization and route-handler transport; do not build a parallel ERP, assume new packages exist or turn this into microservices. Business rules stay in small server/domain helpers; client components never import DB-driver values. The installed Next.js route guide at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` was read for planning; dynamic route params are awaited and existing runtime/auth conventions remain applicable.
2. Same-database writes reuse `src/lib/server/auth.ts` (`mutate`, `locked`, `Executor`) and `src/lib/server/permissions.ts` (`assertModule`, `branchScope`). New permission keys must be traced through `src/lib/moduleAccess.ts`, server guards, API guards, navigation, tabs and Guide visibility, not only a hidden button. Database splitting must explicitly redesign authority coordination: the current foundation advisory lock, session query and business writes share one DB transaction; that guarantee does not automatically cross databases.
3. Prefer one app and reusable domain code with the approved CONCEPT-level database boundary, not automatically one app/database per branch. This is a recommendation to review in P0, not permission to substitute logical filtering for the client's explicit separate-database wording. Client-controlled DB names/DSNs are forbidden. Inventory/production transfers crossing approved physical DBs need durable source outbox + destination inbox deduplication/acknowledgment and visible in-transit state; a PostgreSQL transaction/FK/advisory lock does not span two independent databases.
4. Stock movement history is the authoritative append-only record. Existing `inventoryStock.qtyOnHand` and `semiFgStock.qtyOnHand` may remain compatibility/read projections during migration, but cannot become independently editable competing truth. Introduce one transactional posting seam and reconcile projections to movements; switch ALL writers for an enabled pilot together (GRN, dispatch/receipt, production, sale, returns, wastage and adjustments). Do not duplicate an old direct increment and a new ledger increment. Avoid an unaudited dual-write cutover.
5. Migrate existing balances with approved cutoff/opening evidence, not invented purchase/production history. Unknown historical lot, expiry, valuation or payment evidence stays unknown/reconciliation-required. Known complete zero costs remain valid. New lots/receipts/productions get explicit complete snapshots; old captured order COGS, finalized payroll and issued money/tax documents are not repriced using today's rules.
6. Distinguish stock item identity from its branch-cloned menu-row ID. Existing `cloneBranch` remaps menu and Semi-FG IDs; transfer/requisition design needs a reviewed stable product mapping and approved recipe/unit version per location. Raw kg/ltr and prepared pcs are not interchangeable just because a numeric field accepts them. Use exact decimal/quantity arithmetic and defined per-line/batch rounding for new valuation; no float running money total or presumed kg-to-piece ratio.
7. One domain event posts stock/cost once; printing is not posting. Order fulfillment, invoice, payment, physical cash custody and loyalty are separate linked lifecycles. Reuse existing saved COGS, invoice-match gates, Accounts journal sources and private purchase-document storage instead of creating duplicate expenses, sales or settlements. Reversals reference original entries and follow approved waste/refund rules.
8. Use indexed, scoped read models for reports/alerts/reorder; do not invent independent editable aggregate totals. Operational hidden-order privacy and official records are distinct; actual drawer/stock custody must remain truthful even when operational order details are filtered. New/refactored notification sends must occur after commit or through an approved durable delivery process; the existing offer-alert send is currently inside mutate and GAP-037 explicitly plans that refactor. Never make provider latency hold stock/cash locks.
9. Every new business table has explicit tenant/location ownership, FK/index/unique-key strategy and deletion-readiness/retention behavior. Extend `src/lib/server/branch-clone.ts` only for approved configuration, not transactions/balances; extend `src/app/api/branches/[id]/deletion-check/route.ts`'s underlying dependency checks for new retained records. Do not claim GDPR-style erasure of official financial history merely by deleting a branch/customer.
10. Ship additive, disabled-by-default vertical slices: schema -> pure policy/server service -> guarded API -> existing screen -> real DB/HTTP/browser tests -> approved pilot -> cutover/readback. Pilot flags are proposed new configuration, not already implemented safeguards. A complete stock slice means all enabled stock writers agree; a partial UI-only release must not enable a half-migrated ledger. New statuses require updating all TS/UI/translation/report consumers.
11. Rollback before new writes can disable the flag/revert the app after schema compatibility proof. After new stock/payment writes, disabling blindly is unsafe: reconcile committed movements, use reviewed compensating entries/forward repair and prove old readers still interpret the data. Schema generation, production migration, pushing an auto-deployed branch and real external side effects retain separate approval gates. No deployed migration history is rewritten.

### 3.2 P0/P1 execution slices and concrete operating example

- P0-A (GAP-001): walk the client through actual Purchase, Inventory, Menu/BOM, POS and Cash Drop screens and collect the missing policies. Deliver an approved requirement-to-GAP/role/exception matrix, not a speculative settings dashboard.
- P0-B (GAP-002): review the physical-database choice, master ownership, auth revocation guarantees, central-kitchen bridge and historical cutover/recovery. Record the ADR and implementation approval. No database is split by writing the plan.
- P1-A (GAP-003): implement/test approved trusted database context and ownership/FK migration strategy with isolated two-DB acceptance if separation is approved. Keep one codebase; prove all affected paths, not only POS, reach the right DB.
- P1-B (GAP-008): settle effective business-calendar/base-currency/unit semantics BEFORE enabling new event/day-key posting. GAP IDs are stable references, not execution order.
- P1-C (GAP-004): implement the authoritative movement/posting seam and controlled existing-balance opening/cutover. Pilot with a bounded location and all its writers; compare totals before enabling.
- P1-D (GAP-005): separate ordered, physically received, quality-accepted/rejected and outstanding quantities. If multiple deliveries are approved, replace assumptions of one GRN per PO everywhere, including quality lookup, invoice matching and claim aggregation; do not just remove an index.
- P1-E (GAP-006): attach real known lot/expiry data and quality/quarantine availability. GAP-009 will later add actual production-lot creation; do not pretend that future writer already exists. Legacy unknown-lot stock has a documented restricted/reconciliation policy.
- P1-F (GAP-007): build counts at a recorded movement cutoff, independent approval and once-only adjustment posting; new movements during a count must be accounted for. Then reconcile stock views and report inputs.

Illustrative scenario (synthetic acceptance data, NOT a real business transaction): PO 100 kg -> physical receipt 90 kg -> quality accepts 85 kg / rejects 5 kg. Usable stock increases by 85, rejected goods are held under the approved quarantine/return policy, 10 kg remains a delivery shortage/outstanding according to the approved PO closure rule. Invoice matching must use the saved accepted value, not ordered 100 kg or physically received 90 kg. Later dispatch 20 kg from usable stock -> 65 kg central available plus 20 kg in transit -> destination accepts 20 kg once. A cutoff stock count of 64 kg at the source yields a reasoned -1 kg adjustment after approval, not an edited balance. Expiry affects usable availability per policy without silently destroying held stock. Valuation and quality status remain separate from physical custody throughout.

## 4. Status and completion policy

Allowed states: `PENDING` -> `IN_PROGRESS` -> `VERIFIED_LOCAL` -> `DONE`; `BLOCKED` may be used at any nonterminal stage with the actual dependency recorded. `VERIFIED_LOCAL` stays active/pending for client coverage; it is not live. Explicit client deferral is `DEFERRED`, not DONE, and stays visible in the active register.

For every completed item:

1. Satisfy its written acceptance criteria, not merely add a page, schema field, badge or mock response.
2. Capture schema/server/API/UI evidence as applicable, authorization/branch boundaries, retry/idempotency/concurrency protections and tests for invalid as well as valid operations.
3. Run targeted tests plus `npm test`, `npx tsc --noEmit` and `npm run build` for application changes. There is currently no project lint script; do not fabricate a lint pass. Read the relevant local Next.js guide before app changes.
4. For stock, money, approval, expiry or lifecycle changes: exercise real HTTP + disposable PostgreSQL, retries, cross-branch denial and rollback/concurrency as applicable. Migration changes require fresh-install, upgrade with preserved representative data, replay and recorded production application/readback. Fail closed if the HTTP app is not proven bound to the disposable DB before mutating/cron tests. No real customer sends or production test transactions without explicit approval.
5. Application items stay `VERIFIED_LOCAL` until the authorized commit/release is deployed and exact production revision/auth/read-only smoke is verified. Provider-dependent behavior also needs a controlled consented/provider acceptance check; otherwise record the blocker. Do not equate a queued request with delivered money/message/order.
6. Decision-only GAP-001/GAP-002 are exempt from app deployment: require recorded client approval and reviewed decision evidence. Documentation-only subchanges are verified by source/consistency checks, not a pretend deployment.
7. Move the ENTIRE completed item block from section 5 (Active/Pending) to section 6 (Done). Preserve its ID, original gap, acceptance criteria and phase. Set `Status: DONE`; attach completion date, implementation/commit/release evidence, test results, relevant UAT and any honest residual limitation. Never delete its history or reuse its ID.
8. In the SAME change update `CLAUDE.md`: remove the exact ID from Active/Pending, add it under Done with a short evidence reference, update the next phase/checkpoint, and update current process-map/Guide descriptions if behavior changed. Keep the phase plan's IDs as historical references; they are not a second status list.
9. A partial implementation remains active with remaining work stated. If a completed item regresses, move it back to active with `BLOCKED` or `IN_PROGRESS`, explain the regression, and preserve prior release evidence.

Completion evidence template:

```text
Status: DONE
Completed: <actual date>
Decision approval: <client message/decision record, if applicable>
Implementation: <paths and commit>
Tests: <commands, real results and integration evidence>
Release: <production revision/URL and readback, or justified decision-only N/A>
Acceptance: <scenario/result and reviewer>
Limitations: <none, or precise residual scope retained under another active ID>
```

## 5. Active / Pending register

All items below start `PENDING`. None is marked DONE merely because this plan exists. Each phase requires approval before execution.

### GAP-003 - Implement approved database isolation boundary

Status: SUPERSEDED (see GAP-002 Done-register decision, October 31, 2026)
Coverage: MISSING | Phase: P1 | Depends on: GAP-002
Source: S1 separate database; E10.

SUPERSEDED NOTE: owner decided (recorded under GAP-002 in section 6) to keep ONE shared database with strong branch/concept-level filtering instead of a physical database split. This item's original acceptance criteria (a real physical DB boundary) is explicitly NOT being built. Any future work here is limited to hardening existing branch/concept filtering (see `src/lib/server/permissions.ts` branchScope) under a fresh client-approved scope change - do not silently reopen a physical split.

Acceptance (ORIGINAL, now superseded): implement the approved physical database/routing boundary and separate concept configuration; prove no accidental cross-concept reads/writes, independently safe migrations/backups, and the approved cross-concept supply/reporting bridge. Preserve existing business data. Client approval is required for any alternative architecture; branch filtering alone is not sufficient evidence for the original requirement.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/client.ts`, `src/lib/server/auth.ts` (`Executor`, `mutate`, `locked`) aur `src/lib/server/permissions.ts` ke contract ko extend karein; `src/db/schema/platform.ts`/`src/lib/server/branch-clone.ts` ke branch/catalog references preserve karein.
- Proposed data/server change: PROPOSED: trusted branch-to-concept/database binding plus server-only bounded pool/executor resolver. Existing domain helpers ko explicit correct executor mile; direct global `db` imports, same-DB FK/joins, session lookup, branch clone, payroll/accounts and reports ka migration inventory ho. Per-target migration lineage/reference readiness aur stable catalog-ID mapping add karein, not client-controlled DSNs.
- Proposed API/UI fit: Same app-shell/navigation rakhein; authorized context se selected operational database resolve ho. Existing handlers thin adapters rahein, transport ko Server Actions me rewrite na karein. Owner consolidated reports ke liye permission-gated read projection/bridge propose karein; stock commands ko cross-DB joins par depend na karein.
- Compatibility / rollout: Pilot one approved concept/branch with backfill/read comparison and an explicit write cutover. Auth revocation currently global DB transaction/lock ke andar validate hoti hai; split ke baad authoritative platform lock/recheck coordination ka proof required hai. No implicit cross-DB atomicity, no dual active writers, no credential leakage. Rollback new business writes ke baad reviewed forward repair/reconciliation ho, blind old DB switch nahi.
- Concrete proof scenario: Two disposable DBs par mismatched context/session, concurrent grant revocation, same branch-ID substitution, pool isolation aur receiver outage test karein; every write stays in intended database and failed bridge messages remain observable/replayable.
- Business improvement: Existing screens/domain code reuse honge, lekin database separation real aur auditable hogi; future concept onboarding branching app copies se nahi, configuration se ho sakega.

### GAP-004 - Complete central warehouse stock ledger

Status: DONE (October 31, 2026) — see the implementation notes below for the full build-up across this session; last follow-up (wastage + physical count) closes the remaining branch-level writer coverage.
Coverage: PARTIAL | Phase: P1 | Depends on: GAP-003, GAP-008
Source: S2 Base Kitchen receive/issue; E04.

Acceptance: defined locations own real opening/receipt/production/dispatch/return/adjustment balances. Dispatch atomically debits central stock, prevents overselling and creates auditable in-transit stock; destination receipt credits only accepted quantities once. Rejected/short/damaged quantities have explicit resolution, not silent deletion. Replay/concurrent dispatch tests prove conservation and branch access isolation.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/schema/warehouses.ts` (`warehouses`, `stockTransfers`), `src/db/schema/inventory.ts` (`inventoryStock`), `src/lib/server/production.ts` (`lockRecipeStock`, `deductStock`) aur `src/app/warehouse/page-content.tsx` ke transfer actions reuse karein.
- Proposed data/server change: PROPOSED: location/item/lot-scoped append-only movement rows with exact signed quantity/value, source identity, effective/recorded times and reversal reference. One posting helper checks availability under a consistent lock order. Existing branch/raw and prepared balances become reconciled read/compatibility projections, not parallel editable ledgers.
- Proposed API/UI fit: Existing `src/app/api/stock-transfers/route.ts` dispatch and `[id]/receive` handler ko central debit -> in-transit -> accepted destination credit events se connect karein; Warehouse screen available/transit/exception balances show kare. Opening/GRN/production/POS/count/return writers must use the same seam for an enabled location.
- Compatibility / rollout: Current dispatch is paperwork, not a central debit. Approved opening cutoff/evidence and complete writer inventory required before pilot. Same-DB rows post atomically; approved cross-DB transfer uses source outbox/destination inbox and visible recovery, not assumed distributed atomicity.
- Concrete proof scenario: Central available 30 kg; two concurrent 20 kg dispatches me sirf one succeeds. Successful dispatch leaves 10 available + 20 transit; received 20 is credited once even on duplicate retry. Source-identity collision with changed payload rejects.
- Business improvement: Available, held, in-transit aur received stock ka ek explainable record milega; warehouse paperwork aur actual stock alag-alag sach nahi dikhayenge.

First-slice implementation note (October 31, 2026, NOT a DONE closure — remains active with substantial scope left): additive migration `drizzle/0018_harsh_war_machine.sql` added `stock_movements` (branch-scoped, RAW-MATERIAL-only append-only ledger: signed `qtyDelta`, `movementType` enum currently `GRN_RECEIPT`/`PRODUCTION_CONSUME`, globally-unique `idempotencyKey`, `sourceType`/`sourceId`, `actorId`, `effectiveAt`) plus a posting seam `src/lib/server/stock-ledger.ts` (`postStockMovement`, `ledgerBalance`). Wired as an AUDITED PARALLEL RECORD (not yet the authoritative balance — `inventory_stock.qtyOnHand` remains the live source of truth for every reader) into the only two existing writers that already touch raw branch stock: `src/lib/server/grn-quality.ts`'s PASS/PARTIAL accepted-stock credit (`movementType: GRN_RECEIPT`, `sourceType: GRN`), and `src/lib/server/production.ts`'s `deductStock` raw debit, now given a required `source: { type, id, actorId }` param threaded through both its callers (`src/app/api/pos/orders/route.ts`'s sale-time consumption, `sourceType: POS_ORDER`, using the order id generated before the deduction instead of after; and `produceSemiFg`'s raw consumption, `sourceType: PRODUCTION`, keyed by the existing production idempotency key).
Explicitly NOT wired yet (do not assume present): Semi-FG/prepared stock movements (deductStock's `semiFgStock` debit and `produceSemiFg`'s credit), any CENTRAL (non-branch) warehouse balance (none exists in schema at all today — `warehouses`/`stockTransfers` remain paperwork-only, no debit/in-transit/credit flow), stock-transfer dispatch/receive, wastage write-offs, and physical-count adjustments. This is deliberately a smaller first slice than the GAP's full acceptance criteria (which require ALL writers for an enabled pilot location together) — do not claim central-warehouse dispatch/in-transit/conservation behavior exists; it does not.
Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 477/477 (no new unit tests needed beyond existing coverage — the new logic is exercised end-to-end below); `npx next build` clean, no new routes (internal seam only); `npx drizzle-kit generate` after applying confirms "No schema changes, nothing to migrate". Migration applied to the real local `restaurant_erp_local` DB (confirmed via a fresh `drizzle-kit generate` reporting no drift) AND to a from-scratch disposable QA database (`restaurant_erp_stockledger_qa_20261031`, all 19 migrations applied cleanly, fresh install). Real HTTP+PostgreSQL integration on that QA database + an isolated dev server (port 4933), `tests/stock-ledger.integration.cjs`: **9/9 passed** — a real GRN PASS cycle posts exactly one `GRN_RECEIPT` row with the correct signed qty and GRN source id; a real Semi-FG production call posts exactly one `PRODUCTION_CONSUME` row keyed by its idempotency key, and an identical replay (already idempotent at the `semiFgProductions` level, confirmed to never even re-invoke `deductStock`) posts no second ledger row; a real POS sale posts a `PRODUCTION_CONSUME` row sourced from the real order id (not the production key), proving the shared seam correctly tags each caller's own source identity; a raw material whose ENTIRE history went through the two wired writers has `sum(qty_delta)` exactly equal to `inventory_stock.qtyOnHand` (20 GRN credit, -10 production debit = 10, matching the live column exactly); a second raw material with a pre-ledger opening balance seeded directly (the realistic "legacy stock" case) correctly does NOT reconcile to the full column — only its wired POS debit is reflected in the ledger sum — and the test asserts that mismatch is the CORRECT, expected behavior rather than silently claiming full reconciliation. QA server/dist/database were torn down after; `tsconfig.json`/`next-env.d.ts` confirmed restored to default.
Release: N/A — local, uncommitted source only; ask before committing/deploying, same standing rule as every other schema change in this file. Local dev DB (`restaurant_erp_local`) has migrations `0018` and `0019` applied; production Neon does NOT have them — do not apply to production without a separate explicit approval.
Limitations: stock-transfer dispatch/in-transit debit is now wired for a CENTRAL warehouse's own balance (see the follow-up slice below) — the remaining open items are Semi-FG ledger rows, wastage and physical-count adjustments, and extending stock movements to BRANCH-type warehouse stock beyond the GRN/production/POS cases already covered. This GAP cannot move past IN_PROGRESS until those land and ALL raw+prepared writers for at least one pilot location are proven to use the same seam together, per this project's "no half-migrated ledger" rule. The ledger is additive/non-authoritative; no existing reader was changed to consume it, so there is zero behavior-change risk from this slice beyond the extra insert per write.

Follow-up slice (October 31, 2026, same session): central warehouse now has a real tracked stock balance, resolving the exact limitation `src/app/api/stock-transfers/route.ts`'s own comment used to flag ("central warehouse stock has no quantity ledger yet in this schema"). Additive migration `drizzle/0019_fast_medusa.sql` added `warehouse_stock` (warehouseId+rawMaterialId unique balance, see `src/db/schema/warehouse-stock.ts`). New seam `src/lib/server/warehouse-stock.ts` (`creditWarehouseStock`, `debitWarehouseStock`, both row-locked). New Owner/INVENTORY-gated `POST /api/warehouses/[id]/stock-in` (CENTRAL only — the first real "opening/receipt" writer for this balance; BRANCH warehouses correctly rejected, their real stock stays in `inventory_stock`). `POST /api/stock-transfers` (dispatch) now atomically debits the source CENTRAL warehouse's balance BEFORE creating the transfer row, rolling back the whole mutation on insufficient stock (409) — this is the actual overselling-prevention the GAP's acceptance criteria require. The existing dispatch→receive→destination-branch-credit flow (inventory_stock, with its own existing variance tracking) is UNCHANGED.
Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 478/478; `npx next build` clean; post-build `npx drizzle-kit generate` confirms "No schema changes, nothing to migrate" (checked for both this and the earlier stock_movements migration together). Migration applied to `restaurant_erp_local` AND to a from-scratch disposable QA database (`restaurant_erp_whstock_qa_20261031`, all 20 migrations applied cleanly). Real HTTP+PostgreSQL integration, `tests/warehouse-stock.integration.cjs`, isolated QA app port 4941: **7/7 passed** — a BRANCH-type warehouse correctly rejects stock-in (400); a real stock-in credits the CENTRAL balance to exactly 30.000; **two concurrent 20kg dispatches against a 30kg balance: exactly one succeeds (201), the other is rejected (409) for insufficient stock** — the GAP's own named proof scenario, reproduced for real under real Postgres row-locking, not simulated; the balance after the single successful dispatch is exactly 10.000, never negative, never double-debited; a further 20kg dispatch against the remaining 10kg is rejected outright with the balance untouched; receive still credits the destination branch's real `inventory_stock` with the actual counted 19.500 (not the dispatched 20), preserving its existing variance behavior unchanged; a final 5kg dispatch against the remaining 10kg succeeds and debits to exactly 5.000. QA server/dist/database torn down after; `tsconfig.json`/`next-env.d.ts` restored to default.
Still NOT covered by this follow-up: a CANCELLED stock-transfer status exists in the enum but no route ever sets it or credits the central balance back — this was a pre-existing gap, not introduced here; branch-to-branch transfers (source must be CENTRAL); any reversal/correction flow for a mis-dispatch.

Second follow-up slice (October 31, 2026, same session): Semi-FG (prepared) items are now also covered by the stock_movements ledger, resolving the exact limitation flagged earlier ("Semi-FG/prepared stock movements... NOT wired yet"). Additive migration `drizzle/0020_rich_donald_blake.sql`: `stock_movements` gains `itemType` (RAW_MATERIAL | SEMI_FG), nullable `menuItemId`, and `rawMaterialId` is now nullable too — a CHECK constraint enforces exactly one of the two is set, matching `itemType` (same "exactly one of two nullable columns" convention as `purchaseOrderLines`). Two new movement types: `PRODUCTION_OUTPUT` (produceSemiFg's credit) and `SEMI_FG_CONSUME` (deductStock's Semi-FG debit — e.g. a dish recipe consuming a prepared item). `src/lib/server/stock-ledger.ts`'s `postStockMovement` now accepts either a `rawMaterialId` or a `menuItemId` (discriminated union), and a new `ledgerBalanceSemiFg()` mirrors `ledgerBalance()` for the Semi-FG projection.
IMPORTANT OPERATIONAL FINDING (not a code bug, a migration-journal bug, now fixed): the first two `drizzle-kit migrate` runs against `restaurant_erp_local` for migrations 0018/0019 both printed "migrations applied successfully!" but SILENTLY did nothing — `drizzle/meta/_journal.json`'s entry for migration `0017_groovy_lizard` had a `when` timestamp LATER than 0018/0019/0020's own timestamps (an ordering inversion from however 0017 was originally generated). drizzle-kit's migrator treats "pending" as "newer than the last applied `when`", so 0018-0020 were wrongly judged as already-past and skipped — even on a fully fresh, from-scratch QA database created AFTER this bug was already latent in the journal file, this does NOT manifest (a brand-new empty DB has no "last applied" to compare against, so it just applies every file in order) — which is why every QA-database integration run in this session (stockledger, whstock, semifgledger) passed 9/9, 7/7, 9/9 for real, while `restaurant_erp_local` quietly lagged behind. Fixed by bumping 0018/0019/0020's `when` values in the journal to be strictly greater than 0017's, then re-running `drizzle-kit migrate` against `restaurant_erp_local` — confirmed afterward via `\d stock_movements`/`\dt` that all three tables/columns now genuinely exist there. Lesson: a "migrations applied successfully" message is NOT sufficient proof a migration landed on a long-lived DB — always verify with a direct `\dt`/`\d <table>` check (as finally done here), not just the CLI's own exit message.
Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 478/478; `npx next build` clean; post-build `drizzle-kit generate` confirms zero drift. Applied to `restaurant_erp_local` (after the journal fix above, verified via `\d stock_movements`) AND a from-scratch disposable QA database (`restaurant_erp_semifgledger_qa_20261031`, all 21 migrations clean). Real HTTP+PostgreSQL integration, `tests/semi-fg-ledger.integration.cjs`, isolated QA app (port 4951): **9/9 passed** — producing 5 units of a Semi-FG item posts exactly one `PRODUCTION_OUTPUT` row (+5.000, itemType SEMI_FG); an idempotent replay posts no second row; producing a SECOND Semi-FG item whose own recipe consumes the first as a component correctly posts a `SEMI_FG_CONSUME` row (-2.000) on the first item AND its own `PRODUCTION_OUTPUT` credit (+2.000); the first item's full history (credit then debit) reconciles EXACTLY against `semi_fg_stock.qtyOnHand` (5 - 2 = 3, matching); the underlying raw material behind the Semi-FG recipe still posts correctly as `itemType RAW_MATERIAL` (unreclassified by this extension). Also RE-RAN `tests/stock-ledger.integration.cjs` (the earlier RAW-only slice) against a fresh QA database with the NEW extended schema: still **9/9 passed**, confirming the Semi-FG extension did not regress the raw-material path. QA servers/dists/databases torn down after each run; `tsconfig.json`/`next-env.d.ts` restored to default.
Still NOT covered as of the Semi-FG follow-up above: wastage write-offs, physical-count adjustments, central (non-branch) warehouse RAW/SEMI_FG movements beyond the separate `warehouse_stock` balance table above (that table is intentionally NOT ledger-backed in this pass). The next and final follow-up below closes the first two.

#### Final follow-up: wastage write-offs + physical stock counts — DONE October 31, 2026 (same session)

Real finding before building this: `wastageLogs` and `nightVarianceEntries` (src/db/schema/inventory.ts) had NO writer anywhere in the codebase — both were schema groundwork only, with `GET /api/inventory/variance` as a read-only report that could only ever show empty results (nothing ever inserted a row). This follow-up builds the real write paths for BOTH, for the first time, AND wires them into the ledger in the same pass (no half-migrated ledger).

- New `src/lib/server/inventory-adjustments.ts`: `logWastage()` (debits real `inventory_stock`, fails closed 409 if the requested qty exceeds what's actually on hand — same conservation guarantee as `deductStock`; mandatory non-empty `photoUrl` reference, matching the schema's own "mandatory proof" comment; reason restricted to `expired`/`dropped`/`burnt`) and `submitNightVariance()` (the real counted quantity at a physical stock count — `theoreticalQty` is captured SERVER-SIDE from the current `inventory_stock.qtyOnHand` at count time, never client-supplied, so it can't be gamed; the physical count overrides it; `varianceValueInr` is priced from the latest locked vendor rate, same lookup pattern as `estimateIndentValueTsh` — and FAILS CLOSED with 409 if no locked rate exists for that material, rather than fabricating a 0/guessed value, same "never fabricate a number" convention as `business-policy.ts`; `flaggedPilferage` is the submitting staff's own manual judgment call, deliberately NOT an auto-computed threshold — no Owner-approved pilferage-detection rule exists yet, and inventing one here would itself violate this project's standing policy-fabrication rule; duplicate submissions for the same material+branch+shift-date are rejected 409).
- Schema: additive migration `drizzle/0022_bent_gateway.sql` — two new `stock_movement_type` enum values, `WASTAGE_WRITE_OFF` and `PHYSICAL_COUNT_ADJUST`. No table changes — `wastageLogs`/`nightVarianceEntries` already existed with the right shape.
- New API: `POST /api/inventory/wastage` (new route file) and `POST /api/inventory/variance` (added to the EXISTING read-only GET route's file, same report pairing). Both Owner/INVENTORY-gated, branch-scoped.
- `src/db/schema/stock-ledger.ts` / `src/lib/server/stock-ledger.ts`: `stockMovementTypeEnum`/`StockMovementType` extended with the two new types — no other ledger changes needed, `postStockMovement`'s discriminated-union shape already handled a plain `rawMaterialId` caller.
Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 478/478; `npx next build` clean; post-build `drizzle-kit generate` confirms zero drift. Applied to `restaurant_erp_local` AND a from-scratch disposable QA database (`restaurant_erp_wastagevar_qa_20261031`, all 23 migrations clean) — confirmed the new enum values exist via a direct `enum_range` query, not just the CLI's exit message (per this session's own recurring migration-journal lesson). Real HTTP+PostgreSQL integration, `tests/wastage-variance.integration.cjs`, isolated QA app (port 4981): **15/15 passed** — wastage with an empty photo reference is rejected (400); wasting more than what's on hand is rejected (409) with stock left untouched; a real 3kg write-off debits stock to exactly 17.000 and posts one `WASTAGE_WRITE_OFF` row sourced from the real wastage-log id; a physical count for a material with no locked vendor rate is rejected (409), proving the fail-closed valuation guarantee; a real count (system believes 17kg, actual count 15kg) correctly captures `theoreticalQty: 17.000` server-side, computes `varianceQty: -2.000` and `varianceValueInr: -20.00` (real priced value, -2kg × rate 10.00), preserves the submitted `flaggedPilferage: true` exactly, reconciles `inventory_stock.qtyOnHand` to the real counted 15.000, and posts a `PHYSICAL_COUNT_ADJUST` ledger row sourced from the real variance-entry id; a duplicate count for the same material+shift-date is rejected (409) with stock untouched; the material's full ledger-covered history (-3 wastage, -2 count adjustment) sums to exactly -5.000, matching the real net change in `qtyOnHand` (20 → 15) across both writers.
Release: N/A — local, uncommitted source only. `restaurant_erp_local` has migration `0022` applied; production Neon does NOT — do not apply without a separate explicit approval.
Remaining, deliberately out of scope for GAP-004's closure: branch-to-branch stock transfers (source must be CENTRAL today); a `CANCELLED` stock-transfer status exists in the enum but nothing ever sets it or credits the central balance back; any central (non-branch) Semi-FG movement (central warehouse only tracks RAW via `warehouse_stock`, by design, not ledger-backed). These are narrower, lower-frequency gaps than the core writer set this GAP's acceptance criteria describe, and are better tracked as their own small follow-ups if/when needed rather than blocking this GAP's closure.

### GAP-005 - Capture actual GRN quantities and delivery differences

Status: DONE (October 31, 2026) — multiple deliveries per PO implemented, tested, and verified; see the implementation note below the design plan.
Coverage: PARTIAL | Phase: P1 | Depends on: GAP-001, GAP-004
Source: S1 GRN; S3 quantity/quality check; E02.

Acceptance: receiving records actual counted quantity separately from ordered and quality-accepted/failed quantity. Short/excess delivery rules, remaining-PO quantity, receipt corrections and partial/multiple deliveries follow the approved policy; no unexplained duplication of stock or claims. Recompute invoice matching from true accepted value. Prove ordered 100/received 90 and quality failure are distinct cases; preserve existing receipts/matches. Support multiple receipts if approved, otherwise explicitly document the approved restriction and completion behavior.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/app/api/purchase/orders/[id]/receive/route.ts`, `src/lib/server/grn-quality.ts` (`recordGrnQuality`, `readGrns`), `src/lib/server/purchase.ts` (`computeThreeWayMatch`), `src/lib/server/vendor-invoices.ts` aur `src/app/purchase/page-content.tsx` ke receiving/quality workspace ko extend karein.
- Proposed data/server change: PROPOSED: receipt line -> original PO-line linkage, actual counted quantity, delivery identity/idempotency, failed/accepted snapshots and remaining ordered quantity. General descriptive purchases and stock purchases retain distinct behavior. Quality finalization credits accepted stock via GAP-004 and preserves its existing verified origin/quality evidence.
- Proposed API/UI fit: Purchase receive dialog ordered quantity read-only, actual received input, shortage/excess reason aur lot capture show kare; quality workspace physical receipt se accepted/rejected split kare. Existing receive payload currently empty hai, isliye server parser, UI, replay fingerprint aur tests together change honge.
- Compatibility / rollout: Today receive closes PO and invoice loader picks one GRN; threeWayMatch also uniquely binds PO/GRN. Multiple deliveries approve hon to receipt allocation/remaining status, quality lookup, invoice accepted-value aggregation, claim links and matching schema all migrate coherently. Old finalized GRNs/matches immutable; simply removing a unique index is not the implementation.
- Concrete proof scenario: Ordered 100, physically received 90, quality failed 5 -> usable +85, physical rejected 5 and delivery shortage 10 stay distinct. Second approved delivery cannot receive more than outstanding without explicit excess policy; retry posts no extra stock.
- Business improvement: Client ke actual quantity/quality check ko data model support karega; invoice aur usable inventory ordered quantity se galat inflate nahi honge.

First-slice implementation note (October 31, 2026, NOT a DONE closure — the harder "multiple deliveries" half is deliberately deferred): `src/app/api/purchase/orders/[id]/receive/route.ts` now accepts an OPTIONAL `lines` body field (`parseReceiveLines` in `src/lib/server/purchase.ts`) letting the receiver record the real COUNTED quantity per line — can be genuinely LESS than ordered (a real vendor shortage), not just a copy of `qtyOrdered` as it silently was before (the route's own prior comment admitted this: "a real 'receive less than ordered' flow is a later increment, not faked here"). Omitted lines keep the old default (received == ordered) for full back-compat with every existing test. Validated: 0 <= qtyReceived <= qtyOrdered, no unknown/duplicate line keys, keyed by rawMaterialId or itemDescription same as a PO line. The response now returns an explicit `shortfalls` array (`{ rawMaterialId, itemDescription, qtyOrdered, qtyReceived, qtyShort }`) for any line short-delivered, also recorded into the existing `audit_log.GRN_CREATED` row's `metadataJson` for a durable trail. `grn-quality-policy.ts` already correctly handled `received !== ordered` (it has its own `if (received > ordered) throw` guard) — confirming this was purely a missing INPUT path, not a missing model; no change was needed there.
NOT implemented in this slice (the real remaining scope, not silently dropped): a LATER, separate delivery against the SAME PO's outstanding shortfall (multiple GRNs per PO). `threeWayMatch.poId` AND `threeWayMatch.grnId` are both UNIQUE today — the invoice-matching model structurally assumes exactly one GRN per PO. Enabling multiple deliveries needs that redesigned (aggregate accepted value across GRNs, or a different matching unit), which is its own dedicated, reviewed pass per the blueprint's own warning ("simply removing a unique index is not the implementation") — NOT attempted here to avoid destabilizing the existing GRN-quality/invoice/three-way-match chain. The PO still closes (`status: RECEIVED`) after exactly one receive, same as before; a genuine remaining-shortfall completion still requires a new PO today, same as before this slice.
Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 478/478 — new unit test `tests/purchase.test.cjs` ("GAP-005: receive-line overrides...") covers: omitted-lines default, real shortage capture, itemDescription-keyed (general-purchase) lines, over-ordered rejection, negative rejection, a deliberate zero-quantity (total shortage) receipt, unknown-line rejection, duplicate-line rejection, unknown-field rejection, non-array rejection. No schema change — reused the already-present `qtyOrdered`/`qtyReceived` columns, so no new migration, no new QA-DB integration run needed beyond the existing unit coverage (the receive route's quality-posting/stock-crediting path downstream is already covered by `tests/grn-quality.integration.cjs` and `tests/purchase.integration.cjs`, unaffected by this change).
Release: N/A — local, uncommitted source only; ask before committing/deploying. No schema change in this slice, so no separate migration-confirmation step was needed.

#### DESIGN PLAN — multiple deliveries per PO — IMPLEMENTED October 31, 2026 (same session, after user approval)

Status update: GAP-005 is now DONE. The plan below was built essentially as designed; differences from the original plan are noted inline where they occurred.

User explicitly asked for this plan to be reviewed BEFORE any code/migration (October 31, 2026), given the financial-matching risk. The plan below is preserved as written for the record.

Why it's hard: today `grns.poId` has NO unique DB constraint (a second GRN row for the same PO is not itself blocked at the DB level) — the actual one-GRN-per-PO assumption lives in THREE separate places that would all silently misbehave with a second GRN today: (1) `src/app/api/purchase/orders/[id]/receive/route.ts`'s `assertPoNotReceived(po.materialReceivedAt)` hard-blocks any second receive outright; (2) `src/lib/server/vendor-invoices.ts`'s `loadPoAndGrnForInvoice` does `select from grns where poId = X limit 1` — a second GRN would just be silently ignored, not merged; (3) `threeWayMatch.poId` AND `threeWayMatch.grnId` are both UNIQUE — a second GRN's accepted value could never be matched at all even if (1) and (2) were fixed.

Proposed minimal-blast-radius design (keeps "one invoice per PO" as the existing deliberate v1 policy — comment in vendor-invoices.ts already says multiple invoices per PO is explicitly out of scope and should STAY out of scope; only the receiving side needs to support multiple deliveries, with ONE final invoice/match raised once the PO is fully delivered):

1. Schema (additive, needs its own migration + explicit confirmation when ready to build):
   - Drop `threeWayMatch.grnId`'s UNIQUE constraint and NOT-NULL requirement (keep the column for "the last/triggering GRN", informational only) OR replace it with a new join table `three_way_match_grns (id, matchId, grnId)` — one row per GRN that contributed to the match, for a full audit trail of which deliveries were included. Join-table approach preferred: matches this project's existing "extra line/join table over a packed array" convention (e.g. indentLines, grnLines) and keeps `grns.id` referential integrity clean.
   - No change needed to `grns`/`grnLines` schema at all — a PO can already have multiple GRN rows today, nothing stops a second INSERT at the DB layer.

2. Receive route (`[id]/receive/route.ts`) — replace the single `materialReceivedAt`-based gate with a REMAINING-QUANTITY gate per PO line:
   - Compute, per PO line (keyed by rawMaterialId/itemDescription, same key as `parseReceiveLines`), `received_so_far = sum(qtyReceived) across every existing GRN for this PO for that line`. Reject a new receive line whose qty would push `received_so_far` over `qtyOrdered` (replaces today's single-shot `qtyReceived <= qtyOrdered` check with a CUMULATIVE one).
   - PO status: `PARTIALLY_RECEIVED` while any line's remaining > 0 after this receive, `RECEIVED` once every line's `received_so_far == qtyOrdered` exactly. `materialReceivedAt` keeps its existing meaning ("receiving has started") — set on the FIRST receive only, unchanged.
   - A receive with an EMPTY `lines` override on a `PARTIALLY_RECEIVED` PO means "receive the full remaining amount of every still-outstanding line" (mirrors today's default-to-ordered behavior, generalized to default-to-REMAINING).

3. Quality (`grn-quality.ts`) — NO change needed. Quality already operates per-GRN-row; a second GRN just gets its own independent PASS/FAIL/PARTIAL decision, exactly like today's single GRN. This is the main reason the design is viable without a deeper rewrite.

4. Invoice/three-way-match (`vendor-invoices.ts`, `computeThreeWayMatch` in `purchase.ts`):
   - `loadPoAndGrnForInvoice` changes from "fetch the one grn" to: fetch ALL GRNs for this PO, require the PO's own status to be `RECEIVED` (fully delivered — enforces "invoice only once delivery is complete", a clean, explicit policy rather than an accidental side effect), and require EVERY one of those GRNs to have `status !== "PENDING"` (every delivery's quality decision recorded).
   - `computeThreeWayMatch` changes from "one GRN's lines" to "every GRN's lines for this PO, aggregated per rawMaterialId/itemDescription BEFORE comparing against the PO line's ordered qty/rate" — same aggregation pattern this codebase already uses in `assertPoMatchesIndent` (exact-decimal `Map<string, bigint>` totals, never floating point).
   - `threeWayMatch` insert: one row still created per invoice (unchanged — "one invoice per PO" stays true), but now also inserts one `three_way_match_grns` row per contributing GRN.

5. Compatibility: every EXISTING single-GRN PO/match in the database is unaffected — it's just the degenerate case of "exactly one contributing GRN," so the aggregation logic must be proven to produce IDENTICAL results to today's single-GRN computation for that case (regression-tested against the existing `tests/purchase.integration.cjs`/`grn-quality.integration.cjs` flows, not just new multi-GRN tests).

6. Concrete proof scenario to build before calling this done (per the GAP's own acceptance criteria): PO orders 100kg. First GRN receives 60kg (quality PASS on all 60). PO status is `PARTIALLY_RECEIVED`, invoice creation is rejected (409, "PO not fully received"). Second GRN receives the remaining 40kg (quality PARTIAL: 35 pass, 5 fail). PO status becomes `RECEIVED`. Invoice creation now succeeds, aggregating 60+35=95kg accepted across both GRNs against the 100kg ordered — matched/mismatched computed from that TRUE aggregate, not either GRN alone. A THIRD attempted receive against this now-fully-received PO is rejected (every line's remaining is 0). Concurrent receives against the same remaining quantity from two requests: exactly one succeeds per contested line (same row-lock pattern as `deductStock`/`warehouse-stock.ts`'s debit).

7. Rollout note: this is genuinely a multi-file, financial-logic-touching change (receive route, quality route untouched but its callers' assumptions change, vendor-invoices.ts, purchase.ts's computeThreeWayMatch, a new join table/migration, plus full regression + a dedicated multi-GRN integration test). Recommend building and verifying it as its own complete pass (not mixed with other GAP work), with the migration applied to local+QA only and a full `tests/*.integration.cjs` re-run (not just the new test) before calling GAP-005 DONE.

#### IMPLEMENTATION NOTE (October 31, 2026, same session — DONE)

Built as planned, with one simplification found during implementation: `computeThreeWayMatch` (purchase.ts) needed ZERO changes — it already just reduces over whatever `grnLines` array it's given, so passing it the AGGREGATE of every contributing GRN's lines (instead of one GRN's lines) required no change to that function itself, only to the query that builds the array (`vendor-invoices.ts`).

Schema: additive migration `drizzle/0021_dapper_alice.sql` — new join table `three_way_match_grns` (matchId, grnId, unique together) for the full audit trail of contributing GRNs; `threeWayMatch.grnId` dropped its UNIQUE constraint and NOT NULL requirement (kept as an informational "last GRN" pointer only). `grns`/`grnLines` schema itself needed NO change — nothing ever blocked a second GRN row at the DB level; the blocker was always application logic.

Code: `src/lib/server/purchase.ts` gained `computeOutstandingReceive()` (per-line remaining = ordered minus sum of every prior GRN's qtyReceived for that line, exact decimal/bigint, same aggregation convention as `assertPoMatchesIndent`) and `assertPoReceivable()` (rejects a receive attempt once every line is fully received). `parseReceiveLines` itself needed NO signature change — it already validated "received cannot exceed the cap passed in"; the cap is now REMAINING outstanding instead of full ordered on a later delivery, computed by the caller. `src/app/api/purchase/orders/[id]/receive/route.ts` rewritten: computes outstanding from all prior GRNs for the PO, creates a new GRN against just the outstanding lines, sets PO status to `PARTIALLY_RECEIVED` or `RECEIVED` depending on whether anything remains, `materialReceivedAt` preserved across multiple receives (set once, on the first). `src/lib/server/vendor-invoices.ts`'s `loadPoAndGrnForInvoice` renamed `loadPoAndGrnsForInvoice`: now requires PO status `RECEIVED` (fully delivered) and every one of its GRNs to have a non-PENDING quality result, aggregates ALL their lines before computing the match, and writes one `three_way_match_grns` row per contributing GRN. "One invoice per PO" is UNCHANGED (still enforced the same way). UI (`src/app/purchase/page-content.tsx`): the receive button/badge now keys off `po.status` instead of `materialReceivedAt` alone — shows "Partially Received" + a "Receive Remaining" button instead of hiding the action after the first (now possibly partial) receive; the Invoice step only appears once `status === "RECEIVED"`.

IMPORTANT OPERATIONAL FINDING (same migration-journal clock-drift bug as GAP-004's note, recurring): migration `0021`'s freshly-generated `when` timestamp was AGAIN behind the manually-bumped `0020` from the earlier fix this session — `drizzle-kit migrate` printed success while applying nothing, exactly as before. Fixed the same way (bumped 0021's journal timestamp above 0020's), confirmed via a direct `\dt`/`\d` check this time BEFORE trusting the CLI output. Documented in the `database-schema-migrations` skill: after one journal fix, check EVERY subsequent new migration this session, not just the one you already fixed.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 478/478 (no existing unit test needed changes — `parseReceiveLines`'s signature/behavior is unchanged). Applied to `restaurant_erp_local` AND two from-scratch disposable QA databases. Real HTTP+PostgreSQL integration, `tests/multi-grn-receive.integration.cjs`, isolated QA app (port 4961): **11/11 passed** — a 100kg PO's first delivery of 60kg returns `poStatus: PARTIALLY_RECEIVED` (confirmed in the DB row too); invoicing is rejected (409) while partially received; attempting to receive 41kg against only 40kg remaining is rejected (400); the second (omitted-lines = full remaining) receive returns `poStatus: RECEIVED` with its GRN line correctly showing `qtyReceived: 40.000` (the REMAINING amount, not the original 100); a third receive attempt on the now-fully-received PO is rejected (409); invoicing now succeeds, with `grnAcceptedTotalInr` correctly `950.00` — the AGGREGATE of both GRNs' accepted value (60kg PASS + 35kg of the second delivery's PARTIAL, at rate 10) — proving the match used both deliveries, not just one; `three_way_match_grns` has exactly 2 rows, one per contributing GRN; a second invoice attempt for the same PO is still rejected (409), confirming "one invoice per PO" stayed intact. Also RE-RAN the EXISTING `tests/purchase.integration.cjs` (50 assertions covering the whole Indent→PO→Bill→Receive→Quality→Invoice flow, including its own "re-receiving an already-fully-received PO → 409" assertion) against a fresh QA database with the new schema: **50/50 still passed**, confirming the rewritten receive route is fully backward-compatible with the original single-delivery case. QA servers/dists/databases torn down after each run (one stray `stock_movements` row left by `purchase.integration.cjs`'s pre-existing cleanup — which predated GAP-004 and didn't know about that table — was identified and removed, and that test file's cleanup was patched to include it for future runs); `tsconfig.json`/`next-env.d.ts` restored to default.
Release: N/A — local, uncommitted source only; ask before committing/deploying, same standing rule as every other schema change in this file. `restaurant_erp_local` has migration `0021` applied; production Neon does NOT — do not apply without a separate explicit approval.

### GAP-006 - Implement usable batch and expiry lifecycle

Status: DONE (November 1, 2026 — completion pass closed; backend verified by real HTTP+PostgreSQL integration tests across 4 fresh disposable QA databases, frontend wired and unit-tested against matching API contracts; no manual browser click-through was done in this pass)
Coverage: RAW MATERIAL only (Semi-FG batch/expiry tracking deliberately out of scope, per Owner decision below) | Phase: P1 | Depends on: GAP-004, GAP-005
Source: S2 processed inventory with expiry dates; E05-E06.

Acceptance: required stock carries lot/production/expiry data through receipt, production and transfer; remaining batch quantity reconciles with location totals. Expired-stock display, blocking/warning and write-off follow approved policy; near-expiry thresholds and dates are configurable. Existing schema fields alone are insufficient. A proposed FEFO policy needs explicit approval rather than being inferred from the screenshot.

#### Owner decisions (confirmed via clarify, October 31, 2026)

1. Expired stock HARD BLOCK: real consumption (production/POS) can NEVER draw from an expired batch, even when the aggregate `inventory_stock.qtyOnHand` total looks sufficient. The ONLY way to remove expired stock is a wastage write-off with reason `expired`.
2. Allocation order: FEFO (First-Expired-First-Out) — the soonest-to-expire eligible batch is drawn down first.
3. Near-expiry warning threshold: Owner-configurable (`NEAR_EXPIRY_WARNING_DAYS`, `src/lib/server/business-policy.ts`), same convention as the two existing business-policy thresholds — no fixed number invented by a developer. `null` (unset) means no near-expiry soft-warning anywhere; hard "expired" is always computed regardless.
4. Scope: RAW MATERIAL only this pass. Semi-FG lot/expiry tracking is a separate, later gap.

#### Approved completion pass (October 31, 2026; implementation/verification in progress)

The user separately approved the schema design and local/disposable-QA apply: central warehouse batches, original lot/expiry preservation through transfers, durable batch allocation audit, unknown-expiry consumption/dispatch HOLD, evidence-based Owner reconciliation and explicitly verified non-expiring lots. Commit/push/production migration/deploy are NOT authorized.

This policy supersedes the earlier slice's unsafe interpretation of null expiry as "never expires". Null expiry without an explicit verified non-expiring disposition is UNKNOWN and held. A batch physically received after expiry remains held; it is not silently discarded or assigned a new date. Legacy aggregate balances are never duplicated by lot reconciliation, which may only assign the exact existing unbatched difference. Semi-FG batching remains outside this approved raw-material scope.

Current verification boundary: fresh disposable `restaurant_erp_gap006_qa_20261031` replayed the existing 23-entry migration chain. The long-lived `restaurant_erp_local` has pre-existing lineage discrepancies (missing migration 0016, historical line-ending hashes and different recorded 0018/0019 timestamps); do NOT rewrite applied journal entries or apply new changes there merely because the old CLI reported success. This pass uses fresh disposable migration/upgrade proof; local-dev reconciliation is a separate explicit task.

#### Earlier backend slice (historical evidence only; NOT full GAP closure)

`stockBatches` (src/db/schema/inventory.ts) already had the exact right shape (branchId, rawMaterialId, batchNo, qtyReceived, qtyRemaining, expiryDate, grnLineId, receivedAt) — it had NO writer anywhere before this pass, same situation as GAP-004's wastage/variance follow-up. **Zero schema/migration change was needed for this GAP** — confirmed via a post-build `drizzle-kit generate` reporting "No schema changes, nothing to migrate".

New `src/lib/server/stock-batches.ts` — the core allocator, the first-ever writer for this table:
- `creditBatch()`: one new batch row per real credit event.
- `allocateConsume(tx, branchId, rawMaterialId, qty, { allowExpired })`: FEFO allocator (locks every batch with remaining stock, orders by `expiryDate ASC` — Postgres's own NULLS-LAST default puts a batch with no tracked expiry last, i.e. "never expires, consumed only once every dated batch is exhausted`). With `allowExpired: false` this is the HARD BLOCK: if the non-expired total is insufficient, it throws 409 even though the blind aggregate total would have passed — BEFORE `inventory_stock` itself is ever touched (whole transaction rolls back).
- `allocateExpiredConsume()`: draws ONLY from expired batches — used exclusively by wastage reason `expired`; hard-rejects if less is actually expired than claimed, so staff cannot mislabel a non-expired write-off to dodge the block.
- Invariant this module exists to protect: `sum(stockBatches.qtyRemaining)` for a branch+material always equals `inventory_stock.qtyOnHand` for that same branch+material — enforced by touching BOTH in the same transaction in every RAW writer (no half-migrated ledger, same rule GAP-004 set for `stock_movements`).

Writers updated (every RAW `inventory_stock` writer in the codebase, audited via a full-repo grep):
- `grn-quality.ts`: one new batch per ACCEPTED GRN LINE (not GAP-004's aggregated-by-material credit, so two lines of the same material with different expiry dates stay separate lots). `QualityInput.lines[].expiryDate` (nullable, YYYY-MM-DD) added to `grn-quality-policy.ts`'s input/replay-verification schema — the existing idempotent-replay check (`sameQualityRequest`, a whole-object JSON comparison) automatically covers it, no special-case replay logic needed.
- `production.ts`'s `deductStock` raw-debit loop: calls `allocateConsume(..., { allowExpired: false })` BEFORE the aggregate `inventory_stock` update — the actual hard-block enforcement point for both POS sale and Semi-FG production (both route through this one function).
- `inventory-adjustments.ts`'s `logWastage`: reason `expired` → `allocateExpiredConsume` (only-expired, hard-rejects a false claim); reason `dropped`/`burnt` → `allocateConsume({ allowExpired: true })` (FEFO across ALL batches — stock lost while genuinely in active use can legitimately come from any lot, including an already-expired one if that's all that remains).
- `inventory-adjustments.ts`'s `submitNightVariance`: a shortfall (physical < theoretical) draws FEFO across all batches (`allowExpired: true` — a real counted shortfall isn't a prevented consumption, the hard-block doesn't apply); a surplus credits one new "unknown origin" batch (`expiryDate: null` — the count can't say which lot the extra came from, so this doesn't fabricate a date).
- `POST /api/inventory` (opening-stock creation) and `POST /api/stock-transfers/[id]/receive`: both credit one "unknown origin" batch (`expiryDate: null`) — opening stock predates batch tracking, and the source central warehouse (`warehouse_stock`, GAP-004's follow-up) is a flat, non-expiry-tracked balance, so neither carries real expiry data to preserve. This keeps the `stockBatches`/`inventory_stock` invariant intact everywhere without inventing a date no one actually knows.

New read endpoint `GET /api/inventory/batches` — lot detail + expiry exception view (hard `expired` always computed; soft `nearExpiry` only when the Owner has set the threshold).

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 478/478 (no existing unit test needed changes); `npx next build` clean; post-build `drizzle-kit generate` confirms zero drift. Real HTTP+PostgreSQL integration, `tests/batches-fefo.integration.cjs`, fresh disposable QA database + isolated app: **13/13 passed** — the scenario straight from this GAP's own blueprint: 4kg credited expiring yesterday + 6kg credited expiring in 30 days (aggregate 10kg); producing a dish needing 7kg flour is REJECTED (409) even though the aggregate total (10kg) looks sufficient, because only 6kg is non-expired; producing within the 6kg non-expired total succeeds, drawn from the fresh batch only (the expired 4kg is left untouched, held — not silently deleted); an idempotent retry with the same key does not double-allocate; a "dropped" wastage write-off correctly draws from the expired batch (FEFO, allowed since dropped/burnt isn't blocked); a stock-transfer receipt into a second branch credits an unknown-origin (null-expiry) batch; `GET /api/inventory/batches` correctly reflects only the real remaining stock. Re-verified backward compatibility: `tests/purchase.integration.cjs` (classic single-GRN case) 50/50 and `tests/multi-grn-receive.integration.cjs` (GAP-005's multi-delivery case) 11/11, both re-run clean after this GAP's changes (their cleanup sections needed one addition each: deleting `stock_batches` rows, since GRN quality now writes them too).
Release: N/A — local, uncommitted source only; ask before committing/deploying, same standing rule as every other schema change in this file. No new migration exists for this GAP (schema was already sufficient).

#### Completion pass (November 1, 2026) — central warehouse batches, transfer lot preservation, Owner reconciliation

This closes the scope the user explicitly approved after the "Pehle design me badlav discuss karo" / "Haan, isi design aur local/QA schema changes ko approve karta hoon" exchange. Two parallel background subagents were dispatched for this (backend-only; frontend/business-policy-settings-only); both subagent runs ended in `status=interrupted` (not success) after ~68 minutes each. Everything below reflects this session's own manual reconciliation of their on-disk changes — not an unverified trust of the subagents' own claims.

New schema (migration `0023_green_fixer.sql`, additive only): `stock_batches` gains `warehouse_id` (nullable, XOR with `branch_id` via a CHECK constraint — a lot now belongs to either a branch OR a central warehouse, never both), `expiry_status` (`UNKNOWN` | `DATED` | `NON_EXPIRING`, default `UNKNOWN`) and `origin_batch_id` (self-referencing — preserves lot identity across a transfer). New tables: `batch_movements` (append-only per-batch audit: every credit/debit with actor, source, evidence, before/after expiry metadata), `batch_transfer_allocations` (which lot(s) a dispatch actually drew from, with that lot's real batchNo/expiryDate/expiryStatus frozen at dispatch time), `batch_transfer_receipts` + `batch_transfer_receipt_lines` (idempotent per-lot receipt record).

Unknown-expiry HOLD policy (supersedes the earlier slice's unsafe "null expiry = never expires" interpretation): a batch credited with no real lot info is `expiryStatus: UNKNOWN`, and `allocateLocatedConsume` excludes any `held` batch (UNKNOWN, same as expired) from FEFO allocation with `allowExpired: false` — i.e. real consumption, production, POS, and stock-transfer dispatch can ALL only draw from a batch with a known disposition (`DATED` and not expired, or explicitly `NON_EXPIRING`). This applies uniformly to both branch and central-warehouse lots now (previously central-warehouse stock was not batch-tracked at all).

Central warehouse batches: `POST /api/warehouses/[id]/stock-in` now also calls `creditLocatedBatch(tx, {warehouseId}, ...)` alongside the existing flat `warehouseStock` aggregate credit — the same dual aggregate/lot invariant GAP-004/GAP-006 already enforce for branches. A caller may supply `batchNo`/`expiryDate` for a real known lot; omitting both leaves it UNKNOWN/held.

Transfer dispatch/receive lot preservation: `POST /api/stock-transfers` now FEFO-allocates from the source central warehouse's real lots (`allowExpired: false`) BEFORE debiting the flat balance, and records one `batchTransferAllocations` row per lot actually drawn — freezing that lot's real `batchNo`/`expiryDate`/`expiryStatus`. `POST /api/stock-transfers/[id]/receive` then credits the destination branch with THAT SAME preserved lot identity (`creditLocatedBatch` with `originBatchId` set), never a fabricated "unknown origin" batch, as long as the dispatch-side lot was known. A multi-lot dispatch with a real shortfall on receipt requires an explicit per-lot `allocations` breakdown (ambiguous otherwise); a single-lot dispatch or full-qty receipt may omit it. Receipt is idempotent via a UNIQUE `batchTransferReceipts.transferId` plus a canonical (key-order-independent) JSON comparison of the replay request — a naive `JSON.stringify` comparison against a value read back from a `jsonb` column was tried first and found to false-negative on exact retries, because Postgres's `jsonb` storage does not preserve object key order; fixed with a `canonicalJson()` helper in `src/lib/server/http.ts`.

Owner-only batch verify: `POST /api/inventory/batches/[id]/verify` resolves one UNKNOWN batch to either a real `expiryDate` (`DATED`) or an explicit `NON_EXPIRING` disposition, with mandatory auditable evidence text. It only ever releases a batch that started UNKNOWN — it can never silently rewrite an already-DATED batch's expiry (that would let someone falsify history).

Owner-only reconciliation: `POST /api/inventory/batches/reconcile` allocates the EXACT existing unbatched difference (saved aggregate minus the sum of real remaining lots, for one branch+material or warehouse+material) into one or more Owner-attested real lots. The lot total must equal the difference exactly — it can never be used to fabricate extra stock, only to retroactively classify stock that already existed before batch tracking covered that location. A retry of an already-reconciled (now zero-difference) request is naturally rejected (409, no idempotency bookkeeping needed — the difference being computed fresh each call is what makes this self-closing).

`GET /api/inventory/batches` extended: supports `branchId` XOR `warehouseId` (warehouse lots are Owner-only), returns `expired`/`held`/`nearExpiry` per lot plus a `reconciliation` array of any location+material whose saved aggregate doesn't match its lot total — this is what surfaces "needs Owner reconciliation" in the UI rather than requiring someone to go looking for it.

Frontend (built by the interrupted frontend/settings subagent, reviewed and left as found; NOT independently re-verified by browser click-through in this session): `src/app/inventory/batch-panel.tsx` (lot list, HELD/expired/near-expiry badges, Owner verify form, exact-lot reconciliation form), `src/app/warehouse/page-content.tsx`'s transfer-receive dialog (shows each dispatched lot's original batchNo/expiryDate, per-lot actual-received-quantity inputs, posts `{qtyReceived, allocations:[{allocationId,qtyReceived}]}` matching the backend contract exactly), GRN quality form (per-line batch reference + expiry capture, non-expiring checkbox requiring Owner evidence), and the business-policy settings screen for `nearExpiryWarningDays`. `tests/gap006-ui.test.cjs` (part of the 491-test unit suite) exercises all of these against the real contracts — including the exact warehouse-receipt request shape asserted above — and passes.

Reconciliation work actually done this session (the two subagents having ended `interrupted`, not `success`): found and fixed 2 broken call sites where the backend subagent had extended `creditBatch()`'s signature without updating `POST /api/inventory` (opening stock) and the old `receive` route; found and fixed the `canonicalJson` idempotency bug above; found and fixed a recurring migration-journal timestamp-drift bug (see CLAUDE.md/the `database-schema-migrations` skill) that silently no-ops a `drizzle-kit migrate` without erroring; rewrote `POST /api/stock-transfers` and `POST /api/stock-transfers/[id]/receive` from scratch to add FEFO allocation + lot preservation (the subagents had not actually reached this file before being interrupted); added the 2 new Owner-only routes (`verify`, `reconcile`) that the design called for but neither subagent had written.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 (regression, same count before and after this session's fixes — the interrupted subagents had already added 13 new unit tests before being cut off, this session added none, only fixed call sites); `npm run build` clean. Real HTTP+PostgreSQL integration on 4 fresh disposable QA databases (each migrated from scratch through all 24 migrations, each dropped after): `tests/gap006-lifecycle.integration.cjs` **43/43** (opening stock, GRN batch credit, FEFO consume with hard-block, central stock-in, transfer dispatch-with-allocation, transfer receive with lot preservation and idempotent replay, Owner verify, Owner reconciliation, branch isolation); backward-compat re-runs `tests/warehouse-stock.integration.cjs` **7/7** (updated to supply a real batchNo+expiryDate on stock-in, since an UNKNOWN/held lot can no longer be dispatched — this is the new approved HOLD policy working as intended, not a regression), `tests/purchase.integration.cjs` **50/50**, `tests/multi-grn-receive.integration.cjs` **11/11**, `tests/grn-quality.integration.cjs` **26/28** (the 2 unreached checks attempt a raw SQL `INSERT` that directly violates the `inventory_stock_branch_raw_unique` index, which has existed since migration `0016` — confirmed via `git show HEAD` that this exact test line is unmodified by this session or either subagent; it is pre-existing, unreachable test code testing a state the database itself has never allowed, not a regression from this GAP). 3 integration tests' own `cleanup()` functions needed one addition each (deleting `batch_movements`/new transfer-audit rows before `stock_batches`/`stock_transfers`, to satisfy the new foreign keys) — fixed in `tests/warehouse-stock.integration.cjs`, `tests/purchase.integration.cjs`, `tests/multi-grn-receive.integration.cjs`.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migration `0023` applied (only disposable QA databases were used for this pass's verification, all created and dropped within this session); production Neon is untouched.

### GAP-007 - Physical stock count, approval and reconciliation

Status: BACKEND + UI BUILT (November 1, 2026) — API fully built and tested with real HTTP+PostgreSQL (14/14); a UI panel exists and is wired to the API, type-checks and builds clean, matches the working conventions of this page's existing panels — but live interactive browser click-through was NOT completed (blocked by an unrelated browser-automation-environment data-fetch stall reproduced on an existing, unrelated page too — see note below)
Coverage: RAW MATERIAL only this pass (prepared/Semi-FG counting deferred to GAP-009/GAP-012, same convention as GAP-006) | Phase: P1 | Depends on: GAP-004, GAP-005
Source: S3 end-of-day stock take/reconcile; E06.

Acceptance: branch/location users submit actual raw/prepared counts with a counted-at cutoff; compare against an auditable system snapshot including intervening movements. Authorized independent review posts reasoned once-only adjustments and feeds variance reports/HO review. Closed counts cannot be silently overwritten. Prove zero count, unit precision, movement-during-count, repeated approval and cross-branch denial.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. Scope: RAW MATERIAL only this pass — same as GAP-006.
2. The existing `nightVarianceEntries` (chef self-report, auto-post, GAP-004) is KEPT AS-IS alongside this new formal workflow — different use case (quick daily shift check vs. periodic audited count with mandatory review).
3. Self-approval HARD BLOCK: whoever submitted a count can never also approve/reject it, regardless of role — enforced even for SUPER_ADMIN, not just by role separation.

#### Backend implementation (November 1, 2026)

New schema (migration `0024_neat_jamie_braddock.sql`, additive only): `stock_counts` (header — `status` DRAFT/SUBMITTED/APPROVED/REJECTED, `startedById`/`submittedById`/`approvedById`, CHECK constraints enforcing the right fields are set for each status) and `stock_count_lines` (one row per raw material in the count — `expectedQty` snapshotted server-side at DRAFT creation from the live `inventory_stock` balance, never client-supplied; `physicalQty` filled in at submit).

`src/lib/server/stock-count.ts`: `startStockCount` (creates DRAFT + snapshots every line's `expectedQty`), `submitStockCount` (counter fills in `physicalQty` for every line — must cover exactly the lines started, no more/fewer), `approveStockCount` (only `BRANCH_MANAGER`/`SUPER_ADMIN`, never the submitting user even if they hold that role; for each line computes `delta = physicalQty - expectedQty` against the FROZEN cutoff snapshot, then applies that delta to whatever the CURRENT live balance is — never an overwrite, so a GRN/sale/transfer landing between cutoff and approval survives intact — posts one `stock_movements` row, type `PHYSICAL_COUNT_ADJUST`, same type `nightVarianceEntries` already uses), `rejectStockCount` (same reviewer/self-block rules, no stock mutation, mandatory reason).

GAP-006 invariant maintained: a shortfall is drawn FEFO across all batches (`allowExpired: true` — this is the audited real reduction already, hard-block doesn't apply); a surplus credits one new UNKNOWN/held batch (same convention as `submitNightVariance`).

API: `POST /api/inventory/counts` (start), `GET /api/inventory/counts` (list), `GET /api/inventory/counts/[id]` (detail — redacts `expectedQty` to `null` while DRAFT, a blind count), `POST /api/inventory/counts/[id]/submit`, `/approve`, `/reject`.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 (no existing test touches this new code, so the count stayed the same — no regressions); `npm run build` clean. Real HTTP+PostgreSQL integration, `tests/stock-count.integration.cjs`, fresh disposable QA database (migrated from scratch through all 25 migrations) + isolated app: **14/14 passed**, covering every acceptance-criteria proof point by name: cross-branch denial on both start and read, a blind DRAFT (expectedQty hidden until submit), the movement-during-count scenario exactly as specified in this GAP's own blueprint (cutoff 5, physical 0, a +3 receipt lands mid-count, approved delta -5 leaves the current balance at 3 — not 0, proving the delta-not-overwrite logic), self-approval blocked even for a reviewer-role user, a non-reviewer role blocked from approving, repeated approval rejected with no double-posting (confirmed via a direct ledger-row count), a real zero count honored exactly, and the reject flow leaving stock untouched.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migration `0024` applied (only a disposable QA database was used for this pass's verification, created and dropped within this session); production Neon is untouched.

#### Current-project integration blueprint (fulfilled above)

- Current-project reuse: Existing `src/db/schema/inventory.ts` (`nightVarianceEntries`, `wastageLogs`), `src/app/api/inventory/variance/route.ts` read model and `src/app/inventory/page-content.tsx` ko count/review workflow se connect karein.
- Proposed data/server change: PROPOSED: count header/typed lines, immutable system snapshot at movement cutoff, submitted physical quantity, review events and unique posted-adjustment reference. Derive variance using same units, item/location/lot policy and valuation completeness; authorized independent reviewer posts a ledger delta, never overwrites live balance.
- Proposed API/UI fit: Inventory me Start Count -> Save Draft -> Submit -> Review/Approve actions; new guarded count/action handlers are proposals. Existing variance report reads approved count evidence/adjustment values, prepared and raw counts separately, with missing-cost reason instead of zero.
- Compatibility / rollout: Current variance endpoint reads saved rows, not count submission. Freeze/reject stale line versions and handle movements between cutoff/count/approval under approved policy. New count records must participate in deletion-readiness/retention and HO review without inventing historical counts.
- Concrete proof scenario: System cutoff 5, physical count 0, later receipt +3 before approval: approved -5 adjustment leaves current 3, not 0. Duplicate approval creates one delta; counter cannot self-approve if policy forbids it.
- Business improvement: Stock count audit trail aur real reconciliation milegi, aur late approval se newly received stock accidentally erase nahi hoga.

#### Remaining work before this GAP can be marked fully DONE

- UI exists now (`src/app/inventory/stock-count-panel.tsx` — Start Count, blind physical-count submit form, review/approve/reject for a different manager/owner, wired into `src/app/inventory/page-content.tsx` under `BatchPanel`). `tsc`/`npm run build` both clean with it included. NOT yet manually click-through tested in a real browser: an attempt to do so this session hit a data-fetch stall in the QA harness's browser-automation tab (every panel on the page, including the PRE-EXISTING `/warehouse` page unrelated to this GAP, got stuck on "Loading…" even though a direct `fetch()` call from the same page context resolved correctly in under 30ms) — this points at a browser-automation/environment issue in this specific session, not a defect in the new code, but it means the UI has NOT been proven end-to-end by an actual click. A fresh browser-verification attempt (ideally outside this exact harness state) is the one remaining honest gap.
- A dedicated read endpoint/report for approved count history feeding the variance report is not yet built (the API above covers the count lifecycle itself; connecting it into `/api/inventory/variance`'s existing read model per the blueprint's bullet 1 is still open).

### GAP-009 - Actual kg-to-pcs cutting and production yield

Status: BACKEND + UI BUILT (November 1, 2026) — API fully built and tested with real HTTP+PostgreSQL (13/13); a UI panel exists (`src/app/menu/actual-cutting-panel.tsx`, a separate self-contained form from the Fixed-Recipe `ProductionPanel`, wired into `src/app/menu/menu-workspace.tsx` so both modes are always available side by side) and type-checks/builds clean, but has NOT been manually click-through tested in a real browser this session (time was spent instead on real HTTP+PostgreSQL backend proof, which is the stronger signal; same honest caveat as GAP-007's UI)
Coverage: PARTIAL | Phase: P2 | Depends on: GAP-004, GAP-006, GAP-008

Source: S1 Base Kitchen; S2 red input-kg/output-pcs requirement; E05.

Acceptance: authorized operator records actual input by material/lot, actual pieces produced, trim/waste/by-products and actual yield. Inputs/outputs are conserved, recorded once and visible in the audit trail; branch prepared-stock unit is pcs where required. Fixed BOM planned consumption is not a substitute for actual variable-yield cutting. Approved fractional-unit and variance rules are enforced.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. No per-item flag — the operator chooses "Fixed Recipe" or "Actual Cutting" mode on EVERY production event; both are always available for every Semi-FG item.
2. Conservation enforcement: the Owner's existing `costYieldTolerancePercent` business-policy setting (`src/lib/server/business-policy.ts` — this field already existed, explicitly reserved by its own comment for this GAP) is REUSED and ENFORCED here. Unset tolerance means Actual Cutting is not yet usable — every submission fails closed (409) until the Owner configures a %.

#### Backend implementation (November 1, 2026)

New schema (migration `0025_abnormal_hobgoblin.sql`, additive only, 1 new table): `actual_cutting_productions` — `inputs` (jsonb snapshot of real raw materials + measured kg consumed), `inputTotalKg`, `outputQty`/`outputUnitAtSubmission` (the output item's own `menuItems.outputUnit` — pcs, kg, etc., frozen at submission), `outputMassKg`, `wasteQtyKg`, `unaccountedLossPercent`, `tolerancePercentAtSubmission` (freezes the Owner's setting used for THIS record so a later policy change never retroactively judges a past record), idempotency key. A CHECK constraint (`outputMassKg + wasteQtyKg <= inputTotalKg`) makes the hard physical conservation rule unconditional at the database level, not just the application layer.

`src/lib/server/cutting-production.ts`'s `recordActualCutting`: validates every raw-material input is in `kg` (scope restriction — a non-mass unit like `ltr`/`pcs` is rejected outright so the conservation math never mixes incompatible units); debits raw stock via the SAME hard-blocked FEFO consumption as every other real RAW draw (`allocateConsume`, `allowExpired: false`, GAP-006); if the output unit is `pcs`, rejects a fractional output quantity; enforces the hard physical rule (output mass + waste can never exceed input, no tolerance can excuse this — it is a data error, not a yield variance) and THEN the Owner's tolerance % on the remaining unaccounted loss; credits `semiFgStock` with the real measured output (not a BOM-derived ratio); posts `stock_movements` rows using the SAME existing movement types (`PRODUCTION_CONSUME`/`PRODUCTION_OUTPUT`) as Fixed-BOM production — no new movement type needed. Idempotent (same key + same inputs/output/waste replays without a second debit; same key with different values is rejected).

API: `POST /api/semi-fg/cutting` (new, sibling to the existing Fixed-BOM `POST /api/semi-fg/production` — both always available, no per-item gate). `GET /api/semi-fg/production` extended to also return `cuttingProductions` alongside the existing `productions` list — both modes' audit trail visible in one read.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 (unchanged — no existing unit test touches this new code); `npm run build` clean. Real HTTP+PostgreSQL integration, `tests/actual-cutting.integration.cjs`, fresh disposable QA database (migrated from scratch through all 26 migrations): **13/13 passed** — covers every acceptance-criteria proof point: fails closed (409) when the Owner has not configured a tolerance yet; this GAP's own blueprint's exact proof scenario (10kg input, 9kg measured output mass, 1kg trim, 36 output pcs — passes with 0% unaccounted loss); raw stock debited by exactly 10kg via real FEFO lot consumption; output credited as 36 pcs, not a BOM-derived ratio; fractional pcs output rejected; output+waste physically exceeding input rejected (409) regardless of tolerance; an unaccounted-loss % exceeding the configured tolerance rejected (409), with stock left untouched; idempotent replay (same key, same inputs) returns the same record with no second debit; the same key reused with different input values rejected (409); a non-kg raw material input rejected (400); the audit-trail GET includes the new cutting record. Backward-compat re-run of `tests/semi-fg.integration.cjs` (the existing Fixed-BOM production test, unrelated to this GAP) — **9/9 real HTTP/Postgres checks still pass**; its own `cleanup()` and seed fixtures needed 2 small additions (seeding a matching `stock_batches` lot for its raw-material fixtures, and deleting `stock_movements`/`batch_movements`/`stock_batches` in the right FK order during teardown) — a PRE-EXISTING gap from GAP-006's rollout (confirmed via `git show HEAD` the test file predates this session's and GAP-006's changes), not something this GAP introduced; fixed as found, same spirit as the other backward-compat fixes already made this session.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migration `0025` applied (only disposable QA databases were used for this pass's verification, created and dropped within this session); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE

- UI exists now but has NOT been manually click-through tested in a real browser this session.

#### Current-project integration blueprint (fulfilled above, UI item still open)

- Current-project reuse: Existing `src/lib/server/production.ts` (`produceSemiFg`, `deductStock`), `src/lib/server/production-quantity.ts` (`quantity`, `decimal`, `directRequirements`), `src/db/schema/production.ts` aur `src/app/menu/production-panel.tsx` (`ProductionPanel`) reuse karein.
- Proposed data/server change: PROPOSED: separate actual-cutting mode with measured input-lot allocations, actual output pieces, measured output mass where needed, waste/trim/by-product records and approved unit conversion/yield version. Keep existing fixed-BOM production mode. Kg input and pcs output cannot be directly added/subtracted; conservation uses measured comparable mass or approved evidence, while piece count is a separate output dimension.
- Proposed API/UI fit: Current production panel me Planned Fixed Recipe vs Actual Cutting mode; measured input/output and variance preview. Extend `src/app/api/semi-fg/production/route.ts` via approved action/version or a proposed dedicated cutting handler; stock posting remains a transactional domain service.
- Compatibility / rollout: Existing produceSemiFg derives inputs from BOM; never relabel that as measured actual consumption. Preserve old immutable ProductionSnapshot and idempotency contract; changed actual inputs under a reused key reject. No manual raw fallback after prepared output is posted.
- Concrete proof scenario: A 10 kg input with 9 kg measured output mass, 1 kg trim and 36 output pcs passes the approved conservation rules; changing only output count changes yield, not an invented universal kg-to-pcs ratio. Same command retry produces one batch.
- Business improvement: Fresh-meat cutting ke actual results record honge; each batch ke varying pieces aur wastage ko fixed recipe ki assumption se replace nahi kiya jayega.

### GAP-010 - Production-lot actual cost per piece

Status: DONE for Actual Cutting (November 1, 2026) — scoped THIS PASS to Actual Cutting only (GAP-009), per Owner decision (confirmed via clarify); Fixed-Recipe production keeps its existing planning-estimate recipe-at-sale COGS unchanged, not relabeled as a real lot cost
Coverage: PARTIAL | Phase: P2 | Depends on: GAP-009
Source: S1 pcs/kg costing and sub-recipes; S2 Semi-FG costing; E05, E11.

Acceptance: cost the actual consumed input lots and approved additional flour/flavourings/sub-recipes under a documented valuation/waste-allocation policy; persist total batch value and per-piece cost. Transfers/consumption preserve that valuation and reports distinguish it from existing recipe-at-sale COGS. Missing rates fail closed, zero-cost validity is explicit, money rounding is exact, and later rate/recipe edits do not rewrite historical production cost.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. Scope this pass: Actual Cutting production only — Fixed-Recipe production's existing planning-estimate COGS stays untouched.
2. Real lot cost is snapshotted ON `stockBatches.unitCostTsh` (set once, at real-money-source credit time), not re-derived from the GRN each time it's needed. Non-priced credits (opening stock, physical-count surplus, wastage/night-variance reconciliation, Owner batch-reconcile) leave it NULL ("unknown cost") — Actual Cutting fails closed (409) rather than guessing a cost for such a lot.
3. "Approved additional flour/flavourings/sub-recipes" costing is explicitly DEFERRED to a future pass — this pass covers only the raw-material input cost Actual Cutting already debits.

#### Implementation (November 1, 2026)

Schema (migration `0026_blushing_black_panther.sql`, additive only, 4 ALTER ADD COLUMN statements, all nullable or on a brand-new not-yet-live table): `stockBatches.unitCostTsh` (numeric 12,4, per-kg real cost) and `batchTransferAllocations.unitCostTsh` (frozen at dispatch time, carried through to the receive-time credit so a transferred lot's real cost survives the move); `actualCuttingProductions.inputTotalValueTsh`/`costPerOutputUnitTsh` (numeric 14,2, NOT NULL — safe because this table itself was only created in this same session's GAP-009 pass and has never shipped with rows).

Real cost now flows in at exactly the ONE real-money source this pass recognizes — a GRN-accepted purchase line: `src/lib/server/grn-quality.ts`'s `creditBatch` call now passes `line.rateOrdered` (the vendor rate already captured per GRN line for refund/credit math) as the lot's `unitCostTsh`. `creditLocatedBatch`/`creditBatch` (`src/lib/server/stock-batches.ts`) gained an optional `unitCostTsh` parameter (defaults to `null`/unknown everywhere else — opening stock, warehouse stock-in, physical-count surplus, night-variance surplus, Owner batch-reconcile all correctly stay unpriced, unchanged from before). `allocateLocatedConsume`'s returned `BatchAllocation` now also carries each drawn lot's `unitCostTsh`, so every real consumption path can see what it drew at. Stock-transfer dispatch (`src/app/api/stock-transfers/route.ts`) now freezes the origin lot's `unitCostTsh` into its `batchTransferAllocations` row; receive (`[id]/receive/route.ts`) passes that frozen value through to the destination credit — verified manually end-to-end (dispatch 201 → receive 200 → destination `stock_batches` row carries the exact same `unitCostTsh` as the source lot).

`src/lib/server/cutting-production.ts`'s `recordActualCutting`: after the existing hard-blocked FEFO debit of each raw-material input, inspects every `BatchAllocation` actually drawn from; if ANY has `unitCostTsh === null`, the whole submission fails closed (409) naming the material and lot — the transaction (already inside `mutate()`) rolls back the partial debit automatically, no stock is left touched. Otherwise accumulates the EXACT value (bigint-scaled arithmetic, rate x10^4 * qty-milli x10^3, never a float) across every lot of every input line, rounding to money (2dp) ONCE at the final aggregate step (never per line, so rounding error from many small input lines can never compound) via a half-up `divRoundHalfUp` helper. `costPerOutputUnitTsh` is then derived from that same rounded total divided by the output quantity — an explicitly DERIVED display figure for this record only; it is NOT yet carried forward into downstream consumption (POS sale, transfer-out of the Semi-FG output) — that remains out of this pass's scope per the Owner's own decision, not silently assumed.

UI: `src/app/menu/actual-cutting-panel.tsx`'s history list and success message now show the batch value and cost-per-output-unit alongside the existing conservation figures (tsc/build clean; not separately re-verified via a live browser click-through this pass, same honest caveat already standing for the rest of this panel).

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 unchanged; `npm run build` clean. `tests/actual-cutting.integration.cjs` extended with the real cost math (10kg * TSh 3500.00/kg lot cost = exactly TSh 35000.00 batch value; TSh 35000.00 / 36 pcs rounded once = TSh 972.22/pc) and a new fail-closed proof (drawing from an unpriced lot is rejected 409, stock left untouched) — **17/17 passed** against a fresh disposable QA database migrated through all 27 migrations. Backward-compat: `tests/grn-quality.integration.cjs`'s first 26 real HTTP/Postgres checks (covering exactly the credit/accept/receipt path this GAP touches) still pass unchanged, and a direct query confirmed GRN-accepted batches now correctly carry their real vendor rate into `unit_cost_tsh`; its remaining 2 failures are the same pre-existing, migration-0016-era dead-test-code bug already identified and left unfixed earlier this session (confirmed via `git show HEAD` unrelated to this GAP). A manual end-to-end smoke test (dispatch a CENTRAL lot with a known cost → receive at a BRANCH) confirmed the destination lot's `unitCostTsh` exactly matches the source lot's.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migrations `0025`/`0026` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- Fixed-Recipe production's real lot costing (explicitly out of this pass's scope — Owner decision).
- Approved additional flour/flavourings/sub-recipe costing on top of raw-material input (explicitly deferred — Owner decision).
- Carrying the computed `costPerOutputUnitTsh` valuation forward into downstream Semi-FG consumption (POS sale, transfer-out) and distinguishing it from legacy recipe-at-sale COGS in Reports — this pass only computes and persists the value at production time, per Owner's narrowed scope.

#### Current-project integration blueprint (fulfilled above for Actual Cutting; remaining items listed above)

- Current-project reuse: Existing `src/db/schema/production.ts` (`ProductionSnapshot`, `semiFgProductions`), `src/lib/server/production.ts`, `src/lib/server/cogs.ts` (`computeOrderCogs`) aur `src/app/api/reports/_aggregation.ts` exact money/report boundary ko reuse karein.
- Proposed data/server change: PROPOSED: immutable consumed-lot value allocation, valuation-policy version, batch total and unit-cost snapshot with completeness evidence. Raw receipt/lot value plus approved flour/flavouring/sub-recipe consumption feed exact decimal/rational costing; residual minor units are allocated deterministically so output allocations exhaust batch value.
- Proposed API/UI fit: Production batch details show input cost, waste allocation, output qty and cost/pc; transfers carry saved cost, POS consumption links used lots, and Reports labels lot-valued cost separately from legacy recipe-at-sale COGS. New cost helper is proposed, not a rename of current computeOrderCogs.
- Compatibility / rollout: Current sale COGS prices recipe/rates and has floating-point quantity multiplication; new lot costing must not inherit that for claimed exact valuation. Leave historical captured costs unchanged; new cost-basis/version/completeness determines truthful aggregation and mixed-period labeling.
- Concrete proof scenario: After producing a valued batch, vendor rate/BOM edit leaves saved value unchanged. Consuming all pieces across sales/transfers allocates exactly the batch value including rounding residual; unknown input cost withholds actual value rather than claiming free production.
- Business improvement: Client ka actual production cost per piece aur transfer value traceable hoga, bina current planning estimate ko historical actual bolne ke.

### GAP-011 - Approved production standards and deviation red flags

Status: DONE for Actual Cutting yield (November 1, 2026) — scoped THIS PASS to Actual Cutting only, a SOFT (never-blocking) flag only, and yield% bands only (no cost band this pass), all per Owner decision confirmed via clarify
Coverage: MISSING | Phase: P2 | Depends on: GAP-001, GAP-009, GAP-010
Source: S2 approved cost/raw-input ranges and automatic red flag; E05.

Acceptance: versioned approver-controlled input/cost/yield bands per Semi-FG generate stored, visible deviations for actual production. Boundary equality, zero output, missing standards and out-of-range cases are tested; override/review requires authorized actor and reason. Recipe editing or generic low-stock flags do not satisfy this requirement.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. Scope this pass: Actual Cutting only (same scope pattern as GAP-010) — Fixed-Recipe production untouched.
2. SOFT flag only — a deviation NEVER blocks a production. GAP-009's own hard conservation/tolerance rule is a separate, already-shipped mechanism this GAP does not touch; a production always posts, and a deviation (if any) is recorded for later review.
3. Owner-only authority, both to set a standard and to review a flagged deviation — simplified to a single-actor action (Owner sets a new standard, immediately effective) rather than a separate multi-actor draft/submit/approve pipeline, since only one role is involved anyway.
4. This pass tracks a yield % band only (output mass / input mass * 100) — not cost (GAP-010 already covers real cost separately as its own concern).

#### Implementation (November 1, 2026)

Schema (migration `0027_exotic_bloodstrike.sql`, additive only, 2 brand-new tables, nothing altered): `cuttingYieldStandards` (`src/db/schema/yield-standards.ts`) — one row per Semi-FG item per version; a partial unique index enforces at most one row with `supersededAt IS NULL` (the "current" standard) per item; setting a new standard supersedes (never edits/deletes) the old one, so history survives. `cuttingYieldDeviations` — one row per Actual Cutting production that fell OUTSIDE its applicable standard's band at evaluation time; freezes the standard id AND a copy of its min/max band at that moment, so a later standard relaxation/tightening can never retroactively rewrite a past production's recorded deviation.

`src/lib/server/yield-standards.ts`: `setYieldStandard` (Owner-only via `assertOwner`) atomically supersedes any existing current standard and inserts the new one. `evaluateYieldDeviation` is called from `recordActualCutting` (`src/lib/server/cutting-production.ts`) immediately AFTER the production row is committed — looks up whatever standard is current RIGHT NOW for that item (a missing standard means nothing is evaluated, never a fabricated default band); computes `yieldPercent = outputMassKg / inputTotalKg * 100` in exact bigint arithmetic (never a float); the exact boundary (min or max, inclusive) is explicitly NOT a breach, only strictly outside it is. `reviewYieldDeviation` (Owner-only) requires a non-empty reason, is idempotent on an exact replay, and rejects a second review with a different outcome (409).

API: `GET`/`POST /api/menu-items/[id]/yield-standard` (POST Owner-only, enforced inside the server function, not only at the route); `GET /api/menu-items/yield-deviations` (review queue, any MENU_BOM reader, `unreviewedOnly` filter); `POST /api/menu-items/yield-deviations/[id]/review` (Owner-only).

UI: `src/app/menu/yield-standards-panel.tsx` (new) — Owner-only standard-setting form (shows the item's current band, if any) plus an unreviewed-deviations queue with a mandatory reason field per review action; wired into `src/app/menu/menu-workspace.tsx` alongside the Actual Cutting panel. tsc/build clean; not separately re-verified via a live browser click-through this pass, same honest caveat already standing for the rest of this session's new panels.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 unchanged; `npm run build` clean. New `tests/yield-standards.integration.cjs` — **15/15 passed** against a fresh disposable QA database migrated through all 28 migrations, covering every acceptance-criteria proof point: a non-Owner cannot set a standard or review a deviation (403 both); a missing standard means no deviation is possible; within-band posts with no flag; the EXACT upper boundary (95%) is explicitly NOT a breach; the smallest increment above it (95.10%) DOES flag; below the lower bound also flags AND the production still posts (proving the soft-flag, never-blocks rule); the review queue lists unreviewed flags and shrinks after a review; a review requires a non-empty reason; a later standard relaxation (50%-100%) never rewrites an ALREADY-recorded deviation's frozen 85%-95% band, while a NEW cut afterward correctly evaluates against the relaxed band. Backward-compat: `tests/actual-cutting.integration.cjs` re-run unchanged at 17/17 (confirms GAP-011's hook into `recordActualCutting` didn't disturb GAP-009/010's own behavior).
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migrations `0025`-`0027` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- Fixed-Recipe production standards/deviations (explicitly out of this pass's scope — Owner decision).
- A cost-per-unit band alongside the yield-% band (explicitly deferred — Owner decision; GAP-010 already computes real cost separately, but no approved band/flag exists for it yet).
- A HARD-block override mode, if ever wanted later — this pass is SOFT-flag only by Owner decision.

#### Current-project integration blueprint (fulfilled above for Actual Cutting yield; remaining items listed above)

- Current-project reuse: Existing `src/db/schema/menu.ts` (`bomRecipes.lockedByHq`), `src/lib/server/production.ts`, `src/app/menu/production-panel.tsx` and `src/lib/server/permissions.ts` policy foundations reuse karein.
- Proposed data/server change: PROPOSED: approved versioned standards for material/input/output cost and yield, effective applicability, persisted batch deviation evaluation and append-only review/override events. Evaluate against the standard snapshot applicable when production posts; locked BOM editing is not standards approval.
- Proposed API/UI fit: Menu/BOM standards panel shows authorized draft/review/approve flow; Production panel/batch history show red-flag reasons and review queue. Server checks approver authority and reason independently of button visibility; provider alert follows committed deviation event.
- Compatibility / rollout: Missing standard, zero output and tolerances have explicit client policy. Existing productions are not retroactively flagged using today's thresholds; edits affect future versions and preserve saved historical deviation results.
- Concrete proof scenario: At the exact approved upper bound no breach; smallest approved increment above it stores a flag. Later standards relaxation cannot erase prior flag/reviewer history, and unauthorized override fails.
- Business improvement: Cost/input/yield deviation actionable aur reviewable hogi; generic recipe lock ya low-stock badge ko production quality control nahi maana jayega.

### GAP-012 - Prepared-stock min/max and expiry-aware controls

Status: DONE for min/max threshold alerting (November 1, 2026) — expiry-aware tracking (expired/near-expiry prepared balances) explicitly DEFERRED to a future pass, per Owner decision confirmed via clarify: no lot/batch system exists for prepared (Semi-FG) stock yet, building one mirrors all of GAP-006's raw-material batch work and is a separate undertaking
Coverage: PARTIAL | Phase: P2 | Depends on: GAP-006, GAP-009
Source: S2 processed inventory within approved range; E05-E06, E09.

Acceptance: configure authorized min/max thresholds for prepared products per location, show low/high/expired/near-expiry balances separately, and include prepared-stock breaches in reports. Existing raw-only thresholds and daily count are not relabeled as prepared-stock coverage. Test null/unconfigured/equality and cross-location cases.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. This pass covers min/max threshold alerting only — expired/near-expiry balances deferred to a future gap.
2. Scope note (technical constraint, stated plainly rather than silently assumed): the Owner asked for this to stay scoped to Actual Cutting's continuation pattern, but `semiFgStock`'s balance is ONE shared bucket per branch+item fed by EITHER Fixed-Recipe or Actual Cutting production — the stock is fungible once produced and cannot literally be split "only Actual Cutting's share". The threshold mechanism therefore applies to the item's whole balance regardless of which mode produced it; the UI entry point for setting it lives in the Actual Cutting panel area of the Menu page, per the requested scope.

#### Implementation (November 1, 2026)

Schema (migration `0028_flashy_molten_man.sql`, additive only, 2 ALTER ADD COLUMN with safe defaults): `semiFgStock.minStockLevel`/`maxStockLevel` (numeric 12,3, default `'0'`) — same "0 means unconfigured" convention as `inventoryStock`'s own existing par-level columns (`src/db/schema/inventory.ts`); low breach is `qtyOnHand < minStockLevel` (strict — exact equality is NOT a breach), high breach is `qtyOnHand > maxStockLevel` (same rule), matching the existing raw-material convention exactly.

`src/lib/server/prepared-stock-thresholds.ts` (new): `setPreparedStockThresholds` (MENU_BOM-authorized, same module gate as raw-material par levels — not Owner-exclusive) upserts ONLY the threshold columns on the branch+item's `semiFgStock` row (creating a zero-qty row if production hasn't happened yet for that item, so the threshold is already in place when it does) — `qtyOnHand` itself is never touched here, staying exclusively production/consumption-derived. `evaluatePreparedBreach` classifies a row as `LOW`/`HIGH`/`OK`/`UNCONFIGURED`. `listPreparedStockStatus` (branch-scoped) and `countPreparedStockBreaches` (for the daily summary) reuse the same evaluator.

API: `POST /api/menu-items/[id]/thresholds` (set, MENU_BOM-authorized, branch-scoped so a branch-B actor cannot set thresholds on a branch-A item); `GET /api/menu-items/prepared-stock-status` (branch-scoped list with breach classification).

Reports: `src/lib/server/daily-summary.ts` now also counts prepared low/high breaches via `countPreparedStockBreaches` and passes them into `dailySummaryMessage` (`src/lib/server/whatsapp-triggers.ts`) as separate `preparedLowStockCount`/`preparedHighStockCount` fields with their OWN message lines — the EXISTING raw `lowStockCount` line's exact wording was deliberately left untouched (several existing tests assert its precise regex) so prepared counts are additive, never merged into or relabeling the existing raw-only count.

UI: `src/app/menu/prepared-stock-thresholds-panel.tsx` (new) — a MENU_BOM-authorized min/max setting form plus a live status list (qty, min, max, breach label) per Semi-FG item; wired into `src/app/menu/menu-workspace.tsx` alongside the Actual Cutting and Yield Standards panels. tsc/build clean; not separately re-verified via a live browser click-through this pass, same honest caveat already standing for the rest of this session's new panels.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 (one existing sandboxed unit-test harness, `tests/daily-summary-privacy.test.cjs`, needed its dependency allowlist extended with a stubbed `./prepared-stock-thresholds` — that harness tests sales-privacy isolation specifically, not prepared-stock behavior, so a full `semiFgStock` table model there would add unrelated complexity; the stub always returns zero counts, consistent with that test's existing stock-free scenarios); `npm run build` clean. New `tests/prepared-stock-thresholds.integration.cjs` — **9/9 passed** against a fresh disposable QA database migrated through all 29 migrations, covering every acceptance-criteria proof point: a cross-branch actor cannot set thresholds on another branch's item (400); before any threshold is set, status is explicitly `UNCONFIGURED` (never a fabricated default band); exact boundary equality at BOTH min and max is explicitly NOT a breach; the smallest amount below min / above max IS a breach; a branch-B status list never includes a branch-A item (cross-location isolation); `qtyOnHand` itself is proven untouched by the threshold-setting call. Backward-compat: the existing REAL end-to-end `tests/low-stock-summary.integration.cjs` (real cron HTTP + PostgreSQL, zero external sends) still passes unchanged, confirming the `daily-summary.ts` wiring didn't disturb the existing raw-material low-stock cron path; `tests/actual-cutting.integration.cjs` (17/17) and `tests/yield-standards.integration.cjs` (15/15) both re-run unchanged, confirming the shared `semiFgStock` schema change didn't disturb GAP-009/010/011.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migrations `0025`-`0028` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- Expired/near-expiry prepared-balance tracking (explicitly deferred — Owner decision; requires a new Semi-FG lot/batch system, a separate undertaking mirroring GAP-006's raw-material work).
- Distinguishing "usable" vs "committed/transit" prepared qty (depends on the same deferred lot system — not meaningful without it).

#### Current-project integration blueprint (fulfilled above for min/max; remaining items listed above)

- Current-project reuse: Existing raw threshold policy in `src/db/schema/inventory.ts`, prepared balances in `src/db/schema/production.ts`, and `src/lib/server/daily-summary.ts` low-stock counting patterns reuse karein.
- Proposed data/server change: PROPOSED: per-location prepared-product threshold configuration and shared expiry/quality-aware availability evaluator over ledger lots. Distinguish on-hand, usable, committed/transit and unconfigured min/max; preserve existing raw zero-means-unconfigured semantics unless client changes them.
- Proposed API/UI fit: Menu/Inventory settings allow authorized prepared min/max setup; Inventory/Production views show prepared low/high/expiry badges. Reporting/daily summary use the same evaluator and label raw/prepared counts separately; no independent editable alert totals.
- Compatibility / rollout: Additive config starts unconfigured; do not clone transaction balances or assume every branch's min/max is identical. Query aggregate/index strategy must cover prepared types without degrading existing raw summary recipients/privacy/idempotency.
- Concrete proof scenario: Prepared usable qty equals configured min -> no low breach; expired-only physical stock and a truly zero/unknown configured threshold produce different reasons. Another branch's threshold does not change this branch's flags.
- Business improvement: Kitchen over/under-production aur expiry visibility milegi; raw-only par levels ko prepared-stock coverage bolne ki zarurat nahi padegi.

### GAP-013 - Prepared Semi-FG transfer to branches

Status: DONE for core transfer flow (November 1, 2026) — real cost-carry (GAP-010's per-unit production cost) explicitly NOT ported across this transfer, per Owner decision; see below
Coverage: PARTIAL | Phase: P2 | Depends on: GAP-004, GAP-006, GAP-009, GAP-010
Source: S1 all branch fresh-meat stock in pcs; S2 mixed branch issues; E04-E05.

Acceptance: transfers support prepared item/lot, pcs quantity and saved cost as well as raw stock. Dispatch, in-transit, partial acceptance/rejection and return conserve stock/value across approved database/location boundaries; duplicate receipt cannot double-credit. Branch POS consumes transferred prepared stock without recutting/re-exploding raw input already consumed centrally.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. BRANCH-TO-BRANCH transfer (a "Base Kitchen" branch produces Semi-FG and dispatches to another branch) — a SEPARATE, new mechanism from the existing RAW CENTRAL-warehouse transfer (`src/app/api/stock-transfers/route.ts`), since Semi-FG stock has no warehouse concept at all (it lives directly on a branch via `semiFgStock`).
2. Cross-branch product identity is matched by EXACT NAME (no shared cross-branch catalog id exists on `menuItems` today, and none was added this pass) — zero or multiple name matches at the destination branch fails closed (409), never a guessed destination; output unit must also match exactly.
3. Full accept/partial-receipt/duplicate-receipt-safe flow, mirroring GAP-006's raw stock-transfers robustness.

#### Implementation (November 1, 2026)

Schema (migration `0029_fair_yellowjacket.sql`, additive only, 2 brand-new tables): `semiFgTransfers` (`src/db/schema/semi-fg-transfers.ts`) — `sourceMenuItemId`/`destMenuItemId` both frozen at dispatch time (a later catalog rename at either branch never retroactively changes an already-dispatched transfer's resolved destination); DB-level CHECK constraints enforce `fromBranchId <> toBranchId`, `qtyDispatched > 0`, and `0 <= qtyReceived <= qtyDispatched`. `semiFgTransferReceipts` — one row per transfer (UNIQUE), the idempotency anchor, same pattern as GAP-006's `batchTransferReceipts`.

`src/lib/server/semi-fg-transfers.ts`: `dispatchSemiFgTransfer` (MENU_BOM-authorized, branch-scoped to the actor's own branch unless Owner) resolves the destination item by exact name + exact output-unit match at the destination branch — 0 matches or >1 matches both fail closed (409) with an explicit, actionable message; debits the source branch's real `semiFgStock` balance (lock + insufficiency check) before inserting the transfer row. `receiveSemiFgTransfer` (branch-scoped to the destination branch) is idempotent on an exact-request replay (no second credit), rejects a replay with a different request (409), supports a genuine partial receipt (`qtyReceived < qtyDispatched`, reported as `variance`), and rejects `qtyReceived > qtyDispatched` outright (400) — credits the destination branch's `semiFgStock` balance (upsert, same capacity-check pattern as every other Semi-FG credit in this codebase).

API: `GET`/`POST /api/semi-fg-transfers` (list branch-scoped to either side of the transfer; dispatch); `POST /api/semi-fg-transfers/[id]/receive`.

UI: `src/app/menu/semi-fg-transfer-panel.tsx` (new) — a dispatch form (own Semi-FG item, destination branch, qty), an "incoming — awaiting receipt" queue with a per-row receive action (defaults to the full dispatched qty, editable for a genuine partial receipt), and a transfer history list; wired into `src/app/menu/menu-workspace.tsx`. tsc/build clean; not separately re-verified via a live browser click-through this pass, same honest caveat already standing for the rest of this session's new panels.

Cost-carry (explicitly NOT done this pass, Owner decision): GAP-010 itself already explicitly deferred "carrying cost forward into downstream consumption/transfer" as its own named future-scope item, and no running per-balance average cost exists on `semiFgStock` to snapshot honestly — GAP-010 costs a single PRODUCTION EVENT, not a pooled, possibly-multi-sourced branch balance. Inventing an average here would be a fabricated figure, not a real one, so only quantity moves this pass.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 unchanged; `npm run build` clean. New `tests/semi-fg-transfers.integration.cjs` — **13/13 passed** against a fresh disposable QA database migrated through all 30 migrations, covering every acceptance-criteria proof point: zero destination name-match fails closed (409); multiple destination name-matches fails closed (409); an output-unit mismatch (pcs vs kg) fails closed (409); a branch-B actor cannot dispatch claiming the kitchen branch as its own (403, cross-location isolation); a real dispatch correctly resolves and freezes the name-matched destination item, debiting the source balance by exactly the dispatched amount; a branch-C actor cannot receive a transfer addressed to branch B (403); a genuine partial receipt (15 of 20) reports the correct variance (5) and credits the destination with exactly the received amount; a duplicate receipt with the EXACT SAME request replays (200, `replayed:true`) with zero double-credit; a duplicate receipt with a DIFFERENT request is rejected (409); `qtyReceived` exceeding `qtyDispatched` is rejected (400). Backward-compat: `tests/actual-cutting.integration.cjs` (17/17), `tests/yield-standards.integration.cjs` (15/15) and `tests/prepared-stock-thresholds.integration.cjs` (9/9) all re-run unchanged on the same QA database, confirming the new tables/routes didn't disturb GAP-009/010/011/012.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migrations `0025`-`0029` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- Real per-unit cost carried across the transfer (explicitly deferred — Owner decision, and genuinely blocked on GAP-010's own already-named future-scope item of a running per-balance cost).
- "In-transit" as an explicit tracked state distinct from DISPATCHED (this pass treats DISPATCHED itself as the in-transit state — there's no separate intermediate status, which matches the acceptance's spirit but wasn't explicitly modeled as its own named state).
- Branch POS consumption of transferred prepared stock "without recutting/re-exploding raw input already consumed centrally" — this is naturally already true (POS consumes from the destination branch's real `semiFgStock` balance, which GAP-013's receive credits; nothing in this pass or any prior Semi-FG consumption path re-explodes a BOM for already-produced Semi-FG stock), but was not independently re-verified against an actual POS sale flow this pass.

#### Current-project integration blueprint (fulfilled above for the core flow; remaining items listed above)

- Current-project reuse: Existing `src/app/api/stock-transfers/route.ts`, `src/app/api/stock-transfers/[id]/receive/route.ts`, `src/app/warehouse/page-content.tsx` and `src/lib/server/production.ts` direct prepared-stock consumption reuse karein.
- Proposed data/server change: PROPOSED: typed RAW/PREPARED transfer lines with lot allocations, exact qty/unit, saved valuation and partial receipt/rejection events. Branch-cloned menu IDs differ: approved stable product mapping connects central output to the correct destination Semi-FG identity/version, not copied foreign branch IDs.
- Proposed API/UI fit: Warehouse dispatch/receive form supports mixed lines and partial acceptance; same server posting seam debits/transits/credits. Existing raw-only API contract stays compatible until pilot cutover; prepared receipt creates prepared availability, not raw stock or a fabricated new production.
- Compatibility / rollout: Do not consume centrally used raw material again when branch sells transferred prepared goods. Preserve no-raw-fallback semantics. Cross-concept transfers use the approved durable bridge and cannot be reported received until destination acknowledgment is committed.
- Concrete proof scenario: Dispatch prepared pieces, accept once in branch, sell using that prepared component: central raw remains unchanged by branch sale. Partial receipt plus duplicate callback preserves total quantity/value and leaves unresolved balance in transit.
- Business improvement: Base Kitchen -> branch ka real pcs supply chain complete hoga, aur raw ingredient ki double deduction/costing nahi hogi.

### GAP-014 - Internal requisition and mixed raw/Semi-FG fulfillment

Status: DONE for core requisition + fulfillment linkage (November 1, 2026)
Coverage: PARTIAL | Phase: P2 | Depends on: GAP-004, GAP-013
Source: S2 mixed issue against indent/internal PO; S3 branch indent to Base Kitchen; E01, E04.

Acceptance: branch requests identifiable raw and prepared products from Base Kitchen; approved fulfillment links each issue/transfer to requested, issued, received and outstanding quantities. Handle partial fulfillment/closure/cancellation with role controls. External procurement indents and internal supply are explicitly distinguished; no duplicate stock source or artificial vendor purchase is used to fake an internal transfer.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. Mixed RAW + PREPARED lines in one requisition (both types, Owner's own choice over a RAW-only narrower scope).
2. Owner-only approval (single-actor, same pattern as every other approval gate this session).
3. Fulfillment reuses the EXISTING raw stock-transfer (GAP-006) and Semi-FG transfer (GAP-013) dispatch/receive endpoints — this requisition schema never duplicates dispatch logic; it only tracks requested/approved/outstanding quantities and LINKS to the real transfer rows that actually moved stock.

#### Implementation (November 1, 2026)

Schema (migration `0030_yummy_northstar.sql`, additive only — 2 brand-new tables plus 1 nullable column added to EACH of the 2 existing transfer tables): `internalRequisitions` (header: branchId, status SUBMITTED/APPROVED/CLOSED, requestedById, approvedById) + `internalRequisitionLines` (lineType RAW xor PREPARED enforced by a DB CHECK, qtyRequested, qtyApproved — NULL until Owner decides, an explicit approved-0 is a genuine "rejected this line" distinct from NULL/unknown — status PENDING/APPROVED/REJECTED/CANCELLED). `stockTransfers.requisitionLineId` and `semiFgTransfers.requisitionLineId` (both nullable — an ad-hoc transfer with no requisition stays fully unlinked and backward compatible, verified below). `qtyIssued`/`qtyReceived` are intentionally NOT stored on the line — they are DERIVED by summing the real linked transfer rows at read time, never a second source of truth that could drift.

`src/lib/server/requisitions.ts`: `submitRequisition` validates every RAW material and every PREPARED Semi-FG item exists (a PREPARED line's item must belong to the REQUESTING branch itself — it is matched by name at fulfillment time, exactly GAP-013's own convention, not a cross-branch id). `approveRequisition` (Owner-only via `assertOwner`) takes one qtyApproved decision per line in a single atomic call (0 is an explicit rejection). `cancelRequisitionLine` writes off only the REMAINING outstanding — already-dispatched real stock is never touched, matching the acceptance's "cancellation is a remaining-request decision, not deletion of dispatched stock". `assertRequisitionLineFulfillable` is called from BOTH existing dispatch flows when a dispatch declares a `requisitionLineId` — validates the line is APPROVED, belongs to the dispatch's destination branch, and that this dispatch plus everything already issued against that line would not exceed the approved quantity (409 if it would).

API: `GET`/`POST /api/requisitions` (list, submit); `GET /api/requisitions/[id]`; `POST /api/requisitions/[id]/approve` (Owner-only); `POST /api/requisitions/lines/[id]/cancel`. The existing `POST /api/stock-transfers` and `POST /api/semi-fg-transfers` routes both gained an optional `requisitionLineId` body field (defaults to `null` — zero behavior change for every existing ad-hoc dispatch, verified below).

UI: `src/app/inventory/requisition-panel.tsx` (new) — a mixed RAW/PREPARED line-builder submit form, an Owner-only per-line approval form, and a cancel action per approved line; wired into `src/app/inventory/page-content.tsx`. This panel only tracks the request — fulfillment itself still happens through the normal warehouse/menu transfer dispatch forms (optionally supplying the requisitionLineId), exactly per the Owner's reuse decision. tsc/build clean; not separately re-verified via a live browser click-through this pass, same honest caveat already standing for the rest of this session's new panels.

Tests: `npx tsc --noEmit --incremental false` clean; `npm test` 491/491 unchanged; `npm run build` clean. New `tests/requisitions.integration.cjs` — **14/14 passed** against a fresh disposable QA database migrated through all 31 migrations, covering every acceptance-criteria proof point: a mixed RAW+PREPARED requisition submits correctly; a non-Owner cannot approve (403); the Owner approves different amounts per line (full RAW, partial PREPARED); a RAW dispatch linked to the approved line succeeds, a second dispatch that would exceed the approved total is rejected (409), and a dispatch for exactly the remaining approved amount succeeds — `qtyIssued` correctly derives to the exact sum (20.000) from the real linked transfers; a PREPARED dispatch within its approved amount succeeds, one that would exceed it is rejected (409); a different branch's actor can neither see this requisition in their list nor cancel its line (403, cross-location isolation); cancelling the remaining outstanding succeeds and a further dispatch against the now-CANCELLED line is rejected (409). Backward-compat: a direct ad-hoc `POST /api/stock-transfers` call with NO `requisitionLineId` (the existing, pre-GAP-014 behavior) still succeeds exactly as before; `tests/actual-cutting.integration.cjs` (17/17), `tests/yield-standards.integration.cjs` (15/15), `tests/prepared-stock-thresholds.integration.cjs` (9/9) and `tests/semi-fg-transfers.integration.cjs` (13/13) all re-run unchanged on the same QA database, confirming the new tables/columns didn't disturb GAP-009 through GAP-013.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has NOT had migrations `0025`-`0030` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- "Closure" as an explicit requisition-header state once every line resolves to a terminal status (FULFILLED/REJECTED/CANCELLED) was not separately modeled this pass — the header currently stays APPROVED even after every line is fully resolved; CLOSED exists in the schema's status enum but nothing transitions a requisition into it yet.
- External procurement (vendor indent/PO, `src/lib/server/purchase.ts`) is untouched by this pass and remains fully separate, as required — but no explicit UI/report cross-link exists yet to let an Owner see "this branch's internal requisitions" alongside "this branch's external purchase indents" in one view.

#### Current-project integration blueprint (fulfilled above for the core flow; remaining items listed above)

- Current-project reuse: Existing `src/lib/server/purchase.ts` indent validation/aggregation, `src/db/schema/purchase.ts` indent evidence and existing Warehouse transfer UI/services ko reuse karein, lekin external-procurement status semantics ko internal supply par force na karein.
- Proposed data/server change: PROPOSED: internal requisition header, RAW/PREPARED typed lines, approval/revision history and fulfillment allocation links to transfer lines. Track requested/approved/issued/received/outstanding quantities; cancellation is a remaining-request decision, not deletion of dispatched stock.
- Proposed API/UI fit: Purchase/Inventory me Internal Request tab or clearly separate request type; Base Kitchen/Warehouse issue queue converts approved lines to existing enhanced transfer flow. New requisition/action handlers are proposed; external vendor indent/PO remains separate and identifiable.
- Compatibility / rollout: Existing indentLines require rawMaterialId and may auto-approve from external GRN history. Do not reuse that schema unchanged for prepared requests or let it create vendor POs. Product mapping/unit/permissions and partial outstanding math are shared with GAP-013/016.
- Concrete proof scenario: One request raw + prepared, partially fulfilled twice: totals and outstanding remain exact. Cancel outstanding only after dispatch; repeated fulfillment cannot exceed approved amount or manufacture another vendor purchase.
- Business improvement: Branches ek traceable request se mixed stock mangwa sakengi; central kitchen supply aur external procurement confuse nahi honge.

### GAP-015 - Approved vendor onboarding and enforcement

Status: DONE for core onboarding + enforcement (November 1, 2026)
Coverage: PARTIAL | Phase: P3 | Depends on: GAP-001
Source: S2 approved listed vendors; E01.

Acceptance: draft/approved/suspended vendor policy, review authority and branch/category applicability are recorded and enforced on new purchasing; historical documents retain their vendor identity. Unauthorized vendor activation and concurrent approval bypass are denied. Vendor creation alone is not approval.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. Owner-only to approve or suspend a vendor (same single-actor authority pattern as every other approval gate this session).
2. Simple applicability: ONE approval scope per vendor — an optional single branch restriction (NULL = all branches) and an optional single category restriction (NULL = all categories), not a multi-row join.
3. One-time cutover: every vendor that already existed BEFORE this migration ran is backfilled to APPROVED (unrestricted) so existing purchasing was never silently halted. A vendor created from now on always starts DRAFT and needs an explicit Owner approval before it can be used on a new Purchase Order.

#### Implementation (November 1, 2026)

Schema (migration `0031_amused_beast.sql`, additive only): `vendors` gained `status` (DRAFT/APPROVED/SUSPENDED, default DRAFT), `approvedBranchId` (nullable FK), `approvedCategory` (nullable). The migration's own data UPDATE (hand-added after `drizzle-kit generate`, inside the same migration file — not a column default) backfills every PRE-EXISTING vendor row to APPROVED/unrestricted exactly once; verified directly (see Tests below) rather than assumed. New table `vendorReviewEvents` — append-only, one row per approve/suspend action with actor/reason/timestamp and a snapshot of the scope decided at that moment; never rewrites a past PO's own `vendorId`.

`src/lib/server/vendor-approval.ts`: `approveVendor`/`suspendVendor` (Owner-only via `assertOwner`) and `assertVendorEligible(tx, vendorId, branchId, categories)` — the ONLY place that decides eligibility, called from INSIDE the same locked `mutate()` transaction that creates a Purchase Order (`src/app/api/purchase/orders/route.ts`), never a separate pre-check a concurrent suspension could race past. Rejects (409) when the vendor is not APPROVED, when it's branch-restricted to a different branch, or when any of the PO's raw-material categories don't match a category restriction; a general purchase (no raw-material category) only checks the branch restriction. API: `POST /api/purchase/vendors/[id]/approve` and `/suspend`; `GET /api/purchase/vendors` extended with `status`/`approvedBranchId`/`approvedCategory`.

UI: `src/components/vendor-approval-panel.tsx` (new) — Owner-gated approve/suspend with branch/category scope inputs, wired into a new "Vendors" tab on `src/app/purchase/page-content.tsx`. The real enforcement lives server-side; this panel is a review convenience, never the gate itself.

Tests: `tsc`/`npm test` (491/491)/`npm run build` all clean. New `tests/vendor-approval.integration.cjs` — **14/14 passed** against a fresh disposable QA database (31 migrations), covering: a DRAFT vendor is rejected for a new PO (409); a non-Owner cannot approve (403); an Owner-approved unrestricted vendor succeeds; a branch-restricted vendor is rejected at a different branch and succeeds at its own; a category-restricted vendor succeeds on a matching raw-material PO (via a real submitted->approved indent) and is unaffected by the category check on an unrelated general purchase; a vendor suspended AFTER a PO was created keeps that PO's own `vendorId` untouched while a NEW PO against it is rejected. The one-time cutover itself was proven with a dedicated two-step migration test (not just read): migrated a disposable database through migration `0030` only, inserted a vendor row (simulating a genuinely pre-existing vendor, before the `status` column existed), then applied migration `0031` alone and confirmed that row became `APPROVED`/unrestricted — and a vendor inserted AFTER the full migration chain correctly starts `DRAFT`, confirming the UPDATE runs exactly once and never touches a later insert. Backward-compat: re-ran `purchase.integration.cjs` (50/50), `batches-fefo.integration.cjs`, `indent-spike.integration.cjs`, `multi-grn-receive.integration.cjs`, `purchase-phase1.integration.cjs` and `stock-ledger.integration.cjs` on disposable QA databases after updating their vendor-seeding fixtures to explicitly insert `status='APPROVED'` (these fixtures insert a vendor directly via SQL then immediately use it through the live PO-creation API within the same test run — under the new default they would otherwise start DRAFT and correctly be rejected; this is the expected new behavior, not a bug, so the fixtures were updated to reflect it) — all passed with no other regression. `purchase-ui.test.cjs` and `grn-quality-ui.test.cjs` (component-harness tests that stub every import of `purchase/page-content.tsx`) needed a new stub entry for `@/components/vendor-approval-panel`, added; both suites pass.

Separately discovered, NOT caused by this pass and NOT fixed in it (out of GAP-015's scope — flagged honestly rather than silently ignored): `tests/historical-purchase-lookup.integration.cjs` fails consistently, even on a completely fresh disposable QA database, with a vendor-return-claims assertion failure and a `stock_movements` FK violation during its own cleanup. That test seeds its Purchase Orders directly via raw SQL (never through the gated API), so this is unrelated to vendor-approval enforcement — a pre-existing issue in that test or the material-returns/stock_movements interaction it exercises, left for a future pass.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has not had migrations `0025`-`0031` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- Vendor CRUD (create/edit a vendor's own name/phone/email/TIN) is still out of this pass's scope, same as before — this pass only added the approval/suspend/scope layer on top of the existing (already-seeded-elsewhere) vendor rows.
- No UI click-through verification in a live browser yet — same honest caveat standing for every new panel this session.

#### Current-project integration blueprint (fulfilled above for the core flow; remaining items listed above)

- Current-project reuse: Existing `src/db/schema/vendors.ts` (`vendors`, `vendorRates`), `src/app/api/purchase/vendors/route.ts`, `src/app/api/purchase/_shared.ts` (`ensureVendor`) and `src/app/purchase/page-content.tsx` vendor selection reuse karein.
- Proposed data/server change: PROPOSED: draft/approved/suspended vendor status, review actor/time/reason/version, branch/category applicability and append-only review events. Server eligibility guard runs inside PO mutation transaction; vendor existence/dropdown presence is not approval authority.
- Proposed API/UI fit: Purchase vendor onboarding/review panel and proposed guarded review actions; filter eligible new-purchase dropdowns while keeping old documents readable. Approval role/grant is a client decision; PURCHASE_ORDER alone must not enable self-activation.
- Compatibility / rollout: Existing vendors lack review evidence: use approved reviewed cutover, neither blanket approval nor silently blocking historical reads. Suspended vendors retain old invoice/PO identity; rate-lock behavior remains independently controlled.
- Concrete proof scenario: Concurrent suspension/new PO cannot use stale eligibility. Vendor approved for another branch/category rejects here; historical PO still displays its vendor unchanged.
- Business improvement: Approved listed vendors ka control UI aur backend dono par enforce hoga, bina past purchasing history lose kiye.

### GAP-016 - Mandatory HO approval for branch external purchases

Status: DONE for general-purchase bypass closure + self/unauthorized-approval prevention (November 1, 2026)
Coverage: PARTIAL | Phase: P3 | Depends on: GAP-001, GAP-014, GAP-015
Source: S3 external PO pending HO approval; E01.

Acceptance: distinguish branch external requests from internal kitchen requisitions/general purchases and enforce the client-approved HO gate before purchase/receipt. Existing low-spike indent auto-approval must not bypass a mandatory HO policy. Record approver/rejection/revision and prevent self/unauthorized approval according to policy, including direct-PO bypass and retry tests.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. This pass's priority: close the general-purchase bypass (a user could flag `isGeneralPurchase=true` and skip the Owner's value-threshold policy entirely) AND fix self/unauthorized approval (any `PURCHASE_INDENT`-grant branch actor — including the one who raised the request — could approve their own PENDING_APPROVAL indent).
2. HO approval for a threshold-triggered item (indent or general purchase) is Owner-only — same single-actor authority as every other mandatory approval this session.
3. General purchases get their own lightweight pending-approval record (not a reuse of the indents table, which has no concept for free-text general-purchase lines).

#### Implementation (November 1, 2026)

**Self/unauthorized-approval prevention (indents):** `src/app/api/purchase/indents/[id]/approve/route.ts` and `/reject/route.ts` changed from `assertModule(actor, "PURCHASE_INDENT")` to `assertOwner(actor)`. Safe because a `PENDING_APPROVAL` indent only exists by construction when the Owner's own mandatory gate (spike or value threshold, `submit/route.ts`) forced it there — the free, no-review path already auto-approves every below-threshold indent, so nothing that used to auto-approve now needs an extra click. UI (`purchase/page-content.tsx`): the Approve/Reject buttons are now Owner-gated client-side too (cosmetic only — the real gate is server-side).

**General-purchase bypass closure:** new table `generalPurchaseRequests` (migration `0032_classy_taskmaster.sql`, additive) + `src/lib/server/general-purchase-approval.ts`. `POST /api/purchase/general-purchase-requests` computes the stated value (qty × rate, both supplied by the requester — no vendor-rate lookup needed, unlike an indent) against the SAME Owner-configured `indentValueThresholdTsh`; below threshold (or none configured) auto-APPROVEs immediately — zero added friction, matching the indent free path; at/above threshold creates a `PENDING_APPROVAL` row. `POST /api/purchase/orders` (general-purchase path) now ALSO runs this same threshold check on its own lines and, when gated, REQUIRES a `generalPurchaseRequestId` referencing an APPROVED, not-yet-consumed request whose branch/vendor/lines/value match EXACTLY (no bait-and-switch after approval) — consumes it (status -> `CONSUMED`) on success so one approval can never authorize a second purchase. `POST .../[id]/approve` and `/reject` are Owner-only (`assertOwner`). Money math is exact bigint arithmetic (qty scale-3 × rate scale-2, rounded once at the end), never floating point.

UI: `src/components/general-purchase-approvals-panel.tsx` (new) — a branch submits lines for review here first; an Owner approves/rejects; the real Purchase Order is still created on the existing "Purchase Orders" tab, now also needing this request's id once APPROVED. Wired into a new "HO Approvals" tab on `purchase/page-content.tsx`. This pass did NOT deep-integrate the request-id field into the existing PO-creation dialog's UI (it would need to compute the value client-side and show a pending/approved state inline) — the server enforces regardless; a general purchase at/above threshold without the id simply gets a clear 409 today. Left as a follow-up UI-polish item, not a correctness gap.

Tests: `tsc`/`npm test` (491/491)/`npm run build` all clean. New `tests/mandatory-ho-approval.integration.cjs` — **14/14 passed**, covering: a below-threshold general purchase still succeeds directly (zero friction preserved); an at/above-threshold general purchase with no request is rejected (closing the bypass); submitting it for review creates a `PENDING_APPROVAL` record; the SAME branch actor who submitted it cannot approve it (self-approval prevention, 403); the PO still cannot be created while pending; the Owner approves it; the matching PO can then be created; the SAME approved request cannot authorize a SECOND PO (one-time consumption, 409); a request whose lines/value no longer match the PO being created is rejected (409, no bait-and-switch); and separately, a non-Owner cannot approve a PENDING_APPROVAL indent (403) while the Owner can (200). Backward-compat: re-ran `tests/business-policy.integration.cjs` (14/14, unaffected — it never touches general purchases or indent-approve) and 4 pre-existing tests that call indent approve/reject with a non-Owner branch-manager cookie (`purchase.integration.cjs` 50/50, `indent-spike.integration.cjs` 10/10, `multi-grn-receive.integration.cjs` 11/11, `stock-ledger.integration.cjs`) after updating those approve/reject call sites to use an Owner session (their correct new behavior, not a regression — `batches-fefo.integration.cjs`'s existing "manager" fixture was already SUPER_ADMIN, so it needed no change). `purchase-ui.test.cjs`/`grn-quality-ui.test.cjs` harnesses gained stubs for the new `general-purchase-approvals-panel` import and a `useSelectedBranchId` mock.

Separately discovered, NOT caused by this pass and NOT fixed in it (flagged honestly, out of GAP-016's scope): while fixing `indent-spike.integration.cjs`'s cleanup-ordering (added missing `stock_batches`/`stock_movements` deletes before the `raw_materials` delete — a real bug, now fixed), running `stock-ledger.integration.cjs` surfaced a separate pre-existing issue: its Semi-FG production step now fails with "Insufficient NON-EXPIRED verified batch stock" — the GRN-PASS credit in that test's fixture isn't creating a matching `stock_batches` row the way GAP-006's FEFO consumption gate expects. Unrelated to vendor/HO approval; left for a future pass.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has not had migrations `0025`-`0032` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- Category-based mandatory-HO trigger (only a TSh value threshold and a quantity-spike check exist; no category-based trigger).
- HO approval-workflow enforcement at receiving time is still NOT separately checked (only at indent-submit / general-purchase-submit / PO-creation time) — if an indent's or request's terms could somehow change after approval but before receipt, that path isn't independently re-validated this pass (PO creation itself is still gated, which is the main bypass this pass closed).
- The general-purchase-request flow is not yet deep-integrated into the existing PO-creation dialog's UI (see note above) — functional via the new "HO Approvals" tab, but not a single seamless flow yet.
- No UI click-through verification in a live browser yet — same honest caveat standing for every new panel this session.

#### Current-project integration blueprint (fulfilled above for the core flow; remaining items listed above)

- Current-project reuse: Existing `src/app/api/purchase/indents/[id]/submit/route.ts`, `src/app/api/purchase/indents/[id]/approve/route.ts`, `src/app/api/purchase/orders/route.ts`, `src/app/api/purchase/orders/[id]/receive/route.ts` and `src/lib/server/purchase.ts` spike evaluation reuse karein.
- Proposed data/server change: PROPOSED: explicit procurement purpose, versioned HO approval tied to approved branch/vendor/lines/amount or approved bounds. Same policy guard runs at submission, approval, PO creation and receiving; changed terms invalidate prior approval. Spike calculation is advisory when HO approval is mandatory.
- Proposed API/UI fit: Existing Purchase approval queue clearly separates external HO review from internal requisitions and direct general purchases; add proposed review action for the current direct-general-PO path. Do not broadly relax branchScope to simulate HO: define and test exact reviewer authority.
- Compatibility / rollout: Current low-spike indent can auto-approve and general purchases can bypass raw-material indent. Preserve historical APPROVED evidence as legacy, not retroactive HO signoff. New mandatory policy takes effect at an explicit cutoff and prevents stale/revised-terms bypass.
- Concrete proof scenario: Below-threshold external indent remains pending under mandatory HO policy; self-review/direct general purchase/receive-before-approval attempts fail. Retry creates one review, and editing approved terms requires new review.
- Business improvement: Client ka branch -> HO approval rule process ke har entry point par consistent rahega, sirf WhatsApp ping ya approval button tak limited nahi.

Partial implementation note (October 31, 2026, NOT a DONE closure — remains PENDING): per the P0 decision record (section 6, GAP-001), the Owner wanted BOTH a mixed amount/category HO-approval trigger AND the exact numbers to be Owner-configurable at runtime rather than fixed in code. A first real slice of this is implemented: `src/lib/server/business-policy.ts` (Owner-configurable `INDENT_HO_APPROVAL_VALUE_THRESHOLD_TSH`, reusing the existing generic `settings` key/value table — no migration needed), `src/app/api/admin/settings/business-policy/route.ts` (Owner-only GET/POST), `/admin/settings/business-policy` UI page, and `src/lib/server/purchase.ts`'s `estimateIndentValueTsh`/`appliesValueThresholdGate` wired into `src/app/api/purchase/indents/[id]/submit/route.ts` — an indent whose estimated value (latest locked vendor rate × qty) is at/above the Owner's configured TSh threshold, or whose value cannot be fully priced (missing vendor rate), now ALSO forces `PENDING_APPROVAL`, independent of the existing quantity-spike check (either can force approval, neither can override the other into auto-approving). Verified: `npm test` 471/471 (was 463; +8 new tests for `appliesValueThresholdGate` and `saveBusinessPolicy` validation), `tsc --noEmit` clean, `next build` clean (new routes compiled), and a real HTTP+PostgreSQL integration run on a disposable QA DB/app (`tests/business-policy.integration.cjs`) — 14/14 passed, including Owner-only read/write enforcement, exact threshold boundary (at/above triggers, strictly below does not), the unpriced-material fail-closed case, clearing the threshold back to disabled, and server-side (not just client-side) validation rejection. QA app/dist/database were torn down after; `tsconfig.json`/`next-env.d.ts` restored to default. NOT done: the category-based trigger, HO approval-workflow enforcement at PO-creation/receiving time (only at indent-submit time so far), general-purchase bypass, self/unauthorized-approval prevention and the branch-external-vs-internal-requisition distinction this GAP's full acceptance criteria requires — this is one slice, not the whole gap. `COST_YIELD_VARIANCE_TOLERANCE_PERCENT` (GAP-010/GAP-011's future override threshold) is also stored via the same settings page now but explicitly NOT YET enforced anywhere, since GAP-009/GAP-010's actual yield/cost tracking doesn't exist yet. No commit/push/production change — local uncommitted only.

### GAP-017 - Auditable vendor payment records and allocations

Status: DONE for full-payment evidence (November 1, 2026)
Coverage: PARTIAL | Phase: P3 | Depends on: GAP-001, GAP-005
Source: S1 Payment; E03.

Acceptance: agreed payment record captures amount/date/method/reference/actor and allocation to matched invoices, reconciles paid/outstanding/overpayment and prevents duplicate allocation. Implement partial payments only if approved in GAP-001; otherwise enforce/document the approved full-payment rule. Preserve current match/approval gates and distinguish payment evidence from actual bank execution. Bank integration is NOT presumed by the screenshot.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. Full-payment-only this pass — GAP-001 explicitly left partial payments unresolved/un-approved ("partial payment ... ko assumptions se enable na karein"); this pass enforces the documented full-payment default instead of building partial allocation.
2. Payment method is a fixed enum (CASH/BANK_TRANSFER/CHEQUE/MOBILE_MONEY — Tanzania convention, not India's UPI), reference number is optional free text.

#### Implementation (November 1, 2026)

New `vendorPayments` table (migration `0033_short_cable.sql`, additive) — real evidence (`amountTsh`, `paymentMethod`, `referenceNumber`, `paidAt` the actual bank/cash execution date, `recordedById` the actor, `idempotencyKey` unique) replacing the old bare `markThreeWayPaid` status flip. `src/lib/server/vendor-payments.ts`'s `recordVendorPayment` preserves the existing APPROVED-only gate (payment still cannot bypass the quality/3-way-mismatch lock) and enforces: the amount must exactly equal `invoiceAdjustedTotalInr` (full-payment-only — any other amount is a 400, explicitly explaining partial payments aren't approved yet); at most one payment record per match EVER (a second, differently-keyed attempt against an already-paid match is a 409 duplicate-allocation rejection); and idempotent replay — the SAME `idempotencyKey` with the SAME payload returns the existing row (checked BEFORE the APPROVED-status gate, since the first successful call already flips the match to PAID — a genuine replay of an already-paid match must still succeed), while the SAME key with a DIFFERENT payload is rejected (never silently overwrites real evidence). The schema itself does NOT enforce "exactly one row per match" at the DB level (no unique constraint on `matchId`) — deliberately, so a future, separately-approved partial-payment pass never needs a breaking schema rewrite; the full-payment rule lives in the server, not baked into the table shape. `threeWayMatch.paymentStatus/paidById/paidAt` are kept and still updated for backward-compatible reads.

`POST /api/purchase/orders/[id]/three-way/paid` now requires `{ amountTsh, paymentMethod, referenceNumber?, paidAt, idempotencyKey }` instead of an empty body. UI (`purchase/page-content.tsx`'s InvoiceStep): a small payment-evidence form (method dropdown, optional reference, paid-date) appears once the match is APPROVED; "Mark paid" now submits that evidence, pre-filling the amount from `invoiceAdjustedTotalInr` (not an editable field — the full-payment-only rule is visible in the UI, not just enforced silently server-side).

Tests: `tsc`/`npm test` (491/491)/`npm run build` all clean. New `tests/vendor-payments.integration.cjs` — **9/9 passed** through a REAL end-to-end flow (Indent→submit→approve→PO→receive→quality PASS→invoice→3-way approve→payment), covering: payment rejected before APPROVED (409); a partial-amount payment rejected (400, full-payment-only); the full-amount payment succeeds with real evidence persisted exactly in the DB (actor, amount, method, reference); the same idempotency key + same payload replays (200, `replayed:true`, confirmed still exactly one DB row); the same key + a different payload is rejected (409, never overwrites real evidence); a different key against an already-paid match is rejected (409, duplicate-allocation prevention). Backward-compat: re-ran `tests/purchase-phase1.integration.cjs` (27/27) after updating its one `/three-way/paid` call site to the new required fields (its correct new behavior, not a regression) and fixing a genuine pre-existing cleanup-ordering bug exposed along the way (missing `three_way_match_grns`/`stock_batches`/`stock_movements` deletes before their parent rows, from GAP-005's/GAP-006's later schema additions — unrelated to GAP-017 itself, now fixed).
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has not had migrations `0025`-`0033` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- Partial payments / multiple-receipt allocation remain explicitly out of scope (GAP-001 never approved them) — the schema is forward-compatible (no unique constraint forcing exactly one row per match) but the server enforces full-payment-only today.
- Overpayment handling is implicitly impossible under the full-payment-only rule (amount must EXACTLY equal the outstanding total) rather than a separately-modeled "overpayment credit" concept — acceptable for this pass's documented full-payment default, but would need its own design if partial/overpayment is ever approved.
- No UI click-through verification in a live browser yet — same honest caveat standing for every new panel this session.

#### Current-project integration blueprint (fulfilled above for the core flow; remaining items listed above)

- Current-project reuse: Existing `src/lib/server/vendor-invoices.ts` (`createVendorInvoice`, `approveThreeWayPayment`, `markThreeWayPaid`), `src/db/schema/purchase.ts` (`vendorInvoices`, `threeWayMatch`) and `src/lib/server/accounts-ledger.ts` journal foundations reuse karein.
- Proposed data/server change: PROPOSED: immutable payment-evidence header and invoice allocations with exact amount/date/method/reference/actor/vendor/branch and idempotency key. Extend paid action transactionally behind existing matched/approved gate. Outstanding derives from accepted invoice liability and approved allocations/credits, not an editable total.
- Proposed API/UI fit: Purchase InvoiceStep/Accounts view shows payment entry/history/evidence and reconciled outstanding. Proposed payment handlers are not bank APIs. Keep full settlement as approved default; partial/multiple payments or journal account mapping require explicit policy before enabling.
- Compatibility / rollout: Old PAID status has no detailed payment reference/date evidence; label legacy unknown rather than fabricate receipts or rewrite match totals. If GAP-005 enables multiple receipts, use its approved invoice/match allocation contract; payment still cannot bypass quality/mismatch lock.
- Concrete proof scenario: Concurrent full settlement requests result in one allocation; unapproved/mismatched invoice, cross-branch vendor, excessive amount and changed payload under same key reject. No bank transfer is executed or implied.
- Business improvement: Manual 'paid' state ke saath real payment evidence/outstanding traceable hoga; recorded payment aur actually executed bank transaction ka boundary clear rahega.

### GAP-018 - Physical purchase-return lifecycle

Status: DONE for the EXISTING FAIL/PARTIAL-quality claim type (November 1, 2026)
Coverage: PARTIAL | Phase: P3 | Depends on: GAP-004, GAP-005, GAP-015
Source: S1 Purchase Returns; E03.

Acceptance: rejected or otherwise authorized returned stock is identified/quarantined, dispatched with quantity/reason/evidence, acknowledged by vendor and linked to expected refund/credit/settlement. Specify whether failed goods ever entered usable stock and avoid double-deduction. Test partial return, duplicate dispatch/settlement, approved cancellation and authorization; existing expected-claim rows alone are not proof of physical return.

#### Owner decisions (confirmed via clarify, November 1, 2026)

1. Scope is the EXISTING FAIL/PARTIAL-quality claim type only (rejected-at-receiving stock, which never entered usable inventory in the first place — see `grnLines.qtyFailed`'s own design note). A return of ALREADY-ACCEPTED/good stock is explicitly out of scope this pass — it would need its own new claim type/design.
2. Dispatch is recorded by the PURCHASE_ORDER grant (same actor who registers the claim); cancellation of the remaining undispatched quantity is Owner-only.
3. A reason note is required on every dispatch; an evidence photo is optional free-text URL (same convention as `grns.qualityPhotoUrl`).

#### Implementation (November 1, 2026)

New `materialReturnDispatches` table (migration `0034_even_jack_power.sql`, additive) layered on top of the EXISTING `materialReturns` money-claim row — this pass never touches `materialReturns`' settlement fields. `src/lib/server/vendor-return-dispatch.ts`: `recordReturnDispatch` (partial dispatch across several trips allowed; `sum(qtyDispatched)` can never exceed `materialReturns.qtyReturned`, enforced with exact bigint math), `acknowledgeReturnDispatch` (once-only, PURCHASE_ORDER grant — staff attesting a real signed slip/confirmation from the vendor, since the vendor is never a system user), `cancelRemainingReturnDispatch` (Owner-only, once-only; new `materialReturns.remainingCancelledAt/ById/Note` columns record the cancellation of the REMAINING undispatched quantity and NEVER touch an already-created dispatch row; rejected with 409 if the claim is already fully dispatched — nothing left to cancel).

"Avoid double-deduction" is satisfied by construction, not by new code: a failed GRN line's qty was NEVER posted to `inventoryStock` in the first place, so there is no usable-stock quantity for this claim type to deduct a second time — dispatch here is purely evidentiary (quarantine -> physically sent back), never a stock-ledger write.

New routes: `POST/GET /api/purchase/material-returns/[id]/dispatches`, `POST /api/purchase/material-return-dispatches/[id]/acknowledge`, `POST /api/purchase/material-returns/[id]/cancel-remaining`. UI: new `src/components/vendor-return-dispatch-panel.tsx`, rendered alongside the existing `VendorReturnsPanel` on Purchase's "Vendor Returns" tab — per-claim dispatch form (qty/reason/evidence URL), per-dispatch acknowledgment button, Owner-only "Cancel remaining" button, remaining-undispatched-quantity readout.

Tests: `tsc`/`npm test` (491/491)/`npm run build` all clean. New `tests/vendor-return-dispatch.integration.cjs` — **15/15 passed** through a real end-to-end flow (Indent→PO→GRN→quality PARTIAL→claim registered→dispatch), covering: over-dispatch rejected (409); two partial dispatches summing exactly to the claimed quantity both succeed; a third dispatch once fully dispatched is rejected (409); vendor acknowledgment succeeds once, a second acknowledgment on the same dispatch is rejected (409, once-only); cancel-remaining on a fully-dispatched claim is rejected (409, nothing left); a non-Owner cannot cancel-remaining (403); the Owner cancels the remaining quantity on a partially-dispatched claim (200) and the already-dispatched row is proven untouched by a real-DB read; a further dispatch after cancellation is rejected (409); cancelling an already-cancelled claim is rejected (409, once-only). Backward-compat: re-ran `tests/purchase-phase1.integration.cjs` (27/27, unchanged) to confirm the existing claim-registration/settlement flow is untouched.
Release: N/A — local, uncommitted source only; ask before committing/deploying. `restaurant_erp_local` has not had migrations `0025`-`0034` applied (only disposable QA databases were used this pass); production Neon is untouched.

#### Remaining work before this GAP can be marked fully DONE (all scopes)

- A return of ALREADY-ACCEPTED/good stock (not a quality-rejection claim) is explicitly out of scope — would need its own new claim type and, unlike this pass, a real stock-ledger deduction (the acceptance's "avoid double-deduction" language anticipates that future case; this pass's claim type has nothing to deduct).
- No UI click-through verification in a live browser yet — same honest caveat standing for every new panel this session.

#### Current-project integration blueprint (fulfilled above for the core flow; the out-of-scope item above remains)

- Current-project reuse: Existing `src/lib/server/grn-quality.ts` (`recordGrnQuality`), `src/lib/server/vendor-returns.ts` (`recordVendorReturns`, `settleVendorReturn`), `src/db/schema/purchase.ts` (`materialReturns`) and `src/components/vendor-returns-panel.tsx` reuse karein.
- Proposed data/server change: PROPOSED: return header/lines plus append-only quarantine/dispatch/vendor-ack/cancel events linked to original GRN line, claim and real stock provenance. Approved accepted-stock returns get a ledger deduction; failed goods never credited to usable stock are not deducted from usable stock again.
- Proposed API/UI fit: Purchase return panel gains physical outstanding/dispatch/ack evidence; Accounts retains separately authorized expected-credit/refund settlement view. Proposed state-transition handlers enforce remaining returnable quantity and reference actual movement/claim identities.
- Compatibility / rollout: Legacy claim is not proof of dispatch or vendor acknowledgment. Keep physical goods status and money settlement distinct; do not let cancellation undo already dispatched stock or allow a descriptive general purchase to mutate unrelated raw inventory.
- Concrete proof scenario: Partially dispatch rejected stock, retry and cancel undispatched remainder: no usable-stock deduction. Accepted-stock return deducts once; duplicate acknowledgment/settlement cannot refund or remove stock again.
- Business improvement: Expected claim se actual returned goods aur received credit/refund tak connected audit trail milega.

### GAP-019 - Numbered debit notes and vendor credit reconciliation

Status: PENDING
Coverage: MISSING | Phase: P3 | Depends on: GAP-005, GAP-017, GAP-018
Source: S1 Debit Note; E03.

Acceptance: authorized numbered debit-note document links invoice/return/reason/amount and approved tax treatment, records review/cancellation and reconciles vendor credit/refund/payment allocation without double-counting. Confirm the client's document/legal/accounting rules rather than inferring them from a settlement note. Existing manual claim settlement remains distinct.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing vendor invoice/claim/match models in `src/db/schema/purchase.ts`, `src/lib/server/vendor-returns.ts`, `src/lib/server/accounts-ledger.ts` and private-document helpers in `src/lib/server/purchase-documents.ts` reuse karein.
- Proposed data/server change: PROPOSED: scoped numbered debit-note headers/lines, immutable issued value/tax snapshots, review/cancellation events and vendor credit/refund allocations referencing original invoice/return. Document issuance and financial realization are distinct, with one claim-value consumption rule.
- Proposed API/UI fit: Purchase/Accounts me Create/Review/Issue/View Debit Note actions and reconciliation history; numbering reserved transactionally. Reuse private evidence validation/protected signed view patterns, not arbitrary public document URLs. Tax/account mappings await client approval.
- Compatibility / rollout: Do not count same claim three times as manual settlement, debit-note credit and invoice payment reduction. Preserve issued identity even on cancellation; historical manual settlement does not automatically become a valid debit-note document.
- Concrete proof scenario: Concurrent issue requests never reuse number or overconsume claim value. Applying the same vendor credit via both settlement and invoice allocation rejects; canceled document keeps its number and audit trail.
- Business improvement: Client ka formal Debit Note document aur vendor-credit reconciliation complete hoga, bina existing claim amount ko double-count kiye.

### GAP-020 - Full end-of-day stock and reorder-status reporting

Status: PENDING
Coverage: PARTIAL | Phase: P3 | Depends on: GAP-007, GAP-012, GAP-014, GAP-008
Source: S2 raw/standard/processed end-of-day reports; E06, E09.

Acceptance: reproducible business-day/location report shows opening, receipt/production, issues/sales, adjustments, closing, low/high/prepared stock and expiry exceptions with reorder status. Add the approved schedule/delivery/export path and authorized HO visibility; preserve historical cutoffs and retry-safe runs. Current simple daily low-stock count does not satisfy the full report.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/lib/server/daily-summary.ts` (`runDailySummary`), `src/app/api/cron/daily-summary/route.ts`, `src/lib/reports.ts` (`REPORT_DEFS`, `reportReadModule`), `src/app/api/reports/_data.ts` and `src/app/reports/[report]/report-content.tsx` reuse karein.
- Proposed data/server change: PROPOSED: ledger-cutoff EOD report service and durable report-run/version/delivery-attempt references. Reconstruct opening/movements/closing with late/backdated corrections explicitly versioned; prepared/expiry/reorder details consume shared policy calculators, not duplicated sums.
- Proposed API/UI fit: Register stock-close report in existing Reports/CSV UI and approved HO read scope. Extend existing scheduled-summary machinery only with approved local cutoff/schedule and dedicated run identity; attach/link detailed report rather than calling a simple live low-stock count a full EOD report.
- Compatibility / rollout: Existing summary claims a run before best-effort send; that is not historical stock reconstruction or guaranteed delivery. A report run and each destination's delivery status must be distinct. No real production cron/send used during disposable acceptance.
- Concrete proof scenario: Reopen/rerun a closed-day report after next-day stock movement: recorded cutoff result remains reproducible; authorized late correction creates a labeled new version. Retrying delivery does not create duplicate stock close/report runs.
- Business improvement: HO ko usable historical stock-close/reorder evidence milega, sirf current low-stock number ka message nahi.

### GAP-021 - Min/max reorder suggestions and approved requisition creation

Status: PENDING
Coverage: PARTIAL | Phase: P3 | Depends on: GAP-012, GAP-014, GAP-015, GAP-016
Source: S3 reorder based on min/max; S2 reorder status; E06, E09.

Acceptance: suggestions use agreed units, usable stock, pending receipts/transfers, max target and approved rounding; route to internal requisition or external procurement as appropriate. Triggering again does not create duplicate indents. Keep human/HO approval unless client explicitly authorizes automation; no automatic bank payment or PO placement is inferred.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing threshold conventions in `src/db/schema/inventory.ts`, prepared stock in `src/db/schema/production.ts`, procurement helpers in `src/lib/server/purchase.ts` and enhanced internal requisition/transfer contracts reuse karein.
- Proposed data/server change: PROPOSED: exact inventory-position calculator using usable stock, reservations/commitments, approved inbound supply and max target; distinguish inbound transit from the same approved fulfillment to avoid counting supply twice. Suggestion-to-request unique identity records reviewed conversion and resulting internal/external request.
- Proposed API/UI fit: Inventory/Reports 'Reorder Suggestions' preview lets authorized user review quantity/source and convert to GAP-014 internal request or external indent with GAP-015/016 gates. Proposed preview/create handlers keep approval mandatory unless explicit automation approval exists.
- Compatibility / rollout: Unconfigured thresholds or invalid unit conversion return reasons, not arbitrary order quantities. Recompute at conversion under lock/version guard; repeated cron/preview cannot create another pending request for the same suggestion/supply position.
- Concrete proof scenario: Existing approved inbound supply reduces need once even when it is also in transit; repeated conversion returns the original request. Changed availability forces refreshed suggestion, not an outdated over-order.
- Business improvement: Min/max badges se actionable reviewed replenishment hoga, bina duplicate indents aur unnecessary overstock ke.

### GAP-022 - HO acknowledgment of branch receipt and stock close

Status: PENDING
Coverage: PARTIAL | Phase: P3 | Depends on: GAP-005, GAP-007, GAP-014, GAP-020
Source: S3 confirm GRN/report to HO; E02, E06.

Acceptance: authorized HO users receive a review queue/report for branch receipt/quality/shortage and stock-close submissions, can acknowledge/escalate with actor/date, and see unresolved exceptions. Cross-branch access is intentional and audited. A branch-visible GRN record or a best-effort message alone is not HO acknowledgment.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/lib/server/grn-quality.ts` (`readGrns`), inventory variance/report reads and `src/lib/server/permissions.ts` (`branchScope`, `assertModule`) reuse karein.
- Proposed data/server change: PROPOSED: versioned review subject for GRN/shortage/stock-close and append-only acknowledgment/escalation with actor/time/reason and unique subject-revision identity. New revisions/exceptions are independently unresolved, not hidden by an old acknowledgment.
- Proposed API/UI fit: Purchase/Inventory/Reports me scoped HO Review queue with acknowledge/escalate actions and outstanding exception filters. Define specific HO reviewer role/grants; current branchScope cross-branch access is Owner-only, so granting a normal module must not silently create global authority.
- Compatibility / rollout: Notification can point to a review subject after commit but cannot count as receiver acknowledgment. Existing branch records remain visible as before; new HO actions respect approved concept/database ownership and auditable bridge if needed.
- Concrete proof scenario: Same receipt revision acknowledged twice -> one event. Later shortage correction appears pending again; another branch's manager cannot acknowledge by replacing the subject ID.
- Business improvement: 'Report to HO' ka actual received/reviewed/escalated status milega, sirf message-sent assumption nahi.

### GAP-023 - Distinct Fast Food and Conventional operating workflows

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-001, GAP-003
Source: S1 billing Scenarios 1 and 2; E07, E10.

Acceptance: approved concept config enforces payment-first Fast Food vs kitchen-first Conventional sequence, relevant role/table/counter screens and approved database boundary. Preserve existing historical completed orders. Tests prove both sequences cannot skip required gates and that shared code does not silently collapse their distinct behavior.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/app/api/pos/orders/route.ts` POST, `src/app/pos/page-content.tsx` (`ScopedPos`, `submitOrder`), `src/lib/server/shifts.ts` (`requireOperableShift`) and current auth/branch guards reuse karein.
- Proposed data/server change: PROPOSED: versioned concept workflow config plus additive lifecycle order/line tables and one transaction-executor-based transition service. Initially retain legacy posOrders as completed-sale projection; do not casually widen COMPLETED/VOIDED enum consumed by current reports/shifts.
- Proposed API/UI fit: Same POS screen renders approved payment-first Fast Food vs kitchen-first Conventional actions. Proposed `/api/pos/open-orders` lifecycle transport is a new design, not existing route. Shared domain validation/pricing/stock services replace duplicated POS logic.
- Compatibility / rollout: Physical DB policy follows GAP-002/003, not a client-selectable workflow switch. Keep current paid-order POST for legacy/disabled branches, but once a pilot enables new rules every direct endpoint must enforce them so legacy route cannot bypass payment/KOT gates.
- Concrete proof scenario: Unpaid Fast Food order cannot fire kitchen action; Conventional can follow approved kitchen-first sequence but cannot close without required steps. Existing completed legacy order creation/reporting stays correct.
- Business improvement: Dono client concepts apna workflow follow karenge, bina two copied POS apps ya conflicting billing code banaye.

### GAP-024 - Open-order, table and KOT lifecycle

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-013, GAP-023
Source: S1 KOT sequence; S2 pre-order/table and preparation; E07.

Acceptance: approved draft/open -> sent-to-kitchen -> ready/served -> invoiced/closed transitions persist with table/order references and KOT history. Add/edit/resend/cancel behavior is explicit; stock reservation/deduction and release occur at defined events exactly once, including concurrent cashier/kitchen operations. Printing/reprinting a KOT must not deduct stock again. Do not invent table reservations if the client only requires table assignment.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing POS table/counter validation and KOT construction in `src/app/api/pos/orders/route.ts`, `src/lib/server/production.ts` (`lockRecipeStock`, `readStockRecipe`, `deductStock`), `src/lib/server/production-quantity.ts` and cart helpers in `src/app/pos/page-content.tsx` reuse karein.
- Proposed data/server change: PROPOSED: optimistic lifecycle version, append-only transition/KOT revisions, recipe/price/stock snapshot references and unique posting links. Define one approved reserve/consume event; stock consumption and financial recognition may happen at different events, but cost/quantity provenance must link rather than post twice.
- Proposed API/UI fit: POS open/table queue and proposed kitchen preparation view show persisted state/revisions. Proposed `/api/pos/open-orders/[id]/actions` validates edit/send/ready/serve transitions server-side. Table assignment is included; reservation booking is not inferred client scope.
- Compatibility / rollout: New lifecycle never turns a draft into fake completed revenue. Reject stale edits/send races and preserve actual recipe quantities consumed at posting even if BOM changes before later invoice. Reprint/read has zero stock effect.
- Concrete proof scenario: Concurrent send and retry yields one KOT revision/posting; stale edit after kitchen dispatch rejects. KOT reprint and final payment do not rededuct prepared/raw ingredients.
- Business improvement: Kitchen ko real pending-order queue aur cashier ko editable/open-table process milega, without stock/invoice duplication.

### GAP-025 - Proforma and final invoice identity/linkage

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-023, GAP-024
Source: S1 invoice generation/link receipt to invoice; S2 proforma then payment; E07, E11.

Acceptance: distinguish pre-order/proforma, official invoice and KOT identities and numbering; finalization captures approved totals/tax and links the source order. A proforma is not posted as a completed sale. Reprints preserve issued values and tax identity; legacy completed orders migrate without duplicates. Resolve historical tax-snapshot behavior for the new invoice lifecycle rather than reconstructing issued amounts from current settings.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/app/api/pos/orders/route.ts` receipt/`vatInvoiceSummary` construction, saved order/line price fields in `src/db/schema/pos.ts`, and `src/lib/server/vat.ts` policy helpers reuse karein.
- Proposed data/server change: PROPOSED: immutable document header/lines by kind PROFORMA/FINAL, scoped numbering, source lifecycle/order reference and complete issued name/price/effective-tax/currency snapshots. Persist new final financial amounts at issue; VAT summary/report readers must use issued evidence for the new path and explicitly label unsupported legacy reconstruction.
- Proposed API/UI fit: POS issue/preview/reprint views distinguish proforma from final tax invoice and KOT; proposed issue/read handlers have permission and operational/official visibility contracts. Proforma creates no completed sale; finalization maps to existing financial projection once.
- Compatibility / rollout: Current posOrders do not fully persist all live menu/branch tax details used in receipt output. Do not fabricate historical tax snapshots or rewrite old invoice values; approved cutover labels old-data limitations while new issued documents are reproducible.
- Concrete proof scenario: Issue invoice, then change menu name/price/branch VAT setting: reprint remains identical. Duplicate issue/finalization reserves one number and produces one completed-sale projection.
- Business improvement: Proforma, final invoice aur receipt ki identity/linkage clear hogi aur old invoice today ke menu/tax settings se badlegi nahi.

### GAP-026 - POS payment receipts and invoice allocation

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-001, GAP-025
Source: S1 optional receipt channels and invoice linkage; S2 payment-before/after rules; E07.

Acceptance: persisted payment/receipt references link amount/method/currency/rate to an invoice/order, expose outstanding balance, and enforce each concept's sequencing. Partial/split tender/refund behavior follows the approved policy, not an assumed requirement. Prevent duplicate receipt/sale/COGS/stock posting and preserve committed totals on retry. Channel labels or a combined KOT/receipt response are not separate payment accounting.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing tender/FX/order fields in `src/db/schema/pos.ts`, pricing and validation in `src/app/api/pos/orders/route.ts`, and `src/lib/server/shifts.ts` close calculation reuse/extend karein.
- Proposed data/server change: PROPOSED: payment, receipt and invoice-allocation events with exact amount, tender currency/rate, collector/run/source reference and idempotency. Outstanding derives from allocations; receipt posting does not post stock/COGS again. Full settlement stays default unless partial/split policy is approved.
- Proposed API/UI fit: POS invoice receipt/outstanding panel and proposed `/api/pos/invoices/[id]/payments` action link actual collections to invoices. Use one shared collection/drawer read service for close, reports and receipt history, not each module's independent formula.
- Compatibility / rollout: Existing endShiftAndHandover sums completed-order totals. New-path run aggregation must count actual receipt events and exclude corresponding legacy tender projection from collection sums, with an explicit source discriminator; never count both order total and receipt as cash. Old captured FX is preserved.
- Concrete proof scenario: Concurrent identical payment creates one receipt/allocation, no new stock deduction or COGS capture; over-allocation fails. Order opened in run A but collected in B credits B's drawer only.
- Business improvement: Invoice amount, actually collected amount aur pending balance separate aur reconciled honge.

### GAP-027 - Manager-authorized void/cancellation and reversals

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-001, GAP-024, GAP-026
Source: S1 manager-level void in both scenarios; E07.

Acceptance: server-enforced authorized manager action records reason, actor, prior state and reversal references. Stage-specific cancellation/void policy distinguishes unprepared/prepared/paid goods, waste/restock and cash/refund liability. Stock, COGS, invoices, receipts, reports and future rewards reverse or remain as approved exactly once; owner-only hiding is not voiding. Preserve official/audit records, deny cashier/cross-branch bypass and repeated reversal.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/schema/pos.ts` void metadata/`posAlerts`, `src/lib/server/order-visibility.ts` operational filters, and `src/lib/server/permissions.ts` real-role/module guards reuse karein.
- Proposed data/server change: PROPOSED: manager-authorized cancellation/void transition plus append-only stock/cost/payment/refund-liability/reward reversal references tied to original posting. Approved stage policy determines whether raw/prepared goods restock, become waste or remain consumed; do not erase original invoice/COGS/audit evidence.
- Proposed API/UI fit: Proposed `/api/pos/orders/[id]/void` plus POS reason/impact confirmation showing expected reversals. POS_CASHIER alone is not managerial authority; Owner-only hide remains a separate existing action and never changes accounting.
- Compatibility / rollout: COMPLETED/VOIDED report filters already exist, so service must update all financial/operational readers coherently with compensating events. Prepared food is not automatically usable stock on cancellation, and recorded refund liability is not bank execution.
- Concrete proof scenario: Cashier and foreign-branch manager deny; approved manager retry creates one reversal set. Paid/prepared void preserves original issued document and follows agreed waste/refund/reward policy without duplicate credit.
- Business improvement: Client ka managerial void real controlled reversal hoga, sirf order hide/delete ya status text change nahi.

### GAP-028 - Image-based touch POS menu

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-023, GAP-024
Source: S2 graphic menu images/widget POS; E07, E05.

Acceptance: authorized image create/update and appropriate storage/access are implemented; touch-friendly searchable/category menu tiles show item identity, price and availability, with clear order cart/quantity/table/channel. Test missing images, unavailable items, touch and keyboard, mobile overflow and accidental repeated taps. Dropdown ordering remains a fallback, not the claimed visual workflow.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/schema/menu.ts` (`menuItems` category/price/sellability), `src/app/api/menu-items/route.ts`, and `src/app/pos/page-content.tsx` cart `addLine`/`updateLine`/`submitOrder` reuse karein.
- Proposed data/server change: PROPOSED: menu image metadata/reference and authorized upload/update service, reusing validation/storage conventions from `src/lib/server/purchase-documents.ts` only as a pattern. Menu media has a distinct access/storage policy; private invoice evidence must never be exposed as public dish images.
- Proposed API/UI fit: Replace primary item selection with searchable/category touch tiles + availability/price and cart; retain dropdown/manual fallback. Existing backend still revalidates active/sellable/stock/current price, and uploaded images have clear missing/error placeholders.
- Compatibility / rollout: Do not assume a new image/scanner/UI dependency exists. Update Menu edit, clone-approved configuration, POS API types and localization together; scope media writes to correct branch/concept and do not clone transaction data.
- Concrete proof scenario: Missing photo and inactive item remain safe; keyboard/touch quantity controls work at narrow viewport; rapid confirm cannot double-submit. Failed upload never converts private purchase evidence into menu media.
- Business improvement: Order-taking faster aur less error-prone hoga, while existing cart/validation investment remains intact.

### GAP-029 - Unique takeaway token numbers

Status: PENDING
Coverage: MISSING | Phase: P4 | Depends on: GAP-008, GAP-024
Source: S2 unique takeaway tokens; E07.

Acceptance: approved per-branch/business-day/channel token sequence is atomic under concurrency, persisted on order/KOT/receipt and safe on retry/reprint/cancellation. Distinguish the customer pickup token from internal order ID and statutory invoice numbering. Test rollover, gaps policy and cross-branch collisions.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/schema/pos.ts` order identity, POS KOT/receipt output and `src/app/pos/page-content.tsx` result UI reuse karein; current timestamp/UUID orderNumber is not a pickup sequence.
- Proposed data/server change: PROPOSED: scoped sequence identity and persisted one-time pickup-token assignment keyed by approved concept/branch/business-day/channel. Atomic allocate under transaction/unique constraint; invoice numbering is a separate legally approved identity, not token reuse.
- Proposed API/UI fit: POS takeaway result, kitchen queue, KOT and receipt show same token and source order. Proposed lifecycle token allocator is shared by manual/API/platform intake instead of browser-local increments.
- Compatibility / rollout: GAP-008 day/cutover and cancellation-gap policy precede allocation. No renumbering canceled/issued past tokens or all existing order IDs; retry/reprint returns already assigned token.
- Concrete proof scenario: Parallel allocations yield unique scoped tokens; repeated same order retains token; approved midnight rollover and two branches do not collide in the defined scope.
- Business improvement: Pickup coordination clear hogi aur concurrent counters duplicate tokens nahi nikaalenge.

### GAP-030 - Platform-specific tokens and external references

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-024, GAP-029
Source: S2 each online platform has its own token; E07.

Acceptance: configured real platform identity, external order ID and platform-specific displayed token are retained and searchable without colliding with dine-in/direct takeaway. Deduplicate by provider/location/external order identity and preserve it through invoice/KOT/receipt/reprint. Existing manual channel names are not an integration or a unique platform token.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing POS `channel`, CHANNELS validation and CHANNEL_VARIANT display in `src/db/schema/pos.ts`, `src/app/api/pos/orders/route.ts`, `src/app/pos/page-content.tsx` reuse karein.
- Proposed data/server change: PROPOSED: configured provider/location identity, external order reference and displayed provider token distinct from internal order/pickup/invoice IDs; unique provider-location-external-ID constraint. Map external products to approved local catalog identities, not platform labels alone.
- Proposed API/UI fit: POS order/search/document result shows provider reference/token and manual-vs-integrated origin. Proposed reference lookup/entry validation is server-scoped; existing hard-coded SWIGGY/ZOMATO options do not establish actual Tanzania provider support.
- Compatibility / rollout: Existing manually tagged historical orders remain manual/unknown-external-ID, not automatically linked platform events. Provider configuration and approved interface remain GAP-001/031 decisions, and retries resolve original identity.
- Concrete proof scenario: Same external ID for different configured providers may exist; same provider/location/id intake deduplicates to original order/token. Operator cannot see another branch's external reference through search.
- Business improvement: Kitchen/cashier platform orders ko unke actual tokens se identify karenge; channel label aur real provider identity mix nahi hogi.

### GAP-031 - Real delivery-platform order intake

Status: PENDING
Coverage: MISSING | Phase: P4 | Depends on: GAP-001, GAP-024, GAP-025, GAP-030, GAP-032
Source: S2 incoming order through SMS/machine/platform; E07.

Acceptance: select the actual supported API/webhook/SMS/machine interface and mapping with client/provider; authenticate/verify messages, map products/modifiers/taxes, deduplicate retries and handle unavailable items/cancellations. Real controlled acceptance proves order -> KOT/invoice/pending-payment as agreed; record external failure/retry/reconciliation. Requires approved provider access and consent; no invented API, mocked success or fabricated delivery proof. Any manual fallback must be clearly labeled.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing POS validation/stock/pricing logic in `src/app/api/pos/orders/route.ts` and planned shared lifecycle service reuse karein; internal actor authorization differs from external provider authenticity.
- Proposed data/server change: PROPOSED: only approved provider interface ke liye verified ingress-event inbox, immutable external ID/signature evidence, mapping/processing/retry state and reconciliation links. Internal processing uses domain transaction locks; network calls happen outside posting transactions and retries reuse inbox identity.
- Proposed API/UI fit: New provider-specific API/webhook/SMS/machine adapter and operator exception queue are proposals, not currently supported integrations. External callbacks need dedicated signature/auth verification, not browser session/same-origin mutate as their ingress authentication; verified events invoke a constrained internal command path.
- Compatibility / rollout: Blocked until actual provider docs/credentials/consent and GAP-032 settlement semantics are approved. Unmapped items/invalid amounts/signatures enter rejection/exception without partial stock or sale. A manual fallback stays visibly manual and cannot be called real integration.
- Concrete proof scenario: Invalid signature rejected; duplicate valid event creates one open order/KOT according to approved flow. Unmapped item or receiver outage leaves observable exception/pending event, not a fabricated completed/paid sale.
- Business improvement: Provider se actual reliable order intake possible hoga, with recoverable failures instead of silent duplicates or cashier retyping presented as automation.

### GAP-032 - Online unpaid/pending-payment order state

Status: PENDING
Coverage: PARTIAL | Phase: P4 | Depends on: GAP-024, GAP-025, GAP-026
Source: S2 online orders KOT/invoice/receipt pending payment; E07.

Acceptance: order/fulfillment status and payment status are distinct; incoming online order may fire approved kitchen documents without falsely being marked paid. Show unpaid amounts and controlled settlement/receipt transition; reconcile with provider reference. Revenue recognition and shift tender inclusion follow approved policy, not automatic treatment as cashier cash. Repeated provider settlement cannot double-post.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing completed sales/COGS in `src/db/schema/pos.ts`, shared POS posting boundary and `src/lib/server/shifts.ts` collections integration reuse karein.
- Proposed data/server change: PROPOSED: fulfillment state and payment state separate; provider receivable/settlement references and pending balance link to GAP-026 payments. Kitchen/invoice events follow approved revenue-recognition rules but never manufacture a paid receipt; financial projection is explicitly versioned.
- Proposed API/UI fit: POS online pending-payment queue and controlled settlement action show actual unpaid/partially/fully settled status per approved policy. Reuse invoice/receipt lifecycle rather than adding a second aggregator billing engine.
- Compatibility / rollout: Implement before GAP-031 despite numeric ID order. Current completed-order tender sums cannot treat unpaid kitchen orders as cash; reconciliation/report/shift readers must understand new event sources and keep historical paid orders unchanged.
- Concrete proof scenario: Unpaid online kitchen dispatch creates no drawer receipt. Repeated provider settlement links once, updates outstanding once and never rededucts inventory or recaptures sale COGS.
- Business improvement: Online order kitchen me process ho sakega, lekin accounts/shift me payment aane se pehle cash collection jhoothi nahi dikhegi.

### GAP-033 - First opening cash/float entry

Status: PENDING
Coverage: PARTIAL | Phase: P5 | Depends on: GAP-008, GAP-026
Source: S1 Shift Opening Cash; E08.

Acceptance: authorized opening-float amount/source/reference can be recorded for the first run and approved replenishment. Later incoming handover and new float are not double-counted; opening snapshot is immutable after controlled posting. Reconciliation proves expected cash from opening + actual cash receipts - approved cash movements. Test zero/negative/duplicate float and role denial.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/lib/server/shifts.ts` (`startFirstShift`, `lockShiftState`, `endShiftAndHandover`), `src/app/api/shift-runs/route.ts`, `src/app/admin/settings/shifts/page-content.tsx`, `src/app/cash-drop/page-content.tsx` aur `src/lib/shift-gate.tsx` ko extend karein.
- Proposed data/server change: PROPOSED: append-only drawer movements (opening float/top-up/cash receipt/cash expense/refund/HO dispatch) with branch/run/source identity, exact amount, actor and unique idempotency reference. Shift opening snapshot points to its real funding source; accepted prior handover is not a second opening-float credit. Existing run/handovers stay historical records.
- Proposed API/UI fit: Existing Start Shift action me authorized opening source/amount form add karein; start handler run + first movement atomically persist kare. Cash Drop screen blind expected amount hide rakhe aur shared drawer summary se close compute kare. New movement handlers are proposals, not existing APIs.
- Compatibility / rollout: Configured pilot branches ke liye feature-gated path; unconfigured shift behavior unchanged. Existing runs ko invented opening float backfill na karein. Lock ordering remains recipe-stock before shift-state where both required; foundation/auth lock ordering must remain consistent.
- Concrete proof scenario: Fresh run opens with TSh 50,000, collects TSh 10,000 cash, count TSh 60,000 -> zero variance. Same start/float request retry once-only; subsequent accepted handover 60,000 is not counted again as new funding.
- Business improvement: First shift ka unexplained cash shortage/excess khatam hoga aur opening money ki custody traceable hogi.

### GAP-034 - Live shift sales, tender and pending-order summary

Status: PENDING
Coverage: PARTIAL | Phase: P5 | Depends on: GAP-024, GAP-026, GAP-032
Source: S1 sales summary, pending orders, receipt breakup; E07-E08.

Acceptance: running shift screen/API distinguish completed/invoiced/open/unpaid orders and actual collected Cash/Card/Other by the approved run/time policy. Pending orders carry over by explicit policy, not by marking them completed. Existing closing tender summary remains correct; role/order visibility boundaries are preserved and operational vs official totals are labeled honestly.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/app/api/shift-runs/route.ts` GET/status, `src/lib/server/shifts.ts` (`currentOpenRun`, `requireOperableShift`), `src/app/admin/settings/shifts/page-content.tsx` aur `src/lib/shift-gate.tsx` ka scoped read pattern reuse karein.
- Proposed data/server change: PROPOSED: read-model over GAP-024 order lifecycle plus GAP-026 payment events and drawer ledger; no independent editable totals table. Attribute actual collections to collection run, not blindly the run that originally opened an unpaid order. Operational visibility-filtered order lists and actual custody totals are separate contracts.
- Proposed API/UI fit: Existing shift status screen/API me live sales, collected tenders, open/unpaid orders and carryover panel add karein; cashier POS/Cash Drop me same shared summary use karein. No hidden-order IDs/counts leak through operational aggregates; required unfiltered physical reconciliation is explicitly labeled actual custody.
- Compatibility / rollout: New summary read-only first, compare against close snapshots before replacing any existing calculation. Query invalidation/manual reload follows current stale-response guards, with indexed bounded reads instead of repeated whole-history fetches.
- Concrete proof scenario: Order run A me open hua, cash run B me mila: order carryover dikhe, cash sirf B ke drawer me aaye; card pending order cash expected amount na badhaye. Existing owner-only privacy tests and actual cash close both pass.
- Business improvement: Cashier ko sales aur actually received money ka difference clear dikhega; pending order ko fake completed sale bana kar shift close nahi karna padega.

### GAP-035 - Shift-linked expenses and cash drawer movements

Status: PENDING
Coverage: PARTIAL | Phase: P5 | Depends on: GAP-026, GAP-033
Source: S1 expenses on shift; E08.

Acceptance: approved expenses link a specific shift, paying drawer/method, amount, reason/evidence and approver. Only actual drawer-cash outflow reduces expected cash, exactly once; noncash expense must not. Corrections are auditable and reconcile to Accounts without duplicate posting. Prove the TSh 20,000 cash-expense example closes without a false shortage and reject backdated/closed-run bypass.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/schema/expenses.ts` (`branchExpenses`), `src/lib/server/expenses.ts` (`parseExpense`, `assertExpenseReplay`, `voidExpenseChanges`), `src/app/api/accounts/expenses/route.ts` (`postExpenseJournal` call) aur `src/lib/server/shifts.ts` close math ko connect karein.
- Proposed data/server change: PROPOSED: optional shiftRunId/payment source/method on new approved expense entries plus uniquely linked drawer movement. Existing expense/journal remains the expense source of truth; drawer row records cash custody only, not another operating expense. New refund/void cash compensation is append-only and distinct from merely voiding an accounting entry.
- Proposed API/UI fit: Accounts expense form me 'paid from this shift drawer' option only for authorized open run; Cash Drop/shift panel approved movement read kare. Extend current validators/column selection/types together and enforce real actor/branch/run server-side; no client-supplied expected cash.
- Compatibility / rollout: Existing date-based expenses retain unknown/not-drawer origin unless evidence authorizes reconciliation; never retroactively subtract all old expenses from an active drawer. Expense insert, journal and cash movement share one appropriate DB transaction; changed payload under same idempotency key rejects.
- Concrete proof scenario: Drawer 100,000, approved cash expense 20,000 -> expected 80,000; same expense paid by bank/card -> drawer stays 100,000. Retry or expense void without actual cash return must not create phantom drawer credit or duplicate P&L expense.
- Business improvement: Accounts aur physical cash ek hi real expense ko consistently explain karenge, bina double expense ya false shortage ke.

### GAP-036 - Final shift cash handover to Head Office

Status: PENDING
Coverage: PARTIAL | Phase: P5 | Depends on: GAP-033, GAP-034, GAP-035
Source: S1 last shift cash to HO; E08.

Acceptance: distinguish next-shift carryover from final HO dispatch/deposit; record counted denominations/amount, custody, receiver acknowledgment, discrepancy and pending/in-transit state. Prevent double handover, self/unauthorized acceptance and an unwanted automatic next-shift opening. Define retained float/next-business-day restart and test all run transitions.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/lib/server/shifts.ts` (`endShiftAndHandover`, `acceptHandover`), `src/db/schema/shifts.ts` (`shiftRuns`, `shiftHandovers`), `src/app/api/shift-runs/[id]/end/route.ts`, `src/app/api/shift-handovers/[id]/accept/route.ts` aur `src/app/cash-drop/page-content.tsx` ko extend karein.
- Proposed data/server change: PROPOSED: explicit destination type NEXT_SHIFT vs HEAD_OFFICE, custody transfer identity/status, retained float and receipt acknowledgment linked to drawer movements. Existing shiftHandovers.toRunId is NOT NULL; HO flow needs a reviewed additive separate custody-transfer table or coherent schema migration, not a fake next-run reference. HO cross-database acknowledgment uses the approved durable bridge.
- Proposed API/UI fit: End Shift me authorized next-shift/HO option and counted dispatch amount; HO/Accounts receipt queue shows in-transit cash and differences. Next shift is created only for the approved NEXT_SHIFT path; final close/next-day restart follow agreed operating-day policy.
- Compatibility / rollout: Keep current next-shift default until pilot approval; update response discriminated shape and Cash Drop UI together because it currently requires toRun.label. Preserve historic handovers/cashDrops, blind count and accepted incoming logic. Receiver confirmation must not itself pretend to be bank deposit.
- Concrete proof scenario: Final run count 80,000, retain float 10,000, dispatch HO 70,000 -> no automatic new shift; HO acknowledgment credits custody once. Retry, wrong receiver and cross-branch substitution reject; next-shift path still works unchanged.
- Business improvement: Last shift ka cash next fictitious shift me atakne ke bajaye actual HO custody tak tracked rahega.

### GAP-037 - Voluntary WhatsApp community join flow

Status: PENDING
Coverage: PARTIAL | Phase: P6 | Depends on: GAP-001, GAP-023
Source: S1/S2 CRM join link; E09.

Acceptance: configured community link is offered voluntarily through the approved thank-you/receipt/customer path with privacy/opt-in text; no automatic group enrollment or marketing-consent inference from a phone number. Verify link/fallback and opt-out behavior. Provider send/delivery claims require controlled proof; existing thank-you/offer paths are reused, not rebuilt as missing.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/lib/server/whatsapp-triggers.ts` (`thankYouMessage`, `offerMessage`), POS post-commit thank-you path and `src/app/api/whatsapp/offer-alert/route.ts` preview/send audience queries reuse/extend karein.
- Proposed data/server change: PROPOSED: approved community URL/privacy text plus consent/preference events and invitation eligibility. Community enrollment is voluntary outside our accounting transaction; no phone capture automatically creates membership, marketing consent or group enrollment.
- Proposed API/UI fit: Receipt/thank-you path offers optional Join Community link with clear opt-out/manual fallback. Both offer preview GET and send POST must apply the same consent + branch + operational visibility rules once membership/preferences exist.
- Compatibility / rollout: Current offer audience derives from historical phones, not consent, and current offer send runs inside mutate. As part of this slice persist authorized campaign intent/audience evidence under lock, then deliver outside the business lock with rechecked opt-out policy and bounded retries; do not claim all current sends are already post-commit.
- Concrete proof scenario: Anonymous/declined invitation sale still succeeds. Opted-out customer excluded from both preview and send; provider failure never rolls back sale or holds stock/cash locks, and no test real-send without consent.
- Business improvement: Existing messaging investment se community growth possible hogi, without unsolicited auto-enrollment or inaccurate audience counts.

### GAP-038 - Customer membership registry and consent

Status: PENDING
Coverage: PARTIAL | Phase: P6 | Depends on: GAP-001, GAP-003
Source: S2 trackable loyalty membership; E09.

Acceptance: stable unique membership identity, Tanzania phone validation/deduplication, consent/preferences and authorized lookup/update/merge rules exist. Define cross-concept/branch membership scope and retention. Anonymous cash customers remain valid; merely capturing a phone on an order is not membership or community enrollment.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/lib/server/whatsapp-triggers.ts` (`validOptionalPhone`), optional customer name/phone in `src/db/schema/pos.ts`, and branch/auth guards reuse karein; employee users are not customer membership records.
- Proposed data/server change: PROPOSED: stable customer/member identity with approved scope-unique normalized phone, consent/preference events, audited merge aliases and lifecycle order/member links. Cross-concept membership ownership/sharing follows P0; do not join independently isolated DBs by untrusted phone alone.
- Proposed API/UI fit: Proposed `/api/customers` scoped lookup/create/update and optional POS member selector with anonymous checkout. Customer history retention/access and merge authority are explicit; new records integrate with community and reward events, not auto-import all past captured phones as enrolled members.
- Compatibility / rollout: Normalize supported Tanzania local/international variants consistently; preserve historical order customer snapshots and attach only verified links. Uniqueness/backfill duplicates are reviewed before constraints, not overwritten by convenience upserts.
- Concrete proof scenario: Two concurrent registrations using equivalent approved phone variants resolve one member or a clear conflict; unauthorized cross-scope lookup rejects. Anonymous sale works and past invoice customer text remains unchanged after member edit.
- Business improvement: Repeat customers ki dependable identity milegi; phone-on-receipt ko fake membership/consent nahi maana jayega.

### GAP-039 - Trackable reward earn/redeem/reversal ledger

Status: PENDING
Coverage: MISSING | Phase: P6 | Depends on: GAP-026, GAP-027, GAP-038
Source: S2 proposed trackable rewards program; E09.

Acceptance: client approves program, eligibility, value, expiry and accounting policy before implementation. Persist append-only earn/redeem/expire/reverse events tied to eligible actual orders/payments, prevent overspend/concurrent double redemption and reverse rewards according to void/refund policy. Balance is reproducible and branch/user authorization tested. A WhatsApp broadcast or cosmetic points field is not loyalty accounting.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing sale/payment/void identities from `src/db/schema/pos.ts`, current `src/lib/server/cogs.ts` capture boundaries and proposed GAP-026/027 domain events reuse karein.
- Proposed data/server change: PROPOSED: versioned approved reward policy and append-only earn/redeem/expire/reverse ledger with unique source-event identity. Serialize redemption against the authoritative member ledger; reproducible balance derives from events, not an independently editable points number. Money/account treatment follows explicit client decision.
- Proposed API/UI fit: Proposed reward balance/history/redemption endpoints and POS member panel show eligible amount/cost and require authorized confirmed redemption. Cross-concept loyalty DB ownership follows P0; no unprotected multi-DB read-then-debit.
- Compatibility / rollout: Do not invent points rate, expiry or refund economics. Subscribe/process verified committed payment/void events once; preserve original rewards and append reversals rather than deleting transactions. Provider WhatsApp outages do not change actual reward balance.
- Concrete proof scenario: Concurrent redemptions cannot overspend; payment/void retries earn/reverse once; full ledger replay reconstructs exact balance and original source order survives.
- Business improvement: Client ko actually trackable reward program milega, na ki cosmetic balance field ya marketing broadcast ko loyalty bolna.

### GAP-040 - Customer membership QR issuance and safe scanning

Status: PENDING
Coverage: MISSING | Phase: P6 | Depends on: GAP-038
Source: S2 QR-based membership-number scanning; E09.

Acceptance: generate safe non-sensitive customer QR identifiers and implement authorized scanner/lookup with revoked/invalid/unknown-code handling and manual membership fallback. Define supported scanner/camera hardware and test it. Do not expose phone/credentials in QR or confuse provider-login QR with customer membership QR. Scanning must not itself authenticate a high-value redemption without the approved control.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing authenticated customer selection/cart structure in `src/app/pos/page-content.tsx` plus approved GAP-038 membership lookup reuse karein; provider-login QR is unrelated.
- Proposed data/server change: PROPOSED: opaque revocable member-lookup token hashed at rest with issue/revoke/audit events; QR contains no phone/password/session credential. QR possession only identifies a member and cannot authorize high-value redemption without approved additional control.
- Proposed API/UI fit: Proposed issuance/authorized lookup actions, POS scanner input and manual membership-number fallback. Choose QR renderer/camera/hardware support only after checking current package manifest and client devices; no installed scanner/QR API is assumed.
- Compatibility / rollout: Approve token scope/rotation and member access policy before release. Rate-limit scoped lookup where appropriate, hide unknown/revoked details and test real approved scanner behavior separately from a mocked decoded string.
- Concrete proof scenario: Unknown/revoked code reveals no profile; unauthorized scan lookup denies; approved device resolves intended member and scanning alone creates no sale/redemption.
- Business improvement: Fast member lookup milega without exposing personal/secret data or accidentally treating QR as payment authorization.

### GAP-041 - QR/member-assisted repeat ordering

Status: PENDING
Coverage: MISSING | Phase: P6 | Depends on: GAP-028, GAP-038, GAP-039, GAP-040
Source: S2 swift repeat orders from membership scan; E07, E09.

Acceptance: scan/lookup selects the intended customer in POS, shows permitted recent orders/preferences/rewards and lets the cashier add a prior order using CURRENT availability/prices/taxes with explicit confirmation. No silent historical-price reuse, duplicate sale or unauthorized customer-history disclosure. Membership lookup remains useful if loyalty earning is temporarily unavailable.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/schema/pos.ts` (`posOrderLines`), `src/app/api/menu-items/route.ts`, POS addLine/updateLine/submitOrder and `src/lib/server/order-visibility.ts` filters reuse karein.
- Proposed data/server change: PROPOSED: scoped member recent-order query and repeat-into-cart mapping using current local catalog identity/availability/price/tax. Historical order snapshots remain read-only; quantities/item substitutions require explicit validation and user confirmation, not automatic reorder posting.
- Proposed API/UI fit: After approved QR/manual lookup, POS member panel offers eligible recent orders and 'Add again' preview with current differences. Same cart/submission/lifecycle service handles final order; planned history endpoint must apply visibility before pagination/count/aggregation.
- Compatibility / rollout: Hidden orders cannot leak through CRM counts or recent-item suggestions; cross-branch/cloned-menu identity needs approved mapping. Reward outage should not prevent ordinary member selection/ordering, but a failed redemption never silently grants a discount.
- Concrete proof scenario: Old item repriced/inactive -> preview flags current amount/removal and requires confirmation. Repeated scan creates no sale; hidden past order stays absent and ordinary reorder works when reward lookup is unavailable.
- Business improvement: Cashier repeat order jaldi le sakega, bina stale price, unavailable items, hidden-history leak ya duplicate checkout ke.

### GAP-042 - Client end-to-end acceptance and final coverage signoff

Status: PENDING
Coverage: PARTIAL | Phase: P7 | Depends on: all required P0-P6 items
Source: S1-S3; E01-E12.

Acceptance: trace every visible client row to an implemented/evidenced scenario or an explicitly accepted scope change; run both concept flows and the complete purchase -> actual receipt -> kg-to-pcs production -> mixed internal issue -> branch receipt -> sale -> stock count -> cash close/HO chain. Cover shortages, quality returns/debit notes, partial/pending payments as approved, voids, expiry, rewards and controlled provider failures/retries. Exercise real disposable SQL/HTTP, migration upgrade/replay, authorization and concurrency; complete appropriate desktop/mobile client UAT and independently review critical money/stock paths. Record approved release/revision, migration/readback and auth-safe production smoke; no real external sends/bank/stock experiments without consent. Update the process map renderer/artifact/tests and Guide descriptions, then reconcile all active/done IDs in both tracking files. No module badge or test-count alone is client acceptance.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `tests/shift-handover.integration.cjs`, `tests/dashboard-reports.integration.cjs`, `tests/low-stock-summary.integration.cjs`, `tests/low-stock-summary-binding.test.cjs`, `tests/cogs-default.integration.cjs` aur `scripts/render-full-process-flow.cjs` ki disposable-DB, app-binding, history-preservation aur reproducible-documentation patterns reuse karein.
- Proposed data/server change: PROPOSED: per-gap evidence matrix using the same 42 IDs with schema/API/UI paths, approved decisions, actual test results, release SHA/target and client scenarios. Test fixtures synthetic and isolated hon; production migration proofs establish preserved history/reference readiness, not invented business activity.
- Proposed API/UI fit: Approved role/branch/concept accounts se real browser walkthrough of existing/new screens; source map renderer/cards, Guide labels and both tracker files update together. Reports, official tax exports and physical custody totals retain their deliberately different authorization contracts.
- Compatibility / rollout: One vertically complete pilot slice at a time; existing disabled feature path has regression tests. Rebuild/restart compiled QA app after changes, prove each DB/app binding before mutations/cron, and test provider outage safely. Authorized production deploy/readback is separate from local test success; post-write rollback uses reviewed compensation/forward repair.
- Concrete proof scenario: Client ke complete chain me PO 100 / receipt 90 / quality usable 85 -> production actual pieces -> mixed transfer -> branch sale -> manager void case -> stock count -> expense -> HO cash receipt; each stage conserves its approved quantity/value and replays without double-posting. Client signs both Fast Food and Conventional paths.
- Business improvement: Completion module badges se nahi, actual connected business process aur auditable release evidence se establish hogi.

## 6. Done register

Verified completed blocks move here with the evidence template; do not copy
them while leaving an active duplicate. Previously shipped foundation
remains documented in section 2 and historical `CLAUDE.md` records, not
falsely relabeled as newly completed GAP items.

### GAP-008 - Resolve business-day and legacy FX boundary before new posting

Status: DONE
Coverage: PARTIAL | Phase: P1 | Depends on: GAP-001, GAP-003
Source: E08, E11-E12; engineering carry-forward, NOT an extra quoted client-sheet requirement.

Baseline: TSh display/VAT changes did not migrate legacy IST business-day helpers or internal INR FX assumptions. Captured sale COGS is not production-lot valuation.
Acceptance: approve Tanzania business timezone/base-currency and historical-cutover policy; align new stock/expiry/shift/POS/report day boundaries and FX conversion semantics without reinterpreting old money or dates. Classify harmless legacy identifier names separately from wrong behavior. Cross-midnight/replay tests and historical preservation are required. Do not expand this item into statutory tax filing or rewrite previously posted costs.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/lib/server/shifts.ts` (`currentIstTime`, `toCents`/`fromCents` internal helpers), `src/lib/server/workforce-calculation.ts` (`businessDate`), `src/app/api/reports/_aggregation.ts` (`istDayRange`, `istMonthRange`, `toPaise`, `fromPaise`) aur `src/lib/server/daily-summary.ts` ke callers inspect karke common policy seam banayein.
- Proposed data/server change: PROPOSED: pure shared business-calendar and currency/minor-unit policy helpers with approved timezone/base currency and effective cutover; new event snapshots carry their applicable business date/currency/rate identity. Existing INR-named fields ko TZS behavior ke liye blindly rename/reprice na karein; quantity conversion uses explicit units and existing exact decimal conventions.
- Proposed API/UI fit: Shifts, POS order windows, attendance/payroll, Dashboard/Reports, expiry UI aur cron day-keys sab approved helper contract consume karein. Existing TSh formatter/localization use karein; schedule UTC time aur local business day ko independently display/verify karein.
- Compatibility / rollout: P1 me DB boundary ke baad aur NEW ledger go-live se pehle yeh contract stabilize karein. Historical payroll/order/COGS/closed shifts unchanged rahein; legacy events ke day assignment ke liye approved fallback label ho. Cron idempotency keys ke cutover par duplicate daily sends/stock closes na hon.
- Concrete proof scenario: Same instant jo IST me next day par Tanzania me prior day hai, us par shift/report/expiry/reorder sab agreed day show karein; old finalized payroll/COGS snapshots byte-for-byte preserve hon aur cron retry double-send na kare.
- Business improvement: Sales, stock, expiry aur cash close ek hi business day par reconcile honge; currency display change ko historical money conversion samajhne ki galti nahi hogi.


Completion evidence (GAP-008 - Tanzania business-day boundary):

Status: DONE
Completed: October 31, 2026
Decision approval: Owner confirmed in the same P0 clarification round (recorded under GAP-001 in this section): "Tanzania local time (EAT, UTC+3) and TSh ko hi single source of truth maanein - legacy IST/INR internal code ko fully replace karo" (full behavior replacement, not a display-only rename).
Implementation: new canonical src/lib/server/business-calendar.ts (BUSINESS_TIMEZONE = "Africa/Dar_es_Salaam", fixed UTC+3, no DST) exports businessDateString/businessTimeHHMM/businessDayRange/businessMonthRange/businessDayKey/businessDayLabel. Every legacy India-coded Asia/Kolkata (+05:30) definition across the codebase now delegates to it or uses the same fixed +03:00 offset directly: src/lib/server/shifts.ts (currentIstTime), src/lib/server/workforce-calculation.ts (businessDate), src/app/api/reports/_aggregation.ts (istDateParts/istDayRange/istMonthRange/istDayKey/istDayLabel), src/lib/server/task-generation.ts (IST_OFFSET_MS constant now 3h, istDateOnly/dueAtForCycle), src/lib/server/whatsapp-triggers.ts (shortClock), src/lib/mis-period.ts (misCalendarWindow/istCalendarDay), src/app/workforce/live-ui.tsx (today), src/app/performance/page-content.tsx (todayIst), src/app/reports/[report]/report-content.tsx (istDate), src/app/admin/settings/shifts/page-content.tsx (ShiftReminder), src/app/api/dashboard/kpis/route.ts and src/app/api/reports/cash-reconciliation/route.ts (timezone response label), src/app/api/inventory/variance/route.ts and src/app/api/mis/_shared.ts (+03:00 date-range parsing). Several call sites deliberately KEEP their old "ist"-prefixed exported names (currentIstTime, businessDate, istDayRange, etc.) as thin wrappers to avoid a simultaneous mass rename across 80+ call sites in the same pass - every one carries a code comment stating the underlying behavior is now Tanzania EAT, matching this GAP's own "classify harmless legacy identifier names separately from wrong behavior" acceptance text. No new migration/schema change was needed - this is a pure calendar-arithmetic refactor. FX conversion semantics were explicitly left out of scope: TSh is already the sole base currency (prior Tanzania localization pass); the existing optional currencyRates table for foreign-tender POS payments is unrelated to the business-calendar boundary and was not touched.
Tests: npx tsc --noEmit --incremental false - 0 errors. npm test - 477/477 passed (was 471 before this slice; +6 new tests in tests/business-calendar.test.cjs covering cross-midnight rollover, exact EAT offset, day/month range boundaries and the BUSINESS_TIMEZONE identifier). 10 pre-existing tests had hardcoded IST (+05:30) expected values and were FIXED (not weakened) to the new Tanzania EAT (+03:00) expected values, after first watching each one genuinely fail under the new behavior: tests/dashboard-reports.test.cjs (istDayRange/istMonthRange boundary, groupRevenueByDay bucket assignment), tests/shifts.test.cjs (currentIstTime), tests/workforce-ui-lifecycle.test.cjs (business date vs browser calendar), tests/workforce.test.cjs (businessDate cross-midnight), tests/task-generation.test.cjs (istDateOnly, dueAtForCycle), tests/whatsapp-triggers.test.cjs (taskReminderMessage due-time), tests/phase3-integration-ui.test.cjs (misCalendarWindow), tests/shift-ui.test.cjs (ShiftReminder rendered due-time). npx next build - clean, no route changes (pure internal refactor).
Release: N/A for this evidence entry - local, uncommitted source only; ask before committing/deploying, same standing rule as every other change in this file.
Acceptance: cross-midnight rollover proven directly (businessDateString/businessDayKey/istDateOnly all tested at the exact UTC instant that crosses the EAT day boundary, 21:00 UTC). Historical preservation: this is a pure "now"-forward calendar-arithmetic change - no existing row's stored timestamp, business-day label, payroll snapshot or COGS figure was recomputed or rewritten; only future computations of "what is today/this month" change. Classify-separately requirement satisfied: the remaining "ist"-prefixed names are explicitly documented in-code as a cosmetic naming follow-up, distinct from the (now fixed) behavior.
Limitations: the cosmetic rename of the remaining "ist"-prefixed exported function/constant names (currentIstTime, businessDate, istDayRange, istMonthRange, istDayKey, istDayLabel, istDateOnly, dueAtForCycle, IST_OFFSET_MS) to neutral "business"-prefixed names across their ~80 call sites is explicitly NOT done in this pass - flagged as a separate, lower-risk follow-up, not silently dropped. GAP-004/GAP-005/GAP-006/GAP-007 (the P1 items that depend on this business-day contract) still need their own implementation.

### GAP-001 - Confirm business policies and acceptance contract

Status: DONE
Coverage: DECISION | Phase: P0 | Depends on: none
Source: S1-S3; cropped/incomplete source text and policy choices.

Record client-approved answers for: mandatory HO approval vs existing indent auto-approval; vendor approval authority; raw/pcs units and actual cutting loss; allowed delivery shortages/excess/partial receipts; cost/yield tolerance and who can override; reservation/table/KOT/payment sequence for both concepts; void/refund/restock policy; payment part/split rules if wanted; final shift cash custody; timezone/currency/FX rules; expiry semantics; actual delivery providers/interfaces; community consent and loyalty/reversal rules. Obtain complete wording where screenshots are cropped. Do not assume India-specific provider names suit this Tanzania business. Owners, dates and scope changes remain unassigned until agreed.

Acceptance: approved decision/acceptance matrix links every visible S1-S3 requirement to an existing foundation or a backlog ID. Proposed extra capability (e.g. part-payment, split tender, FEFO or bank automation) is explicitly accepted, deferred or out of scope, not silently mandatory. Record implementation approval separately.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/schema/platform.ts` (`branches`), `src/lib/moduleAccess.ts` (`MODULE_KEYS`), `src/lib/server/permissions.ts` (`branchScope`, `assertModule`) aur current Purchase/POS/Shift screens ko decision inventory ka base rakhein; naya ERP/configurator rebuild na karein.
- Proposed data/server change: Pehle versioned written policy/acceptance matrix propose karein: concept, branch, workflow, approval authority, base unit/currency/timezone, cutover date aur exception rule. Sirf approved runtime settings ke liye later additive config/schema ho; client answers ke bina current defaults na badlein.
- Proposed API/UI fit: Existing Purchase, Inventory, Menu/BOM, POS, Cash Drop aur Reports navigation par client ke actual steps map karein. P0 ka output reviewed decision document aur example transactions hai, koi fake 'approval complete' API/page nahi.
- Compatibility / rollout: Unresolved policies ko owner/question/dependent GAP ke saath retain karein. Existing approved functionality chale; partial payment, FEFO, loyalty economics aur platform names ko assumptions se enable na karein.
- Concrete proof scenario: Client se ek signed-off example lein: PO 100 kg, physically 90 kg, usable 85 kg; kaun shortage/quality claim approve karega aur invoice kis value par match hoga? Isi decision ko GAP-005/017/018 tests me reference banayein.
- Business improvement: Har developer ek hi business rule follow karega; alag modules me conflicting approval/payment/stock behavior nahi banega.

### GAP-002 - Resolve separate database/workflow architecture

Status: DONE
Coverage: DECISION | Phase: P0 | Depends on: GAP-001
Source: S1 Conventional Restaurant & Bar heading; E10.

Baseline: current shared DB with branch isolation does not meet the explicit separate-database wording.
Acceptance: obtain client confirmation of physical database boundaries, shared masters/reporting, user access, central-kitchen supply across concepts, numbering, migrations and recovery. Produce a reviewed ADR/data-flow/migration plan. If client accepts a shared database instead, record that explicit scope change; do not call the original separate-database requirement implemented. Runtime implementation remains GAP-003.

#### Current-project integration blueprint (PROPOSED)

- Current-project reuse: Existing `src/db/client.ts` ka single `db`/Pool, `src/lib/server/auth.ts` (`locked`, `mutate`, `requireIdentity`) aur branch-scoped `branches`/`Identity` design ko ADR me explicitly assess karein; aaj ka shared-DB behavior physically separate DB nahi hai.
- Proposed data/server change: Recommended decision candidate: same Next.js app/UI aur reusable domain code, lekin client-approved CONCEPT-level operational DB boundary (not automatically one DB per branch). Auth/shared masters/central kitchen kis database ke owner hain aur IDs/reporting/backup kaise bridge honge, ADR me choose karein. Shared DB alternative sirf client ke recorded scope change par.
- Proposed API/UI fit: P0 me implementation nahi: trusted server-side concept selection, domain executor contract, shared-master ownership, cross-concept transfer sequence aur migration/cutover diagram review karein. Connection names/secrets browser ya client body se select nahi honge.
- Compatibility / rollout: Current FKs auth/branches aur business tables ko same database me join karte hain. Split se pehle all FK/joins/session paths ki compatibility inventory banayein. Do databases par same SQL transaction/advisory lock ka claim na karein; durable outbox/inbox bridge aur explicit live-authority coordination review karein.
- Concrete proof scenario: Design walkthrough: branch A ka cashier branch B/concept B ID bhej kar database switch na kar sake; central kitchen dispatch ke baad receiver DB offline ho to stock in-transit rahe aur retry par once-only receipt ho.
- Business improvement: Client ka separate-database intent respect hoga, bina do duplicate apps ya fragile manual stock synchronization banaye. Architecture approve hone tak yeh recommendation hai, final decision nahi.


Completion evidence (GAP-001 and GAP-002 - P0 decision gate):

Status: DONE
Completed: October 31, 2026
Decision approval: Owner/client answered the P0 clarification round in this session (recorded verbatim below). Decision-only closure per section 4 rule 6; no application/schema/production change is implied or authorized by this record.
Recorded decisions:
- GAP-002 (database architecture): keep ONE shared database with strong branch/concept-level filtering. This is an EXPLICIT SCOPE CHANGE from the original client-sheet "separate database" wording for Conventional Restaurant & Bar, not an implementation of the literal requirement. GAP-003 (database isolation boundary) is therefore NOT required as a physical-separation build; any future GAP-003 work is limited to hardening existing branch/concept filtering, not real DB splitting.
- Indent HO approval (GAP-001): mixed policy - indents above an agreed threshold or in agreed categories require HO/Owner approval; everything else keeps the current rolling-average auto-approval logic. Exact threshold value/category list is an implementation-time detail still to be confirmed when GAP-017/GAP-018 are scoped.
- Vendor approval authority: Branch Admin may add a vendor for their own branch; HO/Owner reviews afterward (review, not a pre-condition block).
- Delivery shortage/excess: accept only the actual received quantity each time; the remaining outstanding PO quantity may arrive via a later, separate delivery (multiple partial GRNs per PO are explicitly approved - supersedes the old "one GRN per PO" assumption for GAP-005).
- Shift cash custody: unchanged from current Cash Drop flow - Branch Manager/Admin counts and locks, next shift accepts. No extra HO confirmation step or third-party deposit process requested.
- Cost/yield tolerance override: Branch Manager/Admin may override small variances at their own branch; large variances must escalate to HO/Owner. Exact numeric tolerance threshold is still to be confirmed at GAP-010/GAP-011 implementation time.
- Payment part/split rules: BOTH part-payment (installment-style, bill settled across multiple payments over time) AND split-tender (one bill, multiple payment modes at once, e.g. cash+card) are approved and in scope for GAP-023 through GAP-032.
- Void/refund/restock approval: Branch Manager/Admin may approve void/refund for their own branch; no HO escalation threshold requested.
- Timezone/currency/FX: Tanzania EAT (UTC+3) and TSh are the single source of truth going forward. Legacy internal IST/INR helpers (currentIstTime, istDayRange/istMonthRange, toPaise/fromPaise, etc.) are approved for a FULL replacement, not just a display-layer rename - this is now in scope for GAP-008, including historical-data preservation rules already written into that GAP's acceptance criteria.
- Expired stock: HARD BLOCK - expired stock may not be sold via POS or consumed in production, no soft-warning override. Applies to GAP-006/GAP-009's expiry enforcement design.
- Reservation/table/KOT/payment sequence: Fast Food and Conventional Restaurant & Bar follow the SAME sequence (reservation -> table assign -> order -> KOT -> payment); no concept-specific branching needed in GAP-023 through GAP-032 for this particular sequence.
- Raw-to-pcs cutting yield (GAP-009): actual per-batch yield/waste tracking is approved and required; the existing fixed BOM recipe remains a planning-only estimate, not a substitute for recorded actual cutting results.
- Delivery providers: none currently in use or planned (no Swiggy/Zomato-equivalent). POS/order intake stays dine-in, takeaway and the restaurant's own delivery staff only. GAP-028 (platform order intake) has no real provider to integrate against at this time - treat as BLOCKED/no current scope until the client names an actual provider.
- Community consent/loyalty (GAP-037-GAP-041): WhatsApp community/offer messaging requires explicit opt-in consent tracking plus a reversal/unsubscribe path; this governs the consent-filtering design already called out in GAP-037's blueprint.
Implementation: gaps.md Active register entries for GAP-001/GAP-002 updated with this decision record; no application/schema/server code touched by this decision-recording pass.
Tests: npm test (documentation-change regression only - see section 7 validation note); no new application behavior to test for a decision-only closure.
Release: N/A - decision-only GAP, no deployment applicable per section 4 rule 6.
Acceptance: Owner confirmed all fourteen P0 decision points above via direct clarification round, October 31, 2026. GAP-002's outcome is an explicit recorded scope change (shared DB), not the original literal separate-database requirement - flagged as such, not silently claimed as full compliance.
Limitations: Several numeric thresholds (indent-approval amount/category list, cost/yield variance tolerance %) remain open and must be confirmed at the specific P1-P3 GAP's implementation time before that GAP can be marked DONE; this closure only covers the POLICY DIRECTION, not every numeric parameter. GAP-003 as originally scoped (physical database split) is now explicitly superseded by the shared-DB decision above - do not reopen it without a fresh client-approved scope change.


## 7. Explicit boundaries and next action

Integration-blueprint refinement: all 42 active items now contain six project-specific fields (252 entries), with 183 existing source-path mentions validated, acyclic dependencies and matching CLAUDE active index. Synthetic example arithmetic was checked; these are future acceptance scenarios, not executed business transactions. Fresh `npm test`: 463/463 passed; application/schema/runtime files remain unchanged. No GAP is closed by this design work.

Documentation validation for this baseline: unique IDs, status/source/acceptance metadata, dependency graph/phase ordering, matching `CLAUDE.md` active index, cited code paths and all three attachments verified. `npm test`: 463/463 passed; `git diff --check`: passed. No fresh app build, new business integration run, client UAT or production deployment was performed for this documentation-only update. These checks close no functional gap.

- Current receipt/claim/payment statuses are not bank execution. Bank APIs, payroll disbursement and automatic refunds are not mandatory client-sheet scope without approval.
- A VAT summary is not statutory filing. Debit-note treatment and new immutable invoice snapshots need the client's actual approved accounting/tax requirements, not an invented GST/VAT equivalence.
- Community loyalty is a proposal in S2, not permission to select reward economics or enroll customers without consent.
- Provider/machine ingestion may be blocked by unavailable vendor interfaces. Record BLOCKED and preserve a clearly labeled manual fallback; never call it live integration.
- Historical migration/currency/security concerns outside this reviewed client-flow delta need their own source-backed assessment; this backlog is not a certificate that every other code defect is fixed.
- Next: P0 decisions recorded above (October 31, 2026) - GAP-001/GAP-002 are DONE (decision-only). P1 (GAP-003 through GAP-008) implementation has NOT been approved yet; obtain explicit go-ahead for the P1 implementation slice before writing any schema/application code. GAP-003 is superseded (shared DB decision) - do not implement physical DB separation.
