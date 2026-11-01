import { api, friendlyError, type ContractDirection, type ContractDocumentRow, type ContractReportRow, type ContractStatus } from "@accedu/api";
import { useContractDetail, useContracts, useDb, useJobs, usePartners } from "@accedu/api/react";
import { formatAmount, parseAmount } from "@accedu/core";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { CellClassParams, ColDef } from "ag-grid-community";
import { BookOpen, FileDown, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Badge, Button, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { downloadXlsx } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";
import { useOpenVoucher } from "./JobReports";

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: "navy" | "gold" | "green" | "gray" | "red" }> = {
  draft: { label: "Đang thỏa thuận", tone: "gold" },
  active: { label: "Đang thực hiện", tone: "navy" },
  done: { label: "Đã thanh lý", tone: "green" },
  cancelled: { label: "Đã hủy", tone: "gray" },
};
const DIRECTION: Record<ContractDirection, string> = { sale: "Bán", purchase: "Mua" };
const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const balanceClass = (p: CellClassParams) => (n(p.value) < 0 ? "num text-gold-700" : "num font-semibold");

/** Hợp đồng với trường học, nhà tài trợ, nhà cung cấp: giá trị, đã xuất hóa đơn, đã thu / trả, còn phải thu / trả */
export function ContractsPage() {
  const { tenant, role, slug } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState("");
  const [direction, setDirection] = useState<ContractDirection | "">("");
  const [status, setStatus] = useState<ContractStatus | "open" | "">("open");
  const rows = useContracts(tenant.id, asOf || null);
  const [selected, setSelected] = useState<ContractReportRow | null>(null);
  const [editing, setEditing] = useState<ContractReportRow | "new" | null>(null);
  const [detail, setDetail] = useState<ContractReportRow | null>(null);
  const canEdit = role !== "viewer" && role !== "cashier";

  const data = useMemo(
    () =>
      (rows.data ?? []).filter(
        (r) =>
          (!direction || r.direction === direction) &&
          (status === "" || (status === "open" ? r.status === "draft" || r.status === "active" : r.status === status)),
      ),
    [rows.data, direction, status],
  );
  const sum = (k: keyof ContractReportRow) => data.reduce((s, r) => s + n(r[k]), 0);

  const cols = useMemo<ColDef<ContractReportRow>[]>(
    () => [
      { field: "code", headerName: "Mã", width: 115 },
      { field: "number", headerName: "Số hợp đồng", width: 135 },
      { field: "name", headerName: "Tên hợp đồng", flex: 2, minWidth: 220 },
      { field: "partner_name", headerName: "Đối tác", width: 190 },
      { field: "direction", headerName: "Loại", width: 75, valueFormatter: (p) => (p.value ? DIRECTION[p.value as ContractDirection] : "") },
      dateCol("signed_date", "Ngày ký"),
      dateCol("end_date", "Kết thúc"),
      amountCol("value", "Giá trị", { width: 130 }),
      amountCol("invoiced", "Đã xuất HĐ", { width: 130 }),
      amountCol("settled", "Đã thu / trả", { width: 130 }),
      amountCol("balance", "Còn phải thu / trả", { width: 145, cellClass: balanceClass, headerTooltip: "Đã xuất hóa đơn − đã thu / trả; âm: đối tác ứng trước" }),
      amountCol("not_invoiced", "Chưa xuất HĐ", { width: 130 }),
      amountCol("profit", "Lãi (lỗ)", { width: 125, cellClass: (p: CellClassParams) => (n(p.value) < 0 ? "num text-danger" : "num") }),
      {
        field: "status",
        headerName: "Trạng thái",
        width: 165,
        cellRenderer: (p: { data?: ContractReportRow }) =>
          p.data?.status ? (
            <span className="flex items-center gap-1">
              <Badge tone={CONTRACT_STATUS[p.data.status].tone}>{CONTRACT_STATUS[p.data.status].label}</Badge>
              {p.data.overdue ? <Badge tone="red">Quá hạn</Badge> : null}
            </span>
          ) : null,
      },
    ],
    [],
  );

  async function remove(r: ContractReportRow) {
    if (!window.confirm(`Xóa hợp đồng ${r.code} — ${r.name}?`)) return;
    try {
      const res = await api.deleteContract(db, tenant.id, r.id);
      await qc.invalidateQueries({ queryKey: ["report", tenant.id] });
      await qc.invalidateQueries({ queryKey: ["jobs", tenant.id] });
      toast.success(res.job_deleted ? "Đã xóa hợp đồng và vụ việc" : `Đã xóa hợp đồng — vụ việc ${r.code} được giữ vì đã có chứng từ`);
      setSelected(null);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Hợp đồng"
        subtitle="Nhập mã hợp đồng ở cột Vụ việc của hóa đơn, phiếu thu / chi để theo dõi theo hợp đồng · bấm đúp để xem chứng từ"
        actions={
          <>
            {canEdit ? (
              <>
                <Button icon={<Plus size={14} />} onClick={() => setEditing("new")}>
                  Mới
                </Button>
                <Button variant="secondary" icon={<Pencil size={14} />} disabled={!selected} onClick={() => selected && setEditing(selected)}>
                  Sửa
                </Button>
                <Button variant="secondary" icon={<Trash2 size={14} />} disabled={!selected} onClick={() => selected && void remove(selected)}>
                  Xóa
                </Button>
              </>
            ) : null}
            <Button variant="secondary" icon={<FileText size={14} />} disabled={!selected} onClick={() => selected && setDetail(selected)}>
              Chứng từ
            </Button>
            <Button
              variant="secondary"
              icon={<BookOpen size={14} />}
              disabled={!selected}
              onClick={() => selected && void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: "project/job-ledger" }, search: { job: selected.code } })}
            >
              Sổ vụ việc
            </Button>
            <Button
              variant="secondary"
              icon={<FileDown size={14} />}
              onClick={() =>
                downloadXlsx(
                  `hop-dong${asOf ? `-${asOf}` : ""}.xlsx`,
                  ["Mã", "Số hợp đồng", "Tên hợp đồng", "Đối tác", "Loại", "Ngày ký", "Bắt đầu", "Kết thúc", "Giá trị", "Đã xuất HĐ", "Đã thu / trả", "Còn phải thu / trả", "Chưa xuất HĐ", "Doanh thu", "Chi phí", "Lãi (lỗ)", "Trạng thái"],
                  data.map((r) => [
                    r.code,
                    r.number ?? "",
                    r.name,
                    r.partner_name,
                    DIRECTION[r.direction],
                    r.signed_date ?? "",
                    r.start_date ?? "",
                    r.end_date ?? "",
                    n(r.value),
                    n(r.invoiced),
                    n(r.settled),
                    n(r.balance),
                    n(r.not_invoiced),
                    n(r.revenue),
                    n(r.cost),
                    n(r.profit),
                    CONTRACT_STATUS[r.status].label + (r.overdue ? " (quá hạn)" : ""),
                  ]),
                )
              }
            >
              Xuất Excel
            </Button>
          </>
        }
      />
      <div className="no-print mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
        <Field label="Loại">
          <Select aria-label="Loại hợp đồng" value={direction} onChange={(e) => setDirection(e.target.value as ContractDirection | "")} className="w-32">
            <option value="">Tất cả</option>
            <option value="sale">Bán</option>
            <option value="purchase">Mua</option>
          </Select>
        </Field>
        <Field label="Trạng thái">
          <Select aria-label="Trạng thái hợp đồng" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus | "open" | "")} className="w-48">
            <option value="open">Chưa thanh lý</option>
            <option value="">Tất cả</option>
            {Object.entries(CONTRACT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Số liệu đến ngày" hint="Bỏ trống: mọi chứng từ đã ghi sổ">
          <Input type="date" aria-label="Số liệu đến ngày" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
      </div>
      <DataGrid<ContractReportRow>
        rowData={data}
        columnDefs={cols}
        loading={rows.isLoading}
        height="calc(100vh - 300px)"
        getRowId={(p) => p.data.id}
        suppressColumnVirtualisation
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => e.data && e.data.id !== "__total" && setDetail(e.data)}
        pinnedBottomRowData={[
          {
            id: "__total",
            name: "Tổng cộng",
            value: sum("value"),
            invoiced: sum("invoiced"),
            settled: sum("settled"),
            balance: sum("balance"),
            not_invoiced: sum("not_invoiced"),
            profit: sum("profit"),
          } as ContractReportRow,
        ]}
      />
      <Modal open={editing !== null} wide title={editing === "new" ? "Thêm hợp đồng" : `Sửa hợp đồng ${editing?.code ?? ""}`} onClose={() => setEditing(null)}>
        {editing !== null ? <ContractForm contract={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
      <Modal open={detail !== null} wide title={detail ? `Chứng từ của hợp đồng ${detail.code} — ${detail.name}` : ""} onClose={() => setDetail(null)}>
        {detail ? <ContractDetail contract={detail} /> : null}
      </Modal>
    </div>
  );
}

function ContractDetail({ contract }: { contract: ContractReportRow }) {
  const { tenant } = useTenantCtx();
  const rows = useContractDetail(tenant.id, contract.id);
  const openVoucher = useOpenVoucher();
  const sale = contract.direction === "sale";
  const cols = useMemo<ColDef<ContractDocumentRow>[]>(
    () => [
      {
        field: "kind",
        headerName: "Loại",
        width: 130,
        valueFormatter: (p) => (p.value === "invoice" ? "Hóa đơn" : sale ? "Thu không theo HĐ" : "Trả không theo HĐ"),
      },
      { field: "number", headerName: "Số CT", width: 110 },
      dateCol("posting_date", "Ngày"),
      { field: "invoice_number", headerName: "Số hóa đơn", width: 115 },
      { field: "description", headerName: "Diễn giải", flex: 2, minWidth: 200 },
      amountCol("amount", "Số tiền của hợp đồng", { width: 160 }),
      amountCol("paid", sale ? "Đã thu" : "Đã trả", { width: 130 }),
    ],
    [sale],
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Stat id="value" label="Giá trị hợp đồng" value={contract.value} />
        <Stat id="invoiced" label="Đã xuất hóa đơn" value={contract.invoiced} />
        <Stat id="settled" label={sale ? "Đã thu" : "Đã trả"} value={contract.settled} />
        <Stat id="balance" label={sale ? "Còn phải thu" : "Còn phải trả"} value={contract.balance} strong />
      </div>
      <DataGrid<ContractDocumentRow>
        rowData={rows.data ?? []}
        columnDefs={cols}
        loading={rows.isLoading}
        height="45vh"
        onRowDoubleClicked={(e) => e.data && openVoucher(e.data.voucher_type, e.data.voucher_id)}
      />
      <p className="text-xs text-muted">
        Số đã thu / trả của một hóa đơn chia theo tỷ lệ dòng thuộc hợp đồng trong hóa đơn. Thu / trả trước không trừ vào hóa đơn: dòng {sale ? "Có 131" : "Nợ 331"} có mã vụ việc
        của hợp đồng.
      </p>
    </div>
  );
}

function Stat({ id, label, value, strong }: { id: string; label: string; value: unknown; strong?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-navy-50 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div data-testid={`contract-${id}`} className={`num text-base ${strong ? "font-semibold text-navy-700" : ""}`}>
        {formatAmount(n(value))}
      </div>
    </div>
  );
}

function ContractForm({ contract, onDone }: { contract: ContractReportRow | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const partners = usePartners(tenant.id);
  const jobs = useJobs(tenant.id);
  const listId = useId();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    code: contract?.code ?? "",
    name: contract?.name ?? "",
    direction: contract?.direction ?? ("sale" as ContractDirection),
    number: contract?.number ?? "",
    partnerCode: contract?.partner_code ?? "",
    signed_date: contract?.signed_date ?? "",
    start_date: contract?.start_date ?? "",
    end_date: contract?.end_date ?? "",
    value: contract ? formatAmount(n(contract.value)) : "",
    status: contract?.status ?? ("active" as ContractStatus),
    note: contract?.note ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const partner = (partners.data ?? []).find((p) => p.code.toUpperCase() === f.partnerCode.trim().toUpperCase());
  const existingJob = contract ? null : (jobs.data ?? []).find((j) => j.code.toUpperCase() === f.code.trim().toUpperCase());

  async function submit() {
    if (!partner) {
      toast.error("Chưa chọn đối tác (mã khách hàng / nhà cung cấp)");
      return;
    }
    setBusy(true);
    try {
      await api.saveContract(
        db,
        tenant.id,
        {
          code: f.code.trim(),
          name: f.name.trim(),
          direction: f.direction,
          number: f.number.trim() || null,
          partner_id: partner.id,
          signed_date: f.signed_date || null,
          start_date: f.start_date || null,
          end_date: f.end_date || null,
          value: parseAmount(f.value) ?? 0,
          status: f.status,
          note: f.note.trim() || null,
        },
        contract?.id,
      );
      await qc.invalidateQueries({ queryKey: ["report", tenant.id] });
      await qc.invalidateQueries({ queryKey: ["jobs", tenant.id] });
      toast.success("Đã lưu hợp đồng");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <datalist id={`${listId}-partner`}>
        {(partners.data ?? []).map((p) => (
          <option key={p.id} value={p.code}>
            {p.name}
          </option>
        ))}
      </datalist>
      <Field label="Mã hợp đồng (mã vụ việc)" hint={existingJob ? `Gắn vào vụ việc có sẵn: ${existingJob.name}` : undefined}>
        <Input aria-label="Mã hợp đồng" value={f.code} disabled={!!contract} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="HD-KIMDONG" autoFocus />
      </Field>
      <Field label="Loại">
        <Select aria-label="Loại" value={f.direction} onChange={(e) => set("direction", e.target.value as ContractDirection)}>
          <option value="sale">Bán — dạy học, tổ chức giải, bán sách</option>
          <option value="purchase">Mua — in sách, thuê địa điểm…</option>
        </Select>
      </Field>
      <Field label="Số hợp đồng">
        <Input aria-label="Số hợp đồng" value={f.number} onChange={(e) => set("number", e.target.value)} placeholder="15/2026/HĐ-DS" />
      </Field>
      <Field label="Trạng thái">
        <Select aria-label="Trạng thái" value={f.status} onChange={(e) => set("status", e.target.value as ContractStatus)}>
          {Object.entries(CONTRACT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tên hợp đồng" className="col-span-2 md:col-span-4">
        <Input aria-label="Tên hợp đồng" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Dạy cờ vua ngoại khóa năm học 2026–2027" />
      </Field>
      <Field label="Đối tác (mã)" hint={partner?.name ?? (f.partnerCode ? "Không có trong danh mục" : undefined)}>
        <Input aria-label="Đối tác" list={`${listId}-partner`} value={f.partnerCode} onChange={(e) => set("partnerCode", e.target.value)} />
      </Field>
      <Field label="Giá trị (gồm thuế)">
        <Input aria-label="Giá trị hợp đồng" inputMode="numeric" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="120.000.000" />
      </Field>
      <Field label="Ngày ký">
        <Input type="date" aria-label="Ngày ký" value={f.signed_date} onChange={(e) => set("signed_date", e.target.value)} />
      </Field>
      <div />
      <Field label="Bắt đầu">
        <Input type="date" aria-label="Ngày bắt đầu" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
      </Field>
      <Field label="Kết thúc">
        <Input type="date" aria-label="Ngày kết thúc" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} />
      </Field>
      <Field label="Ghi chú" className="col-span-2">
        <Input aria-label="Ghi chú" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Thanh toán 2 đợt: tháng 12 và tháng 5" />
      </Field>
      <div className="col-span-2 flex justify-end gap-2 md:col-span-4">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={busy || !f.code.trim() || !f.name.trim()} onClick={() => void submit()}>
          Lưu
        </Button>
      </div>
    </div>
  );
}
