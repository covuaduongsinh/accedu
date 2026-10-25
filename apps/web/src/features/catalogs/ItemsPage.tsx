import { api, friendlyError, qk, type ItemRow } from "@accedu/api";
import { useDb, useItems } from "@accedu/api/react";
import { ITEM_KINDS, VAT_CODES, itemSchema, parseAmount, formatAmount, type ItemInput, type VatCode } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { FileDown, FileUp, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Button, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { downloadXlsx } from "../../lib/export";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { ImportDialog } from "../import/ImportDialog";

const vatLabel = (code: string) => VAT_CODES[code as VatCode]?.label ?? code;

/** Danh mục hàng hóa, dịch vụ — sách, bàn cờ, đồ dùng, học phí theo lớp… dùng khi lập hóa đơn */
export function ItemsPage() {
  const { tenant, role } = useTenantCtx();
  const items = useItems(tenant.id);
  const [editing, setEditing] = useState<ItemRow | "new" | null>(null);
  const [selected, setSelected] = useState<ItemRow | null>(null);
  const [importing, setImporting] = useState(false);
  const canEdit = canPost(role);

  const cols = useMemo<ColDef<ItemRow>[]>(
    () => [
      { field: "code", headerName: "Mã hàng", width: 130 },
      { field: "name", headerName: "Tên hàng, dịch vụ", flex: 2, minWidth: 240 },
      { field: "kind", headerName: "Loại", width: 110, valueFormatter: (p) => ITEM_KINDS[p.value as ItemRow["kind"]] ?? "" },
      { field: "uom", headerName: "Đvt", width: 80 },
      amountCol("sale_price", "Giá bán", { width: 130 }),
      amountCol("purchase_price", "Giá mua", { width: 130 }),
      { field: "vat_code", headerName: "Thuế suất", width: 140, valueFormatter: (p) => vatLabel(String(p.value ?? "")) },
      { field: "revenue_account", headerName: "TK doanh thu", width: 120 },
      { field: "inventory_account", headerName: "TK kho / chi phí", width: 130 },
      { field: "group_code", headerName: "Nhóm", width: 110 },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Danh mục hàng hóa, dịch vụ"
        subtitle={`${items.data?.length ?? 0} mã · dùng khi lập hóa đơn bán/mua (tự điền tên, đvt, giá, tài khoản, thuế suất)`}
        actions={
          <>
            {canEdit ? (
              <>
                <Button icon={<Plus size={14} />} onClick={() => setEditing("new")}>
                  Mới
                </Button>
                <Button variant="secondary" icon={<Pencil size={14} />} disabled={!selected} onClick={() => selected && setEditing(selected)}>
                  Sửa
                </Button>
                <Button variant="secondary" icon={<FileUp size={14} />} onClick={() => setImporting(true)}>
                  Nhập từ Excel
                </Button>
              </>
            ) : null}
            <Button
              variant="secondary"
              icon={<FileDown size={14} />}
              onClick={() =>
                downloadXlsx(
                  `hang-hoa-${tenant.slug}.xlsx`,
                  ["Mã hàng", "Tên hàng", "Loại", "Đvt", "Mã thuế", "Giá bán", "Giá mua", "Tk doanh thu", "Tk kho", "Nhóm", "Mã vạch"],
                  (items.data ?? []).map((i) => [
                    i.code,
                    i.name,
                    ITEM_KINDS[i.kind],
                    i.uom,
                    i.vat_code,
                    i.sale_price === null ? "" : Number(i.sale_price),
                    i.purchase_price === null ? "" : Number(i.purchase_price),
                    i.revenue_account ?? "",
                    i.inventory_account ?? "",
                    i.group_code ?? "",
                    i.barcode ?? "",
                  ]),
                )
              }
            >
              Xuất Excel
            </Button>
          </>
        }
      />
      <DataGrid<ItemRow>
        rowData={items.data ?? []}
        columnDefs={cols}
        loading={items.isLoading}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => canEdit && e.data && setEditing(e.data)}
      />
      <ImportDialog kind="items" open={importing} onClose={() => setImporting(false)} />
      <Modal open={editing !== null} title={editing === "new" ? "Thêm hàng hóa, dịch vụ" : "Sửa hàng hóa, dịch vụ"} onClose={() => setEditing(null)}>
        {editing !== null ? <ItemForm item={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  );
}

function ItemForm({ item, onDone }: { item: ItemRow | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    kind: item?.kind ?? ("goods" as ItemRow["kind"]),
    uom: item?.uom ?? "Cái",
    vatCode: (item?.vat_code as VatCode) ?? ("10" as VatCode),
    salePrice: item?.sale_price === null || item?.sale_price === undefined ? "" : formatAmount(Number(item.sale_price)),
    purchasePrice: item?.purchase_price === null || item?.purchase_price === undefined ? "" : formatAmount(Number(item.purchase_price)),
    revenueAccount: item?.revenue_account ?? "",
    inventoryAccount: item?.inventory_account ?? "",
    groupCode: item?.group_code ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function submit() {
    const input: ItemInput = {
      ...form,
      salePrice: form.salePrice.trim() ? parseAmount(form.salePrice) : null,
      purchasePrice: form.purchasePrice.trim() ? parseAmount(form.purchasePrice) : null,
    };
    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      await api.saveItem(db, tenant.id, parsed.data, item?.id);
      await qc.invalidateQueries({ queryKey: qk.items(tenant.id) });
      toast.success("Đã lưu");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Mã hàng">
        <Input value={form.code} disabled={!!item} autoFocus onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="SACH-NM" />
      </Field>
      <Field label="Loại">
        <Select
          value={form.kind}
          onChange={(e) => {
            const kind = e.target.value as ItemRow["kind"];
            set({ kind, ...(kind === "service" && form.vatCode === "10" ? { vatCode: "KCT" as VatCode } : {}) });
          }}
        >
          {Object.entries(ITEM_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tên hàng, dịch vụ" className="col-span-2">
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Sách cờ vua nhập môn" />
      </Field>
      <Field label="Đơn vị tính">
        <Input value={form.uom} onChange={(e) => set({ uom: e.target.value })} />
      </Field>
      <Field label="Thuế suất GTGT">
        <Select value={form.vatCode} onChange={(e) => set({ vatCode: e.target.value as VatCode })}>
          {Object.entries(VAT_CODES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Giá bán">
        <Input inputMode="decimal" className="num" value={form.salePrice} onChange={(e) => set({ salePrice: e.target.value })} />
      </Field>
      <Field label="Giá mua">
        <Input inputMode="decimal" className="num" value={form.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value })} />
      </Field>
      <Field label="TK doanh thu" hint="Trống: 5111 (hàng) / 5113 (dịch vụ)">
        <Input value={form.revenueAccount} onChange={(e) => set({ revenueAccount: e.target.value.trim() })} />
      </Field>
      <Field label="TK kho / chi phí khi mua" hint="Trống: 1561/156 (hàng) hoặc TK chi phí">
        <Input value={form.inventoryAccount} onChange={(e) => set({ inventoryAccount: e.target.value.trim() })} />
      </Field>
      <Field label="Nhóm">
        <Input value={form.groupCode} onChange={(e) => set({ groupCode: e.target.value.toUpperCase() })} />
      </Field>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={busy || !form.code || !form.name} onClick={() => void submit()}>
          Lưu
        </Button>
      </div>
    </div>
  );
}
