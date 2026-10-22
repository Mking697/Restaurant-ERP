import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const waMessageDirectionEnum = pgEnum("wa_message_direction", ["INBOUND", "OUTBOUND"]);

export const whatsAppMessageLog = pgTable(
  "whatsapp_message_log",
  {
    id: text("id").primaryKey(),
    direction: waMessageDirectionEnum("direction").notNull(),
    fromPhone: text("from_phone").notNull(),
    toPhone: text("to_phone").notNull(),
    waMessageId: text("wa_message_id").unique(),
    messageType: text("message_type").notNull(), // TEXT, INTERACTIVE, MEDIA, TEMPLATE
    payloadJson: jsonb("payload_json").notNull(),
    relatedEntityType: text("related_entity_type").notNull().default(""), // "Indent", "TaskInstance", "GRN"...
    relatedEntityId: text("related_entity_id").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("whatsapp_log_related_entity_idx").on(table.relatedEntityType, table.relatedEntityId),
    index("whatsapp_log_from_phone_idx").on(table.fromPhone),
  ]
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_entity_idx").on(table.entityType, table.entityId)]
);
