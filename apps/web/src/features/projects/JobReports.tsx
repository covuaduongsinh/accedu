import type { JobLedgerRow, JobPnlRow, JobRow } from "@accedu/api";
import { useJobLedger, useJobPnl, useJobs } from "@accedu/api/react";
import { formatAmount, formatDateVN, grossMargin } from "@accedu/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { CellClassParams, ColDef, ValueFormatterParams } from "ag-grid-community";
import { FileDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Button, Field, Modal, PageHeader, Select } from "../../components/ui";
import { monthRange } from "../../lib/dates";
import { downloadXlsx } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { JOB_KIND } from "../catalogs/JobsPage";
import { ReportFilter } from "../reports/ReportFilter";
import { voucherPath } from "../vouchers/paths";

const NONE = "__none";
const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const pct = (v: unknown) => (v === null || v === undefined || v === "" ? "" : `${formatAmount(Number(v), { decimals: 1 })}%`);
/** Lãi đậm, lỗ đỏ */
const profitClass = (p: CellClassParams) => (n(p.value) < 0 ? "num font-semibold text-danger" : "num font-semibold");

/** Mở chứng từ từ sổ / báo cáo */
export function useOpenVoucher() {
  const navigate = useNavigate();
  const { slug } = useTenantCtx();
  return useCallback(
    (type: string | null | undefined, id: string | null | undefined) => {
      if (id) void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: voucherPath(type) }, search: { edit: id } });
    },
    [navigate, slug],
  );
}

// ---------------------------------------------------------------------------- Lãi lỗ theo vụ việc
type KindFilter = JobRow["kind"] | "";

/** Lãi lỗ theo vụ việc (lớp, khóa, giải đấu, hợp đồng): doanh thu − giảm trừ − chi phí trong kỳ */
export function JobPnlPage() {
  const { tenant } = useTenantCtx();
  const [range, setRange] = useState(monthRange());
  const [kind, setKind] = useState<KindFilter>("");
  const rows = useJobPnl(tenant.id, range.from, range.to, kind || null);
  const data = rows.data ?? [];
  const [open, setOpen] = useState<JobPnlRow | null>(null);
  const sum = (k: keyof JobPnlRow) => data.reduce((s, r) => s + n(r[k]), 0);
  const totalNet = sum("net_revenue");
  const totalProfit = sum("profit");

  const cols = useMemo<ColDef<JobPnlRow>[]>(
    () => [
      { field: "code", headerName: "Mã", width: 130 },
      {
        field: "name",
        headerName: "Tên vụ việc",
        flex: 2,
        minWidth: 220,
        cellClass: (p) => (p.data?.job_id === null ? "italic text-muted" : ""),
      },
      { field: "kind", headerName: "Loại", width: 150, valueFormatter: (p) => (p.value ? JOB_KIND[p.value as JobRow["kind"]] : "") },
      amountCol("revenue", "Doanh thu", { width: 135 }),
      amountCol("deductions", "Giảm trừ", { width: 110 }),
      amountCol("cost", "Chi phí", { width: 135 }),
      amountCol("profit", "Lãi (lỗ)", { width: 135, cellClass: profitClass }),
      { field: "margin", headerName: "Tỷ suất", type: "rightAligned", width: 95, cellClass: "num", valueFormatter: (p: ValueFormatterParams) => pct(p.value) },
      amountCol("deferred", "Học phí chưa ghi nhận (3387)", { width: 170, headerTooltip: "Số dư Có TK 3387 của vụ việc đến cuối kỳ" }),
      amountCol("budget", "Ngân sách", { width: 125 }),
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Lãi lỗ theo vụ việc"
        subtitle={`${formatDateVN(range.from)} – ${formatDateVN(range.to)} · doanh thu (511, 515, 711) − giảm trừ (521) − chi phí (632, 635, 641, 642, 811, 821) · bấm đúp một dòng để xem sổ chi tiết`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            onClick={() =>
              downloadXlsx(
                `lai-lo-vu-viec-${range.from}-${range.to}.xlsx`,
                ["Mã", "Tên vụ việc", "Loại", "Doanh thu", "Giảm trừ", "Chi phí", "Lãi (lỗ)", "Tỷ suất (%)", "Chưa ghi nhận (3387)", "Ngân sách"],
                data.map((r) => [
                  r.code ?? "",
                  r.name,
                  r.kind ? JOB_KIND[r.kind] : "",
                  n(r.revenue),
                  n(r.deductions),
                  n(r.cost),
                  n(r.profit),
                  r.margin === null ? "" : Number(r.margin),
                  n(r.deferred),
                  r.budget === null ? "" : Number(r.budget),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label="Loại vụ việc">
          <Select aria-label="Loại vụ việc" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} className="w-48">
            <option value="">Tất cả (có dòng không gắn vụ việc)</option>
            {Object.entries(JOB_KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </ReportFilter>
      <DataGrid<JobPnlRow>
        rowData={data}
        columnDefs={cols}
        loading={rows.isLoading}
        height="calc(100vh - 300px)"
        getRowId={(p) => p.data.job_id ?? NONE}
        suppressColumnVirtualisation
        onRowDoubleClicked={(e) => e.data && e.data.job_id !== "__total" && setOpen(e.data)}
        pinnedBottomRowData={[
          {
            job_id: "__total",
            code: "",
            name: kind ? `Tổng cộng (${JOB_KIND[kind]})` : "Tổng cộng toàn đơn vị",
            kind: null,
            partner_name: null,
            start_date: null,
            end_date: null,
            is_active: null,
            budget: null,
            revenue: sum("revenue"),
            deductions: sum("deductions"),
            net_revenue: totalNet,
            cost: sum("cost"),
            profit: totalProfit,
            margin: grossMargin(totalNet, totalProfit),
            deferred: sum("deferred"),
          },
        ]}
      />
      <Modal
        open={open !== null}
        extraWide
        title={open ? `Sổ chi tiết vụ việc ${open.code ?? ""} ${open.name} · ${formatDateVN(range.from)} – ${formatDateVN(range.to)}` : ""}
        onClose={() => setOpen(null)}
      >
        {open ? <JobLedgerGrid jobId={open.job_id} from={range.from} to={range.to} plOnly height="60vh" /> : null}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------- Sổ chi tiết vụ việc

export function JobLedgerGrid({ jobId, from, to, plOnly, height }: { jobId: string | null; from: string; to: string; plOnly: boolean; height?: string }) {
  const { tenant } = useTenantCtx();
  const rows = useJobLedger(tenant.id, jobId, from, to, plOnly);
  const openVoucher = useOpenVoucher();
  const cols = useMemo<ColDef<JobLedgerRow>[]>(
    () => [
      dateCol("posting_date", "Ngày", { valueFormatter: (p) => (p.data?.row_kind === "entry" ? formatDateVN(p.value as string) : "") }),
      { field: "voucher_number", headerName: "Số CT", width: 105 },
      {
        field: "description",
        headerName: "Diễn giải",
        flex: 2,
        minWidth: 220,
        cellClass: (p) => (p.data?.row_kind === "entry" ? "" : "font-semibold text-navy-700"),
      },
      { field: "account", headerName: "TK", width: 80, headerTooltip: "Tài khoản", tooltipField: "account_name" },
      { field: "contra_account", headerName: "TK đ/ư", width: 85 },
      { field: "partner_code", headerName: "Đối tượng", width: 115 },
      ...(plOnly ? [] : [amountCol("debit", "Nợ", { width: 120 }), amountCol("credit", "Có", { width: 120 })]),
      amountCol("revenue", "Doanh thu", { width: 130 }),
      amountCol("cost", "Chi phí", { width: 130 }),
      amountCol("profit", "Lãi (lỗ) lũy kế", { width: 140, cellClass: profitClass }),
    ],
    [plOnly],
  );
  return (
    <DataGrid<JobLedgerRow>
      rowData={rows.data ?? []}
      columnDefs={cols}
      loading={rows.isLoading}
      height={height ?? "calc(100vh - 300px)"}
      onRowDoubleClicked={(e) => e.data?.row_kind === "entry" && openVoucher(e.data.voucher_type, e.data.voucher_id)}
    />
  );
}

export function JobLedgerPage() {
  const { tenant } = useTenantCtx();
  const search = useSearch({ strict: false }) as { job?: string };
  const jobs = useJobs(tenant.id);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [range, setRange] = useState(monthRange());
  const [all, setAll] = useState(false);
  const list = useMemo(() => (jobs.data ?? []).toSorted((a, b) => a.code.localeCompare(b.code)), [jobs.data]);
  // Mặc định: vụ việc trên đường dẫn (?job=MÃ), không có thì vụ việc đầu danh sách
  const fromSearch = search.job ? list.find((j) => j.code.toUpperCase() === search.job?.toUpperCase())?.id : undefined;
  const value = picked ?? fromSearch ?? list[0]?.id ?? "";
  const jobId = value === NONE ? null : value || undefined;
  const job = list.find((j) => j.id === value);
  const plOnly = jobId === null || !all;
  const rows = useJobLedger(tenant.id, jobId, range.from, range.to, plOnly);

  return (
    <div>
      <PageHeader
        title="Sổ chi tiết vụ việc"
        subtitle={`${job ? `${job.code} — ${job.name}` : value === NONE ? "Bút toán không gắn vụ việc" : "Chưa có vụ việc"} · ${formatDateVN(range.from)} – ${formatDateVN(range.to)} · bấm đúp để mở chứng từ`}
        actions={
          <Button
            variant="secondary"
            icon={<FileDown size={14} />}
            disabled={!rows.data?.length}
            onClick={() =>
              downloadXlsx(
                `so-vu-viec-${job?.code ?? "khong-gan"}-${range.from}-${range.to}.xlsx`,
                ["Ngày", "Số CT", "Diễn giải", "TK", "TK đối ứng", "Đối tượng", "Nợ", "Có", "Doanh thu", "Chi phí", "Lãi (lỗ) lũy kế"],
                (rows.data ?? []).map((r) => [
                  r.row_kind === "entry" ? r.posting_date : "",
                  r.voucher_number ?? "",
                  r.description ?? "",
                  r.account ?? "",
                  r.contra_account ?? "",
                  r.partner_code ?? "",
                  r.debit === null ? "" : Number(r.debit),
                  r.credit === null ? "" : Number(r.credit),
                  r.revenue === null ? "" : Number(r.revenue),
                  r.cost === null ? "" : Number(r.cost),
                  Number(r.profit),
                ]),
              )
            }
          >
            Xuất Excel
          </Button>
        }
      />
      <ReportFilter from={range.from} to={range.to} onChange={setRange}>
        <Field label="Vụ việc">
          <Select aria-label="Vụ việc" value={value} onChange={(e) => setPicked(e.target.value)} className="w-80">
            {list.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} — {j.name}
              </option>
            ))}
            <option value={NONE}>(Không gắn vụ việc)</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={all && jobId !== null} disabled={jobId === null} onChange={(e) => setAll(e.target.checked)} />
          Xem cả bút toán công nợ, tiền, 3387
        </label>
      </ReportFilter>
      {jobId === undefined ? null : <JobLedgerGrid jobId={jobId} from={range.from} to={range.to} plOnly={plOnly} />}
    </div>
  );
}
