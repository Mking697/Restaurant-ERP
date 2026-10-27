CREATE TABLE IF NOT EXISTS "currency_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"currency_code" text NOT NULL,
	"rate_to_inr" numeric(12, 6) NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "counter_no" text DEFAULT 'COUNTER_1' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "tender_currency_code" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "fx_rate_to_inr" numeric(12, 6) DEFAULT '1.000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "tender_currency_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "currency_rates" ADD CONSTRAINT "currency_rates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "currency_rates_code_unique" ON "currency_rates" USING btree ("currency_code");