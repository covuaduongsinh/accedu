import { describe, expect, it } from "vitest";
import { friendlyError, fromVoucherRow, toVoucherPayload } from "../src/mappers";

describe("toVoucherPayload / fromVoucherRow", () => {
  it("chuyển camelCase → snake_case và ngược lại", () => {
    const payload = toVoucherPayload("t1", {
      voucherType: "PT",
      issueDate: "2026-10-23",
      postingDate: "2026-10-23",
      partnerId: "p1",
      description: "Thu học phí",
      lines: [{ lineNo: 1, creditAccount: "131", amount: 1000 }],
    }, "mobile");
    expect(payload).toMatchObject({
      tenant_id: "t1",
      voucher_type: "PT",
      posting_date: "2026-10-23",
      partner_id: "p1",
      currency: "VND",
      exchange_rate: 1,
      source: "mobile",
      lines: [{ line_no: 1, debit_account: null, credit_account: "131", amount: 1000, amount_fc: 1000, entry_group: 1 }],
    });

    const back = fromVoucherRow({
      id: "v1", tenant_id: "t1", branch_id: null, voucher_type: "PT", book_id: null, number: "PT0001",
      issue_date: "2026-10-23", posting_date: "2026-10-23", partner_id: "p1", partner_name: null, address: null,
      contact_name: null, description: "Thu", currency: "VND", exchange_rate: "1.000000", header_account: "1111", original_documents: null,
      status: "draft", total_amount: "1000.00", total_amount_fc: "1000.00", source: "web", created_at: "", updated_at: "",
      posted_at: null, version: 3, invoice_series: null, invoice_number: null, invoice_date: null, due_date: null,
      partner_tax_code: null, total_net: "1000.00", total_vat: "0.00",
      voucher_lines: [{
        id: "l1", voucher_id: "v1", tenant_id: "t1", line_no: 1, debit_account: "1111", credit_account: "131",
        amount: "1000.00", amount_fc: "1000.00", entry_group: 1, description: null, partner_id: "p1", job_id: null,
        department_id: null, expense_item_id: null, item_id: null, warehouse_id: null, quantity: null, unit_price: null,
        uom: null, discount_amount: "0.00", vat_code: null, vat_rate: "0.00", vat_amount: "0.00", vat_account: null,
      }],
    });
    expect(back.version).toBe(3);
    expect(back.exchangeRate).toBe(1);
    expect(back.lines[0]).toMatchObject({ debitAccount: "1111", creditAccount: "131", amount: 1000, vatAmount: 0 });
  });

  it("hóa đơn: trường hóa đơn và thuế theo dòng", () => {
    const payload = toVoucherPayload("t1", {
      voucherType: "HDB",
      issueDate: "2026-10-25",
      postingDate: "2026-10-25",
      invoiceSeries: "C26TDS",
      invoiceNumber: "0000001",
      invoiceDate: "2026-10-25",
      lines: [{ lineNo: 1, creditAccount: "5111", amount: 200_000, quantity: 2, unitPrice: 100_000, uom: "Cuốn", vatCode: "10", vatAmount: 20_000 }],
    });
    expect(payload).toMatchObject({
      invoice_series: "C26TDS",
      invoice_number: "0000001",
      lines: [{ quantity: 2, unit_price: 100_000, uom: "Cuốn", vat_code: "10", vat_amount: 20_000 }],
    });
  });

  it("thông báo lỗi thân thiện", () => {
    expect(friendlyError(new Error("new row violates row-level security policy"))).toMatch(/không có quyền/);
    expect(friendlyError(new Error("Failed to fetch"))).toMatch(/Mất kết nối/);
    expect(friendlyError(new Error("Số liệu đã khóa đến ngày 20/10/2026"))).toBe("Số liệu đã khóa đến ngày 20/10/2026");
  });
});
