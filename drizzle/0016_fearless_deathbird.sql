DROP INDEX "inventory_stock_branch_raw_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_stock_branch_raw_unique" ON "inventory_stock" USING btree ("branch_id","raw_material_id");--> statement-breakpoint
CREATE INDEX "grn_lines_grn_id_idx" ON "grn_lines" USING btree ("grn_id");--> statement-breakpoint
CREATE INDEX "indent_lines_indent_id_idx" ON "indent_lines" USING btree ("indent_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_id_idx" ON "purchase_order_lines" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "pos_order_lines_order_id_idx" ON "pos_order_lines" USING btree ("order_id");