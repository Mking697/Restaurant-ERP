CREATE TABLE "pos_token_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"business_date" text NOT NULL,
	"channel" "order_channel" NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "pickup_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_token_sequences" ADD CONSTRAINT "pos_token_sequences_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pos_token_sequences_scope_unique" ON "pos_token_sequences" USING btree ("branch_id","business_date","channel");