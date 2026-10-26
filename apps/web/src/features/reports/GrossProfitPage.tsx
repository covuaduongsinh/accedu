import type { GrossProfitRow } from "@accedu/api";
import { useGrossProfit } from "@accedu/api/react";
import { formatAmount, formatDateVN, grossMargin } from "@accedu/core";
import type { ColDef, ValueFormatterParams } from "ag-grid-community";
import { FileDown } from "lucide-react";
import { useMemo, useState } from "react";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Button, Field, PageHeader, Select } from "../../components/ui";
import { monthRange } from "../../lib/dates";
import { downloadXlsx } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { ReportFilter } from "./ReportFilter";

type By = "item" | "customer";

const qty = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return n === 0 ? "" : formatAmount(n, { decimals: Number.isInteger(n) ? 0 : 2 });
};
const pct = (v: unknown) => (v === null || v === undefined || v === "" ? "" : `${formatAmount(Number(v), { decimals: 1 })}%`);

/** Lãi gộp theo mặt hàng / khách hàng: doanh thu (511) − giảm trừ (521) − giá vốn (632) trong kỳ */
export function GrossProfitPage() {
  const { tenant } = useTenantCtx();
  const [range, setRange] = useState(monthRange());
  const [by, setBy] = useState<By>("item");
  const rows = useGrossProfit(tenant.id, range.from, range.to, by);
  const data = rows.data ?? [];
  const sum = (k: keyof GrossProfitRow) => data.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const total = { net: sum("net_revenue"), gross: sum("gross_profit") };

  const cols = useMemo<ColDef<GrossProfitRow>[]>(
    () => [
      { field: "code", headerName: by === "item" ? "Mã hàng" : "Mã khách", width: 120 },
      { field: "name", headerName: by === "item" ? "Tên hàng, dịch vụ" : "Tên khách hàng", flex: 2, minWidth: 220 },
      ...(by === "item"
        ? [
            { field: "uom", headerName: "Đvt", width: 75 } as ColDef<GrossProfitRow>,
            {
              field: "quantity",
              headerName: "SL bán",
              type: "rightAligned",
              width: 95,
              cellClass: "num",
              valueFormatter: (p: ValueFormatterParams) => qty(p.value),
            } as ColDef<GrossProfitRow>,
          ]
        : []),
      amountCol("revenue", "Doanh thu", { width: 140 }),
      amountCol("deductions", "Giảm trừ", { width: 120 }),
      amountCol("net_revenue", "Doanh thu thuần", { width: 160 }),
      amountCol("cogs", "Giá vốn", { width: 140 }),
      amountCol("gross_profit", "Lãi gộp", { width: 140, cellClass: "num font-semibold" }),
      { field: "margin", headerName: "Tỷ suất", type: "rightAligned", width: 95, cellClass: "num", valueFormatter: (p: ValueFormatterParams) => pct(p.value) },
    ],
    [by],
  );

  const headers = [
    by === "item" ? "Mã hàng" : "Mã khách",
    by === "item" ? "Tên hàng, dịch vụ" : "Tên khách hàng",
    ...(by === "item" ? ["Đvt", "SL bán"] : []),
    "Doanh thu",
    "Giảm trừ",
    "Doanh thu thuần",
    "Giá vốn",
    "Lãi gộp",
    "Tỷ suất (%)",
  ];

  return (
    <div>
      <PageHeader
        title="Lãi gộp theo mặt hàng, khách hàng"
        subtitle={`${formatDateVN(range.from)} – ${formatDateVN(range.to)} · doanh thu 511 − giảm trừ 521 − giá vốn 632 · giá vốn hàng bán tính khi ghi sổ hóa đơn`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadXlsx(
                `lai-gop-${by === "item" ? "mat-hang" : "khach-hang"}-${range.from}-${range.to}.xlsx`,
                headers,
                data.map((r) => [
                  r.code ?? "",
                  r.name,
                  ...(by === "item" ? [r.uom ?? "", Number(r.quantity)] : []),
                  Number(r.revenue),
                  Number(r.deductions),
                  Number(r.net_revenue),
                  Number(r.cogs),
                  Number(r.gross_profit),
                  r.margin === null ? "" : Number(r.margin),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label="Xem theo">
          <Select aria-label="Xem lãi gộp theo" value={by} onChange={(e) => setBy(e.target.value as By)} className="w-44">
            <option value="item">Mặt hàng</option>
            <option value="customer">Khách hàng</option>
          </Select>
        </Field>
      </ReportFilter>
      <DataGrid<GrossProfitRow>
        rowData={data}
        columnDefs={cols}
        loading={rows.isLoading}
        height="calc(100vh - 300px)"
        getRowId={(p) => p.data.key_id ?? "__none"}
        pinnedBottomRowData={[
          {
            key_id: "__total",
            code: "",
            name: "Tổng cộng",
            uom: "",
            quantity: "",
            revenue: sum("revenue"),
            deductions: sum("deductions"),
            net_revenue: total.net,
            cogs: sum("cogs"),
            gross_profit: total.gross,
            margin: grossMargin(total.net, total.gross),
          },
        ]}
      />
    </div>
  );
}
