import { db } from "@/db/client";
import { mutate, requireIdentity } from "@/lib/server/auth";
import { api, body, json } from "@/lib/server/http";
import { allowedFields } from "@/lib/server/purchase";
import { issueDebitNote, listDebitNotes } from "@/lib/server/debit-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GAP-019. GET lists debit notes for a claim; POST issues a new one.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const actor = await requireIdentity(request);
    const debitNotesList = await listDebitNotes(db, actor, id);
    return json({ debitNotes: debitNotesList });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const input = await body(request);
    allowedFields(input, ["reasonNote"]);
    const result = await mutate(request, (tx, actor) => issueDebitNote(tx, actor, id, input));
    return json(result, 201);
  });
}
