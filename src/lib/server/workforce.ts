import { randomUUID } from 'node:crypto';
import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema/auth';
import { branches } from '@/db/schema/platform';
import { employees, employeeCompensation, workforceAttendance, workforceLeaves, payrollRuns, payrollSnapshots } from '@/db/schema/workforce';
import { mutate, requireIdentity, type Executor } from './auth';
import { api, body, json, string } from './http';
import { assertModule, branchScope, HttpError, type Identity } from './permissions';
import { postPayrollFinalizeJournal } from './accounts-ledger';
import { allowedFields as fields, assertEmployeeUserLinkChange, assertReviewActor, canSubmitOthers, rateEffectiveDate, leaveReviewMetadata } from './workforce-policy';
import { businessDate, calculatePayroll, day, money, monthRange, paise } from './workforce-calculation';

type Employee=typeof employees.$inferSelect;
type Compensation=typeof employeeCompensation.$inferSelect;

function employmentType(value:unknown) { if(value!=='ON_ROLL'&&value!=='OFF_ROLL')throw new HttpError(400,'Invalid employmentType');return value; }
function note(value:unknown,max=2000){if(value===undefined)return '';if(typeof value!=='string'||value.length>max)throw new HttpError(400,'Invalid note');return value.trim();}
function scope(actor:Identity,requested?:unknown,required=false){if(requested!==undefined&&requested!==null&&typeof requested!=='string')throw new HttpError(400,'Invalid branchId'); const b=branchScope(actor,requested as string|null|undefined);if(required&&!b)throw new HttpError(400,'Single branchId required');return b;}
async function branchExists(tx:Executor,id:string){if(!(await tx.select({id:branches.id}).from(branches).where(eq(branches.id,id))).length)throw new HttpError(400,'Branch not found');}
async function employee(tx:Executor,actor:Identity,id:unknown){const [e]=await tx.select().from(employees).where(eq(employees.id,string(id,'employeeId')));if(!e)throw new HttpError(404,'Employee not found');branchScope(actor,e.branchId);return e;}
async function compensation(tx:Executor,id:string){return (await tx.select().from(employeeCompensation).where(eq(employeeCompensation.employeeId,id))).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));}
function at(rates:Compensation[],date:string){const r=[...rates].reverse().find(r=>r.effectiveFrom<=date);if(!r)throw new HttpError(409,'Compensation history missing');return r;}
function range(e:Employee,start:string,end:string){if(end<start||start<e.joinedOn||(e.leftOn&&end>e.leftOn))throw new HttpError(400,'Dates outside employment');}
async function openInterval(tx:Executor,branchId:string,start:string,end:string){const runs=await tx.select({month:payrollRuns.month}).from(payrollRuns).where(eq(payrollRuns.branchId,branchId));if(runs.some(r=>r.month>=start.slice(0,7)&&r.month<=end.slice(0,7)))throw new HttpError(409,'Payroll month is finalized');}
async function userLink(tx:Executor,e:Employee|undefined,branchId:string,value:unknown){if(value===null||value===undefined||value==='')return null;const id=string(value,'userId');const [u]=await tx.select({id:users.id,branchId:users.branchId}).from(users).where(eq(users.id,id));if(!u||u.branchId!==branchId)throw new HttpError(400,'Linked user must belong to employee branch');const [existing]=await tx.select({id:employees.id}).from(employees).where(eq(employees.userId,id));if(existing&&existing.id!==e?.id)throw new HttpError(409,'User already linked to an employee');return id;}
function employeeDTO(e:Employee,rates:Compensation[]){const current=[...rates].reverse().find(r=>r.effectiveFrom<=businessDate())??rates[0];return {id:e.id,branchId:e.branchId,userId:e.userId,name:e.name,employmentType:current.employmentType,rate:current.rate,joinedOn:e.joinedOn,leftOn:e.leftOn,rateEffectiveFrom:current.effectiveFrom,compensationHistory:rates.map(r=>({effectiveFrom:r.effectiveFrom,rate:r.rate,employmentType:r.employmentType}))};}
export async function listEmployees(tx:Executor,actor:Identity,branch?:unknown){assertModule(actor,'PAYROLL');const b=scope(actor,branch);const es=await tx.select().from(employees).where(b?eq(employees.branchId,b):undefined).orderBy(employees.name,employees.id);const candidates=await tx.select({id:users.id,name:users.name,branchId:users.branchId}).from(users).where(b?eq(users.branchId,b):undefined);return {employees:await Promise.all(es.map(async e=>employeeDTO(e,await compensation(tx,e.id)))),users:candidates.filter(u=>u.branchId).map(({id,name})=>({id,name}))};}
export async function createEmployee(tx:Executor,actor:Identity,input:Record<string,unknown>){
 assertModule(actor,'PAYROLL');fields(input,['branchId','name','userId','employmentType','rate','joinedOn']);const branchId=scope(actor,input.branchId,true)!;await branchExists(tx,branchId);
 const joinedOn=day(input.joinedOn),type=employmentType(input.employmentType),rate=money(paise(input.rate));await openInterval(tx,branchId,joinedOn,'2199-12-31');
 const userId=await userLink(tx,undefined,branchId,input.userId),id=randomUUID();
 const [e]=await tx.insert(employees).values({id,branchId,userId,name:string(input.name,'name'),employmentType:type,joinedOn,createdById:actor.id}).returning();
 const [r]=await tx.insert(employeeCompensation).values({id:randomUUID(),branchId,employeeId:id,effectiveFrom:joinedOn,employmentType:type,rate,createdById:actor.id}).returning();return {employee:employeeDTO(e,[r])};
}
export async function updateEmployee(tx:Executor,actor:Identity,id:string,input:Record<string,unknown>){
 assertModule(actor,'PAYROLL');fields(input,['name','userId','leftOn','rate','employmentType','rateEffectiveFrom']);const e=await employee(tx,actor,id),rates=await compensation(tx,id);
 const updates:Partial<typeof employees.$inferInsert>={};
 if(input.name!==undefined)updates.name=string(input.name,'name');
 if(input.userId!==undefined){
  const userId=await userLink(tx,e,e.branchId,input.userId);
  if(userId!==e.userId){
   const history=await tx.select({id:workforceLeaves.id}).from(workforceLeaves).where(eq(workforceLeaves.employeeId,id)).limit(1);
   assertEmployeeUserLinkChange(e.userId,userId,history.length>0);
  }
  updates.userId=userId;
 }
 if(input.leftOn!==undefined){const leftOn=input.leftOn===null?null:day(input.leftOn);if(leftOn&&leftOn<e.joinedOn)throw new HttpError(400,'Exit precedes joining');
  if(leftOn!==e.leftOn){await openInterval(tx,e.branchId,(leftOn&&e.leftOn?(leftOn<e.leftOn?leftOn:e.leftOn):leftOn??e.leftOn??e.joinedOn),'2199-12-31');
   const marks=await tx.select({date:workforceAttendance.date}).from(workforceAttendance).where(eq(workforceAttendance.employeeId,id));const leaves=await tx.select().from(workforceLeaves).where(eq(workforceLeaves.employeeId,id));
   if(leftOn&&(marks.some(m=>m.date>leftOn)||leaves.some(l=>l.status!=='REJECTED'&&l.endDate>leftOn)))throw new HttpError(409,'Exit would invalidate attendance or leave');updates.leftOn=leftOn;}
 }
 if(input.rate!==undefined||input.employmentType!==undefined||input.rateEffectiveFrom!==undefined){const effectiveFrom=rateEffectiveDate(input.rateEffectiveFrom,rates.at(-1)!.effectiveFrom);
  if(effectiveFrom<e.joinedOn||(e.leftOn&&effectiveFrom>e.leftOn))throw new HttpError(400,'Rate date outside employment');await openInterval(tx,e.branchId,effectiveFrom,'2199-12-31');
  const activity=await tx.select({date:workforceAttendance.date}).from(workforceAttendance).where(and(eq(workforceAttendance.employeeId,id),gte(workforceAttendance.date,effectiveFrom)));
  const leaves=await tx.select().from(workforceLeaves).where(and(eq(workforceLeaves.employeeId,id),gte(workforceLeaves.endDate,effectiveFrom)));
  if(activity.length||leaves.some(l=>l.status!=='REJECTED'))throw new HttpError(409,'Rate change touches attendance or leave');
  const previous=rates.at(-1)!;const [r]=await tx.insert(employeeCompensation).values({id:randomUUID(),employeeId:id,branchId:e.branchId,effectiveFrom,rate:input.rate===undefined?previous.rate:money(paise(input.rate)),employmentType:input.employmentType===undefined?previous.employmentType:employmentType(input.employmentType),createdById:actor.id}).returning();rates.push(r);
 }
 const [updated]=Object.keys(updates).length?await tx.update(employees).set(updates).where(eq(employees.id,id)).returning():[e];return {employee:employeeDTO(updated,rates)};
}
export async function listAttendance(tx:Executor,actor:Identity,branch:unknown,dateValue:unknown){assertModule(actor,'ATTENDANCE');const b=scope(actor,branch),date=day(dateValue);const es=await tx.select({id:employees.id,branchId:employees.branchId,name:employees.name,userId:employees.userId,joinedOn:employees.joinedOn,leftOn:employees.leftOn}).from(employees).where(and(b?eq(employees.branchId,b):undefined,lte(employees.joinedOn,date))).orderBy(employees.name,employees.id);const selected=es.filter(e=>!e.leftOn||e.leftOn>=date),ids=selected.map(e=>e.id);if(!ids.length)return {employees:[],attendance:[],leaves:[]};return {employees:selected,attendance:await tx.select({id:workforceAttendance.id,employeeId:workforceAttendance.employeeId,date:workforceAttendance.date,status:workforceAttendance.status}).from(workforceAttendance).where(and(inArray(workforceAttendance.employeeId,ids),eq(workforceAttendance.date,date))),leaves:await tx.select({id:workforceLeaves.id,employeeId:workforceLeaves.employeeId,startDate:workforceLeaves.startDate,endDate:workforceLeaves.endDate,status:workforceLeaves.status,payType:workforceLeaves.payType}).from(workforceLeaves).where(and(inArray(workforceLeaves.employeeId,ids),eq(workforceLeaves.status,'APPROVED'),lte(workforceLeaves.startDate,date),gte(workforceLeaves.endDate,date)))};}
export async function markAttendance(tx:Executor,actor:Identity,input:Record<string,unknown>){assertModule(actor,'ATTENDANCE');fields(input,['employeeId','date','status','note']);const e=await employee(tx,actor,input.employeeId),date=day(input.date);if(date>businessDate())throw new HttpError(400,'Future attendance forbidden');range(e,date,date);if(input.status!=='PRESENT'&&input.status!=='HALF_DAY'&&input.status!=='ABSENT')throw new HttpError(400,'Invalid attendance status');await openInterval(tx,e.branchId,date,date);
 const leave=await tx.select({id:workforceLeaves.id}).from(workforceLeaves).where(and(eq(workforceLeaves.employeeId,e.id),eq(workforceLeaves.status,'APPROVED'),lte(workforceLeaves.startDate,date),gte(workforceLeaves.endDate,date)));if(leave.length)throw new HttpError(409,'Approved leave conflicts with attendance');
 const [row]=await tx.insert(workforceAttendance).values({id:randomUUID(),branchId:e.branchId,employeeId:e.id,date,status:input.status,note:note(input.note),markedById:actor.id}).onConflictDoUpdate({target:[workforceAttendance.employeeId,workforceAttendance.date],set:{status:input.status,note:note(input.note),markedById:actor.id,updatedAt:new Date()}}).returning();return {attendance:{id:row.id,employeeId:row.employeeId,date:row.date,status:row.status}};
}

export async function listLeaves(tx:Executor,actor:Identity,branch?:unknown){
 const manage=canSubmitOthers(actor);if(!manage)assertModule(actor,'LEAVE_SELF');const b=scope(actor,branch);
 const es=await tx.select({id:employees.id,name:employees.name,userId:employees.userId}).from(employees).where(and(b?eq(employees.branchId,b):undefined,manage?undefined:eq(employees.userId,actor.id))).orderBy(employees.name,employees.id);
 if(!es.length)return {leaves:[],employees:[]};const byId=new Map(es.map(e=>[e.id,e]));
 const rows=await tx.select().from(workforceLeaves).where(inArray(workforceLeaves.employeeId,es.map(e=>e.id))).orderBy(workforceLeaves.startDate,workforceLeaves.id);
 const leaves=await Promise.all(rows.map(async l=>{const e=byId.get(l.employeeId)!;return {...leaveDTO(l),employeeName:e.name,...leaveReviewMetadata(actor,e.userId,l,await compensation(tx,e.id))};}));
 return {leaves,employees:es.map(({id,name})=>({id,name}))};
}
function leaveDTO(l:typeof workforceLeaves.$inferSelect){return {id:l.id,employeeId:l.employeeId,branchId:l.branchId,startDate:l.startDate,endDate:l.endDate,reason:l.reason,status:l.status,payType:l.payType,reviewNote:l.reviewNote,requestedById:l.requestedById};}
export async function applyLeave(tx:Executor,actor:Identity,input:Record<string,unknown>){fields(input,['employeeId','startDate','endDate','reason']);const manage=canSubmitOthers(actor);if(!manage)assertModule(actor,'LEAVE_SELF');const e=await employee(tx,actor,input.employeeId);if(!manage&&e.userId!==actor.id)throw new HttpError(403,'Own linked employee required');const startDate=day(input.startDate),endDate=day(input.endDate);range(e,startDate,endDate);await openInterval(tx,e.branchId,startDate,endDate);
 const overlaps=await tx.select().from(workforceLeaves).where(and(eq(workforceLeaves.employeeId,e.id),lte(workforceLeaves.startDate,endDate),gte(workforceLeaves.endDate,startDate)));if(overlaps.some(l=>l.status!=='REJECTED'))throw new HttpError(409,'Overlapping leave');const marks=await tx.select({id:workforceAttendance.id}).from(workforceAttendance).where(and(eq(workforceAttendance.employeeId,e.id),gte(workforceAttendance.date,startDate),lte(workforceAttendance.date,endDate)));if(marks.length)throw new HttpError(409,'Attendance already marked');const [l]=await tx.insert(workforceLeaves).values({id:randomUUID(),branchId:e.branchId,employeeId:e.id,startDate,endDate,reason:string(input.reason,'reason',2000),requestedById:actor.id}).returning();return {leave:{...leaveDTO(l),employeeName:e.name}};
}
export async function reviewLeave(tx:Executor,actor:Identity,id:string,input:Record<string,unknown>){assertModule(actor,'LEAVE_APPROVAL');fields(input,['decision','payType','reviewNote']);const [l]=await tx.select().from(workforceLeaves).where(eq(workforceLeaves.id,id));if(!l)throw new HttpError(404,'Leave not found');const e=await employee(tx,actor,l.employeeId);assertReviewActor(actor,e.userId,l.requestedById);if(l.status!=='PENDING')throw new HttpError(409,'Leave already reviewed');range(e,l.startDate,l.endDate);await openInterval(tx,e.branchId,l.startDate,l.endDate);if(input.decision!=='APPROVED'&&input.decision!=='REJECTED')throw new HttpError(400,'Invalid decision');let payType:'PAID'|'UNPAID'|null=null;
 if(input.decision==='APPROVED'){if(input.payType!=='PAID'&&input.payType!=='UNPAID')throw new HttpError(400,'Explicit payType required');payType=input.payType;const rates=await compensation(tx,e.id);if(payType==='PAID'&&[at(rates,l.startDate),...rates.filter(r=>r.effectiveFrom>l.startDate&&r.effectiveFrom<=l.endDate)].some(r=>r.employmentType==='OFF_ROLL'))throw new HttpError(400,'Off-roll leave must be unpaid');const marks=await tx.select({id:workforceAttendance.id}).from(workforceAttendance).where(and(eq(workforceAttendance.employeeId,e.id),gte(workforceAttendance.date,l.startDate),lte(workforceAttendance.date,l.endDate)));if(marks.length)throw new HttpError(409,'Attendance conflicts with approval');}
 const [updated]=await tx.update(workforceLeaves).set({status:input.decision,payType,reviewNote:note(input.reviewNote),reviewedById:actor.id,reviewedAt:new Date()}).where(eq(workforceLeaves.id,id)).returning();return {leave:{...leaveDTO(updated),employeeName:e.name}};
}
export async function payroll(tx:Executor,actor:Identity,branch:unknown,monthValue:unknown,finalize=false){assertModule(actor,'PAYROLL');const b=scope(actor,branch,true)!,{start,end}=monthRange(monthValue),month=start.slice(0,7);await branchExists(tx,b);const [run]=await tx.select().from(payrollRuns).where(and(eq(payrollRuns.branchId,b),eq(payrollRuns.month,month)));
 if(run){const snapshots=await tx.select().from(payrollSnapshots).where(eq(payrollSnapshots.runId,run.id)).orderBy(payrollSnapshots.employeeId);const rows=snapshots.map(s=>s.snapshot);return {month,rows,total:money(snapshots.reduce((n,s)=>n+decimalPaise(s.amount),BigInt(0))),finalized:true};}
 if(finalize&&end>=businessDate())throw new HttpError(409,'Only completed calendar months can be finalized');
 const es=(await tx.select().from(employees).where(and(eq(employees.branchId,b),lte(employees.joinedOn,end))).orderBy(employees.id)).filter(e=>!e.leftOn||e.leftOn>=start);const rows=[];
 for(const e of es){const rates=await compensation(tx,e.id),marks=await tx.select().from(workforceAttendance).where(and(eq(workforceAttendance.employeeId,e.id),gte(workforceAttendance.date,start),lte(workforceAttendance.date,end))),leaves=await tx.select().from(workforceLeaves).where(and(eq(workforceLeaves.employeeId,e.id),lte(workforceLeaves.startDate,end),gte(workforceLeaves.endDate,start)));rows.push(calculatePayroll(e,rates,marks,leaves,month));}
 if(finalize){if(rows.some(r=>r.missingDates.length))throw new HttpError(409,'Missing attendance dates block payroll finalization');const runId=randomUUID();const [run]=await tx.insert(payrollRuns).values({id:runId,branchId:b,month,finalizedById:actor.id}).returning();for(const row of rows){row.status='FINAL';await tx.insert(payrollSnapshots).values({id:randomUUID(),runId,branchId:b,employeeId:row.employeeId,month,amount:row.amount,snapshot:row});}const total=money(rows.reduce((n,r)=>n+decimalPaise(r.amount),BigInt(0)));await postPayrollFinalizeJournal(tx,actor,{id:run.id,branchId:b},total);}
 return {month,rows,total:money(rows.reduce((n,r)=>n+decimalPaise(r.amount),BigInt(0))),finalized:finalize};
}
function decimalPaise(value:string){const [a,b='']=value.split('.');return BigInt(a)*BigInt(100)+BigInt(b.padEnd(2,'0'));}
export function workforceGet(request:Request,kind:'employees'|'attendance'|'leaves'|'payroll'){return api(async()=>{const actor=await requireIdentity(request),q=new URL(request.url).searchParams;const result=kind==='employees'?await listEmployees(db,actor,q.get('branchId')):kind==='attendance'?await listAttendance(db,actor,q.get('branchId'),q.get('date')):kind==='leaves'?await listLeaves(db,actor,q.get('branchId')):await payroll(db,actor,q.get('branchId'),q.get('month'));return json(result);});}
export function workforceWrite(request:Request,kind:'employees'|'attendance'|'leaves'|'review'|'finalize'|'employee',id=''){return api(async()=>{const input=await body(request);const result=await mutate(request,async(tx,actor)=>{if(kind==='employees')return createEmployee(tx,actor,input);if(kind==='employee')return updateEmployee(tx,actor,id,input);if(kind==='attendance')return markAttendance(tx,actor,input);if(kind==='leaves')return applyLeave(tx,actor,input);if(kind==='review')return reviewLeave(tx,actor,id,input);fields(input,['branchId','month']);if(typeof input.branchId!=='string'||!input.branchId)throw new HttpError(400,'Single branchId required');return payroll(tx,actor,input.branchId,input.month,true);});return json(result,kind==='employees'||kind==='leaves'?201:200);});}
