CREATE TYPE "public"."branch_operating_concept" AS ENUM('FAST_FOOD', 'CONVENTIONAL');--> statement-breakpoint
CREATE TYPE "public"."production_station" AS ENUM('KITCHEN', 'BAR');--> statement-breakpoint
CREATE TYPE "public"."pos_attempt_action" AS ENUM('CREATE', 'ADD_LINES', 'SETTLE');--> statement-breakpoint
CREATE TYPE "public"."pos_ticket_station" AS ENUM('KITCHEN', 'BAR');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'OPEN' BEFORE 'COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'PAID' BEFORE 'COMPLETED';--> statement-breakpoint
CREATE TABLE "pos_order_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"order_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" "pos_attempt_action" NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_json" jsonb NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_production_ticket_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"order_line_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_production_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"station" "pos_ticket_station" NOT NULL,
	"ticket_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"receipt_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_orders" ALTER COLUMN "tender_type" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "operating_concept" "branch_operating_concept" DEFAULT 'FAST_FOOD' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "production_station" "production_station" DEFAULT 'KITCHEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_order_lines" ADD COLUMN "vat_rate_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "operating_concept" "branch_operating_concept" DEFAULT 'FAST_FOOD' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "stock_deducted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pos_order_attempts" ADD CONSTRAINT "pos_order_attempts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_attempts" ADD CONSTRAINT "pos_order_attempts_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_attempts" ADD CONSTRAINT "pos_order_attempts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_production_ticket_lines" ADD CONSTRAINT "pos_production_ticket_lines_ticket_id_pos_production_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."pos_production_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_production_ticket_lines" ADD CONSTRAINT "pos_production_ticket_lines_order_line_id_pos_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."pos_order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_production_tickets" ADD CONSTRAINT "pos_production_tickets_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_production_tickets" ADD CONSTRAINT "pos_production_tickets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_receipts" ADD CONSTRAINT "pos_receipts_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_receipts" ADD CONSTRAINT "pos_receipts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pos_order_attempts_branch_key_unique" ON "pos_order_attempts" USING btree ("branch_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "pos_order_attempts_order_idx" ON "pos_order_attempts" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_production_ticket_lines_line_unique" ON "pos_production_ticket_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "pos_production_ticket_lines_ticket_idx" ON "pos_production_ticket_lines" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_production_tickets_number_unique" ON "pos_production_tickets" USING btree ("branch_id","ticket_number");--> statement-breakpoint
CREATE INDEX "pos_production_tickets_order_idx" ON "pos_production_tickets" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_receipts_order_unique" ON "pos_receipts" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_receipts_number_unique" ON "pos_receipts" USING btree ("branch_id","receipt_number");