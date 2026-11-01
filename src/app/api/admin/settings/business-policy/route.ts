import { requireIdentity, mutate } from "@/lib/server/auth";
import { assertOwner, HttpError } from "@/lib/server/permissions";
import { api, body, json } from "@/lib/server/http";
import { readBusinessPolicy, saveBusinessPolicy, type BusinessPolicyInput } from "@/lib/server/business-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only GAP-001/GAP-017/GAP-010 policy settings, both explicitly
// requested to be Owner-configurable at runtime rather than fixed in code
// (P0 clarification, October 31, 2026). See src/lib/server/business-policy.ts.

const FIELDS = ["indentValueThresholdTsh", "costYieldTolerancePercent", "nearExpiryWarningDays"];

export async function GET(request: Request) {
  return api(async () => {
    assertOwner(await requireIdentity(request));
    const result = json(await readBusinessPolicy());
    result.headers.set("Cache-Control", "no-store");
    return result;
  });
}

export async function POST(request: Request) {
  return api(() => mutate(request, async (_tx, actor) => {
    assertOwner(actor);
    const raw = await body(request);
    const unknown = Object.keys(raw).find((k) => !FIELDS.includes(k));
    if (unknown) throw new HttpError(400, `Unexpected field: ${unknown}`);
    const input = raw as BusinessPolicyInput;
    return json(await saveBusinessPolicy(input));
  }));
}
