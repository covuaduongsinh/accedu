import { api, friendlyError, qk, type PartnerRow } from "@accedu/api";
import { useDb, usePartners } from "@accedu/api/react";
import { partnerSchema, type PartnerInput } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { FileDown, FileUp, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid } from "../../components/DataGrid";
import { Button, Field, Input, Modal, PageHeader } from "../../components/ui";
import { downloadXlsx } from "../../lib/export";
import { ImportDialog } from "../import/ImportDialog";
import { canPost, useTenantCtx } from "../../lib/tenant";

export function PartnersPage({ kind }: { kind: "customer" | "supplier" }) {
  const { tenant, role } = useTenantCtx();
  const partners = usePartners(tenant.id);
  const [editing, setEditing] = useState<PartnerRow | "new" | null>(null);
  const [selected, setSelected] = useState<PartnerRow | null>(null);
  const rows = (partners.data ?? []).filter((p) => (kind === "customer" ? p.is_customer || p.is_student : p.is_supplier));
  const [importing, setImporting] = useState(false);
  const canEdit = canPost(role);
  const title = kind === "customer" ? "Danh mục khách hàng" : "Danh mục nhà cung cấp";

  const cols = useMemo<ColDef<PartnerRow>[]>(
    () => [
      { field: "code", headerName: "Mã", width: 120 },
      { field: "name", headerName: "Tên", flex: 2, minWidth: 220 },
      { field: "tax_code", headerName: "Mã số thuế", width: 140 },
      { field: "phone", headerName: "Điện thoại", width: 130 },
      { field: "email", headerName: "Email", width: 200 },
      { field: "address", headerName: "Địa chỉ", flex: 2, minWidth: 220 },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Dùng chung cho khách hàng, nhà cung cấp, nhân viên, học viên"
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
                  `${kind === "customer" ? "khach-hang" : "nha-cung-cap"}-${tenant.slug}.xlsx`,
                  ["Mã", "Tên", "Mã số thuế", "Điện thoại", "Email", "Địa chỉ", "Người liên hệ", "Loại"],
                  rows.map((p) => [p.code, p.name, p.tax_code ?? "", p.phone ?? "", p.email ?? "", p.address ?? "", p.contact_name ?? "", partnerTypes(p)]),
                )
              }
            >
              Xuất Excel
            </Button>
          </>
        }
      />
      <DataGrid<PartnerRow>
        rowData={rows}
        columnDefs={cols}
        loading={partners.isLoading}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => canEdit && e.data && setEditing(e.data)}
      />
      <ImportDialog kind="partners" partnerDefault={kind} open={importing} onClose={() => setImporting(false)} />
      <Modal open={editing !== null} title={editing === "new" ? `${title} — thêm mới` : "Sửa đối tượng"} onClose={() => setEditing(null)}>
        {editing !== null ? <PartnerForm partner={editing === "new" ? null : editing} kind={kind} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  );
}

/** "KH,NCC" — cùng ký hiệu cột Loại của mẫu nhập Excel để xuất ra rồi nhập lại được */
function partnerTypes(p: PartnerRow): string {
  return [p.is_customer && "KH", p.is_supplier && "NCC", p.is_employee && "NV", p.is_student && "HV"].filter(Boolean).join(",");
}

function PartnerForm({ partner, kind, onDone }: { partner: PartnerRow | null; kind: "customer" | "supplier"; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [form, setForm] = useState<PartnerInput>({
    code: partner?.code ?? "",
    name: partner?.name ?? "",
    taxCode: partner?.tax_code ?? "",
    address: partner?.address ?? "",
    phone: partner?.phone ?? "",
    email: partner?.email ?? "",
    isCustomer: partner?.is_customer ?? kind === "customer",
    isSupplier: partner?.is_supplier ?? kind === "supplier",
    isEmployee: partner?.is_employee ?? false,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PartnerInput>) => setForm({ ...form, ...patch });

  async function submit() {
    const parsed = partnerSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      await api.savePartner(db, tenant.id, parsed.data, partner?.id);
      await qc.invalidateQueries({ queryKey: qk.partners(tenant.id) });
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
      <Field label="Mã">
        <Input value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} disabled={!!partner} autoFocus />
      </Field>
      <Field label="Mã số thuế">
        <Input value={form.taxCode ?? ""} onChange={(e) => set({ taxCode: e.target.value })} />
      </Field>
      <Field label="Tên" className="col-span-2">
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Địa chỉ" className="col-span-2">
        <Input value={form.address ?? ""} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <Field label="Điện thoại">
        <Input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
      </Field>
      <Field label="Email">
        <Input value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <div className="col-span-2 flex gap-4 text-sm">
        {(
          [
            ["isCustomer", "Khách hàng"],
            ["isSupplier", "Nhà cung cấp"],
            ["isEmployee", "Nhân viên"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!form[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={busy} onClick={() => void submit()}>
          Lưu
        </Button>
      </div>
    </div>
  );
}
