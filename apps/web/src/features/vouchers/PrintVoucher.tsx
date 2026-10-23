import { useVoucher } from "@accedu/api/react";
import { amountInWords, formatAmount } from "@accedu/core";
import { Printer, X } from "lucide-react";
import { Button } from "../../components/ui";
import { useTenantCtx } from "../../lib/tenant";
import type { VoucherUiConfig } from "./config";

const REGIME_NOTE = {
  TT99: "(Kèm theo Thông tư số 99/2025/TT-BTC ngày 27/10/2025 của Bộ trưởng Bộ Tài chính)",
  TT133: "(Ban hành theo Thông tư số 133/2016/TT-BTC ngày 26/08/2016 của Bộ Tài chính)",
} as const;

/** Mẫu in Phiếu thu (01-TT) / Phiếu chi (02-TT) */
export function PrintVoucher({ id, cfg, onClose }: { id: string; cfg: VoucherUiConfig; onClose: () => void }) {
  const { tenant } = useTenantCtx();
  const v = useVoucher(id);
  const form = cfg.printForm!;
  if (!v.data) return null;
  const d = v.data;
  const [y, m, day] = d.posting_date.split("-");
  const amount = Number(d.total_amount);
  const debit = [...new Set(d.voucher_lines.map((l) => l.debit_account).filter(Boolean))].join(", ");
  const credit = [...new Set(d.voucher_lines.map((l) => l.credit_account).filter(Boolean))].join(", ");

  return (
    <div className="print-area fixed inset-0 z-50 overflow-auto bg-white p-8 text-[13px] text-black">
      <div className="no-print mb-4 flex justify-end gap-2">
        <Button icon={<Printer size={14} />} onClick={() => window.print()}>
          In
        </Button>
        <Button variant="secondary" icon={<X size={14} />} onClick={onClose}>
          Đóng
        </Button>
      </div>
      <div className="mx-auto max-w-[190mm] font-serif">
        <div className="flex justify-between">
          <div>
            <div className="font-bold uppercase">{tenant.name}</div>
            <div>{tenant.address}</div>
          </div>
          <div className="text-center">
            <div className="font-bold">Mẫu số {form.code}</div>
            <div className="max-w-72 text-[11px] italic">{REGIME_NOTE[tenant.regime]}</div>
          </div>
        </div>
        <div className="mt-6 flex items-start justify-between">
          <div className="w-1/3" />
          <div className="text-center">
            <div className="text-2xl font-bold">{form.title}</div>
            <div className="italic">
              Ngày {day} tháng {m} năm {y}
            </div>
          </div>
          <div className="w-1/3 text-right">
            <div>Quyển số: ........</div>
            <div>Số: {d.number}</div>
            <div>Nợ: {debit}</div>
            <div>Có: {credit}</div>
          </div>
        </div>
        <div className="mt-6 space-y-2 leading-7">
          <div>
            {form.contactLabel}: <b>{d.contact_name || d.partner_name}</b>
          </div>
          <div>Địa chỉ: {d.address}</div>
          <div>
            {form.reasonLabel}: {d.description}
          </div>
          <div>
            Số tiền: <b>{formatAmount(amount)} đồng</b>
          </div>
          <div>
            Viết bằng chữ: <i>{amountInWords(amount)}</i>
          </div>
          <div>Kèm theo: {d.original_documents} chứng từ gốc.</div>
        </div>
        <div className="mt-6 grid grid-cols-5 text-center">
          {["Giám đốc", "Kế toán trưởng", cfg.type === "PT" ? "Người nộp tiền" : "Người nhận tiền", "Người lập phiếu", "Thủ quỹ"].map((r) => (
            <div key={r}>
              <div className="font-bold">{r}</div>
              <div className="text-[11px] italic">(Ký, họ tên{r === "Giám đốc" ? ", đóng dấu" : ""})</div>
            </div>
          ))}
        </div>
        <div className="mt-24 italic">Đã nhận đủ số tiền (viết bằng chữ): {amountInWords(amount)}</div>
      </div>
    </div>
  );
}
