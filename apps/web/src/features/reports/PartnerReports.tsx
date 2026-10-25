import type { PartnerBalanceRow, PartnerLedgerRow } from "@accedu/api";
import { usePartnerBalances, usePartnerLedger, usePartners } from "@accedu/api/react";
import { formatDateVN } from "@accedu/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ColDef } from "ag-grid-community";
import { FileDown } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Button, Field, Input, PageHeader } from "../../components/ui";
import { monthRange, yearRange } from "../../lib/dates";
import { downloadXlsx } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { ReportFilter } from "./ReportFilter";

type Side = "receivable" | "payable";

const SIDE = {
  receivable: { account: "131", who: "khách hàng", ledgerPath: "sales/receivable-ledger" },
  payable: { account: "331", who: "nhà cung cấp", ledgerPath: "purchase/payable-ledger" },
} as const;

/** Sổ chi tiết công nợ của một đối tượng (FAO: Bán hàng › Sổ chi tiết công nợ của một khách hàng) */
export function PartnerLedgerPage({ side }: { side: Side }) {
  const { tenant } = useTenantCtx();
  const search = useSearch({ strict: false }) as { partner?: string; account?: string; from?: string; to?: string };
  const partners = usePartners(tenant.id);
  const [account, setAccount] = useState(search.account ?? SIDE[side].account);
  const [partnerCode, setPartnerCode] = useState(search.partner ?? "");
  const [range, setRange] = useState(search.from && search.to ? { from: search.from, to: search.to } : monthRange());
  const listId = useId();
  const partner = (partners.data ?? []).find((p) => p.code.toUpperCase() === partnerCode.trim().toUpperCase());
  const rows = usePartnerLedger(tenant.id, account, partner?.id, range.from, range.to);

  const cols = useMemo<ColDef<PartnerLedgerRow>[]>(
    () => [
      dateCol("posting_date", "Ngày ghi sổ", { valueFormatter: (p) => (p.data?.row_kind === "entry" ? formatDateVN(p.value as string) : "") }),
      { field: "voucher_number", headerName: "Số CT", width: 110 },
      {
        field: "description",
        headerName: "Diễn giải",
        flex: 2,
        minWidth: 260,
        cellClass: (p) => (p.data?.row_kind === "entry" ? "" : "font-semibold text-navy-700"),
      },
      { field: "account", headerName: "TK", width: 80 },
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
        title={`Sổ chi tiết công nợ ${SIDE[side].who}`}
        subtitle={
          partner
            ? `${partner.code} — ${partner.name} · TK ${account} · ${formatDateVN(range.from)} – ${formatDateVN(range.to)}`
            : `Chọn ${SIDE[side].who} để xem sổ`
        }
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            disabled={!partner}
            onClick={() =>
              downloadXlsx(
                `cong-no-${partnerCode}-${range.from}-${range.to}.xlsx`,
                ["Ngày", "Số CT", "Diễn giải", "TK", "TK đối ứng", "Nợ", "Có", "Dư Nợ", "Dư Có"],
                (rows.data ?? []).map((r) => [
                  r.row_kind === "entry" ? r.posting_date : "",
                  r.voucher_number ?? "",
                  r.description ?? "",
                  r.account,
                  r.contra_account ?? "",
                  Number(r.debit ?? 0),
                  Number(r.credit ?? 0),
                  Number(r.balance_debit ?? 0),
                  Number(r.balance_credit ?? 0),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <datalist id={listId}>
        {(partners.data ?? [])
          .filter((p) => (side === "receivable" ? p.is_customer || p.is_student : p.is_supplier))
          .map((p) => (
            <option key={p.id} value={p.code}>
              {p.name}
            </option>
          ))}
      </datalist>
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label={side === "receivable" ? "Mã khách" : "Mã NCC"}>
          <Input list={listId} value={partnerCode} onChange={(e) => setPartnerCode(e.target.value)} className="w-40" />
        </Field>
        <Field label="Tài khoản">
          <Input value={account} onChange={(e) => setAccount(e.target.value.trim())} className="w-28" />
        </Field>
      </ReportFilter>
      <DataGrid<PartnerLedgerRow> rowData={partner ? (rows.data ?? []) : []} columnDefs={cols} loading={rows.isLoading && !!partner} height="calc(100vh - 290px)" />
    </div>
  );
}

/** Tổng hợp công nợ theo đối tượng — nhấp đúp một dòng để mở sổ chi tiết */
export function PartnerBalancesPage({ side }: { side: Side }) {
  const { tenant, slug } = useTenantCtx();
  const navigate = useNavigate();
  const [account, setAccount] = useState<string>(SIDE[side].account);
  const [range, setRange] = useState(yearRange());
  const rows = usePartnerBalances(tenant.id, account, range.from, range.to);
  const data = rows.data ?? [];
  const sum = (k: keyof PartnerBalanceRow) => data.reduce((s, r) => s + Number(r[k] ?? 0), 0);

  const cols = useMemo<ColDef<PartnerBalanceRow>[]>(
    () => [
      { field: "partner_code", headerName: "Mã", width: 120 },
      { field: "partner_name", headerName: "Tên đối tượng", flex: 2, minWidth: 220 },
      amountCol("opening_debit", "Dư Nợ đầu kỳ"),
      amountCol("opening_credit", "Dư Có đầu kỳ"),
      amountCol("debit", "PS Nợ"),
      amountCol("credit", "PS Có"),
      amountCol("closing_debit", "Dư Nợ cuối kỳ"),
      amountCol("closing_credit", "Dư Có cuối kỳ"),
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title={`Tổng hợp công nợ ${SIDE[side].who}`}
        subtitle={`TK ${account} · ${formatDateVN(range.from)} – ${formatDateVN(range.to)} · ${data.length} đối tượng · nhấp đúp để xem sổ chi tiết`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadXlsx(
                `tong-hop-cong-no-${account}-${range.from}-${range.to}.xlsx`,
                ["Mã", "Tên đối tượng", "Dư Nợ đầu kỳ", "Dư Có đầu kỳ", "PS Nợ", "PS Có", "Dư Nợ cuối kỳ", "Dư Có cuối kỳ"],
                data.map((r) => [
                  r.partner_code,
                  r.partner_name,
                  Number(r.opening_debit),
                  Number(r.opening_credit),
                  Number(r.debit),
                  Number(r.credit),
                  Number(r.closing_debit),
                  Number(r.closing_credit),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label="Tài khoản">
          <Input value={account} onChange={(e) => setAccount(e.target.value.trim())} className="w-28" />
        </Field>
      </ReportFilter>
      <DataGrid<PartnerBalanceRow>
        rowData={data}
        columnDefs={cols}
        loading={rows.isLoading}
        height="calc(100vh - 290px)"
        getRowId={(p) => p.data.partner_id || "__total"}
        onRowDoubleClicked={(e) =>
          e.data?.partner_id &&
          void navigate({
            to: "/$tenant/$",
            params: { tenant: slug, _splat: SIDE[side].ledgerPath },
            search: { partner: e.data.partner_code, account, from: range.from, to: range.to },
          })
        }
        pinnedBottomRowData={[
          {
            partner_id: "",
            partner_code: "",
            partner_name: "Tổng cộng",
            opening_debit: sum("opening_debit"),
            opening_credit: sum("opening_credit"),
            debit: sum("debit"),
            credit: sum("credit"),
            closing_debit: sum("closing_debit"),
            closing_credit: sum("closing_credit"),
          },
        ]}
      />
    </div>
  );
}
