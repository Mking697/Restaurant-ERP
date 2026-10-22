import { check, date, index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { branches } from './platform';
import { users } from './auth';
export const employmentTypeEnum=pgEnum('employment_type',['ON_ROLL','OFF_ROLL']);
export const attendanceStatusEnum=pgEnum('attendance_status',['PRESENT','HALF_DAY','ABSENT']);
export const leaveStatusEnum=pgEnum('leave_status',['PENDING','APPROVED','REJECTED']);
export const leavePayTypeEnum=pgEnum('leave_pay_type',['PAID','UNPAID']);
export const employees=pgTable('employees',{
 id:text('id').primaryKey(),branchId:text('branch_id').notNull().references(()=>branches.id),userId:text('user_id').references(()=>users.id),name:text('name').notNull(),employmentType:employmentTypeEnum('employment_type').notNull(),joinedOn:date('joined_on').notNull(),leftOn:date('left_on'),createdById:text('created_by_id').notNull().references(()=>users.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('employees_user_unique').on(t.userId),index('employees_branch_idx').on(t.branchId),check('employees_dates',sql`${t.leftOn} is null or ${t.leftOn} >= ${t.joinedOn}`)]);
export const employeeCompensation=pgTable('employee_compensation',{
 id:text('id').primaryKey(),branchId:text('branch_id').notNull().references(()=>branches.id),employeeId:text('employee_id').notNull().references(()=>employees.id),effectiveFrom:date('effective_from').notNull(),employmentType:employmentTypeEnum('employment_type').notNull(),rate:numeric('rate',{precision:14,scale:2}).notNull(),createdById:text('created_by_id').notNull().references(()=>users.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('employee_compensation_effective_unique').on(t.employeeId,t.effectiveFrom),check('compensation_rate_positive',sql`${t.rate}>0`)]);
export const workforceAttendance=pgTable('workforce_attendance',{
 id:text('id').primaryKey(),branchId:text('branch_id').notNull().references(()=>branches.id),employeeId:text('employee_id').notNull().references(()=>employees.id),date:date('date').notNull(),status:attendanceStatusEnum('status').notNull(),note:text('note').notNull().default(''),markedById:text('marked_by_id').notNull().references(()=>users.id),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('attendance_employee_day_unique').on(t.employeeId,t.date),index('attendance_branch_date_idx').on(t.branchId,t.date)]);
export const workforceLeaves=pgTable('workforce_leaves',{
 id:text('id').primaryKey(),branchId:text('branch_id').notNull().references(()=>branches.id),employeeId:text('employee_id').notNull().references(()=>employees.id),startDate:date('start_date').notNull(),endDate:date('end_date').notNull(),reason:text('reason').notNull(),status:leaveStatusEnum('status').notNull().default('PENDING'),payType:leavePayTypeEnum('pay_type'),reviewNote:text('review_note').notNull().default(''),requestedById:text('requested_by_id').notNull().references(()=>users.id),reviewedById:text('reviewed_by_id').references(()=>users.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),reviewedAt:timestamp('reviewed_at',{withTimezone:true}),
},t=>[index('leaves_branch_idx').on(t.branchId),check('leave_dates',sql`${t.endDate} >= ${t.startDate}`),check('leave_approval_pay',sql`(${t.status}='APPROVED' and ${t.payType} is not null) or (${t.status}<>'APPROVED' and ${t.payType} is null)`)]);
export const payrollRuns=pgTable('payroll_runs',{
 id:text('id').primaryKey(),branchId:text('branch_id').notNull().references(()=>branches.id),month:text('month').notNull(),finalizedById:text('finalized_by_id').notNull().references(()=>users.id),finalizedAt:timestamp('finalized_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('payroll_branch_month_unique').on(t.branchId,t.month)]);
// This table contains FINAL snapshots only. P&L sums amount without a status filter.
export const payrollSnapshots=pgTable('payroll_snapshots',{
 id:text('id').primaryKey(),runId:text('run_id').notNull().references(()=>payrollRuns.id),branchId:text('branch_id').notNull().references(()=>branches.id),employeeId:text('employee_id').notNull().references(()=>employees.id),month:text('month').notNull(),amount:numeric('amount',{precision:16,scale:2}).notNull(),snapshot:jsonb('snapshot').notNull().$type<Record<string,unknown>>(),
},t=>[uniqueIndex('payroll_employee_month_unique').on(t.employeeId,t.month),index('payroll_snapshot_branch_month_idx').on(t.branchId,t.month),check('payroll_amount_nonnegative',sql`${t.amount}>=0`)]);
