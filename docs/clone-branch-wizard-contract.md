# UX-1c — Clone Branch Wizard

Local scope: implement the real multi-step Clone Branch Wizard the Branches
screen has stubbed as a disabled "Clone unavailable" button since Phase 4.
Schema already carries `branches.isTemplate`/`clonedFromId` for exactly this
purpose (see `src/db/schema/platform.ts` comment). No schema change, no
production/dependency/commit/push. Preserve all previously accepted
uncommitted work (TASKS-1, UX-1a, UX-1b).

## What clone means here

Owner-only. Create a new branch row (own code/name/address/geofence, not
copied) and, inside the SAME `mutate()` transaction, copy from one existing
source branch:
- `menuItems` rows for that branch → new rows under the new branch id, same
  name/price/outputUnit/active flag, new ids.
- `bomRecipes` rows for those menu items (and any Semi-FG component recipes)
  → copied with `lockedByHq` preserved from source (never invent HQ lock
  state). Preserve recipe correctness: component references must point at
  the NEW branch's copied raw-material/Semi-FG rows where the source
  component is itself branch-scoped, not at the source branch's rows.
- `checklistTemplates` rows scoped to the source branch (`branchId` not
  null) → copied under the new branch id with the same step chain/
  `nextStepMap`; global templates (`branchId` null) are not touched/copied
  (they already apply to every branch).
- Explicitly NOT copied: inventory stock/levels, vendor rates, users,
  recurring task definitions/instances, POS orders, any transactional/
  historical data. State this in the wizard's own copy, don't let a user
  assume otherwise.

## API contract

- `POST /api/branches/clone` — Owner-only, explicit `{sourceBranchId, code,
  name, address, lat, lng, geofenceRadiusM}` (reuse the existing branch-
  creation validators for the new branch's own fields). 404 if
  `sourceBranchId` doesn't exist. 409 on duplicate `code` (existing unique
  constraint). Sets `isTemplate:false`, `clonedFromId: sourceBranchId` on
  the new row (do not require the source to be `isTemplate:true` — any
  existing branch may be cloned from, matching the real intended usage).
  Entirely inside the existing `mutate()` lock; a mid-copy failure rolls
  back the whole thing — no new branch with zero/partial copied data.
- Response: `{branch, copied: {menuItems, bomRecipes, checklistTemplates}}`
  counts only, no business-sensitive content beyond what Branches/Menu
  already expose to an Owner.

## UI contract

- Replace the disabled "Clone unavailable" button with a real "Clone
  Branch" action (Owner-only, same gate as "New Branch"). Dialog: pick an
  existing source branch (any branch, not just templates), enter the new
  branch's own code/name/address/geofence fields (same validation as New
  Branch). Submit → real POST → new row appears in the table on success
  with a toast naming the copied counts. Explicit copy-scope note in the
  dialog (what is/isn't copied, per the list above) in English + Hinglish.
- Update the page header's existing "Cloning is not implemented…" sentence
  to describe the real behavior once built.

## Acceptance

TDD RED→GREEN for the new server helper/route/UI. Cover: successful clone
with correct copied counts and correctly rewired component references;
missing/foreign source branch 404; duplicate code 409 with no partial
writes (verify via rollback test); non-Owner denied; HQ-locked recipe lock
state preserved; global (branchId-null) checklist templates NOT duplicated;
nested Semi-FG recipe component rewiring. Guarded real HTTP/Postgres
integration harness (own disposable QA DB, explicit BASE_URL/PG* — no
dotenv default) parent executes: real clone via HTTP, exact row-count
readback in Postgres for all three copied tables, rollback-on-duplicate-
code proof, no inventory/user/recurring-task rows created. Parent gates:
full unit suite, typecheck, isolated build, real HTTP/PG dev+compiled,
browser clone→reload→verify-in-Menu walkthrough, guide/standalone-HTML
parity, independent scoped review. This is a single bounded UX-1c slice —
exhaustive device/pixel QA across the rest of the app remains separate.
