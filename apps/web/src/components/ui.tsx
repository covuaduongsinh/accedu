import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useEffect } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-500 text-white hover:bg-navy-600 disabled:bg-navy-300",
  secondary: "bg-white text-navy-700 border border-line hover:bg-navy-50 disabled:text-muted",
  ghost: "text-navy-700 hover:bg-navy-50 disabled:text-muted",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
  gold: "bg-gold-500 text-navy-900 hover:bg-gold-400 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className = "",
  icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100 disabled:bg-canvas ${className}`}
      {...rest}
    />
  );
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-2 focus:ring-navy-100 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, children, className = "", hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-surface shadow-sm ${className}`}>
      {title || actions ? (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-navy-700">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ tone = "navy", children }: { tone?: "navy" | "gold" | "green" | "gray" | "red"; children: ReactNode }) {
  const tones = {
    navy: "bg-navy-50 text-navy-700",
    gold: "bg-gold-100 text-gold-800",
    green: "bg-green-50 text-success",
    gray: "bg-gray-100 text-muted",
    red: "bg-red-50 text-danger",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-lg font-semibold text-navy-700">{title}</h1>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      <div className="no-print flex flex-wrap items-center gap-1.5">{actions}</div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-navy-900/40 p-4 pt-12" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`w-full ${wide ? "max-w-6xl" : "max-w-xl"} rounded-lg bg-white shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between rounded-t-lg bg-navy-500 px-4 py-2.5 text-white">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" aria-label="Đóng" className="text-white/80 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}
