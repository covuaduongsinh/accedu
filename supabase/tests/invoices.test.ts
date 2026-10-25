import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createPartner, createTenant, createUser, pool, q } from "./db";

let owner: string;
let viewer: string;
let tenant: string;
let student: string;
let supplier: string;

const save = async (v: Record<string, unknown>, post = true) => {
  const [row] = await q<{ id: string }>(owner, "select public.save_voucher($1::jsonb, $2) as id", [
    JSON.stringify({ tenant_id: tenant, posting_date: "2026-03-10", ...v }),
    post,
  ]);
  return row!.id;
};

const gl = (voucherId: string) =>
  q<{ account: string; contra_account: string | null; debit: string; credit: string }>(
    owner,
    "select account, contra_account, debit, credit from public.gl_entries where voucher_id = $1 order by line_no, debit desc, account",
    [voucherId],
  );

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  tenant = await createTenant(owner, "TT99");
  await addMember(tenant, viewer, "viewer");
  student = await createPartner(owner, tenant, "HV001");
  supplier = await createPartner(owner, tenant, "NCC01");
  await pool.query("update public.partners set payment_term_days = 30 where id = $1", [supplier]);
});

afterAll(async () => {
  await pool.end();
});

describe("hóa đơn có thuế GTGT", () => {
  it("hóa đơn dịch vụ học phí không chịu thuế: Nợ 131 / Có 5113, không có bút toán thuế", async () => {
    const id = await save({
      voucher_type: "HDV",
      partner_id: student,
      description: "Học phí lớp Tốt tháng 3",
      lines: [{ credit_account: "5113", amount: 3_000_000, vat_code: "KCT" }],
    });
    expect(await gl(id)).toEqual([
      { account: "131", contra_account: "5113", debit: "3000000.00", credit: "0.00" },
      { account: "5113", contra_account: "131", debit: "0.00", credit: "3000000.00" },
    ]);
    const [v] = await q<{ total_net: string; total_vat: string; total_amount: string }>(
      owner,
      "select total_net, total_vat, total_amount from public.vouchers where id = $1",
      [id],
    );
    expect(v).toEqual({ total_net: "3000000.00", total_vat: "0.00", total_amount: "3000000.00" });
  });

  it("hóa đơn bán sách 10%: thuế tự tính, Nợ 131 / Có 33311", async () => {
    const id = await save({
      voucher_type: "HDB",
      partner_id: student,
      invoice_series: "C26TDS",
      invoice_number: "0000001",
      invoice_date: "2026-03-10",
      lines: [{ credit_account: "5111", amount: 200_000, quantity: 2, unit_price: 100_000, uom: "Cuốn", vat_code: "10" }],
    });
    expect(await gl(id)).toEqual([
      { account: "131", contra_account: "5111", debit: "200000.00", credit: "0.00" },
      { account: "131", contra_account: "33311", debit: "20000.00", credit: "0.00" },
      { account: "33311", contra_account: "131", debit: "0.00", credit: "20000.00" },
      { account: "5111", contra_account: "131", debit: "0.00", credit: "200000.00" },
    ]);
    const [v] = await q<{ total_amount: string; total_vat: string }>(owner, "select total_amount, total_vat from public.vouchers where id = $1", [id]);
    expect(v).toEqual({ total_amount: "220000.00", total_vat: "20000.00" });
  });

  it("hóa đơn mua hàng: Nợ 1561 + Nợ 1331 / Có 331; hạn thanh toán theo điều khoản NCC; không nhập trùng", async () => {
    const invoice = {
      voucher_type: "HDM",
      partner_id: supplier,
      invoice_series: "1C26TAA",
      invoice_number: "123",
      invoice_date: "2026-03-05",
      lines: [{ debit_account: "1561", amount: 1_000_000, vat_code: "10", vat_amount: 100_000 }],
    };
    const id = await save(invoice);
    expect(await gl(id)).toEqual([
      { account: "1561", contra_account: "331", debit: "1000000.00", credit: "0.00" },
      { account: "1331", contra_account: "331", debit: "100000.00", credit: "0.00" },
      { account: "331", contra_account: "1561", debit: "0.00", credit: "1000000.00" },
      { account: "331", contra_account: "1331", debit: "0.00", credit: "100000.00" },
    ]);
    const [v] = await q<{ due_date: string }>(owner, "select to_char(due_date, 'YYYY-MM-DD') as due_date from public.vouchers where id = $1", [id]);
    expect(v?.due_date).toBe("2026-04-04");
    await expect(save(invoice, false)).rejects.toThrow(/vouchers_purchase_invoice/);
  });

  it("kiểm tra thuế: mã sai, KCT có tiền thuế, lệch xa thuế suất, phiếu kế toán có thuế", async () => {
    const base = { voucher_type: "HDB", partner_id: student };
    await expect(save({ ...base, lines: [{ credit_account: "5111", amount: 100, vat_code: "7" }] }, false)).rejects.toThrow(/mã thuế 7 không hợp lệ/);
    await expect(save({ ...base, lines: [{ credit_account: "5113", amount: 100, vat_code: "KCT", vat_amount: 10 }] }, false)).rejects.toThrow(
      /không có tiền thuế/,
    );
    await expect(save({ ...base, lines: [{ credit_account: "5111", amount: 1_000_000, vat_code: "10", vat_amount: 50_000 }] }, false)).rejects.toThrow(
      /lệch xa thuế suất/,
    );
    await expect(
      save(
        {
          voucher_type: "PK",
          lines: [
            { debit_account: "6422", amount: 100, vat_code: "10", vat_amount: 10 },
            { credit_account: "1111", amount: 100 },
          ],
        },
        false,
      ),
    ).rejects.toThrow(/không có dòng thuế/);
    // Làm tròn chênh vài đồng so với hóa đơn nhà cung cấp vẫn được chấp nhận
    const ok = await save({ voucher_type: "HMV", partner_id: supplier, lines: [{ debit_account: "6427", amount: 333_333, vat_code: "10", vat_amount: 33_334 }] });
    expect((await gl(ok)).find((e) => e.account === "1331")?.debit).toBe("33334.00");
  });

  it("phiếu chi có thuế đầu vào: Nợ 6427 + Nợ 1331 / Có 1111", async () => {
    const id = await save({ voucher_type: "PC", lines: [{ debit_account: "6427", amount: 500_000, vat_code: "8" }] });
    expect(await gl(id)).toEqual([
      { account: "6427", contra_account: "1111", debit: "500000.00", credit: "0.00" },
      { account: "1331", contra_account: "1111", debit: "40000.00", credit: "0.00" },
      { account: "1111", contra_account: "6427", debit: "0.00", credit: "500000.00" },
      { account: "1111", contra_account: "1331", debit: "0.00", credit: "40000.00" },
    ]);
  });
});

describe("công nợ theo đối tượng", () => {
  it("sổ chi tiết công nợ: số dư đầu kỳ + phát sinh = số dư cuối", async () => {
    await q(owner, "select public.import_opening_balances($1, 'partner', $2::jsonb)", [
      tenant,
      JSON.stringify([{ row: 2, account: "131", partner_code: "HV001", debit: 500_000, credit: 0 }]),
    ]);
    const rows = await q<{ row_kind: string; debit: string | null; credit: string | null; balance_debit: string | null }>(
      owner,
      "select row_kind, debit, credit, balance_debit from public.rpt_partner_ledger($1, '131', $2, '2026-03-01', '2026-03-31')",
      [tenant, student],
    );
    expect(rows.find((r) => r.row_kind === "opening")?.balance_debit).toBe("500000.00");
    expect(rows.filter((r) => r.row_kind === "entry")).toHaveLength(3);
    expect(rows.find((r) => r.row_kind === "total")?.debit).toBe("3220000.00");
    expect(rows.find((r) => r.row_kind === "closing")?.balance_debit).toBe("3720000.00");
  });

  it("tổng hợp công nợ phải thu / phải trả theo đối tượng", async () => {
    const recv = await q<{ partner_code: string; opening_debit: string; debit: string; closing_debit: string }>(
      owner,
      "select partner_code, opening_debit, debit, closing_debit from public.rpt_partner_balances($1, '131', '2026-03-01', '2026-03-31')",
      [tenant],
    );
    expect(recv).toEqual([{ partner_code: "HV001", opening_debit: "500000.00", debit: "3220000.00", closing_debit: "3720000.00" }]);
    const pay = await q<{ partner_code: string; closing_credit: string }>(
      owner,
      "select partner_code, closing_credit from public.rpt_partner_balances($1, '331', '2026-03-01', '2026-03-31')",
      [tenant],
    );
    expect(pay).toEqual([{ partner_code: "NCC01", closing_credit: "1466667.00" }]);
  });
});

describe("nhập danh mục hàng hóa", () => {
  it("thêm mới, cập nhật không phân biệt hoa thường; lỗi thì không ghi gì; viewer bị chặn", async () => {
    const call = (user: string, rows: unknown[]) =>
      q<{ r: { ok: boolean; inserted?: number; updated?: number; errors?: Array<{ row: number; message: string }> } }>(
        user,
        "select public.import_items($1, $2::jsonb) as r",
        [tenant, JSON.stringify(rows)],
      ).then((x) => x[0]!.r);
    expect(
      await call(owner, [
        { row: 2, code: "SACH01", name: "Sách cờ vua nhập môn", kind: "book", uom: "Cuốn", vat_code: "5", sale_price: 120_000, revenue_account: "5111" },
        { row: 3, code: "HP-TOT", name: "Học phí lớp Tốt", kind: "service", uom: "Tháng", vat_code: "KCT", sale_price: 800_000, revenue_account: "5113" },
      ]),
    ).toEqual({ ok: true, inserted: 2, updated: 0, unchanged: 0 });
    expect(await call(owner, [{ row: 2, code: "sach01", sale_price: 125_000 }])).toEqual({ ok: true, inserted: 0, updated: 1, unchanged: 0 });
    const [item] = await q<{ name: string; sale_price: string; track_inventory: boolean }>(
      owner,
      "select name, sale_price, track_inventory from public.items where tenant_id = $1 and code = 'SACH01'",
      [tenant],
    );
    expect(item).toEqual({ name: "Sách cờ vua nhập môn", sale_price: "125000.00", track_inventory: true });

    const bad = await call(owner, [
      { row: 2, code: "X1", name: "A", vat_code: "7" },
      { row: 3, code: "X2", name: "B", revenue_account: "999" },
      { row: 4, code: "X3" },
    ]);
    expect(bad.errors?.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(await q(owner, "select 1 from public.items where tenant_id = $1 and code like 'X%'", [tenant])).toHaveLength(0);
    await expect(call(viewer, [])).rejects.toThrow(/không có quyền sửa danh mục/);
  });
});
