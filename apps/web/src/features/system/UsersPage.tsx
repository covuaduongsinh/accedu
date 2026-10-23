import { api, friendlyError, qk, type MemberRow } from "@accedu/api";
import { useDb, useMembers } from "@accedu/api/react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
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
};

export function UsersPage() {
  const { tenant, role } = useTenantCtx();
  const members = useMembers(tenant.id);
  const db = useDb();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<MemberRow["role"]>("accountant");
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

  return (
    <div className="space-y-4">
      <PageHeader title="Người sử dụng & phân quyền" subtitle="Mỗi người dùng một vai trò trong đơn vị; đăng nhập đồng thời trên web, desktop, mobile" />
      {canManage ? (
        <Card title="Thêm người dùng">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Email đã đăng ký AccEdu" className="min-w-72 flex-1">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ketoan@duongsinh.vn" />
            </Field>
            <Field label="Vai trò">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value as MemberRow["role"])}>
                {(["admin", "chief_accountant", "accountant", "cashier", "viewer"] as const).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              icon={<UserPlus size={14} />}
              disabled={!email}
              onClick={() => void run(() => api.setMember(db, tenant.id, email, newRole), `Đã thêm ${email}`).then(() => setEmail(""))}
            >
              Thêm
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">{ROLE_HELP[newRole]}</p>
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
                      {(["admin", "chief_accountant", "accountant", "cashier", "viewer"] as const).map((r) => (
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
