# Neon agent tooling and production workforce release

Checkpoint: 2026-10-22. Supplements the older CLAUDE.md and the local-only acceptance checkpoint in docs/workforce-resume-verification.md. CLAUDE.md was not edited.

## Tooling installed and verified

Three relevant official Neon skills were missing and have been installed:

- neon
- neon-postgres
- neon-postgres-branches

Project packages are under .agents/skills/<name>/ and include all linked reference files and the upstream Apache 2.0 LICENSE. There are 16 files across these three packages: 13 upstream skill/reference files and three license copies.

Source: https://neon.com/.well-known/agent-skills/neon/SKILL.md and the official registry at https://neon.com/.well-known/agent-skills. The three root SKILL.md contents were checked against the registry SHA-256 digests. Complete supporting files came from https://github.com/neondatabase/agent-skills at revision d814689cbba1506b7a25a7a6df5346258ba8ccf8. No vendor scripts were executed.

Hermes does not automatically discover this project's .agents/skills directory. The same packages were therefore registered in the active default Hermes profile under C:/Users/hp/AppData/Local/hermes/skills/software-development/<name>/. The native copies contain the complete upstream bodies/references/licenses. Their description metadata alone is shortened to fit Hermes' 60-character routing requirement; an in-file comment documents this adaptation. The project copies are unmodified upstream content. Native skill_view(neon) succeeded and skills_list lists all three packages.

Hermes' direct-URL and GitHub-identifier installers could not download these packages in this environment. Installation used verified upstream source and the native skill/file tools, not --force or an overridden security verdict. A reusable troubleshooting note was added to the existing hermes-agent-skill-authoring skill at references/vendor-skill-import.md.

The missing native Neon MCP server was installed through manage_connections, with no manual MCP config editing. Read-only describe_project/get_default_branch/database/role calls verified access to restaurant-erp. Existing unrelated server configuration was retained. No duplicate Cursor/VS Code MCP configuration or project API-key file was created. Other Hermes profiles were not changed.

The existing authenticated Neon CLI profile restaurant-release was reused. No additional login, project recreation, Claimable database, managed-auth migration, SDK/driver replacement, or application dependency installation was performed.

## Why the live workforce addition was failing

Production already had the new application code, but only the original two database migrations. All seven workforce/expense tables were missing.

Verified production deployment:

- Vercel deployment: dpl_7v9tGXDNT8HfXJvMNsEUzBtgby6P
- State: READY; target: production; Git branch: main
- Git commit: 6d87320537a3a593608a97de2b54c8ff5a498b4d
- Alias: https://restaurant-erp-tau.vercel.app
- Neon project: restaurant-erp / wild-glade-34334923
- Production database branch: main / br-plain-poetry-a1151jyf

No redeployment was needed to change code: this deployment already contains the feature. The missing database migration was the outstanding release step.

## Safe migration and verification

1. Audit verified existing Drizzle migration hashes against the deployed commit.
2. Created an isolated temporary Neon child branch, workforce-preflight-20261022 / br-solitary-art-a1r1vpis, from the existing main branch. This is a copy of existing production data, not a new fixture dataset. It must not be connected to a public QA application.
3. Applied the exact deployed-commit drizzle/0002_young_ego.sql to the child branch transactionally and independently verified the result.
4. Audited production again, applied the same additive migration in a transaction under a PostgreSQL advisory lock, recorded its Drizzle migration entry, then ran a separate verification process.
5. Suspended only the temporary branch's own endpoint ep-bold-moon-a1bz3g25 and read it back as idle. Production compute was not suspended. The branch is configured to expire automatically at 2026-10-23T18:30:00Z.

Both child and production verification returned:

- Three matching migrations, 48 public tables.
- ACCOUNTANT enum value present.
- Seven new tables present and empty: branch_expenses, employee_compensation, employees, payroll_runs, payroll_snapshots, workforce_attendance, workforce_leaves.
- Existing row counts unchanged: six branches, four users, three sessions, zero settings, twelve inventory_stock rows.
- No production expense, employee, leave, attendance, payroll, statutory, or bank-payment fixtures created.

The first temporary-branch create attempt requested a custom suspend timeout and was rejected by the account's policy. A read-back confirmed no branch had been created. The subsequent create omitted that unsupported setting; no account/production compute policy was changed.

Database credentials were resolved from the existing CLI profile in memory and passed as split PG* process variables over TLS. No connection URI, password, or token was written to the project or included in this checkpoint. Existing .env, .vercel/project.json, Drizzle configuration, drivers, authentication, package manifests, and application source were not rewritten.

Audit/apply/verify helpers and redacted proof JSON are in the session scratch directory. Audit/result filenames are branch-specific. These scratch files are temporary and are not required by the deployed app.

## Live read checks and remaining acceptance boundary

- Vercel deployment metadata independently returned READY for the main commit above.
- GET /login: 200.
- GET /api/setup: 200 with setupRequired=false; existing Owner setup retained.
- Anonymous /workforce and /accounts: 307 to /login.
- Anonymous employee/expense APIs: 401; auth was not weakened to make a test pass.

Authenticated production screen rendering and business workflow writes have NOT been exercised with the user's production login. Do not claim those were tested. Previous 91 automated and 64 real local HTTP/Postgres checks are documented in docs/workforce-resume-verification.md; they were not rerun against production and do not substitute for authenticated live acceptance.

Next user check: hard-refresh the existing ERP browser tab and inspect the sidebar as Owner. If the new screens remain absent or fail, investigate the authenticated route/permission response without creating production financial fixtures or altering credentials.

## Repository state

The project-local vendor skill packages and this checkpoint are included in the user-authorized commit/push to main following this checkpoint. Native Hermes skills and MCP/auth configuration remain outside this repository. No application-source change or Vercel environment rewrite was required; the main push triggers the existing production pipeline. Verify that deployment's SHA and READY state separately before reporting the new commit live.
