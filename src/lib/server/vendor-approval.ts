import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { vendors, vendorReviewEvents } from "../../db/schema/vendors";
import type { Executor } from "./auth";
import { assertOwner, HttpError, type Identity } from "./permissions";

// GAP-015. Approved vendor onboarding and enforcement. See
// src/db/schema/vendors.ts for the full design note (Owner decisions,
// one-time existing-vendor cutover). This module is the ONLY place that
// decides vendor eligibility for NEW purchasing — assertVendorEligible is
// called from inside the SAME locked mutate() transaction that creates a
// Purchase Order, so a concurrent suspension and a concurrent new-PO
// attempt cannot race: whichever commits first inside the global advisory
// lock is the one the other sees.

function parseScope(raw: Record<string, unknown>) {
  const branchId = raw.branchId === null || raw.branchId === undefined ? null : raw.branchId;
  const category = raw.category === null || raw.category === undefined ? null : raw.category;
  if (branchId !== null && (typeof branchId !== "string" || !branchId)) throw new HttpError(400, "branchId must be a non-empty string or null (null = all branches)");
  if (category !== null && (typeof category !== "string" || !category)) throw new HttpError(400, "category must be a non-empty string or null (null = all categories)");
  const reason = typeof raw.reason === "string" ? raw.reason : "";
  return { branchId: branchId as string | null, category: category as string | null, reason };
}

export async function approveVendor(tx: Executor, actor: Identity, vendorId: string, raw: Record<string, unknown>) {
  assertOwner(actor);
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new HttpError(404, "Vendor not found");
  const { branchId, category, reason } = parseScope(raw);
  await tx.update(vendors).set({ status: "APPROVED", approvedBranchId: branchId, approvedCategory: category }).where(eq(vendors.id, vendorId));
  await tx.insert(vendorReviewEvents).values({ id: randomUUID(), vendorId, action: "APPROVE", actorId: actor.id, reason, branchIdAtReview: branchId, categoryAtReview: category });
  const [updated] = await tx.select().from(vendors).where(eq(vendors.id, vendorId));
  return updated;
}

export async function suspendVendor(tx: Executor, actor: Identity, vendorId: string, raw: Record<string, unknown>) {
  assertOwner(actor);
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new HttpError(404, "Vendor not found");
  const reason = typeof raw.reason === "string" ? raw.reason : "";
  await tx.update(vendors).set({ status: "SUSPENDED" }).where(eq(vendors.id, vendorId));
  await tx.insert(vendorReviewEvents).values({ id: randomUUID(), vendorId, action: "SUSPEND", actorId: actor.id, reason, branchIdAtReview: vendor.approvedBranchId, categoryAtReview: vendor.approvedCategory });
  const [updated] = await tx.select().from(vendors).where(eq(vendors.id, vendorId));
  return updated;
}

export async function listVendorReviewEvents(tx: Executor, vendorId: string) {
  return tx.select().from(vendorReviewEvents).where(eq(vendorReviewEvents.vendorId, vendorId)).orderBy(desc(vendorReviewEvents.createdAt)).limit(100);
}

// Called from inside the Purchase Order creation transaction
// (src/app/api/purchase/orders/route.ts) — NEVER a separate pre-check, so
// there is no gap between "checked eligible" and "actually wrote the PO"
// for a concurrent suspension to land in. categories is empty for a
// general purchase (no raw-material category to restrict against — only
// the branch scope applies there).
export async function assertVendorEligible(tx: Executor, vendorId: string, branchId: string, categories: string[]) {
  const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new HttpError(400, "Vendor not found");
  if (vendor.status !== "APPROVED") throw new HttpError(409, `Vendor "${vendor.name}" is ${vendor.status}, not approved for purchasing`);
  if (vendor.approvedBranchId && vendor.approvedBranchId !== branchId) throw new HttpError(409, `Vendor "${vendor.name}" is not approved for this branch`);
  if (vendor.approvedCategory) {
    const mismatched = categories.filter((c) => c !== vendor.approvedCategory);
    if (mismatched.length) throw new HttpError(409, `Vendor "${vendor.name}" is only approved for category "${vendor.approvedCategory}", not ${mismatched.join(", ")}`);
  }
}
