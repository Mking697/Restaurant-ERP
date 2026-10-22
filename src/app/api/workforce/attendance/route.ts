import { workforceGet, workforceWrite } from '@/lib/server/workforce';
export const dynamic='force-dynamic';
export function GET(request:Request){return workforceGet(request,'attendance');}
export function POST(request:Request){return workforceWrite(request,'attendance');}
