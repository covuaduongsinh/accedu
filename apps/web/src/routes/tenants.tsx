import { api, friendlyError, qk } from "@accedu/api";
import { useDb, useTenants } from "@accedu/api/react";
import { ACCOUNTING_REGIMES, stripDiacritics } from "@accedu/core";
import { getDictionary } from "@accedu/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { Building2, LogOut, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Empty, Field, Input, Select } from "../components/ui";
import { useSession } from "../lib/session";
import { ROLE_LABEL } from "../lib/tenant";

const t = getDictionary("vi");

function toSlug(name: string): string {
  return stripDiacritics(name.toLowerCase())
    .replace(/công ty|cổ phần|tnhh|cp/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function TenantsPage() {
  const session = useSession();
  const tenants = useTenants();
  const db = useDb();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [regime, setRegime] = useState<"TT99" | "TT133">("TT133");
  const [busy, setBusy] = useState(false);

  if (session === null) return <Navigate to="/login" />;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = slug || toSlug(name);
      await api.createTenant(db, { slug: s, name, regime });
      await qc.invalidateQueries({ queryKey: qk.tenants() });
      toast.success(`Đã tạo đơn vị ${name}`);
      await navigate({ to: "/$tenant", params: { tenant: s } });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chess-pattern min-h-full p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-9 w-9" />
            <div>
              <div className="text-lg font-bold text-navy-700">AccEdu</div>
              <div className="text-xs text-muted">{session?.user.email}</div>
            </div>
          </div>
          <Button variant="secondary" icon={<LogOut size={14} />} onClick={() => void db.auth.signOut()}>
            {t.auth.signOut}
          </Button>
        </div>

        <Card title={t.auth.chooseCompany}>
          {tenants.isLoading ? (
            <Empty>{t.common.loading}</Empty>
          ) : tenants.data?.length ? (
            <ul className="divide-y divide-line">
              {tenants.data.map((x) => (
                <li key={x.id}>
                  <Link
                    to="/$tenant"
                    params={{ tenant: x.slug }}
                    className="flex items-center justify-between px-2 py-3 hover:bg-navy-50"
                  >
                    <span className="flex items-center gap-3">
                      <Building2 className="text-navy-500" size={20} />
                      <span>
                        <span className="block font-medium text-ink">{x.name}</span>
                        <span className="text-xs text-muted">/{x.slug.toUpperCase()} · {x.regime}</span>
                      </span>
                    </span>
                    <Badge tone="gold">{ROLE_LABEL[x.role]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.auth.noCompany}</Empty>
          )}
        </Card>

        <Card title="Tạo đơn vị mới">
          <form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Tên đơn vị" className="md:col-span-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Công ty CP Cờ vua Dương Sinh" />
            </Field>
            <Field label="Mã truy cập (đường dẫn)" hint={`accedu.vn/${(slug || toSlug(name) || "duongsinh").toUpperCase()}`}>
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder={toSlug(name) || "duongsinh"} pattern="[a-z0-9][a-z0-9-]{1,31}" />
            </Field>
            <Field label="Chế độ kế toán">
              <Select value={regime} onChange={(e) => setRegime(e.target.value as "TT99" | "TT133")}>
                {Object.entries(ACCOUNTING_REGIMES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" icon={<Plus size={14} />} disabled={busy || !name}>
                Tạo đơn vị
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
