import { api, friendlyError, qk, type CoachPayResult, type CoachProfileRow } from "@accedu/api";
import { useCoachProfiles, useDb, useMembers, usePartners } from "@accedu/api/react";
import { COACH_KINDS, PIT_THRESHOLD, formatAmount, formatDateVN, parseAmount, todayVN, type CoachKind } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Eye, Pencil, UserPlus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { ROLE_LABEL, canPost, useTenantCtx } from "../../lib/tenant";

const lastMonth = () => {
  const d = new Date(`${todayVN().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

type CoachLine = { partnerId: string; code: string; name: string; profile: CoachProfileRow | undefined };

/**
 * Lương HLV theo buổi dạy: khai báo HLV (nhân viên / cộng tác viên, đơn giá buổi, tài khoản đăng nhập),
 * xem trước và lập phiếu lương tháng từ điểm danh.
 */
export function CoachPayPage() {
  const { tenant, role } = useTenantCtx();
  const partners = usePartners(tenant.id);
  const profiles = useCoachProfiles(tenant.id);
  const members = useMembers(tenant.id);
  const [editing, setEditing] = useState<CoachLine | "new" | null>(null);
  const allowed = canPost(role);

  const coaches = useMemo<CoachLine[]>(() => {
    const byId = new Map((profiles.data ?? []).map((p) => [p.partner_id, p]));
    return (partners.data ?? [])
      .filter((p) => p.is_employee && (p.is_active || byId.has(p.id)))
      .map((p) => ({ partnerId: p.id, code: p.code, name: p.name, profile: byId.get(p.id) }))
      .toSorted((a, b) => a.code.localeCompare(b.code));
  }, [partners.data, profiles.data]);
  const memberName = (id: string | null) => {
    const m = (members.data ?? []).find((x) => x.user_id === id);
    return m ? (m.full_name ?? m.email ?? "—") : "";
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Lương HLV"
        subtitle={`Tính theo buổi dạy có điểm danh · nhân viên Có 334 · cộng tác viên Có 331, khấu trừ 10% thuế TNCN khi từ ${formatAmount(PIT_THRESHOLD)} đ`}
      />
      <Card
        title="Danh sách HLV"
        actions={
          allowed ? (
            <Button icon={<UserPlus size={14} />} onClick={() => setEditing("new")}>
              Khai báo HLV
            </Button>
          ) : null
        }
      >
        {coaches.length === 0 ? (
          <p className="text-sm text-muted">Chưa có HLV. Thêm đối tượng là nhân viên ở Bán hàng › Khách hàng (đánh dấu Nhân viên) rồi khai báo ở đây.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1">Mã</th>
                <th>Họ tên</th>
                <th>Loại</th>
                <th className="text-right">Đơn giá buổi</th>
                <th className="pl-4">Tài khoản điểm danh</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {coaches.map((c) => (
                <tr key={c.partnerId} className="border-t border-line">
                  <td className="py-1.5">{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.profile ? <Badge tone={c.profile.kind === "contractor" ? "gold" : "navy"}>{COACH_KINDS[c.profile.kind]}</Badge> : <span className="text-muted">Chưa khai báo</span>}</td>
                  <td className="num text-right">{c.profile?.session_rate != null ? formatAmount(Number(c.profile.session_rate)) : "—"}</td>
                  <td className="pl-4">{memberName(c.profile?.user_id ?? null)}</td>
                  <td className="text-right">
                    {allowed ? (
                      <Button variant="secondary" icon={<Pencil size={13} />} aria-label={`Sửa HLV ${c.code}`} onClick={() => setEditing(c)}>
                        Sửa
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <PayCard />
      <Modal open={editing !== null} title={editing === "new" ? "Khai báo HLV" : `HLV ${editing?.code ?? ""}`} onClose={() => setEditing(null)}>
        {editing !== null ? <CoachForm coach={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  );
}

function CoachForm({ coach, onDone }: { coach: CoachLine | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const partners = usePartners(tenant.id);
  const members = useMembers(tenant.id);
  const listId = useId();
  const [form, setForm] = useState({
    code: coach?.code ?? "",
    kind: (coach?.profile?.kind ?? "employee") as CoachKind,
    rate: coach?.profile?.session_rate != null ? formatAmount(Number(coach.profile.session_rate)) : "",
    userId: coach?.profile?.user_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const partner = (partners.data ?? []).find((p) => p.code.toUpperCase() === form.code.trim().toUpperCase());

  async function submit() {
    if (!partner) return toast.error("Chưa chọn nhân viên (mã đối tượng)");
    const rate = form.rate.trim() ? parseAmount(form.rate) : null;
    if (form.rate.trim() && (rate === null || rate < 0)) return toast.error("Đơn giá buổi không hợp lệ");
    setBusy(true);
    try {
      await api.saveCoachProfile(db, tenant.id, partner.id, { kind: form.kind, sessionRate: rate, userId: form.userId || null });
      await Promise.all([qc.invalidateQueries({ queryKey: qk.coachProfiles(tenant.id) }), qc.invalidateQueries({ queryKey: qk.partners(tenant.id) })]);
      toast.success(`Đã lưu HLV ${partner.code}`);
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
        {(partners.data ?? [])
          .filter((p) => p.is_active && (p.is_employee || !p.is_student))
          .map((p) => (
            <option key={p.id} value={p.code}>
              {p.name}
            </option>
          ))}
      </datalist>
      <Field label="Mã nhân viên" className="col-span-2" hint={partner?.name ?? "Đối tượng trong danh mục (sẽ được đánh dấu là nhân viên)"}>
        <Input aria-label="Mã nhân viên HLV" list={listId} value={form.code} disabled={!!coach} autoFocus onChange={(e) => setForm({ ...form, code: e.target.value })} />
      </Field>
      <Field label="Loại">
        <Select aria-label="Loại HLV" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CoachKind })}>
          <option value="employee">Nhân viên (Có 334)</option>
          <option value="contractor">Cộng tác viên (Có 331, khấu trừ TNCN)</option>
        </Select>
      </Field>
      <Field label="Đơn giá mỗi buổi" hint="Lớp có đơn giá riêng thì theo lớp">
        <Input aria-label="Đơn giá buổi" className="num text-right" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="150.000" />
      </Field>
      <Field label="Tài khoản điểm danh" className="col-span-2" hint="Buổi do tài khoản này điểm danh tính lương cho HLV này">
        <Select aria-label="Tài khoản điểm danh của HLV" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
          <option value="">—</option>
          {(members.data ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name ?? m.email ?? "(chưa có tên)"} · {ROLE_LABEL[m.role]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={busy || !partner} onClick={() => void submit()}>
          Lưu
        </Button>
      </div>
    </div>
  );
}

function PayCard() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [month, setMonth] = useState(lastMonth());
  const [result, setResult] = useState<CoachPayResult | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = canPost(role);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api.generateCoachPay(db, tenant.id, `${month}-01`, { dryRun });
      setResult(r);
      if (!dryRun) {
        await Promise.all([qc.invalidateQueries({ queryKey: ["report", tenant.id] }), qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] })]);
        toast.success(
          r.number
            ? `Đã lập phiếu lương ${r.number}: ${formatAmount(Number(r.gross))}${r.replaced.length ? ` (thay ${r.replaced.join(", ")})` : ""}`
            : "Tháng này chưa có buổi dạy nào",
        );
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Lương tháng"
      actions={
        <div className="flex items-end gap-2">
          <Input
            type="month"
            aria-label="Tháng lương"
            value={month}
            onChange={(e) => {
              if (!e.target.value) return;
              setMonth(e.target.value);
              setResult(null);
            }}
          />
          <Button variant="secondary" icon={<Eye size={14} />} disabled={busy || !allowed} onClick={() => void run(true)}>
            Xem trước
          </Button>
          {allowed ? (
            <Button icon={<CalendarCheck size={14} />} disabled={busy || !result?.dry_run || result.coaches.length === 0} onClick={() => void run(false)}>
              {result?.replaced.length ? "Lập lại phiếu lương" : "Lập phiếu lương"}
            </Button>
          ) : null}
        </div>
      }
    >
      {!result ? (
        <p className="text-sm text-muted">Chọn tháng rồi bấm Xem trước. Phiếu kế toán ngày cuối tháng: Nợ 632 (theo lớp) / Có 334 hoặc 331; cộng tác viên Nợ 331 / Có 3335.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-4">
            {result.dry_run ? <Badge tone="gray">Xem trước</Badge> : <Badge tone="green">Đã lập {result.number}</Badge>}
            <span>
              Tổng lương: <b className="num" data-testid="pay-gross">{formatAmount(Number(result.gross))}</b>
            </span>
            <span>
              Thuế TNCN khấu trừ: <b className="num" data-testid="pay-pit">{formatAmount(Number(result.pit))}</b>
            </span>
            <span>
              Thực nhận: <b className="num">{formatAmount(Number(result.net))}</b>
            </span>
            {result.replaced.length ? <span className="text-muted">Thay phiếu {result.replaced.join(", ")}</span> : null}
          </div>
          {result.unassigned.length ? (
            <p className="rounded border border-gold-300 bg-gold-50 p-2">
              <b>{result.unassigned.length} buổi chưa có HLV nhận lương:</b>{" "}
              {result.unassigned.map((u) => `${u.class_code} ${formatDateVN(u.held_on)}`).join("; ")}. Gán HLV ở Đào tạo › Điểm danh (ô HLV dạy) hoặc HLV phụ trách lớp.
            </p>
          ) : null}
          {result.coaches.length === 0 ? <p className="text-muted">Tháng này chưa có buổi dạy nào có điểm danh.</p> : null}
          <table className="w-full">
            <tbody>
              {result.coaches.map((c) => (
                <tr key={c.partner_id} className="border-t border-line align-top" data-testid={`pay-${c.code}`}>
                  <td className="py-2 pr-3">
                    <div className="font-medium">
                      {c.code} — {c.name}
                    </div>
                    <div className="text-xs text-muted">{COACH_KINDS[c.kind]}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {c.classes.map((l) => (
                      <div key={`${l.class_id}-${l.rate}`}>
                        {l.class_code}: {l.sessions} buổi × {formatAmount(Number(l.rate))} = <span className="num">{formatAmount(Number(l.amount))}</span>
                      </div>
                    ))}
                  </td>
                  <td className="num py-2 text-right">
                    <div>{formatAmount(Number(c.gross))}</div>
                    {Number(c.pit) > 0 ? <div className="text-xs text-danger">TNCN −{formatAmount(Number(c.pit))}</div> : null}
                    <div className="text-xs font-semibold">Thực nhận {formatAmount(Number(c.net))}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
