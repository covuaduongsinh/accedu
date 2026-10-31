import { describe, expect, it } from "vitest";
import {
  COA_TT133,
  IMPORT_SPECS,
  addMonths,
  autoMap,
  buildPreview,
  detectHeader,
  assetCharge,
  assetDays,
  assetDefaults,
  assetMonthFraction,
  assetSchedule,
  daysInMonth,
  defaultAccumAccount,
  scheduleSummary,
  type ImportContext,
  type Table,
} from "../src";

describe("khấu hao TSCĐ / phân bổ CCDC", () => {
  it("số ngày tính trong tháng: từ ngày bắt đầu, đến trước ngày ghi giảm", () => {
    expect(assetDays("2026-10-15", "2026-10-01")).toBe(17);
    expect(assetDays("2026-01-01", "2026-10-01")).toBe(31);
    expect(assetDays("2026-10-15", "2026-12-01", "2026-12-10")).toBe(9);
    expect(assetDays("2026-12-05", "2026-12-01", "2026-12-20")).toBe(15);
    expect(assetDays("2026-11-05", "2026-10-01")).toBe(0);
    expect(daysInMonth("2028-02-01")).toBe(29);
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(assetMonthFraction("fixed", "2026-10-15", "2026-10-01")).toBeCloseTo(17 / 31, 10);
    expect(assetMonthFraction("tool", "2026-10-20", "2026-10-01")).toBe(1);
    expect(assetMonthFraction("tool", "2026-11-20", "2026-10-01")).toBe(0);
  });

  it("chia đều phần còn lại cho số tháng còn lại; tháng cuối lấy hết", () => {
    expect(assetCharge(36_000_000, 36, 0, 0, 17 / 31)).toBe(548_387);
    expect(assetCharge(36_000_000, 36, 548_387, 0.5484, 1)).toBe(1_000_000);
    expect(assetCharge(36_000_000, 36, 1_548_387, 1.5484, 9 / 31)).toBe(290_323);
    expect(assetCharge(1_000_000, 12, 950_000, 11.5, 1)).toBe(50_000);
    expect(assetCharge(1_000_000, 12, 1_000_000, 12, 1)).toBe(0);
    // Sửa số tháng sử dụng: phần còn lại chia lại cho số tháng còn lại
    expect(assetCharge(24_000_000, 30, 14_000_000, 14, 1)).toBe(625_000);
  });

  it("lịch khấu hao TSCĐ bắt đầu giữa tháng: 37 tháng, tổng đúng nguyên giá", () => {
    const rows = assetSchedule({ kind: "fixed", cost: 36_000_000, months: 36, startOn: "2026-10-15" });
    expect(rows).toHaveLength(37);
    expect(rows[0]).toMatchObject({ month: "2026-10-01", amount: 548_387, days: 17, fraction: 0.5484 });
    expect(rows[1]).toMatchObject({ month: "2026-11-01", amount: 1_000_000, days: null });
    expect(rows.at(-1)!.month).toBe("2029-10-01");
    expect(rows.at(-1)!.remaining).toBe(0);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(36_000_000);
    expect(scheduleSummary(rows)).toMatchObject({ regular: 1_000_000, count: 37 });
  });

  it("tài sản có số đầu kỳ: lập lịch từ tháng bắt đầu nhập liệu; CCDC tròn tháng", () => {
    const old = assetSchedule({
      kind: "fixed",
      cost: 24_000_000,
      months: 24,
      startOn: "2025-07-01",
      openingAccumulated: 12_000_000,
      openingMonths: 12,
      fromMonth: "2026-07-01",
    });
    expect(old.map((r) => r.amount)).toEqual(Array.from({ length: 12 }, () => 1_000_000));
    expect(old.at(-1)!.month).toBe("2027-06-01");

    const tool = assetSchedule({ kind: "tool", cost: 1_000_000, months: 3, startOn: "2026-10-20" });
    expect(tool.map((r) => [r.month, r.amount])).toEqual([
      ["2026-10-01", 333_333],
      ["2026-11-01", 333_334],
      ["2026-12-01", 333_333],
    ]);
    expect(assetSchedule({ kind: "tool", cost: 0, months: 3, startOn: "2026-10-20" })).toEqual([]);
  });

  it("TK mặc định theo chế độ kế toán", () => {
    expect(assetDefaults("TT133", "fixed")).toMatchObject({ assetAccount: "2111", accumAccount: "2141", expenseAccount: "6422" });
    expect(assetDefaults("TT99", "fixed")).toMatchObject({ assetAccount: "2112", accumAccount: "2141", expenseAccount: "6424" });
    expect(assetDefaults("TT99", "tool")).toMatchObject({ assetAccount: "242", accumAccount: null, expenseAccount: "6423" });
    expect(assetDefaults("TT133", "tool")).toMatchObject({ assetAccount: "242", expenseAccount: "6422" });
    expect(defaultAccumAccount("TT99", "2135")).toBe("2143");
    expect(defaultAccumAccount("TT133", "2113")).toBe("2143");
    expect(defaultAccumAccount("TT133", "2112")).toBe("2142");
  });
});

describe("nhập danh sách TSCĐ / CCDC từ Excel", () => {
  const ctx: ImportContext = {
    accounts: COA_TT133.map((a) => ({ code: a.code, is_postable: !COA_TT133.some((c) => c.parent === a.code), track_partner: a.trackPartner })),
    partners: [],
    assets: [{ code: "BANCO-DT" }],
  };
  const preview = (kind: "fixed-assets" | "tools", table: Table) => {
    const header = detectHeader(table, IMPORT_SPECS[kind].fields);
    const map = autoMap(header.headers, IMPORT_SPECS[kind].fields);
    return { map, result: buildPreview(kind, table, header, map, ctx) };
  };

  it("tiêu đề kiểu FAO: ghép đúng nguyên giá, hao mòn lũy kế, số kỳ đã khấu hao; dòng tổng bỏ qua", () => {
    const { map, result } = preview("fixed-assets", [
      ["DANH MỤC TÀI SẢN CỐ ĐỊNH"],
      ["Mã tài sản", "Tên tài sản", "Loại tài sản", "Bộ phận sử dụng", "Ngày tính khấu hao", "Nguyên giá", "Số kỳ khấu hao", "Hao mòn lũy kế", "Số kỳ đã khấu hao", "Giá trị còn lại", "Tk tài sản", "Tk hao mòn", "Tk chi phí"],
      ["maychieu-01", "Máy chiếu", "Máy móc", "Phòng 1", "15/10/2026", "36.000.000", "36", "", "", "36.000.000", "", "", ""],
      ["BANCO-DT", "Bàn cờ điện tử", "Thiết bị", "Phòng 2", "01/07/2025", 24_000_000, 24, 12_000_000, 12, 12_000_000, "2111", "2141", "6422"],
      ["X-03", "Sai TK", "", "", "01/07/2025", 1_000_000, 12, 0, 0, 0, "211", "", ""],
      ["X-04", "Sai số tháng", "", "", "01/07/2025", 1_000_000, 12.5, 0, 0, 0, "", "", ""],
      ["", "Tổng cộng", "", "", "", 61_000_000, "", "", "", "", "", "", ""],
    ]);
    expect(map).toMatchObject({ code: 0, name: 1, category: 2, department: 3, startOn: 4, cost: 5, months: 6, accumulated: 7, monthsUsed: 8, assetAccount: 10, accumAccount: 11, expenseAccount: 12 });
    expect(result.counts).toEqual({ new: 1, update: 1, skip: 1, error: 2 });
    expect(result.rows[0]!.payload).toEqual({ row: 3, code: "MAYCHIEU-01", name: "Máy chiếu", category: "Máy móc", department: "Phòng 1", start_on: "2026-10-15", cost: 36_000_000, months: 36 });
    expect(result.rows[1]!.payload).toMatchObject({ opening_accumulated: 12_000_000, opening_months: 12, asset_account: "2111", accum_account: "2141", expense_account: "6422" });
    expect(result.rows[2]!.message).toBe("TK 211 không có hoặc không phải TK chi tiết");
    expect(result.rows[3]!.message).toBe("Số tháng khấu hao là số nguyên từ 1 đến 600");
    expect(result.rows[4]!.status).toBe("skip");
  });

  it("CCDC: giá trị, số tháng phân bổ, đã phân bổ đầu kỳ", () => {
    const { result } = preview("tools", [
      ["Mã CCDC", "Tên CCDC", "Số lượng", "Đvt", "Ngày tính phân bổ", "Giá trị", "Số tháng phân bổ", "Đã phân bổ", "Số tháng đã phân bổ"],
      ["DONGHO-01", "Đồng hồ cờ", 10, "Chiếc", "20/10/2026", 3_000_000, 12, "", ""],
      ["DONGHO-01", "Trùng", 1, "", "20/10/2026", 1, 1, "", ""],
      ["BAN-01", "Bàn", 1, "", "20/10/2026", 0, 12, "", ""],
    ]);
    expect(result.rows.map((r) => r.message ?? r.status)).toEqual(["new", "Trùng mã DONGHO-01 với dòng 2", "Giá trị phải lớn hơn 0"]);
    expect(result.rows[0]!.payload).toMatchObject({ code: "DONGHO-01", quantity: 10, uom: "Chiếc", start_on: "2026-10-20", cost: 3_000_000, months: 12 });
  });
});
