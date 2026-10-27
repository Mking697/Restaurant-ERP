CREATE TYPE "public"."shift_handover_status" AS ENUM('PENDING', 'ACCEPTED');--> statement-breakpoint
CREATE TYPE "public"."shift_run_status" AS ENUM('OPEN', 'ENDED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branch_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"label" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_handovers" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"from_run_id" text NOT NULL,
	"to_run_id" text NOT NULL,
	"closing_cash_drop_id" text NOT NULL,
	"cash_amount" numeric(10, 2) NOT NULL,
	"card_amount" numeric(10, 2) NOT NULL,
	"upi_amount" numeric(10, 2) NOT NULL,
	"other_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" "shift_handover_status" DEFAULT 'PENDING' NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"shift_definition_id" text NOT NULL,
	"label" text NOT NULL,
	"status" "shift_run_status" DEFAULT 'OPEN' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"started_by" text NOT NULL,
	"ended_by" text
);
--> statement-breakpoint
ALTER TABLE "cash_drops" ADD COLUMN "shift_run_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "shift_run_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branch_shifts" ADD CONSTRAINT "branch_shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_from_run_id_shift_runs_id_fk" FOREIGN KEY ("from_run_id") REFERENCES "public"."shift_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_to_run_id_shift_runs_id_fk" FOREIGN KEY ("to_run_id") REFERENCES "public"."shift_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_closing_cash_drop_id_cash_drops_id_fk" FOREIGN KEY ("closing_cash_drop_id") REFERENCES "public"."cash_drops"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_handovers" ADD CONSTRAINT "shift_handovers_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_runs" ADD CONSTRAINT "shift_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_runs" ADD CONSTRAINT "shift_runs_shift_definition_id_branch_shifts_id_fk" FOREIGN KEY ("shift_definition_id") REFERENCES "public"."branch_shifts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_runs" ADD CONSTRAINT "shift_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shift_runs" ADD CONSTRAINT "shift_runs_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_shifts_branch_id_idx" ON "branch_shifts" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shift_handovers_to_run_unique" ON "shift_handovers" USING btree ("to_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_handovers_branch_id_idx" ON "shift_handovers" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shift_runs_branch_id_idx" ON "shift_runs" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_drops_shift_run_id_idx" ON "cash_drops" USING btree ("shift_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_orders_shift_run_id_idx" ON "pos_orders" USING btree ("shift_run_id");