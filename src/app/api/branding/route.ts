import { api, json } from "@/lib/server/http";
import { readBranding } from "@/lib/server/branding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Intentionally public: explicit name + logo URL only, never provider settings.
export async function GET() { return api(async () => json(await readBranding())); }
