CREATE TABLE "internal_requisition_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"requisition_id" text NOT NULL,
	"line_type" text NOT NULL,
	"raw_material_id" text,
	"menu_item_id" text,
	"qty_requested" numeric(12, 3) NOT NULL,
	"qty_approved" numeric(12, 3),
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_requisition_lines_type_xor" CHECK (("internal_requisition_lines"."line_type" = 'RAW' and "internal_requisition_lines"."raw_material_id" is not null and "internal_requisition_lines"."menu_item_id" is null) or ("internal_requisition_lines"."line_type" = 'PREPARED' and "internal_requisition_lines"."menu_item_id" is not null and "internal_requisition_lines"."raw_material_id" is null)),
	CONSTRAINT "internal_requisition_lines_qty_positive" CHECK ("internal_requisition_lines"."qty_requested" > 0),
	CONSTRAINT "internal_requisition_lines_approved_bounded" CHECK ("internal_requisition_lines"."qty_approved" is null or ("internal_requisition_lines"."qty_approved" >= 0 and "internal_requisition_lines"."qty_approved" <= "internal_requisition_lines"."qty_requested"))
);
--> statement-breakpoint
CREATE TABLE "internal_requisitions" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"requested_by_id" text NOT NULL,
	"approved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "requisition_line_id" text;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD COLUMN "requisition_line_id" text;--> statement-breakpoint
ALTER TABLE "internal_requisition_lines" ADD CONSTRAINT "internal_requisition_lines_requisition_id_internal_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."internal_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_requisition_lines" ADD CONSTRAINT "internal_requisition_lines_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_requisition_lines" ADD CONSTRAINT "internal_requisition_lines_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_requisitions" ADD CONSTRAINT "internal_requisitions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_requisitions" ADD CONSTRAINT "internal_requisitions_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_requisitions" ADD CONSTRAINT "internal_requisitions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internal_requisition_lines_requisition_idx" ON "internal_requisition_lines" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "internal_requisitions_branch_idx" ON "internal_requisitions" USING btree ("branch_id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_requisition_line_id_internal_requisition_lines_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."internal_requisition_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD CONSTRAINT "semi_fg_transfers_requisition_line_id_internal_requisition_lines_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."internal_requisition_lines"("id") ON DELETE no action ON UPDATE no action;