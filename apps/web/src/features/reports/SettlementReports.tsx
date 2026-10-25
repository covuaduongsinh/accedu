import type { AgingRow, VatListingRow } from "@accedu/api";
import { useAging, useVatListing } from "@accedu/api/react";
import { AGING_BUCKETS, VAT_CODES, formatDateVN, todayVN, type VatCode } from "@accedu/core";
import { useNavigate } from "@tanstack/react-router";
import type { ColDef } from "ag-grid-community";
import { FileDown } from "lucide-react";
import { useMemo, useState } from "react";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Button, Field, Input, PageHeader } from "../../components/ui";
import { monthRange, yearRange } from "../../lib/dates";
import { downloadXlsx } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { ReportFilter } from "./ReportFilter";

type Side = "receivable" | "payable";

const SIDE = {
  receivable: { account: "131", who: "khách hàng", title: "Tuổi nợ phải thu", ledgerPath: "sales/receivable-ledger" },
  payable: { account: "331", who: "nhà cung cấp", title: "Tuổi nợ phải trả", ledgerPath: "purchase/payable-ledger" },
} as const;

const BUCKETS = Object.keys(AGING_BUCKETS) as (keyof typeof AGING_BUCKETS)[];

/** Báo cáo tuổi nợ theo đối tượng — chia số còn nợ của từng hóa đơn theo số ngày quá hạn thanh toán */
export function AgingPage({ side }: { side: Side }) {
  const { tenant, slug } = useTenantCtx();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState(todayVN());
  const [account, setAccount] = useState<string>(SIDE[side].account);
  const rows = useAging(tenant.id, side, asOf, account);
  const data = rows.data ?? [];
  const sum = (k: keyof AgingRow) => data.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const overdue = data.reduce((s, r) => s + Number(r.d1_30) + Number(r.d31_60) + Number(r.d61_90) + Number(r.over_90), 0);

  const cols = useMemo<ColDef<AgingRow>[]>(
    () => [
      { field: "partner_code", headerName: "Mã", width: 110 },
      { field: "partner_name", headerName: `Tên ${SIDE[side].who}`, flex: 2, minWidth: 220 },
      ...BUCKETS.map((b) => amountCol(b, AGING_BUCKETS[b], { width: 130, ...(b === "not_due" ? {} : { cellClass: "num text-danger" }) })),
      amountCol("unallocated", "Không theo hóa đơn", { width: 150, headerTooltip: "Số dư đầu kỳ, tiền trả trước, phiếu thu/chi không chọn hóa đơn" }),
      amountCol("total", "Tổng còn nợ", { width: 140, cellClass: "num font-semibold" }),
    ],
    [side],
  );

  return (
    <div>
      <PageHeader
        title={SIDE[side].title}
        subtitle={`TK ${account} · tính đến ${formatDateVN(asOf)} · ${data.length} đối tượng · quá hạn ${overdue.toLocaleString("vi-VN")} · nhấp đúp để xem sổ chi tiết`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadXlsx(
                `tuoi-no-${account}-${asOf}.xlsx`,
                ["Mã", "Tên", ...BUCKETS.map((b) => AGING_BUCKETS[b]), "Không theo hóa đơn", "Tổng còn nợ"],
                data.map((r) => [r.partner_code, r.partner_name, ...BUCKETS.map((b) => Number(r[b])), Number(r.unallocated), Number(r.total)]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <div className="no-print mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
        <Field label="Tính đến ngày">
          <Input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </Field>
        <Field label="Tài khoản">
          <Input value={account} onChange={(e) => setAccount(e.target.value.trim())} className="w-28" />
        </Field>
        <p className="max-w-xl text-xs text-muted">
          Tuổi nợ tính từ hạn thanh toán của hóa đơn (thiếu hạn thì từ ngày hóa đơn). Phiếu thu/chi phải chọn hóa đơn ở cột “Trừ hóa đơn” thì mới trừ đúng
          hóa đơn; phần còn lại nằm ở cột “Không theo hóa đơn”.
        </p>
      </div>
      <DataGrid<AgingRow>
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
            search: { partner: e.data.partner_code, account, from: yearRange(asOf).from, to: asOf },
          })
        }
        pinnedBottomRowData={[
          {
            partner_id: "",
            partner_code: "",
            partner_name: "Tổng cộng",
            not_due: sum("not_due"),
            d1_30: sum("d1_30"),
            d31_60: sum("d31_60"),
            d61_90: sum("d61_90"),
            over_90: sum("over_90"),
            unallocated: sum("unallocated"),
            total: sum("total"),
          },
        ]}
      />
    </div>
  );
}

const VAT_GROUPS: Record<number, string> = {
  1: "Hàng hóa, dịch vụ không chịu thuế GTGT",
  2: "Hàng hóa, dịch vụ chịu thuế suất 0%",
  3: "Hàng hóa, dịch vụ chịu thuế suất 5%",
  4: "Hàng hóa, dịch vụ chịu thuế suất 8%",
  5: "Hàng hóa, dịch vụ chịu thuế suất 10%",
  6: "Hàng hóa, dịch vụ không phải kê khai, tính nộp thuế GTGT",
};

/** Đường dẫn màn hình cập nhật chứng từ theo loại — nhấp đúp bảng kê để mở chứng từ */
const VOUCHER_PATH: Record<string, string> = {
  HDB: "sales/invoices",
  HDV: "sales/service-invoices",
  HDM: "purchase/invoices",
  HMV: "purchase/service-invoices",
  PT: "cash/receipts",
  PC: "cash/payments",
  BC: "cash/bank-credits",
  BN: "cash/bank-debits",
};

type VatDisplayRow = Partial<VatListingRow> & { row_kind: "group" | "entry" | "subtotal"; stt?: number | string; label?: string };

/** Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ bán ra / mua vào — nhóm theo thuế suất */
export function VatListingPage({ direction }: { direction: "out" | "in" }) {
  const { tenant, slug } = useTenantCtx();
  const navigate = useNavigate();
  const [range, setRange] = useState(monthRange());
  const rows = useVatListing(tenant.id, direction, range.from, range.to);
  const data = useMemo(() => rows.data ?? [], [rows.data]);
  const sale = direction === "out";

  const display = useMemo<VatDisplayRow[]>(() => {
    const out: VatDisplayRow[] = [];
    const groups = [...new Set(data.map((r) => r.group_order))];
    groups.forEach((g, gi) => {
      const items = data.filter((r) => r.group_order === g);
      out.push({ row_kind: "group", stt: gi + 1, label: VAT_GROUPS[g] ?? items[0]?.vat_code ?? "" });
      items.forEach((r, i) => out.push({ ...r, row_kind: "entry", stt: i + 1 }));
      out.push({
        row_kind: "subtotal",
        label: "Tổng",
        net_amount: items.reduce((s, r) => s + Number(r.net_amount), 0),
        vat_amount: items.reduce((s, r) => s + Number(r.vat_amount), 0),
      });
    });
    return out;
  }, [data]);
  const totalNet = data.reduce((s, r) => s + Number(r.net_amount), 0);
  const totalVat = data.reduce((s, r) => s + Number(r.vat_amount), 0);

  const cols = useMemo<ColDef<VatDisplayRow>[]>(
    () => [
      { field: "stt", headerName: "STT", width: 64 },
      {
        field: "invoice_series",
        headerName: "Ký hiệu HĐ",
        width: 120,
        colSpan: (p) => (p.data?.row_kind === "entry" ? 1 : 7),
        valueGetter: (p) => (p.data?.row_kind === "entry" ? p.data.invoice_series : p.data?.label),
        cellClass: (p) => (p.data?.row_kind === "entry" ? "" : "font-semibold text-navy-700"),
      },
      { field: "invoice_number", headerName: "Số HĐ", width: 110 },
      dateCol("invoice_date", "Ngày HĐ"),
      { field: "partner_name", headerName: sale ? "Tên người mua" : "Tên người bán", flex: 2, minWidth: 200 },
      { field: "partner_tax_code", headerName: sale ? "MST người mua" : "MST người bán", width: 130 },
      { field: "item_description", headerName: "Mặt hàng", flex: 1, minWidth: 180 },
      { field: "voucher_number", headerName: "Số CT", width: 100 },
      amountCol("net_amount", "Doanh số chưa thuế", { width: 150 }),
      {
        field: "vat_code",
        headerName: "Thuế suất",
        width: 150,
        valueFormatter: (p) => (p.value ? (VAT_CODES[p.value as VatCode]?.label ?? String(p.value)) : ""),
      },
      amountCol("vat_amount", "Thuế GTGT", { width: 130 }),
    ],
    [sale],
  );

  const title = sale ? "Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ bán ra" : "Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ mua vào";
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`${formatDateVN(range.from)} – ${formatDateVN(range.to)} · ${data.length} dòng · chứng từ đã ghi sổ, theo ngày hạch toán · nhấp đúp để mở chứng từ`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadXlsx(
                `bang-ke-${sale ? "ban-ra" : "mua-vao"}-${range.from}-${range.to}.xlsx`,
                ["Nhóm", "Ký hiệu HĐ", "Số HĐ", "Ngày HĐ", sale ? "Tên người mua" : "Tên người bán", "MST", "Mặt hàng", "Số CT", "Doanh số chưa thuế", "Thuế suất", "Thuế GTGT"],
                data.map((r) => [
                  VAT_GROUPS[r.group_order] ?? r.vat_code,
                  r.invoice_series ?? "",
                  r.invoice_number ?? "",
                  r.invoice_date,
                  r.partner_name ?? "",
                  r.partner_tax_code ?? "",
                  r.item_description ?? "",
                  r.voucher_number,
                  Number(r.net_amount),
                  VAT_CODES[r.vat_code as VatCode]?.label ?? r.vat_code,
                  Number(r.vat_amount),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange} />
      <DataGrid<VatDisplayRow>
        rowData={display}
        columnDefs={cols}
        // Dòng nhóm/tổng xen giữa: không sắp xếp, không lọc
        defaultColDef={{ sortable: false, filter: false, resizable: true }}
        loading={rows.isLoading}
        height="calc(100vh - 290px)"
        getRowClass={(p) => (p.data?.row_kind === "entry" ? "" : "bg-navy-50")}
        onRowDoubleClicked={(e) => {
          const path = e.data?.voucher_type ? VOUCHER_PATH[e.data.voucher_type] : undefined;
          if (e.data?.row_kind === "entry" && path && e.data.voucher_id)
            void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: path }, search: { edit: e.data.voucher_id } });
        }}
        pinnedBottomRowData={[{ row_kind: "subtotal", label: "Tổng cộng", net_amount: totalNet, vat_amount: totalVat }]}
      />
    </div>
  );
}
