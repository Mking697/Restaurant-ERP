CREATE TABLE "semi_fg_transfer_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semi_fg_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"from_branch_id" text NOT NULL,
	"to_branch_id" text NOT NULL,
	"source_menu_item_id" text NOT NULL,
	"dest_menu_item_id" text NOT NULL,
	"output_unit_at_dispatch" text NOT NULL,
	"qty_dispatched" numeric(12, 3) NOT NULL,
	"qty_received" numeric(12, 3),
	"status" text DEFAULT 'DISPATCHED' NOT NULL,
	"dispatched_by_id" text NOT NULL,
	"received_by_id" text,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	CONSTRAINT "semi_fg_transfers_branches_differ" CHECK ("semi_fg_transfers"."from_branch_id" <> "semi_fg_transfers"."to_branch_id"),
	CONSTRAINT "semi_fg_transfers_qty_positive" CHECK ("semi_fg_transfers"."qty_dispatched" > 0),
	CONSTRAINT "semi_fg_transfers_received_bounded" CHECK ("semi_fg_transfers"."qty_received" is null or ("semi_fg_transfers"."qty_received" >= 0 and "semi_fg_transfers"."qty_received" <= "semi_fg_transfers"."qty_dispatched"))
);
--> statement-breakpoint
ALTER TABLE "semi_fg_transfer_receipts" ADD CONSTRAINT "semi_fg_transfer_receipts_transfer_id_semi_fg_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."semi_fg_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfer_receipts" ADD CONSTRAINT "semi_fg_transfer_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD CONSTRAINT "semi_fg_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD CONSTRAINT "semi_fg_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD CONSTRAINT "semi_fg_transfers_source_menu_item_id_menu_items_id_fk" FOREIGN KEY ("source_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD CONSTRAINT "semi_fg_transfers_dest_menu_item_id_menu_items_id_fk" FOREIGN KEY ("dest_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD CONSTRAINT "semi_fg_transfers_dispatched_by_id_users_id_fk" FOREIGN KEY ("dispatched_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semi_fg_transfers" ADD CONSTRAINT "semi_fg_transfers_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "semi_fg_transfer_receipts_transfer_unique" ON "semi_fg_transfer_receipts" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "semi_fg_transfers_from_idx" ON "semi_fg_transfers" USING btree ("from_branch_id");--> statement-breakpoint
CREATE INDEX "semi_fg_transfers_to_idx" ON "semi_fg_transfers" USING btree ("to_branch_id");