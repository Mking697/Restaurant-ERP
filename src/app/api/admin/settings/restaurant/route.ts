import { api, assertSameOrigin, body, json } from "@/lib/server/http";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { assertOwner } from "@/lib/server/permissions";
import { brandingInput, BRANDING_BODY_BYTES } from "@/lib/server/branding-input";
import { readBranding, saveBranding } from "@/lib/server/branding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => { assertOwner(await requireIdentity(request)); return json(await readBranding()); }); }
export async function POST(request: Request) { return api(async () => {
 assertSameOrigin(request); assertOwner(await requireIdentity(request));
 const branding = await brandingInput(await body(request, BRANDING_BODY_BYTES));
 const result = await mutate(request, async (tx, actor) => { assertOwner(actor); await saveBranding(tx, branding); return readBranding(tx); });
 return json(result);
}); }
