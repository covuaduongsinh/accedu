import { friendlyError, fromVoucherRow, type ItemRow, type PartnerRow, type VoucherRow, type VoucherWithLines } from "@accedu/api";
import { useAccounts, useInvoicePayments, useItems, useJobs, usePartners, useSaveVoucher, useVoucher, useWarehouses } from "@accedu/api/react";
import {
  VAT_CODES,
  amountInWords,
  buildLedgerEntries,
  computeInvoiceLine,
  formatAmount,
  formatDateVN,
  invoiceDefaults,
  invoiceTotals,
  isInvoiceType,
  parseAmount,
  todayVN,
  type VatCode,
  type VoucherInput,
} from "@accedu/core";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Empty, Field, Input, Select } from "../../components/ui";
import { platform } from "../../lib/supabase";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { STATUS_BADGE, type VoucherUiConfig } from "./config";
import { AccountName, AmountInput, PartnerName } from "./VoucherEditor";

interface LineDraft {
  key: string;
  itemCode: string;
  description: string;
  uom: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  /** Thành tiền nhập tay khi không có SL × đơn giá */
  amount: string;
  account: string;
  vatCode: VatCode | "";
  /** Tiền thuế nhập tay; rỗng = tự tính theo thuế suất */
  vatAmount: string;
  jobCode: string;
  /** Hóa đơn mua hàng: kho nhập (mặt hàng theo dõi tồn kho) */
  warehouseId: string;
}

interface HeaderDraft {
  partnerCode: string;
  partnerTaxCode: string;
  address: string;
  contactName: string;
  description: string;
  invoiceSeries: string;
  invoiceNumber: string;
  invoiceDate: string;
  postingDate: string;
  dueDate: string;
  headerAccount: string;
  number: string;
}

interface Initial {
  header: HeaderDraft;
  lines: LineDraft[];
  version?: number;
  status?: VoucherRow["status"];
}

let seq = 0;
const VAT_OPTIONS = Object.entries(VAT_CODES) as Array<[VatCode, (typeof VAT_CODES)[VatCode]]>;

function blankLine(account: string, vatCode: VatCode): LineDraft {
  return { key: `i${++seq}`, itemCode: "", description: "", uom: "", quantity: "", unitPrice: "", discount: "", amount: "", account, vatCode, vatAmount: "", jobCode: "", warehouseId: "" };
}

const num = (s: string) => (s.trim() === "" ? null : parseAmount(s));

/** Tính dòng từ bản nháp (dùng chung cho hiển thị, kiểm tra cân và gửi máy chủ) */
function calc(l: LineDraft) {
  return computeInvoiceLine({
    quantity: num(l.quantity),
    unitPrice: num(l.unitPrice),
    discount: num(l.discount),
    amount: num(l.amount),
    vatCode: l.vatCode || null,
    vatAmount: num(l.vatAmount),
  });
}

export function InvoiceEditor({ cfg, id, onClose }: { cfg: VoucherUiConfig; id: string | null; onClose: () => void }) {
  const { tenant } = useTenantCtx();
  const partners = usePartners(tenant.id);
  const items = useItems(tenant.id);
  const jobs = useJobs(tenant.id);
  const existing = useVoucher(id ?? undefined);
  if (!isInvoiceType(cfg.type)) return <Empty>Loại chứng từ không phải hóa đơn</Empty>;
  const defaults = invoiceDefaults(tenant.regime, cfg.type);
  if (id && (!existing.data || !partners.data || !items.data || !jobs.data)) return <Empty>Đang tải hóa đơn...</Empty>;

  let initial: Initial;
  if (id && existing.data) {
    const v = fromVoucherRow(existing.data as VoucherWithLines);
    const partnerCode = (pid: string | null | undefined) => (pid && partners.data?.find((p) => p.id === pid)?.code) || "";
    const itemCode = (iid: string | null | undefined) => (iid && items.data?.find((i) => i.id === iid)?.code) || "";
    const jobCode = (jid: string | null | undefined) => (jid && jobs.data?.find((j) => j.id === jid)?.code) || "";
    initial = {
      version: v.version,
      status: v.status,
      header: {
        partnerCode: partnerCode(v.partnerId),
        partnerTaxCode: v.partnerTaxCode ?? "",
        address: v.address ?? "",
        contactName: v.contactName ?? "",
        description: v.description ?? "",
        invoiceSeries: v.invoiceSeries ?? "",
        invoiceNumber: v.invoiceNumber ?? "",
        invoiceDate: v.invoiceDate ?? v.issueDate,
        postingDate: v.postingDate,
        dueDate: v.dueDate ?? "",
        headerAccount: v.headerAccount ?? defaults.headerAccount,
        number: v.number ?? "",
      },
      lines: v.lines.map((l) => {
        const hasQty = l.quantity != null && l.unitPrice != null;
        return {
          key: `i${++seq}`,
          itemCode: itemCode(l.itemId),
          description: l.description ?? "",
          uom: l.uom ?? "",
          quantity: hasQty ? formatAmount(l.quantity ?? 0, { decimals: Number.isInteger(l.quantity) ? 0 : 2 }) : "",
          unitPrice: hasQty ? formatAmount(l.unitPrice ?? 0) : "",
          discount: l.discountAmount ? formatAmount(l.discountAmount) : "",
          amount: hasQty ? "" : formatAmount(l.amount),
          account: (cfg.headerSide === "debit" ? l.creditAccount : l.debitAccount) ?? "",
          vatCode: l.vatCode ?? "",
          vatAmount: l.vatAmount ? formatAmount(l.vatAmount) : "",
          jobCode: jobCode(l.jobId),
          warehouseId: l.warehouseId ?? "",
        };
      }),
    };
  } else {
    const today = todayVN();
    initial = {
      header: {
        partnerCode: "",
        partnerTaxCode: "",
        address: "",
        contactName: "",
        description: "",
        invoiceSeries: "",
        invoiceNumber: "",
        invoiceDate: today,
        postingDate: today,
        dueDate: "",
        headerAccount: defaults.headerAccount,
        number: "",
      },
      lines: [blankLine(defaults.lineAccount, defaults.vatCode)],
    };
  }
  // Form giữ trạng thái riêng (useState khởi tạo một lần), không đồng bộ ngược khi dữ liệu nền làm mới
  return <InvoiceForm cfg={cfg} id={id} initial={initial} onClose={onClose} lineAccount={defaults.lineAccount} vatCode={defaults.vatCode} />;
}

function InvoiceForm({
  cfg,
  id,
  initial,
  onClose,
  lineAccount,
  vatCode,
}: {
  cfg: VoucherUiConfig;
  id: string | null;
  initial: Initial;
  onClose: () => void;
  lineAccount: string;
  vatCode: VatCode;
}) {
  const { tenant, role } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const partners = usePartners(tenant.id);
  const items = useItems(tenant.id);
  const jobs = useJobs(tenant.id);
  const warehouses = useWarehouses(tenant.id);
  const save = useSaveVoucher(tenant.id, platform);
  const listId = useId();
  const sale = cfg.headerSide === "debit";

  const [header, setHeader] = useState<HeaderDraft>(initial.header);
  const [lines, setLines] = useState<LineDraft[]>(initial.lines);
  const status = initial.status;
  const readOnly = status === "posted" || status === "cancelled" || role === "viewer";

  const postable = useMemo(() => (accounts.data ?? []).filter((a) => a.is_postable && a.is_active), [accounts.data]);
  const byCode = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.code, a])), [accounts.data]);
  // Hóa đơn mua hàng: dòng có mặt hàng theo dõi tồn kho, ghi Nợ TK vật tư → chọn kho nhập
  const withStock = cfg.type === "HDM";
  const mainWarehouse = ((warehouses.data ?? []).find((w) => w.code === "KHO") ?? warehouses.data?.[0])?.id ?? "";
  const stockLine = (item: ItemRow | undefined, account: string) => withStock && !!item?.track_inventory && !!byCode.get(account.trim())?.track_item;
  const partnerByCode = useMemo(() => new Map((partners.data ?? []).map((p) => [p.code.toUpperCase(), p])), [partners.data]);
  const itemByCode = useMemo(() => new Map((items.data ?? []).map((i) => [i.code.toUpperCase(), i])), [items.data]);
  const jobByCode = useMemo(() => new Map((jobs.data ?? []).map((j) => [j.code.toUpperCase(), j])), [jobs.data]);
  const partner = partnerByCode.get(header.partnerCode.trim().toUpperCase());

  const computed = lines.map((l) => ({ draft: l, ...calc(l) }));
  const used = computed.filter((c) => c.draft.account.trim() && (c.amount > 0 || c.draft.description || c.draft.itemCode));
  const totals = invoiceTotals(used);

  function toInput(): VoucherInput & { id?: string; version?: number } {
    return {
      ...(id ? { id } : {}),
      ...(initial.version ? { version: initial.version } : {}),
      voucherType: cfg.type,
      ...(header.number ? { number: header.number } : {}),
      issueDate: header.invoiceDate || header.postingDate,
      postingDate: header.postingDate,
      partnerId: partner?.id ?? null,
      ...(partner ? { partnerName: partner.name } : {}),
      contactName: header.contactName,
      address: header.address,
      description: header.description,
      headerAccount: header.headerAccount,
      invoiceSeries: header.invoiceSeries,
      invoiceNumber: header.invoiceNumber,
      invoiceDate: header.invoiceDate || null,
      dueDate: header.dueDate || null,
      partnerTaxCode: header.partnerTaxCode,
      lines: used.map((c, i) => {
        const l = c.draft;
        const item = itemByCode.get(l.itemCode.trim().toUpperCase());
        const job = jobByCode.get(l.jobCode.trim().toUpperCase());
        const qty = num(l.quantity);
        const price = num(l.unitPrice);
        return {
          lineNo: i + 1,
          ...(sale ? { creditAccount: l.account.trim() } : { debitAccount: l.account.trim() }),
          amount: c.amount,
          description: l.description || item?.name || header.description,
          partnerId: partner?.id ?? null,
          itemId: item?.id ?? null,
          jobId: job?.id ?? null,
          ...(stockLine(item, l.account) && l.warehouseId ? { warehouseId: l.warehouseId } : {}),
          quantity: qty !== null && price !== null ? qty : null,
          unitPrice: qty !== null && price !== null ? price : null,
          uom: l.uom,
          discountAmount: num(l.discount) ?? 0,
          vatCode: l.vatCode || null,
          vatAmount: c.vatAmount,
        };
      }),
    };
  }

  const preview = buildLedgerEntries(
    used.map((c, i) => ({
      lineNo: i + 1,
      debitAccount: sale ? header.headerAccount : c.draft.account,
      creditAccount: sale ? c.draft.account : header.headerAccount,
      amount: c.amount,
      vatAmount: c.vatAmount,
    })),
    0,
    sale ? "debit" : "credit",
  );
  const problems = [
    ...(partner ? [] : [`Chưa chọn ${sale ? "khách hàng" : "nhà cung cấp"}`]),
    ...(used.length ? [] : ["Hóa đơn chưa có dòng hàng"]),
    // Thuế đầu vào chỉ được khấu trừ khi có hóa đơn
    ...(!sale && totals.vat > 0 && !header.invoiceNumber.trim() ? ["Có thuế GTGT đầu vào — nhập số hóa đơn của nhà cung cấp"] : []),
    ...(preview.ok ? [] : preview.errors.map((e) => e.message)),
    ...used.flatMap((c, i) =>
      stockLine(itemByCode.get(c.draft.itemCode.trim().toUpperCase()), c.draft.account) && !c.draft.warehouseId ? [`Dòng ${i + 1}: chưa chọn kho nhập`] : [],
    ),
  ];

  async function submit(post: boolean) {
    try {
      await save.mutateAsync({ voucher: toInput(), post });
      toast.success(post ? "Đã lưu và ghi sổ hóa đơn" : "Đã lưu hóa đơn");
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickItem(key: string, code: string) {
    const it = itemByCode.get(code.trim().toUpperCase());
    if (!it) return setLine(key, { itemCode: code });
    setLine(key, {
      itemCode: code,
      description: it.name,
      uom: it.uom,
      ...(fillPrice(it) ? { unitPrice: formatAmount(fillPrice(it) ?? 0), quantity: "1", amount: "" } : {}),
      account: (sale ? it.revenue_account : it.inventory_account) || (sale && it.kind === "service" ? "5113" : lineAccount),
      ...(withStock && it.track_inventory ? { warehouseId: it.default_warehouse_id || mainWarehouse } : {}),
      vatCode: (it.vat_code as VatCode) || vatCode,
      vatAmount: "",
    });
  }
  const fillPrice = (it: ItemRow) => {
    const p = sale ? it.sale_price : it.purchase_price;
    return p === null ? null : Number(p);
  };

  function pickPartner(code: string) {
    const p: PartnerRow | undefined = partnerByCode.get(code.trim().toUpperCase());
    setHeader((h) => ({
      ...h,
      partnerCode: code,
      ...(p ? { partnerTaxCode: p.tax_code ?? "", address: p.address ?? "", contactName: h.contactName || p.contact_name || p.name } : {}),
    }));
  }

  return (
    <div
      className="space-y-3"
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (!readOnly) void submit(false);
        }
      }}
    >
      <datalist id={`${listId}-acc`}>
        {postable.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </datalist>
      <datalist id={`${listId}-partner`}>
        {(partners.data ?? [])
          .filter((p) => (sale ? p.is_customer || p.is_student : p.is_supplier) && p.is_active)
          .map((p) => (
            <option key={p.id} value={p.code}>
              {p.name}
            </option>
          ))}
      </datalist>
      <datalist id={`${listId}-item`}>
        {(items.data ?? [])
          .filter((i) => i.is_active)
          .map((i) => (
            <option key={i.id} value={i.code}>
              {i.name}
            </option>
          ))}
      </datalist>
      <datalist id={`${listId}-job`}>
        {(jobs.data ?? [])
          .filter((j) => j.is_active)
          .map((j) => (
            <option key={j.id} value={j.code}>
              {j.name}
            </option>
          ))}
      </datalist>

      {status ? (
        <div className="flex items-center gap-2 text-xs">
          Trạng thái: <Badge tone={STATUS_BADGE[status].tone}>{STATUS_BADGE[status].label}</Badge>
          {status === "posted" ? <span className="text-muted">— bỏ ghi sổ để sửa</span> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <Field label={cfg.partnerLabel}>
          <Input list={`${listId}-partner`} value={header.partnerCode} disabled={readOnly} onChange={(e) => pickPartner(e.target.value)} />
          <PartnerName p={partner} />
        </Field>
        <Field label="Mã số thuế">
          <Input value={header.partnerTaxCode} disabled={readOnly} onChange={(e) => setHeader({ ...header, partnerTaxCode: e.target.value })} />
        </Field>
        <Field label="Địa chỉ" className="md:col-span-2">
          <Input value={header.address} disabled={readOnly} onChange={(e) => setHeader({ ...header, address: e.target.value })} />
        </Field>
        <Field label={cfg.contactLabel} className="md:col-span-2">
          <Input value={header.contactName} disabled={readOnly} onChange={(e) => setHeader({ ...header, contactName: e.target.value })} />
        </Field>

        <Field label="Ký hiệu">
          <Input value={header.invoiceSeries} disabled={readOnly} placeholder={sale ? "C26T…" : "1C26T…"} onChange={(e) => setHeader({ ...header, invoiceSeries: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Số hóa đơn">
          <Input value={header.invoiceNumber} disabled={readOnly} onChange={(e) => setHeader({ ...header, invoiceNumber: e.target.value })} />
        </Field>
        <Field label="Ngày hóa đơn">
          <Input
            type="date"
            value={header.invoiceDate}
            disabled={readOnly}
            onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value, ...(sale ? { postingDate: e.target.value } : {}) })}
          />
        </Field>
        <Field label="Ngày hạch toán">
          <Input type="date" value={header.postingDate} disabled={readOnly} onChange={(e) => setHeader({ ...header, postingDate: e.target.value })} />
        </Field>
        <Field label="Hạn thanh toán" hint="Trống: theo điều khoản đối tượng">
          <Input type="date" value={header.dueDate} disabled={readOnly} onChange={(e) => setHeader({ ...header, dueDate: e.target.value })} />
        </Field>
        <Field label="Số chứng từ" hint="Trống: tự cấp">
          <Input value={header.number} disabled={readOnly} placeholder="Tự động" onChange={(e) => setHeader({ ...header, number: e.target.value })} />
        </Field>

        <Field label={cfg.descriptionLabel} className="md:col-span-4">
          <Input value={header.description} disabled={readOnly} onChange={(e) => setHeader({ ...header, description: e.target.value })} />
        </Field>
        <Field label={cfg.headerAccountLabel ?? "Tài khoản"} className="md:col-span-2">
          <Input list={`${listId}-acc`} value={header.headerAccount} disabled={readOnly} onChange={(e) => setHeader({ ...header, headerAccount: e.target.value })} />
          <AccountName a={byCode.get(header.headerAccount)} />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[1240px] text-sm">
          <thead className="bg-navy-50 text-xs text-navy-700">
            <tr>
              <th className="w-8 px-2 py-1.5 text-left">#</th>
              <th className="w-28 px-1 text-left">Mã hàng</th>
              <th className="min-w-52 px-1 text-left">Tên hàng / diễn giải</th>
              <th className="w-20 px-1 text-left">Đvt</th>
              <th className="w-20 px-1 text-right">SL</th>
              <th className="w-28 px-1 text-right">Đơn giá</th>
              <th className="w-24 px-1 text-right">Chiết khấu</th>
              <th className="w-32 px-1 text-right">Thành tiền</th>
              <th className="w-24 px-1 text-left">{cfg.lineAccountLabel}</th>
              <th className="w-28 px-1 text-left">Thuế suất</th>
              <th className="w-28 px-1 text-right">Tiền thuế</th>
              {withStock ? <th className="w-36 px-1 text-left">Kho</th> : null}
              <th className="w-24 px-1 text-left">Lớp / vụ việc</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {computed.map(({ draft: l, amount, vatAmount, vatRate }, i) => {
              const n = i + 1;
              const byQty = num(l.quantity) !== null && num(l.unitPrice) !== null;
              return (
                <tr key={l.key} className="border-t border-line">
                  <td className="px-2 text-muted">{n}</td>
                  <td className="px-1 py-1">
                    <Input list={`${listId}-item`} value={l.itemCode} disabled={readOnly} aria-label={`Mã hàng dòng ${n}`} onChange={(e) => pickItem(l.key, e.target.value)} />
                  </td>
                  <td className="px-1">
                    <Input value={l.description} disabled={readOnly} aria-label={`Diễn giải dòng ${n}`} placeholder={header.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                  </td>
                  <td className="px-1">
                    <Input value={l.uom} disabled={readOnly} aria-label={`Đvt dòng ${n}`} onChange={(e) => setLine(l.key, { uom: e.target.value })} />
                  </td>
                  <td className="px-1">
                    <AmountInput value={l.quantity} disabled={readOnly} label={`Số lượng dòng ${n}`} onChange={(v) => setLine(l.key, { quantity: v, vatAmount: "" })} />
                  </td>
                  <td className="px-1">
                    <AmountInput value={l.unitPrice} disabled={readOnly} label={`Đơn giá dòng ${n}`} onChange={(v) => setLine(l.key, { unitPrice: v, vatAmount: "" })} />
                  </td>
                  <td className="px-1">
                    <AmountInput value={l.discount} disabled={readOnly} label={`Chiết khấu dòng ${n}`} onChange={(v) => setLine(l.key, { discount: v, vatAmount: "" })} />
                  </td>
                  <td className="px-1">
                    <AmountInput
                      value={byQty ? formatAmount(amount) : l.amount}
                      disabled={readOnly || byQty}
                      label={`Thành tiền dòng ${n}`}
                      onChange={(v) => setLine(l.key, { amount: v, vatAmount: "" })}
                    />
                  </td>
                  <td className="px-1">
                    <Input list={`${listId}-acc`} value={l.account} disabled={readOnly} aria-label={`TK dòng ${n}`} onChange={(e) => setLine(l.key, { account: e.target.value })} />
                  </td>
                  <td className="px-1">
                    <Select value={l.vatCode} disabled={readOnly} aria-label={`Thuế suất dòng ${n}`} onChange={(e) => setLine(l.key, { vatCode: e.target.value as VatCode | "", vatAmount: "" })}>
                      <option value="">—</option>
                      {VAT_OPTIONS.map(([code, v]) => (
                        <option key={code} value={code}>
                          {v.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-1">
                    <AmountInput
                      value={l.vatAmount || (vatRate ? formatAmount(vatAmount) : "")}
                      disabled={readOnly || vatRate === 0}
                      label={`Tiền thuế dòng ${n}`}
                      onChange={(v) => setLine(l.key, { vatAmount: v })}
                    />
                  </td>
                  {withStock ? (
                    <td className="px-1">
                      {stockLine(itemByCode.get(l.itemCode.trim().toUpperCase()), l.account) ? (
                        <Select aria-label={`Kho dòng ${n}`} value={l.warehouseId} disabled={readOnly} onChange={(e) => setLine(l.key, { warehouseId: e.target.value })}>
                          <option value="">—</option>
                          {(warehouses.data ?? [])
                            .filter((w) => w.is_active)
                            .map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.code}
                              </option>
                            ))}
                        </Select>
                      ) : (
                        <span className="px-1 text-xs text-muted">—</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-1">
                    <Input list={`${listId}-job`} value={l.jobCode} disabled={readOnly} aria-label={`Vụ việc dòng ${n}`} onChange={(e) => setLine(l.key, { jobCode: e.target.value })} />
                  </td>
                  <td className="px-1 text-center">
                    {!readOnly && lines.length > 1 ? (
                      <button type="button" aria-label="Xóa dòng" className="text-muted hover:text-danger" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-xs">
          {!readOnly ? (
            <Button variant="ghost" icon={<Plus size={14} />} onClick={() => setLines([...lines, blankLine(lineAccount, vatCode)])}>
              Thêm dòng
            </Button>
          ) : null}
          {!readOnly && problems.length && used.length ? (
            <ul className="mt-1 text-danger">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="pr-4 text-muted">Tiền hàng</td>
              <td className="num text-right">{formatAmount(totals.net)}</td>
            </tr>
            <tr>
              <td className="pr-4 text-muted">Tiền thuế GTGT</td>
              <td className="num text-right">{formatAmount(totals.vat)}</td>
            </tr>
            <tr>
              <td className="pr-4 font-medium text-navy-700">Tổng thanh toán</td>
              <td className="num text-right text-base font-semibold text-navy-700" data-testid="invoice-total">
                {formatAmount(totals.total)}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="pt-1 text-right text-xs italic text-muted">
                {totals.total > 0 ? amountInWords(totals.total) : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {id ? <InvoicePayments invoiceId={id} total={totals.total} sale={sale} posted={status === "posted"} /> : null}

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
        {!readOnly ? (
          <>
            <Button variant="secondary" icon={<Save size={14} />} disabled={save.isPending || !partner} onClick={() => void submit(false)}>
              Lưu (Ctrl+S)
            </Button>
            {canPost(role) ? (
              <Button icon={<Send size={14} />} disabled={save.isPending || problems.length > 0} onClick={() => void submit(true)}>
                Lưu & ghi sổ
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Tình hình thanh toán của hóa đơn: các phiếu thu/chi đã chọn trừ vào hóa đơn (chỉ phiếu đã ghi sổ được tính) */
function InvoicePayments({ invoiceId, total, sale, posted }: { invoiceId: string; total: number; sale: boolean; posted: boolean }) {
  const { tenant } = useTenantCtx();
  const payments = useInvoicePayments(tenant.id, invoiceId);
  const rows = payments.data ?? [];
  if (!posted && !rows.length) return null;
  const paid = rows.filter((r) => r.vouchers?.status === "posted").reduce((s, r) => s + Number(r.amount), 0);
  const verb = sale ? "thu" : "trả";
  return (
    <section aria-label="Tình hình thanh toán" className="rounded-md border border-line p-3 text-sm">
      <div className="flex flex-wrap gap-4">
        <span>
          Đã {verb}: <b className="num" data-testid="invoice-paid">{formatAmount(paid)}</b>
        </span>
        <span>
          Còn phải {verb}:{" "}
          <b className={`num ${total - paid > 0 ? "text-danger" : "text-success"}`} data-testid="invoice-remaining">
            {formatAmount(total - paid)}
          </b>
        </span>
      </div>
      {rows.length ? (
        <table className="mt-2 w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="text-left">Ngày</th>
              <th className="text-left">Phiếu {verb} tiền</th>
              <th className="text-left">Trạng thái</th>
              <th className="text-right">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.voucher_id}-${r.line_no}`} className="border-t border-line">
                <td>{formatDateVN(r.vouchers?.posting_date)}</td>
                <td>{r.vouchers?.number}</td>
                <td>{r.vouchers ? <Badge tone={STATUS_BADGE[r.vouchers.status].tone}>{STATUS_BADGE[r.vouchers.status].label}</Badge> : null}</td>
                <td className="num text-right">{formatAmount(Number(r.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-1 text-xs text-muted">Chưa có phiếu {verb} tiền nào trừ vào hóa đơn này — lập phiếu {sale ? "thu" : "chi"} và chọn hóa đơn ở cột “Trừ hóa đơn”.</div>
      )}
    </section>
  );
}
