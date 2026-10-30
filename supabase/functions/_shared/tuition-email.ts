// Soạn email thông báo học phí gửi phụ huynh (nhận diện Dương Sinh: navy #2B3990 + gold). Thuần TypeScript — chạy được
// trong Edge Function (Deno) và trong test (Node).
import { VIETQR_BANKS, tuitionTransferNote } from "./vietqr.ts";

export interface ReminderItem {
  class_name: string;
  billing: "monthly" | "course";
  period_start: string;
  sessions: number | null;
  invoice_number: string;
  remaining: number;
}

export interface ReminderCandidate {
  student_id: string;
  student_code: string;
  student_name: string;
  guardian_name: string | null;
  email: string | null;
  total: number;
  bill_ids: string[];
  items: ReminderItem[];
  last_auto_at: string | null;
  last_sent_at: string | null;
}

export interface ReminderTenant {
  name: string;
  address: string | null;
  phone: string | null;
  bank_bin: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
}

const NAVY = "#2B3990";
const GOLD = "#C9A227";

export const formatVnd = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(n));

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function periodLabel(i: ReminderItem): string {
  const [y, m, d] = i.period_start.split("-");
  return i.billing === "monthly" ? `tháng ${m}/${y}` : `khóa ${i.sessions ?? ""} buổi từ ${d}/${m}/${y}`;
}

/** Nội dung chuyển khoản: một hóa đơn thì kèm số hóa đơn */
export function reminderNote(c: Pick<ReminderCandidate, "student_code" | "items">): string {
  return tuitionTransferNote(c.student_code, c.items.length === 1 ? c.items[0]!.invoice_number : null);
}

export function bankName(bin: string | null): string {
  return VIETQR_BANKS.find((b) => b.bin === bin)?.name ?? (bin ? `Mã NH ${bin}` : "");
}

/**
 * Email thông báo học phí của một học viên: các khoản còn phải đóng, tổng tiền, tài khoản nhận, nội dung chuyển khoản
 * và mã VietQR (ảnh đính kèm, tham chiếu bằng cid). `qrCid` null khi đơn vị chưa khai báo tài khoản nhận.
 */
export function renderTuitionEmail(tenant: ReminderTenant, c: ReminderCandidate, qrCid: string | null, opts: { test?: boolean } = {}) {
  const note = reminderNote(c);
  const total = formatVnd(c.total);
  const greet = c.guardian_name ? `Kính gửi phụ huynh ${c.guardian_name}` : "Kính gửi quý phụ huynh";
  const subject = `${opts.test ? "[Thử] " : ""}Thông báo học phí ${c.student_name} — ${tenant.name}`;
  const hasBank = !!(tenant.bank_bin && tenant.bank_account_no);

  const rows = c.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e3e6f0">${esc(i.class_name)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e3e6f0">${esc(periodLabel(i))}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e3e6f0;text-align:right;white-space:nowrap">${formatVnd(i.remaining)} đ</td></tr>`,
    )
    .join("");

  const bankBlock = hasBank
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr>
        ${qrCid ? `<td style="padding-right:20px;vertical-align:top"><img src="cid:${qrCid}" width="168" height="168" alt="Mã VietQR" style="display:block;border:1px solid #e3e6f0"></td>` : ""}
        <td style="vertical-align:top;font-size:14px;line-height:1.7">
          Ngân hàng: <b>${esc(bankName(tenant.bank_bin))}</b><br>
          Số tài khoản: <b>${esc(tenant.bank_account_no ?? "")}</b><br>
          ${tenant.bank_account_name ? `Chủ tài khoản: <b>${esc(tenant.bank_account_name)}</b><br>` : ""}
          Số tiền: <b>${total} đ</b><br>
          Nội dung: <b>${esc(note)}</b><br>
          <span style="color:#5f6474;font-size:12px">Quét mã bằng ứng dụng ngân hàng — số tiền và nội dung đã điền sẵn.</span>
        </td></tr></table>`
    : "";

  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f5f6fa;font-family:Roboto,Arial,sans-serif;color:#1a1d29">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #d9dce5">
<tr><td style="background:${NAVY};padding:16px 24px;color:#ffffff">
  <div style="font-size:18px;font-weight:bold;text-transform:uppercase">${esc(tenant.name)}</div>
  <div style="font-size:12px;color:#ecc94b">Vui trí tuệ</div>
</td></tr>
<tr><td style="height:4px;background:${GOLD}"></td></tr>
<tr><td style="padding:24px">
  <h1 style="margin:0 0 16px;font-size:20px;color:${NAVY};text-transform:uppercase">Thông báo học phí</h1>
  <p style="margin:0 0 12px;font-size:14px">${esc(greet)},</p>
  <p style="margin:0 0 12px;font-size:14px">Câu lạc bộ xin thông báo học phí còn phải đóng của học viên <b>${esc(c.student_name)}</b> (${esc(c.student_code)}):</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse">
    <tr style="background:#eef0fa;color:${NAVY}"><th align="left" style="padding:6px 8px">Lớp</th><th align="left" style="padding:6px 8px">Kỳ học phí</th><th align="right" style="padding:6px 8px">Còn phải đóng</th></tr>
    ${rows}
    <tr><td colspan="2" style="padding:8px;font-weight:bold">Tổng cộng</td><td style="padding:8px;text-align:right;font-weight:bold;color:${NAVY};white-space:nowrap">${total} đ</td></tr>
  </table>
  ${bankBlock}
  <p style="margin:16px 0 0;font-size:13px">Trân trọng cảm ơn quý phụ huynh đã đồng hành cùng Câu lạc bộ. Nếu đã đóng học phí, xin bỏ qua thông báo này.</p>
</td></tr>
<tr><td style="background:#eef0fa;padding:12px 24px;font-size:12px;color:#5f6474">
  ${esc(tenant.name)}${tenant.address ? ` · ${esc(tenant.address)}` : ""}${tenant.phone ? ` · ĐT: ${esc(tenant.phone)}` : ""}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${greet},`,
    "",
    `Học phí còn phải đóng của học viên ${c.student_name} (${c.student_code}):`,
    ...c.items.map((i) => `- ${i.class_name}, ${periodLabel(i)}: ${formatVnd(i.remaining)} đ`),
    `Tổng cộng: ${total} đ`,
    ...(hasBank
      ? ["", `Chuyển khoản: ${bankName(tenant.bank_bin)} — số tài khoản ${tenant.bank_account_no}${tenant.bank_account_name ? ` (${tenant.bank_account_name})` : ""}`, `Nội dung: ${note}`]
      : []),
    "",
    `Trân trọng — ${tenant.name}`,
  ].join("\n");

  return { subject, html, text, note };
}
