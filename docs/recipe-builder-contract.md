# Recipe Builder + real Semi-FG stock

Scope approved: single-screen dish + multiple ingredients, saved recipe edit, explicit units/yield, stock preview, real Semi-FG production then direct stock consumption at sale. English default with Hinglish alternative. Local QA first; no production migration/deployment authorized in this stage.

## API/data contract
- `menu_items.output_unit` default `portion`; existing recipes remain per one output unit. User enters batch yield in builder; client normalizes component quantities to one output unit, rejecting unrepresentable quantities rather than silently rounding to zero.
- POST `/api/menu-items`: existing metadata plus outputUnit and optional components array. If components is present it must contain 1–50 valid distinct rows, validated and inserted in the same transaction as item. Legacy metadata-only create remains supported but an empty recipe cannot sell/produce.
- PUT `/api/bom-recipes`: `{branchId,menuItemId,components:[...]}` replaces the entire recipe atomically. Same shape as existing component POST minus parent IDs. Preserve unchanged HQ-locked rows for branch authors; deny locked modification/removal. Reject cross-branch/inactive/non-SemiFG links, duplicates and cycles.
- qtyPerUnit is the component inventory-unit quantity consumed per ONE parent output unit. Raw material unit comes from raw master. SemiFG unit comes from its outputUnit; no arbitrary unit substitution.
- GET explode retains theoretical raw requirements and vendor-rate estimate for comparison; adds direct `consumption` with type,id,name,unit,required,available,shortage. These direct components, not recursively expanded raw ingredients, are actually consumed. Missing vendor rates => cost unavailable, not fabricated zero. Never call preview a reservation.
- POST `/api/semi-fg/production`: `{branchId,menuItemId,quantity,idempotencyKey}`. Direct raw and already-produced nested SemiFG stock consumed, target prepared stock credited atomically; no recursive raw fallback. Immutable production snapshots and idempotency key prevent duplicate stock posting. This first stage records recipe-standard production quantity, not yield-variance/wastage/expiry-lot accounting.
- GET same endpoint returns branch-scoped stock and recent production history; response loss must be reconciled with history/idempotent retry.
- POS: direct RAW + prepared SemiFG stock only. No recipe means blocked sale. Never consume SemiFG and its raw ingredients twice. No stock deduction on recipe save/preview.

## Safety/acceptance
Authenticated live identity + MENU_BOM (POS_CASHIER for orders), server branch checks, CSRF, existing global auth transaction lock plus shared recipe-stock branch lock, atomic shortage rollback and concurrency protection. No changes to provider settings/tax/financial ledger. No mock cost blending.

Execute focused unit + HTTP/Postgres tests with isolated loopback DB; cover atomic create/replacement rollback, multi-row persistence, HQ locks, two branches, cycles, unit quantities, production replay/payload mismatch, simultaneous stock shortage, nested stock, POS no double deduction, zero-stock denial and history. Browser create + edit + preview + produce + sell + reload on desktop and phone. Run project tests/typecheck/build without concurrent dev/build .next collision. Sync in-app/offline guide only with honest implementation/verification status. Commit/push/deploy require separate user instruction.
