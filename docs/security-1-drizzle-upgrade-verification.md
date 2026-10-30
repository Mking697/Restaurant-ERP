# SECURITY-1 — drizzle-orm/drizzle-kit upgrade — local acceptance

User approved both breaking major-version upgrades (drizzle-orm, next.js),
local only, full regression required. This pass closes the drizzle-orm half;
the Next.js 15→16 major upgrade is deliberately deferred to its own pass
(too large to bundle safely with this session's large uncommitted feature
surface — flagged as still open below).

## Change

`drizzle-orm` 0.36.4 → 0.45.4, `drizzle-kit` 0.28.1 → 0.31.11. No application
code changes required — the project uses no `relations()`/`drizzle-zod` APIs
that the 0.45 changelog's "types breaking changes" note affects. This closes
the HIGH-severity unpatched SQL-injection advisory in `sql.identifier()`/
`sql.as()` (fixed upstream in 0.45.2) noted as H1 in the release tracker.

## Verification

- `npx tsc --noEmit --incremental false`: clean, no code changes needed.
- `node --test tests/*.test.cjs`: 398/398, no regressions from the bump.
- `npx drizzle-kit generate`: "No schema changes, nothing to migrate" —
  confirms the new drizzle-kit version reads the existing schema/migration
  chain identically; no silent schema drift from the tool upgrade itself.
- Isolated production build (`next build`): clean.
- Real runtime exercise against a live Postgres through the actual Next.js
  app (not just a raw `pg` ping): started an isolated dev server bound to
  the disposable `restaurant_erp_purchase_history_qa_20261030` QA database
  and reran `tests/historical-purchase-lookup.integration.cjs` — 34/34 real
  HTTP/Postgres checks pass, including transactions/locks (`mutate`/
  `locked`), inserts, and parameterized selects under the new drizzle-orm.
- `npm audit`: remaining findings are a dev-tool-only moderate esbuild
  advisory inside `drizzle-kit` (not exposed at runtime) and the
  already-tracked HIGH `postcss` advisory that only resolves with the
  Next.js major upgrade (H3, still open, see below).

## Cleanup

Own dev server/dist dir stopped and removed; `tsconfig.json`/`next-env.d.ts`
diff-clean against baseline. `package.json`/`package-lock.json` are the only
intentional diff from this pass (reviewed, expected).

## Still open

- H3: Next.js 15→16 major upgrade (resolves the transitive HIGH `postcss`
  advisory) — deliberately NOT done in this pass. It requires its own
  codemod run (`next-async-request-api`, middleware→proxy rename, Turbopack
  default, etc.) and full regression on top of this already-large session;
  do as a separate dedicated pass before claiming H3 closed.
- No production/Neon dependency change — this upgrade is local/uncommitted
  only; production still runs the old versions until a separate deploy.
