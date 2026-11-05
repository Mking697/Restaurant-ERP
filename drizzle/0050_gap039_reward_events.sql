CREATE TYPE "public"."reward_event_type" AS ENUM('EARN', 'REDEEM', 'EXPIRE', 'REVERSE');--> statement-breakpoint
CREATE TABLE "reward_events" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"type" "reward_event_type" NOT NULL,
	"points" integer NOT NULL,
	"source_order_id" text,
	"expires_at" timestamp with time zone,
	"amount_tsh" numeric(10, 2),
	"reverses_event_id" text,
	"branch_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_source_order_id_pos_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."pos_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_events_source_order_unique" ON "reward_events" USING btree ("source_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_events_reverses_event_unique" ON "reward_events" USING btree ("reverses_event_id");--> statement-breakpoint
CREATE INDEX "reward_events_customer_id_idx" ON "reward_events" USING btree ("customer_id","created_at");