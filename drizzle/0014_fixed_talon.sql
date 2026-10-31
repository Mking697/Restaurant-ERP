ALTER TABLE "pos_orders" ADD COLUMN "cogs_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "cogs_complete" boolean DEFAULT true NOT NULL;