import { db } from "@/db/client";
import { api, assertSameOrigin, body, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import { validOptionalPhone } from "@/lib/server/whatsapp-triggers";
import { optOutPhone } from "@/lib/server/whatsapp-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-037: PUBLIC, unauthenticated by design — the customer who received a
// WhatsApp message is, by definition, not a logged-in staff user. Same-origin
// is still required (the link always opens our own /whatsapp-optout page,
// which calls this). Opting out is a privacy-positive action with no
// destructive blast radius beyond "this phone receives no more messages
// from us" — there is deliberately no PIN/OTP step in front of it, same as
// a plain "unsubscribe" link convention everywhere else.
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const input = await body(request);
    const raw = typeof input.phone === "string" ? input.phone : "";
    if (!raw) throw new HttpError(400, "Phone number required");
    const phoneDigits = validOptionalPhone(raw);
    if (!phoneDigits) throw new HttpError(400, "Phone number required");
    await optOutPhone(db, phoneDigits);
    return json({ optedOut: true });
  });
}
