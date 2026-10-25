import { z } from "zod";
import { isIsoDate } from "../text/date";

const isoDate = z.string().refine(isIsoDate, { message: "Ngày không hợp lệ (YYYY-MM-DD)" });
const accountCode = z.string().trim().min(1, "Chưa nhập tài khoản").max(16);
const money = z.number().finite().nonnegative();

export const voucherLineSchema = z
  .object({
    lineNo: z.number().int().positive(),
    debitAccount: accountCode.nullish(),
    creditAccount: accountCode.nullish(),
    amount: money,
    amountFc: money.optional(),
    entryGroup: z.number().int().positive().optional(),
    description: z.string().max(480).optional(),
    partnerId: z.uuid().nullish(),
    jobId: z.uuid().nullish(),
    departmentId: z.uuid().nullish(),
    expenseItemId: z.uuid().nullish(),
    itemId: z.uuid().nullish(),
    quantity: z.number().finite().nullish(),
    unitPrice: z.number().finite().nonnegative().nullish(),
    uom: z.string().max(32).optional(),
    discountAmount: money.optional(),
    vatCode: z.enum(["0", "5", "8", "10", "KCT", "KKKNT"]).nullish(),
    vatAmount: money.optional(),
    vatAccount: accountCode.nullish(),
    /** Hóa đơn (HDB/HDV/HDM/HMV) mà dòng thu/chi này trừ vào */
    invoiceId: z.uuid().nullish(),
  })
  .refine((l) => !!(l.debitAccount || l.creditAccount), { message: "Dòng phải có tài khoản Nợ hoặc Có" });

export const voucherSchema = z.object({
  voucherType: z.string().min(1).max(8),
  bookId: z.uuid().nullish(),
  number: z.string().max(20).optional(),
  issueDate: isoDate,
  postingDate: isoDate,
  branchId: z.uuid().nullish(),
  partnerId: z.uuid().nullish(),
  partnerName: z.string().max(256).optional(),
  address: z.string().max(256).optional(),
  contactName: z.string().max(128).optional(),
  description: z.string().max(480).optional(),
  currency: z.string().length(3).default("VND"),
  exchangeRate: z.number().positive().default(1),
  headerAccount: accountCode.nullish(),
  originalDocuments: z.string().max(256).optional(),
  invoiceSeries: z.string().trim().max(16).optional(),
  invoiceNumber: z.string().trim().max(20).optional(),
  invoiceDate: isoDate.nullish(),
  dueDate: isoDate.nullish(),
  partnerTaxCode: z.string().trim().max(18).optional(),
  lines: z.array(voucherLineSchema).min(1, "Chứng từ chưa có dòng chi tiết"),
});

export type VoucherInput = z.input<typeof voucherSchema>;
export type Voucher = z.output<typeof voucherSchema>;
export type VoucherLine = z.output<typeof voucherLineSchema>;
