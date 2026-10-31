import { api, friendlyError, type AssetKind, type AssetRunResult, type AssetRunRow } from "@accedu/api";
import { useAssetRuns, useDb } from "@accedu/api/react";
import { ASSET_LABEL, formatAmount, formatDateVN, todayVN } from "@accedu/core";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { CalendarCheck, Eye, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";

const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10);
};
const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Item = AssetRunResult["items"][number];

/**
 * Tính khấu hao TSCĐ / phân bổ CCDC cuối tháng: xem trước từng tài sản, lập một phiếu kế toán ngày cuối tháng
 * (Nợ TK chi phí / Có 214x hoặc 242). Tính lại tháng thì thay phiếu cũ; xóa được lần tính của tháng gần nhất.
 */
export function AssetRunPage({ kind }: { kind: AssetKind }) {
  const { tenant, role, slug } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const L = ASSET_LABEL[kind];
  const [month, setMonth] = useState(todayVN().slice(0, 7));
  const [result, setResult] = useState<AssetRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = canPost(role);
  const runs = useAssetRuns(tenant.id, kind);
  const latest = runs.data?.[0];
  const title = kind === "fixed" ? "Tính khấu hao TSCĐ" : "Phân bổ CCDC";
  const openVoucher = (id: string) => void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: "general/journal-vouchers" }, search: { edit: id } });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["report", tenant.id] }), qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] })]);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api.runAssetDepreciation(db, tenant.id, kind, `${month}-01`, { dryRun });
      setResult(r);
      if (!dryRun) {
        await refresh();
        toast.success(
          r.number
            ? `Đã lập phiếu ${r.number}: ${L.verb} ${formatAmount(Number(r.total))}${r.replaced.length ? ` (thay ${r.replaced.join(", ")})` : ""}`
            : `Tháng này không có ${L.short} cần ${L.verb}`,
        );
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeRun(r: AssetRunRow) {
    if (!window.confirm(`Xóa lần ${L.verb} tháng ${monthLabel(r.month)} (phiếu ${r.number})?`)) return;
    try {
      await api.deleteAssetRun(db, tenant.id, kind, r.month);
      await refresh();
      setResult(null);
      toast.success(`Đã xóa phiếu ${r.number}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const cols = useMemo<ColDef<Item>[]>(
    () => [
      { field: "code", headerName: "Mã", width: 130 },
      { field: "name", headerName: "Tên", flex: 1, minWidth: 200 },
      { field: "department", headerName: "Bộ phận", width: 125 },
      {
        headerName: "Định khoản",
        width: 120,
        valueGetter: (p) => (p.data && !p.node?.rowPinned ? `${p.data.expense_account} / ${p.data.credit_account}` : ""),
      },
      amountCol("cost", L.cost, { width: 125 }),
      amountCol("accumulated_before", `${L.accumulated} trước`, { width: 135 }),
      {
        headerName: "Phần tháng",
        width: 110,
        type: "rightAligned",
        valueGetter: (p) => (!p.data || p.node?.rowPinned ? "" : p.data.days !== null && Number(p.data.fraction) < 1 ? `${p.data.days} ngày` : "Cả tháng"),
      },
      amountCol("amount", `${kind === "fixed" ? "Khấu hao" : "Phân bổ"} tháng này`, { width: 145, cellClass: "num font-semibold" }),
      amountCol("accumulated", L.accumulated, { width: 130 }),
      amountCol("remaining", "Còn lại", { width: 125 }),
      {
        field: "months_left",
        headerName: "Tháng còn",
        width: 100,
        type: "rightAligned",
        valueFormatter: (p) => (p.node?.rowPinned ? "" : formatAmount(Number(p.value), { decimals: 2, blankZero: true })),
      },
    ],
    [kind, L],
  );

  const runCols: ColDef<AssetRunRow>[] = [
    { field: "month", headerName: "Tháng", width: 100, valueFormatter: (p) => (p.value ? monthLabel(String(p.value)) : "") },
    {
      field: "number",
      headerName: "Phiếu kế toán",
      width: 140,
      cellRenderer: (p: ICellRendererParams<AssetRunRow>) =>
        p.data ? (
          <button type="button" className="text-navy-600 underline" onClick={() => openVoucher(p.data!.voucher_id)}>
            {p.data.number}
          </button>
        ) : null,
    },
    { field: "posting_date", headerName: "Ngày", width: 110, valueFormatter: (p) => formatDateVN(p.value as string) },
    { field: "count", headerName: `Số ${L.short}`, width: 100, type: "rightAligned" },
    amountCol("total", "Số tiền", { width: 140 }),
    {
      field: "status",
      headerName: "Trạng thái",
      width: 120,
      cellRenderer: (p: ICellRendererParams<AssetRunRow>) =>
        p.data ? <Badge tone={p.data.status === "posted" ? "green" : "gray"}>{p.data.status === "posted" ? "Đã ghi sổ" : "Chưa ghi sổ"}</Badge> : null,
    },
    {
      headerName: "",
      width: 150,
      cellRenderer: (p: ICellRendererParams<AssetRunRow>) =>
        p.data && allowed && latest && p.data.month === latest.month ? (
          <Button variant="ghost" icon={<Trash2 size={13} />} onClick={() => void removeRun(p.data!)}>
            Xóa tháng này
          </Button>
        ) : null,
    },
  ];

  const items = result?.items ?? [];
  const sum = (k: "cost" | "accumulated_before" | "amount" | "accumulated" | "remaining") => items.reduce((s, r) => s + Number(r[k]), 0);

  return (
    <div className="space-y-3">
      <PageHeader
        title={title}
        subtitle={
          kind === "fixed"
            ? "Cuối tháng lập phiếu kế toán Nợ TK chi phí / Có 214: phần còn lại chia đều cho số tháng còn lại, tháng đầu tính theo số ngày sử dụng"
            : "Cuối tháng lập phiếu kế toán Nợ TK chi phí / Có 242: giá trị CCDC phân bổ đều theo số tháng"
        }
      />
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3">
        <Field label="Tháng">
          <Input
            type="month"
            aria-label={`Tháng ${L.verb}`}
            value={month}
            onChange={(e) => {
              if (!e.target.value) return;
              setMonth(e.target.value);
              setResult(null);
            }}
          />
        </Field>
        <Button variant="secondary" icon={<Eye size={14} />} disabled={busy} onClick={() => void run(true)}>
          Xem trước
        </Button>
        {allowed ? (
          <Button icon={<CalendarCheck size={14} />} disabled={busy || !result?.dry_run || result.count === 0} onClick={() => void run(false)}>
            {result?.replaced.length ? "Lập lại phiếu" : kind === "fixed" ? "Lập phiếu khấu hao" : "Lập phiếu phân bổ"}
          </Button>
        ) : null}
        <p className="pb-2 text-xs text-muted">
          Phiếu kế toán ngày {formatDateVN(monthEnd(month))}, mỗi {L.short} một dòng. Ghi giảm {L.short} trong tháng trước khi tính.
        </p>
      </div>

      {result ? (
        <Card
          title={
            result.dry_run
              ? `Xem trước tháng ${month.slice(5)}/${month.slice(0, 4)}: ${result.count} ${L.short}, ${formatAmount(Number(result.total))}`
              : `Đã lập ${result.number ?? "—"}: ${result.count} ${L.short}, ${formatAmount(Number(result.total))}`
          }
          actions={result.dry_run ? <Badge tone="gray">Chưa ghi</Badge> : <Badge tone="green">Đã ghi sổ</Badge>}
        >
          {result.warnings.map((w) => (
            <p key={w} className="mb-2 text-sm text-warning">
              {w}
            </p>
          ))}
          {result.replaced.length ? (
            <p className="mb-2 text-sm">
              Tháng này đã có phiếu <b>{result.replaced.join(", ")}</b> — {result.dry_run ? "lập lại sẽ thay phiếu đó" : "đã được thay"}.
            </p>
          ) : null}
          {items.length ? (
            <DataGrid<Item>
              rowData={items}
              columnDefs={cols}
              height={340}
              getRowId={(p) => p.data.asset_id}
              pinnedBottomRowData={[
                {
                  asset_id: "tong-cong",
                  code: "",
                  name: "Tổng cộng",
                  cost: sum("cost"),
                  accumulated_before: sum("accumulated_before"),
                  amount: sum("amount"),
                  accumulated: sum("accumulated"),
                  remaining: sum("remaining"),
                } as unknown as Item,
              ]}
            />
          ) : (
            <p className="text-sm text-muted">Không có {L.short} nào cần {L.verb} trong tháng (chưa bắt đầu, tạm dừng, đã ghi giảm hoặc đã hết giá trị).</p>
          )}
        </Card>
      ) : null}

      <Card title={`Các tháng đã ${L.verb}`}>
        {runs.data?.length ? (
          <DataGrid<AssetRunRow> rowData={runs.data} columnDefs={runCols} height={260} getRowId={(p) => p.data.voucher_id} />
        ) : (
          <p className="text-sm text-muted">Chưa {L.verb} tháng nào.</p>
        )}
      </Card>
    </div>
  );
}
