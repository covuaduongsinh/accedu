import type { TuitionStatusRow } from "@accedu/api";
import { VIETQR_BANKS, formatAmount, formatDateVN, tuitionTransferNote, vietQrPayload } from "@accedu/core";
import { Printer, X } from "lucide-react";
import { QrCode } from "../../components/QrCode";
import { Button } from "../../components/ui";
import { useTenantCtx } from "../../lib/tenant";

const period = (r: TuitionStatusRow) =>
  r.billing === "monthly" ? `tháng ${r.period_start.slice(5, 7)}/${r.period_start.slice(0, 4)}` : `khóa ${r.sessions ?? ""} buổi từ ${formatDateVN(r.period_start)}`;

/**
 * Thông báo học phí gửi phụ huynh — mỗi học viên một trang: các khoản còn phải đóng, tổng tiền,
 * tài khoản nhận và mã VietQR (đúng số tiền, nội dung chuyển khoản). In hoặc chụp gửi qua Zalo.
 */
export function TuitionNotice({ rows, onClose }: { rows: TuitionStatusRow[]; onClose: () => void }) {
  const { tenant } = useTenantCtx();
  const groups = new Map<string, TuitionStatusRow[]>();
  for (const r of rows) if (Number(r.remaining) > 0) groups.set(r.student_id, [...(groups.get(r.student_id) ?? []), r]);
  const bank = tenant.bank_bin && tenant.bank_account_no ? { bin: tenant.bank_bin, accountNo: tenant.bank_account_no } : null;
  const bankName = VIETQR_BANKS.find((b) => b.bin === tenant.bank_bin)?.name ?? (tenant.bank_bin ? `Mã NH ${tenant.bank_bin}` : "");

  return (
    <div className="print-area fixed inset-0 z-50 overflow-auto bg-white p-8 text-[13px] text-black">
      <div className="no-print mb-4 flex items-center justify-end gap-2">
        {!bank ? <span className="mr-auto text-sm text-danger">Chưa khai báo tài khoản nhận học phí — vào Hệ thống › Thông tin đơn vị để có mã VietQR.</span> : null}
        <Button icon={<Printer size={14} />} onClick={() => window.print()}>
          In
        </Button>
        <Button variant="secondary" icon={<X size={14} />} onClick={onClose}>
          Đóng
        </Button>
      </div>
      {groups.size === 0 ? <p className="text-center text-muted">Các học viên đã chọn không còn học phí phải đóng.</p> : null}
      {[...groups.values()].map((items) => {
        const first = items[0]!;
        const total = items.reduce((s, r) => s + Number(r.remaining), 0);
        const note = tuitionTransferNote(first.student_code, items.length === 1 ? first.invoice_number : null);
        return (
          <section key={first.student_id} className="mx-auto mb-8 max-w-[150mm] break-after-page rounded-lg border-2 border-navy-500 p-6" aria-label={`Thông báo học phí ${first.student_name}`}>
            <div className="flex items-start justify-between gap-4 border-b border-gold-500 pb-3">
              <div>
                <div className="font-bold uppercase text-navy-700">{tenant.name}</div>
                <div className="text-xs">{tenant.address}</div>
                {tenant.phone ? <div className="text-xs">ĐT: {tenant.phone}</div> : null}
              </div>
              <div className="text-right text-xs italic text-muted">Vui trí tuệ</div>
            </div>
            <h2 className="my-4 text-center text-lg font-bold uppercase text-navy-700">Thông báo học phí</h2>
            <p>
              Kính gửi phụ huynh học viên <b>{first.student_name}</b> ({first.student_code})
              {first.guardian_name ? <>, phụ huynh {first.guardian_name}</> : null}.
            </p>
            <table className="my-3 w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-y border-navy-200 text-left">
                  <th className="py-1">Lớp</th>
                  <th>Kỳ học phí</th>
                  <th className="text-right">Còn phải đóng</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.bill_id} className="border-b border-navy-100">
                    <td className="py-1">{r.class_name}</td>
                    <td>{period(r)}</td>
                    <td className="num text-right">{formatAmount(Number(r.remaining))}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1" colSpan={2}>
                    Tổng cộng
                  </td>
                  <td className="num text-right text-navy-700" data-testid="notice-total">
                    {formatAmount(total)}
                  </td>
                </tr>
              </tbody>
            </table>
            {bank ? (
              <div className="mt-4 flex items-center gap-6">
                <QrCode value={vietQrPayload({ ...bank, amount: total, note })} size={168} label={`Mã VietQR học phí ${first.student_code}`} />
                <div className="space-y-1 text-[13px]">
                  <div>
                    Ngân hàng: <b>{bankName}</b>
                  </div>
                  <div>
                    Số tài khoản: <b className="num">{tenant.bank_account_no}</b>
                  </div>
                  {tenant.bank_account_name ? (
                    <div>
                      Chủ tài khoản: <b>{tenant.bank_account_name}</b>
                    </div>
                  ) : null}
                  <div>
                    Số tiền: <b className="num">{formatAmount(total)} đ</b>
                  </div>
                  <div>
                    Nội dung: <b data-testid="notice-note">{note}</b>
                  </div>
                  <div className="pt-1 text-xs italic">Quét mã bằng ứng dụng ngân hàng — số tiền và nội dung đã điền sẵn.</div>
                </div>
              </div>
            ) : null}
            <p className="mt-4 text-xs">Trân trọng cảm ơn quý phụ huynh đã đồng hành cùng CLB.</p>
          </section>
        );
      })}
    </div>
  );
}
