import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPartner, createTenant, createUser, pool, q } from "./db";

let owner: string;
let outsider: string;
let tenant: string;
let student: string;
let student2: string;
let supplier: string;
let tuition: string; // HDV 3.000.000, hạn 20/01
let books: string; // HDB 220.000, hạn 31/03
let purchase: string; // HDM 1.100.000, hạn 03/03
let receipt: string; // PT 1.000.000 trừ vào học phí

const save = async (v: Record<string, unknown>, post = true) => {
  const [row] = await q<{ id: string }>(owner, "select public.save_voucher($1::jsonb, $2) as id", [
    JSON.stringify({ tenant_id: tenant, posting_date: "2026-03-05", ...v }),
    post,
  ]);
  return row!.id;
};

const call = (fn: string, id: string) => q(owner, `select public.${fn}($1)`, [id]);

interface OpenInvoice {
  id: string;
  number: string;
  paid: string;
  remaining: string;
  days_overdue: number;
}
const openInvoices = (side: string, partner: string | null, asOf: string | null = null, includePaid = false) =>
  q<OpenInvoice>(owner, "select id, number, paid, remaining, days_overdue from public.open_invoices($1, $2, $3, $4, $5)", [
    tenant,
    side,
    partner,
    asOf,
    includePaid,
  ]);

const receiptFor = (invoice: string, amount: number, partner = student, extra: Record<string, unknown> = {}) => ({
  voucher_type: "PT",
  partner_id: partner,
  description: "Thu tiền học phí",
  lines: [{ credit_account: "131", amount, invoice_id: invoice, ...extra }],
});

beforeAll(async () => {
  owner = await createUser();
  outsider = await createUser();
  tenant = await createTenant(owner, "TT99");
  await createTenant(outsider, "TT99");
  student = await createPartner(owner, tenant, "HV001");
  student2 = await createPartner(owner, tenant, "HV002");
  supplier = await createPartner(owner, tenant, "NCC01");
  await pool.query("update public.partners set payment_term_days = 30, is_supplier = true where id = $1", [supplier]);
  await q(owner, "select public.import_opening_balances($1, 'partner', $2::jsonb)", [
    tenant,
    JSON.stringify([{ row: 2, account: "131", partner_code: "HV001", debit: 500_000, credit: 0 }]),
  ]);
  tuition = await save({
    voucher_type: "HDV",
    partner_id: student,
    posting_date: "2026-01-10",
    invoice_date: "2026-01-10",
    due_date: "2026-01-20",
    description: "Học phí lớp Tốt quý 1",
    lines: [{ credit_account: "5113", amount: 3_000_000, vat_code: "KCT" }],
  });
  books = await save({
    voucher_type: "HDB",
    partner_id: student,
    posting_date: "2026-03-01",
    invoice_series: "C26TDS",
    invoice_number: "0000007",
    invoice_date: "2026-03-01",
    due_date: "2026-03-31",
    lines: [{ credit_account: "5111", amount: 200_000, vat_code: "10", description: "Sách cờ vua nhập môn" }],
  });
  purchase = await save({
    voucher_type: "HDM",
    partner_id: supplier,
    posting_date: "2026-02-01",
    invoice_series: "1C26TAA",
    invoice_number: "456",
    invoice_date: "2026-02-01",
    lines: [{ debit_account: "1561", amount: 1_000_000, vat_code: "10" }],
  });
});

afterAll(async () => {
  await pool.end();
});

describe("thu/chi tiền theo hóa đơn", () => {
  it("phiếu thu trừ vào hóa đơn: số còn nợ giảm, hóa đơn trả đủ không còn trong danh sách", async () => {
    expect((await openInvoices("receivable", student)).map((i) => [i.id, i.remaining])).toEqual([
      [tuition, "3000000.00"],
      [books, "220000.00"],
    ]);
    receipt = await save(receiptFor(tuition, 1_000_000));
    const [line] = await q<{ invoice_id: string }>(owner, "select invoice_id from public.voucher_lines where voucher_id = $1", [receipt]);
    expect(line?.invoice_id).toBe(tuition);
    const after = await openInvoices("receivable", student);
    expect(after.find((i) => i.id === tuition)).toMatchObject({ paid: "1000000.00", remaining: "2000000.00" });

    // Trả đủ hóa đơn sách → mặc định không còn trong danh sách, include_paid vẫn thấy
    const full = await save(receiptFor(books, 220_000));
    expect((await openInvoices("receivable", student)).map((i) => i.id)).toEqual([tuition]);
    expect((await openInvoices("receivable", student, null, true)).find((i) => i.id === books)?.remaining).toBe("0.00");
    // Tính đến ngày trước phiếu thu: hóa đơn sách vẫn còn nợ
    expect((await openInvoices("receivable", student, "2026-03-04")).find((i) => i.id === books)?.remaining).toBe("220000.00");
    await call("unpost_voucher", full);
    await call("delete_voucher", full);
  });

  it("trả vượt số còn nợ của hóa đơn thì không ghi sổ được (kể cả hai dòng cùng hóa đơn)", async () => {
    await expect(save(receiptFor(tuition, 2_500_000))).rejects.toThrow(/vượt số còn nợ của hóa đơn DV\S*: còn 2\.000\.000, phiếu này 2\.500\.000/);
    await expect(
      save({
        voucher_type: "PT",
        partner_id: student,
        lines: [
          { credit_account: "131", amount: 1_500_000, invoice_id: tuition },
          { credit_account: "131", amount: 600_000, invoice_id: tuition },
        ],
      }),
    ).rejects.toThrow(/vượt số còn nợ/);
    // Lưu nháp vẫn được — chỉ chặn khi ghi sổ
    const draft = await save(receiptFor(tuition, 2_500_000), false);
    await expect(call("post_voucher", draft)).rejects.toThrow(/vượt số còn nợ/);
    await call("delete_voucher", draft);
  });

  it("sai đối tượng, sai tài khoản, sai chiều, có thuế, hóa đơn không tồn tại", async () => {
    await expect(save(receiptFor(tuition, 100, student2), false)).rejects.toThrow(/dòng 1: đối tượng khác với hóa đơn/);
    await expect(save({ ...receiptFor(tuition, 100), lines: [{ credit_account: "3388", amount: 100, invoice_id: tuition }] }, false)).rejects.toThrow(
      /phải ghi Có TK 131/,
    );
    // Phiếu chi Nợ 131 không phải là thu tiền hóa đơn bán
    await expect(
      save({ voucher_type: "PC", partner_id: student, lines: [{ debit_account: "131", amount: 100, invoice_id: tuition }] }, false),
    ).rejects.toThrow(/phải ghi Có TK 131/);
    await expect(save(receiptFor(tuition, 100, student, { credit_account: "5111", vat_code: "10" }), false)).rejects.toThrow(/không ghi thuế GTGT/);
    await expect(save(receiptFor(receipt, 100), false)).rejects.toThrow(/không phải hóa đơn/);
    await expect(save(receiptFor("00000000-0000-0000-0000-000000000000", 100), false)).rejects.toThrow(/không tồn tại/);
  });

  it("hóa đơn chưa ghi sổ: không thu được; xóa hóa đơn đang được chọn ở phiếu nháp bị chặn", async () => {
    const draftInvoice = await save(
      { voucher_type: "HDV", partner_id: student, lines: [{ credit_account: "5113", amount: 800_000, vat_code: "KCT" }] },
      false,
    );
    await expect(save(receiptFor(draftInvoice, 800_000))).rejects.toThrow(/chưa ghi sổ — ghi sổ hóa đơn trước/);
    const draftReceipt = await save(receiptFor(draftInvoice, 800_000), false);
    await expect(call("delete_voucher", draftInvoice)).rejects.toThrow(/đang được chọn ở phiếu PT/);
    await call("delete_voucher", draftReceipt);
    await call("delete_voucher", draftInvoice);
  });

  it("bỏ ghi sổ hóa đơn đã có phiếu thanh toán bị chặn; bỏ ghi sổ phiếu thu thì hóa đơn còn nợ lại", async () => {
    const [{ number } = { number: "" }] = await q<{ number: string }>(owner, "select number from public.vouchers where id = $1", [receipt]);
    await expect(call("unpost_voucher", tuition)).rejects.toThrow(new RegExp(`đã có phiếu thanh toán ${number} — bỏ ghi sổ phiếu đó trước`));
    await call("unpost_voucher", receipt);
    expect((await openInvoices("receivable", student)).find((i) => i.id === tuition)?.remaining).toBe("3000000.00");
    await call("post_voucher", receipt);
    expect((await openInvoices("receivable", student)).find((i) => i.id === tuition)?.remaining).toBe("2000000.00");
  });

  it("phiếu chi trả nhà cung cấp theo hóa đơn mua", async () => {
    await save({ voucher_type: "PC", partner_id: supplier, lines: [{ debit_account: "331", amount: 600_000, invoice_id: purchase }] });
    expect(await openInvoices("payable", supplier)).toMatchObject([{ id: purchase, paid: "600000.00", remaining: "500000.00" }]);
    // Hóa đơn mua không nằm trong danh sách phải thu
    expect((await openInvoices("receivable", null)).some((i) => i.id === purchase)).toBe(false);
  });
});

describe("tuổi nợ", () => {
  interface AgingRow {
    partner_code: string;
    not_due: string;
    d1_30: string;
    d31_60: string;
    d61_90: string;
    over_90: string;
    unallocated: string;
    total: string;
  }
  const aging = (side: string, asOf: string) =>
    q<AgingRow>(owner, "select partner_code, not_due, d1_30, d31_60, d61_90, over_90, unallocated, total from public.rpt_aging($1, $2, $3)", [
      tenant,
      side,
      asOf,
    ]);

  it("phải thu: chia theo hạn thanh toán, phần không theo hóa đơn, tổng khớp tổng hợp công nợ", async () => {
    // Thu thêm 100.000 không gắn hóa đơn (trả trước)
    await save({ voucher_type: "PT", partner_id: student, posting_date: "2026-03-20", lines: [{ credit_account: "131", amount: 100_000 }] });
    const rows = await aging("receivable", "2026-03-31");
    // Học phí còn 2.000.000 quá hạn 70 ngày; sách 220.000 đến hạn đúng ngày 31/03 (chưa quá hạn);
    // số dư 500.000 + 3.000.000 + 220.000 − 1.000.000 − 100.000 = 2.620.000 → không theo hóa đơn 400.000
    expect(rows).toEqual([
      {
        partner_code: "HV001",
        not_due: "220000.00",
        d1_30: "0",
        d31_60: "0",
        d61_90: "2000000.00",
        over_90: "0",
        unallocated: "400000.00",
        total: "2620000.00",
      },
    ]);
    const [bal] = await q<{ closing_debit: string }>(
      owner,
      "select closing_debit from public.rpt_partner_balances($1, '131', '2026-01-01', '2026-03-31') where partner_code = 'HV001'",
      [tenant],
    );
    expect(Number(bal?.closing_debit)).toBe(Number(rows[0]?.total));

    // Sau 90 ngày quá hạn chuyển sang cột > 90; sách quá hạn 30 ngày
    const later = await aging("receivable", "2026-04-30");
    expect(later[0]).toMatchObject({ d1_30: "220000.00", over_90: "2000000.00" });
    // Tính đến 31/01: chỉ có học phí (chưa thu), quá hạn 11 ngày
    expect((await aging("receivable", "2026-01-31"))[0]).toMatchObject({ d1_30: "3000000.00", unallocated: "500000.00", total: "3500000.00" });
  });

  it("phải trả: số dư Có 331", async () => {
    expect(await aging("payable", "2026-03-31")).toEqual([
      { partner_code: "NCC01", not_due: "0", d1_30: "500000.00", d31_60: "0", d61_90: "0", over_90: "0", unallocated: "0.00", total: "500000.00" },
    ]);
  });

  it("người ngoài đơn vị không thấy hóa đơn và tuổi nợ", async () => {
    expect(await q(outsider, "select * from public.open_invoices($1, 'receivable')", [tenant])).toEqual([]);
    expect(await q(outsider, "select * from public.rpt_aging($1, 'receivable', '2026-03-31')", [tenant])).toEqual([]);
    expect(await q(outsider, "select * from public.rpt_vat_listing($1, 'out', '2026-01-01', '2026-12-31')", [tenant])).toEqual([]);
  });
});

describe("bảng kê hóa đơn bán ra / mua vào", () => {
  it("nhóm theo thuế suất, chỉ chứng từ đã ghi sổ trong kỳ", async () => {
    await save({ voucher_type: "HDB", partner_id: student, lines: [{ credit_account: "5111", amount: 50_000, vat_code: "10" }] }, false);
    const out = await q<{ vat_code: string; voucher_type: string; invoice_number: string | null; item_description: string; net_amount: string; vat_amount: string }>(
      owner,
      "select vat_code, voucher_type, invoice_number, item_description, net_amount, vat_amount from public.rpt_vat_listing($1, 'out', '2026-01-01', '2026-03-31')",
      [tenant],
    );
    expect(out).toEqual([
      { vat_code: "KCT", voucher_type: "HDV", invoice_number: null, item_description: "Học phí lớp Tốt quý 1", net_amount: "3000000.00", vat_amount: "0.00" },
      { vat_code: "10", voucher_type: "HDB", invoice_number: "0000007", item_description: "Sách cờ vua nhập môn", net_amount: "200000.00", vat_amount: "20000.00" },
    ]);
    const march = await q(owner, "select voucher_id from public.rpt_vat_listing($1, 'out', '2026-03-01', '2026-03-31')", [tenant]);
    expect(march).toHaveLength(1);
    const inbound = await q<{ partner_code: string; vat_rate: string; vat_amount: string }>(
      owner,
      "select partner_code, vat_rate, vat_amount from public.rpt_vat_listing($1, 'in', '2026-01-01', '2026-03-31')",
      [tenant],
    );
    expect(inbound).toEqual([{ partner_code: "NCC01", vat_rate: "10.00", vat_amount: "100000.00" }]);
  });
});
