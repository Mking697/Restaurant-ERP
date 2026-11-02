CREATE TABLE "eod_stock_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"report_date" date NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"generation_source" text DEFAULT 'MANUAL' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_request_key" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by_id" text,
	"regenerated_at" timestamp with time zone,
	"regenerated_by_id" text,
	CONSTRAINT "eod_stock_reports_last_request_key_unique" UNIQUE("last_request_key")
);
--> statement-breakpoint
ALTER TABLE "eod_stock_reports" ADD CONSTRAINT "eod_stock_reports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eod_stock_reports" ADD CONSTRAINT "eod_stock_reports_generated_by_id_users_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eod_stock_reports" ADD CONSTRAINT "eod_stock_reports_regenerated_by_id_users_id_fk" FOREIGN KEY ("regenerated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eod_stock_reports_branch_date_unique" ON "eod_stock_reports" USING btree ("branch_id","report_date");--> statement-breakpoint
CREATE INDEX "eod_stock_reports_branch_id_idx" ON "eod_stock_reports" USING btree ("branch_id");