import { api, friendlyError, type StockCardRow, type StockSummaryRow } from "@accedu/api";
import { useDb, useItems, useStockCard, useStockSummary, useStockVsLedger, useWarehouses } from "@accedu/api/react";
import { COST_METHODS, costMethodOf, formatAmount, formatDateVN, type CostMethod } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { Calculator, FileDown } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "../../components/ui";
import { monthRange } from "../../lib/dates";
import { downloadXlsx } from "../../lib/export";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { ReportFilter } from "./ReportFilter";

const qty = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return n === 0 ? "" : formatAmount(n, { decimals: Number.isInteger(n) ? 0 : 2 });
};
const qtyCol = (field: string, headerName: string, extra: Partial<ColDef> = {}): ColDef => ({
  field,
  headerName,
  type: "rightAligned",
  width: 100,
  cellClass: "num",
  valueFormatter: (p: ValueFormatterParams) => qty(p.value),
  ...extra,
});

function WarehouseFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { tenant } = useTenantCtx();
  const warehouses = useWarehouses(tenant.id);
  return (
    <Field label="Kho">
      <Select aria-label="Lọc kho" value={value} onChange={(e) => onChange(e.target.value)} className="w-48">
        <option value="">Tất cả kho</option>
        {(warehouses.data ?? []).map((w) => (
          <option key={w.id} value={w.id}>
            {w.code} — {w.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Tổng hợp nhập – xuất – tồn (FAO: Tồn kho › Tổng hợp nhập xuất tồn) */
export function StockSummaryPage() {
  const { tenant, slug } = useTenantCtx();
  const navigate = useNavigate();
  const [range, setRange] = useState(monthRange());
  const [warehouse, setWarehouse] = useState("");
  const rows = useStockSummary(tenant.id, range.from, range.to, warehouse || null);
  const recon = useStockVsLedger(tenant.id, range.to);
  const data = rows.data ?? [];
  const sum = (k: keyof StockSummaryRow) => data.reduce((s, r) => s + Number(r[k] ?? 0), 0);

  const cols = useMemo<ColDef<StockSummaryRow>[]>(
    () => [
      { field: "item_code", headerName: "Mã hàng", width: 120 },
      { field: "item_name", headerName: "Tên hàng", flex: 2, minWidth: 220 },
      { field: "uom", headerName: "Đvt", width: 75 },
      { field: "account", headerName: "TK", width: 75 },
      qtyCol("opening_qty", "Tồn đầu"),
      amountCol("opening_amount", "Giá trị đầu", { width: 130 }),
      qtyCol("in_qty", "Nhập"),
      amountCol("in_amount", "Giá trị nhập", { width: 130 }),
      qtyCol("out_qty", "Xuất"),
      amountCol("out_amount", "Giá trị xuất", { width: 130 }),
      qtyCol("closing_qty", "Tồn cuối", { cellClass: "num font-semibold" }),
      amountCol("closing_amount", "Giá trị cuối", { width: 140, cellClass: "num font-semibold" }),
    ],
    [],
  );
  const diffs = (recon.data ?? []).filter((r) => Number(r.difference) !== 0);

  return (
    <div>
      <PageHeader
        title="Tổng hợp nhập – xuất – tồn"
        subtitle={`${formatDateVN(range.from)} – ${formatDateVN(range.to)} · ${data.length} mặt hàng · ${warehouse ? "một kho" : "mọi kho (không tính điều chuyển nội bộ)"} · nhấp đúp để xem thẻ kho`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadXlsx(
                `nhap-xuat-ton-${range.from}-${range.to}.xlsx`,
                ["Mã hàng", "Tên hàng", "Đvt", "TK", "Tồn đầu", "Giá trị đầu", "Nhập", "Giá trị nhập", "Xuất", "Giá trị xuất", "Tồn cuối", "Giá trị cuối"],
                data.map((r) => [
                  r.item_code,
                  r.item_name,
                  r.uom,
                  r.account,
                  Number(r.opening_qty),
                  Number(r.opening_amount),
                  Number(r.in_qty),
                  Number(r.in_amount),
                  Number(r.out_qty),
                  Number(r.out_amount),
                  Number(r.closing_qty),
                  Number(r.closing_amount),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <WarehouseFilter value={warehouse} onChange={setWarehouse} />
      </ReportFilter>
      <DataGrid<StockSummaryRow>
        rowData={data}
        columnDefs={cols}
        loading={rows.isLoading}
        height="calc(100vh - 330px)"
        getRowId={(p) => (p.data.item_id ? `${p.data.item_id}|${p.data.account}` : "__total")}
        onRowDoubleClicked={(e) =>
          e.data?.item_id &&
          void navigate({
            to: "/$tenant/$",
            params: { tenant: slug, _splat: "inventory/stock-card" },
            search: { item: e.data.item_code, from: range.from, to: range.to, ...(warehouse ? { warehouse } : {}) },
          })
        }
        pinnedBottomRowData={[
          {
            item_id: "",
            item_code: "",
            item_name: "Tổng cộng",
            uom: "",
            account: "",
            opening_qty: "",
            opening_amount: sum("opening_amount"),
            in_qty: "",
            in_amount: sum("in_amount"),
            out_qty: "",
            out_amount: sum("out_amount"),
            closing_qty: "",
            closing_amount: sum("closing_amount"),
          },
        ]}
      />
      {!warehouse ? (
        <p className="mt-2 text-xs" data-testid="stock-recon">
          Đối chiếu với sổ cái đến {formatDateVN(range.to)}:{" "}
          {diffs.length ? (
            diffs.map((r) => (
              <span key={r.account} className="mr-3">
                TK {r.account}: tồn kho <b className="num">{formatAmount(Number(r.stock_amount))}</b>, sổ cái <b className="num">{formatAmount(Number(r.ledger_amount))}</b>{" "}
                <Badge tone="gold">lệch {formatAmount(Number(r.difference))}</Badge>
              </span>
            ))
          ) : (
            <Badge tone="green">khớp</Badge>
          )}
          {diffs.length ? (
            <span className="text-muted"> — thường do số dư đầu kỳ TK 156 khác tồn kho đầu kỳ, hoặc hóa đơn mua ghi TK 156 nhưng chưa chọn mã hàng / kho.</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** Thẻ kho / sổ chi tiết vật tư của một mặt hàng */
export function StockCardPage() {
  const { tenant } = useTenantCtx();
  const search = useSearch({ strict: false }) as { item?: string; from?: string; to?: string; warehouse?: string };
  const items = useItems(tenant.id);
  const [itemCode, setItemCode] = useState(search.item ?? "");
  const [range, setRange] = useState(search.from && search.to ? { from: search.from, to: search.to } : monthRange());
  const [warehouse, setWarehouse] = useState(search.warehouse ?? "");
  const listId = useId();
  const item = (items.data ?? []).find((i) => i.code.toUpperCase() === itemCode.trim().toUpperCase());
  const rows = useStockCard(tenant.id, item?.id, range.from, range.to, warehouse || null);

  const cols = useMemo<ColDef<StockCardRow>[]>(
    () => [
      dateCol("posting_date", "Ngày", { valueFormatter: (p) => (p.data?.row_kind === "entry" ? formatDateVN(p.value as string) : "") }),
      { field: "voucher_number", headerName: "Số CT", width: 110 },
      { field: "description", headerName: "Diễn giải", flex: 2, minWidth: 240, cellClass: (p) => (p.data?.row_kind === "entry" ? "" : "font-semibold text-navy-700") },
      { field: "warehouse_code", headerName: "Kho", width: 90 },
      qtyCol("qty_in", "Nhập"),
      amountCol("amount_in", "Giá trị nhập", { width: 130 }),
      qtyCol("qty_out", "Xuất"),
      amountCol("amount_out", "Giá trị xuất", { width: 130 }),
      qtyCol("balance_qty", "Tồn", { cellClass: "num font-medium" }),
      amountCol("balance_amount", "Giá trị tồn", { width: 140, cellClass: "num font-medium" }),
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Thẻ kho / sổ chi tiết vật tư"
        subtitle={item ? `${item.code} — ${item.name} (${item.uom}) · ${formatDateVN(range.from)} – ${formatDateVN(range.to)}` : "Chọn mã hàng để xem thẻ kho"}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            disabled={!item}
            onClick={() =>
              downloadXlsx(
                `the-kho-${itemCode}-${range.from}-${range.to}.xlsx`,
                ["Ngày", "Số CT", "Diễn giải", "Kho", "Nhập", "Giá trị nhập", "Xuất", "Giá trị xuất", "Tồn", "Giá trị tồn"],
                (rows.data ?? []).map((r) => [
                  r.row_kind === "entry" ? r.posting_date : "",
                  r.voucher_number ?? "",
                  r.description ?? "",
                  r.warehouse_code ?? "",
                  Number(r.qty_in ?? 0),
                  Number(r.amount_in ?? 0),
                  Number(r.qty_out ?? 0),
                  Number(r.amount_out ?? 0),
                  Number(r.balance_qty),
                  Number(r.balance_amount),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <datalist id={listId}>
        {(items.data ?? [])
          .filter((i) => i.track_inventory)
          .map((i) => (
            <option key={i.id} value={i.code}>
              {i.name}
            </option>
          ))}
      </datalist>
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label="Mã hàng">
          <Input list={listId} value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="w-40" />
        </Field>
        <WarehouseFilter value={warehouse} onChange={setWarehouse} />
      </ReportFilter>
      <DataGrid<StockCardRow>
        rowData={item ? (rows.data ?? []) : []}
        columnDefs={cols}
        loading={rows.isLoading && !!item}
        height="calc(100vh - 290px)"
        getRowId={(p) => `${p.data.row_kind}-${p.data.line}`}
      />
    </div>
  );
}

/** Tính giá vốn hàng xuất kho: phương pháp đang dùng, tính lại từ ngày */
export function CostingPage() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const method = costMethodOf(tenant.costing_method);
  const [from, setFrom] = useState(tenant.start_date);
  const [busy, setBusy] = useState(false);
  const canManage = role === "owner" || role === "admin";

  async function recost() {
    setBusy(true);
    try {
      const n = await api.recostInventory(db, tenant.id, from);
      await qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] });
      await qc.invalidateQueries({ queryKey: ["report", tenant.id] });
      toast.success(n ? `Đã tính lại giá vốn — ${n} chứng từ thay đổi` : "Đã tính lại giá vốn — không có chứng từ nào thay đổi");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function switchMethod(next: CostMethod) {
    if (next === method) return;
    if (!window.confirm(`Đổi sang "${COST_METHODS[next]}"? AccEdu sẽ tính lại giá vốn mọi phiếu xuất chưa khóa sổ.`)) return;
    setBusy(true);
    try {
      const n = await api.setStockCostMethod(db, tenant.id, next);
      await qc.invalidateQueries({ queryKey: ["tenant"] });
      await qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] });
      await qc.invalidateQueries({ queryKey: ["report", tenant.id] });
      toast.success(`Đã đổi phương pháp tính giá — ${n} chứng từ được tính lại`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Tính giá vốn hàng xuất kho" subtitle="Giá vốn phiếu xuất, điều chuyển tính theo giá bình quân của từng mặt hàng (chung mọi kho)" />
      <Card title="Phương pháp tính giá">
        <div className="space-y-2 text-sm">
          {(Object.keys(COST_METHODS) as CostMethod[]).map((m) => (
            <label key={m} className="flex items-start gap-2">
              <input type="radio" name="cost-method" checked={method === m} disabled={!canManage || busy} onChange={() => void switchMethod(m)} />
              <span>
                <b>{COST_METHODS[m]}</b>
                <span className="block text-xs text-muted">
                  {m === "moving"
                    ? "Giá xuất = giá trị tồn ÷ số lượng tồn ngay trước khi xuất. Số liệu có ngay khi ghi sổ."
                    : "Giá xuất = (giá trị tồn đầu tháng + nhập trong tháng) ÷ số lượng tương ứng. Giữa tháng là giá tạm, chốt đúng khi hết tháng."}
                </span>
              </span>
            </label>
          ))}
          {!canManage ? <p className="text-xs text-muted">Chỉ chủ sở hữu / quản trị đổi được phương pháp.</p> : null}
        </div>
      </Card>
      <Card title="Tính lại giá vốn">
        <p className="mb-2 text-sm text-muted">
          AccEdu tự tính lại mỗi khi ghi sổ hoặc bỏ ghi sổ chứng từ kho (kể cả nhập lùi ngày). Dùng nút này sau khi sửa tồn kho đầu kỳ hoặc khi cần kiểm tra lại. Kỳ đã khóa
          sổ giữ nguyên.
        </p>
        <div className="flex items-end gap-2">
          <Field label="Từ ngày">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Button icon={<Calculator size={14} />} disabled={!canPost(role) || busy || !from} onClick={() => void recost()}>
            Tính lại giá vốn
          </Button>
        </div>
      </Card>
    </div>
  );
}
