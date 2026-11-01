CREATE TABLE "batch_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"qty_delta" numeric(12, 3) NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_transfer_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"origin_batch_id" text NOT NULL,
	"batch_no" text NOT NULL,
	"expiry_date" date,
	"expiry_status" text NOT NULL,
	"qty_dispatched" numeric(12, 3) NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_transfer_allocation_positive" CHECK ("batch_transfer_allocations"."qty_dispatched" > 0)
);
--> statement-breakpoint
CREATE TABLE "batch_transfer_receipt_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"allocation_id" text NOT NULL,
	"qty_received" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_transfer_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_batches" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD COLUMN "expiry_status" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD COLUMN "origin_batch_id" text;--> statement-breakpoint
ALTER TABLE "batch_movements" ADD CONSTRAINT "batch_movements_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_movements" ADD CONSTRAINT "batch_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer_allocations" ADD CONSTRAINT "batch_transfer_allocations_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer_allocations" ADD CONSTRAINT "batch_transfer_allocations_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer_allocations" ADD CONSTRAINT "batch_transfer_allocations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer_receipt_lines" ADD CONSTRAINT "batch_transfer_receipt_lines_receipt_id_batch_transfer_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."batch_transfer_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer_receipt_lines" ADD CONSTRAINT "batch_transfer_receipt_lines_allocation_id_batch_transfer_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."batch_transfer_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer_receipts" ADD CONSTRAINT "batch_transfer_receipts_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_transfer_receipts" ADD CONSTRAINT "batch_transfer_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_movements_batch_idx" ON "batch_movements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batch_movements_source_idx" ON "batch_movements" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "batch_transfer_allocations_transfer_idx" ON "batch_transfer_allocations" USING btree ("transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_transfer_receipt_lines_allocation_unique" ON "batch_transfer_receipt_lines" USING btree ("allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_transfer_receipts_transfer_unique" ON "batch_transfer_receipts" USING btree ("transfer_id");--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_batches_warehouse_raw_idx" ON "stock_batches" USING btree ("warehouse_id","raw_material_id");--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_location_xor" CHECK (("stock_batches"."branch_id" is not null) <> ("stock_batches"."warehouse_id" is not null));--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_expiry_valid" CHECK (("stock_batches"."expiry_status" = 'UNKNOWN') or ("stock_batches"."expiry_status" = 'DATED' and "stock_batches"."expiry_date" is not null) or ("stock_batches"."expiry_status" = 'NON_EXPIRING' and "stock_batches"."expiry_date" is null));