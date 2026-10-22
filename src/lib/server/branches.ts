import { HttpError } from "./permissions";
import { string } from "./http";
export function branchInput(input: Record<string, unknown>) {
  const name = string(input.name, "name"); const code = string(input.code, "code", 30);
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new HttpError(400, "Invalid branch code");
  const address = input.address === undefined ? "" : typeof input.address === "string" && input.address.length <= 1000 ? input.address : null;
  if (address === null) throw new HttpError(400, "Invalid address");
  const lat = Number(input.lat ?? 0), lng = Number(input.lng ?? 0), geofenceRadiusM = Number(input.geofenceRadiusM ?? 50);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isInteger(geofenceRadiusM) || geofenceRadiusM < 1 || geofenceRadiusM > 10000) throw new HttpError(400, "Invalid branch coordinates or geofence");
  return { name, code, address, lat: String(lat), lng: String(lng), geofenceRadiusM };
}
