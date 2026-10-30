import { createHash, timingSafeEqual } from "node:crypto";

// Shared bearer-secret check for every machine-to-machine cron endpoint in
// this app (task generation/escalation/reminders, daily summary, ...).
// Authorization is a single shared secret (env var CRON_SECRET, never
// logged/returned) compared via a fixed-length digest + timingSafeEqual —
// this never branches on the raw provided/secret length. No session/cookie
// auth is read or accepted here at all, by construction: this function
// never looks at the `cookie` header or calls requireIdentity — any browser
// session, regardless of role, is simply irrelevant to any cron endpoint.
export function validCronSecret(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false; // fail closed if misconfigured
  const providedDigest = createHash("sha256").update(provided).digest();
  const secretDigest = createHash("sha256").update(secret).digest();
  return timingSafeEqual(providedDigest, secretDigest);
}
