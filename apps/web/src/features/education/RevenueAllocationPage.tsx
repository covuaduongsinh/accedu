import { api, friendlyError, type AllocationResult, type DeferredTuitionRow } from "@accedu/api";
import { useDb, useDeferredTuition, useTrialBalance } from "@accedu/api/react";
import { formatAmount, formatDateVN, todayVN } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { CalendarCheck, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Badge, Button, Card, Field, Input, PageHeader } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";

const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10);
};
const lastMonth = () => {
  const d = new Date(`${todayVN().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

type Item = AllocationResult["items"][number];

/**
 * Phân bổ doanh thu học phí cuối tháng: học phí thu trước (TK 3387) chuyển sang doanh thu 5113 —
 * lớp theo tháng ghi nhận trọn tháng, lớp theo khóa theo số buổi đã học (điểm danh). Một phiếu kế toán mỗi tháng.
 */
export function RevenueAllocationPage() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [month, setMonth] = useState(lastMonth());
  const [result, setResult] = useState<AllocationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = canPost(role);
  const asOf = monthEnd(month);
  const deferred = useDeferredTuition(tenant.id, asOf);
  const tb = useTrialBalance(tenant.id, `${month}-01`, asOf);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api.allocateTuitionRevenue(db, tenant.id, `${month}-01`, { dryRun });
      setResult(r);
      if (!dryRun) {
        await Promise.all([qc.invalidateQueries({ queryKey: ["report", tenant.id] }), qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] })]);
        toast.success(
          r.number
            ? `Đã lập phiếu ${r.number}: ${formatAmount(Number(r.total))} vào doanh thu 5113${r.replaced.length ? ` (thay ${r.replaced.join(", ")})` : ""}`
            : "Tháng này không có học phí cần phân bổ",
        );
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const cols = useMemo<ColDef<Item>[]>(
    () => [
      { field: "class_code", headerName: "Lớp", width: 115 },
      { field: "student_code", headerName: "Mã HV", width: 105 },
      { field: "student_name", headerName: "Học viên", flex: 1, minWidth: 170 },
      { field: "invoice_number", headerName: "Hóa đơn", width: 100 },
      {
        headerName: "Cách tính",
        width: 170,
        valueGetter: (p) =>
          !p.data || p.node?.rowPinned
            ? ""
            : p.data.billing === "monthly"
              ? `Tháng ${p.data.period_start.slice(5, 7)}/${p.data.period_start.slice(0, 4)}`
              : `${p.data.used_in_month ?? 0} buổi trong tháng · ${p.data.used_through ?? 0}/${p.data.sessions ?? 0}`,
      },
      amountCol("bill_amount", "Học phí", { width: 115 }),
      amountCol("recognized_before", "Đã phân bổ", { width: 115 }),
      amountCol("amount", "Phân bổ tháng này", { width: 140, cellClass: "num font-semibold" }),
      amountCol("remaining", "Còn chờ phân bổ", { width: 135 }),
    ],
    [],
  );

  const items = result?.items ?? [];
  const tb3387 = tb.data?.find((x) => x.account_code === "3387");
  const ledger3387 = tb3387 ? Number(tb3387.closing_credit) - Number(tb3387.closing_debit) : 0;
  const sum = (k: "bill_amount" | "recognized_before" | "amount" | "remaining") => items.reduce((s, r) => s + Number(r[k]), 0);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Phân bổ doanh thu học phí"
        subtitle="Cuối tháng chuyển học phí thu trước (TK 3387) sang doanh thu 5113: lớp theo tháng trọn tháng, lớp theo khóa theo số buổi đã học"
      />
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3">
        <Field label="Tháng">
          <Input
            type="month"
            aria-label="Tháng phân bổ"
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
            {result?.replaced.length ? "Lập lại phiếu phân bổ" : "Lập phiếu phân bổ"}
          </Button>
        ) : null}
        <p className="pb-2 text-xs text-muted">Phiếu kế toán ngày {formatDateVN(asOf)}: Nợ 3387 / Có 5113, mỗi dòng một học viên × lớp.</p>
      </div>

      {result ? (
        <Card
          title={
            result.dry_run
              ? `Xem trước tháng ${month.slice(5)}/${month.slice(0, 4)}: ${result.count} dòng, ${formatAmount(Number(result.total))}`
              : `Đã lập ${result.number ?? "—"}: ${result.count} dòng, ${formatAmount(Number(result.total))}`
          }
          actions={result.dry_run ? <Badge tone="gray">Chưa ghi</Badge> : <Badge tone="green">Đã ghi sổ</Badge>}
        >
          {result.replaced.length ? (
            <p className="mb-2 text-sm">
              Tháng này đã có phiếu phân bổ <b>{result.replaced.join(", ")}</b> — {result.dry_run ? "lập lại sẽ thay phiếu đó" : "đã được thay"} (theo điểm danh
              mới nhất).
            </p>
          ) : null}
          {result.later_months ? (
            <p className="mb-2 text-sm text-warning">
              Đã có {result.later_months} tháng sau được phân bổ. Nếu điểm danh tháng này thay đổi, nên lập lại cả các tháng sau.
            </p>
          ) : null}
          <DataGrid<Item>
            rowData={items}
            columnDefs={cols}
            height={340}
            getRowId={(p) => p.data.bill_id}
            pinnedBottomRowData={[
              {
                bill_id: "tong-cong",
                class_code: "",
                student_name: "Tổng cộng",
                bill_amount: sum("bill_amount"),
                recognized_before: sum("recognized_before"),
                amount: sum("amount"),
                remaining: sum("remaining"),
              } as unknown as Item,
            ]}
          />
        </Card>
      ) : null}

      <DeferredCard rows={deferred.data ?? []} asOf={asOf} ledger={ledger3387} />
    </div>
  );
}

function DeferredCard({ rows, asOf, ledger }: { rows: DeferredTuitionRow[]; asOf: string; ledger: number }) {
  const open = rows.filter((r) => Number(r.balance) !== 0);
  const total = open.reduce((s, r) => s + Number(r.balance), 0);
  const diff = ledger - total;
  const cols: ColDef<DeferredTuitionRow>[] = [
    { field: "class_code", headerName: "Lớp", width: 115 },
    { field: "student_code", headerName: "Mã HV", width: 105 },
    { field: "student_name", headerName: "Học viên", flex: 1, minWidth: 170 },
    { field: "invoice_number", headerName: "Hóa đơn", width: 100 },
    amountCol("amount", "Học phí", { width: 120 }),
    amountCol("recognized", "Đã phân bổ", { width: 120 }),
    amountCol("balance", "Chờ phân bổ (3387)", { width: 150, cellClass: "num font-semibold" }),
  ];
  return (
    <Card title={`Học phí chờ phân bổ đến ${formatDateVN(asOf)}`}>
      <div className="mb-2 flex flex-wrap gap-6 text-sm">
        <span>
          Theo phiếu học phí: <b className="num" data-testid="deferred-total">{formatAmount(total)}</b>
        </span>
        <span>
          Số dư sổ cái TK 3387: <b className="num" data-testid="deferred-ledger">{formatAmount(ledger)}</b>
        </span>
        <span className={diff === 0 ? "text-success" : "text-warning"}>
          {diff === 0 ? "Khớp sổ cái" : `Chênh ${formatAmount(diff)} (khoản 3387 khác ngoài học phí)`}
        </span>
      </div>
      {open.length ? (
        <DataGrid<DeferredTuitionRow> rowData={open} columnDefs={cols} height={260} getRowId={(p) => p.data.bill_id} />
      ) : (
        <p className="text-sm text-muted">Không còn học phí chờ phân bổ.</p>
      )}
    </Card>
  );
}
