ALTER TABLE "stock_batches" ADD COLUMN "unit_cost_tsh" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "batch_transfer_allocations" ADD COLUMN "unit_cost_tsh" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "actual_cutting_productions" ADD COLUMN "input_total_value_tsh" numeric(14, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "actual_cutting_productions" ADD COLUMN "cost_per_output_unit_tsh" numeric(14, 2) NOT NULL;