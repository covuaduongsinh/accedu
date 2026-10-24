import { AG_GRID_LOCALE_VN } from "@ag-grid-community/locale";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridOptions,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { formatAmount, formatDateVN } from "@accedu/core";

ModuleRegistry.registerModules([AllCommunityModule]);

/** Theme AG Grid theo nhận diện Dương Sinh */
export const gridTheme = themeQuartz.withParams({
  accentColor: "#2B3990",
  headerBackgroundColor: "#eef0fa",
  headerTextColor: "#1d2662",
  fontFamily: "Roboto, 'Segoe UI', sans-serif",
  fontSize: 13,
  rowHeight: 32,
  headerHeight: 34,
  borderColor: "#d9dce5",
  oddRowBackgroundColor: "#fafbfe",
  selectedRowBackgroundColor: "#f9edc2",
});

export const amountCol = (field: string, headerName: string, extra: Partial<ColDef> = {}): ColDef => ({
  field,
  headerName,
  type: "rightAligned",
  width: 140,
  valueFormatter: (p: ValueFormatterParams) => formatAmount(p.value === null || p.value === undefined ? null : Number(p.value), { blankZero: true }),
  cellClass: "num",
  ...extra,
});

export const dateCol = (field: string, headerName: string, extra: Partial<ColDef> = {}): ColDef => ({
  field,
  headerName,
  width: 110,
  valueFormatter: (p: ValueFormatterParams) => formatDateVN(p.value as string),
  ...extra,
});

export function DataGrid<T>(props: AgGridReactProps<T> & { height?: number | string }) {
  const { height = "calc(100vh - 210px)", ...rest } = props;
  const defaults: GridOptions<T> = {
    theme: gridTheme,
    localeText: AG_GRID_LOCALE_VN,
    animateRows: false,
    suppressCellFocus: false,
    defaultColDef: { sortable: true, resizable: true, filter: true },
  };
  return (
    <div style={{ height }} className="w-full">
      <AgGridReact<T> {...defaults} {...rest} />
    </div>
  );
}
