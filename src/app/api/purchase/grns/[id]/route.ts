import { locked, requireIdentity } from "@/lib/server/auth";
import { api, json } from "@/lib/server/http";
import { HttpError } from "@/lib/server/permissions";
import { historicalQuery } from "@/lib/server/historical-purchase-lookup";
import { readGrns } from "@/lib/server/grn-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const id = (await context.params).id;
    const grn = await locked(async tx => {
      const actor = await requireIdentity(request, tx);
      const query = historicalQuery(request, id);
      const [row] = await readGrns(tx, actor, query);
      if (!row) throw new HttpError(404, "GRN not found");
      return row;
    });
    return json({ grn });
  });
}
