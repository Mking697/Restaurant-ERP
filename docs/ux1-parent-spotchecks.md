# UX-1 parent spot checks — October 30, 2026

Scope: independent browser DOM/interaction checks against the agent-owned disposable
QA app at http://localhost:4119, database restaurant_erp_uxqa_20261030_responsive.
No business record writes or production login. Parent used a separately named
browser session with the disposable Owner cookie and cleared that cookie afterward.

Executed at 390x844:
- Dashboard hydrated: React fiber present; initial loading settled into real zero
  sales/inventory/overdue data and an explicit no-completed-sales state.
  document scrollWidth 375 <= viewport 390.
- Mobile Open menu action exposed the Branches navigation item; document width 390.
- /admin/branches settled into explicit No branches yet (not loading/error).
  This database has no branch fixtures, so populated branch rows are not accepted.
- New Branch button opened a real dialog: x=16, y=176, width=358, height=492,
  right=374, bottom=668, within viewport 390x844; Save/Cancel controls existed.
- Actual Escape key events closed the dialog. No Save/POST was issued.

These are parent-executed DOM/interaction checks, not screenshot/pixel approval.
The standalone vision tool failed with model-not-found HTTP 404; do not imply
its image analysis succeeded. Full matrix/screenshot observations belong to
ux1-device-qa-report.md and must be accepted separately after the agent finishes.

The agent's diagnosed localhost-versus-127.0.0.1 development HMR origin issue
was not reproduced as an application data-hook bug. Parent localhost session
independently hydrated and fetched actual records successfully.
