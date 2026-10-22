import { requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return api(async () => json({ user: await requireIdentity(request) })); }
