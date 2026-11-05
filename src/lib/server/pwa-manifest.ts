import { readBranding } from "./branding";

export type PwaAppKey = "waiter" | "kitchen" | "pos";

const APPS: Record<PwaAppKey, { path: string; shortName: string; description: string }> = {
  waiter: { path: "/waiter", shortName: "Waiter", description: "Take table orders and send them straight to the kitchen." },
  kitchen: { path: "/kitchen", shortName: "Kitchen", description: "Live kitchen/bar preparation queue." },
  pos: { path: "/pos", shortName: "POS", description: "Billing, payments and order history." },
};

export async function buildPwaManifest(key: PwaAppKey) {
  const branding = await readBranding();
  const app = APPS[key];
  const iconUrl = branding.logoUrl ?? "/api/branding/logo?v=default";
  const iconType = branding.logoUrl ? "image/png" : "image/svg+xml";
  return {
    name: `${branding.name} — ${app.shortName}`,
    short_name: app.shortName,
    description: app.description,
    id: app.path,
    start_url: app.path,
    scope: app.path,
    display: "standalone" as const,
    orientation: "portrait" as const,
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      { src: iconUrl, sizes: "192x192", type: iconType, purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: iconType, purpose: "any" },
    ],
  };
}
