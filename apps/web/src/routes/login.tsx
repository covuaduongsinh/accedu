import { friendlyError } from "@accedu/api";
import { useDb } from "@accedu/api/react";
import { getDictionary } from "@accedu/i18n";
import { brand } from "@accedu/ui-tokens";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "../components/ui";

const t = getDictionary("vi");

export function LoginPage() {
  const db = useDb();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await db.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (res.error) {
      setError(/Invalid login/i.test(res.error.message) ? t.auth.invalid : friendlyError(res.error));
      return;
    }
    await navigate({ to: "/" });
  }

  return (
    <div className="chess-pattern flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="bg-navy-500 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-10 w-10" />
            <div>
              <div className="text-xl font-bold tracking-wide">{brand.name}</div>
              <div className="text-xs text-gold-300">{t.app.tagline}</div>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-6">
          <h1 className="text-base font-semibold text-navy-700">{t.auth.signIn}</h1>
          <Field label={t.auth.email}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label={t.auth.password}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          {error ? <p className="rounded bg-red-50 px-2 py-1.5 text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full justify-center py-2" disabled={busy}>
            {busy ? t.common.loading : t.auth.signIn}
          </Button>
          <p className="text-center text-xs text-muted">Chưa có tài khoản? Liên hệ quản trị đơn vị để được cấp.</p>
        </div>
        <div className="border-t border-line bg-canvas px-6 py-2 text-center text-[11px] text-muted">
          {brand.owner} — “{brand.slogan}”
        </div>
      </form>
    </div>
  );
}
