CREATE TABLE "three_way_match_grns" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"grn_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "three_way_match" DROP CONSTRAINT "three_way_match_grn_id_unique";--> statement-breakpoint
ALTER TABLE "three_way_match" ALTER COLUMN "grn_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "three_way_match_grns" ADD CONSTRAINT "three_way_match_grns_match_id_three_way_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."three_way_match"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "three_way_match_grns" ADD CONSTRAINT "three_way_match_grns_grn_id_grns_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "three_way_match_grns_match_id_idx" ON "three_way_match_grns" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "three_way_match_grns_match_grn_unique" ON "three_way_match_grns" USING btree ("match_id","grn_id");