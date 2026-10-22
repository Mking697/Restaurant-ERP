export type ExpenseEntry = {
  date: string; category: "RENT" | "UTILITIES" | "MARKETING" | "OTHER";
  subcategory: string; amount: string; description: string; reference: string;
};
export type ExpensePayload = ExpenseEntry & { branchId: string; idempotencyKey: string };
type Scope = { actorId: string; branchId: string; month: string };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

const inFlight = new Set<string>();
/** Session-only expense replay journal; never store identity DTOs or credentials. */
export function createExpenseAttempt(storage: () => Storage, scope: Scope) {
  const key = `erp:expense-attempt:v1:${JSON.stringify([scope.actorId, scope.branchId, scope.month])}`;
  function read(): ExpensePayload | null {
    const value = storage().getItem(key);
    if (value === null) return null;
    const payload: unknown = JSON.parse(value);
    const fields = ["date", "category", "subcategory", "amount", "description", "reference", "branchId", "idempotencyKey"];
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== fields.length ||
      !fields.every(field => field in payload && typeof (payload as Record<string, unknown>)[field] === "string")) throw new Error("Expense recovery storage is damaged; posting is blocked.");
    const saved = payload as ExpensePayload;
    if (saved.branchId !== scope.branchId || !saved.date.startsWith(`${scope.month}-`) ||
      !["RENT", "UTILITIES", "MARKETING", "OTHER"].includes(saved.category) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.idempotencyKey)) throw new Error("Expense recovery scope or key is damaged; posting is blocked.");
    return saved;
  }
  function matches(record: unknown, payload: ExpensePayload) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return false;
    const row = record as Partial<Omit<ExpensePayload, "subcategory">> & { id?: string; createdById?: string; status?: string; subcategory?: string | null };
    return typeof row.id === "string" && !!row.id && row.createdById === scope.actorId && row.branchId === scope.branchId &&
      (row.status === "POSTED" || row.status === "VOID") && row.date === payload.date && row.category === payload.category &&
      // Compare the server's canonical text, but retain raw payload spelling for replay fingerprints.
      (row.subcategory === null ? "" : row.subcategory) === payload.subcategory.trim() && row.description === payload.description.trim() && row.reference === payload.reference.trim() &&
      typeof row.amount === "string" && Number.isFinite(Number(row.amount)) && Number(row.amount) === Number(payload.amount);
  }
  return {
    read,
    async submit(entry: ExpenseEntry, send: (payload: ExpensePayload) => Promise<unknown>, expectedKey: string | null = null) {
      if (inFlight.has(key)) throw new Error("This expense is still being submitted. Wait before retrying.");
      inFlight.add(key);
      try {
        const previous = read();
        if (expectedKey && previous?.idempotencyKey !== expectedKey) throw new Error("This attempt was completed or its recovery journal changed. Check saved records; no new expense was sent.");
        const payload = previous ?? { ...entry, branchId: scope.branchId, idempotencyKey: crypto.randomUUID() };
        const serialized = JSON.stringify(payload);
        try {
          storage().setItem(key, serialized);
          if (storage().getItem(key) !== serialized) throw new Error("Journal verification failed");
          read();
        } catch { throw new Error("Expense recovery storage could not retain this attempt. No new request was sent; posting is blocked until storage works."); }
        try {
          const result = await send(payload);
          if (!result || typeof result !== "object" || !("expense" in result) || !matches(result.expense, payload)) throw new Error("Expense outcome is unresolved: no matching saved record was returned. Retry only this same expense.");
        }
        catch (error) {
          // A rejection of a replay does NOT disprove an earlier uncertain commit.
          if (!previous && typeof error === "object" && error !== null && "outcome" in error && error.outcome === "rejected") storage().removeItem(key);
          throw error;
        }
        storage().removeItem(key);
      } finally { inFlight.delete(key); }
    },
  };
}
