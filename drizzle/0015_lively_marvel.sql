ALTER TABLE "cash_drops" ADD COLUMN "note_10000_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_drops" ADD COLUMN "note_5000_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_drops" ADD COLUMN "note_2000_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_drops" ADD COLUMN "note_1000_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_drops" DROP COLUMN "note_200_count";--> statement-breakpoint
ALTER TABLE "cash_drops" DROP COLUMN "note_100_count";--> statement-breakpoint
ALTER TABLE "cash_drops" DROP COLUMN "note_50_count";--> statement-breakpoint
ALTER TABLE "cash_drops" DROP COLUMN "note_20_count";--> statement-breakpoint
ALTER TABLE "cash_drops" DROP COLUMN "note_10_count";
