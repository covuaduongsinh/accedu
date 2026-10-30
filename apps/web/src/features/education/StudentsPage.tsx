import { api, friendlyError, qk, type StudentRow } from "@accedu/api";
import { useClasses, useDb, useEnrollments, useStudents } from "@accedu/api/react";
import { CHESS_LEVELS, studentSchema, todayVN, type ChessLevel } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { FileUp, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, dateCol } from "../../components/DataGrid";
import { Button, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { ImportDialog } from "../import/ImportDialog";

type Row = StudentRow & { classes: string };

/** Danh sách học viên (đối tượng là học viên) kèm hồ sơ: phụ huynh, cấp Tốt → Vua, lớp đang học */
export function StudentsPage() {
  const { tenant, role } = useTenantCtx();
  const students = useStudents(tenant.id);
  const classes = useClasses(tenant.id);
  const enrollments = useEnrollments(tenant.id);
  const [editing, setEditing] = useState<StudentRow | "new" | null>(null);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [importing, setImporting] = useState(false);
  const canEdit = canPost(role);

  const rows = useMemo<Row[]>(() => {
    const classCode = new Map((classes.data ?? []).map((c) => [c.job_id, c.jobs.code]));
    const active = new Map<string, string[]>();
    for (const e of enrollments.data ?? []) {
      if (e.status !== "active" && e.status !== "paused") continue;
      active.set(e.student_id, [...(active.get(e.student_id) ?? []), classCode.get(e.class_id) ?? ""]);
    }
    return (students.data ?? []).map((s) => ({ ...s, classes: (active.get(s.id) ?? []).join(", ") }));
  }, [students.data, classes.data, enrollments.data]);

  const cols = useMemo<ColDef<Row>[]>(
    () => [
      { field: "code", headerName: "Mã HV", width: 110 },
      { field: "name", headerName: "Họ tên", flex: 2, minWidth: 200 },
      dateCol("student_profiles.birth_date", "Ngày sinh"),
      {
        field: "student_profiles.level",
        headerName: "Cấp",
        width: 90,
        valueFormatter: (p) => (p.value ? CHESS_LEVELS[p.value as ChessLevel] : ""),
      },
      { field: "classes", headerName: "Lớp đang học", width: 160 },
      { field: "student_profiles.guardian_name", headerName: "Phụ huynh", flex: 1, minWidth: 160 },
      { headerName: "Điện thoại", width: 130, valueGetter: (p) => p.data?.student_profiles?.guardian_phone ?? p.data?.phone ?? "" },
      { field: "email", headerName: "Email phụ huynh", width: 190 },
      { field: "student_profiles.school", headerName: "Trường", width: 160 },
      { field: "is_active", headerName: "Đang học", width: 100, valueFormatter: (p) => (p.value ? "✓" : "") },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Học viên"
        subtitle={`${rows.length} học viên · cấp Tốt → Vua · học viên cũng là đối tượng công nợ (TK 131)`}
        actions={
          canEdit ? (
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
          ) : null
        }
      />
      <DataGrid<Row>
        rowData={rows}
        columnDefs={cols}
        loading={students.isLoading}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => canEdit && e.data && setEditing(e.data)}
      />
      <Modal open={editing !== null} wide title={editing === "new" ? "Thêm học viên" : "Sửa học viên"} onClose={() => setEditing(null)}>
        {editing !== null ? <StudentForm student={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
      {importing ? <ImportDialog kind="students" open onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

function StudentForm({ student, onDone }: { student: StudentRow | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const p = student?.student_profiles;
  const [form, setForm] = useState({
    code: student?.code ?? "",
    name: student?.name ?? "",
    birthDate: p?.birth_date ?? "",
    gender: p?.gender ?? "",
    guardianName: p?.guardian_name ?? student?.contact_name ?? "",
    guardianPhone: p?.guardian_phone ?? student?.phone ?? "",
    email: student?.email ?? "",
    school: p?.school ?? "",
    level: p?.level ?? "",
    address: student?.address ?? "",
    joinedOn: p?.joined_on ?? todayVN(),
    note: student?.note ?? "",
    isActive: student?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function submit() {
    const parsed = studentSchema.safeParse({ ...form, phone: form.guardianPhone });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      await api.saveStudent(db, tenant.id, parsed.data, student?.id);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.students(tenant.id) }), qc.invalidateQueries({ queryKey: qk.partners(tenant.id) })]);
      toast.success("Đã lưu học viên");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Field label="Mã học viên">
        <Input value={form.code} disabled={!!student} autoFocus onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="HV0001" />
      </Field>
      <Field label="Họ tên học viên" className="md:col-span-2">
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Ngày sinh">
        <Input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} />
      </Field>
      <Field label="Giới tính">
        <Select value={form.gender} onChange={(e) => set({ gender: e.target.value as "" | "M" | "F" })}>
          <option value="">—</option>
          <option value="M">Nam</option>
          <option value="F">Nữ</option>
        </Select>
      </Field>
      <Field label="Cấp hiện tại">
        <Select value={form.level} onChange={(e) => set({ level: e.target.value as "" | ChessLevel })}>
          <option value="">—</option>
          {Object.entries(CHESS_LEVELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Phụ huynh">
        <Input value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
      </Field>
      <Field label="SĐT phụ huynh">
        <Input value={form.guardianPhone} onChange={(e) => set({ guardianPhone: e.target.value })} />
      </Field>
      <Field label="Email phụ huynh" hint="Nhận email thông báo học phí có mã VietQR">
        <Input type="email" aria-label="Email phụ huynh" value={form.email} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <Field label="Trường">
        <Input value={form.school} onChange={(e) => set({ school: e.target.value })} />
      </Field>
      <Field label="Địa chỉ" className="md:col-span-2">
        <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <Field label="Ngày vào CLB">
        <Input type="date" value={form.joinedOn} onChange={(e) => set({ joinedOn: e.target.value })} />
      </Field>
      <Field label="Ghi chú" className="md:col-span-3">
        <Input value={form.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm md:col-span-3">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Đang học tại CLB
      </label>
      <div className="flex justify-end gap-2 md:col-span-3">
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
