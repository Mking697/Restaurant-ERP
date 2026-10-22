import { workforceWrite } from '@/lib/server/workforce';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return workforceWrite(request,'employee',(await context.params).id);}
