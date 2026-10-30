import { describe, expect, it } from "vitest";
import { bankDate, bankFingerprint, parseBankStatement, parseDelimited, type Table } from "../src";

describe("đọc sao kê ngân hàng", () => {
  it("mẫu kiểu Vietcombank: tiêu đề nằm dưới phần thông tin tài khoản, cột ghi nợ / ghi có, bỏ dòng tổng cộng", () => {
    const rows: Table = [
      ["SAO KÊ TÀI KHOẢN", null, null, null, null, null],
      ["Số tài khoản: 0123456789", null, null, null, null, null],
      ["Từ ngày 01/10/2026 đến ngày 31/10/2026", null, null, null, null, null],
      [],
      ["STT", "Ngày giao dịch", "Số tham chiếu", "Số tiền ghi nợ", "Số tiền ghi có", "Số dư", "Nội dung chi tiết"],
      [null, null, null, null, null, "10.000.000", "Số dư đầu kỳ"],
      ["1", "05/10/2026 09:12:33", "FT26278001", "", "600.000", "10.600.000", "MBVCB.1234.HP HV102 DV0003.CT tu 999 NGUYEN VAN A"],
      ["2", "05/10/2026", "FT26278002", "11.000", "", "10.589.000", "Phi quan ly tai khoan T09/2026"],
      ["3", "31/10/2026", "LAI2610", "", "5.000", "10.594.000", "Tra lai tien gui"],
      ["Tổng cộng", null, null, "11.000", "605.000", null, null],
    ];
    const r = parseBankStatement(rows);
    expect(r.ok).toBe(true);
    expect(r.headerRow).toBe(5);
    expect(r.columns).toMatchObject({ date: "Ngày giao dịch", ref: "Số tham chiếu", credit: "Số tiền ghi có", debit: "Số tiền ghi nợ", balance: "Số dư", description: "Nội dung chi tiết" });
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toMatchObject({ row: 7, date: "2026-10-05", ref: "FT26278001", amountIn: 600000, amountOut: 0, balance: 10600000 });
    expect(r.lines[1]).toMatchObject({ amountIn: 0, amountOut: 11000 });
    expect(r).toMatchObject({ from: "2026-10-05", to: "2026-10-31", totalIn: 605000, totalOut: 11000, closingBalance: 10594000, skipped: 2 });
  });

  it("mẫu tiếng Anh (Debit / Credit), xếp ngày giảm dần, ô ngày Excel", () => {
    const rows: Table = [
      ["Transaction Date", "Reference No", "Description", "Debit", "Credit", "Balance"],
      [new Date(Date.UTC(2026, 9, 20)), "TT002", "PAY SUPPLIER INV 77", 1_500_000, null, 8_500_000],
      [46300, "TT001", "HP HV101", null, 1_200_000, 10_000_000],
    ];
    const r = parseBankStatement(rows);
    expect(r.ok).toBe(true);
    expect(r.lines.map((l) => [l.date, l.amountIn, l.amountOut])).toEqual([
      ["2026-10-20", 0, 1_500_000],
      [bankDate(46300), 1_200_000, 0],
    ]);
    // Ngày giảm dần → số dư cuối là dòng đầu tiên
    expect(r.closingBalance).toBe(8_500_000);
  });

  it("một cột số tiền có dấu, hoặc kèm cột loại Nợ / Có (CSV dấu chấm phẩy)", () => {
    const signed = parseBankStatement(parseDelimited("Ngày;Nội dung;Số tiền\n01/11/2026;HP HV103;500.000\n02/11/2026;Phi SMS;-11.000\n"));
    expect(signed.lines.map((l) => [l.amountIn, l.amountOut])).toEqual([
      [500000, 0],
      [0, 11000],
    ]);
    const typed = parseBankStatement(parseDelimited("Ngày GD,Diễn giải,Loại giao dịch,Số tiền\n2026-11-03,Lai,C,\"5,000\"\n2026-11-04,Rut tien,D,\"2,000,000\"\n"));
    expect(typed.columns.direction).toBe("Loại giao dịch");
    expect(typed.lines.map((l) => [l.date, l.amountIn, l.amountOut])).toEqual([
      ["2026-11-03", 5000, 0],
      ["2026-11-04", 0, 2_000_000],
    ]);
  });

  it("CSV có dòng thông tin tài khoản phía trên tiêu đề, nội dung có dấu phẩy: vẫn nhận đúng dấu chấm phẩy", () => {
    const csv = [
      "SAO KÊ TÀI KHOẢN",
      "Số tài khoản: 0123456789",
      "Ngày giao dịch;Số tham chiếu;Nội dung;Ghi nợ;Ghi có;Số dư",
      "05/10/2026 09:15:00;FT001;MBVCB.1.HP HV102 DV0003, CT tu PHU HUYNH;;600.000;10.600.000",
      "05/10/2026;FEE01;PHI QUAN LY TAI KHOAN;11.000;;10.589.000",
    ].join("\r\n");
    const r = parseBankStatement(parseDelimited(csv));
    expect(r.ok).toBe(true);
    expect(r.headerRow).toBe(3);
    expect(r.lines.map((l) => [l.ref, l.amountIn, l.amountOut, l.description])).toEqual([
      ["FT001", 600000, 0, "MBVCB.1.HP HV102 DV0003, CT tu PHU HUYNH"],
      ["FEE01", 0, 11000, "PHI QUAN LY TAI KHOAN"],
    ]);
  });

  it("báo lỗi theo dòng: ngày sai, số tiền sai; thiếu cột bắt buộc", () => {
    const r = parseBankStatement([
      ["Ngày giao dịch", "Nội dung", "Ghi nợ", "Ghi có"],
      ["32/10/2026", "A", "", "100"],
      ["05/10/2026", "B", "abc", ""],
      ["06/10/2026", "C", "", "200"],
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      { row: 2, message: "Ngày giao dịch không hợp lệ: 32/10/2026" },
      { row: 3, message: "Số tiền không hợp lệ" },
    ]);
    expect(r.lines).toHaveLength(1);

    const missing = parseBankStatement([["Ngày", "Ghi chú khác"], ["01/10/2026", "x"]]);
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]!.message).toBe("Không nhận ra cột: Nội dung, Tiền vào / Tiền ra (hoặc Số tiền)");
  });

  it("khóa chống trùng ổn định: không phụ thuộc dấu, khoảng trắng, chữ hoa thường", () => {
    const a = bankFingerprint({ date: "2026-10-05", ref: "FT1", amountIn: 600000, amountOut: 0, description: "Học phí  HV102" });
    const b = bankFingerprint({ date: "2026-10-05", ref: " FT1 ", amountIn: 600000, amountOut: 0, description: "hoc phi hv102" });
    expect(a).toBe(b);
    expect(a).toBe("2026-10-05|FT1|600000.00|0.00|HOC PHI HV102");
    expect(bankFingerprint({ date: "2026-10-05", ref: "FT1", amountIn: 600001, amountOut: 0, description: "Học phí HV102" })).not.toBe(a);
  });

  it("đọc ngày: dd/mm/yyyy kèm giờ, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-ddThh:mm", () => {
    expect(bankDate("05/10/2026 09:12:33")).toBe("2026-10-05");
    expect(bankDate("5-10-2026")).toBe("2026-10-05");
    expect(bankDate("05.10.2026")).toBe("2026-10-05");
    expect(bankDate("2026-10-05T10:00:00")).toBe("2026-10-05");
    expect(bankDate("2026/10/05")).toBe("2026-10-05");
    expect(bankDate("")).toBe("");
    expect(bankDate("31/02/2026")).toBeNull();
  });
});
