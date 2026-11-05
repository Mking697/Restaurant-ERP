# GAP-028 — local implementation verification

Status: VERIFIED_LOCAL. Owner-confirmed scope: (1) photo upload stays MENU_BOM-only, same access as existing Menu & BOM edit; (2) touch-tile grid ships on the POS "New Order" screen first, not the add-items-to-open-table flow. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## What was implemented

- Schema: additive `menu_items.image_url` (text, nullable) and `image_updated_at` (timestamptz, nullable). Migration `drizzle/0043_gap028_menu_item_images.sql`. Null means "no photo yet" — never a fabricated placeholder URL.
- Storage: `src/lib/server/menu-images.ts`. A dish photo is a decorative, customer-visible asset (unlike purchase/task evidence), so it uploads to a PUBLIC Vercel Blob store — no signed-URL machinery needed, same `@vercel/blob` package already used elsewhere in the app. Upload validates real signature bytes + decode (PNG/JPEG/WebP only, rejects animated PNG, oversized pixels, truncated/mismatched files, >8 MB), then resizes/recompresses to a bounded 640x640 JPEG so every POS tile loads a small, consistent thumbnail regardless of the original photo's size — same approach as the existing branding-logo normalizer.
- API: `POST/DELETE /api/menu-items/[id]/image`. MENU_BOM-only (same module gate as every other menu/recipe write), same-branch scoped, same-origin checked. POST replaces (and best-effort deletes) any prior photo; if the DB write fails after the blob already landed, the orphaned blob is cleaned up so nothing dangles. `GET /api/menu-items` now returns `imageUrl` for every item.
- UI (Menu & BOM): a "Dish photo" upload control on the existing item-edit panel (MENU_BOM-gated, same as the rest of that page) — shows the current photo or a placeholder, lets the user upload a replacement or remove it, with real error surfacing on a rejected/oversized file.
- UI (POS New Order): new `MenuTilePicker` — search box, category chips, and a responsive tile grid (photo or a placeholder icon, name, price, qty +/− stepper). An item that is inactive or not sellable renders visibly disabled with no add control. A "Switch to list view" toggle falls back to the original dropdown-based line editor (unchanged), so no existing workflow is removed.

## Verification performed

- Full suite: 671/671 passing (added `gap028-service.test.cjs` — 3 tests covering real PNG/JPEG/WebP normalization and real rejection of empty/oversized/non-image/animated-PNG/truncated bytes — and `gap028-ui.test.cjs` — 4 tests covering tile image/placeholder rendering, category/search filtering, unavailable-item disabling, and add/increment/decrement-to-remove via the real component's `setLines` callback, using a minimal React-hooks shim against the actual `.tsx` source, no mocks of the logic under test).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; `/pos`, `/menu`, and `/api/menu-items/[id]/image` all compiled.
- Migration 0043: fresh apply (43 → 44 migrations) and no-op re-apply (44 → 44, no error) verified against a disposable local Postgres container (`restaurant-gap028-qa`, stopped and removed after use), confirming `image_url`/`image_updated_at` land on `menu_items` exactly as declared.

## Explicit limits

Touch-tile picker ships on the New Order screen only — adding items to an already-open table still uses the existing dropdown flow (owner-confirmed scope, to extend in a later pass if wanted). No bulk/CSV image import, no barcode/QR scanning, no customer-facing kiosk view. No production schema, commit/push, or deployment — batched with future gaps.
