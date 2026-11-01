CREATE TABLE "material_return_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"material_return_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"qty_dispatched" numeric(12, 3) NOT NULL,
	"reason_note" text NOT NULL,
	"evidence_photo_url" text DEFAULT '' NOT NULL,
	"dispatched_by_id" text NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vendor_acknowledged_at" timestamp with time zone,
	"vendor_acknowledged_by_id" text
);
--> statement-breakpoint
ALTER TABLE "material_returns" ADD COLUMN "remaining_cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_returns" ADD COLUMN "remaining_cancelled_by_id" text;--> statement-breakpoint
ALTER TABLE "material_returns" ADD COLUMN "remaining_cancelled_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_return_dispatches" ADD CONSTRAINT "material_return_dispatches_material_return_id_material_returns_id_fk" FOREIGN KEY ("material_return_id") REFERENCES "public"."material_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_return_dispatches" ADD CONSTRAINT "material_return_dispatches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_return_dispatches" ADD CONSTRAINT "material_return_dispatches_dispatched_by_id_users_id_fk" FOREIGN KEY ("dispatched_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_return_dispatches" ADD CONSTRAINT "material_return_dispatches_vendor_acknowledged_by_id_users_id_fk" FOREIGN KEY ("vendor_acknowledged_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_return_dispatches_claim_id_idx" ON "material_return_dispatches" USING btree ("material_return_id");--> statement-breakpoint
CREATE INDEX "material_return_dispatches_branch_id_idx" ON "material_return_dispatches" USING btree ("branch_id");--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_remaining_cancelled_by_id_users_id_fk" FOREIGN KEY ("remaining_cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;