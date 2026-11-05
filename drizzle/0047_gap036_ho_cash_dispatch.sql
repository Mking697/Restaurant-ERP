CREATE TYPE "public"."ho_cash_dispatch_status" AS ENUM('PENDING', 'ACCEPTED');--> statement-breakpoint
CREATE TABLE "ho_cash_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"from_run_id" text NOT NULL,
	"closing_cash_drop_id" text NOT NULL,
	"counted_cash_inr" numeric(10, 2) NOT NULL,
	"retained_float_inr" numeric(10, 2) DEFAULT '0' NOT NULL,
	"dispatched_amount_inr" numeric(10, 2) NOT NULL,
	"dispatched_by" text NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "ho_cash_dispatch_status" DEFAULT 'PENDING' NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"accepted_amount_inr" numeric(10, 2),
	"discrepancy_inr" numeric(10, 2)
);
--> statement-breakpoint
ALTER TABLE "ho_cash_dispatches" ADD CONSTRAINT "ho_cash_dispatches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ho_cash_dispatches" ADD CONSTRAINT "ho_cash_dispatches_from_run_id_shift_runs_id_fk" FOREIGN KEY ("from_run_id") REFERENCES "public"."shift_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ho_cash_dispatches" ADD CONSTRAINT "ho_cash_dispatches_closing_cash_drop_id_cash_drops_id_fk" FOREIGN KEY ("closing_cash_drop_id") REFERENCES "public"."cash_drops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ho_cash_dispatches" ADD CONSTRAINT "ho_cash_dispatches_dispatched_by_users_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ho_cash_dispatches" ADD CONSTRAINT "ho_cash_dispatches_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ho_cash_dispatches_from_run_unique" ON "ho_cash_dispatches" USING btree ("from_run_id");--> statement-breakpoint
CREATE INDEX "ho_cash_dispatches_branch_id_idx" ON "ho_cash_dispatches" USING btree ("branch_id");