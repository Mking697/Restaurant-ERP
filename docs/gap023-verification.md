# GAP-023 — local acceptance evidence

Date: November 3, 2026
Status: VERIFIED_LOCAL, not production-released
Baseline: main `6a6a5be`; feature changes remain uncommitted.
Final exercised Next production build ID: `D-m5LUIHUaRsdHuAn_uJ_`.

## Approved delivery contract

The owner explicitly approved continuing the current branch-wise sequencing for now:

- FAST_FOOD and non-dine-in channels: record payment, post stock/cost, production tickets and receipt atomically.
- CONVENTIONAL DINE_IN: create an OPEN table order, post its stock/cost and dispatch Kitchen KOT / Bar BOT before payment. Additional lines make additional tickets and post only their stock/cost. Full settlement creates one receipt and PAID status without consuming stock or recalculating dispatch cost again.
- Only Owner changes branch concept. Existing branches default FAST_FOOD. Existing orders retain their admitted concept, even after the branch setting changes.
- One shared database with branch isolation remains the approved architecture. A future Fast Food sequencing change requires a separate reviewed change; no runtime payment-order switch is claimed.

This later approval supersedes the older same-sequence policy for this delivery. It does not authorize commit/push, production migration, deployment or real provider sends.

## Implemented paths

- Schema: `src/db/schema/platform.ts`, `menu.ts`, `pos.ts`; additive migration `drizzle/0038_mysterious_rage.sql`, matching snapshot and journal.
- Domain: `src/lib/server/pos-order-policy.ts`, `pos-orders.ts`; per-dispatch dedupe threaded through `production.ts` and `stock-ledger.ts`.
- Routes: existing `/api/pos/orders`, new `/api/pos/orders/[id]/lines` and `/settle`; existing authenticated transactional mutation transport retained.
- UI: `/pos`, branch administration, Menu/BOM station selection, branch-clone station preservation.
- Reporting: shared `pos-reporting.ts` settlement-time expression consumed by POS totals, dashboard, P&L, food-cost data, sales trend, VAT and daily summary.
- Bilingual Guide and offline guide/process-map artifacts describe the local flow and unreleased boundary.

## Correctness and safety fixes

- Replay keys bind to action, original actor, exact canonical payload and target order. Status-changing replay works after settlement, but a different order/payload cannot reuse the key.
- Live module/branch authority and current Owner-only visibility are checked before cached replay or mutation. A cashier cannot replay a once-visible order after Owner hides it.
- COGS is captured at each dispatch; later recipe/rate changes cannot reprice already-dispatched items. Incomplete cost remains incomplete. Money accumulation uses fixed-point integers.
- Settlement credits the currently operable collection shift. Configured shifts and pending handovers remain server-enforced.
- Added dispatches retain the order as `source_id` while using a separate dispatch identity for ledger deduplication. The real HTTP test caught the original bug: aggregate/lots decreased while the ledger skipped a later dispatch of the same material. The fixed path reconciles all three.
- Overnight OPEN tables remain listed, ahead of paid rows within the disclosed 200-row bound. Paid totals use the full scope, not the displayed subset. PAID reporting uses settlement time with a timestamp-less legacy fallback; COMPLETED retains its historical creation date. Tanzania business-day boundaries are used; there is no historical backfill.
- UI actions follow the order snapshot and require its explicit branch context. Receipts and new KOT/BOT results remain visible outside closed dialogs. Unknown outcomes freeze editable intent and allow only exact replay. Settlement text explicitly says no additional stock deduction, not that the recipe was absent.

## Executed verification

### DB-free and build gates

- Full `node --test tests/*.test.cjs`: 550 passed, 0 failed, 0 skipped. Equivalent configured gate: `npm test`.
- `tsc --noEmit --incremental false`: passed, including after restoring normal Next generated configuration.
- Actual `next build`: passed. The final production artifact was started and exercised, not an older running build.
- `drizzle-kit check`: passed. Repeated generate: no residual schema changes.
- `git diff --check`: passed.
- No lint script exists in package.json; lint is not claimed.

Commands used the installed `C:/Program Files/nodejs/node.exe` directly after a Git Bash launcher returned `stdin is not a tty` in one parallel invocation. No dependency replacement or new lint toolchain was installed.

### Real PostgreSQL migration acceptance

Dedicated PostgreSQL 17 container, host `127.0.0.1:5440`, database `restaurant_erp_gap023_qa_20261103` only. `tests/gap023-migration.integration.cjs` proved:

- Ordered 38-migration baseline hashes/timestamps, then the current full chain.
- Legacy COMPLETED/VOIDED identity, amount, COGS and timestamp preservation across two branches.
- FAST_FOOD/KITCHEN additive defaults; legacy VAT/posting timestamps remain unknown rather than invented.
- No fabricated attempts, tickets or receipts for old rows.
- New OPEN/PAID writes after migration commit, migration no-op replay, and a separate fresh 87-table install.

A first unapplied candidate genuinely failed with PostgreSQL 55P04: it set a new PAID enum default before the transaction committed. Only that unapplied candidate was removed/regenerated. The final migration preserves the legacy COMPLETED direct-insert default; explicit lifecycle writers choose OPEN/PAID after commit. The prior applied migration chain was not rewritten.

Production ordered hashes and migration watermark have NOT been re-read in this session. That remains a required release preflight, not something established by local replay.

### Real HTTP + database acceptance

`tests/gap023.integration.cjs` against the final compiled server at `http://localhost:3123`: 275/275 assertions passed; scoped FK-aware fixture cleanup passed with exit 0.

Coverage includes branch defaults/Owner-only setting changes, payment-first matrix, separate KOT/BOT routing, auth/module/branch/hidden-order denials, payload/actor/order replay conflicts, concurrent create/add/settle, insufficient and expired stock full rollback, exact original-plus-added ledger consumption, dispatch COGS despite changed BOM/rates, receipt uniqueness, settling-shift collection and handover gate, legacy/overnight paid reporting, and concept changes with existing OPEN orders. All fixture orders omit customer phones. No provider send was used for acceptance.

The harness initially exposed two test-infrastructure issues (reserved SQL alias `month`, and pg `name[]` decoding in generic cleanup). These were corrected without weakening business assertions. The final run includes real scoped cleanup, not just a passing assertion count before teardown.

### Real browser + SQL readback

Owned isolated browser and synthetic QA Owner; no real account credentials or customer data were used. Jev returned `no_key`; interactions used the observed local controls without sending payment information or session credentials to it.

- Fast Food New Order immediately displayed KOT, receipt and PAID state for TSh100.
- Conventional New Order displayed Kitchen KOT and Bar BOT while OPEN, with no paid receipt. Adding items displayed a fresh ticket and changed only the added stock/cost.
- A deliberately lost settlement acknowledgment was injected AFTER the real response. The dialog stayed open, tender controls/Cancel stayed locked, and Escape did not dismiss uncertain intent. Exact replay closed it and displayed the saved receipt.
- Repeated the Conventional order/add-Bar/unknown-settlement/replay flow on the final build. The receipt remained visible and correctly explained that stock was already posted.
- Direct PostgreSQL readback verified one receipt per order and one settlement event per Conventional order, despite lost acknowledgments. Browser sale totals were 250.00, 100.00 and 150.00; saved COGS 60.00, 25.00 and 35.00 matched their stock ledger. Dedicated branch balances 9.050 and 9.750 matched both lot balances and opening-plus-ledger arithmetic.

Permanent non-secret artifacts: `docs/gap023-evidence/` contains full unit/HTTP/build logs, browser readback JSON and four screenshots (added BOT, uncertain settlement, final receipt, Fast Food PAID).

## Cleanup and remaining release gate

- Dedicated QA server stopped; port 3123 confirmed closed.
- Dedicated GAP-023 container and its exact anonymous data volume removed. Docker mount/unmount events tied that volume to the recorded GAP-023 container before removal; unrelated containers/volumes were left intact.
- Fresh-install proof database was dropped. Removing the dedicated volume also removes all kept/failed-run/browser fixture databases and sessions.
- Browser QA cookie cleared, isolated `.next-gap023-qa` removed, and `tsconfig.json` / `next-env.d.ts` restored with no git diff.
- No commit, push, production database write, deploy or real provider message occurred.

GAP-023 stays active as VERIFIED_LOCAL until an authorized release plus exact production revision/migration/readback and safe smoke evidence. P4 follow-ups remain separate: GAP-024 fuller preparation/table lifecycle and cancellation; GAP-025 immutable final/proforma invoice/reprint identity; GAP-026 partial/split payment allocation; subsequent manager void, visual menu, tokens and real provider work. No kitchen device/printer integration or actual card/mobile-money gateway execution is implied by recording a tender. Current legacy platform labels are manual labels, not Tanzania provider integrations.
