import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  COA_TT99,
  IMPORT_SPECS,
  applyServerErrors,
  autoMap,
  balanceColumns,
  buildPreview,
  detectHeader,
  inferAccount,
  missingRequired,
  parseDelimited,
  parseFlag,
  parseLooseAmount,
  payloadOf,
  templateRows,
  toDelimited,
  type ImportContext,
  type ImportKind,
  type Table,
} from "../src";

const ctx: ImportContext = {
  accounts: COA_TT99.map((a) => ({
    code: a.code,
    is_postable: !COA_TT99.some((c) => c.parent === a.code),
    track_partner: a.trackPartner,
  })),
  partners: [{ code: "HV0001" }, { code: "NCC001" }],
};

function preview(kind: ImportKind, table: Table, c: ImportContext = ctx) {
  const header = detectHeader(table, IMPORT_SPECS[kind].fields);
  const map = autoMap(header.headers, IMPORT_SPECS[kind].fields);
  return { header, map, result: buildPreview(kind, table, header, map, c) };
}

describe("đọc CSV / dữ liệu dán", () => {
  it("BOM, dấu ; và ngoặc kép có xuống dòng", () => {
    expect(parseDelimited('﻿Mã;Tên\r\nKH1;"Công ty ""A""; chi nhánh"\r\nKH2;"Dòng 1\nDòng 2"\r\n')).toEqual([
      ["Mã", "Tên"],
      ["KH1", 'Công ty "A"; chi nhánh'],
      ["KH2", "Dòng 1\nDòng 2"],
    ]);
  });
  it("dán từ Excel (tab) có ô chứa dấu phẩy", () => {
    expect(parseDelimited("1111\tTiền mặt, VND\t1.000\n4111\tVốn\t")).toEqual([
      ["1111", "Tiền mặt, VND", "1.000"],
      ["4111", "Vốn", ""],
    ]);
  });
  test.prop([
    fc.array(fc.array(fc.string({ unit: fc.constantFrom("a", "Đ", ",", ";", '"', " ", "1", "\n") }), { minLength: 2, maxLength: 4 }), {
      minLength: 1,
      maxLength: 5,
    }),
  ])("khứ hồi toDelimited → parseDelimited", (rows) => {
    const sameWidth = rows.map((r) => r.slice(0, 2));
    expect(parseDelimited(toDelimited(sameWidth), ",")).toEqual(sameWidth);
  });
});

describe("số tiền & cờ", () => {
  it.each([
    ["1.234.567", 1_234_567],
    ["1,234,567.5", 1_234_567.5],
    ["1.234,5", 1234.5],
    ["(1.000)", -1000],
    ["-500", -500],
    ["1 000 đ", 1000],
    ["12.5", 12.5],
    ["", null],
    ["abc", null],
  ])("%s", (text, n) => expect(parseLooseAmount(text)).toBe(n));
  it("số thật từ ô Excel giữ nguyên", () => expect(parseLooseAmount(2_500_000)).toBe(2_500_000));
  it("cờ có/không", () => {
    expect(parseFlag("Có")).toBe(true);
    expect(parseFlag(1)).toBe(true);
    expect(parseFlag("không")).toBe(false);
    expect(parseFlag("")).toBe(false);
    expect(parseFlag("hmm")).toBeNull();
  });
});

describe("dò tiêu đề & ghép cột", () => {
  it("tệp FAO có tên báo cáo phía trên", () => {
    const table: Table = [["CÔNG TY MẪU"], ["DANH MỤC TÀI KHOẢN"], [], ["Tài khoản", "Tên tài khoản", "Mã nt", "Tk mẹ", "Tk theo dõi công nợ"], ["1121", "Tiền VND"]];
    const h = detectHeader(table, IMPORT_SPECS.accounts.fields);
    expect(h.row).toBe(3);
    expect(autoMap(h.headers, IMPORT_SPECS.accounts.fields)).toMatchObject({ code: 0, name: 1, currency: 2, parentCode: 3, trackPartner: 4 });
  });
  it("danh sách khách hàng FAO", () => {
    const m = autoMap(["Mã khách", "Tên khách hàng", "Địa chỉ", "Mã số thuế"], IMPORT_SPECS.partners.fields);
    expect(m).toMatchObject({ code: 0, name: 1, address: 2, taxCode: 3, type: null, isCustomer: null });
  });
  it("Bảng cân đối phát sinh tiêu đề 2 tầng → đầu kỳ mặc định, nhận cột cuối kỳ", () => {
    const table: Table = [
      ["BẢNG CÂN ĐỐI SỐ PHÁT SINH"],
      ["Tài khoản", "Tên tài khoản", "Số dư đầu kỳ", null, "Phát sinh trong kỳ", null, "Số dư cuối kỳ", null],
      [null, null, "Nợ", "Có", "Nợ", "Có", "Nợ", "Có"],
      ["1111", "Tiền mặt", 10, 0, 5, 3, 12, 0],
    ];
    const h = detectHeader(table, IMPORT_SPECS["opening-accounts"].fields);
    expect(h).toMatchObject({ row: 1, height: 2 });
    expect(autoMap(h.headers, IMPORT_SPECS["opening-accounts"].fields)).toMatchObject({ account: 0, name: 1, debit: 2, credit: 3 });
    expect(balanceColumns(h.headers)).toEqual({ opening: { debit: 2, credit: 3 }, closing: { debit: 6, credit: 7 } });
  });
  it("thiếu cột bắt buộc", () => {
    expect(missingRequired("partners", { code: 0, name: null })).toEqual(["Tên"]);
    expect(missingRequired("opening-accounts", { account: 0, debit: null, credit: null })).toEqual(["Dư Nợ hoặc Dư Có"]);
  });
});

describe("xem trước danh mục tài khoản", () => {
  it("tài khoản con mới tự tìm TK mẹ, suy ra thuộc tính; TK có sẵn là cập nhật; bỏ dòng tổng", () => {
    const { result } = preview("accounts", [
      ["Tài khoản", "Tên tài khoản"],
      ["11211", "TGNH mẫu A"],
      ["112111", "TGNH mẫu A — tài khoản phụ"],
      ["1121", "Tiền Việt Nam"],
      ["13111", "Phải thu học phí"],
      ["Tổng cộng", ""],
      ["11211", "Lặp"],
      ["AB", "Sai"],
    ]);
    const [a, b, c, d, total, dup, bad] = result.rows;
    expect(a).toMatchObject({ status: "new", payload: { code: "11211", parent_code: "1121", kind: "asset", normal_side: "debit", track_partner: false } });
    expect(b?.payload).toMatchObject({ parent_code: "11211" });
    expect(c).toMatchObject({ status: "update", payload: { code: "1121", name: "Tiền Việt Nam" } });
    expect(c?.payload).not.toHaveProperty("parent_code");
    expect(c?.payload).not.toHaveProperty("kind");
    expect(d?.payload).toMatchObject({ parent_code: "131", track_partner: true, normal_side: "both" });
    expect(total?.status).toBe("skip");
    expect(dup).toMatchObject({ status: "error", message: "Trùng số hiệu với dòng 2" });
    expect(bad?.status).toBe("error");
    expect(result.counts).toEqual({ new: 3, update: 1, skip: 1, error: 2 });
    expect(payloadOf(result)).toHaveLength(4);
  });
  it("TK mẹ khai sai hoặc chưa có → lỗi", () => {
    const { result } = preview("accounts", [
      ["Tài khoản", "Tên tài khoản", "Tk mẹ"],
      ["11211", "A", "1122"],
      ["99999", "B", "9999"],
    ]);
    expect(result.rows.map((r) => r.status)).toEqual(["error", "error"]);
  });
  it("inferAccount", () => {
    expect(inferAccount("3388")).toEqual({ kind: "liability", normalSide: "both", trackPartner: true, trackItem: false });
    expect(inferAccount("5113")).toMatchObject({ kind: "revenue", normalSide: "credit" });
    expect(inferAccount("2141")).toMatchObject({ kind: "asset", normalSide: "credit" });
  });
});

describe("xem trước đối tượng", () => {
  it("mới/cập nhật, loại KH/NCC/HV, MST sai báo lỗi", () => {
    const { result } = preview("partners", [
      ["Mã", "Tên", "Mã số thuế", "Loại", "Email"],
      ["HV0002", "Học viên Mẫu Hai", "", "HV", ""],
      ["NCC001", "Công ty Sách Mẫu", "0100 000 000", "NCC, KH", ""],
      ["KH9", "Khách sai MST", "12345", "", ""],
      ["KH10", "Khách sai loại", "", "XYZ", ""],
      ["KH11", "Khách mặc định", "", "", "a@b"],
      [12, "Mã là số", "", "", ""],
    ]);
    const [hv, ncc, badTax, badType, badMail, numeric] = result.rows;
    expect(hv).toMatchObject({ status: "new", payload: { code: "HV0002", is_student: true, is_customer: false } });
    expect(ncc).toMatchObject({ status: "update", payload: { tax_code: "0100000000", is_supplier: true, is_customer: true, is_employee: false } });
    expect(badTax?.message).toMatch(/Mã số thuế/);
    expect(badType?.message).toMatch(/Loại không rõ/);
    expect(badMail?.message).toBe("Email không hợp lệ");
    expect(numeric).toMatchObject({ status: "new", payload: { code: "12", is_customer: true } });
  });
  it("nhập từ trang Nhà cung cấp: đối tượng mới là NCC; đối tượng cũ chỉ bật thêm cờ NCC", () => {
    const { result } = preview(
      "partners",
      [
        ["Mã khách", "Tên khách hàng"],
        ["NCC002", "NCC mới"],
        ["HV0001", "Học viên cũ"],
      ],
      { ...ctx, partnerDefault: "supplier" },
    );
    expect(result.rows[0]?.payload).toMatchObject({ is_supplier: true, is_customer: false });
    expect(result.rows[1]?.payload).toEqual({ row: 3, code: "HV0001", name: "Học viên cũ", is_supplier: true });
  });
});

describe("xem trước số dư", () => {
  it("số dư tài khoản: bỏ TK tổng hợp và TK công nợ, số âm sang bên kia, tổng cân", () => {
    const { result } = preview("opening-accounts", [
      ["Tài khoản", "Tên tài khoản", "Dư nợ", "Dư có"],
      ["111", "Tiền mặt", "50.000.000", ""],
      ["1111", "Tiền Việt Nam", "50.000.000", ""],
      ["131", "Phải thu", "3.000.000", ""],
      ["4118", "Vốn khác", "-50.000.000", ""],
      ["3331", "Thuế GTGT", "", ""],
      ["9999", "Không có", "1", ""],
      ["Tổng cộng", "", "103.000.000", ""],
    ]);
    expect(result.rows.map((r) => r.status)).toEqual(["skip", "new", "skip", "new", "skip", "error", "skip"]);
    expect(result.rows[3]?.payload).toEqual({ row: 5, account: "4118", debit: 0, credit: 50_000_000 });
    expect(result.totals).toEqual({ debit: 50_000_000, credit: 50_000_000, skippedDebit: 3_000_000, skippedCredit: 0 });
  });
  it("số dư công nợ: cần TK công nợ + đối tượng đã có, không trùng", () => {
    const { result } = preview("opening-partners", [
      ["Tài khoản", "Mã khách", "Tên khách hàng", "Dư nợ", "Dư có"],
      ["131", "hv0001", "Học viên Mẫu", 3_000_000, 0],
      ["131", "HV0001", "Lặp", 1, 0],
      ["331", "NCC001", "Sách", 0, 12_000_000],
      ["1111", "HV0001", "Không phải TK công nợ", 1, 0],
      ["131", "KHONGCO", "", 1, 0],
    ]);
    expect(result.rows.map((r) => r.status)).toEqual(["new", "error", "new", "error", "error"]);
    expect(result.rows[0]?.payload).toEqual({ row: 2, account: "131", partner_code: "hv0001", debit: 3_000_000, credit: 0 });
    expect(result.totals).toMatchObject({ debit: 3_000_000, credit: 12_000_000 });
  });
  it("lỗi máy chủ gắn đúng dòng", () => {
    const { result } = preview("opening-accounts", [
      ["Tài khoản", "Dư nợ"],
      ["1111", 1],
    ]);
    const after = applyServerErrors(result, [{ row: 2, message: "Kỳ đã khóa" }]);
    expect(after.rows[0]).toMatchObject({ status: "error", message: "Kỳ đã khóa" });
    expect(after.counts.error).toBe(1);
  });
});

describe("tệp mẫu", () => {
  it.each(Object.keys(IMPORT_SPECS) as ImportKind[])("%s: mẫu tự ghép đủ cột và không có lỗi", (kind) => {
    const rows = templateRows(kind);
    const header = detectHeader(rows, IMPORT_SPECS[kind].fields);
    expect(header.row).toBe(0);
    const map = autoMap(header.headers, IMPORT_SPECS[kind].fields);
    expect(Object.values(map).every((v) => v !== null)).toBe(true);
    const result = buildPreview(kind, rows, header, map, ctx);
    expect(result.counts.error).toBe(0);
  });
});
