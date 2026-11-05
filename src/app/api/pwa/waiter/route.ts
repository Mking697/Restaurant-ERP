import { buildPwaManifest } from "@/lib/server/pwa-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = await buildPwaManifest("waiter");
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json" } });
}
