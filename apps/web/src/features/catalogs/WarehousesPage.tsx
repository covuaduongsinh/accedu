import { api, friendlyError, qk, type WarehouseRow } from "@accedu/api";
import { useDb, useWarehouses } from "@accedu/api/react";
import { warehouseSchema } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid } from "../../components/DataGrid";
import { Button, Field, Input, Modal, PageHeader } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";

/** Danh mục kho — Kho chính (KHO) có sẵn; thêm kho CLB, kho hiệu sách… khi cần theo dõi tồn riêng */
export function WarehousesPage() {
  const { tenant, role } = useTenantCtx();
  const warehouses = useWarehouses(tenant.id);
  const [editing, setEditing] = useState<WarehouseRow | "new" | null>(null);
  const [selected, setSelected] = useState<WarehouseRow | null>(null);
  const canEdit = canPost(role);

  const cols = useMemo<ColDef<WarehouseRow>[]>(
    () => [
      { field: "code", headerName: "Mã kho", width: 130 },
      { field: "name", headerName: "Tên kho", flex: 1, minWidth: 220 },
      { field: "address", headerName: "Địa chỉ", flex: 2, minWidth: 240 },
      { field: "is_active", headerName: "Đang dùng", width: 110, valueFormatter: (p) => (p.value ? "✓" : "") },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Danh mục kho"
        subtitle={`${warehouses.data?.length ?? 0} kho · chọn kho trên phiếu nhập, xuất, điều chuyển và hóa đơn mua`}
        actions={
          canEdit ? (
            <>
              <Button icon={<Plus size={14} />} onClick={() => setEditing("new")}>
                Mới
              </Button>
              <Button variant="secondary" icon={<Pencil size={14} />} disabled={!selected} onClick={() => selected && setEditing(selected)}>
                Sửa
              </Button>
            </>
          ) : null
        }
      />
      <DataGrid<WarehouseRow>
        rowData={warehouses.data ?? []}
        columnDefs={cols}
        loading={warehouses.isLoading}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => canEdit && e.data && setEditing(e.data)}
      />
      <Modal open={editing !== null} title={editing === "new" ? "Thêm kho" : "Sửa kho"} onClose={() => setEditing(null)}>
        {editing !== null ? <WarehouseForm warehouse={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  );
}

function WarehouseForm({ warehouse, onDone }: { warehouse: WarehouseRow | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: warehouse?.code ?? "",
    name: warehouse?.name ?? "",
    address: warehouse?.address ?? "",
    isActive: warehouse?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = warehouseSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      await api.saveWarehouse(db, tenant.id, parsed.data, warehouse?.id);
      await qc.invalidateQueries({ queryKey: qk.warehouses(tenant.id) });
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
      <Field label="Mã kho">
        <Input value={form.code} disabled={!!warehouse} autoFocus onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="KHO-CLB" />
      </Field>
      <Field label="Tên kho">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kho CLB Dương Sinh" />
      </Field>
      <Field label="Địa chỉ" className="col-span-2">
        <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Đang dùng
      </label>
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
