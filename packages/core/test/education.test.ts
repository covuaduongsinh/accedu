import { describe, expect, it } from "vitest";
import {
  IMPORT_SPECS,
  autoMap,
  buildPreview,
  classSchema,
  crc16,
  detectHeader,
  parseLevel,
  qrMatrix,
  tuitionTransferNote,
  vietQrPayload,
  type Table,
} from "../src";

describe("cấp học, nội dung chuyển khoản", () => {
  it("nhận cấp Tốt → Vua có dấu / không dấu / hoa thường", () => {
    expect(parseLevel("Tốt")).toBe("tot");
    expect(parseLevel("TƯỢNG")).toBe("tuong");
    expect(parseLevel("cấp Hậu")).toBe("hau");
    expect(parseLevel("")).toBeNull();
    expect(parseLevel("Sĩ")).toBeUndefined();
  });

  it("nội dung chuyển khoản không dấu, chỉ chữ số", () => {
    expect(tuitionTransferNote("hv001", "DV0001")).toBe("HP HV001 DV0001");
    expect(tuitionTransferNote("Đức-01")).toBe("HP DUC01");
  });

  it("lớp theo khóa phải có số buổi", () => {
    expect(classSchema.safeParse({ code: "MA-K1", name: "Lớp Mã", billing: "course", fee: 1 }).success).toBe(false);
    expect(classSchema.safeParse({ code: "MA-K1", name: "Lớp Mã", billing: "course", fee: 1, sessionsPerCourse: 12 }).success).toBe(true);
  });
});

describe("VietQR (EMVCo / NAPAS)", () => {
  it("CRC-16/CCITT-FALSE theo bộ thử chuẩn", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("dựng đúng các trường TLV, mã CRC khớp", () => {
    const p = vietQrPayload({ bin: "970436", accountNo: "0123456789", amount: 600_000, note: "HP HV001 DV0001" });
    const body =
      "000201" +
      "010212" +
      "3854" +
      "0010A000000727" +
      "0124" +
      "0006970436" +
      "01100123456789" +
      "0208QRIBFTTA" +
      "5303704" +
      "5406600000" +
      "5802VN" +
      "6219" +
      "0815HP HV001 DV0001" +
      "6304";
    expect(p).toBe(body + crc16(body));
    // Không có số tiền: mã tĩnh, người chuyển tự nhập
    expect(vietQrPayload({ bin: "970436", accountNo: "0123456789" })).toMatch(/^000201010211/);
    expect(() => vietQrPayload({ bin: "VCB", accountNo: "1" })).toThrow(/BIN/);
  });

  it("ma trận QR vuông, đủ để quét", () => {
    const m = qrMatrix(vietQrPayload({ bin: "970436", accountNo: "0123456789", amount: 600_000, note: "HP HV001" }));
    expect(m.length).toBeGreaterThanOrEqual(25);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    // Ô định vị góc trên trái luôn đen
    expect(m[0]![0]).toBe(true);
  });
});

describe("nhập danh sách học viên từ Excel", () => {
  it("ghép cột, chuẩn hóa ngày / cấp / mã lớp, báo lỗi theo dòng", () => {
    const table: Table = [
      ["Mã HV", "Họ tên học viên", "Ngày sinh", "Phụ huynh", "SĐT phụ huynh", "Cấp", "Mã lớp", "Ngày vào lớp"],
      ["hv001", "Nguyễn Minh An", "01/05/2016", "Nguyễn Văn Bố", "0900000001", "Tốt", "tot-k12", "01/11/2026"],
      ["HV002", "Trần Bảo Ngọc", 42_370, "", "0900000002", "", "", ""],
      ["HV003", "Lê Gia Huy", "31/02/2016", "", "", "", "", ""],
      ["HV004", "Phạm Hà", "", "", "", "Sĩ", "", ""],
      ["HV005", "Đỗ Nam", "", "", "", "", "KHONGCO", ""],
      ["HV001", "Trùng", "", "", "", "", "", ""],
    ];
    const header = detectHeader(table, IMPORT_SPECS.students.fields);
    const map = autoMap(header.headers, IMPORT_SPECS.students.fields);
    expect(map).toMatchObject({ code: 0, name: 1, birthDate: 2, guardianName: 3, guardianPhone: 4, level: 5, classCode: 6, startDate: 7 });
    const p = buildPreview("students", table, header, map, { accounts: [], partners: [{ code: "HV002" }], classes: [{ code: "TOT-K12" }] });
    expect(p.rows.map((r) => [r.status, r.message ?? ""])).toEqual([
      ["new", ""],
      ["update", ""],
      ["error", "Ngày không hợp lệ (dạng ngày/tháng/năm)"],
      ["error", "Cấp phải là Tốt, Mã, Tượng, Xe, Hậu hoặc Vua"],
      ["error", "Chưa có lớp KHONGCO — thêm ở Đào tạo › Lớp học"],
      ["error", "Trùng mã HV001 với dòng 2"],
    ]);
    expect(p.rows[0]?.payload).toEqual({
      row: 2,
      code: "HV001",
      name: "Nguyễn Minh An",
      birth_date: "2016-05-01",
      guardian_name: "Nguyễn Văn Bố",
      guardian_phone: "0900000001",
      level: "tot",
      class_code: "TOT-K12",
      start_date: "2026-11-01",
    });
    // Số ngày kiểu Excel: 42370 = 01/01/2016
    expect(p.rows[1]?.payload).toMatchObject({ code: "HV002", birth_date: "2016-01-01" });
  });
});
