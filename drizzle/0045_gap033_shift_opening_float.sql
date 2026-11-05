ALTER TABLE "shift_runs" ADD COLUMN "opening_float_inr" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "shift_runs" ADD COLUMN "opening_float_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_runs" ADD COLUMN "opening_float_recorded_by" text;--> statement-breakpoint
ALTER TABLE "shift_runs" ADD COLUMN "opening_float_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift_runs" ADD CONSTRAINT "shift_runs_opening_float_recorded_by_users_id_fk" FOREIGN KEY ("opening_float_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;