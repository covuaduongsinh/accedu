import { api, friendlyError, qk, type ClassRow, type EnrollmentRow } from "@accedu/api";
import { useClasses, useCourseBalance, useDb, useEnrollments, useMembers, usePartners, useStudents } from "@accedu/api/react";
import {
  BILLING_MODES,
  CHESS_LEVELS,
  ENROLLMENT_STATUS,
  classSchema,
  enrollmentSchema,
  formatAmount,
  parseAmount,
  remainingLabel,
  todayVN,
  type BillingMode,
  type ChessLevel,
  type EnrollmentStatus,
} from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { Pencil, Plus, RefreshCw, UserPlus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { ROLE_LABEL, canPost, useTenantCtx } from "../../lib/tenant";

type ClassGridRow = ClassRow & { students: number; coach_name: string };
type EnrollmentGridRow = EnrollmentRow & { student_code: string; student_name: string; remaining: number | null };

const STATUS_TONE: Record<EnrollmentStatus, "green" | "gold" | "gray" | "red"> = { active: "green", paused: "gold", finished: "gray", dropped: "red" };

/** Lớp học (Tốt → Vua): học phí theo tháng hoặc theo khóa N buổi; ghi danh học viên vào lớp */
export function ClassesPage() {
  const { tenant, role } = useTenantCtx();
  const classes = useClasses(tenant.id);
  const enrollments = useEnrollments(tenant.id);
  const students = useStudents(tenant.id);
  const members = useMembers(tenant.id);
  const [editing, setEditing] = useState<ClassRow | "new" | null>(null);
  const [selected, setSelected] = useState<ClassRow | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const canEdit = canPost(role);

  const rows = useMemo<ClassGridRow[]>(() => {
    const count = new Map<string, number>();
    for (const e of enrollments.data ?? []) if (e.status === "active") count.set(e.class_id, (count.get(e.class_id) ?? 0) + 1);
    const coach = new Map((members.data ?? []).map((m) => [m.user_id, m.full_name ?? m.email ?? ""]));
    return (classes.data ?? [])
      .map((c) => ({ ...c, students: count.get(c.job_id) ?? 0, coach_name: c.coach_user_id ? (coach.get(c.coach_user_id) ?? "") : "" }))
      .toSorted((a, b) => a.jobs.code.localeCompare(b.jobs.code));
  }, [classes.data, enrollments.data, members.data]);
  const current = rows.find((r) => r.job_id === selected?.job_id) ?? null;

  const cols = useMemo<ColDef<ClassGridRow>[]>(
    () => [
      { field: "jobs.code", headerName: "Mã lớp", width: 120 },
      { field: "jobs.name", headerName: "Tên lớp", flex: 2, minWidth: 200 },
      { field: "level", headerName: "Cấp", width: 85, valueFormatter: (p) => (p.value ? CHESS_LEVELS[p.value as ChessLevel] : "") },
      { field: "billing", headerName: "Học phí tính", width: 150, valueFormatter: (p) => BILLING_MODES[p.value as BillingMode] },
      amountCol("fee", "Học phí", { width: 120 }),
      { field: "sessions_per_course", headerName: "Buổi/khóa", width: 100, type: "rightAligned" },
      { field: "schedule", headerName: "Lịch học", flex: 1, minWidth: 150 },
      { field: "coach_name", headerName: "HLV điểm danh", width: 150 },
      { field: "students", headerName: "Đang học", width: 100, type: "rightAligned" },
      { field: "jobs.is_active", headerName: "Mở", width: 70, valueFormatter: (p) => (p.value ? "✓" : "") },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Lớp học"
        subtitle="Mỗi lớp là một vụ việc: doanh thu, chi phí theo dõi riêng · học phí theo tháng hoặc theo khóa"
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
      <DataGrid<ClassGridRow>
        rowData={rows}
        columnDefs={cols}
        loading={classes.isLoading}
        height={300}
        getRowId={(p) => p.data.job_id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => canEdit && e.data && setEditing(e.data)}
      />
      {current ? (
        <ClassStudents
          cls={current}
          enrollments={(enrollments.data ?? []).filter((e) => e.class_id === current.job_id)}
          studentById={new Map((students.data ?? []).map((s) => [s.id, s]))}
          canEdit={canEdit}
          onEnroll={() => setEnrolling(true)}
        />
      ) : (
        <p className="text-sm text-muted">Chọn một lớp để xem và ghi danh học viên.</p>
      )}
      <Modal open={editing !== null} wide title={editing === "new" ? "Thêm lớp học" : "Sửa lớp học"} onClose={() => setEditing(null)}>
        {editing !== null ? <ClassForm cls={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
      <Modal open={enrolling && !!current} title={`Ghi danh vào ${current?.jobs.name ?? ""}`} onClose={() => setEnrolling(false)}>
        {enrolling && current ? <EnrollForm cls={current} onDone={() => setEnrolling(false)} /> : null}
      </Modal>
    </div>
  );
}

function ClassStudents({
  cls,
  enrollments,
  studentById,
  canEdit,
  onEnroll,
}: {
  cls: ClassRow;
  enrollments: EnrollmentRow[];
  studentById: Map<string, { code: string; name: string }>;
  canEdit: boolean;
  onEnroll: () => void;
}) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<EnrollmentGridRow | null>(null);
  const course = cls.billing === "course";
  const balance = useCourseBalance(course ? tenant.id : undefined, cls.job_id);
  const remainingOf = new Map((balance.data ?? []).map((b) => [b.enrollment_id, b.remaining]));
  const rows = enrollments
    .map((e) => ({
      ...e,
      student_code: studentById.get(e.student_id)?.code ?? "",
      student_name: studentById.get(e.student_id)?.name ?? "",
      remaining: remainingOf.get(e.id) ?? null,
    }))
    .toSorted((a, b) => a.student_code.localeCompare(b.student_code) || a.start_date.localeCompare(b.start_date));

  async function renew() {
    if (!picked) return;
    if (!window.confirm(`Gia hạn khóa mới cho ${picked.student_name}? Khóa cũ sẽ kết thúc; lập học phí khóa mới ở trang Học phí.`)) return;
    try {
      await api.renewCourse(db, tenant.id, picked.id);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.enrollments(tenant.id) }), qc.invalidateQueries({ queryKey: ["report", tenant.id] })]);
      toast.success(`${picked.student_name}: đã gia hạn khóa mới — vào Học phí › Lập học phí để lập hóa đơn khóa mới`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function setStatus(status: EnrollmentStatus) {
    if (!picked) return;
    try {
      await api.saveEnrollment(
        db,
        tenant.id,
        {
          classId: picked.class_id,
          studentId: picked.student_id,
          startDate: picked.start_date,
          status,
          ...(status === "finished" || status === "dropped" ? { endDate: picked.end_date ?? todayVN() } : {}),
        },
        picked.id,
      );
      await qc.invalidateQueries({ queryKey: qk.enrollments(tenant.id) });
      toast.success(`${picked.student_name}: ${ENROLLMENT_STATUS[status].toLowerCase()}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const cols: ColDef<EnrollmentGridRow>[] = [
    { field: "student_code", headerName: "Mã HV", width: 110 },
    { field: "student_name", headerName: "Họ tên", flex: 1, minWidth: 180 },
    dateCol("start_date", "Vào lớp"),
    dateCol("end_date", "Kết thúc"),
    {
      field: "fee",
      headerName: "Học phí riêng",
      width: 130,
      type: "rightAligned",
      cellClass: "num",
      valueFormatter: (p) => (p.value === null || p.value === undefined ? "theo lớp" : formatAmount(Number(p.value))),
    },
    {
      field: "status",
      headerName: "Trạng thái",
      width: 120,
      cellRenderer: (p: { value: EnrollmentStatus }) => <Badge tone={STATUS_TONE[p.value]}>{ENROLLMENT_STATUS[p.value]}</Badge>,
    },
    ...(course
      ? [
          {
            field: "remaining",
            headerName: "Số buổi",
            width: 130,
            cellRenderer: (p: { value: number | null; data?: EnrollmentGridRow }) =>
              p.value === null || p.value === undefined ? null : (
                <Badge tone={p.value <= 2 && p.data?.status === "active" ? (p.value < 0 ? "red" : "gold") : "gray"}>{remainingLabel(p.value)}</Badge>
              ),
          } satisfies ColDef<EnrollmentGridRow>,
        ]
      : []),
  ];

  return (
    <Card
      title={`Học viên lớp ${cls.jobs.code} — ${cls.jobs.name}`}
      actions={
        canEdit ? (
          <div className="flex gap-2">
            <Button icon={<UserPlus size={14} />} onClick={onEnroll}>
              Ghi danh
            </Button>
            <Button variant="secondary" disabled={!picked || picked.status === "paused"} onClick={() => void setStatus("paused")}>
              Bảo lưu
            </Button>
            <Button variant="secondary" disabled={!picked || picked.status === "active"} onClick={() => void setStatus("active")}>
              Học tiếp
            </Button>
            <Button variant="secondary" disabled={!picked || picked.status === "finished"} onClick={() => void setStatus("finished")}>
              Kết thúc
            </Button>
            {course ? (
              <Button
                variant="gold"
                icon={<RefreshCw size={14} />}
                disabled={!picked || (picked.status !== "active" && picked.status !== "paused")}
                onClick={() => void renew()}
              >
                Gia hạn khóa
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <DataGrid<EnrollmentGridRow>
        rowData={rows}
        columnDefs={cols}
        height={260}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setPicked(e.api.getSelectedRows()[0] ?? null)}
      />
    </Card>
  );
}

function ClassForm({ cls, onDone }: { cls: ClassRow | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const partners = usePartners(tenant.id);
  const members = useMembers(tenant.id);
  const listId = useId();
  const coaches = (partners.data ?? []).filter((p) => p.is_employee && p.is_active);
  const [form, setForm] = useState({
    code: cls?.jobs.code ?? "",
    name: cls?.jobs.name ?? "",
    level: cls?.level ?? "",
    billing: cls?.billing ?? ("monthly" as BillingMode),
    fee: cls ? formatAmount(Number(cls.fee)) : "",
    sessions: cls?.sessions_per_course ? String(cls.sessions_per_course) : "",
    schedule: cls?.schedule ?? "",
    location: cls?.location ?? "",
    coachCode: coaches.find((c) => c.id === cls?.coach_partner_id)?.code ?? "",
    coachUserId: cls?.coach_user_id ?? "",
    startDate: cls?.jobs.start_date ?? "",
    endDate: cls?.jobs.end_date ?? "",
    isActive: cls?.jobs.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function submit() {
    const coach = coaches.find((c) => c.code.toUpperCase() === form.coachCode.trim().toUpperCase());
    const parsed = classSchema.safeParse({
      code: form.code,
      name: form.name,
      level: form.level,
      billing: form.billing,
      fee: parseAmount(form.fee) ?? 0,
      sessionsPerCourse: form.billing === "course" ? Number(form.sessions) || null : null,
      schedule: form.schedule,
      location: form.location,
      coachPartnerId: coach?.id ?? null,
      coachUserId: form.coachUserId || null,
      startDate: form.startDate,
      endDate: form.endDate,
      isActive: form.isActive,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      await api.saveClass(db, tenant.id, parsed.data, cls?.job_id);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.classes(tenant.id) }), qc.invalidateQueries({ queryKey: qk.jobs(tenant.id) })]);
      toast.success("Đã lưu lớp học");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <datalist id={listId}>
        {coaches.map((c) => (
          <option key={c.id} value={c.code}>
            {c.name}
          </option>
        ))}
      </datalist>
      <Field label="Mã lớp">
        <Input value={form.code} disabled={!!cls} autoFocus onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="TOT-K12" />
      </Field>
      <Field label="Tên lớp" className="md:col-span-2">
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Lớp Tốt K12 — sáng thứ 7" />
      </Field>
      <Field label="Cấp">
        <Select value={form.level} onChange={(e) => set({ level: e.target.value as "" | ChessLevel })}>
          <option value="">—</option>
          {Object.entries(CHESS_LEVELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Học phí tính">
        <Select value={form.billing} onChange={(e) => set({ billing: e.target.value as BillingMode })}>
          {Object.entries(BILLING_MODES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={form.billing === "course" ? "Học phí mỗi khóa" : "Học phí mỗi tháng"}>
        <Input className="num text-right" value={form.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="600.000" />
      </Field>
      {form.billing === "course" ? (
        <Field label="Số buổi mỗi khóa">
          <Input className="num text-right" value={form.sessions} onChange={(e) => set({ sessions: e.target.value.replaceAll(/\D/g, "") })} placeholder="12" />
        </Field>
      ) : null}
      <Field label="Lịch học">
        <Input value={form.schedule} onChange={(e) => set({ schedule: e.target.value })} placeholder="Sáng thứ 7, 8h–9h30" />
      </Field>
      <Field label="Địa điểm">
        <Input value={form.location} onChange={(e) => set({ location: e.target.value })} />
      </Field>
      <Field label="HLV (mã nhân viên)" hint="Đối tượng là nhân viên — tính lương sau này">
        <Input list={listId} value={form.coachCode} onChange={(e) => set({ coachCode: e.target.value })} />
      </Field>
      <Field label="HLV điểm danh (tài khoản)" hint="Tài khoản vai trò Huấn luyện viên — tạo ở Hệ thống › Người dùng">
        <Select aria-label="HLV điểm danh" value={form.coachUserId} onChange={(e) => set({ coachUserId: e.target.value })}>
          <option value="">—</option>
          {(members.data ?? [])
            .toSorted((a, b) => Number(b.role === "coach") - Number(a.role === "coach"))
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name ?? m.email ?? "(chưa có tên)"} · {ROLE_LABEL[m.role]}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Khai giảng">
        <Input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
      </Field>
      <Field label="Kết thúc">
        <Input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm md:col-span-3">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Lớp đang mở
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

function EnrollForm({ cls, onDone }: { cls: ClassRow; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const students = useStudents(tenant.id);
  const listId = useId();
  const [form, setForm] = useState({ studentCode: "", startDate: todayVN(), fee: "" });
  const [busy, setBusy] = useState(false);
  const student = (students.data ?? []).find((s) => s.code.toUpperCase() === form.studentCode.trim().toUpperCase());

  async function submit() {
    const parsed = enrollmentSchema.safeParse({
      classId: cls.job_id,
      studentId: student?.id,
      startDate: form.startDate,
      fee: form.fee.trim() ? parseAmount(form.fee) : null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      await api.saveEnrollment(db, tenant.id, parsed.data);
      await qc.invalidateQueries({ queryKey: qk.enrollments(tenant.id) });
      toast.success(`Đã ghi danh ${student?.name ?? ""}`);
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <datalist id={listId}>
        {(students.data ?? [])
          .filter((s) => s.is_active)
          .map((s) => (
            <option key={s.id} value={s.code}>
              {s.name}
            </option>
          ))}
      </datalist>
      <Field label="Mã học viên" className="col-span-2" hint={student?.name ?? "Chọn từ danh sách học viên"}>
        <Input list={listId} value={form.studentCode} autoFocus onChange={(e) => setForm({ ...form, studentCode: e.target.value })} />
      </Field>
      <Field label="Ngày vào lớp">
        <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
      </Field>
      <Field label="Học phí riêng" hint={`Trống = theo lớp (${formatAmount(Number(cls.fee))})`}>
        <Input className="num text-right" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
      </Field>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={busy || !student} onClick={() => void submit()}>
          Ghi danh
        </Button>
      </div>
    </div>
  );
}
