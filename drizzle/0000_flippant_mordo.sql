CREATE TYPE "public"."role" AS ENUM('SUPER_ADMIN', 'CENTRAL_STORE_MGR', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN_STAFF');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('Active', 'Inactive');--> statement-breakpoint
CREATE TYPE "public"."grn_quality_result" AS ENUM('PENDING', 'PASS', 'FAIL', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."grn_status" AS ENUM('PENDING', 'RECEIVED', 'QUALITY_HOLD', 'APPROVED');--> statement-breakpoint
CREATE TYPE "public"."indent_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PO_RAISED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'THREE_WAY_LOCKED', 'APPROVED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('CREATED', 'SENT', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."checklist_outcome_type" AS ENUM('', 'DONE', 'PASS_FAIL', 'PASS_FAIL_QTY', 'NUMBER', 'TEXT', 'ATTACHMENT');--> statement-breakpoint
CREATE TYPE "public"."checklist_run_status" AS ENUM('PENDING', 'ON_TIME', 'DELAY_DONE', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."checklist_template_status" AS ENUM('Active', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('Active', 'Paused');--> statement-breakpoint
CREATE TYPE "public"."task_frequency" AS ENUM('DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDING', 'IN_PROGRESS', 'DONE', 'OVERDUE', 'ESCALATED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('RECURRING', 'ONE_TIME');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('DINE_IN', 'TAKEAWAY', 'SWIGGY', 'ZOMATO');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('COMPLETED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."petty_cash_entry_type" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."wa_message_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"lat" numeric NOT NULL,
	"lng" numeric NOT NULL,
	"geofence_radius_m" integer DEFAULT 50 NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"cloned_from_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"role" "role" NOT NULL,
	"branch_id" text,
	"password_hash" text,
	"status" "user_status" DEFAULT 'Active' NOT NULL,
	"module_access" text[] DEFAULT '{}' NOT NULL,
	"reporting_manager_id" text DEFAULT '' NOT NULL,
	"deactivated_at" timestamp with time zone,
	"token_version" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bom_recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"qty_per_unit" numeric(10, 3) NOT NULL,
	"locked_by_hq" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"is_high_value" boolean DEFAULT false NOT NULL,
	"shelf_life_days" numeric,
	CONSTRAINT "raw_materials_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"rate" numeric(10, 2) NOT NULL,
	"locked_by_user_id" text DEFAULT '' NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"qty_on_hand" numeric(12, 3) NOT NULL,
	"min_stock_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"max_stock_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "night_variance_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"shift_date" date NOT NULL,
	"theoretical_qty" numeric(12, 3) NOT NULL,
	"physical_qty" numeric(12, 3) NOT NULL,
	"variance_qty" numeric(12, 3) NOT NULL,
	"variance_value_inr" numeric(12, 2) NOT NULL,
	"chef_on_duty_id" text NOT NULL,
	"flagged_pilferage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"batch_no" text NOT NULL,
	"qty_received" numeric(12, 3) NOT NULL,
	"qty_remaining" numeric(12, 3) NOT NULL,
	"expiry_date" date,
	"grn_line_id" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wastage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"batch_id" text DEFAULT '' NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"reason" text NOT NULL,
	"photo_url" text NOT NULL,
	"logged_by_id" text NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grn_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"grn_id" text NOT NULL,
	"raw_material_id" text,
	"item_description" text DEFAULT '' NOT NULL,
	"qty_ordered" numeric(12, 3) NOT NULL,
	"qty_received" numeric(12, 3) NOT NULL,
	"qty_failed" numeric(12, 3) DEFAULT '0' NOT NULL,
	"rate_ordered" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grns" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"received_by_id" text NOT NULL,
	"status" "grn_status" DEFAULT 'PENDING' NOT NULL,
	"quality_result" "grn_quality_result" DEFAULT 'PENDING' NOT NULL,
	"quality_photo_url" text DEFAULT '' NOT NULL,
	"quality_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "indent_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"indent_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "indents" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"raised_by_id" text NOT NULL,
	"status" "indent_status" DEFAULT 'DRAFT' NOT NULL,
	"daily_avg_qty_json" jsonb,
	"spike_percent" numeric(5, 2),
	"approved_by_id" text,
	"wa_approval_msg_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"grn_id" text NOT NULL,
	"grn_line_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"qty_returned" numeric(12, 3) NOT NULL,
	"refund_amount_inr" numeric(12, 2) NOT NULL,
	"reason_note" text DEFAULT '' NOT NULL,
	"submitted_to_accounts_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"raw_material_id" text,
	"item_description" text DEFAULT '' NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"rate" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"branch_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"indent_id" text,
	"is_general_purchase" boolean DEFAULT false NOT NULL,
	"status" "po_status" DEFAULT 'CREATED' NOT NULL,
	"bought_at" timestamp with time zone,
	"pdf_url" text DEFAULT '' NOT NULL,
	"bill_uploaded_at" timestamp with time zone,
	"material_received_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "three_way_match" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"grn_id" text NOT NULL,
	"matched" boolean DEFAULT false NOT NULL,
	"mismatch_reason" text DEFAULT '' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"locked_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	CONSTRAINT "three_way_match_po_id_unique" UNIQUE("po_id"),
	CONSTRAINT "three_way_match_grn_id_unique" UNIQUE("grn_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendor_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"photo_url" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checklist_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"template_id" text NOT NULL,
	"template_name" text DEFAULT '' NOT NULL,
	"context_ref" text DEFAULT '' NOT NULL,
	"step_no" integer NOT NULL,
	"step_name" text NOT NULL,
	"assigned_to_id" text,
	"started_at" timestamp with time zone,
	"tat_deadline" timestamp with time zone,
	"status" "checklist_run_status" DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp with time zone,
	"outcome" text DEFAULT '' NOT NULL,
	"proof_photo_url" text DEFAULT '' NOT NULL,
	"remark" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checklist_templates" (
	"template_id" text NOT NULL,
	"branch_id" text,
	"template_name" text NOT NULL,
	"trigger_event" text DEFAULT 'MANUAL' NOT NULL,
	"status" "checklist_template_status" DEFAULT 'Active' NOT NULL,
	"step_no" integer NOT NULL,
	"step_name" text NOT NULL,
	"assigned_to_role" text DEFAULT '' NOT NULL,
	"tat_value" numeric,
	"tat_unit" text DEFAULT '' NOT NULL,
	"outcome_options" text DEFAULT '' NOT NULL,
	"next_step_map" jsonb,
	"outcome_type" "checklist_outcome_type" DEFAULT '' NOT NULL,
	"requires_photo" boolean DEFAULT true NOT NULL,
	"requires_geofence" boolean DEFAULT false NOT NULL,
	"notify_on_complete" text[] DEFAULT '{}' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_templates_template_id_step_no_pk" PRIMARY KEY("template_id","step_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holiday_calendar" (
	"branch_id" text NOT NULL,
	"date" date NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	CONSTRAINT "holiday_calendar_branch_id_date_pk" PRIMARY KEY("branch_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_task_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assigned_to_id" text NOT NULL,
	"assigned_by_id" text NOT NULL,
	"frequency" "task_frequency" NOT NULL,
	"assign_date" timestamp with time zone NOT NULL,
	"shift_time" text DEFAULT '09:00' NOT NULL,
	"attachment_hint" boolean DEFAULT true NOT NULL,
	"requires_geofence" boolean DEFAULT true NOT NULL,
	"status" "recurring_status" DEFAULT 'Active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"recurring_definition_id" text DEFAULT '' NOT NULL,
	"branch_id" text NOT NULL,
	"type" "task_type" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assigned_to_id" text NOT NULL,
	"delegated_by_id" text,
	"priority" "task_priority",
	"voice_note_url" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "task_status" DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp with time zone,
	"attachment_url" text DEFAULT '' NOT NULL,
	"overdue_escalated_at" timestamp with time zone,
	"mis_penalty_points" numeric(5, 2),
	"natural_cycle_start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_instance_id" text NOT NULL,
	"photo_url" text NOT NULL,
	"lat" numeric NOT NULL,
	"lng" numeric NOT NULL,
	"distance_from_branch_m" numeric NOT NULL,
	"within_geofence" boolean NOT NULL,
	"exif_timestamp" timestamp with time zone NOT NULL,
	"liveness_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_proofs_task_instance_id_unique" UNIQUE("task_instance_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_drops" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"cashier_id" text NOT NULL,
	"shift_date" timestamp with time zone NOT NULL,
	"expected_cash_inr" numeric(10, 2) NOT NULL,
	"note_500_count" integer DEFAULT 0 NOT NULL,
	"note_200_count" integer DEFAULT 0 NOT NULL,
	"note_100_count" integer DEFAULT 0 NOT NULL,
	"note_50_count" integer DEFAULT 0 NOT NULL,
	"note_20_count" integer DEFAULT 0 NOT NULL,
	"note_10_count" integer DEFAULT 0 NOT NULL,
	"coins_inr" numeric(10, 2) DEFAULT '0' NOT NULL,
	"counted_cash_inr" numeric(10, 2) NOT NULL,
	"shortage_excess_inr" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reference_cash_drop_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"alert_type" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"sent_to_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"order_number" text NOT NULL,
	"channel" "order_channel" NOT NULL,
	"table_no" text DEFAULT '' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"tender_type" text NOT NULL,
	"status" "order_status" DEFAULT 'COMPLETED' NOT NULL,
	"void_reason" text DEFAULT '' NOT NULL,
	"cashier_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aggregator_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"channel" text NOT NULL,
	"order_value" numeric(10, 2) NOT NULL,
	"commission_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"ads_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"refund_penalty" numeric(10, 2) DEFAULT '0' NOT NULL,
	"net_payout" numeric(10, 2) NOT NULL,
	"order_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branch_financials" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"revenue" numeric(14, 2) NOT NULL,
	"cogs" numeric(14, 2) NOT NULL,
	"labor_cost" numeric(14, 2) NOT NULL,
	"prime_cost" numeric(14, 2) NOT NULL,
	"prime_cost_percent" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"debit_account_id" text NOT NULL,
	"credit_account_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference_type" text DEFAULT '' NOT NULL,
	"reference_id" text DEFAULT '' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "ledger_account_type" NOT NULL,
	"branch_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ledger_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "petty_cash_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"logged_by_id" text NOT NULL,
	"entry_type" "petty_cash_entry_type" DEFAULT 'OUT' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"photo_url" text DEFAULT '' NOT NULL,
	"wa_message_id" text DEFAULT '' NOT NULL,
	"daily_cap_inr" numeric(10, 2) DEFAULT '2000' NOT NULL,
	"balance_after_inr" numeric(10, 2) DEFAULT '0' NOT NULL,
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mis_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"user_id" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"task_score" numeric(5, 2) NOT NULL,
	"delegation_score" numeric(5, 2) NOT NULL,
	"variance_score" numeric(5, 2) NOT NULL,
	"cashier_score" numeric(5, 2) NOT NULL,
	"total_score" numeric(5, 2) NOT NULL,
	"on_time_count" integer DEFAULT 0 NOT NULL,
	"delay_count" integer DEFAULT 0 NOT NULL,
	"not_done_count" integer DEFAULT 0 NOT NULL,
	"rank" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_message_log" (
	"id" text PRIMARY KEY NOT NULL,
	"direction" "wa_message_direction" NOT NULL,
	"from_phone" text NOT NULL,
	"to_phone" text NOT NULL,
	"wa_message_id" text,
	"message_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"related_entity_type" text DEFAULT '' NOT NULL,
	"related_entity_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_message_log_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bom_recipes" ADD CONSTRAINT "bom_recipes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bom_recipes" ADD CONSTRAINT "bom_recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bom_recipes" ADD CONSTRAINT "bom_recipes_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_rates" ADD CONSTRAINT "vendor_rates_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "night_variance_entries" ADD CONSTRAINT "night_variance_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "night_variance_entries" ADD CONSTRAINT "night_variance_entries_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "night_variance_entries" ADD CONSTRAINT "night_variance_entries_chef_on_duty_id_users_id_fk" FOREIGN KEY ("chef_on_duty_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage_logs" ADD CONSTRAINT "wastage_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage_logs" ADD CONSTRAINT "wastage_logs_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wastage_logs" ADD CONSTRAINT "wastage_logs_logged_by_id_users_id_fk" FOREIGN KEY ("logged_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grns" ADD CONSTRAINT "grns_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_indent_id_indents_id_fk" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indents" ADD CONSTRAINT "indents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indents" ADD CONSTRAINT "indents_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indents" ADD CONSTRAINT "indents_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_grn_line_id_grn_lines_id_fk" FOREIGN KEY ("grn_line_id") REFERENCES "public"."grn_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_indent_id_indents_id_fk" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "three_way_match" ADD CONSTRAINT "three_way_match_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "three_way_match" ADD CONSTRAINT "three_way_match_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "holiday_calendar" ADD CONSTRAINT "holiday_calendar_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_task_definitions" ADD CONSTRAINT "recurring_task_definitions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_task_definitions" ADD CONSTRAINT "recurring_task_definitions_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recurring_task_definitions" ADD CONSTRAINT "recurring_task_definitions_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_delegated_by_id_users_id_fk" FOREIGN KEY ("delegated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_proofs" ADD CONSTRAINT "task_proofs_task_instance_id_task_instances_id_fk" FOREIGN KEY ("task_instance_id") REFERENCES "public"."task_instances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_drops" ADD CONSTRAINT "cash_drops_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_drops" ADD CONSTRAINT "cash_drops_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_ledger" ADD CONSTRAINT "employee_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_ledger" ADD CONSTRAINT "employee_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_ledger" ADD CONSTRAINT "employee_ledger_reference_cash_drop_id_cash_drops_id_fk" FOREIGN KEY ("reference_cash_drop_id") REFERENCES "public"."cash_drops"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_alerts" ADD CONSTRAINT "pos_alerts_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_alerts" ADD CONSTRAINT "pos_alerts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_order_lines" ADD CONSTRAINT "pos_order_lines_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_order_lines" ADD CONSTRAINT "pos_order_lines_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "aggregator_orders" ADD CONSTRAINT "aggregator_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branch_financials" ADD CONSTRAINT "branch_financials_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_debit_account_id_ledger_accounts_id_fk" FOREIGN KEY ("debit_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_credit_account_id_ledger_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "petty_cash_entries" ADD CONSTRAINT "petty_cash_entries_logged_by_id_users_id_fk" FOREIGN KEY ("logged_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mis_scores" ADD CONSTRAINT "mis_scores_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mis_scores" ADD CONSTRAINT "mis_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branches_code_idx" ON "branches" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_branch_id_idx" ON "users" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bom_recipes_branch_menu_raw_unique" ON "bom_recipes" USING btree ("branch_id","menu_item_id","raw_material_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bom_recipes_branch_id_idx" ON "bom_recipes" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_branch_id_idx" ON "menu_items" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_rates_vendor_raw_unique" ON "vendor_rates" USING btree ("vendor_id","raw_material_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_stock_branch_raw_idx" ON "inventory_stock" USING btree ("branch_id","raw_material_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "night_variance_branch_shift_idx" ON "night_variance_entries" USING btree ("branch_id","shift_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_batches_branch_raw_idx" ON "stock_batches" USING btree ("branch_id","raw_material_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_batches_expiry_idx" ON "stock_batches" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wastage_logs_branch_id_idx" ON "wastage_logs" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grns_branch_id_idx" ON "grns" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "indents_branch_id_idx" ON "indents" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_returns_branch_id_idx" ON "material_returns" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_branch_id_idx" ON "purchase_orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_runs_branch_id_idx" ON "checklist_runs" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_runs_instance_id_idx" ON "checklist_runs" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_templates_branch_id_idx" ON "checklist_templates" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_task_definitions_branch_id_idx" ON "recurring_task_definitions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_instances_branch_status_due_idx" ON "task_instances" USING btree ("branch_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_instances_recurring_due_unique" ON "task_instances" USING btree ("branch_id","recurring_definition_id","due_at") WHERE "task_instances"."recurring_definition_id" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_instances_recurring_natural_cycle_unique" ON "task_instances" USING btree ("branch_id","recurring_definition_id","natural_cycle_start_date") WHERE "task_instances"."recurring_definition_id" <> '' and "task_instances"."natural_cycle_start_date" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_drops_branch_cashier_shift_unique" ON "cash_drops" USING btree ("branch_id","cashier_id","shift_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_drops_branch_id_idx" ON "cash_drops" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_ledger_user_id_idx" ON "employee_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_ledger_branch_id_idx" ON "employee_ledger" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_alerts_branch_id_idx" ON "pos_alerts" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pos_orders_branch_order_number_unique" ON "pos_orders" USING btree ("branch_id","order_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_orders_branch_created_idx" ON "pos_orders" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aggregator_orders_branch_date_idx" ON "aggregator_orders" USING btree ("branch_id","order_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_financials_branch_period_idx" ON "branch_financials" USING btree ("branch_id","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_branch_date_idx" ON "journal_entries" USING btree ("branch_id","entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_reference_idx" ON "journal_entries" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_accounts_branch_id_idx" ON "ledger_accounts" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petty_cash_branch_date_idx" ON "petty_cash_entries" USING btree ("branch_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mis_scores_branch_user_period_unique" ON "mis_scores" USING btree ("branch_id","user_id","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mis_scores_branch_period_idx" ON "mis_scores" USING btree ("branch_id","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_log_related_entity_idx" ON "whatsapp_message_log" USING btree ("related_entity_type","related_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_log_from_phone_idx" ON "whatsapp_message_log" USING btree ("from_phone");