import { roundAmount } from "../money/round";

/** Phía công nợ: phải thu (hóa đơn bán HDB, HDV) / phải trả (hóa đơn mua HDM, HMV) */
export type SettlementSide = "receivable" | "payable";

/** TK công nợ mặc định của từng phía — dòng thu ghi Có 131, dòng trả ghi Nợ 331 */
export const SETTLEMENT_ACCOUNT = { receivable: "131", payable: "331" } as const;

/** Phiếu thu (PT, BC) trừ vào hóa đơn bán; phiếu chi (PC, BN) trừ vào hóa đơn mua; loại khác: null */
export function paymentSide(voucherType: string): SettlementSide | null {
  switch (voucherType) {
    case "PT":
    case "BC":
      return "receivable";
    case "PC":
    case "BN":
      return "payable";
    default:
      return null;
  }
}

export interface OpenInvoiceRef {
  id: string;
  /** Số còn nợ */
  remaining: number;
  dueDate?: string | null;
  invoiceDate?: string | null;
  postingDate?: string | null;
  number?: string | null;
}

export interface Allocation {
  invoiceId: string;
  amount: number;
}

/** Ngày tính tuổi nợ của hóa đơn: hạn thanh toán, thiếu thì ngày hóa đơn, rồi ngày hạch toán (khớp open_invoices) */
export const agingBaseDate = (i: Pick<OpenInvoiceRef, "dueDate" | "invoiceDate" | "postingDate">) =>
  i.dueDate ?? i.invoiceDate ?? i.postingDate ?? "";

/**
 * Phân bổ số tiền thu/chi vào các hóa đơn còn nợ, hóa đơn đến hạn sớm nhất trước (FIFO).
 * Phần thừa (leftover) là tiền trả trước — ghi thành dòng không gắn hóa đơn.
 */
export function allocateFifo(amount: number, invoices: readonly OpenInvoiceRef[], decimals = 0): { allocations: Allocation[]; leftover: number } {
  let rest = roundAmount(Math.max(0, amount), decimals);
  const queue = invoices
    .filter((i) => i.remaining > 0)
    .map((i, idx) => ({ i, idx }))
    .toSorted((a, b) => agingBaseDate(a.i).localeCompare(agingBaseDate(b.i)) || (a.i.postingDate ?? "").localeCompare(b.i.postingDate ?? "") || a.idx - b.idx);
  const allocations: Allocation[] = [];
  for (const { i } of queue) {
    if (rest <= 0) break;
    const take = roundAmount(Math.min(rest, i.remaining), decimals);
    if (take > 0) {
      allocations.push({ invoiceId: i.id, amount: take });
      rest = roundAmount(rest - take, decimals);
    }
  }
  return { allocations, leftover: rest };
}

export const AGING_BUCKETS = {
  not_due: "Chưa đến hạn",
  d1_30: "1–30 ngày",
  d31_60: "31–60 ngày",
  d61_90: "61–90 ngày",
  over_90: "Trên 90 ngày",
} as const;
export type AgingBucket = keyof typeof AGING_BUCKETS;

/** Số ngày từ `from` đến `to` (ISO YYYY-MM-DD) */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Khoảng tuổi nợ tại ngày asOf, tính từ hạn thanh toán (khớp rpt_aging): đúng hạn hôm nay vẫn là chưa quá hạn */
export function agingBucket(baseDate: string, asOf: string): AgingBucket {
  const days = daysBetween(baseDate, asOf);
  if (days <= 0) return "not_due";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "over_90";
}
