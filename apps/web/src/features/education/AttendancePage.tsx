import { friendlyError, type AttendanceReportRow, type AttendanceStatus, type RosterRow } from "@accedu/api";
import { useAttendanceReport, useMyClasses, useRecordAttendance, useRoster } from "@accedu/api/react";
import { ATTENDANCE_STATUS, COURSE_ENDING_SESSIONS, formatDateVN, remainingLabel, todayVN } from "@accedu/core";
import { CheckCheck, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select } from "../../components/ui";
import { useTenantCtx } from "../../lib/tenant";

const STATUSES = Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[];
const MARK: Record<AttendanceStatus, { short: string; tone: string }> = {
  present: { short: "✓", tone: "bg-green-100 text-green-800 border-green-300" },
  absent: { short: "✗", tone: "bg-red-100 text-red-800 border-red-300" },
  excused: { short: "P", tone: "bg-gold-100 text-gold-800 border-gold-300" },
};

/**
 * Điểm danh: HLV (hoặc kế toán / quản trị) chọn lớp và ngày, đánh dấu có mặt / vắng / có phép rồi lưu;
 * bảng tháng học viên × buổi, số buổi còn lại của lớp theo khóa và học viên sắp hết khóa.
 */
export function AttendancePage() {
  const { tenant } = useTenantCtx();
  const classes = useMyClasses(tenant.id);
  const [classId, setClassId] = useState("");
  const cls = (classes.data ?? []).find((c) => c.class_id === classId) ?? (classes.data ?? [])[0] ?? null;
  const [date, setDate] = useState(todayVN());
  const [month, setMonth] = useState(todayVN().slice(0, 7));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Điểm danh"
        subtitle="Có mặt và vắng không phép trừ buổi · vắng có phép không trừ (học bù) · số buổi đã học dùng để phân bổ doanh thu học phí"
      />
      {classes.data && classes.data.length === 0 ? (
        <Empty>Chưa có lớp nào được giao — nhờ quản trị chọn bạn ở ô “HLV điểm danh” của lớp (Đào tạo › Lớp học).</Empty>
      ) : null}
      {cls ? (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3">
            <Field label="Lớp">
              <Select aria-label="Lớp điểm danh" className="w-72" value={cls.class_id} onChange={(e) => setClassId(e.target.value)}>
                {(classes.data ?? []).map((c) => (
                  <option key={c.class_id} value={c.class_id}>
                    {c.code} — {c.name}
                    {c.is_mine ? " · lớp của tôi" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="pb-2 text-sm text-muted">
              {[cls.schedule, cls.location, `${cls.students} học viên`, cls.billing === "course" ? `khóa ${cls.sessions_per_course} buổi` : "học phí theo tháng"]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <SessionCard key={`${cls.class_id}|${date}`} classId={cls.class_id} course={cls.billing === "course"} date={date} onDate={setDate} />
          <MonthCard classId={cls.class_id} course={cls.billing === "course"} month={month} onMonth={setMonth} onPick={(d) => setDate(d)} />
        </>
      ) : null}
    </div>
  );
}

function SessionCard({ classId, course, date, onDate }: { classId: string; course: boolean; date: string; onDate: (d: string) => void }) {
  const { tenant } = useTenantCtx();
  const roster = useRoster(tenant.id, classId, date);
  const save = useRecordAttendance(tenant.id);
  const [edits, setEdits] = useState<Record<string, AttendanceStatus | null>>({});
  const [topic, setTopic] = useState("");
  const rows = roster.data ?? [];
  const statusOf = (r: RosterRow) => (r.student_id in edits ? edits[r.student_id] : r.status) ?? null;
  const marked = rows.filter((r) => statusOf(r)).length;
  const future = date > todayVN();

  async function submit() {
    try {
      const r = await save.mutateAsync({ classId, date, topic, rows: rows.map((x) => ({ studentId: x.student_id, status: statusOf(x) })) });
      setEdits({});
      toast.success(r.session_id ? `Đã lưu điểm danh ${formatDateVN(date)}: ${r.saved} học viên` : `Đã bỏ buổi học ${formatDateVN(date)}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <Card
      title={`Buổi học ${formatDateVN(date)}`}
      actions={
        <div className="flex items-end gap-2">
          <Input type="date" aria-label="Ngày học" value={date} max={todayVN()} onChange={(e) => e.target.value && onDate(e.target.value)} />
          <Input aria-label="Nội dung buổi học" placeholder="Nội dung buổi học" className="w-56" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Button
            variant="secondary"
            icon={<CheckCheck size={14} />}
            disabled={!rows.length || future}
            onClick={() => setEdits(Object.fromEntries(rows.map((r) => [r.student_id, "present" as const])))}
          >
            Có mặt tất cả
          </Button>
          <Button icon={<Save size={14} />} data-testid="att-save" disabled={save.isPending || !rows.length || future} onClick={() => void submit()}>
            Lưu điểm danh
          </Button>
        </div>
      }
    >
      {roster.isLoading ? <p className="text-sm text-muted">Đang tải…</p> : null}
      {!roster.isLoading && rows.length === 0 ? <p className="text-sm text-muted">Lớp chưa có học viên đang học vào ngày này.</p> : null}
      {future ? <p className="mb-2 text-sm text-danger">Chưa đến ngày học — không điểm danh trước.</p> : null}
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => {
            const st = statusOf(r);
            return (
              <tr key={r.student_id} className="border-t border-line">
                <td className="py-1.5 pr-2 font-medium">
                  {r.student_code} — {r.student_name}
                </td>
                <td className="text-xs text-muted">{r.guardian_phone ?? ""}</td>
                <td className="w-32">
                  {course && r.remaining !== null ? (
                    <Badge tone={r.remaining < 0 ? "red" : r.remaining <= COURSE_ENDING_SESSIONS ? "gold" : "gray"}>{remainingLabel(r.remaining)}</Badge>
                  ) : null}
                </td>
                <td className="w-80 text-right">
                  <div className="inline-flex gap-1" role="group" aria-label={`Điểm danh ${r.student_code}`}>
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        data-testid={`att-${r.student_code}-${s}`}
                        aria-pressed={st === s}
                        disabled={future}
                        className={`rounded border px-2.5 py-1 text-xs ${st === s ? MARK[s].tone : "border-line bg-white text-muted hover:bg-navy-50"}`}
                        onClick={() => setEdits({ ...edits, [r.student_id]: st === s ? null : s })}
                      >
                        {ATTENDANCE_STATUS[s]}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length ? (
        <p className="mt-2 text-xs text-muted">
          Đã đánh dấu {marked}/{rows.length} học viên. Bấm lại vào trạng thái đang chọn để bỏ đánh dấu.
        </p>
      ) : null}
    </Card>
  );
}

function MonthCard({
  classId,
  course,
  month,
  onMonth,
  onPick,
}: {
  classId: string;
  course: boolean;
  month: string;
  onMonth: (m: string) => void;
  onPick: (date: string) => void;
}) {
  const { tenant } = useTenantCtx();
  const report = useAttendanceReport(tenant.id, classId, `${month}-01`);
  const { sessions, students, cell } = useMemo(() => pivot(report.data ?? []), [report.data]);
  const ending = course ? students.filter((s) => s.remaining !== null && s.remaining <= COURSE_ENDING_SESSIONS && s.enrollment_status === "active") : [];

  return (
    <Card
      title={`Điểm danh tháng ${month.slice(5)}/${month.slice(0, 4)}`}
      actions={<Input type="month" aria-label="Tháng điểm danh" value={month} onChange={(e) => e.target.value && onMonth(e.target.value)} />}
    >
      {ending.length ? (
        <div className="mb-3 rounded border border-gold-300 bg-gold-50 p-2 text-sm" data-testid="course-ending">
          <b>Sắp hết khóa:</b>{" "}
          {ending.map((s) => `${s.student_code} — ${s.student_name} (${remainingLabel(s.remaining).toLowerCase()})`).join("; ")}. Gia hạn khóa ở Đào tạo › Lớp học.
        </div>
      ) : null}
      {students.length === 0 ? (
        <p className="text-sm text-muted">Không có học viên trong tháng.</p>
      ) : (
        <div className="overflow-auto">
          <table className="text-xs">
            <thead className="bg-navy-50 text-navy-700">
              <tr>
                <th className="sticky left-0 bg-navy-50 px-2 py-1 text-left">Học viên</th>
                {sessions.map((s) => (
                  <th key={s.id} className="px-1 text-center" title={s.topic ?? ""}>
                    <button type="button" className="hover:underline" onClick={() => onPick(s.held_on)}>
                      {s.held_on.slice(8, 10)}/{s.held_on.slice(5, 7)}
                    </button>
                  </th>
                ))}
                <th className="px-2 text-right">Trừ buổi</th>
                {course ? <th className="px-2 text-left">Còn lại</th> : null}
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const counted = sessions.filter((s) => {
                  const v = cell.get(`${st.student_id}|${s.id}`);
                  return v === "present" || v === "absent";
                }).length;
                return (
                  <tr key={st.student_id} className="border-t border-line">
                    <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1">
                      {st.student_code} — {st.student_name}
                    </td>
                    {sessions.map((s) => {
                      const v = cell.get(`${st.student_id}|${s.id}`);
                      return (
                        <td key={s.id} className="px-1 text-center" data-testid={`cell-${st.student_code}-${s.held_on}`}>
                          {v ? <span className={`inline-block w-5 rounded border ${MARK[v].tone}`}>{MARK[v].short}</span> : ""}
                        </td>
                      );
                    })}
                    <td className="num px-2 text-right">{counted}</td>
                    {course ? <td className="px-2">{remainingLabel(st.remaining)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">✓ có mặt · ✗ vắng không phép · P vắng có phép. Bấm ngày ở tiêu đề cột để mở lại buổi học đó.</p>
        </div>
      )}
    </Card>
  );
}

function pivot(rows: AttendanceReportRow[]) {
  const sessions = new Map<string, { id: string; held_on: string; topic: string | null }>();
  const students = new Map<string, AttendanceReportRow>();
  const cell = new Map<string, AttendanceStatus>();
  for (const r of rows) {
    if (!students.has(r.student_id)) students.set(r.student_id, r);
    if (r.session_id && r.held_on) {
      sessions.set(r.session_id, { id: r.session_id, held_on: r.held_on, topic: r.topic });
      if (r.status) cell.set(`${r.student_id}|${r.session_id}`, r.status);
    }
  }
  return { sessions: [...sessions.values()].toSorted((a, b) => a.held_on.localeCompare(b.held_on)), students: [...students.values()], cell };
}
