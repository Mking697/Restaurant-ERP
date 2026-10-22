CREATE TYPE "public"."expense_category" AS ENUM('RENT', 'UTILITIES', 'MARKETING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('POSTED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'HALF_DAY', 'ABSENT');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('ON_ROLL', 'OFF_ROLL');--> statement-breakpoint
CREATE TYPE "public"."leave_pay_type" AS ENUM('PAID', 'UNPAID');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'ACCOUNTANT' BEFORE 'CASHIER';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branch_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"date" date NOT NULL,
	"category" "expense_category" NOT NULL,
	"subcategory" text DEFAULT '' NOT NULL,
	"amount" numeric(11, 2) NOT NULL,
	"description" text NOT NULL,
	"reference" text NOT NULL,
	"status" "expense_status" DEFAULT 'POSTED' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"void_reason" text,
	"voided_by_id" text,
	"voided_at" timestamp with time zone,
	CONSTRAINT "expenses_amount_positive" CHECK ("branch_expenses"."amount" > 0),
	CONSTRAINT "expenses_void_audit" CHECK (("branch_expenses"."status" = 'POSTED' and "branch_expenses"."void_reason" is null and "branch_expenses"."voided_by_id" is null and "branch_expenses"."voided_at" is null) or ("branch_expenses"."status" = 'VOID' and "branch_expenses"."void_reason" is not null and length(trim("branch_expenses"."void_reason")) >= 3 and "branch_expenses"."voided_by_id" is not null and "branch_expenses"."voided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_compensation" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"employment_type" "employment_type" NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensation_rate_positive" CHECK ("employee_compensation"."rate">0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"employment_type" "employment_type" NOT NULL,
	"joined_on" date NOT NULL,
	"left_on" date,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_dates" CHECK ("employees"."left_on" is null or "employees"."left_on" >= "employees"."joined_on")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"month" text NOT NULL,
	"finalized_by_id" text NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"month" text NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "payroll_amount_nonnegative" CHECK ("payroll_snapshots"."amount">=0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workforce_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"marked_by_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workforce_leaves" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_status" DEFAULT 'PENDING' NOT NULL,
	"pay_type" "leave_pay_type",
	"review_note" text DEFAULT '' NOT NULL,
	"requested_by_id" text NOT NULL,
	"reviewed_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "leave_dates" CHECK ("workforce_leaves"."end_date" >= "workforce_leaves"."start_date"),
	CONSTRAINT "leave_approval_pay" CHECK (("workforce_leaves"."status"='APPROVED' and "workforce_leaves"."pay_type" is not null) or ("workforce_leaves"."status"<>'APPROVED' and "workforce_leaves"."pay_type" is null))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branch_expenses" ADD CONSTRAINT "branch_expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branch_expenses" ADD CONSTRAINT "branch_expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branch_expenses" ADD CONSTRAINT "branch_expenses_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_compensation" ADD CONSTRAINT "employee_compensation_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_compensation" ADD CONSTRAINT "employee_compensation_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_compensation" ADD CONSTRAINT "employee_compensation_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalized_by_id_users_id_fk" FOREIGN KEY ("finalized_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_snapshots" ADD CONSTRAINT "payroll_snapshots_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_snapshots" ADD CONSTRAINT "payroll_snapshots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_snapshots" ADD CONSTRAINT "payroll_snapshots_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workforce_attendance" ADD CONSTRAINT "workforce_attendance_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workforce_attendance" ADD CONSTRAINT "workforce_attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workforce_attendance" ADD CONSTRAINT "workforce_attendance_marked_by_id_users_id_fk" FOREIGN KEY ("marked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workforce_leaves" ADD CONSTRAINT "workforce_leaves_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workforce_leaves" ADD CONSTRAINT "workforce_leaves_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workforce_leaves" ADD CONSTRAINT "workforce_leaves_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workforce_leaves" ADD CONSTRAINT "workforce_leaves_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_branch_actor_key_unique" ON "branch_expenses" USING btree ("branch_id","created_by_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_branch_date_idx" ON "branch_expenses" USING btree ("branch_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employee_compensation_effective_unique" ON "employee_compensation" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employees_user_unique" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_branch_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_branch_month_unique" ON "payroll_runs" USING btree ("branch_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_employee_month_unique" ON "payroll_snapshots" USING btree ("employee_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_snapshot_branch_month_idx" ON "payroll_snapshots" USING btree ("branch_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_employee_day_unique" ON "workforce_attendance" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_branch_date_idx" ON "workforce_attendance" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaves_branch_idx" ON "workforce_leaves" USING btree ("branch_id");