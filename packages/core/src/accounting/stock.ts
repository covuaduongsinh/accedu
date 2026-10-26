import { roundAmount } from "../money/round";

/** Phương pháp tính giá vốn hàng xuất kho (tenants.stock_cost_method) */
export const COST_METHODS = {
  moving: "Bình quân di động (tính ngay khi xuất)",
  monthly: "Bình quân cả tháng",
} as const;
export type CostMethod = keyof typeof COST_METHODS;

/** Tài khoản mặc định của chứng từ kho theo chế độ kế toán */
export function stockDefaults(regime: "TT99" | "TT133") {
  return {
    /** TK hàng hóa (dòng phiếu nhập/xuất) */
    inventoryAccount: regime === "TT99" ? "1561" : "156",
    /** Phiếu xuất kho: Nợ giá vốn */
    issueDebitAccount: "632",
    /** Phiếu nhập kho: Có phải trả người bán (hàng về chưa có hóa đơn) */
    receiptCreditAccount: "331",
  } as const;
}

export interface StockMovement {
  id: string | number;
  /** Ngày hạch toán ISO */
  date: string;
  kind: "in" | "out";
  quantity: number;
  /** Giá trị nhập (dòng nhập); dòng xuất do hàm tính */
  amount?: number;
  /** Dòng thuộc kỳ đã khóa: giữ nguyên số tiền */
  locked?: boolean;
}

export interface CostResult {
  /** Giá vốn từng dòng xuất */
  costs: Map<string | number, number>;
  closing: { quantity: number; amount: number };
}

/**
 * Tính giá vốn hàng xuất — cùng thuật toán với app.stock_recost (CSDL):
 * thứ tự ngày → trong ngày nhập trước xuất sau → thứ tự đưa vào.
 * Bình quân di động: giá trị tồn ÷ số lượng tồn ngay trước dòng xuất; xuất hết số tồn lấy trọn giá trị còn lại.
 * Bình quân tháng: (tồn đầu tháng + nhập trong tháng) ÷ số lượng tương ứng; hết hàng cuối tháng thì dồn chênh làm tròn
 * vào dòng xuất cuối của tháng.
 */
export function costMovements(
  opening: { quantity: number; amount: number },
  movements: readonly StockMovement[],
  method: CostMethod,
  lockedAmounts: ReadonlyMap<string | number, number> = new Map(),
): CostResult {
  const sorted = movements
    .map((m, i) => ({ m, i }))
    .toSorted((a, b) => a.m.date.localeCompare(b.m.date) || (a.m.kind === b.m.kind ? 0 : a.m.kind === "in" ? -1 : 1) || a.i - b.i)
    .map((x) => x.m);
  const costs = new Map<string | number, number>();
  let q = opening.quantity;
  let val = opening.amount;

  if (method === "moving") {
    for (const m of sorted) {
      if (m.kind === "in") {
        q += m.quantity;
        val = roundAmount(val + (m.amount ?? 0));
        continue;
      }
      let cost: number;
      if (m.locked && lockedAmounts.has(m.id)) cost = lockedAmounts.get(m.id)!;
      else if (q <= 0) cost = 0;
      else if (q - m.quantity <= 0) cost = Math.max(val, 0);
      else cost = roundAmount((m.quantity * val) / q);
      costs.set(m.id, cost);
      q -= m.quantity;
      val = roundAmount(val - cost);
    }
    return { costs, closing: { quantity: q, amount: val } };
  }

  const months = [...new Set(sorted.map((m) => m.date.slice(0, 7)))];
  for (const month of months) {
    const rows = sorted.filter((m) => m.date.startsWith(month));
    const inQ = rows.filter((m) => m.kind === "in").reduce((s, m) => s + m.quantity, 0);
    const inV = rows.filter((m) => m.kind === "in").reduce((s, m) => s + (m.amount ?? 0), 0);
    const avg = q + inQ > 0 ? (val + inV) / (q + inQ) : 0;
    let lastOut: StockMovement | null = null;
    for (const m of rows) {
      if (m.kind === "in") {
        q += m.quantity;
        val = roundAmount(val + (m.amount ?? 0));
        continue;
      }
      const locked = m.locked && lockedAmounts.has(m.id);
      const cost = locked ? lockedAmounts.get(m.id)! : roundAmount(m.quantity * avg);
      costs.set(m.id, cost);
      q -= m.quantity;
      val = roundAmount(val - cost);
      if (!locked) lastOut = m;
    }
    if (q === 0 && val !== 0 && lastOut && costs.get(lastOut.id)! + val >= 0) {
      costs.set(lastOut.id, roundAmount(costs.get(lastOut.id)! + val));
      val = 0;
    }
  }
  return { costs, closing: { quantity: q, amount: val } };
}

/** Ước tính giá vốn khi xuất qty từ số tồn hiện có (hiện trên form trước khi ghi sổ) */
export function estimateIssueCost(stock: { quantity: number; amount: number }, quantity: number): number {
  if (stock.quantity <= 0 || quantity <= 0) return 0;
  if (quantity >= stock.quantity) return Math.max(stock.amount, 0);
  return roundAmount((quantity * stock.amount) / stock.quantity);
}

/** tenants.costing_method → phương pháp tính giá đang dùng */
export const costMethodOf = (costing: string | null | undefined): CostMethod => (costing === "weighted_period" ? "monthly" : "moving");

/** Tỷ suất lãi gộp (%) trên doanh thu thuần, làm tròn 1 chữ số; doanh thu thuần bằng 0 thì không tính */
export function grossMargin(netRevenue: number, grossProfit: number): number | null {
  if (netRevenue === 0) return null;
  return Math.round((grossProfit * 1000) / netRevenue) / 10;
}
