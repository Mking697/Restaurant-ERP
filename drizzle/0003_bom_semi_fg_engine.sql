CREATE TYPE "public"."bom_component_type" AS ENUM('RAW_MATERIAL', 'SEMI_FG');--> statement-breakpoint
ALTER TABLE "bom_recipes" ALTER COLUMN "raw_material_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_recipes" ADD COLUMN "component_type" "bom_component_type" DEFAULT 'RAW_MATERIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_recipes" ADD COLUMN "component_menu_item_id" text;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "is_semi_fg" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "is_sellable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bom_recipes" ADD CONSTRAINT "bom_recipes_component_menu_item_id_menu_items_id_fk" FOREIGN KEY ("component_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bom_recipes_branch_menu_component_unique" ON "bom_recipes" USING btree ("branch_id","menu_item_id","component_menu_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bom_recipes_component_menu_item_idx" ON "bom_recipes" USING btree ("component_menu_item_id");--> statement-breakpoint
ALTER TABLE "bom_recipes" ADD CONSTRAINT "bom_recipes_component_xor" CHECK (("bom_recipes"."component_type" = 'RAW_MATERIAL' and "bom_recipes"."raw_material_id" is not null and "bom_recipes"."component_menu_item_id" is null) or ("bom_recipes"."component_type" = 'SEMI_FG' and "bom_recipes"."component_menu_item_id" is not null and "bom_recipes"."raw_material_id" is null and "bom_recipes"."component_menu_item_id" <> "bom_recipes"."menu_item_id"));