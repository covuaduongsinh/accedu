import { api, friendlyError, qk } from "@accedu/api";
import { useAiHistory, useAiQuota, useDb, usePeriodLocks } from "@accedu/api/react";
import { ACCOUNTING_REGIMES, VIETQR_BANKS, formatDateVN, parseReminderDays, todayVN, vietQrPayload } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, MailCheck, Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QrCode } from "../../components/QrCode";
import { Button, Card, Field, Input, PageHeader, Select } from "../../components/ui";
import { useSession } from "../../lib/session";
import { canPost, useTenantCtx } from "../../lib/tenant";

export function CompanyPage() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const canManage = role === "owner" || role === "admin";
  const [form, setForm] = useState({
    name: tenant.name,
    tax_code: tenant.tax_code ?? "",
    address: tenant.address ?? "",
    phone: tenant.phone ?? "",
    email: tenant.email ?? "",
    start_date: tenant.start_date,
  });

  async function save() {
    try {
      await api.updateTenant(db, tenant.id, { ...form, tax_code: form.tax_code || null, address: form.address || null, phone: form.phone || null, email: form.email || null });
      await qc.invalidateQueries({ queryKey: qk.tenant(tenant.slug) });
      await qc.invalidateQueries({ queryKey: qk.tenants() });
      toast.success("Đã lưu thông tin đơn vị");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Thông tin đơn vị" subtitle={`Mã truy cập /${tenant.slug.toUpperCase()} · ${ACCOUNTING_REGIMES[tenant.regime]}`} />
      <Card
        title="Thông tin chung (in trên chứng từ, báo cáo)"
        actions={
          canManage ? (
            <Button icon={<Save size={14} />} onClick={() => void save()}>
              Lưu
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Tên đơn vị" className="md:col-span-2">
            <Input value={form.name} disabled={!canManage} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mã số thuế">
            <Input value={form.tax_code} disabled={!canManage} onChange={(e) => setForm({ ...form, tax_code: e.target.value })} />
          </Field>
          <Field label="Địa chỉ" className="md:col-span-2">
            <Input value={form.address} disabled={!canManage} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Điện thoại">
            <Input value={form.phone} disabled={!canManage} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={form.email} disabled={!canManage} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Ngày bắt đầu nhập liệu" hint="Số dư đầu kỳ tính tại ngày này">
            <Input type="date" value={form.start_date} disabled={!canManage} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
        </div>
      </Card>
      <BankCard />
      <ReminderCard />
      <AiCard />
      <PeriodLockCard />
    </div>
  );
}

/** Tài khoản nhận học phí: in mã VietQR trên thông báo học phí để phụ huynh quét chuyển khoản */
function BankCard() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const canManage = role === "owner" || role === "admin";
  const [form, setForm] = useState({
    bin: tenant.bank_bin ?? "",
    accountNo: tenant.bank_account_no ?? "",
    accountName: tenant.bank_account_name ?? "",
  });
  const known = VIETQR_BANKS.some((b) => b.bin === form.bin);
  const valid = /^\d{6}$/.test(form.bin) && /^[0-9A-Za-z]{1,19}$/.test(form.accountNo);

  async function save() {
    try {
      await api.updateTenant(db, tenant.id, {
        bank_bin: form.bin || null,
        bank_account_no: form.accountNo.trim() || null,
        bank_account_name: form.accountName.trim().toUpperCase() || null,
      });
      await qc.invalidateQueries({ queryKey: qk.tenant(tenant.slug) });
      toast.success("Đã lưu tài khoản nhận học phí");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <Card
      title="Tài khoản nhận học phí (VietQR)"
      actions={
        canManage ? (
          <Button icon={<Save size={14} />} aria-label="Lưu tài khoản nhận học phí" disabled={!!form.bin && !valid} onClick={() => void save()}>
            Lưu
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-6">
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Ngân hàng">
            <Select aria-label="Ngân hàng nhận học phí" value={known ? form.bin : form.bin ? "other" : ""} disabled={!canManage} onChange={(e) => setForm({ ...form, bin: e.target.value === "other" ? "" : e.target.value })}>
              <option value="">—</option>
              {VIETQR_BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.name}
                </option>
              ))}
              <option value="other">Ngân hàng khác (nhập mã BIN)</option>
            </Select>
          </Field>
          <Field label="Mã ngân hàng (BIN)" hint="6 số theo NAPAS">
            <Input value={form.bin} disabled={!canManage} onChange={(e) => setForm({ ...form, bin: e.target.value.replaceAll(/\D/g, "").slice(0, 6) })} />
          </Field>
          <Field label="Số tài khoản">
            <Input value={form.accountNo} disabled={!canManage} onChange={(e) => setForm({ ...form, accountNo: e.target.value.replaceAll(/\s/g, "") })} />
          </Field>
          <Field label="Tên chủ tài khoản">
            <Input value={form.accountName} disabled={!canManage} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
          </Field>
        </div>
        {valid ? (
          <div className="text-center text-xs text-muted">
            <QrCode value={vietQrPayload({ bin: form.bin, accountNo: form.accountNo })} size={132} label="Mã VietQR tài khoản nhận học phí" />
            Quét thử bằng ứng dụng ngân hàng
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Nhắc học phí qua email: bật tự động, ngày nhắc trong tháng, email trả lời; gửi thư thử */
function ReminderCard() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const session = useSession();
  const canManage = role === "owner" || role === "admin";
  const [form, setForm] = useState({
    enabled: tenant.reminder_enabled ?? false,
    days: (tenant.reminder_days ?? [5, 20]).join(", "),
    replyTo: tenant.reminder_reply_to ?? tenant.email ?? "",
  });
  const [testTo, setTestTo] = useState(session?.user.email ?? "");
  const [busy, setBusy] = useState(false);
  const days = parseReminderDays(form.days);

  async function save() {
    if (typeof days === "string") return toast.error(days);
    try {
      await api.updateTenant(db, tenant.id, {
        reminder_enabled: form.enabled,
        reminder_days: days,
        reminder_reply_to: form.replyTo.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: qk.tenant(tenant.slug) });
      toast.success("Đã lưu cài đặt nhắc học phí");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const r = await api.sendTuitionReminders(db, tenant.id, { testTo: testTo.trim() });
      const first = r.results[0];
      if (first?.status === "sent") toast.success(`Đã gửi thư thử tới ${testTo} (mẫu theo học viên ${first.student_code})`);
      else toast.error(first?.error ?? "Không gửi được thư thử");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Nhắc học phí qua email"
      actions={
        canManage ? (
          <Button icon={<Save size={14} />} aria-label="Lưu cài đặt nhắc học phí" onClick={() => void save()}>
            Lưu
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" checked={form.enabled} disabled={!canManage} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Tự động gửi email thông báo học phí (có mã VietQR) cho phụ huynh còn nợ, 8:00 sáng các ngày nhắc
        </label>
        <Field label="Ngày nhắc trong tháng" hint={typeof days === "string" ? days : "Từ 1 đến 28, ví dụ: 5, 20"}>
          <Input aria-label="Ngày nhắc trong tháng" value={form.days} disabled={!canManage} onChange={(e) => setForm({ ...form, days: e.target.value })} />
        </Field>
        <Field label="Email nhận phản hồi của phụ huynh" hint="Phụ huynh bấm Trả lời sẽ gửi về đây">
          <Input type="email" aria-label="Email nhận phản hồi" value={form.replyTo} disabled={!canManage} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
        </Field>
        {canPost(role) ? (
          <Field label="Gửi thư thử tới" hint="Thư mẫu theo một học viên còn nợ — kiểm tra trước khi bật tự động">
            <div className="flex gap-2">
              <Input type="email" aria-label="Email nhận thư thử" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Button variant="secondary" icon={<MailCheck size={14} />} disabled={busy || !testTo} onClick={() => void sendTest()}>
                Gửi thử
              </Button>
            </div>
          </Field>
        ) : null}
      </div>
    </Card>
  );
}

/** Hỏi AccEdu: hạn mức câu hỏi mỗi ngày, số câu và chi phí ước tính tháng này */
function AiCard() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const canManage = role === "owner" || role === "admin";
  const [limit, setLimit] = useState(String(tenant.ai_daily_limit ?? 100));
  const quota = useAiQuota(tenant.id);
  const monthStart = `${todayVN().slice(0, 8)}01`;
  // Quản trị thấy mọi câu hỏi của đơn vị (RLS); người khác chỉ thấy của mình
  const month = useAiHistory(tenant.id, { since: monthStart, limit: 1000 });
  const rows = month.data ?? [];
  const cost = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  async function save() {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 0 || n > 10000) return toast.error("Hạn mức từ 0 đến 10.000 câu / ngày");
    try {
      await api.updateTenant(db, tenant.id, { ai_daily_limit: n });
      await qc.invalidateQueries({ queryKey: qk.tenant(tenant.slug) });
      await qc.invalidateQueries({ queryKey: qk.ai(tenant.id) });
      toast.success("Đã lưu hạn mức AI hỏi đáp");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-gold-500" /> AI hỏi đáp (Hỏi AccEdu)
        </span>
      }
      actions={
        canManage ? (
          <Button icon={<Save size={14} />} aria-label="Lưu hạn mức AI" onClick={() => void save()}>
            Lưu
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Số câu hỏi tối đa mỗi ngày" hint="Cả đơn vị; 0 = tắt AI hỏi đáp">
          <Input aria-label="Số câu hỏi AI mỗi ngày" type="number" min={0} max={10000} value={limit} disabled={!canManage} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <div className="text-sm">
          <p className="text-xs font-medium text-muted">Hôm nay</p>
          <p className="mt-1" data-testid="ai-today">
            {quota.data ? `Đã hỏi ${quota.data.used} / ${quota.data.limit} câu` : "—"}
          </p>
        </div>
        <div className="text-sm">
          <p className="text-xs font-medium text-muted">Tháng này{canManage ? " (cả đơn vị)" : " (của bạn)"}</p>
          <p className="mt-1">
            {rows.length} câu · chi phí ước tính {cost.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} USD
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        AI chỉ đọc các báo cáo mà người hỏi được xem; không gửi số điện thoại, email, địa chỉ học viên. Khóa Anthropic API do quản trị hệ thống
        cấu hình (bí mật ANTHROPIC_API_KEY).
      </p>
    </Card>
  );
}

export function PeriodLockCard() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const locks = usePeriodLocks(tenant.id);
  const current = locks.data?.find((l) => l.voucher_type === "*");
  const [until, setUntil] = useState(todayVN().slice(0, 8) + "01");
  const canLock = role === "owner" || role === "admin" || role === "chief_accountant";

  async function lock() {
    if (!window.confirm(`Khóa số liệu đến hết ngày ${formatDateVN(until)}? Chứng từ trong kỳ đã khóa sẽ không thể sửa/xóa/ghi sổ.`)) return;
    try {
      await api.lockPeriod(db, tenant.id, until);
      await qc.invalidateQueries({ queryKey: qk.locks(tenant.id) });
      toast.success(`Đã khóa số liệu đến ${formatDateVN(until)}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <Card title="Khóa số liệu">
      <p className="mb-3 text-sm">
        {current ? (
          <>
            Số liệu đang khóa đến hết ngày <b className="text-navy-700">{formatDateVN(current.locked_until)}</b>.
          </>
        ) : (
          "Chưa khóa số liệu kỳ nào."
        )}
      </p>
      {canLock ? (
        <div className="flex items-end gap-2">
          <Field label="Khóa số liệu đến ngày">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <Button variant="gold" icon={<Lock size={14} />} onClick={() => void lock()}>
            Khóa sổ
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Chỉ kế toán trưởng / quản trị được khóa sổ.</p>
      )}
    </Card>
  );
}
