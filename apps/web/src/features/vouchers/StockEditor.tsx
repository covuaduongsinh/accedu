import { friendlyError, fromVoucherRow, type ItemRow, type VoucherRow, type VoucherWithLines } from "@accedu/api";
import { useAccounts, useItems, usePartners, useSaveVoucher, useStockBalances, useVoucher, useWarehouses } from "@accedu/api/react";
import { amountInWords, estimateIssueCost, formatAmount, parseAmount, roundAmount, stockDefaults, todayVN, type VoucherInput } from "@accedu/core";
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
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  account: string;
  /** Số tiền đã ghi sổ (giá vốn chính thức) */
  saved?: number;
}

interface HeaderDraft {
  postingDate: string;
  number: string;
  partnerCode: string;
  contactName: string;
  description: string;
  headerAccount: string;
  toWarehouseId: string;
  originalDocuments: string;
}

interface Initial {
  header: HeaderDraft;
  lines: LineDraft[];
  version?: number;
  status?: VoucherRow["status"];
}

let seq = 0;
const blankLine = (account: string, warehouseId: string): LineDraft => ({
  key: `s${++seq}`,
  itemCode: "",
  description: "",
  uom: "",
  warehouseId,
  quantity: "",
  unitPrice: "",
  amount: "",
  account,
});
const num = (s: string) => (s.trim() === "" ? null : parseAmount(s));

/** Phiếu nhập kho (PNK), xuất kho (PXK), xuất điều chuyển (PDC) */
export function StockEditor({ cfg, id, onClose }: { cfg: VoucherUiConfig; id: string | null; onClose: () => void }) {
  const { tenant } = useTenantCtx();
  const partners = usePartners(tenant.id);
  const items = useItems(tenant.id);
  const warehouses = useWarehouses(tenant.id);
  const existing = useVoucher(id ?? undefined);
  if (!items.data || !warehouses.data || !partners.data || (id && !existing.data)) return <Empty>Đang tải chứng từ...</Empty>;

  const defaults = stockDefaults(tenant.regime);
  const mainWarehouse = (warehouses.data.find((w) => w.code === "KHO") ?? warehouses.data[0])?.id ?? "";
  let initial: Initial;
  if (id && existing.data) {
    const v = fromVoucherRow(existing.data as VoucherWithLines);
    const itemCode = (iid: string | null | undefined) => (iid && items.data?.find((i) => i.id === iid)?.code) || "";
    initial = {
      version: v.version,
      status: v.status,
      header: {
        postingDate: v.postingDate,
        number: v.number ?? "",
        partnerCode: (v.partnerId && partners.data.find((p) => p.id === v.partnerId)?.code) || "",
        contactName: v.contactName ?? "",
        description: v.description ?? "",
        headerAccount: v.headerAccount ?? cfg.defaultHeaderAccount ?? "",
        toWarehouseId: v.toWarehouseId ?? "",
        originalDocuments: v.originalDocuments ?? "",
      },
      lines: v.lines.map((l) => ({
        key: `s${++seq}`,
        itemCode: itemCode(l.itemId),
        description: l.description ?? "",
        uom: l.uom ?? "",
        warehouseId: l.warehouseId ?? "",
        quantity: l.quantity == null ? "" : formatAmount(l.quantity, { decimals: Number.isInteger(l.quantity) ? 0 : 2 }),
        unitPrice: l.unitPrice == null ? "" : formatAmount(l.unitPrice),
        amount: formatAmount(l.amount),
        account: (cfg.stock === "receipt" ? l.debitAccount : l.creditAccount) ?? defaults.inventoryAccount,
        saved: l.amount,
      })),
    };
  } else {
    initial = {
      header: {
        postingDate: todayVN(),
        number: "",
        partnerCode: "",
        contactName: "",
        description: "",
        headerAccount: cfg.defaultHeaderAccount ?? "",
        toWarehouseId: "",
        originalDocuments: "",
      },
      lines: [blankLine(defaults.inventoryAccount, mainWarehouse)],
    };
  }
  return <StockForm cfg={cfg} id={id} initial={initial} items={items.data} mainWarehouse={mainWarehouse} onClose={onClose} />;
}

function StockForm({
  cfg,
  id,
  initial,
  items,
  mainWarehouse,
  onClose,
}: {
  cfg: VoucherUiConfig;
  id: string | null;
  initial: Initial;
  items: ItemRow[];
  mainWarehouse: string;
  onClose: () => void;
}) {
  const { tenant, role } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const partners = usePartners(tenant.id);
  const warehouses = useWarehouses(tenant.id);
  const save = useSaveVoucher(tenant.id, platform);
  const listId = useId();
  const defaults = stockDefaults(tenant.regime);
  const receipt = cfg.stock === "receipt";
  const transfer = cfg.stock === "transfer";

  const [header, setHeader] = useState<HeaderDraft>(initial.header);
  const [lines, setLines] = useState<LineDraft[]>(initial.lines);
  const status = initial.status;
  const readOnly = status === "posted" || status === "cancelled" || role === "viewer" || role === "cashier";
  const balances = useStockBalances(tenant.id, header.postingDate || null);

  const byCode = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.code, a])), [accounts.data]);
  const itemByCode = useMemo(() => new Map(items.map((i) => [i.code.toUpperCase(), i])), [items]);
  const partnerByCode = useMemo(() => new Map((partners.data ?? []).map((p) => [p.code.toUpperCase(), p])), [partners.data]);
  const activeWarehouses = (warehouses.data ?? []).filter((w) => w.is_active);
  const partner = partnerByCode.get(header.partnerCode.trim().toUpperCase());

  /** Tồn của mặt hàng tại kho, và tổng mọi kho (giá bình quân) — đến ngày hạch toán, chưa tính phiếu này */
  const stockOf = (itemId: string | undefined, warehouseId: string) => {
    const rows = (balances.data ?? []).filter((b) => b.item_id === itemId);
    const here = rows.find((b) => b.warehouse_id === warehouseId);
    const first = rows[0];
    return {
      quantity: Number(here?.quantity ?? 0),
      item: { quantity: Number(first?.item_quantity ?? 0), amount: Number(first?.item_amount ?? 0) },
    };
  };

  const computed = lines.map((l) => {
    const it = itemByCode.get(l.itemCode.trim().toUpperCase());
    const qty = num(l.quantity) ?? 0;
    const stock = stockOf(it?.id, l.warehouseId);
    let amount: number;
    if (status === "posted" && l.saved !== undefined) amount = l.saved;
    else if (receipt) amount = num(l.unitPrice) !== null && qty ? roundAmount(qty * (num(l.unitPrice) ?? 0)) : (num(l.amount) ?? 0);
    else amount = estimateIssueCost(stock.item, qty);
    return { draft: l, item: it, qty, amount, stock };
  });
  const used = computed.filter((c) => c.draft.itemCode.trim());
  const total = used.reduce((s, c) => s + c.amount, 0);

  const problems: string[] = [];
  used.forEach((c, i) => {
    const n = i + 1;
    if (!c.item) problems.push(`Dòng ${n}: chưa có mã hàng ${c.draft.itemCode}`);
    else if (!c.item.track_inventory) problems.push(`Dòng ${n}: ${c.item.code} không theo dõi tồn kho`);
    if (!c.draft.warehouseId) problems.push(`Dòng ${n}: chưa chọn kho`);
    if (c.qty <= 0) problems.push(`Dòng ${n}: chưa nhập số lượng`);
    if (receipt && c.amount <= 0) problems.push(`Dòng ${n}: chưa nhập đơn giá / thành tiền`);
    if (!receipt && status !== "posted" && c.item && c.qty > c.stock.quantity)
      problems.push(`Dòng ${n}: ${c.item.code} tại kho chỉ còn ${formatAmount(c.stock.quantity, { decimals: Number.isInteger(c.stock.quantity) ? 0 : 2 })} ${c.item.uom}`);
    if (transfer && c.draft.warehouseId && c.draft.warehouseId === header.toWarehouseId) problems.push(`Dòng ${n}: kho xuất trùng kho nhập`);
  });
  if (!used.length) problems.push("Chưa có dòng hàng");
  if (!transfer && !header.headerAccount.trim()) problems.push(`Chưa nhập ${cfg.headerAccountLabel ?? "tài khoản"}`);
  if (transfer && !header.toWarehouseId) problems.push("Chưa chọn kho nhập");

  function toInput(): VoucherInput & { id?: string; version?: number } {
    return {
      ...(id ? { id } : {}),
      ...(initial.version ? { version: initial.version } : {}),
      voucherType: cfg.type,
      ...(header.number ? { number: header.number } : {}),
      issueDate: header.postingDate,
      postingDate: header.postingDate,
      partnerId: partner?.id ?? null,
      ...(partner ? { partnerName: partner.name } : {}),
      contactName: header.contactName,
      description: header.description,
      headerAccount: transfer ? null : header.headerAccount.trim(),
      originalDocuments: header.originalDocuments,
      toWarehouseId: transfer ? header.toWarehouseId || null : null,
      lines: used.map((c, i) => {
        const base = {
          lineNo: i + 1,
          itemId: c.item?.id ?? null,
          warehouseId: c.draft.warehouseId || null,
          quantity: c.qty,
          amount: c.amount,
          ...(c.draft.uom ? { uom: c.draft.uom } : {}),
          description: c.draft.description || c.item?.name || header.description,
          partnerId: partner?.id ?? null,
        };
        const acc = c.draft.account.trim();
        if (receipt) return { ...base, debitAccount: acc, ...(num(c.draft.unitPrice) !== null ? { unitPrice: num(c.draft.unitPrice) } : {}) };
        if (transfer) return { ...base, debitAccount: acc, creditAccount: acc };
        return { ...base, creditAccount: acc };
      }),
    };
  }

  async function submit(post: boolean) {
    try {
      await save.mutateAsync({ voucher: toInput(), post });
      toast.success(post ? "Đã lưu và ghi sổ" : "Đã lưu chứng từ");
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickItem(key: string, code: string) {
    const it = itemByCode.get(code.trim().toUpperCase());
    setLine(key, {
      itemCode: code,
      ...(it
        ? {
            description: it.name,
            uom: it.uom,
            account: it.inventory_account || defaults.inventoryAccount,
            ...(it.default_warehouse_id ? { warehouseId: it.default_warehouse_id } : {}),
            ...(receipt && it.purchase_price != null ? { unitPrice: formatAmount(Number(it.purchase_price)) } : {}),
          }
        : {}),
    });
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
      <datalist id={`${listId}-item`}>
        {items
          .filter((i) => i.is_active && i.track_inventory)
          .map((i) => (
            <option key={i.id} value={i.code}>
              {i.name}
            </option>
          ))}
      </datalist>
      <datalist id={`${listId}-partner`}>
        {(partners.data ?? []).map((p) => (
          <option key={p.id} value={p.code}>
            {p.name}
          </option>
        ))}
      </datalist>
      <datalist id={`${listId}-acc`}>
        {(accounts.data ?? [])
          .filter((a) => a.is_postable && a.is_active)
          .map((a) => (
            <option key={a.code} value={a.code}>
              {a.name}
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
          <Input list={`${listId}-partner`} value={header.partnerCode} disabled={readOnly} onChange={(e) => setHeader({ ...header, partnerCode: e.target.value })} />
          <PartnerName p={partner} />
        </Field>
        <Field label={cfg.contactLabel}>
          <Input value={header.contactName} disabled={readOnly} onChange={(e) => setHeader({ ...header, contactName: e.target.value })} />
        </Field>
        <Field label="Ngày hạch toán">
          <Input type="date" value={header.postingDate} disabled={readOnly} onChange={(e) => setHeader({ ...header, postingDate: e.target.value })} />
        </Field>
        <Field label="Số chứng từ" hint="Trống: tự cấp">
          <Input value={header.number} disabled={readOnly} placeholder="Tự động" onChange={(e) => setHeader({ ...header, number: e.target.value })} />
        </Field>
        {transfer ? (
          <Field label="Kho nhập" className="md:col-span-2">
            <Select aria-label="Kho nhập" value={header.toWarehouseId} disabled={readOnly} onChange={(e) => setHeader({ ...header, toWarehouseId: e.target.value })}>
              <option value="">— Chọn kho nhập —</option>
              {activeWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label={cfg.headerAccountLabel ?? "Tài khoản"} className="md:col-span-2">
            <Input list={`${listId}-acc`} value={header.headerAccount} disabled={readOnly} onChange={(e) => setHeader({ ...header, headerAccount: e.target.value.trim() })} />
            <AccountName a={byCode.get(header.headerAccount)} />
          </Field>
        )}
        <Field label={cfg.descriptionLabel} className="md:col-span-4">
          <Input value={header.description} disabled={readOnly} onChange={(e) => setHeader({ ...header, description: e.target.value })} />
        </Field>
        <Field label="Kèm theo chứng từ gốc" className="md:col-span-2">
          <Input value={header.originalDocuments} disabled={readOnly} onChange={(e) => setHeader({ ...header, originalDocuments: e.target.value })} />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-xs text-navy-700">
            <tr>
              <th className="w-8 px-2 py-1.5 text-left">#</th>
              <th className="w-36 px-2 text-left">Mã hàng</th>
              <th className="min-w-52 px-2 text-left">Tên hàng</th>
              <th className="w-16 px-2 text-left">Đvt</th>
              <th className="w-44 px-2 text-left">{transfer ? "Kho xuất" : "Kho"}</th>
              <th className="w-24 px-2 text-right">Tồn</th>
              <th className="w-28 px-2 text-right">Số lượng</th>
              <th className="w-32 px-2 text-right">{receipt ? "Đơn giá" : "Giá bình quân"}</th>
              <th className="w-36 px-2 text-right">{receipt ? "Thành tiền" : status === "posted" ? "Giá vốn" : "Giá vốn (ước tính)"}</th>
              <th className="w-24 px-2 text-left">{cfg.lineAccountLabel}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {computed.map((c, i) => {
              const l = c.draft;
              const n = i + 1;
              const avg = c.stock.item.quantity > 0 ? c.stock.item.amount / c.stock.item.quantity : 0;
              return (
                <tr key={l.key} className="border-t border-line">
                  <td className="px-2 text-muted">{n}</td>
                  <td className="px-1 py-1">
                    <Input list={`${listId}-item`} aria-label={`Mã hàng dòng ${n}`} value={l.itemCode} disabled={readOnly} onChange={(e) => pickItem(l.key, e.target.value)} />
                  </td>
                  <td className="px-1">
                    <Input aria-label={`Tên hàng dòng ${n}`} value={l.description} disabled={readOnly} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                  </td>
                  <td className="px-1">
                    <Input value={l.uom} disabled={readOnly} onChange={(e) => setLine(l.key, { uom: e.target.value })} />
                  </td>
                  <td className="px-1">
                    <Select aria-label={`Kho dòng ${n}`} value={l.warehouseId} disabled={readOnly} onChange={(e) => setLine(l.key, { warehouseId: e.target.value })}>
                      <option value="">—</option>
                      {activeWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="num px-2 text-right text-xs text-muted" data-testid={`ton-${n}`}>
                    {c.item ? formatAmount(c.stock.quantity, { decimals: Number.isInteger(c.stock.quantity) ? 0 : 2 }) : ""}
                  </td>
                  <td className="px-1">
                    <AmountInput value={l.quantity} disabled={readOnly} label={`Số lượng dòng ${n}`} onChange={(v) => setLine(l.key, { quantity: v })} />
                  </td>
                  <td className="px-1">
                    {receipt ? (
                      <AmountInput value={l.unitPrice} disabled={readOnly} label={`Đơn giá dòng ${n}`} onChange={(v) => setLine(l.key, { unitPrice: v, amount: "" })} />
                    ) : (
                      <div className="num px-1 text-right text-xs text-muted">{c.item ? formatAmount(status === "posted" && c.qty ? c.amount / c.qty : avg) : ""}</div>
                    )}
                  </td>
                  <td className="px-1">
                    {receipt ? (
                      <AmountInput
                        value={num(l.unitPrice) !== null ? formatAmount(c.amount) : l.amount}
                        disabled={readOnly || num(l.unitPrice) !== null}
                        label={`Thành tiền dòng ${n}`}
                        onChange={(v) => setLine(l.key, { amount: v })}
                      />
                    ) : (
                      <div className="num px-1 text-right font-medium" data-testid={`gia-von-${n}`}>
                        {formatAmount(c.amount)}
                      </div>
                    )}
                  </td>
                  <td className="px-1">
                    <Input list={`${listId}-acc`} value={l.account} disabled={readOnly} onChange={(e) => setLine(l.key, { account: e.target.value.trim() })} />
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
            <Button
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={() => setLines([...lines, blankLine(defaults.inventoryAccount, lines.at(-1)?.warehouseId || mainWarehouse)])}
            >
              Thêm dòng
            </Button>
          ) : null}
          {!readOnly && used.length && problems.length ? (
            <ul className="mt-1 text-danger">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {!receipt && status !== "posted" ? <p className="mt-1 text-muted">Giá vốn chính thức do AccEdu tính khi ghi sổ (bình quân theo phương pháp của đơn vị).</p> : null}
        </div>
        <div className="text-right">
          <div className="text-sm">
            Tổng tiền:{" "}
            <span className="num text-base font-semibold text-navy-700" data-testid="stock-total">
              {formatAmount(total)}
            </span>{" "}
            VND
          </div>
          <div className="text-xs italic text-muted">{total > 0 ? amountInWords(total) : ""}</div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
        {!readOnly ? (
          <>
            <Button variant="secondary" icon={<Save size={14} />} disabled={save.isPending || !used.length} onClick={() => void submit(false)}>
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
