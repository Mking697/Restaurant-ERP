import { randomUUID } from "node:crypto";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { customers } from "../../db/schema/customers";
import type { Executor } from "./auth";
import { HttpError, type Identity } from "./permissions";
import { requiredPhone } from "./whatsapp-triggers";
import { isOptedOut } from "./whatsapp-preferences";

function nameText(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Invalid name");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) throw new HttpError(400, "Name required (max 80 characters)");
  return trimmed;
}

// GAP-038: Branch Manager may edit/merge only members THEY (their branch)
// originally registered; Owner may edit/merge any. Owner decision this
// session — membership identity itself is global/shared, but edit/merge
// authority stays branch-scoped for a non-Owner. Exported for reuse by
// GAP-040 (QR issuance/revocation is the same membership-management
// authority class as a name edit or a merge).
export function assertEditAuthority(actor: Identity, customer: typeof customers.$inferSelect) {
  if (actor.role === "SUPER_ADMIN") return;
  if (actor.role === "BRANCH_MANAGER" && actor.branchId && actor.branchId === customer.createdBranchId) return;
  throw new HttpError(403, "Only the registering branch's Manager or the Owner may edit/merge this member");
}

// Idempotent find-or-create by normalized phone — resolves the "two
// concurrent registrations with equivalent phone variants" race to ONE
// row at the database's own unique-index layer (23505), never a second
// identity. The caller never needs to pre-check existence themselves.
export async function findOrCreateCustomer(tx: Executor, actor: Identity, branchId: string, input: { phone: unknown; name: unknown }): Promise<{ customer: typeof customers.$inferSelect; created: boolean }> {
  const phone = requiredPhone(input.phone);
  const name = nameText(input.name);
  const [existing] = await tx.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  if (existing) return { customer: existing, created: false };
  try {
    const [row] = await tx.insert(customers).values({ id: randomUUID(), phone, name, createdBranchId: branchId, createdBy: actor.id }).returning();
    return { customer: row, created: true };
  } catch (error) {
    // A genuine race: another request inserted the same phone between our
    // read and our insert. Re-read instead of surfacing a raw 23505 — the
    // caller asked for "find or create", and the record now exists either way.
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code !== "23505") throw error;
    const [row] = await tx.select().from(customers).where(eq(customers.phone, phone)).limit(1);
    if (!row) throw error;
    return { customer: row, created: false };
  }
}

// Read-only, global — any POS_CASHIER-module staff may search ANY ACTIVE
// member regardless of which branch registered them (membership is shared,
// owner decision this session). A MERGED record is excluded from normal
// search results — its surviving record is what should be found instead.
export async function searchCustomers(tx: Executor, query: string, limit = 20) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/\D/g, "");
  const conditions = [eq(customers.status, "ACTIVE")];
  const matchers = digits.length >= 3 ? [sql`${customers.phone} like ${"%" + digits + "%"}`, sql`${customers.name} ilike ${"%" + trimmed + "%"}`] : [sql`${customers.name} ilike ${"%" + trimmed + "%"}`];
  conditions.push(or(...matchers)!);
  return tx.select().from(customers).where(and(...conditions)).limit(limit);
}

export async function getCustomerWithConsent(tx: Executor, id: string) {
  const [row] = await tx.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Member not found");
  return { ...row, whatsappOptedOut: await isOptedOut(tx, row.phone) };
}

export async function updateCustomerName(tx: Executor, actor: Identity, id: string, name: unknown) {
  const [row] = await tx.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Member not found");
  if (row.status === "MERGED") throw new HttpError(409, "This member record was merged — edit the surviving record instead");
  assertEditAuthority(actor, row);
  const [updated] = await tx.update(customers).set({ name: nameText(name), updatedAt: new Date() }).where(eq(customers.id, id)).returning();
  return updated;
}

// Folds `id` INTO `intoId` — `id` becomes MERGED (never re-usable, never
// re-merged), `intoId` is untouched. Both directions of edit authority are
// checked (a Branch Manager may only merge records they themselves may
// edit); merging into self, into an already-merged record, or merging an
// already-merged record again are all rejected.
export async function mergeCustomers(tx: Executor, actor: Identity, id: string, intoId: unknown) {
  if (typeof intoId !== "string" || !intoId) throw new HttpError(400, "Target member (intoId) required");
  if (intoId === id) throw new HttpError(400, "Cannot merge a member into itself");
  const [from] = await tx.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!from) throw new HttpError(404, "Member not found");
  if (from.status === "MERGED") throw new HttpError(409, "This member record is already merged");
  const [into] = await tx.select().from(customers).where(eq(customers.id, intoId)).limit(1);
  if (!into) throw new HttpError(404, "Target member not found");
  if (into.status === "MERGED") throw new HttpError(409, "Cannot merge into an already-merged record — use its surviving record");
  assertEditAuthority(actor, from);
  assertEditAuthority(actor, into);
  const [updated] = await tx.update(customers).set({ status: "MERGED", mergedIntoId: intoId, updatedAt: new Date() }).where(and(eq(customers.id, id), ne(customers.id, intoId))).returning();
  return updated;
}
