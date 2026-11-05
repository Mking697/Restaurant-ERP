# Email+Password login, self-service Change Password — local implementation verification

Status: VERIFIED_LOCAL. Not committed/pushed/deployed yet — awaiting the two
real email addresses for the existing production SUPER_ADMIN accounts before
the production migration + deploy step (see "Production cutover" below).

## Why this was built

A production login bug surfaced during GAP-042 UAT prep: the earlier
Tanzania phone-format pass (9-digit, 6/7-prefixed) made it physically
impossible to type the pre-existing production accounts' stored +91
(India-format) phone numbers into the login form's 9-digit field. User then
explicitly requested the login identity be switched to Email+Password
entirely, with a separate self-service Change Password screen.

## What changed

- `users` schema: new nullable `email` column (unique), `phone_e164` made
  nullable (was NOT NULL + unique). Phone is no longer the login identity —
  it is now an OPTIONAL contact field used only as a WhatsApp staff-reminder/
  escalation target (`task-notifications.ts`, `purchase-notifications.ts`,
  both of which already defensively skip a falsy phone — confirmed by
  reading their code, no change needed there).
- `email()` validator added to `http.ts` (lower-case, trim, basic shape
  check — same "shape-validate only, no external lookup" convention as the
  existing `phone()`).
- `POST /api/auth/login`: now takes `{ email, password }`, looks up by
  `users.email`, throttle key `email:<address>` instead of `phone:<e164>`.
- `POST /api/setup` (first-owner "sign up"): now takes
  `{ name, email, password }` — phone dropped entirely from this screen per
  the user's explicit scoping (other staff still created by Admin only, not
  public self-registration).
- `POST /api/users`, `PATCH /api/users/[id]` (admin create/edit): `email`
  required, `phoneE164` optional (validated/normalized only if provided).
- New `POST /api/auth/change-password`: any logged-in user (no admin gate —
  same authority model as the login form itself: your own current session +
  knowing your own current password). Verifies the old password, validates
  the new one (same 12-char policy as everywhere else), bumps
  `tokenVersion` (revokes every OTHER device's session, same convention as
  every other password/role reset in this project), then issues one fresh
  session so the user isn't logged out of their own current request.
- New `src/components/password-field.tsx`: shared eye-icon show/hide
  password input, used on login/setup, admin user create/edit and the new
  change-password form.
- New `/account/change-password` page, linked from the app header next to
  Guide.
- `Identity`/`CurrentUser`/`SessionUser` types gained `email`; `safeUser()`
  normalizes a null email/phone to `""` so every existing non-null-string
  consumer (145+ call sites) needed zero further changes.

## Explicit scope decisions (confirmed with the user)

- Email+Password REPLACES phone login entirely (not both).
- "Sign up" = only the one-time first-owner `/setup` screen. All other
  staff accounts remain Admin/Owner-created via `/admin/users` — no public
  self-registration was added (would be a security regression for an
  internal multi-branch ERP).
- Phone stays as an OPTIONAL field on the admin/users form, for WhatsApp
  staff reminders only — never used for login.

## Verification performed

- `npx tsc --noEmit`: clean.
- `npm test`: 730/730 (1 new: `email()` format/normalization unit test).
- `npx next build`: clean; `/account/change-password` page and
  `/api/auth/change-password` route both compiled (confirmed directly via
  `.next/server/app/...` output, not just the build log).
- Migration `0052_orange_human_fly.sql` (additive only — `ALTER COLUMN
  phone_e164 DROP NOT NULL`, `ADD COLUMN email text`, `ADD CONSTRAINT
  users_email_unique UNIQUE(email)`) replayed cleanly on a FRESH disposable
  Postgres database (all 53 migrations from scratch) — confirmed via direct
  `\d users` schema readback, not just the CLI's "applied successfully"
  message.
- Real HTTP + Postgres integration (`tests/auth.integration.cjs`, updated
  from phone- to email-based fixtures/login): **18/18 passed** against a
  real compiled... actually dev-mode Next.js server bound to the disposable
  database — email login issuing a real session cookie, owner/branch-admin/
  cashier authority boundaries, cross-branch/HQ-escalation denial, session
  revocation on permission change, CSRF/cross-origin rejection, logout,
  anonymous redirects, and a clean no-credential-leak session DTO.
- Real HTTP change-password flow, manually driven against the same QA
  server/database (not a canned/mocked check): wrong old password rejected
  (401), too-short new password rejected (400), mismatched confirmation
  rejected (400), a real successful change correctly revoked the OLD
  session (401 on next use) while the freshly-issued NEW session kept
  working (200), and login then failed with the OLD password (401) and
  succeeded with the NEW one (200) — the exact token-version-bump/
  re-issue behavior the implementation note above claims, proven rather
  than assumed.
- QA database dropped, QA Next.js dist dirs removed, `tsconfig.json`/
  `next-env.d.ts` confirmed restored to the committed baseline afterward.

## Production cutover — NOT yet done, blocked on one input

Production Neon (`wild-glade-34334923`) has exactly 2 SUPER_ADMIN accounts
("Manoj" `+916392578428`, "DB" `+917028377011`), neither with an `email`
value (the column doesn't exist in production yet). Once this migration is
applied, email becomes the ONLY login path — so these two rows need a real
email value set in the SAME deploy step, or both accounts are locked out
exactly like the original phone-format bug this work was triggered by.

Required before commit/push/deploy: the real email address to assign each
of these two accounts. Once supplied, the plan is: apply migration 0052 to
production (additive, confirmed safe), then a one-time `UPDATE users SET
email = $1 WHERE id = $2` for each of the two rows in the same maintenance
window, then verify login against production with the new email before
calling this closed.

## Explicit limits

No forgot-password/reset-via-email-link flow (out of this request's
scope — this pass is sign-in method change + change-own-password only, not
a password-recovery feature). No email deliverability/verification check
(format-only, matching this project's `phone()` convention). Admin/users
form shows email per row, no longer phone, in the user list table (phone
still editable in the edit panel, just optional).
