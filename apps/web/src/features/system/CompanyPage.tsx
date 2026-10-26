import { api, friendlyError, qk } from "@accedu/api";
import { useDb, usePeriodLocks } from "@accedu/api/react";
import { ACCOUNTING_REGIMES, VIETQR_BANKS, formatDateVN, todayVN, vietQrPayload } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QrCode } from "../../components/QrCode";
import { Button, Card, Field, Input, PageHeader, Select } from "../../components/ui";
import { useTenantCtx } from "../../lib/tenant";

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
          <Button icon={<Save size={14} />} disabled={!!form.bin && !valid} onClick={() => void save()}>
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
