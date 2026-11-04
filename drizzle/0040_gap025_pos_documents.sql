CREATE SEQUENCE "public"."pos_document_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "pos_document_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"request_json" jsonb NOT NULL,
	"document_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_revision" integer NOT NULL,
	"order_id" text,
	"proforma_id" text,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_order_lines" ADD COLUMN "name_snapshot" text;--> statement-breakpoint
ALTER TABLE "pos_order_lines" ADD COLUMN "product_code_snapshot" text;--> statement-breakpoint
ALTER TABLE "pos_document_requests" ADD CONSTRAINT "pos_document_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_document_requests" ADD CONSTRAINT "pos_document_requests_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_document_requests" ADD CONSTRAINT "pos_document_requests_document_id_pos_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."pos_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_documents" ADD CONSTRAINT "pos_documents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_documents" ADD CONSTRAINT "pos_documents_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pos_document_requests_branch_key_unique" ON "pos_document_requests" USING btree ("branch_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_documents_number_unique" ON "pos_documents" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_documents_final_order_unique" ON "pos_documents" USING btree ("order_id") WHERE "pos_documents"."kind" = 'FINAL';--> statement-breakpoint
CREATE INDEX "pos_documents_source_idx" ON "pos_documents" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "pos_documents_branch_issued_idx" ON "pos_documents" USING btree ("branch_id","issued_at");