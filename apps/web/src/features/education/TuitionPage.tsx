import { api, friendlyError, type TuitionGenerateResult, type TuitionStatusRow } from "@accedu/api";
import { useClasses, useDb, useTuitionStatus } from "@accedu/api/react";
import { formatAmount, formatDateVN, todayVN } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { Banknote, FileDown, Landmark, QrCode as QrIcon, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Badge, Button, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { downloadXlsx } from "../../lib/export";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { TuitionNotice } from "./TuitionNotice";

const periodLabel = (r: TuitionStatusRow) => (r.billing === "monthly" ? `Tháng ${r.period_start.slice(5, 7)}/${r.period_start.slice(0, 4)}` : `Khóa ${r.sessions ?? ""} buổi`);

/**
 * Học phí: lập học phí kỳ (hóa đơn dịch vụ Nợ 131 / Có 3387 cho từng học viên), thu tiền mặt / chuyển khoản
 * trừ đúng hóa đơn, thông báo học phí có mã VietQR, theo dõi ai chưa đóng.
 */
export function TuitionPage() {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const classes = useClasses(tenant.id);
  const [month, setMonth] = useState(todayVN().slice(0, 7));
  const [classId, setClassId] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const status = useTuitionStatus(tenant.id, { month: `${month}-01`, classId: classId || null });
  const [selected, setSelected] = useState<TuitionStatusRow[]>([]);
  const [preview, setPreview] = useState<TuitionGenerateResult | null>(null);
  const [postNow, setPostNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<TuitionStatusRow[] | null>(null);
  const allowed = canPost(role);

  const rows = useMemo(() => (status.data ?? []).filter((r) => !onlyUnpaid || Number(r.remaining) > 0), [status.data, onlyUnpaid]);
  const sum = (k: "amount" | "paid" | "remaining") => rows.reduce((s, r) => s + Number(r[k]), 0);
  const unpaid = rows.filter((r) => Number(r.remaining) > 0).length;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["report", tenant.id] }),
      qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] }),
    ]);

  async function check() {
    setBusy(true);
    try {
      setPreview(await api.generateTuition(db, tenant.id, `${month}-01`, { classId: classId || null, dryRun: true }));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const r = await api.generateTuition(db, tenant.id, `${month}-01`, { classId: classId || null, post: postNow });
      toast.success(`Đã lập ${r.created} phiếu học phí, tổng ${formatAmount(Number(r.total))}${postNow ? " (đã ghi sổ)" : " (nháp)"}`);
      setPreview(null);
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay(method: "cash" | "bank") {
    const bills = selected.filter((r) => Number(r.remaining) > 0);
    if (!bills.length) return toast.error("Các dòng đã chọn không còn học phí phải thu");
    const total = bills.reduce((s, r) => s + Number(r.remaining), 0);
    const how = method === "cash" ? "tiền mặt (phiếu thu)" : "chuyển khoản (giấy báo có)";
    if (!window.confirm(`Thu ${formatAmount(total)} học phí của ${new Set(bills.map((b) => b.student_id)).size} học viên bằng ${how}, ngày ${formatDateVN(todayVN())}?`)) return;
    setBusy(true);
    try {
      const r = await api.payTuition(db, tenant.id, bills.map((b) => b.bill_id), method, todayVN());
      toast.success(`Đã thu ${formatAmount(Number(r.total))}: ${r.vouchers.map((v) => v.number).join(", ")}`);
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const cols = useMemo<ColDef<TuitionStatusRow>[]>(
    () => [
      { field: "class_code", headerName: "Lớp", width: 115 },
      { field: "student_code", headerName: "Mã HV", width: 105 },
      { field: "student_name", headerName: "Học viên", flex: 1, minWidth: 170 },
      { headerName: "Kỳ", width: 135, valueGetter: (p) => (p.data && !p.node?.rowPinned ? periodLabel(p.data) : "") },
      { field: "guardian_phone", headerName: "SĐT phụ huynh", width: 130 },
      { field: "invoice_number", headerName: "Hóa đơn", width: 105 },
      amountCol("amount", "Học phí", { width: 120 }),
      amountCol("paid", "Đã thu", { width: 120 }),
      amountCol("remaining", "Còn nợ", { width: 120, cellClass: "num font-semibold" }),
      {
        headerName: "Trạng thái",
        width: 125,
        valueGetter: (p) =>
          !p.data || p.node?.rowPinned ? "" : p.data.invoice_status === "draft" ? "Nháp" : Number(p.data.remaining) > 0 ? "Chưa đóng" : "Đã đóng",
        cellRenderer: (p: { value: string }) =>
          p.value ? <Badge tone={p.value === "Đã đóng" ? "green" : p.value === "Nháp" ? "gray" : "gold"}>{p.value}</Badge> : null,
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Học phí"
        subtitle={`Tháng ${month.slice(5)}/${month.slice(0, 4)} · ${rows.length} khoản · ${unpaid} chưa đóng · học phí thu trước ghi TK 3387, phân bổ dần vào doanh thu`}
        actions={
          <>
            {allowed ? (
              <Button icon={<Receipt size={14} />} disabled={busy} onClick={() => void check()}>
                Lập học phí
              </Button>
            ) : null}
            <Button
              variant="secondary"
              icon={<FileDown size={14} />}
              onClick={() =>
                downloadXlsx(
                  `hoc-phi-${month}.xlsx`,
                  ["Lớp", "Mã HV", "Học viên", "Kỳ", "SĐT phụ huynh", "Hóa đơn", "Học phí", "Đã thu", "Còn nợ"],
                  rows.map((r) => [r.class_code, r.student_code, r.student_name, periodLabel(r), r.guardian_phone ?? "", r.invoice_number, Number(r.amount), Number(r.paid), Number(r.remaining)]),
                )
              }
            >
              Xuất Excel
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3">
        <Field label="Tháng">
          <Input type="month" aria-label="Tháng học phí" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </Field>
        <Field label="Lớp">
          <Select aria-label="Lọc lớp" value={classId} onChange={(e) => setClassId(e.target.value)} className="w-56">
            <option value="">Tất cả lớp</option>
            {(classes.data ?? [])
              .toSorted((a, b) => a.jobs.code.localeCompare(b.jobs.code))
              .map((c) => (
                <option key={c.job_id} value={c.job_id}>
                  {c.jobs.code} — {c.jobs.name}
                </option>
              ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} /> Chỉ khoản chưa đóng
        </label>
        <div className="ml-auto flex gap-2">
          {allowed ? (
            <>
              <Button variant="secondary" icon={<Banknote size={14} />} disabled={busy || !selected.length} onClick={() => void pay("cash")}>
                Thu tiền mặt
              </Button>
              <Button variant="secondary" icon={<Landmark size={14} />} disabled={busy || !selected.length} onClick={() => void pay("bank")}>
                Thu chuyển khoản
              </Button>
            </>
          ) : null}
          <Button variant="gold" icon={<QrIcon size={14} />} disabled={!selected.length} onClick={() => setNotice(selected)}>
            Thông báo học phí
          </Button>
        </div>
      </div>
      <DataGrid<TuitionStatusRow>
        rowData={rows}
        columnDefs={cols}
        loading={status.isLoading}
        height="calc(100vh - 330px)"
        getRowId={(p) => p.data.bill_id}
        rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows())}
        pinnedBottomRowData={[
          { class_code: "", student_name: "Tổng cộng", amount: sum("amount"), paid: sum("paid"), remaining: sum("remaining") } as unknown as TuitionStatusRow,
        ]}
      />
      <Modal open={preview !== null} extraWide title={`Lập học phí tháng ${month.slice(5)}/${month.slice(0, 4)}`} onClose={() => setPreview(null)}>
        {preview ? (
          <div className="space-y-3 text-sm">
            <p>
              Sẽ lập <b>{preview.new}</b> phiếu học phí, tổng <b className="num">{formatAmount(Number(preview.total))}</b>
              {preview.existing ? <> · {preview.existing} khoản đã lập trước đó (bỏ qua)</> : null}. Mỗi phiếu là một hóa đơn dịch vụ Nợ 131 / Có 3387.
            </p>
            <div className="max-h-80 overflow-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-navy-50 text-navy-700">
                  <tr>
                    <th className="px-2 py-1 text-left">Lớp</th>
                    <th className="px-2 text-left">Học viên</th>
                    <th className="px-2 text-left">Từ ngày</th>
                    <th className="px-2 text-right">Học phí</th>
                    <th className="px-2 text-left">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((it) => (
                    <tr key={`${it.enrollment_id}-${it.period_start}`} className="border-t border-line">
                      <td className="px-2 py-1">{it.class_code}</td>
                      <td className="px-2">
                        {it.student_code} — {it.student_name}
                      </td>
                      <td className="px-2">{formatDateVN(it.period_start)}</td>
                      <td className="num px-2 text-right">{formatAmount(Number(it.amount))}</td>
                      <td className="px-2">{it.status === "exists" ? <Badge tone="gray">Đã lập</Badge> : <Badge tone="green">Mới</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} /> Ghi sổ luôn (bỏ chọn: lưu nháp để xem lại)
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Hủy
              </Button>
              <Button disabled={busy || preview.new === 0} onClick={() => void generate()}>
                Lập {preview.new} phiếu học phí
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
      {notice ? <TuitionNotice rows={notice} onClose={() => setNotice(null)} /> : null}
    </div>
  );
}
