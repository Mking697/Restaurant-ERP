CREATE TABLE "pos_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"order_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_lifecycle_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"request_key" text NOT NULL,
	"request_json" jsonb NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_lifecycle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"revision" integer NOT NULL,
	"reason" text,
	"from_status" text,
	"to_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "service_status" text DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pos_production_tickets" ADD COLUMN "status" text DEFAULT 'SENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_production_tickets" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_production_tickets" ADD COLUMN "snapshot_lines" jsonb;--> statement-breakpoint
ALTER TABLE "pos_drafts" ADD CONSTRAINT "pos_drafts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_drafts" ADD CONSTRAINT "pos_drafts_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_drafts" ADD CONSTRAINT "pos_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_lifecycle_actions" ADD CONSTRAINT "pos_lifecycle_actions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_lifecycle_actions" ADD CONSTRAINT "pos_lifecycle_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_lifecycle_events" ADD CONSTRAINT "pos_lifecycle_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_lifecycle_events" ADD CONSTRAINT "pos_lifecycle_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_drafts_branch_status_idx" ON "pos_drafts" USING btree ("branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_drafts_order_unique" ON "pos_drafts" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_lifecycle_actions_branch_key_unique" ON "pos_lifecycle_actions" USING btree ("branch_id","request_key");--> statement-breakpoint
CREATE INDEX "pos_lifecycle_actions_target_idx" ON "pos_lifecycle_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_lifecycle_events_target_revision_unique" ON "pos_lifecycle_events" USING btree ("target_type","target_id","revision");--> statement-breakpoint
CREATE INDEX "pos_lifecycle_events_branch_idx" ON "pos_lifecycle_events" USING btree ("branch_id");