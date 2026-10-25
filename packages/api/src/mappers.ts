import type { VatCode, VoucherInput } from "@accedu/core";

type VatCodeValue = VatCode;
import type { VoucherLineRow, VoucherRow } from "./database.types";

/** Chuyển dữ liệu form (camelCase, schema core) sang payload RPC save_voucher (snake_case). */
export function toVoucherPayload(
  tenantId: string,
  v: VoucherInput & { id?: string; version?: number },
  source: "web" | "desktop" | "mobile" = "web",
): Record<string, unknown> {
  return {
    id: v.id,
    version: v.version,
    tenant_id: tenantId,
    voucher_type: v.voucherType,
    book_id: v.bookId ?? null,
    number: v.number ?? null,
    issue_date: v.issueDate,
    posting_date: v.postingDate,
    branch_id: v.branchId ?? null,
    partner_id: v.partnerId ?? null,
    partner_name: v.partnerName,
    address: v.address,
    contact_name: v.contactName,
    description: v.description,
    currency: v.currency ?? "VND",
    exchange_rate: v.exchangeRate ?? 1,
    header_account: v.headerAccount ?? null,
    original_documents: v.originalDocuments ?? null,
    invoice_series: v.invoiceSeries ?? null,
    invoice_number: v.invoiceNumber ?? null,
    invoice_date: v.invoiceDate ?? null,
    due_date: v.dueDate ?? null,
    partner_tax_code: v.partnerTaxCode ?? null,
    source,
    lines: v.lines.map((l) => ({
      line_no: l.lineNo,
      debit_account: l.debitAccount ?? null,
      credit_account: l.creditAccount ?? null,
      amount: l.amount,
      amount_fc: l.amountFc ?? l.amount,
      entry_group: l.entryGroup ?? 1,
      description: l.description,
      partner_id: l.partnerId ?? null,
      job_id: l.jobId ?? null,
      department_id: l.departmentId ?? null,
      expense_item_id: l.expenseItemId ?? null,
      item_id: l.itemId ?? null,
      quantity: l.quantity ?? null,
      unit_price: l.unitPrice ?? null,
      uom: l.uom ?? null,
      discount_amount: l.discountAmount ?? 0,
      vat_code: l.vatCode ?? null,
      ...(l.vatAmount !== undefined ? { vat_amount: l.vatAmount } : {}),
      vat_account: l.vatAccount ?? null,
    })),
  };
}

export interface VoucherWithLines extends VoucherRow {
  voucher_lines: VoucherLineRow[];
}

/** Chuyển bản ghi DB về dữ liệu form để sửa. */
export function fromVoucherRow(v: VoucherWithLines): VoucherInput & { id: string; version: number; status: VoucherRow["status"] } {
  return {
    id: v.id,
    version: v.version,
    status: v.status,
    voucherType: v.voucher_type,
    bookId: v.book_id,
    number: v.number,
    issueDate: v.issue_date,
    postingDate: v.posting_date,
    branchId: v.branch_id,
    partnerId: v.partner_id,
    ...(v.partner_name ? { partnerName: v.partner_name } : {}),
    ...(v.address ? { address: v.address } : {}),
    ...(v.contact_name ? { contactName: v.contact_name } : {}),
    ...(v.description ? { description: v.description } : {}),
    currency: v.currency,
    exchangeRate: Number(v.exchange_rate),
    headerAccount: v.header_account,
    ...(v.original_documents ? { originalDocuments: v.original_documents } : {}),
    ...(v.invoice_series ? { invoiceSeries: v.invoice_series } : {}),
    ...(v.invoice_number ? { invoiceNumber: v.invoice_number } : {}),
    invoiceDate: v.invoice_date,
    dueDate: v.due_date,
    ...(v.partner_tax_code ? { partnerTaxCode: v.partner_tax_code } : {}),
    lines: v.voucher_lines
      .toSorted((a, b) => a.line_no - b.line_no)
      .map((l) => ({
        lineNo: l.line_no,
        debitAccount: l.debit_account,
        creditAccount: l.credit_account,
        amount: Number(l.amount),
        amountFc: Number(l.amount_fc),
        entryGroup: l.entry_group,
        ...(l.description ? { description: l.description } : {}),
        partnerId: l.partner_id,
        jobId: l.job_id,
        departmentId: l.department_id,
        expenseItemId: l.expense_item_id,
        itemId: l.item_id,
        quantity: l.quantity === null ? null : Number(l.quantity),
        unitPrice: l.unit_price === null ? null : Number(l.unit_price),
        ...(l.uom ? { uom: l.uom } : {}),
        discountAmount: Number(l.discount_amount ?? 0),
        vatCode: (l.vat_code as VatCodeValue | null) ?? null,
        vatAmount: Number(l.vat_amount ?? 0),
        vatAccount: l.vat_account,
      })),
  };
}

/** Lỗi Postgres → thông điệp tiếng Việt cho người dùng */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/JWT expired|invalid JWT/i.test(msg)) return "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại";
  if (/row-level security|permission denied/i.test(msg)) return "Bạn không có quyền thực hiện thao tác này";
  if (/duplicate key.*vouchers_tenant_id_voucher_type_number/i.test(msg)) return "Số chứng từ đã tồn tại";
  if (/duplicate key.*vouchers_purchase_invoice/i.test(msg)) return "Hóa đơn này (cùng nhà cung cấp, ký hiệu, số) đã được nhập";
  if (/duplicate key/i.test(msg)) return "Mã đã tồn tại";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Mất kết nối mạng — dữ liệu sẽ đồng bộ khi có mạng";
  return msg;
}
