## SECURITY-1 (Next.js half) — Next.js 15 -> 16.4.3, React 19.0 -> 19.3.1

Scope: the dependency-upgrade half of SECURITY-1 deliberately deferred in the
drizzle-orm pass (docs/security-1-drizzle-upgrade-verification.md). Closes
the HIGH-severity transitive postcss path-traversal advisory (H3) that rode
in through Next.js 15's own dependency tree.

## Changes

- package.json/package-lock.json: next ^15.0.0 -> 16.4.3, react/react-dom
  ^19.0.0 -> 19.3.1, @types/react(-dom) pinned 19.3.0 with matching
  `overrides` entries (Next 16's own install added these pins).
- src/middleware.ts -> src/proxy.ts (file renamed, exported function renamed
  `middleware` -> `proxy`), per Next 16's routing-boundary rename. Behavior
  unchanged: same matcher, same x-restaurant-path header rewrite, same
  "auth is resolved in the server layout/API handlers, never here" contract.
- Removed an invalid `export const instant = false` + migration-comment
  block that `@next/codemod upgrade latest` had inserted into 24 page.tsx
  files (every protectedPage route + layout.tsx + the 3 public pages) before
  that codemod run was interrupted. `instant` requires
  `nextConfig.cacheComponents` to be enabled, which this project does not
  opt into — Cache Components adoption is a separate, larger decision, not
  part of this version-bump pass. Each file's pre-existing
  `export const dynamic = "force-dynamic"` (and, for the dynamic
  `/reports/[report]` route, its `generateStaticParams`) is untouched.
- AGENTS.md (NEW, committed): Next 16's `next dev` auto-generates this file
  every run (`node_modules/next/dist/server/lib/generate-agent-files.js`);
  Next's own guidance is to commit it rather than fight the recurring diff.
  Does not replace or conflict with this project's CLAUDE.md.
- No other application code changed. No `relations()`/`drizzle-zod`/
  `drizzle-valibot` usage exists in this codebase (unaffected by the earlier
  drizzle-orm bump's own breaking-change notes, confirmed again here since
  Next's own type-generation touches the same build pipeline).
- No sync `params`/`searchParams` destructuring, no `cookies()`/`headers()`
  sync calls, no `next/legacy/image`, no `generateImageMetadata`/
  `generateSitemaps`, no ESLint config, no custom webpack config, no
  `experimental.ppr`/`dynamicIO`/`useCache` flags anywhere in this
  codebase — confirmed by grep before starting, so no further Next 16
  migration work was needed beyond the two items above.

## Verification

- `npx tsc --noEmit --incremental false` — 0 errors.
- `node --test tests/*.test.cjs` — **398/398 passed** (full unit suite,
  unchanged count/content — this was a dependency/runtime change only).
- `npx next build` — clean, same route list, confirms `ƒ Proxy (Middleware)`
  in the build output (the rename took effect, not silently dropped).
- **Real HTTP+Postgres integration** on a dev server actually running
  Next.js 16.4.3 + React 19.3.1 (not just build-time compilation): reused
  the disposable QA database `restaurant_erp_purchase_history_qa_20261030`
  (migrated, pre-existing from the UX-1b pass) on an isolated port with
  `APP_ORIGIN` explicitly set to that port — `tests/
  historical-purchase-lookup.integration.cjs` — **34/34 passed**, exercising
  real session auth, CSRF same-origin enforcement, mutate()'s advisory-lock
  transaction path, GRN quality POST/replay, vendor-return claim
  registration and exact-ID historical lookups, all under the new runtime.
- A real bug was found and fixed DURING this verification, in test setup
  only, not application code: the dev server inherited this project's own
  `.env`-configured `APP_ORIGIN=http://localhost:3000` (used for the normal
  `npm run dev` port 3000), while the isolated QA server ran on port 4330 —
  every mutate()-gated POST failed CSRF's same-origin check with a correct,
  expected 403 (Next.js 16 loads `.env` into `process.env` itself, so
  unsetting `APP_ORIGIN` in the launching shell doesn't help; it has to be
  explicitly overridden to the test server's own origin). Confirmed via a
  temporary diagnostic log line (added and removed) that `expected` really
  was `http://localhost:3000` against the real request's `http://
  127.0.0.1:4330` origin. Not a product bug — the same-origin check behaved
  exactly as designed; fixed by exporting `APP_ORIGIN=http://127.0.0.1:4330`
  for the QA server process. Documented here because the next person running
  an isolated-port QA server against this app must do the same.
- QA database fixtures created/destroyed by the integration script are
  exact-random-ID scoped and self-cleaning (confirmed by its own "PASS exact
  owned cleanup readback" line); the QA dev server and its `.next-n16qa`
  dist dir were stopped/removed after. No browser QA was repeated for this
  pass — the UI code itself did not change (React major bump only touches
  the runtime, not JSX/hooks APIs used here); the already-passing unit test
  suite's component-level tests (React Testing Library-style render checks)
  running clean under React 19.3.1 is the evidence for UI-layer
  compatibility, not a fresh interactive click-through.
- Production untouched by this document; see the CLAUDE.md release tracker
  entry for the actual commit/push/deploy record.
