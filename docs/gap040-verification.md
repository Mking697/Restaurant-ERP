# GAP-040 — local implementation verification

Status: VERIFIED_LOCAL. No commit/push, production migration or deployment at this checkpoint — batched with future gaps per the owner's standing instruction.

## Scoping decision (hardware, made explicit per the acceptance's own instruction to "define supported scanner/camera hardware")

No QR/camera library existed in this project (`package.json` had none). Rather than guessing at a browser camera-decoding stack, this pass assumes the standard, cheap, zero-browser-API hardware model: a USB/Bluetooth HID barcode/QR scanner that decodes the code and types it into whatever text input currently has focus — exactly like a keyboard. This needs no camera permission, no client-side QR-decoding library, and works identically across devices; it is overwhelmingly the common hardware for small retail counters. `lookupMemberByQrToken`'s input is therefore just "the decoded text," with a manual-typing fallback that is structurally the exact same code path (there is no separate "camera mode"). A phone-camera/photo-based scanning mode is explicitly NOT built this pass — flagged as a limit below, not silently assumed.

For QR **generation** (producing the actual scannable image for a membership card/receipt), the `qrcode` npm package was added (`npm install qrcode @types/qrcode` — a small, standard, MIT-licensed encoder with no native/camera dependencies; `npm audit` showed only the pre-existing, unrelated `drizzle-kit`/esbuild dev-only advisory, nothing introduced by this package).

## What was implemented

- Schema: new `customer_qr_tokens` table (migration `drizzle/0051_gap040_customer_qr_tokens.sql`) — `tokenHash` (sha256 of the raw token, same convention as `src/lib/server/auth.ts`'s own session `tokenHash`; UNIQUE), `status` (ACTIVE/REVOKED), a **partial unique index on `customerId` WHERE `status = 'ACTIVE'`** enforcing at most one active token per customer at the database layer itself (not just application code), `issuedBy`/`revokedBy` for audit.
- `src/lib/server/customer-qr.ts`:
  - `issueMemberQrToken`: generates a random opaque token (`crypto.randomBytes(24)`, base64url — carries no decodable meaning, is NOT derived from phone/name/id), hashes it for storage, implicitly revokes any previous ACTIVE token for the same customer first (so re-issuing is how a lost/leaked code gets invalidated), and renders a QR PNG data URL via `qrcode`. The raw token is returned to the caller exactly once in this response and is never persisted or retrievable again.
  - `revokeMemberQrToken`: explicit revoke-without-replacement; idempotent no-op when nothing is currently active.
  - `lookupMemberByQrToken`: resolves a scanned/typed raw token to the member's identity — an unknown token and a revoked token return the IDENTICAL generic 404 message, so a scanner (or anyone probing the endpoint) can never distinguish "never existed" from "was valid once." This function does **not** itself authorize a reward redemption or any other high-value action — it is exactly equivalent to a staff member typing the customer's phone number into the GAP-038 search box; any real action taken next (e.g. GAP-039's `redeemPoints`) still runs its own independent authorization check.
  - Both issue and revoke reuse GAP-038's own `assertEditAuthority` (now exported) — the same authority bar as a name edit or a merge (registering Branch Manager or Owner).
- API: `POST /api/customers/[id]/qr/issue`, `POST /api/customers/[id]/qr/revoke` (both Branch Manager/Owner, enforced inside the service), `POST /api/customers/qr/lookup` (any POS_CASHIER-module staff, body `{ token }`).

## Verification performed

- Full suite: 724/724 passing (added `gap040-service.test.cjs` — 6 tests: the issued raw token contains none of the customer's phone/name/id and only its hash is ever persisted; re-issuing revokes the previous token so it no longer resolves while the new one does, with exactly one ACTIVE row surviving; issuance/revocation is rejected for a different branch's Manager and allowed for the registering Manager and the Owner; an unknown token and a revoked token produce byte-identical error messages; revoke is a safe idempotent no-op; and empty/whitespace input is rejected cleanly rather than crashing).
- TypeScript: `tsc --noEmit` clean.
- Production build: `next build` succeeded; all 3 new routes compiled.
- Migration 0051: fresh apply (51 → 52) and no-op re-apply (52 → 52, no error) verified against a disposable local Postgres container (`restaurant-gap040-qa`, stopped and removed after use). BOTH the `token_hash` uniqueness and the partial "one ACTIVE token per customer" index were directly exercised with real `INSERT`/`UPDATE` statements — a duplicate hash was rejected, a second simultaneous ACTIVE token for the same customer was rejected, and the same insert succeeded immediately after revoking the first, proving the partial index's `WHERE status = 'ACTIVE'` clause behaves exactly as intended.

## Explicit limits

No camera/photo-based scanning mode — this pass assumes HID-scanner-into-text-input hardware only (see the scoping decision above); a phone-camera decode flow, if ever wanted, is a separate follow-on requiring an actual client-side decode library and its own UI. No POS UI screen yet showing a "scan to find member" input or a printable membership card — API-only this pass, consistent with GAP-038/GAP-039's same deferral pattern. No rate-limiting on the public-facing lookup beyond ordinary authentication (it is a POS_CASHIER-module-gated staff action, not a public endpoint, so this is a lower-risk gap than it might first appear, but is noted rather than silently assumed safe at higher volume). No production migration, commit/push, or deployment — batched with future gaps.
