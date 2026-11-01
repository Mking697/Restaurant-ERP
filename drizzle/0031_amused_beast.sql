CREATE TABLE "vendor_review_events" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"branch_id_at_review" text,
	"category_at_review" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "status" text DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
-- GAP-015 one-time cutover: every vendor row that already existed BEFORE
-- this migration ran (i.e. every row, since the column default just
-- applied to all of them) is backfilled to APPROVED/unrestricted so
-- existing purchasing is never silently halted. This UPDATE runs exactly
-- once, inside this migration; any vendor inserted AFTER this migration
-- finishes gets the plain 'DRAFT' column default and is never touched by
-- it, so it correctly always starts DRAFT and needs an explicit Owner
-- approval going forward.
UPDATE "vendors" SET "status" = 'APPROVED' WHERE "status" = 'DRAFT';--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "approved_branch_id" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "approved_category" text;--> statement-breakpoint
ALTER TABLE "vendor_review_events" ADD CONSTRAINT "vendor_review_events_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_review_events" ADD CONSTRAINT "vendor_review_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_review_events" ADD CONSTRAINT "vendor_review_events_branch_id_at_review_branches_id_fk" FOREIGN KEY ("branch_id_at_review") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_review_events_vendor_idx" ON "vendor_review_events" USING btree ("vendor_id");--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_approved_branch_id_branches_id_fk" FOREIGN KEY ("approved_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;