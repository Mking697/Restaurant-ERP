import { hasModule, HttpError, type Identity } from './permissions';
import { businessDate, day } from './workforce-calculation';
export function allowedFields(input:Record<string,unknown>,allowed:string[]) {
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw new HttpError(400,'Unknown field');
}
export function canSubmitOthers(actor:Identity){return hasModule(actor,'LEAVE_APPROVAL')||hasModule(actor,'PAYROLL');}
// Without a persisted beneficiary snapshot, retain the original login for ALL leave
// history (including approved self-service records), regardless of who edits it.
export function assertEmployeeUserLinkChange(current:string|null,next:string|null,hasLeaveHistory:boolean){
 if(current!==next&&hasLeaveHistory)throw new HttpError(409,'Employee login link is locked by leave history');
}
export function assertReviewActor(actor:Identity,employeeUserId:string|null,requestedById:string){
 if(employeeUserId===actor.id||requestedById===actor.id)throw new HttpError(403,'Cannot review own leave request');
}
export function leaveReviewMetadata(actor: Identity, employeeUserId: string | null, leave: {requestedById:string;status:string;startDate:string;endDate:string}, rates: Array<{effectiveFrom:string;employmentType:string}>) {
 const sorted = [...rates].sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
 const initial = [...sorted].reverse().find(r => r.effectiveFrom <= leave.startDate);
 const interval = [initial, ...sorted.filter(r => r.effectiveFrom > leave.startDate && r.effectiveFrom <= leave.endDate)];
 return {canReview: hasModule(actor,'LEAVE_APPROVAL') && leave.status === 'PENDING' && employeeUserId !== actor.id && leave.requestedById !== actor.id,
   paidLeaveAllowed: !!initial && interval.every(r => r?.employmentType === 'ON_ROLL')};
}
export function rateEffectiveDate(value:unknown,lastEffective:string,today=businessDate()){
 const effectiveFrom=day(value);
 if(effectiveFrom<=today||!effectiveFrom.endsWith('-01')||effectiveFrom<=lastEffective)throw new HttpError(409,'Rate changes require an increasing future month boundary');
 return effectiveFrom;
}
