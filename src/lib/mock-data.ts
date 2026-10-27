/**
 * PLACEHOLDER DATA — shaped exactly like the Drizzle schema's query results so
 * swapping these functions for real `db.select()...` calls in Phase 3 is a
 * drop-in replacement, not a rewrite. Nothing here is wired to Postgres yet
 * (no DB is running). Replace each function body with a real query once the
 * backend API layer exists — keep the same return shape so pages don't change.
 */

export const BRANCH_NAMES: Record<string, string> = {
  b1: "Connaught Place",
  b2: "Saket",
  b3: "Gurugram",
  b4: "Noida",
  b5: "Dwarka",
  b6: "Rohini",
};

/**
 * Branch isolation helper — every mock row below carries a `branch` NAME
 * (matches the schema's real FK-by-id relationship once Postgres is live;
 * these are placeholder rows, not DB rows, so they key off name for
 * readability). `branchId` is "all" (no filter — HQ/compiled view) or
 * "b1".."b6" (filters to exactly that branch's rows). Pages call this
 * instead of filtering inline so the rule lives in one place.
 */
export function filterByBranch<T extends { branch: string }>(rows: T[], branchId: string): T[] {
  if (branchId === "all") return rows;
  const name = BRANCH_NAMES[branchId];
  return rows.filter((r) => r.branch === name);
}

export interface BranchKpi {
  branchId: string;
  branchName: string;
  revenueToday: number;
  revenueMtd: number;
  primeCostPercent: number;
  foodCostPercent: number;
  openTasksOverdue: number;
  misScore: number;
  cashVarianceInr: number;
  pilferageFlags: number;
  totalInventoryValueInr: number;
}

export function getBranchKpis(): BranchKpi[] {
  return [
    { branchId: "b1", branchName: BRANCH_NAMES.b1, revenueToday: 142500, revenueMtd: 3120000, primeCostPercent: 58.2, foodCostPercent: 31.4, openTasksOverdue: 1, misScore: 88.5, cashVarianceInr: -150, pilferageFlags: 0, totalInventoryValueInr: 284500 },
    { branchId: "b2", branchName: BRANCH_NAMES.b2, revenueToday: 118900, revenueMtd: 2650000, primeCostPercent: 61.0, foodCostPercent: 33.8, openTasksOverdue: 3, misScore: 74.2, cashVarianceInr: -820, pilferageFlags: 1, totalInventoryValueInr: 198200 },
    { branchId: "b3", branchName: BRANCH_NAMES.b3, revenueToday: 165300, revenueMtd: 3480000, primeCostPercent: 55.9, foodCostPercent: 29.1, openTasksOverdue: 0, misScore: 93.1, cashVarianceInr: 0, pilferageFlags: 0, totalInventoryValueInr: 312800 },
    { branchId: "b4", branchName: BRANCH_NAMES.b4, revenueToday: 97400, revenueMtd: 2190000, primeCostPercent: 63.4, foodCostPercent: 35.2, openTasksOverdue: 4, misScore: 61.8, cashVarianceInr: -1240, pilferageFlags: 2, totalInventoryValueInr: 156900 },
    { branchId: "b5", branchName: BRANCH_NAMES.b5, revenueToday: 131200, revenueMtd: 2890000, primeCostPercent: 59.5, foodCostPercent: 32.0, openTasksOverdue: 2, misScore: 81.0, cashVarianceInr: -300, pilferageFlags: 0, totalInventoryValueInr: 221400 },
    { branchId: "b6", branchName: BRANCH_NAMES.b6, revenueToday: 108700, revenueMtd: 2410000, primeCostPercent: 60.8, foodCostPercent: 33.0, openTasksOverdue: 1, misScore: 79.4, cashVarianceInr: 90, pilferageFlags: 0, totalInventoryValueInr: 179600 },
  ];
}

export function getRevenueTrend14d() {
  const days = 14;
  const out: { date: string; revenue: number; primeCostPercent: number }[] = [];
  const base = 720000;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const wobble = Math.sin(i / 2) * 60000 + (Math.random() - 0.5) * 40000;
    out.push({
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      revenue: Math.round(base + wobble),
      primeCostPercent: Math.round((59 + Math.sin(i / 3) * 3) * 10) / 10,
    });
  }
  return out;
}

export function getAggregatorSplit() {
  return [
    { name: "Dine-in", value: 38 },
    { name: "Takeaway", value: 17 },
    { name: "Swiggy", value: 28 },
    { name: "Zomato", value: 17 },
  ];
}

export interface MisRow {
  userId: string;
  name: string;
  role: string;
  branch: string;
  onTimeCount: number;
  delayCount: number;
  notDoneCount: number;
  totalScore: number;
}

export function getMisLeaderboard(): MisRow[] {
  return [
    { userId: "u1", name: "Rahul Sharma", role: "BRANCH_MANAGER", branch: "Gurugram", onTimeCount: 42, delayCount: 2, notDoneCount: 0, totalScore: 93.1 },
    { userId: "u2", name: "Priya Nair", role: "BRANCH_MANAGER", branch: "Connaught Place", onTimeCount: 39, delayCount: 4, notDoneCount: 1, totalScore: 88.5 },
    { userId: "u3", name: "Dwarka Team", role: "KITCHEN_STAFF", branch: "Dwarka", onTimeCount: 35, delayCount: 6, notDoneCount: 2, totalScore: 81.0 },
    { userId: "u4", name: "Rohini Team", role: "KITCHEN_STAFF", branch: "Rohini", onTimeCount: 33, delayCount: 7, notDoneCount: 3, totalScore: 79.4 },
    { userId: "u5", name: "Saket Team", role: "CASHIER", branch: "Saket", onTimeCount: 29, delayCount: 10, notDoneCount: 4, totalScore: 74.2 },
    { userId: "u6", name: "Noida Team", role: "KITCHEN_STAFF", branch: "Noida", onTimeCount: 22, delayCount: 14, notDoneCount: 8, totalScore: 61.8 },
  ];
}

// Checklist IS the recurring task (per the brief — not two separate
// systems). FREQUENCIES is the fixed 7-option vocabulary from
// taskFrequencyEnum in src/db/schema/tasks.ts.
export const FREQUENCIES = [
  { code: "DAILY", label: "Daily" },
  { code: "WEEKLY", label: "Weekly" },
  { code: "FORTNIGHTLY", label: "Every 15 days" },
  { code: "MONTHLY", label: "Monthly" },
  { code: "QUARTERLY", label: "Quarterly" },
  { code: "HALF_YEARLY", label: "Half-Yearly" },
  { code: "YEARLY", label: "Yearly" },
] as const;

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

export interface TaskRow {
  id: string;
  title: string;
  branch: string;
  assignedTo: string;
  type: "RECURRING" | "ONE_TIME";
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "OVERDUE" | "ESCALATED" | "SKIPPED";
  dueAt: string;
  // RECURRING only — the frequency this was auto-generated from.
  frequency?: (typeof FREQUENCIES)[number]["code"];
  // ONE_TIME (delegation) only.
  priority?: (typeof PRIORITIES)[number];
  // Doer-attached evidence filename. Optional for RECURRING, REQUIRED for
  // ONE_TIME before it can be marked DONE (enforced in the Mark Done dialog).
  attachmentName?: string;
}

export function getTasks(): TaskRow[] {
  return [
    { id: "t1", title: "Opening checklist — walk-in fridge temp log", branch: "Connaught Place", assignedTo: "Priya Nair", type: "RECURRING", status: "DONE", dueAt: "09:00", frequency: "DAILY", attachmentName: "fridge-temp-log.jpg" },
    { id: "t2", title: "Night variance count — raw material", branch: "Gurugram", assignedTo: "Chef on duty", type: "RECURRING", status: "PENDING", dueAt: "23:30", frequency: "DAILY" },
    { id: "t3", title: "Repair exhaust fan — Kitchen 2", branch: "Noida", assignedTo: "Maintenance vendor", type: "ONE_TIME", status: "OVERDUE", dueAt: "Yesterday 18:00", priority: "HIGH" },
    { id: "t4", title: "Hygiene audit", branch: "Dwarka", assignedTo: "Dwarka Team", type: "RECURRING", status: "IN_PROGRESS", dueAt: "Today 17:00", frequency: "MONTHLY" },
    { id: "t5", title: "Vendor rate re-negotiation call", branch: "HQ", assignedTo: "Central Store Mgr", type: "ONE_TIME", status: "ESCALATED", dueAt: "2 days overdue", priority: "MEDIUM" },
    { id: "t6", title: "Fire extinguisher inspection", branch: "Rohini", assignedTo: "Rohini Team", type: "RECURRING", status: "PENDING", dueAt: "This quarter", frequency: "QUARTERLY" },
    { id: "t7", title: "AC deep service", branch: "Saket", assignedTo: "Saket Team", type: "RECURRING", status: "PENDING", dueAt: "Next half-year", frequency: "HALF_YEARLY" },
    { id: "t8", title: "Replace signage board", branch: "Noida", assignedTo: "Store Incharge", type: "ONE_TIME", status: "PENDING", dueAt: "Today 20:00", priority: "LOW" },
  ];
}

export interface StockRow {
  rawMaterial: string;
  branch: string;
  qtyOnHand: number;
  uom: string;
  minStockLevel: number;
  maxStockLevel: number;
  nearestExpiry: string;
  isHighValue: boolean;
}

export const UOM_OPTIONS = ["kg", "g", "ltr", "ml", "pcs", "box", "pack"] as const;

export function getInventory(): StockRow[] {
  return [
    { rawMaterial: "Paneer", branch: "Connaught Place", qtyOnHand: 18, uom: "kg", minStockLevel: 15, maxStockLevel: 40, nearestExpiry: "2 days", isHighValue: true },
    { rawMaterial: "Chicken (boneless)", branch: "Gurugram", qtyOnHand: 9, uom: "kg", minStockLevel: 20, maxStockLevel: 60, nearestExpiry: "1 day", isHighValue: true },
    { rawMaterial: "Basmati Rice", branch: "Noida", qtyOnHand: 85, uom: "kg", minStockLevel: 40, maxStockLevel: 90, nearestExpiry: "60 days", isHighValue: false },
    { rawMaterial: "Fresh Cream", branch: "Saket", qtyOnHand: 4, uom: "ltr", minStockLevel: 10, maxStockLevel: 30, nearestExpiry: "Today", isHighValue: true },
    { rawMaterial: "Cooking Oil", branch: "Rohini", qtyOnHand: 32, uom: "ltr", minStockLevel: 25, maxStockLevel: 35, nearestExpiry: "180 days", isHighValue: false },
  ];
}

export interface FoodCostRow {
  menuItem: string;
  branch: string;
  sellingPrice: number;
  bomCost: number;
  foodCostPercent: number;
  marginInr: number;
}

export function getFoodCostReport(): FoodCostRow[] {
  const rows: Omit<FoodCostRow, "foodCostPercent" | "marginInr">[] = [
    { menuItem: "Butter Chicken", branch: "Connaught Place", sellingPrice: 420, bomCost: 138 },
    { menuItem: "Paneer Tikka", branch: "Gurugram", sellingPrice: 320, bomCost: 95 },
    { menuItem: "Veg Biryani", branch: "Noida", sellingPrice: 280, bomCost: 112 },
    { menuItem: "Dal Makhani", branch: "Saket", sellingPrice: 260, bomCost: 68 },
    { menuItem: "Tandoori Chicken (Full)", branch: "Dwarka", sellingPrice: 540, bomCost: 215 },
  ];
  return rows.map((r) => ({
    ...r,
    foodCostPercent: Math.round((r.bomCost / r.sellingPrice) * 1000) / 10,
    marginInr: r.sellingPrice - r.bomCost,
  }));
}

export interface CashReconRow {
  cashier: string;
  branch: string;
  shiftDate: string;
  expectedInr: number;
  countedInr: number;
  shortageExcessInr: number;
}

export function getCashReconciliation(): CashReconRow[] {
  return [
    { cashier: "Amit Kumar", branch: "Connaught Place", shiftDate: "Today", expectedInr: 18500, countedInr: 18350, shortageExcessInr: -150 },
    { cashier: "Sunita Devi", branch: "Gurugram", shiftDate: "Today", expectedInr: 21200, countedInr: 20380, shortageExcessInr: -820 },
    { cashier: "Vikas Yadav", branch: "Noida", shiftDate: "Today", expectedInr: 15900, countedInr: 14660, shortageExcessInr: -1240 },
    { cashier: "Pooja Singh", branch: "Dwarka", shiftDate: "Today", expectedInr: 19800, countedInr: 19500, shortageExcessInr: -300 },
    { cashier: "Rohit Verma", branch: "Rohini", shiftDate: "Today", expectedInr: 17300, countedInr: 17390, shortageExcessInr: 90 },
  ];
}

export interface AggregatorRow {
  channel: "SWIGGY" | "ZOMATO";
  branch: string;
  orderValue: number;
  commissionAmount: number;
  adsAmount: number;
  refundPenalty: number;
  netPayout: number;
}

export function getAggregatorRecon(): AggregatorRow[] {
  return [
    { channel: "SWIGGY", branch: "Connaught Place", orderValue: 48200, commissionAmount: 9640, adsAmount: 1200, refundPenalty: 300, netPayout: 37060 },
    { channel: "ZOMATO", branch: "Connaught Place", orderValue: 29400, commissionAmount: 6468, adsAmount: 900, refundPenalty: 150, netPayout: 21882 },
    { channel: "SWIGGY", branch: "Gurugram", orderValue: 52100, commissionAmount: 10420, adsAmount: 1500, refundPenalty: 420, netPayout: 39760 },
    { channel: "ZOMATO", branch: "Noida", orderValue: 24800, commissionAmount: 5456, adsAmount: 700, refundPenalty: 220, netPayout: 18424 },
  ];
}

export interface VarianceRow {
  rawMaterial: string;
  branch: string;
  theoreticalQty: number;
  physicalQty: number;
  varianceValueInr: number;
  flaggedPilferage: boolean;
}

export function getVarianceReport(): VarianceRow[] {
  return [
    { rawMaterial: "Chicken (boneless)", branch: "Gurugram", theoreticalQty: 42, physicalQty: 37.5, varianceValueInr: -1890, flaggedPilferage: true },
    { rawMaterial: "Paneer", branch: "Noida", theoreticalQty: 20, physicalQty: 18.8, varianceValueInr: -480, flaggedPilferage: true },
    { rawMaterial: "Basmati Rice", branch: "Connaught Place", theoreticalQty: 60, physicalQty: 59.6, varianceValueInr: -56, flaggedPilferage: false },
    { rawMaterial: "Cooking Oil", branch: "Saket", theoreticalQty: 30, physicalQty: 30.2, varianceValueInr: 32, flaggedPilferage: false },
  ];
}

export interface IndentRow {
  id: string;
  branch: string;
  raisedBy: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PO_RAISED";
  spikePercent: number | null;
  lineCount: number;
  createdAt: string;
}

export function getIndents(): IndentRow[] {
  return [
    { id: "IND-1042", branch: "Gurugram", raisedBy: "Rahul Sharma", status: "PENDING_APPROVAL", spikePercent: 34.2, lineCount: 8, createdAt: "Today 10:12" },
    { id: "IND-1041", branch: "Connaught Place", raisedBy: "Priya Nair", status: "APPROVED", spikePercent: 12.0, lineCount: 5, createdAt: "Today 08:40" },
    { id: "IND-1040", branch: "Noida", raisedBy: "Store Incharge", status: "PO_RAISED", spikePercent: null, lineCount: 6, createdAt: "Yesterday 17:20" },
    { id: "IND-1039", branch: "Rohini", raisedBy: "Rohini Team", status: "DRAFT", spikePercent: null, lineCount: 3, createdAt: "Yesterday 09:05" },
  ];
}

export interface PurchaseOrderRow {
  poNumber: string;
  branch: string;
  vendor: string;
  isGeneralPurchase: boolean; // true = not store/raw-material related, no Indent behind it
  amountInr: number;
  bought: boolean; // Step 1
  billUploaded: boolean; // Step 2 — optional
  materialReceived: boolean; // Step 3
  createdAt: string;
  // Present only for store (non-general) purchases, so GRN Quality PASS can
  // post the received quantity into the real Inventory table. General
  // purchases (office supplies etc.) have no raw material to post.
  branchId?: string;
  rawMaterialId?: string;
  qty?: number;
  unit?: string;
}

export function getPurchaseOrders(): PurchaseOrderRow[] {
  return [
    { poNumber: "PO-5521", branch: "Gurugram", vendor: "Fresh Farms Supply Co.", isGeneralPurchase: false, amountInr: 42800, bought: true, billUploaded: false, materialReceived: false, createdAt: "Today 10:30" },
    { poNumber: "PO-5520", branch: "Connaught Place", vendor: "Metro Dairy Distributors", isGeneralPurchase: false, amountInr: 18650, bought: true, billUploaded: true, materialReceived: false, createdAt: "Today 09:10" },
    { poNumber: "PO-5519", branch: "Noida", vendor: "Spice World Traders", isGeneralPurchase: false, amountInr: 9400, bought: true, billUploaded: true, materialReceived: true, createdAt: "Yesterday 15:40" },
    { poNumber: "PO-5518", branch: "Dwarka", vendor: "Fresh Farms Supply Co.", isGeneralPurchase: false, amountInr: 27300, bought: true, billUploaded: true, materialReceived: false, createdAt: "Yesterday 11:20" },
    { poNumber: "PO-5517", branch: "Rohini", vendor: "ABC Hardware Store", isGeneralPurchase: true, amountInr: 4200, bought: true, billUploaded: true, materialReceived: true, createdAt: "2 days ago" },
  ];
}

export interface GrnRow {
  id: string;
  poNumber: string;
  branch: string;
  status: "PENDING" | "RECEIVED" | "QUALITY_HOLD" | "APPROVED";
  qualityResult: "PENDING" | "PASS" | "FAIL" | "PARTIAL";
  qtyFailed: number;
  uom: string;
  receivedBy: string;
  createdAt: string;
  // Carried from the PO for store purchases only — lets Quality Check PASS/
  // PARTIAL post the passed quantity into the real Inventory table.
  branchId?: string;
  rawMaterialId?: string;
  qtyReceived?: number;
  inventoryPosted?: boolean;
}

export function getGrns(): GrnRow[] {
  return [
    { id: "GRN-3310", poNumber: "PO-5519", branch: "Noida", status: "APPROVED", qualityResult: "PASS", qtyFailed: 0, uom: "kg", receivedBy: "Store Incharge", createdAt: "Yesterday 16:10" },
    { id: "GRN-3309", poNumber: "PO-5518", branch: "Dwarka", status: "QUALITY_HOLD", qualityResult: "PENDING", qtyFailed: 0, uom: "kg", receivedBy: "Dwarka Team", createdAt: "Yesterday 12:05" },
    { id: "GRN-3308", poNumber: "PO-5517", branch: "Rohini", status: "RECEIVED", qualityResult: "PARTIAL", qtyFailed: 2.5, uom: "kg", receivedBy: "Rohini Team", createdAt: "2 days ago" },
  ];
}

export interface PosOrderRow {
  orderNumber: string;
  branch: string;
  channel: "DINE_IN" | "TAKEAWAY" | "SWIGGY" | "ZOMATO";
  tableNo: string;
  totalInr: number;
  tenderType: string;
  status: "COMPLETED" | "VOIDED";
  cashier: string;
  time: string;
}

export function getPosOrders(): PosOrderRow[] {
  return [
    { orderNumber: "CP-9981", branch: "Connaught Place", channel: "DINE_IN", tableNo: "T-12", totalInr: 1840, tenderType: "UPI", status: "COMPLETED", cashier: "Amit Kumar", time: "13:42" },
    { orderNumber: "CP-9980", branch: "Connaught Place", channel: "TAKEAWAY", tableNo: "-", totalInr: 620, tenderType: "CASH", status: "COMPLETED", cashier: "Amit Kumar", time: "13:30" },
    { orderNumber: "GGN-4412", branch: "Gurugram", channel: "SWIGGY", tableNo: "-", totalInr: 940, tenderType: "SWIGGY", status: "COMPLETED", cashier: "System", time: "13:25" },
    { orderNumber: "NOI-2210", branch: "Noida", channel: "DINE_IN", tableNo: "T-05", totalInr: 2250, tenderType: "CARD", status: "VOIDED", cashier: "Vikas Yadav", time: "12:58" },
    { orderNumber: "DWK-1187", branch: "Dwarka", channel: "ZOMATO", tableNo: "-", totalInr: 1120, tenderType: "ZOMATO", status: "COMPLETED", cashier: "System", time: "12:40" },
  ];
}

export interface PettyCashRow {
  id: string;
  branch: string;
  loggedBy: string;
  entryType: "IN" | "OUT";
  description: string;
  amountInr: number;
  dailyCapInr: number;
  balanceAfterInr: number;
  entryDate: string;
}

export function getPettyCash(): PettyCashRow[] {
  return [
    { id: "pc1", branch: "Connaught Place", loggedBy: "HQ", entryType: "IN", description: "Weekly top-up", amountInr: 2000, dailyCapInr: 2000, balanceAfterInr: 2000, entryDate: "Mon 08:00" },
    { id: "pc2", branch: "Connaught Place", loggedBy: "Priya Nair", entryType: "OUT", description: "Milk (emergency top-up)", amountInr: 420, dailyCapInr: 2000, balanceAfterInr: 1580, entryDate: "Today 11:10" },
    { id: "pc3", branch: "Gurugram", loggedBy: "HQ", entryType: "IN", description: "Weekly top-up", amountInr: 2000, dailyCapInr: 2000, balanceAfterInr: 2000, entryDate: "Mon 08:00" },
    { id: "pc4", branch: "Gurugram", loggedBy: "Rahul Sharma", entryType: "OUT", description: "Cleaning supplies", amountInr: 310, dailyCapInr: 2000, balanceAfterInr: 1690, entryDate: "Today 10:05" },
    { id: "pc5", branch: "Noida", loggedBy: "Store Incharge", entryType: "OUT", description: "Plumber visit", amountInr: 850, dailyCapInr: 2000, balanceAfterInr: 1150, entryDate: "Yesterday 16:30" },
  ];
}

export interface BranchFinancialRow {
  branch: string;
  revenue: number;
  cogs: number;
  laborCost: number;
  primeCost: number;
  primeCostPercent: number;
}

export function getBranchFinancials(): BranchFinancialRow[] {
  return [
    { branch: "Connaught Place", revenue: 3120000, cogs: 980000, laborCost: 835000, primeCost: 1815000, primeCostPercent: 58.2 },
    { branch: "Gurugram", revenue: 3480000, cogs: 1012000, laborCost: 933000, primeCost: 1945000, primeCostPercent: 55.9 },
    { branch: "Noida", revenue: 2190000, cogs: 770000, laborCost: 618000, primeCost: 1388000, primeCostPercent: 63.4 },
  ];
}

export interface BalanceSheetRow {
  section: "ASSET" | "LIABILITY" | "EQUITY";
  accountName: string;
  amountInr: number;
}

export function getBalanceSheet(): BalanceSheetRow[] {
  return [
    { section: "ASSET", accountName: "Cash & Petty Cash", amountInr: 486000 },
    { section: "ASSET", accountName: "Inventory (all branches)", amountInr: 1353400 },
    { section: "ASSET", accountName: "Accounts Receivable (aggregator payouts pending)", amountInr: 214000 },
    { section: "ASSET", accountName: "Equipment & Fixtures (net)", amountInr: 3200000 },
    { section: "LIABILITY", accountName: "Accounts Payable (vendor bills pending)", amountInr: 612000 },
    { section: "LIABILITY", accountName: "GST Payable", amountInr: 148000 },
    { section: "EQUITY", accountName: "Owner's Capital", amountInr: 3000000 },
    { section: "EQUITY", accountName: "Retained Earnings", amountInr: 1493400 },
  ];
}

export interface ProfitLossRow {
  label: string;
  amountInr: number;
  isTotal?: boolean;
}

export function getProfitLoss(): ProfitLossRow[] {
  const revenue = 8790000;
  const cogs = 2762000;
  const grossProfit = revenue - cogs;
  const labor = 2386000;
  const rent = 540000;
  const utilities = 186000;
  const marketing = 212000;
  const otherOpex = 164000;
  const totalOpex = labor + rent + utilities + marketing + otherOpex;
  const netProfit = grossProfit - totalOpex;
  return [
    { label: "Revenue (all branches)", amountInr: revenue },
    { label: "Cost of Goods Sold (food cost)", amountInr: -cogs },
    { label: "Gross Profit", amountInr: grossProfit, isTotal: true },
    { label: "Labor Cost", amountInr: -labor },
    { label: "Rent", amountInr: -rent },
    { label: "Utilities", amountInr: -utilities },
    { label: "Marketing", amountInr: -marketing },
    { label: "Other Operating Expenses", amountInr: -otherOpex },
    { label: "Total Operating Expenses", amountInr: -totalOpex, isTotal: true },
    { label: "Net Profit", amountInr: netProfit, isTotal: true },
  ];
}

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  address: string;
  geofenceRadiusM: number;
  isTemplate: boolean;
  userCount: number;
}

export function getBranches(): BranchRow[] {
  return [
    { id: "b1", code: "B1", name: "Connaught Place", address: "CP Inner Circle, New Delhi", geofenceRadiusM: 50, isTemplate: true, userCount: 14 },
    { id: "b2", code: "B2", name: "Saket", address: "Select Citywalk Rd, Saket", geofenceRadiusM: 50, isTemplate: false, userCount: 11 },
    { id: "b3", code: "B3", name: "Gurugram", address: "MG Road, Gurugram", geofenceRadiusM: 50, isTemplate: false, userCount: 16 },
    { id: "b4", code: "B4", name: "Noida", address: "Sector 18, Noida", geofenceRadiusM: 60, isTemplate: false, userCount: 10 },
    { id: "b5", code: "B5", name: "Dwarka", address: "Sector 12, Dwarka", geofenceRadiusM: 50, isTemplate: false, userCount: 9 },
    { id: "b6", code: "B6", name: "Rohini", address: "Sector 7, Rohini", geofenceRadiusM: 50, isTemplate: false, userCount: 12 },
  ];
}
