CREATE TYPE "public"."stock_item_type" AS ENUM('RAW_MATERIAL', 'SEMI_FG');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'PRODUCTION_OUTPUT';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_type" ADD VALUE 'SEMI_FG_CONSUME';--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "raw_material_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "item_type" "stock_item_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "menu_item_id" text;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_branch_menu_item_idx" ON "stock_movements" USING btree ("branch_id","menu_item_id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_exactly_one_item_ref" CHECK (("stock_movements"."item_type" = 'RAW_MATERIAL' AND "stock_movements"."raw_material_id" IS NOT NULL AND "stock_movements"."menu_item_id" IS NULL) OR ("stock_movements"."item_type" = 'SEMI_FG' AND "stock_movements"."menu_item_id" IS NOT NULL AND "stock_movements"."raw_material_id" IS NULL));