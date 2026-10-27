# Branch shift management

Local implementation; do not deploy or migrate production without explicit approval.

## Approved workflow

- Owner configures any branch. A Branch Admin with SHIFT_MANAGEMENT configures only their own branch. Ordinary staff cannot change windows, even when assigned that grant.
- Configure 1–12 named windows in handover order, covering 24 hours without gaps/overlaps. A single window with equal start/end covers the whole day. Times use Asia/Kolkata.
- Definitions are soft-deactivated on replacement; historical runs retain their referenced definition and label. No historical sales or cash counts are rewritten.
- Starting the first run chooses the window containing the current IST time. A branch has one open run. Starting/ending/accepting is a manual action, not a cron-based transition.
- POS tags completed orders with the current run. Configured branches must start a run before selling; branches not configured retain legacy POS behavior.
- Blind Cash Drop is the closing denomination count. Expected cash must never be returned before submission. End Shift atomically records the count and variance, closes the old run, opens the next run and creates a pending handover.
- The next shift must explicitly accept the incoming Cash/Card/UPI/Other amounts before POS or another closing count can continue.
- A one-window branch cycles to a new run of the same window, not to the same run ID.
- Cash is physical custody carried forward; digital tender totals are receipt summaries, not a second bank transfer. The implementation must not lose opening cash or count old digital receipts again.

## Boundaries and verification gates

- No production fixtures, no automatic bank transfer, no statutory cash/deposit accounting, no automatic shift closure.
- Initial legacy cash float and bank/safe withdrawals are not modeled. First run starts with zero carried-in cash; any physical float needs an explicitly designed opening-balance workflow before it can be reconciled correctly.
- Local migration 0008 adds branch_shifts, shift_runs and shift_handovers plus indexed shift_run_id columns on pos_orders and cash_drops. Empty shift_run_id denotes legacy orders only.
- Unit checks must cover cyclic windows, invalid/gapped/overlapping windows and IST boundaries.
- HTTP/Postgres acceptance must cover branch/grant/CSRF denial, no-shift compatibility, tagged sales, tender totals, closing variance, pending acceptance gate, repeated requests, consecutive-run cash carry-forward and concurrent transitions.
- UI acceptance must include branch switching during outstanding reads, fail-closed loading/error states, 390px layout, and the full configure/start/close/accept flow.
- A build, unit suite or API test alone does not establish browser/mobile acceptance.

## Current checkpoint

Final parent verification: 135/135 unit/regression tests and full-project TypeScript passed after guide synchronization; production build passed before that guide-only synchronization. Real HTTP/Postgres against the built QA app: shifts 24/24, Semi-FG 9/9, POS 21/21, BOM 17/17 (71 total). Guide Book/offline guide now include 17 bilingual chapters with full data parity tests. All own QA fixtures, sessions and QA servers were cleaned; local databases retained.

Earlier DOM interactions confirmed single-window configure/start/close/accept. The final hardened editor was screenshot-checked at 390x844 with document width 390. Remaining hardened interactive/tablet/laptop acceptance is blocked: Jev action chooser had no key and browser daemon subsequently refused connection. Do not claim full visual acceptance or production deployment. Unknown write journals require administrator reconciliation and intentionally do not auto-unlock; initial cash float/safe withdrawals are not modeled.
