import { api, friendlyError, qk } from "@accedu/api";
import { useAccounts, useDb, useOpeningBalances } from "@accedu/api/react";
import { formatAmount, formatDateVN, parseAmount } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { CellValueChangedEvent, ColDef } from "ag-grid-community";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Badge, Button, PageHeader } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";

interface Row {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

/** Vào số dư đầu kỳ các tài khoản (tại ngày bắt đầu nhập liệu) — chỉ tài khoản chi tiết loại 1–4. */
export function OpeningBalancesPage() {
  const { tenant, role } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const opening = useOpeningBalances(tenant.id);
  const db = useDb();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { debit: number; credit: number }>>({});
  const [busy, setBusy] = useState(false);
  const editable = canPost(role);

  const rows = useMemo<Row[]>(() => {
    const saved = new Map<string, { debit: number; credit: number }>();
    for (const o of opening.data ?? []) {
      const cur = saved.get(o.account) ?? { debit: 0, credit: 0 };
      saved.set(o.account, { debit: cur.debit + Number(o.debit), credit: cur.credit + Number(o.credit) });
    }
    return (accounts.data ?? [])
      .filter((a) => a.is_postable && a.is_active && /^[1-4]/.test(a.code))
      .map((a) => ({ code: a.code, name: a.name, ...(edits[a.code] ?? saved.get(a.code) ?? { debit: 0, credit: 0 }) }));
  }, [accounts.data, opening.data, edits]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const diff = totalDebit - totalCredit;

  const cols = useMemo<ColDef<Row>[]>(
    () => [
      { field: "code", headerName: "Tài khoản", width: 120 },
      { field: "name", headerName: "Tên tài khoản", flex: 1, minWidth: 260 },
      amountCol("debit", "Dư Nợ đầu kỳ", { editable: (p) => editable && !p.node.rowPinned, valueParser: (p) => parseAmount(String(p.newValue ?? "")) ?? 0, width: 170 }),
      amountCol("credit", "Dư Có đầu kỳ", { editable: (p) => editable && !p.node.rowPinned, valueParser: (p) => parseAmount(String(p.newValue ?? "")) ?? 0, width: 170 }),
    ],
    [editable],
  );

  function onChange(e: CellValueChangedEvent<Row>) {
    if (!e.data) return;
    const { code, debit, credit } = e.data;
    setEdits((prev) => ({ ...prev, [code]: { debit: Number(debit) || 0, credit: Number(credit) || 0 } }));
  }

  async function save() {
    setBusy(true);
    try {
      const n = await api.setOpeningBalances(
        db,
        tenant.id,
        rows.filter((r) => r.debit || r.credit).map((r) => ({ account: r.code, debit: r.debit, credit: r.credit })),
      );
      setEdits({});
      await qc.invalidateQueries({ queryKey: qk.opening(tenant.id) });
      await qc.invalidateQueries({ queryKey: ["report", tenant.id] });
      toast.success(`Đã lưu số dư đầu kỳ (${n} tài khoản)`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vào số dư đầu kỳ các tài khoản"
        subtitle={`Tại ngày bắt đầu nhập liệu ${formatDateVN(tenant.start_date)} · nhấp đúp ô để nhập`}
        actions={
          <>
            {diff === 0 ? <Badge tone="green">Cân: Nợ = Có</Badge> : <Badge tone="red">Lệch {formatAmount(diff)}</Badge>}
            {editable ? (
              <Button icon={<Save size={14} />} disabled={busy || Object.keys(edits).length === 0} onClick={() => void save()}>
                Lưu số dư
              </Button>
            ) : null}
          </>
        }
      />
      <DataGrid<Row>
        rowData={rows}
        columnDefs={cols}
        loading={accounts.isLoading || opening.isLoading}
        getRowId={(p) => p.data.code || "__total"}
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        onCellValueChanged={onChange}
        pinnedBottomRowData={[{ code: "", name: "Tổng cộng", debit: totalDebit, credit: totalCredit }]}
      />
    </div>
  );
}
