CREATE TABLE "daily_summary_log" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"summary_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_proofs" ALTER COLUMN "lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_proofs" ALTER COLUMN "lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_proofs" ALTER COLUMN "distance_from_branch_m" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_proofs" ALTER COLUMN "within_geofence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "task_instances" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "leg" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_summary_log" ADD CONSTRAINT "daily_summary_log_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_summary_log_branch_date_unique" ON "daily_summary_log" USING btree ("branch_id","summary_date");--> statement-breakpoint
CREATE INDEX "daily_summary_log_branch_id_idx" ON "daily_summary_log" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_posting_key_unique" ON "journal_entries" USING btree ("reference_type","reference_id","leg");