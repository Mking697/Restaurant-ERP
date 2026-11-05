import { NextResponse } from "next/server";
import { HttpError } from "./permissions";
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
// Postgres jsonb reorders object keys (and may drop undefined values) on
// storage, so a byte-identical retry request is NOT guaranteed to come
// back out of a jsonb column as the same JSON.stringify() string it went
// in as. Use this for any "is this retry the same request as last time"
// idempotency check against a value read back from a jsonb column.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export async function api(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (process.env.GAP006_DEBUG === "1") console.error("API_DEBUG", error);
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return json({ error: "Record already exists" }, 409);
    if (code === "23503") return json({ error: "Record has linked data or invalid reference" }, 409);
    // Never return database details, SQL, or password material.
    return json({ error: "Database or server unavailable" }, 503);
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Same-origin request required");
}
export async function body(request: Request, maxBytes = 16384): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError(415, "JSON required");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "Request too large"); } chunks.push(value); } }
    finally { reader.releaseLock(); }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let value; try { value = JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
  if (!value || Array.isArray(value) || typeof value !== "object") throw new HttpError(400, "JSON object required");
  return value;
}
export function string(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}
export function phone(value: unknown) {
  const result = string(value, "mobile number", 16);
  // Keep the canonical identifier unchanged so existing accounts, unique keys,
  // WhatsApp delivery and login throttling use the same value in both formats.
  // Tanzanian mobile numbers: 9 digits starting 6 or 7 (local E.164 national
  // number, e.g. 712345678), optionally entered with a leading 0 (0712345678).
  if (/^[67]\d{8}$/.test(result)) return `+255${result}`;
  if (/^0[67]\d{8}$/.test(result)) return `+255${result.slice(1)}`;
  if (/^\+[1-9]\d{7,14}$/.test(result)) return result; // Existing API clients.
  throw new HttpError(400, "Enter a valid Tanzanian mobile number");
}
// Login identity. Plain format check only (no deliverability/MX lookup) —
// matches this project's existing phone() convention of shape-validating,
// never contacting an external service during a request. Always lower-cased
// so "Owner@X.com" and "owner@x.com" are the same account/unique row.
export function email(value: unknown): string {
  const result = string(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, "Enter a valid email address");
  return result;
}
export function numeric(value: unknown, field: string, fallback = "0"): string {
  const result = value === undefined ? fallback : String(value);
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(result)) throw new HttpError(400, `Invalid ${field}`);
  return result;
}
