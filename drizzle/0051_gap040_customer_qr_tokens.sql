CREATE TYPE "public"."customer_qr_token_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TABLE "customer_qr_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "customer_qr_token_status" DEFAULT 'ACTIVE' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text
);
--> statement-breakpoint
ALTER TABLE "customer_qr_tokens" ADD CONSTRAINT "customer_qr_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_qr_tokens" ADD CONSTRAINT "customer_qr_tokens_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_qr_tokens" ADD CONSTRAINT "customer_qr_tokens_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_qr_tokens_token_hash_unique" ON "customer_qr_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_qr_tokens_one_active_per_customer" ON "customer_qr_tokens" USING btree ("customer_id") WHERE "customer_qr_tokens"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "customer_qr_tokens_customer_id_idx" ON "customer_qr_tokens" USING btree ("customer_id");