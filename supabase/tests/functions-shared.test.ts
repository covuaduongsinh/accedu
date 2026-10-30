import { describe, expect, it } from "vitest";
import * as core from "../../packages/core/src/money/vietqr.ts";
import { tuitionTransferNote as coreNote } from "../../packages/core/src/education/education.ts";
import { formatVnd, periodLabel, renderTuitionEmail, type ReminderCandidate } from "../functions/_shared/tuition-email.ts";
import { tuitionTransferNote, vietQrPayload } from "../functions/_shared/vietqr.ts";

const tenant = {
  name: "CLB Cờ vua Mẫu",
  address: "Số 1 Phố Mẫu",
  phone: "0900000000",
  bank_bin: "970436",
  bank_account_no: "0123456789",
  bank_account_name: "CLB CO VUA MAU",
};
const candidate: ReminderCandidate = {
  student_id: "s1",
  student_code: "HV101",
  student_name: "Học viên <Mẫu>",
  guardian_name: "Phụ huynh Mẫu",
  email: "ph@example.test",
  total: 1_200_000,
  bill_ids: ["b1", "b2"],
  items: [
    { class_name: "Lớp Tốt K15", billing: "monthly", period_start: "2026-10-01", sessions: null, invoice_number: "DV0001", remaining: 600_000 },
    { class_name: "Lớp Mã K3", billing: "course", period_start: "2026-10-05", sessions: 12, invoice_number: "DV0002", remaining: 600_000 },
  ],
  last_auto_at: null,
  last_sent_at: null,
};

describe("Edge Function dùng chung: VietQR, email thông báo học phí", () => {
  it("VietQR và nội dung chuyển khoản trùng với bản trong packages/core", () => {
    for (const input of [
      { bin: "970436", accountNo: "0123456789", amount: 1_200_000, note: "HP HV101" },
      { bin: "970422", accountNo: "999988887777", amount: null, note: null },
      { bin: "970415", accountNo: "1234", amount: 600_000.4, note: "Học phí đặc biệt! #1" },
    ]) {
      expect(vietQrPayload(input)).toBe(core.vietQrPayload(input));
    }
    expect(tuitionTransferNote("Đức-01", "DV0003")).toBe(coreNote("Đức-01", "DV0003"));
  });

  it("email: tiêu đề, bảng khoản còn nợ, tổng tiền, nội dung chuyển khoản, mã QR đính kèm (cid); thoát ký tự HTML", () => {
    const m = renderTuitionEmail(tenant, candidate, "vietqr");
    expect(m.subject).toBe("Thông báo học phí Học viên <Mẫu> — CLB Cờ vua Mẫu");
    expect(m.note).toBe("HP HV101");
    expect(m.html).toContain('src="cid:vietqr"');
    expect(m.html).toContain("Học viên &lt;Mẫu&gt;");
    expect(m.html).not.toContain("<Mẫu>");
    expect(m.html).toContain(`${formatVnd(1_200_000)} đ`);
    expect(m.html).toContain("Vietcombank");
    expect(m.text).toContain("Nội dung: HP HV101");
    expect(periodLabel(candidate.items[0]!)).toBe("tháng 10/2026");
    expect(periodLabel(candidate.items[1]!)).toBe("khóa 12 buổi từ 05/10/2026");
    // Một hóa đơn: nội dung kèm số hóa đơn; chưa có tài khoản nhận: không có khối QR
    const one = renderTuitionEmail({ ...tenant, bank_bin: null, bank_account_no: null }, { ...candidate, items: [candidate.items[0]!] }, null, { test: true });
    expect(one.note).toBe("HP HV101 DV0001");
    expect(one.subject.startsWith("[Thử] ")).toBe(true);
    expect(one.html).not.toContain("cid:");
  });
});
