import { api, friendlyError, qk, type JobRow } from "@accedu/api";
import { useDb, useJobs } from "@accedu/api/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, dateCol } from "../../components/DataGrid";
import { Button, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { useTenantCtx } from "../../lib/tenant";

const KIND: Record<JobRow["kind"], string> = {
  class: "Lớp học",
  course: "Khóa học",
  event: "Sự kiện / giải đấu",
  project: "Dự án / công trình",
  contract: "Hợp đồng",
};

/** Công trình, vụ việc — Dương Sinh dùng cho lớp học (Tốt → Vua), khóa học, giải đấu */
export function JobsPage() {
  const { tenant, role } = useTenantCtx();
  const jobs = useJobs(tenant.id);
  const [editing, setEditing] = useState<JobRow | "new" | null>(null);
  const [selected, setSelected] = useState<JobRow | null>(null);
  const canEdit = role !== "viewer" && role !== "cashier";

  const cols = useMemo<ColDef<JobRow>[]>(
    () => [
      { field: "code", headerName: "Mã", width: 130 },
      { field: "name", headerName: "Tên", flex: 2, minWidth: 240 },
      { field: "kind", headerName: "Loại", width: 170, valueFormatter: (p) => KIND[p.value as JobRow["kind"]] },
      dateCol("start_date", "Bắt đầu"),
      dateCol("end_date", "Kết thúc"),
      { field: "is_active", headerName: "Đang dùng", width: 110, valueFormatter: (p) => (p.value ? "✓" : "") },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Công trình, vụ việc"
        subtitle="Theo dõi doanh thu – chi phí theo lớp học, khóa học, giải đấu"
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
      <DataGrid<JobRow>
        rowData={jobs.data ?? []}
        columnDefs={cols}
        loading={jobs.isLoading}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => canEdit && e.data && setEditing(e.data)}
      />
      <Modal open={editing !== null} title={editing === "new" ? "Thêm vụ việc" : "Sửa vụ việc"} onClose={() => setEditing(null)}>
        {editing !== null ? <JobForm job={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  );
}

function JobForm({ job, onDone }: { job: JobRow | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: job?.code ?? "",
    name: job?.name ?? "",
    kind: job?.kind ?? ("class" as JobRow["kind"]),
    start_date: job?.start_date ?? "",
    end_date: job?.end_date ?? "",
    is_active: job?.is_active ?? true,
  });

  async function submit() {
    try {
      await api.saveJob(
        db,
        tenant.id,
        { ...form, start_date: form.start_date || null, end_date: form.end_date || null },
        job?.id,
      );
      await qc.invalidateQueries({ queryKey: qk.jobs(tenant.id) });
      toast.success("Đã lưu");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Mã">
        <Input value={form.code} disabled={!!job} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="TOT-K12" autoFocus />
      </Field>
      <Field label="Loại">
        <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as JobRow["kind"] })}>
          {Object.entries(KIND).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tên" className="col-span-2">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lớp Tốt K12 — sáng thứ 7" />
      </Field>
      <Field label="Bắt đầu">
        <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
      </Field>
      <Field label="Kết thúc">
        <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Đang sử dụng
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={!form.code || !form.name} onClick={() => void submit()}>
          Lưu
        </Button>
      </div>
    </div>
  );
}
