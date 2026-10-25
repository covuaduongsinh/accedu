import type { TrialBalanceRow } from "@accedu/api";
import { useTrialBalance } from "@accedu/api/react";
import { formatDateVN } from "@accedu/core";
import { useNavigate } from "@tanstack/react-router";
import type { ColDef, ColGroupDef } from "ag-grid-community";
import { FileDown, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Button, Field, PageHeader, Select } from "../../components/ui";
import { monthRange } from "../../lib/dates";
import { downloadXlsx } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { ReportFilter } from "./ReportFilter";

const NUM_KEYS = ["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"] as const;

export function TrialBalancePage() {
  const { tenant, slug } = useTenantCtx();
  const [range, setRange] = useState(monthRange());
  const [level, setLevel] = useState(9);
  const tb = useTrialBalance(tenant.id, range.from, range.to, level);
  const navigate = useNavigate();

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const k of NUM_KEYS) t[k] = (tb.data ?? []).filter((r) => r.level === 1).reduce((s, r) => s + Number(r[k]), 0);
    return t;
  }, [tb.data]);
  const balanced = totals.debit === totals.credit && totals.closing_debit === totals.closing_credit;

  const cols = useMemo<(ColDef<TrialBalanceRow> | ColGroupDef<TrialBalanceRow>)[]>(
    () => [
      { field: "account_code", headerName: "Tài khoản", width: 110, pinned: "left", cellClass: (p) => (p.data?.level === 1 ? "font-semibold text-navy-700" : "") },
      {
        field: "account_name",
        headerName: "Tên tài khoản",
        minWidth: 240,
        flex: 1,
        cellRenderer: (p: { data: TrialBalanceRow }) => <span style={{ paddingLeft: (p.data.level - 1) * 14 }}>{p.data.account_name}</span>,
      },
      { headerName: "Số dư đầu kỳ", children: [amountCol("opening_debit", "Nợ"), amountCol("opening_credit", "Có")] },
      { headerName: "Phát sinh trong kỳ", children: [amountCol("debit", "Nợ"), amountCol("credit", "Có")] },
      { headerName: "Số dư cuối kỳ", children: [amountCol("closing_debit", "Nợ"), amountCol("closing_credit", "Có")] },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Bảng cân đối phát sinh các tài khoản"
        subtitle={`Từ ${formatDateVN(range.from)} đến ${formatDateVN(range.to)} · ${balanced ? "✓ Cân" : "⚠ Không cân"}`}
        actions={
          <>
            <Button variant="secondary" icon={<Printer size={14} />} onClick={() => window.print()}>
              In
            </Button>
            <Button
              variant="secondary"
              icon={<FileDown size={14} />}
              onClick={() =>
                downloadXlsx(
                  `can-doi-phat-sinh-${range.from}-${range.to}.xlsx`,
                  ["Tài khoản", "Tên tài khoản", "Dư Nợ đầu kỳ", "Dư Có đầu kỳ", "PS Nợ", "PS Có", "Dư Nợ cuối kỳ", "Dư Có cuối kỳ"],
                  (tb.data ?? []).map((r) => [r.account_code, r.account_name, ...NUM_KEYS.map((k) => Number(r[k]))]),
                )
              }
            >
              Xuất Excel
            </Button>
          </>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label="Xem tài khoản có bậc ≤">
          <Select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={9}>Tất cả</option>
          </Select>
        </Field>
      </ReportFilter>
      <DataGrid<TrialBalanceRow>
        rowData={tb.data ?? []}
        columnDefs={cols}
        loading={tb.isLoading}
        getRowId={(p) => p.data.account_code || "__total"}
        pinnedBottomRowData={[{ account_code: "", account_name: "Tổng cộng", level: 1, is_postable: false, ...totals } as unknown as TrialBalanceRow]}
        onRowDoubleClicked={(e) =>
          e.data?.account_code &&
          void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: "general/ledger" }, search: { account: e.data.account_code } })
        }
        height="calc(100vh - 290px)"
      />
    </div>
  );
}
