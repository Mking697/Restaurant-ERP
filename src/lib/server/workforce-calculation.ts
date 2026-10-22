import { HttpError } from './permissions';
export function day(value: unknown): string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2199-12-31') throw new HttpError(400,'Invalid date'); const parsed=new Date(value+'T00:00:00Z'); if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value) throw new HttpError(400,'Invalid date'); return value;
}
export function monthRange(value: unknown) {
 if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new HttpError(400,'Invalid month');
 const start=day(value+'-01'), date=new Date(start+'T00:00:00Z'); date.setUTCMonth(date.getUTCMonth()+1); date.setUTCDate(0);
 return {start,end:date.toISOString().slice(0,10),calendarDays:date.getUTCDate()};
}
export function days(start:string,end:string) { const result:string[]=[]; for(let d=new Date(start+'T00:00:00Z');d.toISOString().slice(0,10)<=end;d.setUTCDate(d.getUTCDate()+1)) result.push(d.toISOString().slice(0,10)); return result; }
export function paise(value:unknown) { if(typeof value!=='string'||!/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw new HttpError(400,'Rate must be a positive INR decimal string'); const [a,b='']=value.split('.'); const n=BigInt(a)*BigInt(100)+BigInt(b.padEnd(2,'0')); if(n<=BigInt(0)) throw new HttpError(400,'Rate must be positive'); return n; }
export function money(n:bigint){ return `${n/BigInt(100)}.${String(n%BigInt(100)).padStart(2,'0')}`; }
export type Employee = {id:string;branchId:string;name:string;employmentType:string;joinedOn:string;leftOn:string|null};
export type Rate={effectiveFrom:string;rate:string;employmentType:string};
export type Mark={date:string;status:string};
export type Leave={startDate:string;endDate:string;status:string;payType:string|null};
export function businessDate(now=new Date()) { const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); return `${p.find(x=>x.type==='year')!.value}-${p.find(x=>x.type==='month')!.value}-${p.find(x=>x.type==='day')!.value}`; }
export function calculatePayroll(e:Employee,rates:Rate[],marks:Mark[],leaves:Leave[],month:string,today=businessDate()){
 const {start,end,calendarDays}=monthRange(month); const applicable=rates.filter(r=>r.effectiveFrom<=end).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 let presentDays=0,halfDays=0,paidLeaveDays=0,unpaidDays=0,units=0,numerator=BigInt(0); const missingDates:string[]=[];
 const segments=new Map<string,{effectiveFrom:string;rate:string;employmentType:string;payableHalfUnits:number}>();
 for(const date of days(start,end)){
  if(date>today||date<e.joinedOn||(e.leftOn&&date>e.leftOn)) continue;
  const rate=[...applicable].reverse().find(r=>r.effectiveFrom<=date); if(!rate) throw new HttpError(409,'Compensation history missing');
  const mark=marks.find(m=>m.date===date), leave=leaves.find(l=>l.status==='APPROVED'&&l.startDate<=date&&l.endDate>=date); let u=0;
  if(mark&&leave) throw new HttpError(409,'Conflicting attendance and leave');
  if(leave){if(leave.payType==='PAID'&&rate.employmentType==='ON_ROLL'){paidLeaveDays++;u=2;}else unpaidDays++;}
  else if(mark?.status==='PRESENT'){presentDays++;u=2;}else if(mark?.status==='HALF_DAY'){halfDays++;u=1;}else if(mark?.status==='ABSENT') unpaidDays++;else missingDates.push(date);
  units+=u; numerator+=paise(rate.rate)*BigInt(u)*BigInt(rate.employmentType==='OFF_ROLL'?calendarDays:1);
  const segment=segments.get(rate.effectiveFrom)??{...rate,payableHalfUnits:0};segment.payableHalfUnits+=u;segments.set(rate.effectiveFrom,segment);
 }
 const denominator=BigInt(2*calendarDays), amount=money((numerator+denominator/BigInt(2))/denominator), last=applicable.at(-1);
 return {employeeId:e.id,employeeName:e.name,branchId:e.branchId,employmentType:last?.employmentType??e.employmentType,rate:last?.rate??'0.00',calendarDays,presentDays,halfDays,paidLeaveDays,unpaidDays,missingDates,payableUnits:String(units/2),amount,status:'DRAFT' as 'DRAFT'|'FINAL',rateSegments:[...segments.values()]};
}
