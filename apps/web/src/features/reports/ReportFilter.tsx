import type { ReactNode } from "react";
import { Field, Input } from "../../components/ui";

export function ReportFilter({
  from,
  to,
  onChange,
  children,
}: {
  from: string;
  to: string;
  onChange: (r: { from: string; to: string }) => void;
  children?: ReactNode;
}) {
  return (
    <div className="no-print mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
      <Field label="Từ ngày">
        <Input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
      </Field>
      <Field label="Đến ngày">
        <Input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} />
      </Field>
      {children}
    </div>
  );
}
