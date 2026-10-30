# Production release — October 30, 2026

## Source and hosting evidence

- Application release commit: `498a59159d7ca9849ed6301088e7ece0092524b4` on `main`.
- Git push succeeded; `git ls-remote --heads origin main` matched that exact SHA.
- Vercel project: `prj_CHWg05dn2VJ9TkYm22ADPf334Dx0` (`restaurant-erp`).
- Production deployment: `dpl_GEoRFPQEwXuwawgAQq2ndWsxCjo3`, READY.
- Official Vercel deployment readback for public alias `restaurant-erp-tau.vercel.app`
  matched this project, production target, READY state and exact application SHA.
- GitHub combined status for that SHA: Vercel **success**; check-runs empty.
- A subsequent documentation-only commit records this evidence; it does not change
  the independently tested application source. Reconcile the latest remote SHA and
  alias when checking a later deployment rather than assuming this historical ID
  must remain current forever.

## Approved scope

Tanzania currency/phone display and validation, FINANCE-1 real journals, FINANCE-2
completed POS revenue in P&L, AUTOMATION-1c rolling receipt averages for indent spike
approval, AUTOMATION-1b staff/Owner notifications, EVIDENCE-1 private photo/GPS evidence.
PURCHASE-3 remains intentionally skipped. GST/VAT semantic conversion and IST-to-EAT
business-date conversion are not included; do not treat this as complete Tanzania
regulatory/timezone localization.

## Verification

- Parent-run unit/UI suite: **426/426**, no failures/skips.
- TypeScript: clean; production-style build: successful.
- Fresh disposable databases with the exact rebuilt `.next-releaseqa` compiled
  artifact (not stale dev output):
  - Accounts ledger: **15/15** real HTTP/Postgres checks.
  - Expenses/P&L: **17/17**, including source-only legacy expense void.
  - Indent spike: **10/10**, including mixed known/unknown history.
  - Notifications: **13/13**, sandbox-only; manager sees 1 public completed sale,
    Owner sees 3 actual sales. ChatXFlow explicitly unconfigured, no live send.
  - Evidence: **18/18** real HTTP/Postgres/private Blob checks, signed reads and
    fixture deletion. Compiled Tasks-only first-party camera/GPS header verified.
- Independent review initially blocked release on private-sale notification
  disclosure, unmatched legacy expense reversals and partial-baseline indent
  autoapproval. All fixed with failing-before/passing-after regressions.
- Final independent re-review: **passed**, no security/logic blockers.
- Legacy text/URL evidence is preserved as inert visible text; private evidence
  remains behind authenticated short-lived reads.
- Global camera/GPS denial remains except the explicit same-origin `/tasks` scope.
- QA servers/databases/build output cleaned; `tsconfig.json` and `next-env.d.ts`
  restored to default with no diff. Temporary QA scripts preserved outside checkout.
- Added-content credential scan: no provider tokens, private keys, literal session
  credentials or credential-bearing database URLs; no private/generated paths staged.

## Production database

User explicitly approved production migration and reference account initialization.
Native Neon access targeted project `wild-glade-34334923`, branch
`br-plain-poetry-a1151jyf` (`main`), the independently verified direct endpoint and
`neondb`, with TLS certificate verification. No local dotenv fallback was used.

- Exact existing 0000–0010 hash/timestamp lineage verified before apply.
- `0011_rare_bucky` applied transactionally with bounded lock/statement timeouts.
- Postflight: all **12** ordered migration hashes/timestamps match the canonical
  LF SQL; **six** changed columns and **three** indexes verified.
- Approved chart initialization inserted **13** HQ reference accounts (12 approved
  plus retained legacy Petty Cash). No opening balances or business postings created.
- Replayed migration/initialization: no migration applied, **zero** accounts inserted.
- Existing business counts unchanged: 2 users, 6 branches; 0 POS orders, journal
  entries, task instances or task proofs. Daily summary log remained empty.
- Post-deployment read-only schema/account inspection passed again.
- Transient pre-connect Neon DNS failures were retried once; no uncertain write
  outcome was blindly retried.
- Separate local upgrade proof preserved synthetic legacy values across six tables
  and two branch scopes, then verified a second migration run was a no-op.

## Public live acceptance

At `2026-10-30T18:21:27.169Z`, **18/18** read-only public smoke assertions passed:
login HTML/nine-digit Tanzania phone pattern, initialized setup, protected page
redirects, anonymous API/evidence/cron rejection, default security headers and the
Tasks-only camera/GPS policy. No authenticated production workflows, business
fixtures, live staff/customer WhatsApp messages or scheduled-cron execution were
performed as part of this acceptance. Real business behavior was exercised only in
isolated QA. Autonomous daily scheduler delivery remains a separate acceptance item.
