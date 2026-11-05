# GAP-038 — local implementation verification

Status: VERIFIED_LOCAL. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## Owner decisions (this session)

- Membership identity scope: GLOBAL — one shared identity across every branch and operating concept (FAST_FOOD + CONVENTIONAL), not a per-branch record. A normal loyalty-program model, not a branch-siloed one.
- Edit/merge authority: a Branch Manager may edit/merge only members THEIR branch originally registered (`createdBranchId`); the Owner (SUPER_ADMIN) may edit/merge any member. Read/search is NOT scoped this way — any `POS_CASHIER`-module staff may search/find any ACTIVE member globally (consistent with membership being shared).

## What was implemented

- Schema: new `customers` table (migration `drizzle/0049_gap038_customers_registry.sql`) — `phone` (normalized bare 9-digit Tanzanian mobile, UNIQUE — the stable identity key), `name`, `createdBranchId`/`createdBy` (provenance only, not a lookup scope), `status` (ACTIVE/MERGED), `mergedIntoId` (set only once merged). Added to the `src/db/schema/index.ts` barrel so the existing schema-driven `discoverBranchDependencies` (branch-deletion safety check) automatically picked up `createdBranchId` with zero hand-maintained list — proven by the pre-existing `branch-deletion.test.cjs` test passing once the export was added.
- `src/lib/server/customers.ts`:
  - `findOrCreateCustomer`: idempotent find-or-create by normalized phone. Two concurrent registrations using equivalent phone variants (e.g. `712345678` vs `0712345678`, both normalize identically) resolve to ONE row — first via a read-before-insert check, and for a genuine race (both requests pass the read before either inserts) the database's own unique index raises `23505`, which is caught and turned into a re-read returning the winning row, never a raw duplicate-key error surfaced to the caller.
  - `searchCustomers`: global, read-only, phone (`like`) or name (`ilike`) search, excluding MERGED records (their surviving record is what should be found).
  - `getCustomerWithConsent`: single-record read with a live `whatsappOptedOut` flag joined from the EXISTING GAP-037 `whatsapp_opt_outs` table by phone — consent/opt-out is read from that one source of truth, never duplicated into this table.
  - `updateCustomerName`: name-only edit (phone is the identity key and is deliberately never changed via a simple edit — a real phone change is a new-registration-plus-merge, not a field update). Branch Manager (own `createdBranchId` only) or Owner; rejects editing an already-MERGED record.
  - `mergeCustomers`: folds one record INTO another — rejects merging into itself, merging an already-MERGED record, or merging INTO an already-merged record; checks edit authority on BOTH sides (a Branch Manager can only merge records they themselves may edit on both ends — a cross-branch merge is Owner-only).
- API: `GET/POST /api/customers` (search / idempotent register), `GET/PATCH /api/customers/[id]` (detail with consent / name edit), `POST /api/customers/[id]/merge`.
- `src/lib/server/whatsapp-triggers.ts` gained `requiredPhone` (throws on empty, unlike the existing `validOptionalPhone` which allows empty for the optional POS order-capture case) — membership registration requires a real phone since it is the unique identity key.

## Verification performed

- Full suite: 711/711 passing (added `gap038-service.test.cjs` — 5 tests: repeat-phone registration resolves to the same member across different phone-variant spellings and different registering branches; a genuine insert race (23505) is survived by re-reading instead of erroring; a plain name edit is rejected for a different branch's Manager and for a cashier, and allowed for the registering Manager and the Owner; merge rejects self-merge, double-merge, and merge-into-an-already-merged-record; and merge requires edit authority on BOTH sides, with a cross-branch merge Owner-only — and 2 new cases in `whatsapp-triggers.test.cjs` for `requiredPhone`).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/api/customers`, `/api/customers/[id]`, `/api/customers/[id]/merge` all compiled.
- Migration 0049: fresh apply (49 → 50) and no-op re-apply (50 → 50, no error) verified against a disposable local Postgres container (`restaurant-gap038-qa`, stopped and removed after use); the UNIQUE phone constraint was directly exercised with a real duplicate `INSERT` (genuinely rejected by Postgres, not just application code).
- `searchCustomers`'s real SQL (`like`/`ilike`, which no in-process mock can faithfully emulate) was smoke-tested against that same live container via a throwaway script (`scripts/gap038-real-db-smoke.ts`, removed after use) — confirmed a phone-substring search, a name search, and a no-match search all return the correct rows/empty result.

## Explicit limits (consistent with the acceptance's own scope)

No POS/order-time integration yet (no "select a member" UI at checkout, no linking of `posOrders` rows to a `customers.id`) — `posOrders.customerName`/`customerPhone` remain the unchanged plain-text historical snapshot this codebase already had; nothing here retroactively touches past orders. No reward/loyalty ledger (that is GAP-039's separate, still-PENDING scope). No admin UI page for the registry yet — this pass is the registry + its API only; a staff-facing screen (search/register/merge) is a follow-on, not required by this gap's written acceptance. No production migration, commit/push, or deployment — batched with future gaps.
