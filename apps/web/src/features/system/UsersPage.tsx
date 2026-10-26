import { api, friendlyError, qk, type MemberRow } from "@accedu/api";
import { useDb, useMembers } from "@accedu/api/react";
import { useQueryClient } from "@tanstack/react-query";
import { temporaryPassword } from "@accedu/core";
import { Dices, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "../../components/ui";
import { ROLE_LABEL, useTenantCtx } from "../../lib/tenant";

const ROLE_HELP: Record<MemberRow["role"], string> = {
  owner: "Toàn quyền, không thể bị xóa",
  admin: "Quản trị người dùng, thông tin đơn vị, khóa sổ",
  chief_accountant: "Lập, ghi sổ chứng từ; khóa sổ; xem nhật ký",
  accountant: "Lập, ghi sổ chứng từ; sửa danh mục",
  cashier: "Chỉ lập phiếu thu/chi (chưa ghi sổ)",
  viewer: "Chỉ xem số liệu, báo cáo",
  coach: "Huấn luyện viên: điểm danh lớp mình phụ trách, không xem số liệu kế toán",
};

export function UsersPage() {
  const { tenant, role } = useTenantCtx();
  const members = useMembers(tenant.id);
  const db = useDb();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [tempPassword, setTempPassword] = useState(() => temporaryPassword());
  const [newRole, setNewRole] = useState<MemberRow["role"]>("accountant");
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const canManage = role === "owner" || role === "admin";

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: qk.members(tenant.id) });
      toast.success(ok);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function createAccount() {
    const input = { tenantId: tenant.id, email: email.trim(), fullName, password: tempPassword, role: newRole };
    try {
      const r = await api.createUser(db, input);
      await qc.invalidateQueries({ queryKey: qk.members(tenant.id) });
      if (r.created) {
        setIssued({ email: input.email, password: input.password });
        toast.success(`Đã tạo tài khoản ${input.email}`);
      } else {
        setIssued(null);
        toast.success(`${input.email} đã có tài khoản — đã gán vai trò ${ROLE_LABEL[newRole]}`);
      }
      setEmail("");
      setFullName("");
      setTempPassword(temporaryPassword());
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Người sử dụng & phân quyền" subtitle="Mỗi người dùng một vai trò trong đơn vị; đăng nhập đồng thời trên web, desktop, mobile" />
      {canManage ? (
        <Card title="Tạo tài khoản / thêm người dùng">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Email" className="min-w-64 flex-1">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ketoan@duongsinh.vn" />
            </Field>
            <Field label="Họ và tên" className="min-w-48 flex-1">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
            </Field>
            <Field label="Mật khẩu tạm" hint="Người dùng phải đổi ở lần đăng nhập đầu">
              <div className="flex gap-1">
                <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} className="w-36 font-mono" />
                <Button variant="ghost" icon={<Dices size={14} />} aria-label="Sinh mật khẩu khác" onClick={() => setTempPassword(temporaryPassword())} />
              </div>
            </Field>
            <Field label="Vai trò">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value as MemberRow["role"])}>
                {(["admin", "chief_accountant", "accountant", "cashier", "viewer", "coach"] as const).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button icon={<UserPlus size={14} />} disabled={!email} onClick={() => void createAccount()}>
              Tạo / thêm
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {ROLE_HELP[newRole]}. Email đã có tài khoản AccEdu thì chỉ được gán vào đơn vị (giữ mật khẩu cũ).
          </p>
          {issued ? (
            <div className="mt-3 rounded border border-gold-300 bg-gold-50 p-3 text-sm" role="status">
              Gửi cho <b>{issued.email}</b> mật khẩu tạm: <code className="font-mono text-base font-semibold">{issued.password}</code>
              <span className="block text-xs text-muted">Mật khẩu chỉ hiện một lần. Người dùng sẽ phải đặt mật khẩu mới khi đăng nhập.</span>
            </div>
          ) : null}
        </Card>
      ) : null}
      <Card title={`Thành viên (${members.data?.length ?? 0})`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1">Họ tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Quyền</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m) => (
              <tr key={m.user_id} className="border-t border-line">
                <td className="py-2">{m.full_name ?? "—"}</td>
                <td>{m.email ?? "•••"}</td>
                <td>
                  {canManage && m.role !== "owner" && m.email ? (
                    <Select
                      value={m.role}
                      className="w-44"
                      onChange={(e) => void run(() => api.setMember(db, tenant.id, m.email as string, e.target.value), "Đã đổi vai trò")}
                    >
                      {(["admin", "chief_accountant", "accountant", "cashier", "viewer", "coach"] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={m.role === "owner" ? "gold" : "navy"}>{ROLE_LABEL[m.role]}</Badge>
                  )}
                </td>
                <td className="text-xs text-muted">{ROLE_HELP[m.role]}</td>
                <td className="text-right">
                  {canManage && m.role !== "owner" ? (
                    <button
                      type="button"
                      aria-label="Xóa người dùng"
                      className="text-muted hover:text-danger"
                      onClick={() => window.confirm(`Xóa ${m.email} khỏi đơn vị?`) && void run(() => api.removeMember(db, tenant.id, m.user_id), "Đã xóa")}
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
