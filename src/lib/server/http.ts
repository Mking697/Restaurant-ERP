import { NextResponse } from "next/server";
import { HttpError } from "./permissions";
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export async function api(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
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
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new HttpError(415, "JSON required");
  const text = await request.text();
  if (Buffer.byteLength(text) > 16384) throw new HttpError(413, "Request too large");
  let value; try { value = JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
  if (!value || Array.isArray(value) || typeof value !== "object") throw new HttpError(400, "JSON object required");
  return value;
}
export function string(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpError(400, `Invalid ${field}`);
  return value.trim();
}
export function phone(value: unknown) { const result = string(value, "phoneE164", 16); if (!/^\+[1-9]\d{7,14}$/.test(result)) throw new HttpError(400, "Use E.164 phone, e.g. +919876543210"); return result; }
export function numeric(value: unknown, field: string, fallback = "0"): string {
  const result = value === undefined ? fallback : String(value);
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(result)) throw new HttpError(400, `Invalid ${field}`);
  return result;
}
