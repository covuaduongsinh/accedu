import { roundAmount } from "../money/round";
import { VAT_CODES, vatAmount, type VatCode } from "./vat";

/** Loại chứng từ hóa đơn: bán hàng, dịch vụ, mua hàng, mua dịch vụ */
export const INVOICE_TYPES = ["HDB", "HDV", "HDM", "HMV"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export function isInvoiceType(code: string): code is InvoiceType {
  return (INVOICE_TYPES as readonly string[]).includes(code);
}

export interface InvoiceDefaults {
  side: "sale" | "purchase";
  /** TK công nợ phần đầu */
  headerAccount: string;
  /** TK doanh thu (bán) hoặc TK hàng hóa/chi phí (mua) của dòng */
  lineAccount: string;
  vatAccount: string;
  vatCode: VatCode;
}

/**
 * Tài khoản & mã thuế mặc định theo chế độ kế toán.
 * Hóa đơn dịch vụ mặc định không chịu thuế (dịch vụ giáo dục, đào tạo — Luật thuế GTGT 48/2024/QH15).
 */
export function invoiceDefaults(regime: "TT99" | "TT133", type: InvoiceType): InvoiceDefaults {
  switch (type) {
    case "HDB":
      return { side: "sale", headerAccount: "131", lineAccount: "5111", vatAccount: "33311", vatCode: "10" };
    case "HDV":
      return { side: "sale", headerAccount: "131", lineAccount: "5113", vatAccount: "33311", vatCode: "KCT" };
    case "HDM":
      return { side: "purchase", headerAccount: "331", lineAccount: regime === "TT99" ? "1561" : "156", vatAccount: "1331", vatCode: "10" };
    case "HMV":
      return { side: "purchase", headerAccount: "331", lineAccount: regime === "TT99" ? "6427" : "6422", vatAccount: "1331", vatCode: "10" };
  }
}

export interface InvoiceLineInput {
  quantity?: number | null;
  unitPrice?: number | null;
  discount?: number | null;
  /** Thành tiền nhập tay khi không có số lượng × đơn giá */
  amount?: number | null;
  vatCode?: VatCode | null;
  /** Tiền thuế nhập tay (khớp hóa đơn nhà cung cấp); bỏ trống thì tự tính */
  vatAmount?: number | null;
}

export interface InvoiceLineResult {
  /** Thành tiền chưa thuế, đã trừ chiết khấu */
  amount: number;
  vatRate: number;
  vatAmount: number;
}

/** Tính một dòng hóa đơn: SL × đơn giá − chiết khấu → thành tiền → thuế (làm tròn đồng) */
export function computeInvoiceLine(l: InvoiceLineInput, decimals = 0): InvoiceLineResult {
  const hasQty = l.quantity != null && l.unitPrice != null;
  const gross = hasQty ? roundAmount((l.quantity ?? 0) * (l.unitPrice ?? 0), decimals) : roundAmount(l.amount ?? 0, decimals);
  const amount = Math.max(0, roundAmount(gross - (l.discount ?? 0), decimals));
  const code = l.vatCode ?? null;
  const vatRate = code ? VAT_CODES[code].rate : 0;
  const vat = vatRate === 0 ? 0 : l.vatAmount != null ? roundAmount(l.vatAmount, decimals) : vatAmount(amount, code as VatCode, decimals);
  return { amount, vatRate, vatAmount: vat };
}

export function invoiceTotals(lines: readonly Pick<InvoiceLineResult, "amount" | "vatAmount">[], decimals = 0) {
  const net = roundAmount(lines.reduce((s, l) => s + l.amount, 0), decimals);
  const vat = roundAmount(lines.reduce((s, l) => s + l.vatAmount, 0), decimals);
  return { net, vat, total: roundAmount(net + vat, decimals) };
}

/** Hạn thanh toán = ngày hóa đơn + số ngày nợ (ISO) */
export function dueDateFrom(invoiceDate: string, termDays: number | null | undefined): string | null {
  if (termDays == null || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return null;
  const d = new Date(`${invoiceDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + termDays);
  return d.toISOString().slice(0, 10);
}
