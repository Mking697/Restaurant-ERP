import { createHash } from "node:crypto";
export type Branding = { name: string; logoUrl: string | null };
export function publicBranding(values: Record<string, string>): Branding {
  const name = values.RESTAURANT_NAME?.trim() || "Restaurant";
  const logo = values.RESTAURANT_LOGO || "";
  return { name, logoUrl: logo ? `/api/branding/logo?v=${createHash("sha256").update(Buffer.from(logo, "base64")).digest("hex")}` : null };
}
