CREATE TABLE "cutting_yield_deviations" (
	"id" text PRIMARY KEY NOT NULL,
	"cutting_production_id" text NOT NULL,
	"standard_id" text NOT NULL,
	"yield_percent" numeric(6, 2) NOT NULL,
	"min_yield_percent_at_evaluation" numeric(5, 2) NOT NULL,
	"max_yield_percent_at_evaluation" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	CONSTRAINT "cutting_yield_deviations_review_pairing" CHECK (("cutting_yield_deviations"."reviewed_by_id" is null) = ("cutting_yield_deviations"."reviewed_at" is null) and ("cutting_yield_deviations"."reviewed_by_id" is null) = ("cutting_yield_deviations"."review_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "cutting_yield_standards" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"min_yield_percent" numeric(5, 2) NOT NULL,
	"max_yield_percent" numeric(5, 2) NOT NULL,
	"approved_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "cutting_yield_standards_range_valid" CHECK ("cutting_yield_standards"."min_yield_percent" >= 0 and "cutting_yield_standards"."max_yield_percent" <= 100 and "cutting_yield_standards"."min_yield_percent" <= "cutting_yield_standards"."max_yield_percent")
);
--> statement-breakpoint
ALTER TABLE "cutting_yield_deviations" ADD CONSTRAINT "cutting_yield_deviations_cutting_production_id_actual_cutting_productions_id_fk" FOREIGN KEY ("cutting_production_id") REFERENCES "public"."actual_cutting_productions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_yield_deviations" ADD CONSTRAINT "cutting_yield_deviations_standard_id_cutting_yield_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."cutting_yield_standards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_yield_deviations" ADD CONSTRAINT "cutting_yield_deviations_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_yield_standards" ADD CONSTRAINT "cutting_yield_standards_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutting_yield_standards" ADD CONSTRAINT "cutting_yield_standards_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cutting_yield_deviations_production_unique" ON "cutting_yield_deviations" USING btree ("cutting_production_id");--> statement-breakpoint
CREATE INDEX "cutting_yield_deviations_unreviewed_idx" ON "cutting_yield_deviations" USING btree ("reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cutting_yield_standards_current_unique" ON "cutting_yield_standards" USING btree ("menu_item_id") WHERE "cutting_yield_standards"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "cutting_yield_standards_item_idx" ON "cutting_yield_standards" USING btree ("menu_item_id");