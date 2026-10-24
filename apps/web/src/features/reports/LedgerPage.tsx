import type { LedgerRow } from "@accedu/api";
import { useAccountLedger, useAccounts } from "@accedu/api/react";
import { formatDateVN } from "@accedu/core";
import { useSearch } from "@tanstack/react-router";
import type { ColDef } from "ag-grid-community";
import { FileDown } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Button, Field, Input, PageHeader } from "../../components/ui";
import { monthRange } from "../../lib/dates";
import { downloadCsv } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { ReportFilter } from "./ReportFilter";

export function LedgerPage({ defaultAccount = "111", title = "Sổ chi tiết của một tài khoản" }: { defaultAccount?: string; title?: string }) {
  const { tenant } = useTenantCtx();
  const search = useSearch({ strict: false }) as { account?: string };
  const [account, setAccount] = useState(search.account ?? defaultAccount);
  const [range, setRange] = useState(monthRange());
  const accounts = useAccounts(tenant.id);
  const rows = useAccountLedger(tenant.id, account, range.from, range.to);
  const listId = useId();
  const accountName = accounts.data?.find((a) => a.code === account)?.name ?? "";

  const cols = useMemo<ColDef<LedgerRow>[]>(
    () => [
      dateCol("posting_date", "Ngày ghi sổ", { valueFormatter: (p) => (p.data?.row_kind === "entry" ? formatDateVN(p.value as string) : "") }),
      { field: "voucher_number", headerName: "Số CT", width: 110 },
      {
        field: "description",
        headerName: "Diễn giải",
        flex: 2,
        minWidth: 240,
        cellClass: (p) => (p.data?.row_kind === "entry" ? "" : "font-semibold text-navy-700"),
      },
      { field: "account", headerName: "TK", width: 90 },
      { field: "contra_account", headerName: "TK đối ứng", width: 110 },
      amountCol("debit", "Phát sinh Nợ"),
      amountCol("credit", "Phát sinh Có"),
      amountCol("balance_debit", "Dư Nợ"),
      amountCol("balance_credit", "Dư Có"),
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`Tài khoản ${account} — ${accountName} · ${formatDateVN(range.from)} – ${formatDateVN(range.to)}`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadCsv(
                `so-chi-tiet-${account}-${range.from}-${range.to}.csv`,
                ["Ngày", "Số CT", "Diễn giải", "TK", "TK đối ứng", "Nợ", "Có", "Dư Nợ", "Dư Có"],
                (rows.data ?? []).map((r) => [r.posting_date, r.voucher_number ?? "", r.description ?? "", r.account, r.contra_account ?? "", Number(r.debit ?? 0), Number(r.credit ?? 0), Number(r.balance_debit ?? 0), Number(r.balance_credit ?? 0)]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <datalist id={listId}>
        {(accounts.data ?? []).map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </datalist>
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label="Tài khoản">
          <Input list={listId} value={account} onChange={(e) => setAccount(e.target.value.trim())} className="w-40" />
        </Field>
      </ReportFilter>
      <DataGrid<LedgerRow> rowData={rows.data ?? []} columnDefs={cols} loading={rows.isLoading} height="calc(100vh - 290px)" />
    </div>
  );
}
