import { friendlyError, type VoucherRow } from "@accedu/api";
import { useVoucherAction, useVouchers } from "@accedu/api/react";
import { formatAmount } from "@accedu/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ColDef, RowDoubleClickedEvent } from "ag-grid-community";
import { FileDown, Lock, Pencil, Plus, Printer, RefreshCw, Send, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Badge, Button, Modal, PageHeader } from "../../components/ui";
import { downloadCsv } from "../../lib/export";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { STATUS_BADGE, VOUCHER_UI } from "./config";
import { PrintVoucher } from "./PrintVoucher";
import { VoucherEditor } from "./VoucherEditor";

export function VoucherModule({ type }: { type: keyof typeof VOUCHER_UI }) {
  const cfg = VOUCHER_UI[type]!;
  const { tenant, role } = useTenantCtx();
  const vouchers = useVouchers(tenant.id, [type]);
  const action = useVoucherAction(tenant.id);
  const search = useSearch({ strict: false }) as { edit?: string };
  const navigate = useNavigate();
  const [selected, setSelected] = useState<VoucherRow | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  const editing = search.edit ?? null;
  const setEditing = (v: string | null) =>
    void navigate({
      to: ".",
      search: (prev: { edit?: string; account?: string }) => {
        const { edit: _old, ...rest } = prev;
        return v ? { ...rest, edit: v } : rest;
      },
    });

  const cols = useMemo<ColDef<VoucherRow>[]>(
    () => [
      dateCol("posting_date", "Ngày"),
      { field: "number", headerName: "Số", width: 110, cellClass: "font-medium text-navy-600" },
      { field: "partner_name", headerName: "Đối tượng", flex: 1, minWidth: 160 },
      { field: "description", headerName: "Diễn giải", flex: 2, minWidth: 200 },
      amountCol("total_amount", "Tiền"),
      { field: "currency", headerName: "Mã nt", width: 80 },
      {
        field: "status",
        headerName: "Trạng thái",
        width: 130,
        cellRenderer: (p: { value: VoucherRow["status"] | undefined }) =>
          p.value ? <Badge tone={STATUS_BADGE[p.value].tone}>{STATUS_BADGE[p.value].label}</Badge> : null,
      },
      { field: "source", headerName: "Nguồn", width: 90 },
    ],
    [],
  );

  async function run(kind: "post" | "unpost" | "delete") {
    if (!selected) return;
    if (kind === "delete" && !window.confirm(`Xóa chứng từ ${selected.number}?`)) return;
    try {
      await action.mutateAsync({ id: selected.id, action: kind });
      toast.success(kind === "post" ? "Đã ghi sổ" : kind === "unpost" ? "Đã bỏ ghi sổ" : "Đã xóa");
      if (kind === "delete") setSelected(null);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const total = (vouchers.data ?? []).reduce((s, v) => s + Number(v.total_amount), 0);
  const posted = selected?.status === "posted";
  const writer = role !== "viewer";

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            {writer ? (
              <Button icon={<Plus size={14} />} onClick={() => setEditing("new")}>
                Mới
              </Button>
            ) : null}
            <Button variant="secondary" icon={<Pencil size={14} />} disabled={!selected} onClick={() => selected && setEditing(selected.id)}>
              {posted || !writer ? "Xem" : "Sửa"}
            </Button>
            {writer ? (
              <Button variant="secondary" icon={<Trash2 size={14} />} disabled={!selected || posted} onClick={() => void run("delete")}>
                Xóa
              </Button>
            ) : null}
            {canPost(role) ? (
              posted ? (
                <Button variant="secondary" icon={<Undo2 size={14} />} onClick={() => void run("unpost")}>
                  Bỏ ghi sổ
                </Button>
              ) : (
                <Button variant="secondary" icon={<Send size={14} />} disabled={!selected} onClick={() => void run("post")}>
                  Ghi sổ
                </Button>
              )
            ) : null}
            {cfg.printForm ? (
              <Button variant="secondary" icon={<Printer size={14} />} disabled={!selected} onClick={() => selected && setPrinting(selected.id)}>
                In
              </Button>
            ) : null}
            <Button
              variant="secondary"
              icon={<FileDown size={14} />}
              onClick={() =>
                downloadCsv(
                  `${cfg.type}-${tenant.slug}.csv`,
                  ["Ngày", "Số", "Đối tượng", "Diễn giải", "Tiền", "Trạng thái"],
                  (vouchers.data ?? []).map((v) => [v.posting_date, v.number, v.partner_name ?? "", v.description ?? "", Number(v.total_amount), STATUS_BADGE[v.status].label]),
                )
              }
            >
              Xuất Excel
            </Button>
            <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={() => void vouchers.refetch()}>
              Làm mới
            </Button>
          </>
        }
      />
      <DataGrid<VoucherRow>
        rowData={vouchers.data ?? []}
        columnDefs={cols}
        loading={vouchers.isLoading}
        getRowId={(p) => p.data.id ?? "__total"}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e: RowDoubleClickedEvent<VoucherRow>) => e.data && setEditing(e.data.id)}
        pinnedBottomRowData={[{ number: "Tổng cộng", total_amount: total } as unknown as VoucherRow]}
      />
      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
        <Lock size={12} /> Chứng từ đã ghi sổ chỉ xem được; bỏ ghi sổ để sửa. Tổng {vouchers.data?.length ?? 0} chứng từ · {formatAmount(total)} VND
      </p>

      <Modal open={editing !== null} wide title={`${cfg.title}${editing && editing !== "new" ? "" : " — mới"}`} onClose={() => setEditing(null)}>
        {editing !== null ? <VoucherEditor key={editing} cfg={cfg} id={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      </Modal>
      {printing && cfg.printForm ? <PrintVoucher id={printing} cfg={cfg} onClose={() => setPrinting(null)} /> : null}
    </div>
  );
}
