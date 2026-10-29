import { api, json } from "@/lib/server/http";
import { locked, requireIdentity } from "@/lib/server/auth";
import { readVendorReturns } from "@/lib/server/vendor-returns";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  return api(async()=>locked(async tx=>{const q=new URL(request.url).searchParams;return json({returns:await readVendorReturns(tx,await requireIdentity(request,tx),{branchId:q.get("branchId"),grnId:q.get("grnId")},"purchase")});}));
}
