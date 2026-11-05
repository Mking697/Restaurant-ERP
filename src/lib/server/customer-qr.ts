import { randomBytes, randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { customerQrTokens } from "../../db/schema/customer-qr";
import { customers } from "../../db/schema/customers";
import type { Executor } from "./auth";
import { HttpError, type Identity } from "./permissions";
import { assertEditAuthority } from "./customers";

// GAP-040: a plain random opaque token — NOT a URL, NOT derived from phone/
// name/id, carries no decodable meaning on its own. Same hashing
// convention as session tokens (src/lib/server/auth.ts's tokenHash):
// only the hash is ever persisted; the raw value exists in memory for the
// one response that issues it, then never again.
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function loadActiveCustomer(tx: Executor, customerId: string) {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer || customer.status !== "ACTIVE") throw new HttpError(404, "Active member not found");
  return customer;
}

// GAP-040: issuing a NEW token implicitly revokes any previously ACTIVE one
// for this customer (at most one ACTIVE token per customer — also enforced
// by the DB's own partial unique index as a backstop). A lost/leaked QR is
// invalidated simply by re-issuing; no separate revoke step is required
// (though one still exists — see revokeMemberQrToken). Returns the RAW
// token and a ready-to-display QR PNG data URL — this is the only moment
// the raw token is ever available; it is never retrievable again afterward.
export async function issueMemberQrToken(tx: Executor, actor: Identity, customerId: string) {
  const customer = await loadActiveCustomer(tx, customerId);
  assertEditAuthority(actor, customer);
  await tx.update(customerQrTokens).set({ status: "REVOKED", revokedAt: new Date(), revokedBy: actor.id }).where(eq(customerQrTokens.customerId, customerId));
  const token = generateToken();
  const [row] = await tx.insert(customerQrTokens).values({ id: randomUUID(), customerId, tokenHash: hashToken(token), issuedBy: actor.id }).returning();
  const qrDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: "M" });
  return { id: row.id, token, qrDataUrl, issuedAt: row.issuedAt };
}

export async function revokeMemberQrToken(tx: Executor, actor: Identity, customerId: string) {
  const customer = await loadActiveCustomer(tx, customerId);
  assertEditAuthority(actor, customer);
  const [active] = await tx.select().from(customerQrTokens).where(eq(customerQrTokens.customerId, customerId)).limit(1);
  if (!active || active.status !== "ACTIVE") return null; // already revoked / never issued — safe no-op
  const [row] = await tx.update(customerQrTokens).set({ status: "REVOKED", revokedAt: new Date(), revokedBy: actor.id }).where(eq(customerQrTokens.id, active.id)).returning();
  return row;
}

// GAP-040: resolves a SCANNED/typed raw token to a member's basic identity
// ONLY — this function does not authorize a redemption, a sale, or any
// other high-value action by itself; it is exactly equivalent to a staff
// member typing the customer's phone number in manually (see GAP-038's
// searchCustomers). Any specific action taken next (e.g. GAP-039's
// redeemPoints) carries out its own independent authorization check.
// Unknown and revoked tokens return the exact SAME generic error — no
// detail is ever leaked about which case occurred.
export async function lookupMemberByQrToken(tx: Executor, rawToken: string) {
  if (typeof rawToken !== "string" || !rawToken.trim()) throw new HttpError(400, "Scan or enter a membership code");
  const [row] = await tx.select().from(customerQrTokens).where(eq(customerQrTokens.tokenHash, hashToken(rawToken.trim()))).limit(1);
  if (!row || row.status !== "ACTIVE") throw new HttpError(404, "Unknown or revoked membership code");
  const [customer] = await tx.select().from(customers).where(eq(customers.id, row.customerId)).limit(1);
  if (!customer || customer.status !== "ACTIVE") throw new HttpError(404, "Unknown or revoked membership code");
  return customer;
}
