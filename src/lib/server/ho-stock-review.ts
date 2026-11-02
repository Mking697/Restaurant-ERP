import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { grnLines, grns, purchaseOrders } from "../../db/schema/purchase";
import { eodStockReports } from "../../db/schema/notifications";
import { hoStockReviewEvents, hoStockReviewSubjects } from "../../db/schema/stock-review";
import { users } from "../../db/schema/auth";
import { auditLog } from "../../db/schema/whatsapp";
import type { Executor } from "./auth";
import { assertModule, branchScope, hoReviewScope, HttpError, type Identity } from "./permissions";
import { quantity } from "./production-quantity";
import { hoSubjectIdentity, isHoSubjectResolved, latestHoReviewEvent, parseHoReviewAction, type HoSubjectType } from "./ho-stock-review-policy";

export async function ensureHoReviewSubject(tx: Executor, input: {
  type: HoSubjectType;
  sourceId: string;
  revision: number;
  branchId: string;
  exception: boolean;
  summary: Record<string, unknown>;
  submittedById: string | null;
}) {
  const id = hoSubjectIdentity(input.type, input.sourceId, input.revision);
  await tx.insert(hoStockReviewSubjects).values({
    id, branchId: input.branchId, subjectType: input.type, sourceId: input.sourceId,
    sourceRevision: input.revision, exception: input.exception, summaryJson: input.summary,
    submittedById: input.submittedById,
  }).onConflictDoNothing();
  const [saved] = await tx.select().from(hoStockReviewSubjects).where(eq(hoStockReviewSubjects.id, id)).limit(1);
  if (!saved || saved.branchId !== input.branchId || saved.subjectType !== input.type || saved.sourceId !== input.sourceId || saved.sourceRevision !== input.revision) {
    throw new HttpError(409, "HO review subject identity conflict");
  }
  return saved;
}

export async function ensureGrnHoReviewSubject(tx: Executor, grnId: string, submittedById: string) {
  const [grn] = await tx.select({
    id: grns.id, branchId: grns.branchId, poId: grns.poId, qualityResult: grns.qualityResult,
    qualityNote: grns.qualityNote, status: grns.status, poNumber: purchaseOrders.poNumber,
  }).from(grns).innerJoin(purchaseOrders, eq(purchaseOrders.id, grns.poId)).where(eq(grns.id, grnId)).limit(1);
  if (!grn || grn.qualityResult === "PENDING") throw new HttpError(409, "Only finalized GRNs enter HO review");
  const lines = await tx.select({ id: grnLines.id, rawMaterialId: grnLines.rawMaterialId, itemDescription: grnLines.itemDescription, qtyOrdered: grnLines.qtyOrdered, qtyReceived: grnLines.qtyReceived, qtyFailed: grnLines.qtyFailed })
    .from(grnLines).where(eq(grnLines.grnId, grnId));
  const shortage = lines.some(line => quantity(line.qtyReceived, true) < quantity(line.qtyOrdered, true));
  const exception = shortage || grn.qualityResult !== "PASS";
  return ensureHoReviewSubject(tx, {
    type: "GRN", sourceId: grn.id, revision: 1, branchId: grn.branchId, exception, submittedById,
    summary: { poId: grn.poId, poNumber: grn.poNumber, qualityResult: grn.qualityResult, qualityNote: grn.qualityNote, status: grn.status, shortage, lines },
  });
}

export async function submitEodReportToHo(tx: Executor, actor: Identity, reportId: string, revision: unknown) {
  assertModule(actor, "INVENTORY");
  const [report] = await tx.select().from(eodStockReports).where(eq(eodStockReports.id, reportId)).limit(1);
  if (!report) throw new HttpError(404, "EOD stock report not found");
  branchScope(actor, report.branchId);
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) throw new HttpError(400, "An exact positive report revision is required");
  if (revision !== report.revision) throw new HttpError(409, "Report revision changed. Reload and review the current revision before submitting to HO.");
  const snapshot = report.snapshotJson as { reportDate?: unknown; rawMaterials?: Array<{ reconciled?: unknown; reorderStatus?: unknown }>; preparedUnavailableCount?: unknown; expiredBatchCount?: unknown; unknownExpiryBatchCount?: unknown };
  const rawExceptions = Array.isArray(snapshot.rawMaterials) ? snapshot.rawMaterials.filter(row => row.reconciled === false || row.reorderStatus === "BELOW_MIN_NO_INBOUND").length : 0;
  const exception = rawExceptions > 0 || Number(snapshot.preparedUnavailableCount ?? 0) > 0 || Number(snapshot.expiredBatchCount ?? 0) > 0 || Number(snapshot.unknownExpiryBatchCount ?? 0) > 0;
  const subjectId = hoSubjectIdentity("EOD_STOCK", report.id, report.revision);
  const [existing] = await tx.select({ id: hoStockReviewSubjects.id }).from(hoStockReviewSubjects).where(eq(hoStockReviewSubjects.id, subjectId)).limit(1);
  const subject = await ensureHoReviewSubject(tx, {
    type: "EOD_STOCK", sourceId: report.id, revision: report.revision, branchId: report.branchId, exception, submittedById: actor.id,
    summary: { reportDate: report.reportDate, revision: report.revision, generationSource: report.generationSource, capturedAt: report.capturedAt, rawExceptions, preparedUnavailableCount: snapshot.preparedUnavailableCount ?? 0, expiredBatchCount: snapshot.expiredBatchCount ?? 0, unknownExpiryBatchCount: snapshot.unknownExpiryBatchCount ?? 0 },
  });
  return { subject, replayed: Boolean(existing) };
}

export async function listHoReviewQueue(tx: Executor, actor: Identity, branchId: string, unresolvedOnly: boolean) {
  const scope = hoReviewScope(actor, branchId);
  const subjects = await tx.select().from(hoStockReviewSubjects)
    .where(and(eq(hoStockReviewSubjects.branchId, scope), unresolvedOnly ? sql`not exists (select 1 from ${hoStockReviewEvents} review_event where review_event.subject_id = ${hoStockReviewSubjects.id} and review_event.action = 'ACKNOWLEDGE')` : undefined))
    .orderBy(desc(hoStockReviewSubjects.submittedAt)).limit(300);
  const subjectIds = subjects.map((subject) => subject.id);
  const eventRows = subjectIds.length ? await tx.select({
    event: hoStockReviewEvents,
    actorName: users.name,
  }).from(hoStockReviewEvents)
    .leftJoin(users, eq(users.id, hoStockReviewEvents.actorId))
    .where(inArray(hoStockReviewEvents.subjectId, subjectIds))
    .orderBy(desc(hoStockReviewEvents.createdAt)) : [];
  const eventsBySubject = new Map<string, Array<typeof eventRows[number]>>();
  for (const row of eventRows) {
    const rows = eventsBySubject.get(row.event.subjectId) ?? [];
    rows.push(row);
    eventsBySubject.set(row.event.subjectId, rows);
  }
  const reviews = subjects.map((subject) => {
    const rows = eventsBySubject.get(subject.id) ?? [];
    const events = rows.map((row) => row.event);
    const latest = latestHoReviewEvent(events);
    const latestRow = latest ? rows.find((row) => row.event.id === latest.id) : undefined;
    const acknowledged = isHoSubjectResolved(events);
    return {
      ...subject,
      acknowledged,
      latestEvent: latest && latestRow ? { ...latest, actorName: latestRow.actorName ?? "" } : null,
      eventCount: events.length,
    };
  }).filter((review) => !unresolvedOnly || !review.acknowledged);
  await tx.insert(auditLog).values({ id: randomUUID(), userId: actor.id, action: "HO_STOCK_REVIEW_QUEUE_READ", entityType: "BRANCH", entityId: scope, metadataJson: { unresolvedOnly, resultCount: reviews.length } });
  return reviews;
}

export async function actOnHoReviewSubject(tx: Executor, actor: Identity, subjectId: string, raw: Record<string, unknown>) {
  const action = parseHoReviewAction(raw);
  const [subject] = await tx.select().from(hoStockReviewSubjects).where(eq(hoStockReviewSubjects.id, subjectId)).limit(1);
  if (!subject) throw new HttpError(404, "HO review subject not found");
  hoReviewScope(actor, subject.branchId);
  const [keyReplay] = await tx.select().from(hoStockReviewEvents).where(eq(hoStockReviewEvents.actionKey, action.actionKey)).limit(1);
  if (keyReplay) {
    if (keyReplay.actorId !== actor.id || keyReplay.subjectId !== subjectId || keyReplay.action !== action.action || keyReplay.reason !== action.reason) throw new HttpError(409, "actionKey was already used for a different HO review action or actor");
    return { event: keyReplay, replayed: true };
  }
  const subjectEvents = await tx.select().from(hoStockReviewEvents).where(eq(hoStockReviewEvents.subjectId, subjectId));
  if (isHoSubjectResolved(subjectEvents)) throw new HttpError(409, "This exact subject revision is already acknowledged");
  const id = randomUUID();
  await tx.insert(hoStockReviewEvents).values({ id, subjectId, action: action.action, actionKey: action.actionKey, reason: action.reason, actorId: actor.id });
  await tx.insert(auditLog).values({ id: randomUUID(), userId: actor.id, action: `HO_STOCK_REVIEW_${action.action}`, entityType: subject.subjectType, entityId: subject.sourceId, metadataJson: { subjectId, branchId: subject.branchId, sourceRevision: subject.sourceRevision, reason: action.reason } });
  const [event] = await tx.select().from(hoStockReviewEvents).where(eq(hoStockReviewEvents.id, id));
  return { event, replayed: false };
}
