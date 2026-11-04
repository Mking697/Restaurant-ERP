# GAP-025 — proposed proforma and final document slice

Planning started November 4, 2026 after the authorized production release of GAP-023/024. Owner approved implementation and subsequently explicitly selected commit/push, production migration and deploy in the release confirmation. Status: DONE for the approved internal-document scope: both review blockers fixed/re-reviewed, current-artifact gates passed, production migration applied/read back, feature pushed and exact-SHA Vercel alias plus authenticated read-only smoke verified. Scope: `docs/gap025-contract.md`; evidence: `docs/gap025-verification.md` and `docs/gap025-release.md`. Fiscal compliance and physical printer delivery remain explicitly outside scope.

## Current code inspected

- `src/db/schema/pos.ts`: orders preserve financial totals, tender FX and operational identity; lines preserve quantity/price/effective VAT rate. `pos_receipts` currently stores a receipt identity, not a complete issued document.
- `src/lib/server/pos-orders.ts`: `bill`, `receipt`, `createPosOrder`, `addPosOrderLines`, `settlePosOrder` already calculate totals and admit each stock/payment event once. Saved action responses preserve receipts for exact replay, but are not a general invoice reader. Ticket snapshots preserve original dish name/quantity for kitchen printing, not full fiscal identity.
- `src/lib/server/vat.ts`: existing fixed-point rate calculation can be reused without changing the approved configured tax policy.
- `src/lib/server/branding.ts` and restaurant settings currently cover name/logo only; there is no inspected seller TIN/VRN/fiscal registration model or TRA/EFD integration. Do not invent these values or claim statutory compliance.
- `src/app/pos/page-content.tsx`, lifecycle panel and ticket preview supply the existing cashier scope, replay lock and protected print pattern. New invoice views must remain separate from price-free kitchen tickets.

## Proposed behavior for approval

1. Proforma is an immutable, clearly labelled estimate/payment request linked to the draft/order and exact source revision. Issuing or reprinting it posts no stock, COGS, revenue or payment. Editing the source does not rewrite an already-issued proforma; a replacement preserves the prior history.
2. Final sales document is created exactly once with the existing full payment event: immediately for Fast Food/non-dine-in, at settlement for Conventional dine-in. It links the order, receipt and applicable proforma. It does not introduce a new payment/stock event or change the approved sequencing.
3. Issued header/lines snapshot item name, product code, quantity, unit price, effective tax rate/breakdown, amounts, currency/rate, seller identity and document timestamps. Later catalog, branding or tax-setting changes cannot alter a reprint. Never reconstruct unknown historical names/tax identity as if they were issued facts.
4. Separate durable proforma and final numbering, branch-labelled with Tanzania EAT year, reserved server-side and never reused for an issued/cancelled document. Proposed display: `PF-{branch}-{year}-{sequence}` and `INV-{branch}-{year}-{sequence}`. Exact replay returns the same number/document; concurrent finalization has one winner. Prefix/reset policy requires owner confirmation before schema/numbering is finalized.
5. POS offers view/print/reprint and order-to-document history under existing cashier/branch/privacy authority. Kitchen tickets stay price-free and POS_KITCHEN does not grant invoice access. Missing legacy snapshots are labelled unavailable; no automatic mass conversion or historical accounting rewrite.
6. Reuse current configured VAT calculation; no new tax rates, automatic refund, split payment, fiscal-device submission or provider messaging. Seller registration fields may be added as Owner-maintained data, but missing/unknown legal details cannot be fabricated. Until the owner's approved legal document details/integration are supplied, do not market the output as a TRA/EFD-compliant fiscal receipt.

## Proposed implementation seam (not existing code)

- Add immutable POS document headers/lines and source/receipt links, transaction-safe document numbering and exact action receipts. Parent-owned additive migration after live lineage/watermark preflight.
- Integrate final issue inside existing create/settlement transaction; proforma issue/read endpoints are separately authorized. Read/reprint is read-only. Avoid summing the invoice and existing order/receipt as two sales.
- Audit/report consumers use issued snapshots for new documents, with explicit legacy fallback/unavailable coverage. Operational privacy and official exports retain their separately approved access boundaries.

## Required acceptance

Issue/reprint after name/price/tax/seller changes; stale source revision; unauthorized/private/cross-branch reads and replay; same-key concurrent issue; different-target/key conflicts; unknown acknowledgment/rejected replay/exact resolution; one document/receipt/stock event; legacy unknown evidence; EAT year boundary and permanent number retention. Run DB-free tests, TypeScript/build, fresh/legacy/no-op migration, compiled HTTP/PostgreSQL and actual browser print/readback. Production release remains a separate approved gate.

## Confirmation needed

Confirm this scope and proposed numbering. Supply/confirm seller legal name/address and any actual TIN/VRN/fiscal-provider requirements before claiming an official tax document; otherwise keep the first slice explicitly an internal sales document with no statutory-compliance claim. Existing rates and payment/stock sequencing stay unchanged.
