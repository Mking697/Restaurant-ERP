import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { grns, grnLines, purchaseOrders, materialReturns } from "../../db/schema/purchase";
import { rawMaterials } from "../../db/schema/menu";
import { vendors } from "../../db/schema/vendors";
import { branches } from "../../db/schema/platform";
import { auditLog } from "../../db/schema/whatsapp";
import type { Executor } from "./auth";
import { assertModule, branchScope, HttpError, type Identity } from "./permissions";
import { qualityReceiptId, qualityReceiptState } from "./grn-quality-policy";
import { returnPlan, returnReceiptId, validReturnReceipt, RETURN_ACTION, type ReturnSource } from "./vendor-return-policy";
import { allowedFields } from "./purchase";

async function loadSource(tx: Executor, actor: Identity, id: string): Promise<ReturnSource> {
  const [grn] = await tx.select().from(grns).where(eq(grns.id,id)).limit(1);
  if (!grn) throw new HttpError(404,"GRN not found");
  branchScope(actor,grn.branchId);
  const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id,grn.poId)).limit(1);
  if (!po || po.branchId !== grn.branchId) throw new HttpError(409,"GRN purchase branch mismatch; reconciliation required");
  const lines = await tx.select().from(grnLines).where(eq(grnLines.grnId,id)).orderBy(asc(grnLines.id));
  const [quality] = await tx.select().from(auditLog).where(eq(auditLog.id,qualityReceiptId(id))).limit(1);
  if (!qualityReceiptState({...grn,isGeneralPurchase:po.isGeneralPurchase},lines,quality).qualityRecorded || !["FAIL","PARTIAL"].includes(grn.qualityResult)) throw new HttpError(409,"A trusted failed quality decision is required for a vendor claim");
  return {id,branchId:grn.branchId,poId:po.id,vendorId:po.vendorId,qualityNote:grn.qualityNote,lines};
}
async function savedBatch(tx: Executor, source: ReturnSource) {
  const rows = await tx.select().from(materialReturns).where(or(eq(materialReturns.grnId,source.id),inArray(materialReturns.grnLineId,source.lines.map(l=>l.id))));
  const [receipt] = await tx.select().from(auditLog).where(eq(auditLog.id,returnReceiptId(source.id))).limit(1);
  return {rows,receipt};
}
export async function assertVendorReturnsRecorded(tx: Executor, actor: Identity, id: string) {
  const source = await loadSource(tx,actor,id), saved = await savedBatch(tx,source);
  if (!validReturnReceipt(source,saved.rows,saved.receipt)) throw new HttpError(409,"Vendor claim receipt inconsistent; reconciliation required");
}
// Caller owns the shared mutate() lock/transaction. No money receipt or stock write.
export async function recordVendorReturns(tx: Executor, actor: Identity, id: string, input: Record<string,unknown>) {
  assertModule(actor,"PURCHASE_ORDER"); allowedFields(input,[]);
  const source = await loadSource(tx,actor,id), plan = returnPlan(source), saved = await savedBatch(tx,source);
  if (saved.receipt) {
    if (!validReturnReceipt(source,saved.rows,saved.receipt)) throw new HttpError(409,"Vendor claim receipt inconsistent; reconciliation required");
    return {returns:await readVendorReturns(tx,actor,{grnId:id},"purchase"),replayed:true};
  }
  if (saved.rows.length) throw new HttpError(409,"Legacy or partial vendor claims require reconciliation");
  await tx.insert(materialReturns).values(plan.map(line=>({...line,grnId:id,submittedToAccountsAt:new Date()})));
  await tx.insert(auditLog).values({id:returnReceiptId(id),userId:actor.id,action:RETURN_ACTION,entityType:"GRN",entityId:id,metadataJson:{version:1,branchId:source.branchId,poId:source.poId,vendorId:source.vendorId,claims:plan}});
  const confirmed=await savedBatch(tx,source);
  if (!validReturnReceipt(source,confirmed.rows,confirmed.receipt)) throw new HttpError(409,"Vendor claim readback inconsistent; transaction rolled back");
  return {returns:await readVendorReturns(tx,actor,{grnId:id},"purchase"),replayed:false};
}

export async function readVendorReturns(tx: Executor, actor: Identity, query: {branchId?:string|null;grnId?:string|null}={}, view:"purchase"|"accounts"="purchase") {
  assertModule(actor,view==="accounts"?"VENDOR_REFUNDS":"PURCHASE_ORDER");
  const scope=branchScope(actor,query.branchId);
  if (query.grnId) {
    const [target]=await tx.select({branchId:grns.branchId}).from(grns).where(eq(grns.id,query.grnId)).limit(1);
    if(!target)throw new HttpError(404,"GRN not found");
    branchScope(actor,target.branchId);
    if(scope && target.branchId!==scope)throw new HttpError(403,"GRN branch does not match selected branch");
  }
  const rows=await tx.select().from(materialReturns).where(and(scope?eq(materialReturns.branchId,scope):undefined,query.grnId?eq(materialReturns.grnId,query.grnId):undefined)).orderBy(desc(materialReturns.createdAt),asc(materialReturns.id)).limit(200);
  if(!rows.length)return [];
  const ids=[...new Set(rows.map(r=>r.grnId))];
  const contexts=await tx.select({grn:grns,po:purchaseOrders,vendor:vendors.name,branch:branches.name}).from(grns).innerJoin(purchaseOrders,eq(purchaseOrders.id,grns.poId)).innerJoin(vendors,eq(vendors.id,purchaseOrders.vendorId)).innerJoin(branches,eq(branches.id,grns.branchId)).where(inArray(grns.id,ids));
  const lines=await tx.select({id:grnLines.id,grnId:grnLines.grnId,rawMaterialId:grnLines.rawMaterialId,itemDescription:grnLines.itemDescription,qtyOrdered:grnLines.qtyOrdered,qtyReceived:grnLines.qtyReceived,qtyFailed:grnLines.qtyFailed,rateOrdered:grnLines.rateOrdered,name:rawMaterials.name,unit:rawMaterials.unit}).from(grnLines).leftJoin(rawMaterials,eq(rawMaterials.id,grnLines.rawMaterialId)).where(inArray(grnLines.grnId,ids));
  const allClaims=await tx.select().from(materialReturns).where(or(inArray(materialReturns.grnId,ids),inArray(materialReturns.grnLineId,lines.map(l=>l.id))));
  const receipts=await tx.select().from(auditLog).where(inArray(auditLog.id,ids.flatMap(id=>[qualityReceiptId(id),returnReceiptId(id)])));
  const byReceipt=new Map(receipts.map(r=>[r.id,r]));
  const contextMap=new Map(contexts.map(c=>[c.grn.id,c]));
  const valid=new Map<string,boolean>();
  for(const id of ids){
    const c=contextMap.get(id), children=lines.filter(l=>l.grnId===id);
    try{
      if(!c || c.grn.branchId!==c.po.branchId)throw new Error("Invalid source");
      branchScope(actor,c.grn.branchId);
      const quality=qualityReceiptState({...c.grn,isGeneralPurchase:c.po.isGeneralPurchase},children,byReceipt.get(qualityReceiptId(id)));
      const source:ReturnSource={id,branchId:c.grn.branchId,poId:c.po.id,vendorId:c.po.vendorId,qualityNote:c.grn.qualityNote,lines:children};
      const lineIds=new Set(children.map(l=>l.id));
      valid.set(id,quality.qualityRecorded && ["FAIL","PARTIAL"].includes(c.grn.qualityResult) && validReturnReceipt(source,allClaims.filter(r=>r.grnId===id||lineIds.has(r.grnLineId)),byReceipt.get(returnReceiptId(id))));
    }catch{valid.set(id,false);}
  }
  return rows.map(row=>{
    const c=contextMap.get(row.grnId), sameScope=!!c && c.grn.branchId===row.branchId && c.po.branchId===row.branchId;
    const line=lines.find(l=>l.id===row.grnLineId && l.grnId===row.grnId);
    return {...row,branch:sameScope?c!.branch:"",poNumber:sameScope?c!.po.poNumber:"",vendorId:sameScope?c!.po.vendorId:"",vendor:sameScope?c!.vendor:"",itemName:sameScope?(line?.name??line?.itemDescription??""):"",unit:sameScope?(line?.unit??""):"",status:valid.get(row.grnId)&&sameScope?"REFUND_OR_CREDIT_EXPECTED" as const:"RECONCILIATION_REQUIRED" as const,moneyReceived:null};
  });
}
