import { api, friendlyError, qk } from "@accedu/api";
import { useAccounts, useDb, useOpeningBalances, usePartners } from "@accedu/api/react";
import { formatAmount, formatDateVN, parseAmount, type ImportKind } from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { CellValueChangedEvent, ColDef } from "ag-grid-community";
import { FileUp, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol } from "../../components/DataGrid";
import { Badge, Button, PageHeader } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { ImportDialog } from "../import/ImportDialog";

interface Row {
  code: string;
  name: string;
  debit: number;
  credit: number;
  /** TK theo dõi công nợ: số dư = tổng số dư công nợ, chỉ đọc */
  byPartner?: boolean;
}

interface PartnerLine {
  key: string;
  account: string;
  partnerCode: string;
  debit: number;
  credit: number;
}

const amountParser = (p: { newValue: unknown }) => parseAmount(String(p.newValue ?? "")) ?? 0;
let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

/** Vào số dư đầu kỳ (tại ngày bắt đầu nhập liệu): tab tài khoản (loại 1–4) và tab công nợ theo đối tượng. */
export function OpeningBalancesPage() {
  const { tenant, role } = useTenantCtx();
  const [tab, setTab] = useState<"accounts" | "partners">("accounts");
  const [importKind, setImportKind] = useState<ImportKind | null>(null);
  const editable = canPost(role);

  return (
    <div>
      <div className="no-print mb-2 flex gap-1 border-b border-line">
        {(
          [
            ["accounts", "Số dư tài khoản"],
            ["partners", "Số dư công nợ (theo đối tượng)"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${tab === k ? "border-navy-500 text-navy-700" : "border-transparent text-muted hover:text-navy-600"}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "accounts" ? (
        <AccountBalances editable={editable} onImport={() => setImportKind("opening-accounts")} />
      ) : (
        <PartnerBalances editable={editable} onImport={() => setImportKind("opening-partners")} />
      )}
      {importKind ? <ImportDialog kind={importKind} open onClose={() => setImportKind(null)} /> : null}
      <p className="mt-2 text-xs text-muted">Ngày bắt đầu nhập liệu: {formatDateVN(tenant.start_date)} (đổi ở Thông tin đơn vị).</p>
    </div>
  );
}

function AccountBalances({ editable, onImport }: { editable: boolean; onImport: () => void }) {
  const { tenant } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const opening = useOpeningBalances(tenant.id);
  const db = useDb();
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { debit: number; credit: number }>>({});
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const saved = new Map<string, { debit: number; credit: number }>();
    for (const o of opening.data ?? []) {
      const cur = saved.get(o.account) ?? { debit: 0, credit: 0 };
      saved.set(o.account, { debit: cur.debit + Number(o.debit), credit: cur.credit + Number(o.credit) });
    }
    return (accounts.data ?? [])
      .filter((a) => a.is_postable && a.is_active && /^[1-4]/.test(a.code))
      .map((a) => ({
        code: a.code,
        name: a.name,
        byPartner: a.track_partner,
        ...((!a.track_partner && edits[a.code]) || saved.get(a.code) || { debit: 0, credit: 0 }),
      }));
  }, [accounts.data, opening.data, edits]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const diff = totalDebit - totalCredit;
  const cols = useMemo<ColDef<Row>[]>(() => {
    const canEditRow = (p: { node: { rowPinned?: unknown }; data?: Row }) => editable && !p.node.rowPinned && !p.data?.byPartner;
    return [
      { field: "code", headerName: "Tài khoản", width: 120 },
      {
        field: "name",
        headerName: "Tên tài khoản",
        flex: 1,
        minWidth: 260,
        cellRenderer: (p: { data?: Row; value: string }) => (
          <span>
            {p.value} {p.data?.byPartner ? <Badge tone="gold">theo đối tượng</Badge> : null}
          </span>
        ),
      },
      amountCol("debit", "Dư Nợ đầu kỳ", { editable: canEditRow, valueParser: amountParser, width: 170 }),
      amountCol("credit", "Dư Có đầu kỳ", { editable: canEditRow, valueParser: amountParser, width: 170 }),
    ];
  }, [editable]);

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
        rows.filter((r) => !r.byPartner && (r.debit || r.credit)).map((r) => ({ account: r.code, debit: r.debit, credit: r.credit })),
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
        subtitle={`Tại ngày bắt đầu nhập liệu ${formatDateVN(tenant.start_date)} · nhấp vào ô để nhập · TK theo dõi công nợ nhập ở tab Số dư công nợ`}
        actions={
          <>
            {diff === 0 ? <Badge tone="green">Cân: Nợ = Có</Badge> : <Badge tone="red">Lệch {formatAmount(diff)}</Badge>}
            {editable ? (
              <>
                <Button variant="secondary" icon={<FileUp size={14} />} onClick={onImport}>
                  Nhập từ Excel
                </Button>
                <Button icon={<Save size={14} />} disabled={busy || Object.keys(edits).length === 0} onClick={() => void save()}>
                  Lưu số dư
                </Button>
              </>
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

function PartnerBalances({ editable, onImport }: { editable: boolean; onImport: () => void }) {
  const { tenant } = useTenantCtx();
  const accounts = useAccounts(tenant.id);
  const partners = usePartners(tenant.id);
  const opening = useOpeningBalances(tenant.id);
  const db = useDb();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PartnerLine[] | null>(null);
  const [busy, setBusy] = useState(false);

  const partnerById = useMemo(() => new Map((partners.data ?? []).map((p) => [p.id, p])), [partners.data]);
  const partnerByCode = useMemo(() => new Map((partners.data ?? []).map((p) => [p.code.toUpperCase(), p])), [partners.data]);
  const trackAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.is_postable && a.is_active && a.track_partner).map((a) => a.code),
    [accounts.data],
  );

  const saved = useMemo<PartnerLine[]>(
    () =>
      (opening.data ?? [])
        .filter((o) => o.partner_id)
        .map((o) => ({
          key: o.id,
          account: o.account,
          partnerCode: partnerById.get(o.partner_id!)?.code ?? "",
          debit: Number(o.debit),
          credit: Number(o.credit),
        }))
        .toSorted((a, b) => a.account.localeCompare(b.account) || a.partnerCode.localeCompare(b.partnerCode)),
    [opening.data, partnerById],
  );
  const lines = draft ?? saved;
  const totalDebit = lines.reduce((s, r) => s + r.debit, 0);
  const totalCredit = lines.reduce((s, r) => s + r.credit, 0);

  const cols = useMemo<ColDef<PartnerLine>[]>(
    () => [
      {
        field: "account",
        headerName: "Tài khoản",
        width: 130,
        editable: (p) => editable && !p.node.rowPinned,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: trackAccounts },
      },
      {
        field: "partnerCode",
        headerName: "Mã đối tượng",
        width: 150,
        editable: (p) => editable && !p.node.rowPinned,
        valueParser: (p) => String(p.newValue ?? "").trim().toUpperCase(),
        cellClassRules: { "text-danger": (p) => !p.node.rowPinned && !!p.value && !partnerByCode.has(String(p.value).toUpperCase()) },
      },
      {
        headerName: "Tên đối tượng",
        flex: 1,
        minWidth: 220,
        valueGetter: (p) => (p.node?.rowPinned ? "Tổng cộng" : (partnerByCode.get(String(p.data?.partnerCode ?? "").toUpperCase())?.name ?? "")),
      },
      amountCol("debit", "Dư Nợ", { editable: (p) => editable && !p.node.rowPinned, valueParser: amountParser, width: 160 }),
      amountCol("credit", "Dư Có", { editable: (p) => editable && !p.node.rowPinned, valueParser: amountParser, width: 160 }),
    ],
    [editable, trackAccounts, partnerByCode],
  );

  function update(next: PartnerLine[]) {
    setDraft(next);
  }

  function onChange(e: CellValueChangedEvent<PartnerLine>) {
    if (!e.data) return;
    const changed = e.data;
    update(lines.map((l) => (l.key === changed.key ? { ...changed, debit: Number(changed.debit) || 0, credit: Number(changed.credit) || 0 } : l)));
  }

  async function save() {
    setBusy(true);
    try {
      const rows = lines.map((l, i) => ({ row: i + 1, account: l.account, partner_code: l.partnerCode, debit: l.debit, credit: l.credit }));
      const r = await api.importOpeningBalances(db, tenant.id, "partner", rows);
      if (!r.ok) {
        toast.error(r.errors.map((e) => `Dòng ${e.row}: ${e.message}`).slice(0, 5).join(" · "));
        return;
      }
      setDraft(null);
      await qc.invalidateQueries({ queryKey: qk.opening(tenant.id) });
      await qc.invalidateQueries({ queryKey: ["report", tenant.id] });
      toast.success(`Đã lưu số dư công nợ (${r.inserted} dòng)`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vào số dư công nợ đầu kỳ"
        subtitle={`Theo từng khách hàng / nhà cung cấp / nhân viên / học viên · ${trackAccounts.length} tài khoản theo dõi công nợ`}
        actions={
          editable ? (
            <>
              <Button
                variant="secondary"
                icon={<Plus size={14} />}
                onClick={() => update([...lines, { key: newKey(), account: trackAccounts[0] ?? "", partnerCode: "", debit: 0, credit: 0 }])}
              >
                Thêm dòng
              </Button>
              <Button variant="secondary" icon={<FileUp size={14} />} onClick={onImport}>
                Nhập từ Excel
              </Button>
              <Button icon={<Save size={14} />} disabled={busy || draft === null} onClick={() => void save()}>
                Lưu số dư công nợ
              </Button>
            </>
          ) : null
        }
      />
      <DataGrid<PartnerLine>
        rowData={lines}
        columnDefs={[
          ...cols,
          ...(editable
            ? [
                {
                  headerName: "",
                  width: 56,
                  sortable: false,
                  filter: false,
                  cellRenderer: (p: { data?: PartnerLine; node: { rowPinned?: unknown } }) =>
                    p.node.rowPinned ? null : (
                      <button type="button" aria-label="Xóa dòng" className="text-muted hover:text-danger" onClick={() => p.data && update(lines.filter((l) => l.key !== p.data!.key))}>
                        <Trash2 size={14} />
                      </button>
                    ),
                } satisfies ColDef<PartnerLine>,
              ]
            : []),
        ]}
        loading={accounts.isLoading || opening.isLoading || partners.isLoading}
        getRowId={(p) => p.data.key || "__total"}
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        onCellValueChanged={onChange}
        pinnedBottomRowData={[{ key: "", account: "", partnerCode: "", debit: totalDebit, credit: totalCredit }]}
      />
    </div>
  );
}
