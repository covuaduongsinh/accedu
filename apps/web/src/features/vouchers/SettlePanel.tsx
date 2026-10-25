import type { OpenInvoiceRow, PartnerRow } from "@accedu/api";
import { useOpenInvoices } from "@accedu/api/react";
import { allocateFifo, daysBetween, formatAmount, formatDateVN, parseAmount, todayVN, type SettlementSide } from "@accedu/core";
import { Wand2, X } from "lucide-react";
import { useState } from "react";
import { Button, Field, Select } from "../../components/ui";
import { useTenantCtx } from "../../lib/tenant";
import { AmountInput } from "./VoucherEditor";

export const invoiceLabel = (i: Pick<OpenInvoiceRow, "number" | "invoice_number">) =>
  i.invoice_number ? `${i.number} (HĐ ${i.invoice_number})` : i.number;

/**
 * Chọn hóa đơn cho một dòng thu/chi: hóa đơn còn nợ của đối tượng, cùng TK công nợ với dòng.
 * Hóa đơn đã chọn vẫn hiện dù đã trả đủ (khi xem lại phiếu đã ghi sổ).
 */
export function InvoiceSelect({
  side,
  partnerId,
  account,
  value,
  onChange,
  disabled,
  label,
}: {
  side: SettlementSide;
  partnerId: string | undefined;
  account: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const { tenant } = useTenantCtx();
  const invoices = useOpenInvoices(tenant.id, side, { partnerId: partnerId ?? null, includePaid: true, enabled: !!partnerId });
  const options = (invoices.data ?? []).filter((i) => i.account === account && (Number(i.remaining) > 0 || i.id === value));
  const selected = options.find((i) => i.id === value);
  if (!partnerId || (!options.length && !value)) return <span className="px-1 text-xs text-muted">—</span>;
  return (
    <div>
      <Select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full">
        <option value="">— Không theo hóa đơn —</option>
        {options.map((i) => (
          <option key={i.id} value={i.id}>
            {invoiceLabel(i)} · còn {formatAmount(Number(i.remaining))}
          </option>
        ))}
        {value && !selected && !invoices.isLoading ? <option value={value}>Hóa đơn đã chọn</option> : null}
      </Select>
    </div>
  );
}

export interface SettleResult {
  allocations: { invoice: OpenInvoiceRow; amount: number }[];
  leftover: number;
}

/** Thu/chi theo hóa đơn: nhập số tiền, phân bổ tự động hóa đơn đến hạn sớm nhất trước, hoặc sửa từng dòng */
export function SettlePanel({
  side,
  partner,
  postingDate,
  onApply,
  onClose,
}: {
  side: SettlementSide;
  partner: PartnerRow;
  postingDate: string;
  onApply: (r: SettleResult) => void;
  onClose: () => void;
}) {
  const { tenant } = useTenantCtx();
  const invoices = useOpenInvoices(tenant.id, side, { partnerId: partner.id });
  const list = invoices.data ?? [];
  const [amount, setAmount] = useState("");
  const [take, setTake] = useState<Record<string, string>>({});
  const owed = list.reduce((s, i) => s + Number(i.remaining), 0);
  const allocated = list.reduce((s, i) => s + Math.min(parseAmount(take[i.id] ?? "") ?? 0, Number(i.remaining)), 0);
  const money = parseAmount(amount);
  const leftover = money === null ? 0 : Math.max(0, money - allocated);
  const verb = side === "receivable" ? "thu" : "trả";

  function autoAllocate(value = amount) {
    const total = parseAmount(value) ?? owed;
    const r = allocateFifo(
      total,
      list.map((i) => ({ id: i.id, remaining: Number(i.remaining), dueDate: i.due_date, invoiceDate: i.invoice_date, postingDate: i.posting_date })),
    );
    setTake(Object.fromEntries(r.allocations.map((a) => [a.invoiceId, String(a.amount)])));
    if (!value.trim()) setAmount(String(total));
  }

  function apply() {
    onApply({
      allocations: list
        .map((i) => ({ invoice: i, amount: Math.min(parseAmount(take[i.id] ?? "") ?? 0, Number(i.remaining)) }))
        .filter((a) => a.amount > 0),
      leftover,
    });
  }

  return (
    <section aria-label={`${verb} theo hóa đơn`} className="space-y-2 rounded-md border border-gold-300 bg-gold-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-sm font-semibold text-navy-700">
          Hóa đơn còn nợ của {partner.code} — {partner.name}
        </div>
        <div className="ml-auto flex items-end gap-2">
          <Field label={`Số tiền ${verb}`} hint="Trống: trả hết các hóa đơn">
            <AmountInput label={`Số tiền ${verb} theo hóa đơn`} value={amount} onChange={setAmount} />
          </Field>
          <Button variant="secondary" icon={<Wand2 size={14} />} disabled={!list.length} onClick={() => autoAllocate()}>
            Phân bổ tự động
          </Button>
          <button type="button" aria-label="Đóng" className="mb-2 text-muted hover:text-danger" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
      {invoices.isLoading ? (
        <div className="text-xs text-muted">Đang tải hóa đơn...</div>
      ) : !list.length ? (
        <div className="text-xs text-muted">Đối tượng không còn hóa đơn nào chưa {verb} đủ — số tiền sẽ ghi thành khoản trả trước.</div>
      ) : (
        <table className="w-full bg-white text-sm">
          <thead className="bg-navy-50 text-xs text-navy-700">
            <tr>
              <th className="px-2 py-1 text-left">Ngày HĐ</th>
              <th className="px-2 text-left">Chứng từ</th>
              <th className="px-2 text-left">Diễn giải</th>
              <th className="px-2 text-left">Hạn TT</th>
              <th className="px-2 text-right">Tổng HĐ</th>
              <th className="px-2 text-right">Còn nợ</th>
              <th className="w-40 px-2 text-right">Số trừ</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => {
              const overdue = daysBetween(i.due_date ?? i.invoice_date ?? i.posting_date, postingDate || todayVN());
              return (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-2 py-1">{formatDateVN(i.invoice_date ?? i.posting_date)}</td>
                  <td className="px-2">{invoiceLabel(i)}</td>
                  <td className="px-2 text-xs text-muted">{i.description}</td>
                  <td className="px-2">
                    {i.due_date ? formatDateVN(i.due_date) : ""}
                    {overdue > 0 ? <span className="ml-1 text-xs text-danger">quá {overdue} ngày</span> : null}
                  </td>
                  <td className="num px-2 text-right">{formatAmount(Number(i.total_amount))}</td>
                  <td className="num px-2 text-right">{formatAmount(Number(i.remaining))}</td>
                  <td className="px-1 py-0.5">
                    <AmountInput label={`Số trừ hóa đơn ${i.number}`} value={take[i.id] ?? ""} onChange={(v) => setTake({ ...take, [i.id]: v })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
        <span>
          Tổng còn nợ <b className="num">{formatAmount(owed)}</b>
        </span>
        <span>
          Trừ hóa đơn <b className="num" data-testid="settle-allocated">{formatAmount(allocated)}</b>
        </span>
        {leftover > 0 ? (
          <span>
            Trả trước (không theo hóa đơn) <b className="num">{formatAmount(leftover)}</b>
          </span>
        ) : null}
        <Button disabled={allocated <= 0 && leftover <= 0} onClick={apply}>
          Đưa vào phiếu
        </Button>
      </div>
    </section>
  );
}
