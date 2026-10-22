import { api } from "@/lib/server/http";
import { readBrandingValues } from "@/lib/server/branding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fallback = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#b45309"/><path d="M18 14v16m7-16v16m-14-16v16q0 8 14 8v14M45 14v38m0-38q-12 10-8 23h8" fill="none" stroke="white" stroke-width="4"/></svg>';
export async function GET() { return api(async () => {
 const values = await readBrandingValues(); const logo = values.RESTAURANT_LOGO;
 return new Response(logo ? new Uint8Array(Buffer.from(logo, "base64")) : fallback, { headers: { "Content-Type": logo ? "image/png" : "image/svg+xml", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}); }
