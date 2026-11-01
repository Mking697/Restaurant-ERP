CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY');--> statement-breakpoint
CREATE TABLE "vendor_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"po_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"amount_tsh" numeric(12, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"reference_number" text DEFAULT '' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_match_id_three_way_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."three_way_match"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_payments_match_id_idx" ON "vendor_payments" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "vendor_payments_branch_id_idx" ON "vendor_payments" USING btree ("branch_id");