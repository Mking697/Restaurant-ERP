import { createHash } from "node:crypto";
/** Mirrors publicBranding's cache-busting URL scheme, scoped to one branch's own logo endpoint. */
export function brandLogoUrl(branchId: string, brandLogo: string | null | undefined): string | null {
  if (!brandLogo) return null;
  return `/api/branches/${branchId}/logo?v=${createHash("sha256").update(Buffer.from(brandLogo, "base64")).digest("hex")}`;
}
