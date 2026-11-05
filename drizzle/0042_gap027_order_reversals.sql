ALTER TYPE "public"."stock_movement_type" ADD VALUE 'ORDER_VOID_RESTOCK';--> statement-breakpoint
CREATE TABLE "pos_order_reversals" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"prior_status" text NOT NULL,
	"payment_id" text,
	"receipt_id" text,
	"final_document_id" text,
	"cogs_amount_at_void" numeric(12, 2) NOT NULL,
	"refund_liability_amount" numeric(10, 2),
	"restocked_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wasted_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_order_reversals" ADD CONSTRAINT "pos_order_reversals_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_reversals" ADD CONSTRAINT "pos_order_reversals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_reversals" ADD CONSTRAINT "pos_order_reversals_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_reversals" ADD CONSTRAINT "pos_order_reversals_payment_id_pos_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."pos_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_reversals" ADD CONSTRAINT "pos_order_reversals_receipt_id_pos_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."pos_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_reversals" ADD CONSTRAINT "pos_order_reversals_final_document_id_pos_documents_id_fk" FOREIGN KEY ("final_document_id") REFERENCES "public"."pos_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pos_order_reversals_order_unique" ON "pos_order_reversals" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pos_order_reversals_branch_id_idx" ON "pos_order_reversals" USING btree ("branch_id");