CREATE TYPE "public"."general_purchase_request_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONSUMED');--> statement-breakpoint
CREATE TABLE "general_purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"lines_json" jsonb NOT NULL,
	"value_tsh" numeric(14, 2) NOT NULL,
	"status" "general_purchase_request_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "general_purchase_requests" ADD CONSTRAINT "general_purchase_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_purchase_requests" ADD CONSTRAINT "general_purchase_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_purchase_requests" ADD CONSTRAINT "general_purchase_requests_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "general_purchase_requests" ADD CONSTRAINT "general_purchase_requests_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "general_purchase_requests_branch_id_idx" ON "general_purchase_requests" USING btree ("branch_id");