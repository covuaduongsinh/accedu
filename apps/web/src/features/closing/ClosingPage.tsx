import { api, friendlyError, type CarryForwardResult, type PeriodChecklistItem, type PeriodCloseResult, type PeriodClosingRow } from "@accedu/api";
import { useDb, usePeriodChecklist, usePeriodClosings } from "@accedu/api/react";
import { formatAmount, formatDateVN, todayVN } from "@accedu/core";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ArrowRight, CalendarCheck, CheckCircle2, Circle, CircleDashed, Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";

const vnd = (n: number | string | null | undefined) => formatAmount(n === null || n === undefined ? 0 : Number(n));
const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10);
};
/** Ngày 1–10: mặc định tháng trước (thường kết chuyển đầu tháng sau); từ ngày 11: tháng hiện tại */
const defaultMonth = () => {
  const today = todayVN();
  if (Number(today.slice(8, 10)) > 10) return today.slice(0, 7);
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

const STATUS: Record<PeriodChecklistItem["status"], { label: string; tone: "green" | "gold" | "gray"; icon: typeof Circle }> = {
  done: { label: "Đã xong", tone: "green", icon: CheckCircle2 },
  pending: { label: "Cần làm", tone: "gold", icon: Circle },
  na: { label: "Không áp dụng", tone: "gray", icon: CircleDashed },
};

type Item = PeriodCloseResult["items"][number];

/**
 * Cuối kỳ: danh sách việc cuối tháng (tự kiểm tra trạng thái), kết chuyển xác định kết quả kinh doanh
 * (TK doanh thu / chi phí → 911 → 4212), lịch sử kết chuyển, chuyển lợi nhuận năm trước 4212 → 4211.
 */
export function ClosingPage() {
  const { tenant, role, slug } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [month, setMonth] = useState(defaultMonth());
  const [result, setResult] = useState<PeriodCloseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = canPost(role);
  const checklist = usePeriodChecklist(tenant.id, `${month}-01`);
  const closings = usePeriodClosings(tenant.id);
  const latestPl = closings.data?.find((c) => c.kind === "pl");

  const open = (path: string) => void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: path } });
  const openVoucher = (id: string) => void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: "general/journal-vouchers" }, search: { edit: id } });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["report", tenant.id] }), qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] })]);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api.closePeriod(db, tenant.id, `${month}-01`, { dryRun });
      setResult(r);
      if (!dryRun) {
        await refresh();
        toast.success(
          r.number
            ? `Đã kết chuyển tháng ${monthLabel(r.month)}: phiếu ${r.number}, ${Number(r.profit) >= 0 ? "lãi" : "lỗ"} ${vnd(Math.abs(Number(r.profit)))}${r.replaced.length ? ` (thay ${r.replaced.join(", ")})` : ""}`
            : "Tháng này không có doanh thu, chi phí cần kết chuyển",
        );
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: PeriodClosingRow) {
    const what = c.kind === "pl" ? `kết chuyển tháng ${monthLabel(c.month)}` : `chuyển lợi nhuận năm ${c.month.slice(0, 4)}`;
    if (!window.confirm(`Xóa ${what} (phiếu ${c.number})?`)) return;
    try {
      await api.deletePeriodClosing(db, tenant.id, c.kind, c.month);
      await refresh();
      setResult(null);
      toast.success(`Đã xóa phiếu ${c.number}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const items = result?.items ?? [];
  const cols: ColDef<Item>[] = [
    { field: "account", headerName: "TK", width: 90 },
    { field: "name", headerName: "Tên tài khoản", flex: 1, minWidth: 220 },
    {
      field: "balance",
      headerName: "Số dư cuối tháng",
      width: 160,
      type: "rightAligned",
      cellClass: "num",
      valueFormatter: (p) => (p.value === null || p.value === undefined ? "" : `${vnd(Math.abs(Number(p.value)))} ${Number(p.value) > 0 ? "Nợ" : "Có"}`),
    },
    { headerName: "Định khoản", width: 130, valueGetter: (p) => (p.data ? `${p.data.debit_account} / ${p.data.credit_account}` : "") },
    amountCol("amount", "Số tiền kết chuyển", { width: 160, cellClass: "num font-semibold" }),
  ];
  const historyCols: ColDef<PeriodClosingRow>[] = [
    { field: "kind", headerName: "Loại", width: 210, valueFormatter: (p) => (p.value === "pl" ? "Kết chuyển 911" : "Chuyển lợi nhuận năm trước") },
    { field: "month", headerName: "Kỳ", width: 95, valueFormatter: (p) => (p.data?.kind === "carry" ? `Năm ${String(p.value).slice(0, 4)}` : monthLabel(String(p.value))) },
    {
      field: "number",
      headerName: "Phiếu",
      width: 110,
      cellRenderer: (p: ICellRendererParams<PeriodClosingRow>) =>
        p.data ? (
          <button type="button" className="text-navy-600 underline" onClick={() => openVoucher(p.data!.voucher_id)}>
            {p.data.number}
          </button>
        ) : null,
    },
    amountCol("revenue", "Doanh thu", { width: 140 }),
    amountCol("expense", "Chi phí", { width: 140 }),
    amountCol("profit", "Lãi (lỗ)", { width: 140, cellClass: "num font-semibold" }),
    {
      headerName: "",
      width: 170,
      cellRenderer: (p: ICellRendererParams<PeriodClosingRow>) =>
        p.data && allowed && (p.data.kind === "carry" || p.data.month === latestPl?.month) ? (
          <Button variant="ghost" icon={<Trash2 size={13} />} onClick={() => void remove(p.data!)}>
            Xóa
          </Button>
        ) : null,
    },
  ];

  const pending = checklist.data?.pending ?? 0;
  return (
    <div className="space-y-3">
      <PageHeader title="Cuối kỳ" subtitle="Việc cuối tháng trước khi khóa sổ, kết chuyển doanh thu – chi phí sang 911 để ra lãi lỗ, chuyển lợi nhuận năm trước" />
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3">
        <Field label="Tháng">
          <Input
            type="month"
            aria-label="Tháng cuối kỳ"
            value={month}
            onChange={(e) => {
              if (!e.target.value) return;
              setMonth(e.target.value);
              setResult(null);
            }}
          />
        </Field>
        <p className="pb-2 text-sm">
          {checklist.data ? (
            pending ? (
              <span className="text-warning" data-testid="closing-pending">
                Còn {pending} việc cần làm
              </span>
            ) : (
              <span className="text-success" data-testid="closing-pending">
                Đã xong mọi việc cuối tháng
              </span>
            )
          ) : null}
        </p>
      </div>

      <Card title={`Việc cuối tháng ${month.slice(5)}/${month.slice(0, 4)}`}>
        <ol className="divide-y divide-line" data-testid="closing-checklist">
          {(checklist.data?.items ?? []).map((it, i) => {
            const st = STATUS[it.status];
            const Icon = st.icon;
            return (
              <li key={it.key} className="flex flex-wrap items-center gap-3 py-2" data-testid={`check-${it.key}`}>
                <Icon size={18} className={it.status === "done" ? "text-success" : it.status === "pending" ? "text-gold-600" : "text-muted"} />
                <div className="min-w-64 flex-1">
                  <p className="text-sm font-medium">
                    {i + 1}. {it.label}
                  </p>
                  <p className="text-xs text-muted">{it.detail}</p>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
                <Button variant="ghost" icon={<ArrowRight size={14} />} onClick={() => open(it.path)}>
                  Mở
                </Button>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Kết chuyển xác định kết quả kinh doanh">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={<Eye size={14} />} disabled={busy} onClick={() => void run(true)}>
            Xem trước
          </Button>
          {allowed ? (
            <Button icon={<CalendarCheck size={14} />} disabled={busy || !result?.dry_run || result.count === 0} onClick={() => void run(false)}>
              {result?.replaced.length ? "Kết chuyển lại" : "Kết chuyển & ghi sổ"}
            </Button>
          ) : null}
          <p className="text-xs text-muted">
            Phiếu kế toán ngày {formatDateVN(monthEnd(month))}: TK doanh thu, thu nhập (dư Có) → Có 911; TK chi phí (dư Nợ) → Nợ 911; lãi / lỗ → 4212.
          </p>
        </div>
        {result ? (
          <>
            <div className="mb-2 flex flex-wrap gap-6 text-sm" data-testid="closing-result">
              <span>
                Doanh thu, thu nhập: <b className="tabular-nums">{vnd(result.revenue)}</b>
              </span>
              <span>
                Chi phí: <b className="tabular-nums">{vnd(result.expense)}</b>
              </span>
              {Number(result.other) ? (
                <span>
                  911 hạch toán tay: <b className="tabular-nums">{vnd(result.other)}</b>
                </span>
              ) : null}
              <span>
                {Number(result.profit) >= 0 ? "Lãi" : "Lỗ"}:{" "}
                <b className={`tabular-nums ${Number(result.profit) >= 0 ? "text-success" : "text-danger"}`} data-testid="closing-profit">
                  {vnd(Math.abs(Number(result.profit)))}
                </b>
              </span>
              {result.dry_run ? <Badge tone="gray">Chưa ghi</Badge> : <Badge tone="green">Đã ghi sổ {result.number}</Badge>}
            </div>
            {result.warnings.map((w) => (
              <p key={w} className="mb-1 text-sm text-warning">
                {w}
              </p>
            ))}
            {result.replaced.length ? (
              <p className="mb-2 text-sm">
                Tháng này đã kết chuyển ở phiếu <b>{result.replaced.join(", ")}</b> — {result.dry_run ? "kết chuyển lại sẽ thay phiếu đó" : "đã được thay"}.
              </p>
            ) : null}
            {items.length ? (
              <DataGrid<Item> rowData={items} columnDefs={cols} height={Math.min(420, 60 + items.length * 34)} getRowId={(p) => p.data.account} />
            ) : (
              <p className="text-sm text-muted">Các TK doanh thu, chi phí không còn số dư — không có gì cần kết chuyển.</p>
            )}
          </>
        ) : null}
      </Card>

      <Card title="Lịch sử kết chuyển">
        {closings.data?.length ? (
          <DataGrid<PeriodClosingRow> rowData={closings.data} columnDefs={historyCols} height={240} getRowId={(p) => p.data.voucher_id} />
        ) : (
          <p className="text-sm text-muted">Chưa kết chuyển kỳ nào.</p>
        )}
      </Card>

      <CarryForwardCard month={month} allowed={allowed} onDone={refresh} />
    </div>
  );
}

/** Đầu năm tài chính: chuyển số dư 4212 (lợi nhuận năm trước) sang 4211 */
function CarryForwardCard({ month, allowed, onDone }: { month: string; allowed: boolean; onDone: () => Promise<unknown> }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const [result, setResult] = useState<CarryForwardResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fm = tenant.fiscal_year_start_month ?? 1;
  const y = Number(month.slice(0, 4));
  const start = Number(month.slice(5, 7)) >= fm ? y : y - 1;
  const yearStart = `${start}-${String(fm).padStart(2, "0")}-01`;

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api.carryForwardProfit(db, tenant.id, yearStart, { dryRun });
      setResult(r);
      if (!dryRun) {
        await onDone();
        toast.success(r.number ? `Đã chuyển ${vnd(Math.abs(Number(r.profit)))} sang 4211 (phiếu ${r.number})` : "4212 không có số dư cần chuyển");
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`Đầu năm tài chính ${formatDateVN(yearStart)}: chuyển lợi nhuận năm trước (4212 → 4211)`}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button variant="secondary" icon={<Eye size={14} />} disabled={busy} onClick={() => void run(true)}>
          Xem số dư 4212
        </Button>
        {allowed ? (
          <Button variant="secondary" disabled={busy || !result?.dry_run || !Number(result.profit)} onClick={() => void run(false)}>
            Chuyển sang 4211
          </Button>
        ) : null}
        {result ? (
          <span>
            {Number(result.profit) >= 0 ? "Lợi nhuận" : "Lỗ"} năm trước: <b className="tabular-nums">{vnd(Math.abs(Number(result.profit)))}</b>
            {result.dry_run ? "" : ` — đã chuyển (${result.number ?? "không có phiếu"})`}
          </span>
        ) : (
          <span className="text-xs text-muted">Làm một lần sau khi đã kết chuyển 911 tháng cuối năm trước; phiếu kế toán ngày đầu năm.</span>
        )}
      </div>
      {result?.warnings.map((w) => (
        <p key={w} className="mt-2 text-sm text-warning">
          {w}
        </p>
      ))}
    </Card>
  );
}
