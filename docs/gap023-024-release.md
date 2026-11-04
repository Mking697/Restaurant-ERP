# GAP-023/024 — production release evidence

Released November 4, 2026, after the owner's explicit commit/push/production-release approval.

## Exact release

- Feature commit and remotely verified main: `7a8d790defbf0a66985799acbef985ebca8b9e50`.
- Vercel production deployment: `dpl_8ekmpeJ67ikdkCcpdsCmfwSx93Eg`, READY.
- Production alias: https://restaurant-erp-tau.vercel.app
- Official deployment API resolved that alias to the exact feature SHA, expected project `prj_CHWg05dn2VJ9TkYm22ADPf334Dx0` and production target. GitHub Vercel commit status succeeded; check-runs returned 200 with zero check runs.
- A later documentation-only checkpoint may have a different HEAD/deployment. Its Ready/alias result must be verified separately; this feature SHA remains the application-change evidence.

## Live database

Neon project `wild-glade-34334923`, branch `br-plain-poetry-a1151jyf` (main), database `neondb`.

- All 38 ordered applied SQL hashes matched immutable committed LF SQL bytes. Windows CRLF working-copy mismatches were formatting only. Historical tracking timestamp overrides on migrations 0014/0015/0016 were classified and preserved, not rewritten.
- New migration timestamps exceed live watermark `1793590366418` and each other. Reviewed generated 0038/0039 SQL applied atomically under the existing application advisory transaction lock with a fresh count/prefix-digest/watermark guard.
- Tracking entries were inserted in the same transaction, using the exact committed SQL hashes and journal timestamps, so the Git-triggered production migrate step is a no-op rather than a replay of applied DDL.
- `0038_mysterious_rage`: SHA256 `ff287b49cf63af501b7e21402ad5a787c15088bb8cde34957465ca72940b5576`, timestamp `1793725007601`.
- `0039_luxuriant_black_tom`: SHA256 `ccca6687e180a79503aedbf0537db09543e3b2ae4905d46ea90931c6ab8d8861`, timestamp `1793763179822`.
- Independent post-write readback: 40 migrations, original-prefix MD5 `7a8ac0ef6906817245e8b87c06b637fd`; attempts/tickets/receipts/drafts/lifecycle action/event tables exist. Branch/menu/stock digests and order/line counts were preserved transactionally.
- All six existing branches retain the safe FAST_FOOD default. Owner must deliberately choose CONVENTIONAL for the applicable branches; release does not guess which locations are conventional. Kitchen users need their explicit POS_KITCHEN grant; it does not imply cashier access.

## Verification and limits

- Pre-commit full suite: 603/603; TypeScript and staged whitespace/security checks passed. Independent reviewer found no release-blocking security/logic issues and independently ran 96 focused tests. Non-blocking follow-ups: legacy success-ack shape validation, primary order-list truncation display and query batching.
- Prior current-artifact local acceptance: GAP-024 HTTP/PostgreSQL 648/648, unchanged GAP-023 compatibility 275/275, migration fresh/legacy/no-op 17/17 and real browser order/stock/receipt/replay/print proof. Full local evidence remains in each GAP verification document/folder.
- Production: 12 read-only HTTP checks passed, including authenticated POS orders/lifecycle/kitchen/branch reads and protected pages, plus anonymous login/redirect/401 checks. Exact deployed application/Neon binding was proven through a three-minute session on an existing Owner identity, not a production business fixture. Hydrated production POS displayed Drafts / Tables / Service; Kitchen displayed its authorized empty preparation queue.
- Production order/draft/receipt counts stayed zero throughout smoke; no sale, stock posting, payment, provider send, role change or branch-concept mutation was used as a production test. The temporary session was deleted, independently read back as absent, its browser cookie cleared and owned raw token removed from scratch.
- Real business mutations were exercised locally, not repeated against production. Physical printer delivery, statutory/fiscal-provider integration, proforma/final-invoice identity, partial/split payment, automatic refunds/restock and real platform/provider ingress are not claimed by this release.

Supporting artifacts: `docs/gap023-024-release-preflight.json`, `docs/gap023-024-production-smoke.json`, `docs/gap023-verification.md`, `docs/gap024-verification.md`, and both local evidence directories.
