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

/**
 * GAP-037: a customer's own explicit "stop messaging me" request — phone is
 * the bare 9-digit Tanzanian mobile (same convention as
 * posOrders.customerPhone), NOT a membership identity (no name, no merge/
 * dedup — that is GAP-038's separate, still-PENDING scope). Simply
 * capturing a phone on an order never creates a row here; a row only ever
 * exists because the customer themself clicked the opt-out link that is
 * printed on every outbound customer-facing WhatsApp message. Once present,
 * EVERY future customer-facing send (thank-you, offer broadcast, community
 * join line) to this phone is skipped — see src/lib/server/whatsapp-preferences.ts.
 */
export const whatsAppOptOuts = pgTable("whatsapp_opt_outs", {
  phone: text("phone").primaryKey(),
  optedOutAt: timestamp("opted_out_at", { withTimezone: true }).notNull().defaultNow(),
});
