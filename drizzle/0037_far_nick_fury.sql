CREATE TABLE "ho_stock_review_events" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"action" text NOT NULL,
	"action_key" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ho_stock_review_events_action_key_unique" UNIQUE("action_key")
);
--> statement-breakpoint
CREATE TABLE "ho_stock_review_subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_revision" integer DEFAULT 1 NOT NULL,
	"exception" boolean DEFAULT false NOT NULL,
	"summary_json" jsonb NOT NULL,
	"submitted_by_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reorder_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"position_fingerprint" text NOT NULL,
	"position_json" jsonb NOT NULL,
	"unit" text NOT NULL,
	"suggested_qty" numeric(12, 3) NOT NULL,
	"internal_qty" numeric(12, 3) NOT NULL,
	"external_qty" numeric(12, 3) NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversion_request_key" text,
	"internal_requisition_id" text,
	"external_indent_id" text,
	"converted_by_id" text,
	"converted_at" timestamp with time zone,
	CONSTRAINT "reorder_suggestions_position_fingerprint_unique" UNIQUE("position_fingerprint"),
	CONSTRAINT "reorder_suggestions_conversion_request_key_unique" UNIQUE("conversion_request_key")
);
--> statement-breakpoint
ALTER TABLE "ho_stock_review_events" ADD CONSTRAINT "ho_stock_review_events_subject_id_ho_stock_review_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."ho_stock_review_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ho_stock_review_events" ADD CONSTRAINT "ho_stock_review_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ho_stock_review_subjects" ADD CONSTRAINT "ho_stock_review_subjects_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ho_stock_review_subjects" ADD CONSTRAINT "ho_stock_review_subjects_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_suggestions" ADD CONSTRAINT "reorder_suggestions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_suggestions" ADD CONSTRAINT "reorder_suggestions_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_suggestions" ADD CONSTRAINT "reorder_suggestions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_suggestions" ADD CONSTRAINT "reorder_suggestions_internal_requisition_id_internal_requisitions_id_fk" FOREIGN KEY ("internal_requisition_id") REFERENCES "public"."internal_requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_suggestions" ADD CONSTRAINT "reorder_suggestions_external_indent_id_indents_id_fk" FOREIGN KEY ("external_indent_id") REFERENCES "public"."indents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_suggestions" ADD CONSTRAINT "reorder_suggestions_converted_by_id_users_id_fk" FOREIGN KEY ("converted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ho_stock_review_event_actor_idx" ON "ho_stock_review_events" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ho_stock_review_subject_source_revision_unique" ON "ho_stock_review_subjects" USING btree ("subject_type","source_id","source_revision");--> statement-breakpoint
CREATE INDEX "ho_stock_review_subject_branch_idx" ON "ho_stock_review_subjects" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "reorder_suggestions_branch_idx" ON "reorder_suggestions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "reorder_suggestions_material_idx" ON "reorder_suggestions" USING btree ("raw_material_id");