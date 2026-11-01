CREATE TABLE "actual_cutting_productions" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"input_total_kg" numeric(12, 3) NOT NULL,
	"output_qty" numeric(12, 3) NOT NULL,
	"output_unit_at_submission" text NOT NULL,
	"output_mass_kg" numeric(12, 3) NOT NULL,
	"waste_qty_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"unaccounted_loss_percent" numeric(6, 3) NOT NULL,
	"tolerance_percent_at_submission" numeric(5, 2) NOT NULL,
	"idempotency_key" text NOT NULL,
	"produced_by_id" text NOT NULL,
	"produced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actual_cutting_output_mass_conserved" CHECK ("actual_cutting_productions"."output_mass_kg" + "actual_cutting_productions"."waste_qty_kg" <= "actual_cutting_productions"."input_total_kg")
);
--> statement-breakpoint
ALTER TABLE "actual_cutting_productions" ADD CONSTRAINT "actual_cutting_productions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cutting_productions" ADD CONSTRAINT "actual_cutting_productions_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actual_cutting_productions" ADD CONSTRAINT "actual_cutting_productions_produced_by_id_users_id_fk" FOREIGN KEY ("produced_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actual_cutting_productions_idempotency_unique" ON "actual_cutting_productions" USING btree ("branch_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "actual_cutting_productions_branch_item_idx" ON "actual_cutting_productions" USING btree ("branch_id","menu_item_id");