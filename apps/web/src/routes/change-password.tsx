import { api, friendlyError } from "@accedu/api";
import { useDb } from "@accedu/api/react";
import { passwordProblem } from "@accedu/core";
import { brand } from "@accedu/ui-tokens";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, Field, Input } from "../components/ui";

/**
 * Đổi mật khẩu. `forced`: tài khoản mới / vừa được đặt lại mật khẩu tạm — phải đổi trước khi dùng.
 * Đổi xong máy chủ đăng xuất mọi thiết bị khác của người dùng.
 */
export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const db = useDb();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (password !== confirm ? "Mật khẩu nhập lại không khớp" : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(db, password);
      toast.success("Đã đổi mật khẩu — các thiết bị khác đã được đăng xuất");
      if (!forced) await navigate({ to: "/" });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chess-pattern flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-3 bg-navy-500 px-6 py-5 text-white">
          <KeyRound size={28} className="text-gold-300" />
          <div>
            <div className="text-lg font-bold">Đổi mật khẩu</div>
            <div className="text-xs text-gold-300">
              {forced ? "Lần đầu đăng nhập — vui lòng đặt mật khẩu riêng" : brand.name}
            </div>
          </div>
        </div>
        <div className="space-y-3 p-6">
          <Field label="Mật khẩu mới" hint="Ít nhất 8 ký tự, có cả chữ và số">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </Field>
          {error ? <p className="rounded bg-red-50 px-2 py-1.5 text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="w-full justify-center py-2" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu mật khẩu mới"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-navy-500 hover:underline"
            onClick={() => (forced ? void db.auth.signOut() : void navigate({ to: "/" }))}
          >
            {forced ? "Đăng xuất" : "Quay lại"}
          </button>
        </div>
      </form>
    </div>
  );
}
