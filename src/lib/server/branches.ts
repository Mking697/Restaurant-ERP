import { HttpError } from "./permissions";
import { string } from "./http";
import { branchConcept } from "./pos-order-policy";
import { normalizeLogo } from "./branding-input";
export function branchInput(input: Record<string, unknown>) {
  const name = string(input.name, "name"); const code = string(input.code, "code", 30);
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new HttpError(400, "Invalid branch code");
  const address = input.address === undefined ? "" : typeof input.address === "string" && input.address.length <= 1000 ? input.address : null;
  if (address === null) throw new HttpError(400, "Invalid address");
  const lat = Number(input.lat ?? 0), lng = Number(input.lng ?? 0), geofenceRadiusM = Number(input.geofenceRadiusM ?? 50);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isInteger(geofenceRadiusM) || geofenceRadiusM < 1 || geofenceRadiusM > 10000) throw new HttpError(400, "Invalid branch coordinates or geofence");
  // vatRatePercent is an OPTIONAL per-branch VAT rate override (Tanzania TRA
  // flat rate is 18% by default on each menu item) — null/empty/undefined
  // means "no override, use each item's own rate". A branch Owner/Admin can
  // set it to any valid 0-100 rate with up to 2 decimals.
  const rawVatOverride = input.vatRatePercent;
  let vatRatePercent: string | null = null;
  if (rawVatOverride !== undefined && rawVatOverride !== null && rawVatOverride !== "") {
    const value = typeof rawVatOverride === "number" ? rawVatOverride.toFixed(2) : String(rawVatOverride);
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(value) || Number(value) < 0 || Number(value) > 100) throw new HttpError(400, "Invalid VAT rate override");
    vatRatePercent = Number(value).toFixed(2);
  }
  const operatingConcept = branchConcept(input.operatingConcept);
  // brandName is an OPTIONAL per-branch override of the global Restaurant
  // Branding name (e.g. a chain running two distinct brands under one ERP).
  // undefined preserves the existing value on edit; null/"" clears it back
  // to "use the global branding name" — same convention as vatRatePercent.
  let brandName: string | null | undefined = undefined;
  if (input.brandName !== undefined) {
    if (input.brandName === null || input.brandName === "") brandName = null;
    else if (typeof input.brandName === "string" && input.brandName.trim().length <= 100 && !/[\x00-\x1f\x7f]/.test(input.brandName)) brandName = input.brandName.trim();
    else throw new HttpError(400, "Invalid brand name");
  }
  return { name, code, address, lat: String(lat), lng: String(lng), geofenceRadiusM, vatRatePercent, operatingConcept, ...(brandName === undefined ? {} : { brandName }) };
}
/** Mirrors brandingInput's logo handling (undefined = unchanged, null = clear, object = replace), reusing the same strict PNG/JPEG/WebP decode+resize pipeline. */
export async function branchLogoInput(value: unknown): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return "";
  return normalizeLogo(value);
}
