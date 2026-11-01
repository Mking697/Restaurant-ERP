CREATE TYPE "public"."stock_movement_type" AS ENUM('GRN_RECEIPT', 'PRODUCTION_CONSUME');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"raw_material_id" text NOT NULL,
	"movement_type" "stock_movement_type" NOT NULL,
	"qty_delta" numeric(12, 3) NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_raw_material_id_raw_materials_id_fk" FOREIGN KEY ("raw_material_id") REFERENCES "public"."raw_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_idempotency_unique" ON "stock_movements" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "stock_movements_branch_raw_idx" ON "stock_movements" USING btree ("branch_id","raw_material_id");