import { workforceWrite } from '@/lib/server/workforce';
export const dynamic='force-dynamic';
export function POST(request:Request){return workforceWrite(request,'finalize');}
