import { useRealtimeSync, useTenant, useTenants } from "@accedu/api/react";
import { MODULES, searchFeatures } from "@accedu/core";
import { getDictionary } from "@accedu/i18n";
import { Link, Navigate, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { Cloud, CloudOff, Home, KeyRound, LogOut, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDb } from "@accedu/api/react";
import { Empty } from "../components/ui";
import { AskPanel } from "../features/ai/AskPanel";
import { useSession } from "../lib/session";
import { platform } from "../lib/supabase";
import { COACH_HOME, ROLE_LABEL, TenantContext, isCoach } from "../lib/tenant";

const t = getDictionary("vi");

export function AppShell() {
  const { tenant: slug } = useParams({ from: "/$tenant" });
  const session = useSession();
  const tenant = useTenant(slug);
  const tenants = useTenants();
  const membership = tenants.data?.find((x) => x.slug === slug.toLowerCase());
  const sync = useRealtimeSync(tenant.data?.id);
  const db = useDb();
  const [online, setOnline] = useState(navigator.onLine);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const ctx = useMemo(
    () => (tenant.data && membership ? { tenant: tenant.data, role: membership.role, slug: tenant.data.slug } : null),
    [tenant.data, membership],
  );

  if (session === null) return <Navigate to="/login" />;
  if (tenant.isLoading || tenants.isLoading) return <Empty>{t.common.loading}</Empty>;
  if (!ctx) return <Empty>Không tìm thấy đơn vị “{slug}” hoặc bạn chưa được cấp quyền.</Empty>;

  const live = online && sync === "live";
  const coach = isCoach(ctx.role);
  // HLV chỉ thấy Đào tạo › Điểm danh
  const menu = coach
    ? MODULES.filter((m) => m.key === "education").map((m) => ({ ...m, features: m.features.filter((f) => f.path === COACH_HOME) }))
    : MODULES;

  return (
    <TenantContext.Provider value={ctx}>
      <div className="flex min-h-full flex-col">
        <header className="no-print bg-navy-500 text-white shadow">
          <div className="flex items-center gap-3 px-4 py-1.5 text-xs">
            <Link to="/" className="flex items-center gap-2 font-bold tracking-wide">
              <img src="/logo.svg" alt="" className="h-6 w-6" />
              AccEdu
            </Link>
            <span className="text-gold-300">{ctx.tenant.name}</span>
            <span className="rounded bg-navy-700 px-1.5 py-0.5">/{ctx.slug.toUpperCase()}</span>
            <div className="ml-auto flex items-center gap-3">
              {coach ? null : <FeatureSearch slug={ctx.slug} />}
              <button
                type="button"
                className="flex items-center gap-1 rounded bg-gold-500 px-2 py-0.5 font-semibold text-navy-900 hover:bg-gold-400"
                onClick={() => setAskOpen((v) => !v)}
              >
                <Sparkles size={13} /> Hỏi AccEdu
              </button>
              {/* Độ rộng cố định: đổi Ngoại tuyến ↔ Đã đồng bộ không làm xê dịch các nút bên cạnh */}
              <span className="flex w-24 shrink-0 items-center gap-1" title={live ? "Đồng bộ thời gian thực" : "Ngoại tuyến — dữ liệu từ bộ nhớ đệm"}>
                {live ? <Cloud size={14} className="text-gold-300" /> : <CloudOff size={14} className="text-red-200" />}
                {live ? t.common.online : t.common.offline}
              </span>
              <span>
                {session?.user.email} · {ROLE_LABEL[ctx.role]} · {platform === "desktop" ? "Desktop" : "Web"}
              </span>
              <Link to="/$tenant" params={{ tenant: ctx.slug }} className="flex items-center gap-1 hover:text-gold-300">
                <Home size={14} /> Trang chính
              </Link>
              <Link to="/doi-mat-khau" className="flex items-center gap-1 hover:text-gold-300" title="Đổi mật khẩu">
                <KeyRound size={14} />
              </Link>
              <button type="button" className="flex items-center gap-1 hover:text-gold-300" onClick={() => void db.auth.signOut()}>
                <LogOut size={14} /> {t.auth.signOut}
              </button>
            </div>
          </div>
          <MegaMenu slug={ctx.slug} modules={menu} />
        </header>
        <main className="flex-1 p-4">
          <Outlet />
        </main>
        {askOpen ? <AskPanel onClose={() => setAskOpen(false)} /> : null}
      </div>
    </TenantContext.Provider>
  );
}

function MegaMenu({ slug, modules }: { slug: string; modules: typeof MODULES }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <nav className="relative flex border-t border-navy-400 bg-navy-600 px-2" onMouseLeave={() => setOpen(null)}>
      {modules.map((m) => (
        <div key={m.key} className="relative" onMouseEnter={() => setOpen(m.key)}>
          <button
            type="button"
            className={`px-3 py-2 text-sm font-medium ${open === m.key ? "bg-gold-500 text-navy-900" : "text-white hover:bg-navy-500"}`}
            onClick={() => setOpen(open === m.key ? null : m.key)}
          >
            {m.title}
          </button>
          {open === m.key ? (
            <div className="absolute left-0 top-full z-40 min-w-72 rounded-b-md border border-line bg-white py-1 text-ink shadow-lg">
              {m.features.map((f) => (
                <Link
                  key={f.path}
                  to={f.kind === "dashboard" ? "/$tenant" : "/$tenant/$"}
                  params={{ tenant: slug, _splat: f.path }}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-navy-50"
                  onClick={() => setOpen(null)}
                >
                  <span className={f.ready ? "" : "text-muted"}>{f.title}</span>
                  {f.ready ? null : <span className="text-[10px] text-muted">{f.phase}</span>}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

function FeatureSearch({ slug }: { slug: string }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const results = searchFeatures(q).slice(0, 8);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-navy-300" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`${t.common.search} (Ctrl+K)`}
        className="w-64 rounded bg-navy-700 py-1 pl-7 pr-2 text-xs text-white placeholder:text-navy-200 outline-none focus:ring-1 focus:ring-gold-400"
        onKeyDown={(e) => {
          const first = results[0];
          if (e.key === "Enter" && first) {
            void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: first.path } });
            setQ("");
          }
        }}
      />
      {q && results.length ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-line bg-white py-1 text-ink shadow-lg">
          {results.map((f) => (
            <Link
              key={f.path}
              to="/$tenant/$"
              params={{ tenant: slug, _splat: f.path }}
              className="block px-3 py-1.5 text-sm hover:bg-navy-50"
              onClick={() => setQ("")}
            >
              {f.title}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
