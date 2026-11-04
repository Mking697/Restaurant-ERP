import { HttpError } from "./permissions";

export const BRANCH_CONCEPTS = ["FAST_FOOD", "CONVENTIONAL"] as const;
export type BranchConcept = (typeof BRANCH_CONCEPTS)[number];
export const ORDER_CHANNELS = ["DINE_IN", "TAKEAWAY", "SWIGGY", "ZOMATO"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];
export const PRODUCTION_STATIONS = ["KITCHEN", "BAR"] as const;
export type ProductionStation = (typeof PRODUCTION_STATIONS)[number];

export function assertAllowedFields(input: Record<string, unknown>, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(input).filter(key => !allowedSet.has(key));
  if (unknown.length) throw new HttpError(400, `Unknown field: ${unknown[0]}`);
}

export function parsePolicyLines(value: unknown): { menuItemId: string; qty: number }[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new HttpError(400, "1-50 order lines required");
  return value.map(line => {
    if (!line || typeof line !== "object" || Array.isArray(line)) throw new HttpError(400, "Invalid order line");
    const row = line as Record<string, unknown>;
    assertAllowedFields(row, ["menuItemId", "qty"]);
    const menuItemId = typeof row.menuItemId === "string" ? row.menuItemId.trim() : "";
    if (!menuItemId || menuItemId.length > 200) throw new HttpError(400, "Invalid menuItemId");
    if (typeof row.qty !== "number" || !Number.isInteger(row.qty) || row.qty < 1 || row.qty > 500) throw new HttpError(400, "Invalid qty (1-500)");
    return { menuItemId, qty: row.qty };
  });
}

export function branchConcept(value: unknown): BranchConcept {
  if (value === undefined || value === null || value === "") return "FAST_FOOD";
  if ((BRANCH_CONCEPTS as readonly unknown[]).includes(value)) return value as BranchConcept;
  throw new HttpError(400, "Invalid operating concept");
}

export function productionStation(value: unknown): ProductionStation {
  if (value === undefined || value === null || value === "") return "KITCHEN";
  if ((PRODUCTION_STATIONS as readonly unknown[]).includes(value)) return value as ProductionStation;
  throw new HttpError(400, "Invalid production station");
}

export function orderFlow(concept: BranchConcept, channel: OrderChannel): "PAYMENT_FIRST" | "PRODUCTION_FIRST" {
  return concept === "CONVENTIONAL" && channel === "DINE_IN" ? "PRODUCTION_FIRST" : "PAYMENT_FIRST";
}

export function tableNumber(value: unknown, flow: "PAYMENT_FIRST" | "PRODUCTION_FIRST") {
  if (value !== undefined && typeof value !== "string") throw new HttpError(400, "Invalid table number");
  const tableNo = typeof value === "string" ? value.trim() : "";
  if (tableNo.length > 40) throw new HttpError(400, "Table number is too long");
  if (flow === "PRODUCTION_FIRST" && !tableNo) throw new HttpError(400, "Table number is required for conventional dine-in");
  return tableNo;
}

export function idempotencyKey(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "idempotencyKey is required");
  const key = value.trim();
  if (!key || key.length > 128) throw new HttpError(400, "Invalid idempotencyKey");
  return key;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameReplayPayload(left: unknown, right: unknown) {
  return canonical(left) === canonical(right);
}

export function productionTickets(lines: {
  orderLineId: string;
  menuItemId: string;
  name: string;
  qty: number;
  productionStation: ProductionStation;
}[]) {
  return PRODUCTION_STATIONS.flatMap(station => {
    const stationLines = lines
      .filter(line => line.productionStation === station)
      .map(({ orderLineId, menuItemId, name, qty }) => ({ orderLineId, menuItemId, name, qty }));
    return stationLines.length ? [{ station, ticketType: station === "BAR" ? "BOT" as const : "KOT" as const, lines: stationLines }] : [];
  });
}
