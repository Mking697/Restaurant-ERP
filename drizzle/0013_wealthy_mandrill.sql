ALTER TABLE "vendor_invoices" ALTER COLUMN "photo_url" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "material_returns" ADD COLUMN "settled_amount_inr" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "material_returns" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "material_returns" ADD COLUMN "settled_by_id" text;--> statement-breakpoint
ALTER TABLE "material_returns" ADD COLUMN "settled_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "bill_blob_pathname" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "bill_content_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "branch_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "invoice_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "po_total_inr" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "grn_accepted_total_inr" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "invoice_adjusted_total_inr" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "approved_by_id" text;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "paid_by_id" text;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD COLUMN "branch_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD COLUMN "tax_adjustment_inr" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD COLUMN "tax_adjustment_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD COLUMN "blob_pathname" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD COLUMN "content_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD COLUMN "submitted_by_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_settled_by_id_users_id_fk" FOREIGN KEY ("settled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD CONSTRAINT "three_way_match_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD CONSTRAINT "three_way_match_invoice_id_vendor_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."vendor_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD CONSTRAINT "three_way_match_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "three_way_match" ADD CONSTRAINT "three_way_match_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "three_way_match_branch_id_idx" ON "three_way_match" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "vendor_invoices_branch_id_idx" ON "vendor_invoices" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "vendor_invoices_po_id_idx" ON "vendor_invoices" USING btree ("po_id");