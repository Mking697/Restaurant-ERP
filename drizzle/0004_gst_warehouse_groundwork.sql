CREATE TYPE "public"."stock_transfer_status" AS ENUM('DISPATCHED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."warehouse_type" AS ENUM('CENTRAL', 'BRANCH');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"from_warehouse_id" text NOT NULL,
	"to_warehouse_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"qty_dispatched" numeric(12, 3) NOT NULL,
	"qty_received" numeric(12, 3),
	"status" "stock_transfer_status" DEFAULT 'DISPATCHED' NOT NULL,
	"dispatched_by_id" text NOT NULL,
	"received_by_id" text,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "warehouse_type" NOT NULL,
	"branch_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "gst_state_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "hsn_sac_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "gst_rate_percent" numeric(5, 2) DEFAULT '5.00' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dispatched_by_id_users_id_fk" FOREIGN KEY ("dispatched_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_transfers_from_idx" ON "stock_transfers" USING btree ("from_warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_transfers_to_idx" ON "stock_transfers" USING btree ("to_warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouses_branch_id_idx" ON "warehouses" USING btree ("branch_id");