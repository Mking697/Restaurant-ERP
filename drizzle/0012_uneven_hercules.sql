ALTER TABLE "vendors" RENAME COLUMN "gstin" TO "tin";--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "vat_rate_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "product_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "vat_rate_percent" numeric(5, 2) DEFAULT '18.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" DROP COLUMN "gst_state_code";--> statement-breakpoint
ALTER TABLE "menu_items" DROP COLUMN "hsn_sac_code";--> statement-breakpoint
ALTER TABLE "menu_items" DROP COLUMN "gst_rate_percent";