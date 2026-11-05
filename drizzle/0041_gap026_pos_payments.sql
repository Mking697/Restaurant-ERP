CREATE TABLE "pos_payment_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"order_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"final_document_id" text,
	"amount" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"order_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"receipt_number" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"tender_type" text NOT NULL,
	"tender_currency_code" text NOT NULL,
	"tender_currency_amount" numeric(12, 2) NOT NULL,
	"fx_rate_to_inr" numeric(12, 6) NOT NULL,
	"collector_id" text NOT NULL,
	"collector_name" text NOT NULL,
	"shift_run_id" text NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"source_action" text NOT NULL,
	"final_document_id" text,
	"final_document_number" text
);
--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "payment_captured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_payment_allocations" ADD CONSTRAINT "pos_payment_allocations_payment_id_pos_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."pos_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payment_allocations" ADD CONSTRAINT "pos_payment_allocations_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payment_allocations" ADD CONSTRAINT "pos_payment_allocations_receipt_id_pos_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."pos_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payment_allocations" ADD CONSTRAINT "pos_payment_allocations_final_document_id_pos_documents_id_fk" FOREIGN KEY ("final_document_id") REFERENCES "public"."pos_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_receipt_id_pos_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."pos_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_collector_id_users_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_final_document_id_pos_documents_id_fk" FOREIGN KEY ("final_document_id") REFERENCES "public"."pos_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pos_payment_allocations_payment_unique" ON "pos_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_payment_allocations_order_unique" ON "pos_payment_allocations" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_payment_allocations_receipt_unique" ON "pos_payment_allocations" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_payments_order_unique" ON "pos_payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_payments_receipt_unique" ON "pos_payments" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "pos_payments_branch_shift_idx" ON "pos_payments" USING btree ("branch_id","shift_run_id");