import { api, friendlyError, qk, type AccountRow } from "@accedu/api";
import { useAccounts, useDb } from "@accedu/api/react";
import { accountSchema, type AccountInput } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { FileDown, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid } from "../../components/DataGrid";
import { Badge, Button, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { downloadCsv } from "../../lib/export";
import { useTenantCtx } from "../../lib/tenant";

const KIND_LABEL: Record<AccountRow["kind"], string> = {
  asset: "Tài sản",
  liability: "Nợ phải trả",
  equity: "Vốn CSH",
  revenue: "Doanh thu",
  expense: "Chi phí",
  result: "Kết quả",
};
const SIDE_LABEL: Record<AccountRow["normal_side"], string> = { debit: "Dư Nợ", credit: "Dư Có", both: "Lưỡng tính" };

export function AccountsPage() {
  const { tenant, role } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const [editing, setEditing] = useState<AccountRow | "new" | null>(null);
  const [selected, setSelected] = useState<AccountRow | null>(null);
  const canEdit = role !== "viewer" && role !== "cashier";

  const cols = useMemo<ColDef<AccountRow>[]>(
    () => [
      { field: "code", headerName: "Tài khoản", width: 120, cellClass: (p) => (p.data?.level === 1 ? "font-semibold text-navy-700" : "") },
      {
        field: "name",
        headerName: "Tên tài khoản",
        flex: 2,
        minWidth: 260,
        cellRenderer: (p: { data: AccountRow }) => (
          <span style={{ paddingLeft: (p.data.level - 1) * 16 }} className={p.data.level === 1 ? "font-semibold" : ""}>
            {p.data.name}
          </span>
        ),
      },
      { field: "kind", headerName: "Loại", width: 120, valueFormatter: (p) => KIND_LABEL[p.value as AccountRow["kind"]] },
      { field: "normal_side", headerName: "Tính chất", width: 110, valueFormatter: (p) => SIDE_LABEL[p.value as AccountRow["normal_side"]] },
      { field: "track_partner", headerName: "Công nợ", width: 95, cellRenderer: (p: { value: boolean }) => (p.value ? <Badge tone="gold">Có</Badge> : null) },
      { field: "is_postable", headerName: "Chi tiết", width: 90, cellRenderer: (p: { value: boolean }) => (p.value ? "✓" : "") },
      { field: "parent_code", headerName: "Tk mẹ", width: 90 },
      { field: "level", headerName: "Bậc", width: 70 },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Danh mục tài khoản"
        subtitle={`Hệ thống tài khoản theo ${tenant.regime === "TT99" ? "Thông tư 99/2025/TT-BTC" : "Thông tư 133/2016/TT-BTC"} — ${accounts.data?.length ?? 0} tài khoản`}
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
              </>
            ) : null}
            <Button
              variant="secondary"
              icon={<FileDown size={14} />}
              onClick={() =>
                downloadCsv(
                  `he-thong-tai-khoan-${tenant.slug}.csv`,
                  ["Tài khoản", "Tên tài khoản", "Tk mẹ", "Bậc", "Loại", "Công nợ"],
                  (accounts.data ?? []).map((a) => [a.code, a.name, a.parent_code ?? "", a.level, KIND_LABEL[a.kind], a.track_partner ? "x" : ""]),
                )
              }
            >
              Xuất Excel
            </Button>
          </>
        }
      />
      <DataGrid<AccountRow>
        rowData={accounts.data ?? []}
        columnDefs={cols}
        loading={accounts.isLoading}
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => canEdit && e.data && setEditing(e.data)}
      />
      <Modal open={editing !== null} title={editing === "new" ? "Thêm tài khoản" : "Sửa tài khoản"} onClose={() => setEditing(null)}>
        {editing !== null ? (
          <AccountForm account={editing === "new" ? null : editing} parentHint={selected} onDone={() => setEditing(null)} />
        ) : null}
      </Modal>
    </div>
  );
}

function kindFromCode(code: string): AccountRow["kind"] {
  const c = code[0];
  if (c === "1" || c === "2") return "asset";
  if (c === "3") return "liability";
  if (c === "4") return "equity";
  if (c === "5" || c === "7") return "revenue";
  if (c === "9") return "result";
  return "expense";
}

function AccountForm({ account, parentHint, onDone }: { account: AccountRow | null; parentHint: AccountRow | null; onDone: () => void }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const [form, setForm] = useState<AccountInput>({
    code: account?.code ?? (parentHint ? parentHint.code : ""),
    name: account?.name ?? "",
    parentCode: account?.parent_code ?? parentHint?.code ?? null,
    kind: account?.kind ?? (parentHint ? parentHint.kind : "asset"),
    normalSide: account?.normal_side ?? parentHint?.normal_side ?? "debit",
    trackPartner: account?.track_partner ?? parentHint?.track_partner ?? false,
    trackItem: account?.track_item ?? false,
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = accountSchema.safeParse({ ...form, kind: form.kind ?? kindFromCode(form.code) });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      return;
    }
    setBusy(true);
    try {
      await api.saveAccount(db, tenant.id, parsed.data, account?.id);
      await qc.invalidateQueries({ queryKey: qk.accounts(tenant.id) });
      toast.success("Đã lưu tài khoản");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Số hiệu tài khoản">
        <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.trim(), kind: kindFromCode(e.target.value) })} disabled={!!account} />
      </Field>
      <Field label="Tài khoản mẹ">
        <Input value={form.parentCode ?? ""} onChange={(e) => setForm({ ...form, parentCode: e.target.value || null })} disabled={!!account} />
      </Field>
      <Field label="Tên tài khoản" className="col-span-2">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      </Field>
      <Field label="Tính chất số dư">
        <Select value={form.normalSide ?? "debit"} onChange={(e) => setForm({ ...form, normalSide: e.target.value as AccountRow["normal_side"] })}>
          <option value="debit">Dư Nợ</option>
          <option value="credit">Dư Có</option>
          <option value="both">Lưỡng tính</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 pt-5 text-sm">
        <input type="checkbox" checked={!!form.trackPartner} onChange={(e) => setForm({ ...form, trackPartner: e.target.checked })} />
        Theo dõi công nợ theo đối tượng
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={busy} onClick={() => void submit()}>
          Lưu
        </Button>
      </div>
    </div>
  );
}
