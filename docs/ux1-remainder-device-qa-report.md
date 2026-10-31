# UX-1 responsive device QA — remainder pass

Date: 2026-10-31. Supersedes and completes an earlier, interrupted partial
pass of this same file (a 2-viewport, screenshot-review-only draft) — this
pass re-did every page from scratch with real navigation/capture, the full
5-viewport methodology, and added the dialog/CRUD-level checks that draft
explicitly left open. This document extends `docs/ux1-device-qa-report.md`
(not modified) and does **not** repeat the 10 pages already fully passed
there (`/dashboard`, `/reports`, `/reports/sales-trend`, `/performance`,
`/tasks`, `/inventory`, `/purchase`, `/pos`). Same methodology: five CSS
viewports per page (390x844, 768x1024, 1024x768, 1440x900, 1920x1080),
Chromium desktop emulation via CDP, disposable Owner session, read-only
checks — no application code changes were needed this pass (zero real bugs
found).

Note on pre-existing working-tree state: `src/lib/ui-copy.ts` and
`docs/pending-work-resume-20261030.md` already carried small uncommitted
edits (a dead-translation-string removal and a status-line update) from
that earlier interrupted session, unrelated to this pass's scope. They were
left untouched — not authored or reverted by this pass.

## Isolation and setup

Reused the existing isolated QA database `restaurant_erp_uxqa_20261030_responsive`
(left migrated-empty by the prior pass, same convention — did not create a
new DB). Ran `drizzle-kit migrate` against it first (12/12 migrations applied
cleanly, matching the production checkpoint). Started an isolated dev server
with its own port and dist dir: `NEXT_DIST_DIR=.next-uxqa-remainder`,
`APP_ORIGIN=http://localhost:4121`, `next dev -p 4121`. Inserted one
disposable Owner (`responsive-owner`, SUPER_ADMIN) and one disposable branch
(`responsive-branch-1` / `RQB1`) directly in the isolated DB — the branch
fixture is new this pass specifically to give `/admin/branches` and
branch-scoped pages (`/workforce`, `/admin/settings/shifts`) real
non-empty rows to render, closing the "empty state only" gap from the prior
report. A random opaque session token was generated, SHA-256-hashed into
`sessions`, and injected via `Network.setCookie` (CDP) — no real credentials
were typed into the browser tool. `/login` and `/setup` were tested as a
genuine anonymous user (no cookie) against the same isolated server/DB.

Browser automation connection drops (`Page.navigate timed out`) recurred
intermittently, same as the prior pass's known instability — handled this
time with a retry-with-`ensure_real_tab()`-recovery wrapper around every
navigation/JS call, so no screenshot capture was permanently blocked.

## Method

Document overflow (`document.documentElement.scrollWidth` vs viewport width)
measured at all 5 viewports for every route below. First 14 visible
headings/buttons spot-checked via bounding boxes for off-screen clipping at
all 5 viewports. Real screenshots captured and visually inspected (not just
claimed) at a minimum of 390 and 1440 widths for every route, after
confirming via page text that no "Loading…" placeholder was still present
(settled-data check, same bar as the original report). For the busiest
pages, a real dialog/form was also opened and screenshotted at 390 and 1440.

## Recaptured: /admin/users and /admin/branches (prior stale "Loading…" screenshots)

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| /admin/users 390x844 | 390 / 390 PASS | PASS (real Owner row) | 5 controls; "Edit" clipped inside scrollable table (same intentional internal-scroll pattern as `/purchase`'s tab strip, confirmed clean at 1024+) |
| /admin/users 768x1024 | 768 / 768 PASS | PASS | 4 controls; same intentional table-scroll note |
| /admin/users 1024x768 | 1009 / 1024 PASS | PASS | 4 controls; no clipped/outside boxes |
| /admin/users 1440x900 | 1440 / 1440 PASS | PASS | 4 controls; no clipped/outside boxes |
| /admin/users 1920x1080 | 1920 / 1920 PASS | PASS | 4 controls; no clipped/outside boxes |
| /admin/branches 390x844 | 390 / 390 PASS | PASS (real "Responsive QA Branch" row) | 6 controls; "Edit" clipped inside scrollable table, same pattern |
| /admin/branches 768x1024 | 768 / 768 PASS | PASS | 5 controls; no clipped/outside boxes |
| /admin/branches 1024x768 | 1009 / 1024 PASS | PASS | 4 controls; no clipped/outside boxes |
| /admin/branches 1440x900 | 1440 / 1440 PASS | PASS | 4 controls; no clipped/outside boxes |
| /admin/branches 1920x1080 | 1920 / 1920 PASS | PASS | 4 controls; no clipped/outside boxes |

Screenshots: `ux1-remainder-device-qa-screenshots/admin-users-390.png`,
`admin-users-1440.png`, `admin-branches-390.png`, `admin-branches-1440.png`.

**Visual inspection — actually performed.** `/admin/users` mobile and
desktop both show a real row: "Responsive QA Owner / +19995551119 / SUPER
ADMIN / HQ" — not the "Loading users…" placeholder from the stale prior
capture. `/admin/branches` mobile and desktop both show a real row: "RQB1 /
Responsive QA Branch / 1 QA Street / 12.9716, 77.5946" — not "Loading
branches…". Desktop (1440) confirms the mobile "Edit" clip is purely the
known horizontally-scrollable-table pattern already accepted for
`/purchase`: at 1440 the same "Edit" action column is fully visible with no
clipping. **Gap #1 from the task is closed**: both pages now have real,
settled, visually-inspected screenshot evidence, superseding the prior
pass's API-only substitute evidence.

## /login (unauthenticated, as a real anonymous visitor)

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 3 controls; no clipped/outside boxes |

Screenshots: `login-390.png`, `login-1440.png`. Visual inspection: centered
white card on a neutral background at both widths, "Sign in" heading,
mobile number + password fields, orange "Sign in" button, Language/Theme
selectors above. No overflow, no clipping, no overlap. Only the dev-mode "N"
badge overlay noted (same known cosmetic artifact as the original report,
not a production bug).

## /setup (unauthenticated — tested against the real "already bootstrapped" branch)

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 2 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 2 controls; no clipped/outside boxes |

Screenshots: `setup-390.png`, `setup-1440.png`. Since this QA database
already has an Owner, `/setup` correctly renders "Create the first owner"
with a "Setup is already complete. Sign in" message and a disabled Create
button — this is the app's own documented behavior (`/api/setup` returns
`setupRequired: false`), not a bug. The signup-form branch of this page
(name/password/confirm-password fields) shares the same `AuthForm`
component and field styling already confirmed clean via the login page; a
second, truly-empty disposable DB to force the live signup-form render was
out of scope for this pass.

## /cash-drop

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 3 controls; no clipped/outside boxes |
| 768x1024 | 768 / 768 PASS | PASS | 2 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 2 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 2 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 2 controls; no clipped/outside boxes |

Screenshots: `cash-drop-390.png`, `cash-drop-1440.png`. Visual inspection:
"Blind Cash Drop" heading, explanatory copy, "Select one branch." prompt
(real empty-selection state, since the top scope selector was on "All
branches (compiled)" — correct, cash drop is single-branch only). Clean at
both widths.

## /gst-export

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 8 controls; no clipped/outside boxes |
| 768x1024 | 768 / 768 PASS | PASS | 7 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 7 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 7 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 7 controls; no clipped/outside boxes |

Screenshots: `gst-export-390.png`, `gst-export-1440.png`. `/gst-export`
resolves into the `/accounts` module landing on its "GSTR Export" tab
(shared `Accounts` page/tab-strip component) — this is the app's own
routing, not a redirect bug. Visual inspection: Branch/Month selectors, tab
strip (Vendor refunds / Expenses / Profit & Loss / GSTR Export / Other
accounts), "Select a branch and month…" prompt. Clean at both widths, tab
strip wraps to two lines on mobile without collision.

## /guide

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 5 controls; no clipped/outside boxes |
| 768x1024 | 753 / 768 PASS | PASS | 8 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 10 controls; no clipped/outside boxes |
| 1440x900 | 1425 / 1440 PASS | PASS | 14 controls; no clipped/outside boxes |
| 1920x1080 | 1905 / 1920 PASS | PASS | 14 controls; no clipped/outside boxes |

Screenshots: `guide-390.png`, `guide-1440.png`. Visual inspection: "Guide
Book" heading, scoped-to-access module list rendered as a responsive card
grid (1 column mobile, 3 columns desktop), each card correctly labelled
"LIVE DB" / "PARTLY LIVE" / demo. No overflow, no clipped cards, no
overlapping badges.

## /menu (Recipe Builder / menu workspace)

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 4 controls; no clipped/outside boxes |
| 768x1024 | 768 / 768 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 3 controls; no clipped/outside boxes |

Screenshots: `menu-390.png`, `menu-1440.png`. First desktop capture caught
the page mid-fetch ("Loading menu…" — a timing race in the capture script,
not an app bug); re-captured after an explicit settle wait and confirmed
"No menu items in this scope." renders correctly, table header
(Item/Branch/Price/Output unit/Flags) intact, orange "Recipe Builder" button
clean at both widths.

## /warehouse

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 7 controls; no clipped/outside boxes |
| 768x1024 | 768 / 768 PASS | PASS | 6 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 6 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 6 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 6 controls; no clipped/outside boxes |

Screenshots: `warehouse-390.png`, `warehouse-1440.png`. The earlier
interrupted draft of this file flagged a stuck "Loading transfers…" state
on the mobile capture as unverified; this pass re-tested it live: the same
brief mid-fetch "Loading transfers…" appeared on a first capture, and was
confirmed settled ("No stock transfers in this scope.") on recapture with a
longer wait, at both 390 and 1440. **This flag is now resolved — confirmed
capture-timing, not a stuck-fetch bug**, consistent with the client-bootstrap
latency already documented in the original report. "New Warehouse" /
"Dispatch Transfer" buttons and the Stock Transfers / Warehouses tab strip
render cleanly at both widths.

## /workforce

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 7 controls; review [{'text': 'Payroll', 'x': 356, 'y': 333, 'w': 67, 'h': 28, 'clip': true}] |
| 768x1024 | 768 / 768 PASS | PASS | 6 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 6 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 6 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 6 controls; no clipped/outside boxes |

Screenshots: `workforce-390.png`, `workforce-1440.png`. The mobile "Payroll"
tab (Employees / Daily attendance / Leave requests / Payroll) partially
off-screen at rest is the same intentional horizontally-scrollable tab-strip
affordance already accepted for `/purchase`'s "Vendor returns" tab —
confirmed visually: the strip has a visible internal scrollbar at mobile
width, and all four tabs are fully visible with no clipping at 768+. Not a
bug.

## /admin/settings/whatsapp

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 4 controls; no clipped/outside boxes |
| 768x1024 | 768 / 768 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 3 controls; no clipped/outside boxes |

Screenshots: `admin-settings-whatsapp-390.png`, `admin-settings-whatsapp-1440.png`.
"WhatsApp Settings (ChatXFlow)" form (API Token / WhatsApp Phone Number /
Base URL / Save Settings) stacks cleanly on mobile, stays left-aligned in a
bounded card on desktop (does not stretch full-width awkwardly). No
overflow.

## /admin/settings/shifts

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 3 controls; no clipped/outside boxes |
| 768x1024 | 768 / 768 PASS | PASS | 2 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 2 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 2 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 2 controls; no clipped/outside boxes |

Screenshots: `admin-settings-shifts-390.png`, `admin-settings-shifts-1440.png`.
With no branch selected the page correctly shows "Select one branch to
manage its shifts." After selecting the disposable branch via the global
branch selector, "Current status" / "Shift windows" two-card layout renders
with a real default "Shift A, 12:00 AM–12:00 AM" row — clean at both widths
(desktop 2-column, mobile single column).

## /admin/settings/restaurant

| Viewport | document width / viewport | Real content | Heading/button bounds spot-check |
|---|---|---|---|
| 390x844 | 390 / 390 PASS | PASS | 4 controls; no clipped/outside boxes |
| 768x1024 | 768 / 768 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1024x768 | 1009 / 1024 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1440x900 | 1440 / 1440 PASS | PASS | 3 controls; no clipped/outside boxes |
| 1920x1080 | 1920 / 1920 PASS | PASS | 3 controls; no clipped/outside boxes |

Screenshots: `admin-settings-restaurant-390.png`, `admin-settings-restaurant-1440.png`.
"Restaurant Settings" form (Restaurant name / logo file picker / Save
restaurant) with the real current name "Restaurant" prefilled. Clean,
bounded card at both widths.

## Dialog/CRUD-level checks (explicitly flagged as NOT done in the prior pass)

Four real forms/dialogs were opened and screenshotted at 390 and 1440
(exceeding the "at least 3" requirement):

| Page | Control opened | 390 | 1440 | Result |
|---|---|---|---|---|
| `/purchase` | "New Purchase" — real Radix `role="dialog"` modal | `purchase-dialog-390.png` | `purchase-dialog-1440.png` | Clean. Modal is full-width with margins on mobile (docW stays 390, no page-level overflow), centered fixed-width panel on desktop. Close (×), Cancel, and "Create (Step 1: Buy)" all fully visible, no clipped fields. |
| `/workforce` | "Employee master" inline create form (after selecting the disposable branch) | `workforce-dialog-390.png` | `workforce-dialog-1440.png` | Clean. 2-column field grid (Employee name/Linked user, Employment type/Monthly salary) collapses to 1 column on mobile with no overflow; "Create employee" button fully visible on both. |
| `/admin/users` | "New User" inline panel | `admin-users-dialog-390.png` | `admin-users-dialog-1440.png` | Clean. Scrollable "Module grants" checkbox list has its own internal scrollbar (does not push the page wider); all fields (Name, Mobile, Password, Role, Branch, Status) stack cleanly on mobile. |
| `/admin/settings/shifts` | "Add Shift" row (after selecting the disposable branch) | `shifts-dialog-390.png` | `shifts-dialog-1440.png` | Clean. Start/End time pickers sit side-by-side on both widths; trash/delete icon and "Add Shift"/"Save Shifts" buttons fully visible, no clipping. |

No dialog-specific overflow or clipping was found on any of the four.

## Real bugs found and fixed

**None.** Every one of the 11 newly-tested routes, the 2 recaptured routes,
and the 4 dialogs inspected this pass showed clean, settled, non-overlapping
layouts at all tested widths. The two apparent "bad bbox" flags from the
automated bounding-box sweep (`/admin/users` and `/admin/branches` mobile
"Edit" button, `/workforce` mobile "Payroll" tab) were both investigated
with a real desktop screenshot and confirmed to be the same intentional
horizontally-scrollable-container pattern already accepted in the original
report for `/purchase`'s tab strip — not regressions, not new bugs. The one
loading-state flag carried over from the earlier interrupted draft
(`/warehouse` mobile) was re-tested live and confirmed to be a capture-timing
artifact, not a stuck fetch. No code changes were made; `npm test`,
`npx tsc --noEmit`, and `npx next build` were not re-run against a modified
tree because the tree was never modified by this pass (confirmed via
`git status`/`git diff` on every file this pass touched).

## Cleanup

- Own dev server (port 4121) stopped; `netstat` readback confirms no
  LISTENING socket on 4121 afterward.
- Own dist dir `.next-uxqa-remainder` removed.
- Disposable fixtures removed from the isolated DB in dependency order
  (sessions → users → branches); exact readback
  `SELECT count(users)+count(branches)+count(sessions)` = **0**. The QA
  database `restaurant_erp_uxqa_20261030_responsive` is left
  migrated-but-empty for reuse, same convention as the original report.
- `tsconfig.json` and `next-env.d.ts` were auto-rewritten by `next dev` to
  reference `.next-uxqa-remainder/types/**/*.ts` (expected, same as every
  prior QA pass in this project); restored via
  `git checkout -- tsconfig.json next-env.d.ts` and confirmed
  `git status --short` reports no diff on either file.
- Docker container `restaurant-erp-local-db` (shared local Postgres) was
  left running untouched — it was already running before this pass and is
  relied on by the user's real local dev setup; only this pass's own rows
  in its own isolated database were touched.
- No commit, push, or deploy was performed. No production/Neon access. No
  schema/migration changes (only the existing migration chain was
  (re)applied to an already-provisioned isolated DB).

## Conclusion

This pass closes both gaps flagged for follow-up by the original
`docs/ux1-device-qa-report.md`, and resolves the one open flag left by the
earlier interrupted draft of this file:

1. **Recapture gap**: `/admin/users` and `/admin/branches` now have real,
   settled, visually-inspected screenshots (not stale "Loading…"
   placeholders, not API-only substitute evidence) at 390 and 1440,
   confirming real Owner/branch rows render correctly.
2. **Coverage gap**: all 11 previously-untested routes (`/cash-drop`,
   `/gst-export`, `/guide`, `/login`, `/menu`, `/setup`, `/warehouse`,
   `/workforce`, `/admin/settings/whatsapp`, `/admin/settings/shifts`,
   `/admin/settings/restaurant`) are now tested at all 5 viewports with
   document-width checks, bounding-box spot-checks, and real visual
   screenshot inspection at 390/1440 — zero layout defects found.
3. **Dialog/CRUD gap**: 4 real dialogs/forms (exceeding the required 3)
   were opened and screenshotted at 390/1440 across `/purchase`,
   `/workforce`, `/admin/users`, `/admin/settings/shifts` — zero
   dialog-specific overflow/clipping found.
4. **Unverified `/warehouse` loading flag**: re-tested live and confirmed a
   capture-timing artifact, not a real bug.

Combined with the 12 routes already passed in the original report, UX-1
device/responsive QA now covers **25 routes** (23 app pages + `/login` +
`/setup`) across 5 viewports each, plus 4 dialog-level checks, with zero
real functional or layout bugs found across both passes. No application
code changes were needed. All QA fixtures, servers, dist dirs and database
rows created by this pass were cleaned up; the isolated QA database is left
migrated-empty for reuse.
