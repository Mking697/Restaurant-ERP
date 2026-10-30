# Production cron verification — 2026-10-30

## Parent execution result — 2026-10-30

The GET fix was committed/pushed as `208d8e2`. Parent-run full unit suite:
399/399; production build exit 0; independent route review: no blockers,
6/6 focused tests. Vercel inspect confirmed production READY deployment
`dpl_6i84X5ksdBFpRpzimSFXuhdaqEqJ` and the public alias pointing to it.
`vercel crons list --format json` confirmed enabled, no undeployed/modified
jobs, and `/api/cron/tasks` on this deployment with `0 3 * * *`.

Parent executed the native platform Run command once. Invocation timestamp:
`2026-10-30T12:50:46.938Z`. Matching production request-log readback:
- request ID: `xm6gl-1793364647066-978465868da5`
- deployment: `dpl_6i84X5ksdBFpRpzimSFXuhdaqEqJ`
- method/path: `GET /api/cron/tasks`
- HTTP status: `200`, cache `BYPASS`, level `info`, no runtime log errors.
- unauthenticated public-alias GET independently returned `401 Unauthorized`.

This proves actual authenticated platform invocation reached the deployed
handler and completed its generation/escalation transaction successfully.
It does not prove nonzero generated/escalated counts: response body and
production business rows were not retrieved, and no fake production fixtures
were created. Do not infer zero-work or nonzero effects from HTTP 200 alone.

Manual platform execution is VERIFIED. Autonomous daily scheduled delivery
is still awaiting its next eligible window (nominal October 31, 2026,
03:00 UTC / 08:30 IST; platform precision can vary). No claim that a manually
requested Run proves that future timer delivery has already happened.
Earlier sections below preserve pre-deployment discovery evidence.

## Status and boundaries

**Provisioned, not end-to-end verified.** Production `CRON_SECRET` is now present as a Sensitive / Secret variable. The existing production deployment was not replaced. No cron invocation, business-data mutation, customer message, production fixture, or deployment was performed by this infrastructure task.

This document is the only repository file changed by this task. Source/test/build/deployment ownership remains with the parent agent while UX QA is active.

## Observed evidence

Read-only checks and provisioning were performed on 2026-10-30, approximately 12:37–12:43 UTC, using authenticated Vercel CLI 59.4.0 (Node.js 24.14.0).

| Item | Observed result |
| --- | --- |
| Project | `restaurant-erp` |
| Scope | `manojs-projects-30be2a32` |
| Project ID | `prj_CHWg05dn2VJ9TkYm22ADPf334Dx0` |
| Team ID | `team_AVZy8hAAXSJGqcAupnoFhdKy` |
| Current production / cron deployment | `dpl_5NBXg1Y12NVgMSf4bKYBy9JKMSET` |
| Deployment state | `READY` from project production target |
| Cron host | `restaurant-4ai1csh4t-manojs-projects-30be2a32.vercel.app` |
| Deployed job | `/api/cron/tasks` |
| Schedule | `0 3 * * *` |
| Platform state | `enabled: true`, `disabledAt: null` |
| Local/deployed definition comparison | `undeployed: []`, `modified: []` |
| Before provisioning | Only six `PG*` production variables listed; no `CRON_SECRET` |
| After provisioning | `CRON_SECRET`, Hidden, Sensitive, Production; CLI creation output also confirmed Visibility Secret |

Commands actually executed included:

```bash
npx vercel env ls production
npx vercel crons list --format json
npx vercel crons run --help
npx vercel logs --help
npx vercel api list
npx vercel api /v9/projects/restaurant-erp --raw
```

The project API output was reduced in memory to project identifiers, cron metadata, and production-target ID/URL/state; environment values were not printed. No `.env`, credential file, or CLI authentication file was read.

A fresh 32-byte cryptographically random secret was generated in Node memory, hex encoded, and sent directly through stdin. This command completed with exit 0, without overwrite flags, and was immediately followed by an independent environment-list readback:

```bash
set -o pipefail
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | npx vercel env add CRON_SECRET production --sensitive --yes
npx vercel env ls production
```

The generated value was not printed, stored locally, passed as a command argument, or retrieved afterward. Do not rerun provisioning merely to verify: a value already exists.

## Deployment prerequisite

Vercel invokes cron routes with HTTP GET against the production deployment.[1] The parent reports fixing the prior POST-only route and passing 6/6 focused tests. The inspected local route now contains `export const GET = POST`; this task did not rerun those tests or deploy that fix.

Vercel environment-variable changes apply to new deployments, not existing ones.[3] Therefore, successful provisioning does **not** establish that the existing production function has the secret or GET support. The parent must finish QA and deploy the reviewed fix in a new production deployment before any authorized run.

Vercel supplies `Authorization: Bearer <CRON_SECRET>` on platform cron invocations.[2] The inspected local route fails closed if the secret is absent, uses timing-safe digest comparison, and only calls generation/escalation after authentication. Its success response is `{ generated, escalated }`; unauthorized is 401 and caught database/server failure is 503. These are source observations, not production execution results.

## Ready-to-use manual run mechanism — NOT EXECUTED

The installed CLI has a native production cron trigger. It reads deployed definitions rather than the local file.[4] Use this only after the parent confirms the new production deployment is READY and includes both the GET fix and newly provisioned environment:

```bash
npx vercel crons list --format json
npx vercel crons run /api/cron/tasks --project restaurant-erp --scope manojs-projects-30be2a32
```

This invokes Vercel's control plane rather than constructing a direct HTTP request to the business endpoint. Official CLI source shows it POSTs `{ path, schedule }` to `/v1/projects/{projectId}/crons/run?teamId={teamId}` and returns `invocationAt`; it never fetches the application's secret.[5] Combined with Vercel's documented platform secret injection, this is the credential-free operator mechanism to exercise the deployed job.[2][5] Secret delivery on this project's actual run remains unverified until that run succeeds.

Equivalent authenticated CLI API request, **also NOT EXECUTED**:

```bash
printf '%s' '{"path":"/api/cron/tasks","schedule":"0 3 * * *"}' | npx vercel api '/v1/projects/prj_CHWg05dn2VJ9TkYm22ADPf334Dx0/crons/run?teamId=team_AVZy8hAAXSJGqcAupnoFhdKy' --method POST --input -
```

The run endpoint was found in the official CLI implementation, not in the public `vercel api list` output; prefer `vercel crons run` over depending directly on this implementation endpoint.[5] A control-plane trigger acknowledgment is **not** proof that the function succeeded.

## Logs, acceptance, and scheduled-run distinction

Vercel's project Settings → Cron Jobs provides the platform operator surface; use **Run** for the deployed job or **View Logs** to inspect its requests. Failed invocations are not automatically retried.[2] Use bounded production request-log retrieval rather than an indefinite stream:[6]

```bash
npx vercel logs --environment production --query 'requestPath:/api/cron/tasks' --since 30m --limit 20 --json
```

The documented runtime-log API is `GET /v1/projects/{projectId}/deployments/{deploymentId}/runtime-logs` (streaming; use a bounded timeout if calling it directly). It includes request method/path, response status, and request metadata.[7]

During this task, the path-filtered last-24-hour request returned no rows. A broader last-24-hour check returned 20 recent request rows and no cron-path match. That bounded sample is **not** proof that the scheduled job never ran; no successful cron invocation was established. Business log messages were not copied into this document.

Remaining acceptance gates:

1. Parent deploys the reviewed GET fix after UX QA and confirms the new production/cron deployment ID and READY state.
2. Parent runs the native manual trigger once and records its returned invocation timestamp.
3. Read back the matching request log: correct deployment, GET path, timestamp/request ID, HTTP 200, and no runtime error. If platform invocation fails, report it rather than retrieving the secret.
4. Read-only verification of actual generation/escalation effects or a legitimate zero-work outcome must be attributed to evidence, not inferred from the trigger acknowledgment. Do not create fake production work to force nonzero counts.
5. Record the manual verification separately from the next real scheduled invocation. A manually triggered success does not prove scheduler delivery.

At this observation time, the next nominal schedule is **2026-10-31 03:00 UTC / 08:30 Asia/Kolkata**, computed from `0 3 * * *`; actual delivery timing and platform plan precision are not established by this document. Vercel documents best-effort delivery, including missed or duplicate invocations, so absence of a log is not proof of application failure.[2]

## Sources

[1] https://vercel.com/docs/cron-jobs
[2] https://vercel.com/docs/cron-jobs/manage-cron-jobs
[3] https://vercel.com/docs/environment-variables
[4] https://vercel.com/docs/cli/crons
[5] https://raw.githubusercontent.com/vercel/vercel/main/packages/cli/src/commands/crons/run.ts
[6] https://vercel.com/docs/cli/logs
[7] https://vercel.com/docs/rest-api/logs/get-logs-for-a-deployment
