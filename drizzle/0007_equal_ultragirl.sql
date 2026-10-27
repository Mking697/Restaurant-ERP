CREATE TABLE IF NOT EXISTS "semi_fg_productions" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"idempotency_key" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"produced_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semi_fg_productions_positive" CHECK ("semi_fg_productions"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "semi_fg_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"qty_on_hand" numeric(12, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semi_fg_stock_nonnegative" CHECK ("semi_fg_stock"."qty_on_hand" >= 0)
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "output_unit" text DEFAULT 'portion' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "semi_fg_productions" ADD CONSTRAINT "semi_fg_productions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "semi_fg_productions" ADD CONSTRAINT "semi_fg_productions_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "semi_fg_productions" ADD CONSTRAINT "semi_fg_productions_produced_by_id_users_id_fk" FOREIGN KEY ("produced_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "semi_fg_stock" ADD CONSTRAINT "semi_fg_stock_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "semi_fg_stock" ADD CONSTRAINT "semi_fg_stock_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "semi_fg_productions_branch_key_unique" ON "semi_fg_productions" USING btree ("branch_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "semi_fg_productions_branch_created_idx" ON "semi_fg_productions" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "semi_fg_stock_branch_menu_unique" ON "semi_fg_stock" USING btree ("branch_id","menu_item_id");