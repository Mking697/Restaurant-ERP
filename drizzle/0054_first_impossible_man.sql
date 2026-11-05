CREATE TYPE "public"."central_grn_quality_result" AS ENUM('PENDING', 'PASS', 'FAIL', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."central_payment_status" AS ENUM('PENDING', 'THREE_WAY_LOCKED', 'APPROVED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."central_po_status" AS ENUM('CREATED', 'RECEIVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."central_purchase_request_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONSUMED');--> statement-breakpoint
CREATE TABLE "central_grn_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"grn_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"qty_ordered" numeric(12, 3) NOT NULL,
	"qty_received" numeric(12, 3) NOT NULL,
	"qty_failed" numeric(12, 3) DEFAULT '0' NOT NULL,
	"rate_ordered" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "central_grns" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"received_by_id" text NOT NULL,
	"quality_result" "central_grn_quality_result" DEFAULT 'PENDING' NOT NULL,
	"quality_photo_url" text DEFAULT '' NOT NULL,
	"quality_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "central_purchase_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"rate" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "central_purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"request_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"status" "central_po_status" DEFAULT 'CREATED' NOT NULL,
	"bought_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bill_blob_pathname" text DEFAULT '' NOT NULL,
	"bill_content_type" text DEFAULT '' NOT NULL,
	"bill_uploaded_at" timestamp with time zone,
	"material_received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "central_purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "central_purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"lines_json" jsonb NOT NULL,
	"value_tsh" numeric(14, 2) NOT NULL,
	"status" "central_purchase_request_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "central_three_way_match" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_id" text NOT NULL,
	"po_id" text NOT NULL,
	"grn_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"po_total_inr" numeric(12, 2) NOT NULL,
	"grn_accepted_total_inr" numeric(12, 2) NOT NULL,
	"invoice_adjusted_total_inr" numeric(12, 2) NOT NULL,
	"matched" boolean DEFAULT false NOT NULL,
	"mismatch_reason" text DEFAULT '' NOT NULL,
	"payment_status" "central_payment_status" DEFAULT 'PENDING' NOT NULL,
	"locked_at" timestamp with time zone,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"paid_by_id" text,
	"paid_at" timestamp with time zone,
	CONSTRAINT "central_three_way_match_po_id_unique" UNIQUE("po_id")
);
--> statement-breakpoint
CREATE TABLE "central_vendor_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"tax_adjustment_inr" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_adjustment_note" text DEFAULT '' NOT NULL,
	"blob_pathname" text DEFAULT '' NOT NULL,
	"content_type" text DEFAULT '' NOT NULL,
	"submitted_by_id" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "central_vendor_invoices_po_id_unique" UNIQUE("po_id")
);
--> statement-breakpoint
ALTER TABLE "central_grn_lines" ADD CONSTRAINT "central_grn_lines_grn_id_central_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."central_grns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_grn_lines" ADD CONSTRAINT "central_grn_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_grns" ADD CONSTRAINT "central_grns_po_id_central_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."central_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_grns" ADD CONSTRAINT "central_grns_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_grns" ADD CONSTRAINT "central_grns_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_order_lines" ADD CONSTRAINT "central_purchase_order_lines_po_id_central_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."central_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_order_lines" ADD CONSTRAINT "central_purchase_order_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_orders" ADD CONSTRAINT "central_purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_orders" ADD CONSTRAINT "central_purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_orders" ADD CONSTRAINT "central_purchase_orders_request_id_central_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."central_purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_orders" ADD CONSTRAINT "central_purchase_orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_requests" ADD CONSTRAINT "central_purchase_requests_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_requests" ADD CONSTRAINT "central_purchase_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_requests" ADD CONSTRAINT "central_purchase_requests_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_purchase_requests" ADD CONSTRAINT "central_purchase_requests_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_three_way_match" ADD CONSTRAINT "central_three_way_match_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_three_way_match" ADD CONSTRAINT "central_three_way_match_po_id_central_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."central_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_three_way_match" ADD CONSTRAINT "central_three_way_match_grn_id_central_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."central_grns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_three_way_match" ADD CONSTRAINT "central_three_way_match_invoice_id_central_vendor_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."central_vendor_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_three_way_match" ADD CONSTRAINT "central_three_way_match_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_three_way_match" ADD CONSTRAINT "central_three_way_match_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_vendor_invoices" ADD CONSTRAINT "central_vendor_invoices_po_id_central_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."central_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_vendor_invoices" ADD CONSTRAINT "central_vendor_invoices_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_vendor_invoices" ADD CONSTRAINT "central_vendor_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "central_vendor_invoices" ADD CONSTRAINT "central_vendor_invoices_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "central_grn_lines_grn_id_idx" ON "central_grn_lines" USING btree ("grn_id");--> statement-breakpoint
CREATE INDEX "central_grns_warehouse_id_idx" ON "central_grns" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "central_purchase_order_lines_po_id_idx" ON "central_purchase_order_lines" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "central_purchase_orders_warehouse_id_idx" ON "central_purchase_orders" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "central_purchase_requests_warehouse_id_idx" ON "central_purchase_requests" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "central_three_way_match_warehouse_id_idx" ON "central_three_way_match" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "central_vendor_invoices_warehouse_id_idx" ON "central_vendor_invoices" USING btree ("warehouse_id");