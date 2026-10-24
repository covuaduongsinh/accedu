import { describe, expect, it } from "vitest";
import { formatDateVN, isIsoDate, parseDateVN, searchFeatures, splitGross, todayVN, vatAmount, voucherSchema } from "../src";

describe("ngày", () => {
  it("định dạng & phân tích", () => {
    expect(formatDateVN("2026-10-23")).toBe("23/10/2026");
    expect(parseDateVN("3/1/2026")).toBe("2026-01-03");
    expect(parseDateVN("30/2/2026")).toBeNull();
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(todayVN(new Date("2026-10-22T18:30:00Z"))).toBe("2026-10-23");
  });
});

describe("VAT", () => {
  it("tính thuế và tách giá gồm thuế", () => {
    expect(vatAmount(1_000_000, "10")).toBe(100_000);
    expect(vatAmount(1_000_000, "KCT")).toBe(0);
    expect(splitGross(1_080_000, "8")).toEqual({ net: 1_000_000, vat: 80_000 });
  });
});

describe("tìm chức năng bỏ dấu", () => {
  it("'phieu thu' tìm thấy Phiếu thu tiền mặt", () => {
    expect(searchFeatures("phieu thu").map((f) => f.path)).toContain("cash/receipts");
  });
});

describe("voucherSchema", () => {
  it("chấp nhận phiếu thu hợp lệ, áp mặc định VND", () => {
    const v = voucherSchema.parse({
      voucherType: "PT",
      issueDate: "2026-10-23",
      postingDate: "2026-10-23",
      lines: [{ lineNo: 1, debitAccount: "1111", creditAccount: "131", amount: 1000 }],
    });
    expect(v.currency).toBe("VND");
    expect(v.exchangeRate).toBe(1);
  });
  it("từ chối dòng thiếu tài khoản", () => {
    const r = voucherSchema.safeParse({
      voucherType: "PT",
      issueDate: "2026-10-23",
      postingDate: "2026-10-23",
      lines: [{ lineNo: 1, amount: 1000 }],
    });
    expect(r.success).toBe(false);
  });
});
