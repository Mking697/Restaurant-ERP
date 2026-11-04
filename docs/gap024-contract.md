# GAP-024 implementation contract (approved local delivery)

Owner approved preceding six-point plan, November 4, 2026. This is the historical initial local implementation contract. The owner subsequently authorized commit/push and production release of GAP-023/024; completed release evidence and current status: `docs/gap023-024-release.md`. Business scope below is unchanged.

## Behavior and bounds

- Separate persisted drafts from admitted orders. Draft create/edit/cancel changes NO stock, COGS, revenue, tickets or receipts. Optimistic positive `expectedRevision` rejects stale edits/dispatch/cancel.
- Dispatch uses existing GAP-023 createPosOrder exactly once inside `mutate` transaction. FAST_FOOD and non-dine-in must record tender/payment before admission; CONVENTIONAL DINE_IN creates OPEN and dispatches without payment. Never introduce unpaid kitchen-first Fast Food.
- Existing direct New Order/Add items/Settle APIs remain valid and cannot bypass service CLOSED/CANCELLED gates. Each admitted ticket snapshots item ID/name/quantity without money; read/reprint uses that saved snapshot, never today's catalog names/quantities. Legacy missing snapshots are disclosed, not fabricated.
- Ticket states: SENT -> PREPARING -> READY -> SERVED, actions START/READY/SERVE. No skips/backwards. Kitchen grant prepares/readies; cashier grant serves. Owner can do both. New explicit POS_KITCHEN grant does NOT imply POS_CASHIER or expose prices, tenders, customers or bill totals. Same branch and live Owner-only privacy enforced on reads/actions/replay.
- Financial status and preparation/service status stay separate. Fast Food may be PAID while preparation remains pending. Cashier may CLOSE only after full payment and every noncancelled ticket SERVED. Full settlement remains the existing GAP-023 operation; no new served-before-payment gate or payment gateway.
- Draft edits replace payload only before dispatch. Dispatched lines are immutable: extra items use existing Add items; correction/cancellation is explicit, not destructive rewriting. Manager (Owner or own-branch BRANCH_MANAGER + POS_CASHIER) may cancel an unpaid OPEN order with a reason. Mark VOIDED/CANCELLED, preserve original lines/amounts/cost/history, cancel its tickets, no restock and no automatic refund. Paid orders reject cancellation and direct to GAP-027. No partial-line financial cancellation, reservations/booking, proforma/invoice numbering, split payments or printer-device integration in GAP-024.
- Append-only lifecycle events and action receipts bind branch/entity/action/original actor/canonical payload/request key. Authorize live target BEFORE replay. Successful retries return original result before checking revision/state. Concurrent conflicting actions reject; reading/reprinting never writes or posts stock.
- All list bounds apply filters before limit and disclose limit/truncation. Lists retain unresolved overnight work. New order/draft/ticket views follow current authority, not stale client permissions.

## HTTP contract (new handlers, proposed until implemented)

All writes use `mutate`, require same origin and authenticated live authority; params are awaited per local Next docs. `requestKey` required (1-128 chars). Returns HTTP 201 for initial creates/dispatch, 200 for exact replay and other actions. Errors 400 malformed, 401 unauthenticated, 403 role/module/branch denied, 404 missing/hidden, 409 state/version/key conflict.

Draft payload = existing create-order business fields WITHOUT branchId or idempotencyKey: {channel,tableNo?,counterNo?,customerPhone?,customerName?,tenderType?,tenderCurrencyCode?,lines:[{menuItemId,qty}]}. Lines must be current sellable same-branch on save/dispatch. Tender may be omitted while drafting; dispatch validates payment-first requirements. No customer contact in QA fixtures.

- GET /api/pos/lifecycle?branchId=<optional Owner scope>&includeClosed=true|false -> {drafts: Draft[], orders: LifecycleOrder[], visibilityScope:'actual'|'access-filtered', limit:number, truncated:boolean, capabilities:{canCashier:boolean,canPrepare:boolean,canCancel:boolean}}
  POS_CASHIER required. Defaults to unresolved draft/order work; includeClosed brings historical closed/cancelled alongside bounded rows.
- POST /api/pos/drafts {branchId,payload,requestKey} -> {draft:Draft,replayed?:true}
- PATCH /api/pos/drafts/[id] {payload,expectedRevision,requestKey} -> {draft:Draft,replayed?:true}
- POST /api/pos/drafts/[id]/dispatch {expectedRevision,requestKey} -> {draft:Draft, ...existing createPosOrder result, replayed?:true}. Provider messages are not added by this endpoint.
- POST /api/pos/drafts/[id]/cancel {expectedRevision,requestKey,reason} -> {draft:Draft,replayed?:true}
- GET /api/pos/kitchen?branchId=<optional Owner scope>&station=KITCHEN|BAR|ALL&includeServed=true|false -> {tickets:Ticket[],limit:number,truncated:boolean,capabilities:{canCashier:boolean,canPrepare:boolean,canCancel:boolean}}
  POS_KITCHEN OR POS_CASHIER; kitchen-only response NEVER contains financial/customer data. Defaults unresolved SENT/PREPARING/READY. IncludeServed adds history. No price data in Ticket for any reader.
- GET /api/pos/tickets/[id] -> {ticket:Ticket}; authorized snapshot+history read only, also serves print/reprint.
- POST /api/pos/tickets/[id]/action {action:START|READY|SERVE,expectedRevision,requestKey} -> {ticket:Ticket,replayed?:true}
- POST /api/pos/orders/[id]/lifecycle {action:CLOSE|CANCEL,expectedRevision,requestKey,reason?} -> {order:LifecycleOrder,replayed?:true}

Draft = {id,branchId,status:DRAFT|DISPATCHED|CANCELLED,revision:number,payload:DraftPayload,orderId:string|null,createdAt:string,updatedAt:string}.
LifecycleOrder = {id,branchId,orderNumber,tableNo,channel,operatingConcept,status,totalAmount,serviceStatus:LEGACY|ACTIVE|CLOSED|CANCELLED,revision:number,closedAt:string|null,tickets:Ticket[],history:Event[]}.
Ticket = {id,orderId,branchId,orderNumber,tableNo,station:KITCHEN|BAR,ticketNumber,status:SENT|PREPARING|READY|SERVED|CANCELLED,revision:number,createdAt:string,lines:[{orderLineId?,menuItemId,name,qty}],snapshotAvailable:boolean,history:Event[],allowedActions:('START'|'READY'|'SERVE')[]}.
Event = {id,action,actorId,createdAt,revision,reason?,fromStatus?,toStatus?}; returned DTOs must not include stored request/response JSON, customer data or financial fields in ticket history.

## Ownership

- Backend agent: src/db/schema/pos.ts, NEW src/db/schema/pos-lifecycle.ts, src/db/schema/index.ts, src/lib/server/pos-orders.ts, NEW src/lib/server/pos-lifecycle.ts and optional pure policy, NEW API route paths listed above, NEW tests/gap024-policy.test.cjs and tests/gap024-service.test.cjs. No migrations/docs/front-end/tooling.
- POS agent: src/app/pos/page-content.tsx, NEW src/app/pos/lifecycle-panel.tsx, NEW tests/gap024-ui.test.cjs. Expose Draft/Table/Ticket lifecycle beside existing flow, without breaking old POS unknown-outcome/privacy tests. Import shared PosTicketPreview below. No backend/schema/kitchen/navigation/docs.
- Kitchen UI agent: NEW src/app/kitchen/page.tsx, page-content.tsx, NEW src/components/pos-ticket-preview.tsx, NEW tests/gap024-kitchen-ui.test.cjs. `PosTicketPreview({ticketId:string|null,onClose:()=>void})` named export loads authorized GET ticket, shows snapshot/history and print-only ticket contents. Parent owns grants/nav/page-access.
- Parent: moduleAccess, nav, app-shell/page-access/guide mappings, tracking/docs, isolated infrastructure, migration generation, integration/browser tests and final whole-tree gates.

All writers: strict TDD RED -> GREEN; no git stash/reset/checkout/clean/pull, commit/push/deploy, dependency/node_modules changes, secrets/env reads, production connections, or generated migration writes. Preserve preexisting uncommitted GAP-023 work. Import/export contracts above stay stable or report a necessary change to parent immediately.
