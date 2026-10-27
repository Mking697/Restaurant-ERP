# Owner-only operational sales visibility

## Approved scope

This is access control, not deletion or altered accounting. Only SUPER_ADMIN may mark an existing order Owner-only or restore it. Actual sale, invoice/tax values, inventory deductions, shift receipts and cash reconciliation remain unchanged.

## Server contract

- `pos_orders.owner_only` defaults false for all legacy/new rows (migration 0009). No business data backfill or grant assignment.
- PATCH `/api/pos/orders/[id]/visibility`: Owner role required inside the live authenticated mutation lock; body has only `{ownerOnly: boolean, reason: string}` with a trimmed 3–500 character reason. Desired-state change and append-only `POS_ORDER_VISIBILITY_CHANGED` audit entry commit atomically. A repeated identical desired state returns `changed:false` without a duplicate audit event. No sale amount/status can be modified through this endpoint.
- GET `/api/pos/orders`: Owner sees actual rows and actual/visible/private completed-sales totals. Every non-Owner—including a Branch Admin or official-accounting reader—gets only non-private rows and `visibleTotal`, labelled `access-filtered`. Filters execute in SQL before pagination. Rows are capped at 200 latest, totals include all completed sales in the existing daily/branch scope. Both reads share the mutation lock for consistent results.
- No non-Owner query parameter, module grant or role-like JSON value bypasses the operational visibility policy.
- POS creation rejects injected ownerOnly/owner_only/visibility keys. Cashiers cannot create private sales. Owner changes privacy separately with a reason.
- WhatsApp offer preview AND audience selection exclude private-only order contacts for non-Owners. Customer receipts already sent at sale time remain real and are not revoked.
- Official GSTR export includes ALL eligible orders, including Owner-only orders. New explicit `OFFICIAL_SALES_REPORTS` access replaces POS-only access to that unfiltered Accounts tab/API. Owner bypass remains; other users need deliberate grant assignment. No existing account automatically gains that grant.
- Shift closing and handover use actual physical custody and every real receipt, not the operational visibility filter. Those authorized operational totals may reveal actual aggregate custody; secrecy from cash custodians is NOT promised.

## Limits

- Already viewed orders, browser memory, downloaded files, screenshots, printed invoices and sent messages cannot be recalled. Privacy applies to subsequent authorized server reads; it is not remote deletion of previously disclosed data.
- Existing dashboards/reports/MIS still use explicitly labelled sample data, not live POS sales. They must not be presented as privacy-aware live financial reports. Future live consumers must deliberately choose operational filtering or authorized official accounting, never an unguarded raw order query.
- No false official totals, missing GST sale, altered stock movement, private tax ledger or fake cash reconciliation.
- Current POS listing scope remains today's orders; the mutation endpoint can address an existing ID but this stage does not add a historical order-search page.
- Local work only. No commit, push, production migration or deployment without separate approval. 0009 is applied to the disposable QA database only at this checkpoint; main local DB still requires an explicit local migration before running this new source against it.

## Verification

Parent verified 148/148 unit/regression checks, full TypeScript and production build. Privacy HTTP/Postgres suite 12/12 passed on both dev and freshly built app; existing shift24/Semi-FG9/POS21/BOM17 suites also pass (83 checks total across the five suites). Tests prove atomic audit rollback, concurrent idempotent toggle, ₹1000 actual vs ₹500 visible, unchanged inventory/tax/invoices, actual cash closing and separate official GST authorization. Guide/offline parity passes. Exact QA fixtures, temporary audit trigger, sessions and own servers/dist were cleaned.

Read-only real browser screenshots confirm Owner totals1000/500/500 and staff-only visible500 at 390px with no overflow/private row. Full dialog interaction is not browser-accepted because Jev action selection returned no_key; eight UI regression tests cover confirm/reason/unknown-ack/reload/restore behavior instead. Subsequent browser navigation was unstable. Do not claim full interactive multi-device acceptance or deployment.

A pre-existing POS-only cashier billing menu denial discovered during QA was fixed narrowly: GET permits own-branch active sellable menu items with POS_CASHIER, while menu mutation still requires MENU_BOM. RED403 and GREEN read/denied-write HTTP checks were executed. Main local database has not received0009; production is untouched.
