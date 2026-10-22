import { workforceGet, workforceWrite } from '@/lib/server/workforce';
export const dynamic='force-dynamic';
export function GET(request:Request){return workforceGet(request,'payroll');}
