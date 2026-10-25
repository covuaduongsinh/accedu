import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  COA_TT133,
  COA_TT99,
  IMPORT_SPECS,
  autoMap,
  buildLedgerEntries,
  buildPreview,
  computeInvoiceLine,
  detectHeader,
  dueDateFrom,
  invoiceDefaults,
  invoiceTotals,
  isInvoiceType,
  parseVatCode,
  type Table,
} from "../src";

describe("tính dòng hóa đơn", () => {
  it("SL × đơn giá − chiết khấu, thuế làm tròn đồng", () => {
    expect(computeInvoiceLine({ quantity: 3, unitPrice: 33_333, discount: 999, vatCode: "10" })).toEqual({ amount: 99_000, vatRate: 10, vatAmount: 9_900 });
    expect(computeInvoiceLine({ amount: 3_000_000, vatCode: "KCT" })).toEqual({ amount: 3_000_000, vatRate: 0, vatAmount: 0 });
    expect(computeInvoiceLine({ amount: 333_333, vatCode: "8" }).vatAmount).toBe(26_667);
    // Tiền thuế nhập tay theo hóa đơn nhà cung cấp được giữ nguyên
    expect(computeInvoiceLine({ amount: 333_333, vatCode: "10", vatAmount: 33_334 }).vatAmount).toBe(33_334);
    // KCT bỏ qua tiền thuế nhập tay
    expect(computeInvoiceLine({ amount: 100, vatCode: "KCT", vatAmount: 10 }).vatAmount).toBe(0);
  });
  it("tổng hóa đơn", () => {
    expect(invoiceTotals([{ amount: 200_000, vatAmount: 20_000 }, { amount: 3_000_000, vatAmount: 0 }])).toEqual({ net: 3_200_000, vat: 20_000, total: 3_220_000 });
  });
  it("tài khoản mặc định theo chế độ", () => {
    expect(invoiceDefaults("TT99", "HDV")).toMatchObject({ headerAccount: "131", lineAccount: "5113", vatCode: "KCT" });
    expect(invoiceDefaults("TT99", "HDM").lineAccount).toBe("1561");
    expect(invoiceDefaults("TT133", "HDM").lineAccount).toBe("156");
    expect(invoiceDefaults("TT133", "HMV").lineAccount).toBe("6422");
    // Các tài khoản mặc định đều là tài khoản chi tiết trong hệ thống tài khoản
    for (const [regime, coa] of [
      ["TT99", COA_TT99],
      ["TT133", COA_TT133],
    ] as const) {
      const leaf = new Set(coa.filter((a) => !coa.some((c) => c.parent === a.code)).map((a) => a.code));
      for (const t of ["HDB", "HDV", "HDM", "HMV"] as const) {
        const d = invoiceDefaults(regime, t);
        for (const acc of [d.headerAccount, d.lineAccount, d.vatAccount]) expect(leaf.has(acc), `${regime} ${t} ${acc}`).toBe(true);
      }
    }
    expect(isInvoiceType("HDB")).toBe(true);
    expect(isInvoiceType("PT")).toBe(false);
  });
  it("hạn thanh toán", () => {
    expect(dueDateFrom("2026-03-05", 30)).toBe("2026-04-04");
    expect(dueDateFrom("2026-03-05", null)).toBeNull();
  });
});

describe("bút toán thuế (khớp post_voucher)", () => {
  it("bán: Nợ 131 / Có 5111 + Nợ 131 / Có 33311", () => {
    const r = buildLedgerEntries([{ lineNo: 1, debitAccount: "131", creditAccount: "5111", amount: 200_000, vatAmount: 20_000 }]);
    expect(r.ok && r.entries.map((e) => [e.account, e.contraAccount, e.debit, e.credit])).toEqual([
      ["131", "5111", 200_000, 0],
      ["131", "33311", 20_000, 0],
      ["5111", "131", 0, 200_000],
      ["33311", "131", 0, 20_000],
    ]);
    expect(r.ok && r.totalDebit).toBe(220_000);
  });
  it("mua: Nợ 1561 / Có 331 + Nợ 1331 / Có 331", () => {
    const r = buildLedgerEntries([{ lineNo: 1, debitAccount: "1561", creditAccount: "331", amount: 1_000_000, vatAmount: 100_000 }], 0, "credit");
    expect(r.ok && r.entries.filter((e) => e.debit > 0).map((e) => e.account)).toEqual(["1561", "1331"]);
  });
  test.prop([fc.array(fc.record({ amount: fc.integer({ min: 0, max: 1e10 }), vat: fc.integer({ min: 0, max: 1e9 }) }), { minLength: 1, maxLength: 8 }), fc.constantFrom("debit" as const, "credit" as const)])(
    "luôn cân Nợ = Có, tổng = tiền hàng + thuế",
    (ls, side) => {
      const r = buildLedgerEntries(
        ls.map((l, i) => ({ lineNo: i + 1, debitAccount: side === "debit" ? "131" : "6427", creditAccount: side === "debit" ? "5113" : "331", amount: l.amount, vatAmount: l.vat })),
        0,
        side,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.totalDebit).toBe(r.totalCredit);
        expect(r.totalDebit).toBe(ls.reduce((s, l) => s + l.amount + l.vat, 0));
      }
    },
  );
});

describe("nhập danh mục hàng hóa từ Excel", () => {
  const ctx = {
    accounts: COA_TT99.map((a) => ({ code: a.code, is_postable: !COA_TT99.some((c) => c.parent === a.code), track_partner: a.trackPartner })),
    partners: [],
    items: [{ code: "SACH01" }],
  };
  it("mã thuế, loại, giá, tài khoản", () => {
    const table: Table = [
      ["Mã hàng", "Tên hàng", "Loại", "Đvt", "Thuế suất", "Giá bán", "Tk doanh thu"],
      ["sach01", "Sách nhập môn", "Sách", "Cuốn", 0.05, "120.000", "5111"],
      ["HP-TOT", "Học phí lớp Tốt", "Dịch vụ", "Tháng", "Không chịu thuế", 800000, "5113"],
      ["X1", "Sai loại", "Đồ chơi", "", "10%", "", ""],
      ["X2", "Sai TK", "Hàng hóa", "", "7%", "", "999"],
    ];
    const header = detectHeader(table, IMPORT_SPECS.items.fields);
    const result = buildPreview("items", table, header, autoMap(header.headers, IMPORT_SPECS.items.fields), ctx);
    expect(result.rows.map((r) => r.status)).toEqual(["update", "new", "error", "error"]);
    expect(result.rows[0]?.payload).toMatchObject({ code: "sach01", kind: "book", vat_code: "5", sale_price: 120_000 });
    expect(result.rows[1]?.payload).toMatchObject({ kind: "service", vat_code: "KCT", revenue_account: "5113" });
    expect(result.rows[3]?.message).toMatch(/Mã thuế 7%/);
  });
  it("đọc mã thuế", () => {
    expect(parseVatCode("10%")).toBe("10");
    expect(parseVatCode("0.08")).toBe("8");
    expect(parseVatCode("KCT")).toBe("KCT");
    expect(parseVatCode("12")).toBeNull();
  });
});
