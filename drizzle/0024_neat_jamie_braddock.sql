CREATE TYPE "public"."stock_count_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"count_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"expected_qty" numeric(12, 3) NOT NULL,
	"physical_qty" numeric(12, 3)
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"status" "stock_count_status" DEFAULT 'DRAFT' NOT NULL,
	"started_by_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_id" text,
	"submitted_at" timestamp with time zone,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"review_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "stock_counts_submit_fields" CHECK (("stock_counts"."status" = 'DRAFT' AND "stock_counts"."submitted_by_id" IS NULL AND "stock_counts"."submitted_at" IS NULL) OR ("stock_counts"."status" != 'DRAFT')),
	CONSTRAINT "stock_counts_approve_fields" CHECK (("stock_counts"."status" IN ('APPROVED', 'REJECTED') AND "stock_counts"."approved_by_id" IS NOT NULL AND "stock_counts"."approved_at" IS NOT NULL) OR ("stock_counts"."status" IN ('DRAFT', 'SUBMITTED')))
);
--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_lines_count_material_unique" ON "stock_count_lines" USING btree ("count_id","raw_material_id");--> statement-breakpoint
CREATE INDEX "stock_counts_branch_status_idx" ON "stock_counts" USING btree ("branch_id","status");