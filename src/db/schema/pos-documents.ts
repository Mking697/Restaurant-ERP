import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgSequence, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branches } from "./platform";
import { posOrders } from "./pos";
import { users } from "./auth";
import type { Document } from "../../lib/pos-documents";

export const posDocumentNumberSeq = pgSequence("pos_document_number_seq", { startWith: "1", increment: "1", cycle: false });
export const posDocuments = pgTable("pos_documents", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  kind: text("kind").$type<Document["kind"]>().notNull(),
  number: text("number").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  sourceType: text("source_type").$type<Document["sourceType"]>().notNull(),
  sourceId: text("source_id").notNull(),
  sourceRevision: integer("source_revision").notNull(),
  orderId: text("order_id").references(() => posOrders.id),
  proformaId: text("proforma_id"),
  snapshot: jsonb("snapshot").$type<Document>().notNull(),
}, table => [uniqueIndex("pos_documents_number_unique").on(table.number), uniqueIndex("pos_documents_final_order_unique").on(table.orderId).where(sql`${table.kind} = 'FINAL'`), index("pos_documents_source_idx").on(table.sourceType, table.sourceId), index("pos_documents_branch_issued_idx").on(table.branchId, table.issuedAt)]);
export const posDocumentRequests = pgTable("pos_document_requests", {
  id: text("id").primaryKey(), branchId: text("branch_id").notNull().references(() => branches.id),
  actorId: text("actor_id").notNull().references(() => users.id), requestKey: text("request_key").notNull(),
  sourceType: text("source_type").$type<Document["sourceType"]>().notNull(), sourceId: text("source_id").notNull(),
  expectedRevision: integer("expected_revision").notNull(), requestJson: jsonb("request_json").notNull(),
  documentId: text("document_id").notNull().references(() => posDocuments.id),
}, table => [uniqueIndex("pos_document_requests_branch_key_unique").on(table.branchId, table.requestKey)]);
