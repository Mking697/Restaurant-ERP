# Restaurant ERP — Security + Code-Quality Audit (Phase 1, read-only)

**Scope:** `src/app/api/**`, `src/lib/server/**`, `src/db/**`, `src/middleware.ts`, `package.json` dependency tree, last 20 git commits.
**Date:** 2026-10-28. **Method:** full manual read of every route handler + every `src/lib/server/*.ts` helper, `search_files` grep sweeps for raw-SQL/secrets/CSRF patterns, `npm audit`, `git log -p` over the last 20 commits.
**Not modified:** no files were changed; no DB, no commits, no installs beyond the read-only `npm audit`.

## Overall verdict

The auth/session/permission core (`src/lib/server/auth.ts`, `permissions.ts`, `password.ts`, `http.ts`) is well-built: hashed+salted scrypt passwords with timing-safe comparison and constant-time work for unknown users, httpOnly/sameSite=lax/secure(prod) session cookies, SHA-256 session-token hashing at rest, `tokenVersion` bump + session-row delete on every credential/role change, a single shared Postgres advisory-lock transaction (`mutate()`/`locked()`) that resolves identity **after** acquiring the lock, and a consistent `branchScope()` helper used on essentially every route. No raw string-concatenated SQL was found anywhere — all `sql` usage is Drizzle's parameterized template tag. No hardcoded secrets were found in the working tree or in `git log -p` over the last 20 commits; `.env` is gitignored and was never committed.

The real gaps are: (1) one HIGH dependency CVE, (2) the login throttle is explicitly in-memory/single-instance only (self-flagged in a code comment, but worth escalating before go-live), (3) a handful of routes that quietly deviate from the project's own "every mutation uses `mutate()`" and "reject unknown fields" conventions, and (4) no app-level security response headers at all.

---

## HIGH

### H1 — `drizzle-orm@^0.36.0` has a HIGH-severity SQL-injection advisory (unpatched)
- **Evidence:** `npm audit --omit=dev` → `drizzle-orm <0.45.2`, GHSA-gpj5-g38j-94v9, "SQL injection via improperly escaped SQL identifiers", severity HIGH, fix requires drizzle-orm ≥0.45.2 (breaking).
- **File:** `package.json:26` (`"drizzle-orm": "^0.36.0"`).
- **Why it matters:** the installed range resolves below the patched version. This codebase does not appear to build dynamic *identifiers* (table/column names) from user input anywhere audited, which limits exploitability today, but the library itself ships with the unescaped-identifier bug and any future code (e.g. a dynamic `orderBy` column from a query string) would be silently vulnerable.
- **Fix:** plan the 0.45.x upgrade (breaking per npm) in a dedicated pass with full regression; do not ship 0.36.x to a production go-live with this advisory open.

### H2 — Login brute-force throttle is per-process in-memory, not shared — effectively absent in a scaled/production deployment
- **File:** `src/app/api/auth/login/route.ts:9,14-18` — `const attempts = new Map<string, {count,until}>()` module-level, with the code's own comment at line 8: *"Local-instance guard; production multi-instance deployments need shared throttling."*
- **Why it matters:** any horizontally-scaled deployment (multiple Next.js server processes/containers, or a serverless platform that spins fresh instances) gives each instance its own empty `Map`. An attacker simply gets a fresh 10-attempt/15-minute budget per instance/cold-start, which on common hosting is effectively no rate limiting at all for a credential-stuffing attack against a known phone number.
- **Fix:** move the counter to Postgres (a small `login_attempts` table, already inside the same advisory-locked transaction pattern) or Redis before production traffic; this is pre-flagged by the author but must be closed, not just documented, before go-live.

### H3 — `postcss` (via `next`) HIGH-severity path-traversal / arbitrary file-read advisories
- **Evidence:** `npm audit` → `postcss <=8.5.22`, two HIGH advisories (GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, CVSS 7.5) — attacker-controlled `sourceMappingURL` in CSS can be made to read arbitrary files/.map files; pulled in transitively by `next@^15.0.0`.
- **File:** `package.json:28` (`"next": "^15.0.0"`).
- **Fix:** upgrading `next` to the version `npm audit fix --force` proposes (16.4.3, breaking) resolves it; schedule as its own tested pass given the breaking-change risk to the whole app.

---

## MEDIUM

### M1 — `/api/admin/settings/whatsapp` POST does not reject unknown fields and bypasses the shared `body()` helper
- **File:** `src/app/api/admin/settings/whatsapp/route.ts:37-39` (`writeSettings`) — reads the body via `request.json().catch(() => null)` directly instead of `@/lib/server/http`'s `body()`, and only *destructures* `token/phoneNumber/baseUrl` without ever checking for or rejecting extra keys.
- **Deviation from documented convention:** CLAUDE.md states unknown fields in request bodies should be rejected (and every other parser audited — `parseExpense`, `branchInput` via `string()`, `workforce.ts`'s `fields()` helper, `parseVisibilityChange`, `voidExpenseChanges` — does this explicitly). This route silently drops unexpected fields instead of rejecting the request, and also loses `body()`'s 16 KB size cap / `Content-Type: application/json` enforcement for this one route.
- **Fix:** route this through `body()` and add an explicit `Object.keys(input).some(k => !["token","phoneNumber","baseUrl"].includes(k))` rejection, matching every other settings-write route in the codebase.

### M2 — `/api/currency-rates` POST bypasses the shared `mutate()`/`locked()` transaction — TOCTOU race on upsert
- **File:** `src/app/api/currency-rates/route.ts:24-44` — calls `assertSameOrigin`/`requireIdentity` manually (CSRF/auth are still correctly checked), but then does a plain `db.select()` existence check followed by a separate `db.update()`/`db.insert()` with **no transaction and no advisory lock**, unlike every other write path in the app (`auth.ts`'s own comment: *"All foundation mutations share one xact lock... No stale-authority write."*).
- **Why it matters:** two concurrent Owner requests to set/update the same currency code can both read "not existing" and both attempt insert (handled only by the generic 23505→409 mapping in `http.ts`), or one can clobber the other's intended value under interleaving. Low business impact (Owner-only, rare config change) but a real correctness gap against the project's own stated invariant.
- **Fix:** wrap the select+upsert in `mutate(request, ...)` like every other write route.

### M3 — `/api/whatsapp/offer-alert` POST (bulk customer broadcast) also bypasses `mutate()`
- **File:** `src/app/api/whatsapp/offer-alert/route.ts:21-26` — calls `assertSameOrigin`/`requireIdentity` directly rather than `mutate()`. CSRF and auth are present, so this is not independently exploitable, but it is the third route (with M2) that quietly diverges from the single documented mutation pattern the rest of the codebase enforces, which increases the chance a future edit forgets the CSRF/auth call entirely (as a copy-paste base) since the compiler cannot catch "forgot to call `mutate`".
- **Fix:** for consistency and defence-in-depth, migrate to `mutate()` even though this route has no DB write of its own (it only reads + sends WhatsApp).

### M4 — No application-level security response headers anywhere (CSP / X-Frame-Options / HSTS / Referrer-Policy)
- **File:** `src/middleware.ts:6-10` — the only middleware in the app sets an internal `x-restaurant-path` request header and returns `NextResponse.next()`; it sets no response security headers. `src/lib/server/http.ts:3` only sets `Cache-Control: no-store` on JSON responses. No `next.config.*` headers() block was found.
- **Why it matters:** no Content-Security-Policy, no `X-Frame-Options`/`frame-ancestors` (clickjacking), no HSTS, no `Referrer-Policy`, no `X-Content-Type-Options` on normal pages (only the one logo route sets `X-Content-Type-Options: nosniff` at `src/app/api/branding/logo/route.ts:8`). Given the app also relies on same-origin checks for CSRF, missing `frame-ancestors`/X-Frame-Options leaves a clickjacking surface on the login/POS UI.
- **Fix:** add a `headers()` block in `next.config.ts`/global middleware setting at minimum `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP once all asset origins are enumerated.

### M5 — `brandingInput()` does not reject unknown fields
- **File:** `src/lib/server/branding-input.ts:37-42` — only reads `input.restaurantName`/`input.logo`, no allowlist check, unlike `parseExpense` (`accounts/expenses` route helper) or `fields()` in `workforce-policy.ts` which explicitly throw `HttpError(400, "Unexpected ... field")`.
- **Fix:** add the same `Object.keys(input).some(k => !["restaurantName","logo"].includes(k)) → 400` guard used elsewhere.

---

## LOW

### L1 — Login throttle keys only on phone number, not IP
- **File:** `src/app/api/auth/login/route.ts:16-18` — the `Map` is keyed by `phoneE164` only. An attacker spraying many *different* phone numbers from one IP (account-enumeration / credential-stuffing a leaked list) is not rate-limited at all, only repeated attempts against the *same* number are throttled.
- **Fix:** add a secondary IP-based counter/bucket (after H2's shared-store fix) to cap total login attempts per source regardless of target phone.

### L2 — Unbounded in-memory attempts map has a soft-cap escape valve, not a real limit
- **File:** `src/app/api/auth/login/route.ts:15` — `if (attempts.size > 10000) throw new HttpError(429, ...)`. This is a reasonable memory guard but means an attacker can fill the map with ~10k junk phone numbers to push the app into globally rate-limiting (429-ing) *every* login, including legitimate users — a low-cost denial-of-service once H2 is not yet fixed (single-instance Map).
- **Fix:** resolved as a side-effect of moving to a shared store with per-key TTL eviction (H2); not urgent standalone.

### L3 — `esbuild` moderate dev-only advisory via `drizzle-kit`
- **Evidence:** `npm audit` (full/non-prod run) → `esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99, moderate) via `@esbuild-kit/core-utils` → `drizzle-kit`. Dev dependency only (`drizzle-kit` is in `devDependencies`, `package.json:42`), not shipped to production runtime, but it does affect the dev machine's exposure while `drizzle-kit studio`/`generate` is running.
- **Fix:** low priority; picked up by the drizzle-kit upgrade noted in H1's remediation path.

### L4 — `branches` DELETE has no pre-check for linked data, relies on generic FK-error mapping
- **File:** `src/app/api/branches/[id]/route.ts:20` — `assertOwner` only, then a bare `tx.delete(branches)...`. If the branch has any FK-referencing rows (orders, inventory, employees, etc.) the delete will fail with Postgres `23503`, caught generically by `http.ts:9` as "Record has linked data or invalid reference" — functionally safe (no silent data loss), but the Owner gets no advance warning of *what* is still linked before attempting the delete.
- **Fix:** cosmetic/UX, not a security issue — optionally add a pre-check listing blocking references.

---

## Things verified clean (explicitly checked per the audit brief, no finding)

- **CSRF:** `assertSameOrigin()` (`src/lib/server/http.ts:14-18`) is called on every one of the 28 mutating (POST/PATCH/PUT/DELETE) route handlers found under `src/app/api/**`, either transitively via `mutate()` (`src/lib/server/auth.ts:39-41`, used by the large majority) or directly (`currency-rates`, `setup`, `auth/login`, `admin/settings/restaurant`, `branding`, `whatsapp/offer-alert` — see M2/M3 for the transaction-pattern-only deviation, CSRF itself is present on all of them).
- **SQL injection:** every `sql` tag usage across `src/db/schema/**` and `src/lib/server/**` (grepped exhaustively) uses Drizzle's parameterized `sql\`...${value}...\`` template — values are bound parameters, not string-concatenated. No `sql.raw`, no manual string-built queries, no `pg` client used outside the Drizzle `db`/`Pool` wrapper (`src/db/client.ts`).
- **Branch isolation:** every list/read/write route audited calls `branchScope(actor, requested)` (`src/lib/server/permissions.ts:11-16`) before touching `inventoryStock`/`posOrders`/`menuItems`/`employees`/etc.; a non-Owner requesting another branch's ID gets a 403, not silent cross-branch data. Several routes additionally re-derive the branch server-side from a related row (e.g. `menu-items`/`bom-recipes` resolve branch from the `menuItemId` row, not from a client-supplied branchId directly) and then assert the client-supplied value matches it (`bom-recipes/route.ts:48-49,65-66`).
- **Role/grant checks:** privilege-escalation path checked — `assertDelegation()` (`permissions.ts:21-28`) blocks a non-Owner from creating/editing an HQ role (`SUPER_ADMIN`/`CENTRAL_STORE_MGR`), from editing themselves, from crossing branches, and from granting a module they don't themselves hold.
- **Session revocation:** every credential-affecting write (`users/[id]` PATCH) bumps `tokenVersion` and deletes all existing `sessions` rows for that user in the same transaction (`src/app/api/users/[id]/route.ts:23-24`); `requireIdentity()` rejects a session whose `tokenVersion` no longer matches the live user row (`src/lib/server/auth.ts:22`).
- **Secrets handling:** `CHATXFLOW_API_TOKEN` is never returned to the client unmasked — `maskToken()` (`admin/settings/whatsapp/route.ts:11-14`) is applied on every read; the token is only ever used server-side as an `Authorization` header in `src/lib/chatxflow.ts:112`, never logged (no `console.log`/`console.error` calls exist anywhere in `src/`), never echoed in any API response. `.env` is gitignored (`.gitignore:4-7`) and was never committed in the 20-commit history reviewed (`.env.example` only contains blank placeholder keys). `pg` connection pieces are assembled in-memory from separate `PG*` env vars (`src/db/client.ts:9-25`), never as one composed literal.
- **Input validation / unknown-field rejection:** the large majority of parsers explicitly allowlist and reject unknown fields — `src/app/api/accounts/_shared.ts` + `expenses.ts`'s `parseExpense`/`voidExpenseChanges`, `workforce.ts`'s shared `fields()` call on every write action, `order-visibility.ts`'s `parseVisibilityChange`. The exceptions are M1 and M5 above.

---

## Priority order for remediation

1. H2 (shared login throttle) before any production traffic — currently self-documented as a known gap, needs to actually close before go-live.
2. H1 + H3 (drizzle-orm / next-postcss upgrades) — plan as their own tested, potentially breaking passes.
3. M1–M3 (route consistency: `mutate()` + unknown-field rejection on `admin/settings/whatsapp`, `currency-rates`, `whatsapp/offer-alert`) — small, mechanical fixes, low risk.
4. M4 (security headers) — one `next.config` change, cheap to add.
5. M5, L1–L4 — low priority cleanup.
