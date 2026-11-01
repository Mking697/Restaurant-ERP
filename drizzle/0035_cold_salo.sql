CREATE SEQUENCE "public"."debit_note_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "debit_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"debit_note_number" text NOT NULL,
	"material_return_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"amount_tsh" numeric(12, 2) NOT NULL,
	"reason_note" text NOT NULL,
	"issued_by_id" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_id" text,
	"cancelled_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "debit_notes_debit_note_number_unique" UNIQUE("debit_note_number")
);
--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_material_return_id_material_returns_id_fk" FOREIGN KEY ("material_return_id") REFERENCES "public"."material_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debit_notes_claim_id_idx" ON "debit_notes" USING btree ("material_return_id");--> statement-breakpoint
CREATE INDEX "debit_notes_branch_id_idx" ON "debit_notes" USING btree ("branch_id");