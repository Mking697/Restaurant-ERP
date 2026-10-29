import { api, body, json, string } from "@/lib/server/http";
import { mutate } from "@/lib/server/auth";
import { recordVendorReturns } from "@/lib/server/vendor-returns";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  return api(async()=>json(await mutate(request,async(tx,actor)=>recordVendorReturns(tx,actor,string((await params).id,"GRN ID"),await body(request)))));
}
