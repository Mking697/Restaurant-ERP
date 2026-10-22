import { workforceWrite } from '@/lib/server/workforce';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return workforceWrite(request,'review',(await context.params).id);}
