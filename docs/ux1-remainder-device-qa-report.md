# UX-1 remainder — responsive device QA (pages not covered by ux1-device-qa-report.md)

Date: 2026-10-31 (resumed after an unplanned VS Code close interrupted the prior
session mid-task; the QA app/dev server had already exited by the time this
resume started, so this pass is screenshot review + cleanup only — no new
captures were taken here). Reused the same disposable isolated QA database
from 2026-10-30, `restaurant_erp_uxqa_20261030_responsive`, left migrated for
reuse per that session's note; same seed identity ("Responsive QA Owner" /
"Responsive QA Branch" / RQB1) confirmed in these screenshots. Two CSS
viewports per page: 390x844 (mobile) and 1440x900 (desktop). Chromium desktop
emulation. Read-only visual inspection; no application code changes.

Scope: the 13 pages flagged as "remains open" in
`docs/pending-work-resume-20261030.md` (UX-1 remainder line) that the original
`ux1-device-qa-report.md` pass did not cover: `/login`, `/setup`, `/menu`,
`/warehouse`, `/workforce`, `/accounts` (cash-drop, gst-export tabs),
`/admin/settings` (restaurant, shifts, whatsapp sub-tabs), `/admin/users`,
`/admin/branches`, `/guide`. (Dashboard, reports, reports/sales-trend,
performance, tasks, inventory, purchase, pos, accounts/expenses were already
settled in the original report and are not repeated here.)

All 26 screenshots (13 pages x 2 widths) were visually inspected.

## Findings — clean

Login, setup (sign-in + already-complete states), menu, workforce, guide,
cash-drop, accounts/GSTR-export tab, restaurant settings, shift settings,
WhatsApp settings, admin/users, admin/branches: no overflow, overlap, clipped
text or broken styling at either width. Sidebar/topbar collapse correctly to
the mobile layout (hamburger + stacked Language/Theme selectors) and expand
correctly to the desktop persistent sidebar. Wide tables (Users & Access:
Name/Phone/Role/Branch/Grants/Status/Action; Branches:
Code/Branch/Address/Coordinates/Geofence/Action) use the same intentional
horizontal-scroll-within-card pattern seen elsewhere in the app at 390px
(scroll affordance bar visible under the header row) — not a defect.

`admin/users` and `admin/branches` previously carried a known gap (original
report: stale pre-origin-fix loading-state captures, substituted with API
checks instead of real screenshots). That gap is now closed — both pages show
real settled data (the actual Owner/branch rows) in this pass's screenshots,
not a loading state.

## Findings — flagged, non-blocking

`/warehouse` at 390px (`warehouse-390.png`) shows "Loading transfers..." —
a stuck/incomplete loading state, unlike `warehouse-1440.png` which shows the
settled empty-state table ("No stock transfers in this scope."). This is the
same class of issue as the original report's cosmetic dev-badge note: likely
a capture-timing artifact (screenshot taken before the fetch settled) rather
than a real bug, since the 1440 capture of the same page/session settled
correctly and no other page showed this. Could not be re-verified live this
session — the isolated QA dev server had already exited before this resume
started. Flagged for a real retake next time the QA server is brought back up;
not treated as a confirmed defect.

## Cleanup performed this session

- QA scaffolding reverted: `next-env.d.ts` and `tsconfig.json` temporary
  `.next-uxqa-remainder` build-path entries restored to the standard `.next`
  paths; `.next-uxqa-remainder/` directory removed. Config is diff-clean.
- Dead translation string removed from `src/lib/ui-copy.ts` (the old "Cloning
  is not implemented..." branches-page copy, superseded by UX-1c's Clone
  Branch Wizard; confirmed no remaining references anywhere in the repo).
- Parent re-run this session: `npx tsc --noEmit` clean, `npm run test`
  426/426 passing.
- QA database left migrated for reuse (unchanged from 2026-10-30), consistent
  with prior sessions' pattern; no new disposable DB created here since no
  new captures were taken.

## Still open

- Retake `warehouse-390.png` once the QA server is live again, to confirm the
  loading state above is a capture artifact and not a real stuck-fetch bug.
- No other UX-1 page-level gaps remain from the `pending-work-resume-20261030.md`
  tracker's "UX-1 remainder" line; broader desktop/laptop/tablet/mobile
  coverage across the app is now complete modulo the one flagged retake, and
  pixel-level claims remain bounded to 390/1440 (no tablet/1920 pass was run
  in this resumed session — the original report's 5-viewport method was not
  repeated here, only 2).
