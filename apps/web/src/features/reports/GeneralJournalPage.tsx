import type { JournalRow } from "@accedu/api";
import { useGeneralJournal } from "@accedu/api/react";
import { formatDateVN } from "@accedu/core";
import type { ColDef } from "ag-grid-community";
import { FileDown } from "lucide-react";
import { useMemo, useState } from "react";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Button, PageHeader } from "../../components/ui";
import { monthRange } from "../../lib/dates";
import { downloadXlsx } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { ReportFilter } from "./ReportFilter";

export function GeneralJournalPage() {
  const { tenant } = useTenantCtx();
  const [range, setRange] = useState(monthRange());
  const rows = useGeneralJournal(tenant.id, range.from, range.to);
  const total = (rows.data ?? []).reduce((s, r) => s + Number(r.debit), 0);

  const cols = useMemo<ColDef<JournalRow>[]>(
    () => [
      dateCol("posting_date", "Ngày ghi sổ"),
      { field: "voucher_number", headerName: "Số chứng từ", width: 120 },
      dateCol("issue_date", "Ngày chứng từ"),
      { field: "description", headerName: "Diễn giải", flex: 2, minWidth: 240 },
      { field: "account", headerName: "Tài khoản", width: 100 },
      { field: "contra_account", headerName: "TK đối ứng", width: 110 },
      amountCol("debit", "Phát sinh Nợ"),
      amountCol("credit", "Phát sinh Có"),
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Sổ nhật ký chung"
        subtitle={`Từ ${formatDateVN(range.from)} đến ${formatDateVN(range.to)}`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadXlsx(
                `nhat-ky-chung-${range.from}-${range.to}.xlsx`,
                ["Ngày ghi sổ", "Số CT", "Ngày CT", "Diễn giải", "TK", "TK đối ứng", "Nợ", "Có"],
                (rows.data ?? []).map((r) => [r.posting_date, r.voucher_number, r.issue_date, r.description ?? "", r.account, r.contra_account ?? "", Number(r.debit), Number(r.credit)]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange} />
      <DataGrid<JournalRow>
        rowData={rows.data ?? []}
        columnDefs={cols}
        loading={rows.isLoading}
        pinnedBottomRowData={[{ description: "Cộng phát sinh", debit: total, credit: total } as unknown as JournalRow]}
        height="calc(100vh - 290px)"
      />
    </div>
  );
}
