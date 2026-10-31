import { api, friendlyError, type AccountRow, type AssetKind, type AssetRegisterRow } from "@accedu/api";
import { useAccounts, useAssetCard, useAssets, useDb, usePartners, useTrialBalance } from "@accedu/api/react";
import {
  ASSET_LABEL,
  ASSET_STATUS_LABEL,
  assetDefaults,
  assetSchedule,
  defaultAccumAccount,
  formatAmount,
  formatDateVN,
  scheduleSummary,
  todayVN,
} from "@accedu/core";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Archive, FileUp, IdCard, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Badge, Button, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";
import { ImportDialog } from "../import/ImportDialog";

const vnd = (n: number | string | null | undefined) => formatAmount(n === null || n === undefined ? 0 : Number(n));
const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const sumOf = (rows: readonly AssetRegisterRow[], k: "cost" | "accumulated" | "remaining" | "next_amount") => rows.reduce((s, r) => s + Number(r[k]), 0);

export const STATUS_TONE: Record<AssetRegisterRow["status"], "green" | "gold" | "gray" | "red" | "navy"> = {
  active: "green",
  suspended: "gold",
  done: "navy",
  disposed: "gray",
};

/** TK chọn được cho từng ô tài khoản của thẻ tài sản (cùng điều kiện với save_asset) */
const ACCOUNT_RULES = {
  fixedAsset: /^21[123]/,
  accum: /^214/,
  toolAsset: /^242/,
  expense: /^(6|154|241|811)/,
} as const;
const pick = (accounts: readonly AccountRow[] | undefined, rule: RegExp) =>
  (accounts ?? []).filter((a) => a.is_postable && a.is_active && rule.test(a.code));

/** Số dư sổ cái (Nợ − Có) của các TK tại ngày, từ bảng cân đối phát sinh */
function ledgerNet(rows: ReadonlyArray<{ account_code: string; is_postable: boolean; closing_debit: number | string; closing_credit: number | string }> | undefined, codes: ReadonlySet<string>) {
  return (rows ?? []).filter((r) => r.is_postable && codes.has(r.account_code)).reduce((s, r) => s + Number(r.closing_debit) - Number(r.closing_credit), 0);
}

/**
 * Sổ TSCĐ / CCDC: danh sách thẻ tài sản tại một ngày, so khớp sổ cái; khai báo (có ghi tăng), ghi giảm, khôi phục,
 * thẻ tài sản từng tháng, nhập danh sách từ Excel.
 */
export function AssetsPage({ kind }: { kind: AssetKind }) {
  const { tenant, role, slug } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const L = ASSET_LABEL[kind];
  const [asOf, setAsOf] = useState(todayVN());
  const [showDisposed, setShowDisposed] = useState(false);
  const [selected, setSelected] = useState<AssetRegisterRow | null>(null);
  const [editing, setEditing] = useState<AssetRegisterRow | "new" | null>(null);
  const [disposing, setDisposing] = useState<AssetRegisterRow | null>(null);
  const [card, setCard] = useState<AssetRegisterRow | null>(null);
  const [importing, setImporting] = useState(false);
  const allowed = canPost(role);
  const reg = useAssets(tenant.id, kind, asOf);
  const tb = useTrialBalance(tenant.id, `${asOf.slice(0, 7)}-01`, asOf);

  const all = reg.data ?? [];
  const live = all.filter((r) => r.status !== "disposed");
  const rows = showDisposed ? all : live;
  const assetAccounts = new Set(live.map((r) => r.asset_account));
  const accumAccounts = new Set(live.map((r) => r.accum_account).filter((x): x is string => !!x));
  const ledgerCost = ledgerNet(tb.data, assetAccounts);
  const ledgerAccum = -ledgerNet(tb.data, accumAccounts);

  const refresh = () => qc.invalidateQueries({ queryKey: ["report", tenant.id] });
  const openVoucher = useCallback(
    (id: string) => void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: "general/journal-vouchers" }, search: { edit: id } }),
    [navigate, slug],
  );

  async function remove(r: AssetRegisterRow) {
    if (!window.confirm(`Xóa ${L.short} ${r.code} — ${r.name}?${r.increase_number ? ` Phiếu ghi tăng ${r.increase_number} cũng bị xóa.` : ""}`)) return;
    try {
      await api.deleteAsset(db, tenant.id, r.id);
      await refresh();
      setSelected(null);
      toast.success(`Đã xóa ${r.code}`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function restore(r: AssetRegisterRow) {
    if (!window.confirm(`Bỏ ghi giảm ${r.code}?${r.disposal_number ? ` Phiếu ${r.disposal_number} sẽ bị xóa.` : ""}`)) return;
    try {
      await api.restoreAsset(db, tenant.id, r.id);
      await refresh();
      setSelected(null);
      toast.success(`${r.code} đã trở lại đang dùng`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const cols = useMemo<ColDef<AssetRegisterRow>[]>(
    () => [
      { field: "code", headerName: "Mã", width: 130 },
      { field: "name", headerName: kind === "fixed" ? "Tên tài sản" : "Tên CCDC", flex: 1, minWidth: 200 },
      { field: "category", headerName: "Loại / nhóm", width: 140 },
      { field: "department", headerName: "Bộ phận", width: 130 },
      dateCol("start_on", kind === "fixed" ? "Ngày tính KH" : "Ngày phân bổ", { width: 120 }),
      { field: "months", headerName: "Số tháng", width: 95, type: "rightAligned" },
      amountCol("cost", L.cost, { width: 130 }),
      amountCol("accumulated", L.accumulated, { width: 135 }),
      amountCol("remaining", "Còn lại", { width: 130, cellClass: "num font-semibold" }),
      {
        field: "months_left",
        headerName: "Tháng còn",
        width: 100,
        type: "rightAligned",
        valueFormatter: (p) => (p.value === null || p.value === undefined ? "" : formatAmount(Number(p.value), { decimals: 2, blankZero: true })),
      },
      amountCol("next_amount", "Mức tháng tới", { width: 130 }),
      {
        field: "status",
        headerName: "Trạng thái",
        width: 130,
        cellRenderer: (p: ICellRendererParams<AssetRegisterRow>) =>
          p.data ? (
            <Badge tone={STATUS_TONE[p.data.status]}>
              {ASSET_STATUS_LABEL[p.data.status]}
              {p.data.status === "disposed" && p.data.disposed_on ? ` ${formatDateVN(p.data.disposed_on)}` : ""}
            </Badge>
          ) : null,
      },
      {
        headerName: "Chứng từ",
        width: 150,
        cellRenderer: (p: ICellRendererParams<AssetRegisterRow>) => {
          const d = p.data;
          if (!d) return null;
          const v = d.status === "disposed" && d.disposal_voucher_id ? { id: d.disposal_voucher_id, n: d.disposal_number } : d.increase_voucher_id ? { id: d.increase_voucher_id, n: d.increase_number } : null;
          return v ? (
            <button type="button" className="text-navy-600 underline" onClick={() => openVoucher(v.id)}>
              {v.n}
            </button>
          ) : null;
        },
      },
    ],
    [kind, L, openVoucher],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title={kind === "fixed" ? "Tài sản cố định" : "Công cụ dụng cụ"}
        subtitle={
          kind === "fixed"
            ? "Thẻ TSCĐ, nguyên giá, hao mòn lũy kế; khấu hao đường thẳng theo số ngày sử dụng (TT45/2013)"
            : "Thẻ CCDC, giá trị chờ phân bổ (TK 242); phân bổ đều hằng tháng"
        }
        actions={
          <>
            {allowed ? (
              <>
                <Button icon={<Plus size={14} />} onClick={() => setEditing("new")}>
                  Mới
                </Button>
                <Button variant="secondary" icon={<Pencil size={14} />} disabled={!selected || selected.status === "disposed"} onClick={() => selected && setEditing(selected)}>
                  Sửa
                </Button>
                {selected?.status === "disposed" ? (
                  <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => void restore(selected)}>
                    Bỏ ghi giảm
                  </Button>
                ) : (
                  <Button variant="secondary" icon={<Archive size={14} />} disabled={!selected} onClick={() => selected && setDisposing(selected)}>
                    Ghi giảm
                  </Button>
                )}
                <Button variant="secondary" icon={<Trash2 size={14} />} disabled={!selected || selected.status === "disposed"} onClick={() => selected && void remove(selected)}>
                  Xóa
                </Button>
              </>
            ) : null}
            <Button variant="secondary" icon={<IdCard size={14} />} disabled={!selected} onClick={() => selected && setCard(selected)}>
              Thẻ {L.short}
            </Button>
            {allowed ? (
              <Button variant="secondary" icon={<FileUp size={14} />} onClick={() => setImporting(true)}>
                Nhập Excel
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-4 rounded-md border border-line bg-white p-3">
        <Field label="Số liệu đến ngày">
          <Input type="date" aria-label="Đến ngày" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={showDisposed} onChange={(e) => setShowDisposed(e.target.checked)} /> Hiện {L.short} đã ghi giảm
        </label>
        <Stat label={`${L.cost} (${live.length} ${L.short})`} value={vnd(sumOf(live, "cost"))} testId="asset-cost" />
        <Stat label={L.accumulated} value={vnd(sumOf(live, "accumulated"))} testId="asset-accumulated" />
        <Stat label="Giá trị còn lại" value={vnd(sumOf(live, "remaining"))} testId="asset-remaining" />
        <Stat label={`Mức ${L.verb} tháng tới`} value={vnd(sumOf(live, "next_amount"))} testId="asset-next" />
      </div>

      {live.length ? (
        <LedgerCheck
          kind={kind}
          cost={sumOf(live, "cost")}
          accumulated={sumOf(live, "accumulated")}
          remaining={sumOf(live, "remaining")}
          ledgerCost={ledgerCost}
          ledgerAccum={ledgerAccum}
          accounts={[...assetAccounts, ...accumAccounts].toSorted().join(", ")}
        />
      ) : null}

      <DataGrid<AssetRegisterRow>
        rowData={rows}
        columnDefs={cols}
        loading={reg.isLoading}
        height="calc(100vh - 330px)"
        getRowId={(p) => p.data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onSelectionChanged={(e) => setSelected(e.api.getSelectedRows()[0] ?? null)}
        onRowDoubleClicked={(e) => e.data && (allowed && e.data.status !== "disposed" ? setEditing(e.data) : setCard(e.data))}
      />

      {editing ? <AssetForm kind={kind} asset={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={refresh} /> : null}
      {disposing ? <DisposeDialog kind={kind} asset={disposing} onClose={() => setDisposing(null)} onDone={refresh} /> : null}
      {card ? <AssetCardDialog kind={kind} asset={card} onClose={() => setCard(null)} onOpenVoucher={openVoucher} /> : null}
      {importing ? <ImportDialog kind={kind === "fixed" ? "fixed-assets" : "tools"} open onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="pb-1">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-semibold tabular-nums text-navy-700" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/** So khớp sổ tài sản với sổ cái TK nguyên giá / hao mòn (TSCĐ) hoặc 242 (CCDC) */
function LedgerCheck(p: { kind: AssetKind; cost: number; accumulated: number; remaining: number; ledgerCost: number; ledgerAccum: number; accounts: string }) {
  const items =
    p.kind === "fixed"
      ? [
          { label: "Nguyên giá", book: p.cost, ledger: p.ledgerCost },
          { label: "Hao mòn lũy kế", book: p.accumulated, ledger: p.ledgerAccum },
        ]
      : [{ label: "Giá trị chờ phân bổ", book: p.remaining, ledger: p.ledgerCost }];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-line bg-white px-3 py-2 text-sm" data-testid="asset-ledger">
      <span className="text-muted">Đối chiếu sổ cái TK {p.accounts}:</span>
      {items.map((i) => {
        const diff = i.ledger - i.book;
        return (
          <span key={i.label}>
            {i.label} trên sổ cái <b className="tabular-nums">{vnd(i.ledger)}</b>{" "}
            <span className={diff === 0 ? "text-success" : "text-warning"}>
              {diff === 0 ? "— khớp" : `— chênh ${vnd(diff)}${p.kind === "tool" ? " (khoản 242 khác ngoài CCDC?)" : " (số dư đầu kỳ / chứng từ khác?)"}`}
            </span>
          </span>
        );
      })}
    </div>
  );
}

interface FormState {
  code: string;
  name: string;
  category: string;
  department: string;
  quantity: string;
  uom: string;
  acquired_on: string;
  start_on: string;
  cost: string;
  months: string;
  opening_accumulated: string;
  opening_months: string;
  asset_account: string;
  accum_account: string;
  expense_account: string;
  suspended: boolean;
  note: string;
  increase: boolean;
  credit_account: string;
  partner_id: string;
}

const num = (s: string) => Number(s.replace(/[.\s]/g, "").replace(",", ".")) || 0;

/** Khai báo / sửa thẻ tài sản; xem trước lịch khấu hao ngay trên form */
function AssetForm({ kind, asset, onClose, onDone }: { kind: AssetKind; asset: AssetRegisterRow | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const accounts = useAccounts(tenant.id);
  const partners = usePartners(tenant.id);
  const L = ASSET_LABEL[kind];
  const def = assetDefaults(tenant.regime, kind);
  const today = todayVN();
  const locked = !!asset?.last_month;
  const [f, setF] = useState<FormState>({
    code: asset?.code ?? "",
    name: asset?.name ?? "",
    category: asset?.category ?? "",
    department: asset?.department ?? "",
    quantity: asset ? String(Number(asset.quantity)) : "1",
    uom: asset?.uom ?? "",
    acquired_on: asset?.acquired_on ?? today,
    start_on: asset?.start_on ?? today,
    cost: asset ? String(Number(asset.cost)) : "",
    months: asset ? String(asset.months) : kind === "fixed" ? "36" : "12",
    opening_accumulated: asset ? String(Number(asset.opening_accumulated)) : "0",
    opening_months: asset ? String(Number(asset.opening_months)) : "0",
    asset_account: asset?.asset_account ?? def.assetAccount,
    accum_account: asset?.accum_account ?? def.accumAccount ?? "",
    expense_account: asset?.expense_account ?? def.expenseAccount,
    suspended: asset?.suspended ?? false,
    note: asset?.note ?? "",
    increase: !asset,
    credit_account: def.increaseCredit,
    partner_id: "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const beforeStart = f.start_on !== "" && f.start_on < tenant.start_date;
  const canIncrease = !asset?.increase_voucher_id && !beforeStart;
  const creditAccounts = (accounts.data ?? []).filter((a) => a.is_postable && a.is_active && !a.track_item && a.code !== f.asset_account);
  const creditTracksPartner = !!accounts.data?.find((a) => a.code === f.credit_account)?.track_partner;

  const schedule = useMemo(
    () =>
      assetSchedule({
        kind,
        cost: num(f.cost),
        months: Number(f.months),
        startOn: f.start_on,
        openingAccumulated: beforeStart ? num(f.opening_accumulated) : 0,
        openingMonths: beforeStart ? Number(f.opening_months.replace(",", ".")) || 0 : 0,
        ...(beforeStart ? { fromMonth: tenant.start_date } : {}),
      }),
    [kind, f.cost, f.months, f.start_on, f.opening_accumulated, f.opening_months, beforeStart, tenant.start_date],
  );
  const sum = scheduleSummary(schedule);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        kind,
        code: f.code,
        name: f.name,
        category: f.category,
        department: f.department,
        quantity: Number(f.quantity.replace(",", ".")) || 1,
        uom: f.uom,
        acquired_on: f.acquired_on || f.start_on,
        start_on: f.start_on,
        cost: num(f.cost),
        months: Number(f.months),
        opening_accumulated: beforeStart ? num(f.opening_accumulated) : 0,
        opening_months: beforeStart ? Number(f.opening_months.replace(",", ".")) || 0 : 0,
        asset_account: f.asset_account,
        accum_account: kind === "fixed" ? f.accum_account : null,
        expense_account: f.expense_account,
        suspended: f.suspended,
        note: f.note,
      };
      if (f.increase && canIncrease) payload.increase = { credit_account: f.credit_account, partner_id: f.partner_id || null };
      await api.saveAsset(db, tenant.id, payload, asset?.id);
      await onDone();
      toast.success(asset ? `Đã lưu ${f.code.toUpperCase()}` : `Đã khai báo ${L.short} ${f.code.toUpperCase()}${payload.increase ? " và lập phiếu ghi tăng" : ""}`);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const acctSelect = (label: string, key: "asset_account" | "accum_account" | "expense_account", rule: RegExp) => (
    <Field label={label}>
      <Select
        aria-label={label}
        value={f[key]}
        disabled={locked && key !== "expense_account"}
        onChange={(e) => {
          set(key, e.target.value);
          if (key === "asset_account" && kind === "fixed") set("accum_account", defaultAccumAccount(tenant.regime, e.target.value));
        }}
      >
        {pick(accounts.data, rule).map((a) => (
          <option key={a.code} value={a.code}>
            {a.code} — {a.name}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Modal open wide title={asset ? `Sửa ${L.short} ${asset.code}` : `Khai báo ${L.long}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Field label={`Mã ${L.short}`}>
          <Input aria-label="Mã" value={f.code} autoFocus onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder={kind === "fixed" ? "MAYCHIEU-01" : "DONGHO-01"} />
        </Field>
        <Field label="Tên" className="col-span-2 md:col-span-3">
          <Input aria-label="Tên" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={kind === "fixed" ? "Máy chiếu tương tác phòng học 1" : "Đồng hồ cờ điện tử (10 chiếc)"} />
        </Field>
        <Field label="Loại / nhóm">
          <Input aria-label="Loại / nhóm" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Thiết bị giảng dạy" />
        </Field>
        <Field label="Bộ phận sử dụng">
          <Input aria-label="Bộ phận sử dụng" value={f.department} onChange={(e) => set("department", e.target.value)} placeholder="Phòng học 1" />
        </Field>
        <Field label="Số lượng">
          <Input aria-label="Số lượng" value={f.quantity} inputMode="decimal" onChange={(e) => set("quantity", e.target.value)} />
        </Field>
        <Field label="Đvt">
          <Input aria-label="Đvt" value={f.uom} onChange={(e) => set("uom", e.target.value)} placeholder="Chiếc" />
        </Field>
        <Field label="Ngày ghi tăng">
          <Input type="date" aria-label="Ngày ghi tăng" value={f.acquired_on} disabled={locked} onChange={(e) => set("acquired_on", e.target.value)} />
        </Field>
        <Field label={kind === "fixed" ? "Ngày bắt đầu tính khấu hao" : "Ngày bắt đầu phân bổ"}>
          <Input type="date" aria-label="Ngày bắt đầu tính" value={f.start_on} disabled={locked} onChange={(e) => set("start_on", e.target.value)} />
        </Field>
        <Field label={L.cost}>
          <Input aria-label={L.cost} value={f.cost} inputMode="numeric" disabled={locked} onChange={(e) => set("cost", e.target.value)} placeholder="36.000.000" />
        </Field>
        <Field label={L.months}>
          <Input aria-label="Số tháng" value={f.months} inputMode="numeric" onChange={(e) => set("months", e.target.value.replace(/\D/g, ""))} />
        </Field>
        {kind === "fixed" ? acctSelect("TK nguyên giá", "asset_account", ACCOUNT_RULES.fixedAsset) : acctSelect("TK chờ phân bổ", "asset_account", ACCOUNT_RULES.toolAsset)}
        {kind === "fixed" ? acctSelect("TK hao mòn", "accum_account", ACCOUNT_RULES.accum) : null}
        {acctSelect(`TK chi phí ${L.verb}`, "expense_account", ACCOUNT_RULES.expense)}
        <Field label="Ghi chú" className={kind === "fixed" ? "col-span-2 md:col-span-1" : "col-span-2"}>
          <Input aria-label="Ghi chú" value={f.note} onChange={(e) => set("note", e.target.value)} />
        </Field>

        {beforeStart ? (
          <div className="col-span-2 grid grid-cols-2 gap-3 rounded-md bg-gold-50 p-2 md:col-span-4">
            <p className="col-span-2 text-xs text-muted">
              {L.short} dùng từ trước ngày bắt đầu nhập liệu {formatDateVN(tenant.start_date)}: khai báo số đã {L.verb} tại ngày đó (đã có trong số dư đầu kỳ, không lập phiếu ghi
              tăng).
            </p>
            <Field label={`${L.accumulated} đầu kỳ`}>
              <Input aria-label="Số đầu kỳ" value={f.opening_accumulated} inputMode="numeric" disabled={locked} onChange={(e) => set("opening_accumulated", e.target.value)} />
            </Field>
            <Field label={`Số tháng đã ${L.verb}`}>
              <Input aria-label="Số tháng đã tính" value={f.opening_months} inputMode="decimal" disabled={locked} onChange={(e) => set("opening_months", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {canIncrease ? (
          <div className="col-span-2 grid grid-cols-2 items-end gap-3 rounded-md border border-line p-2 md:col-span-4 md:grid-cols-4">
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={f.increase} onChange={(e) => set("increase", e.target.checked)} />
              Lập phiếu ghi tăng (Nợ {f.asset_account} / Có TK đối ứng) ngày {formatDateVN(f.acquired_on || f.start_on)}
            </label>
            {f.increase ? (
              <>
                <Field label="TK đối ứng">
                  <Select aria-label="TK đối ứng ghi tăng" value={f.credit_account} onChange={(e) => set("credit_account", e.target.value)}>
                    {creditAccounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {creditTracksPartner ? (
                  <Field label="Nhà cung cấp">
                    <Select aria-label="Nhà cung cấp" value={f.partner_id} onChange={(e) => set("partner_id", e.target.value)}>
                      <option value="">— Chọn —</option>
                      {(partners.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </>
            ) : (
              <p className="col-span-2 text-xs text-muted">Bỏ chọn khi đã ghi sổ bằng hóa đơn mua / phiếu chi{kind === "tool" ? " / phiếu xuất kho (Nợ 242 / Có 153)" : ""}.</p>
            )}
          </div>
        ) : null}

        {kind === "fixed" || asset ? (
          <label className="col-span-2 flex items-center gap-2 md:col-span-4">
            <input type="checkbox" checked={f.suspended} onChange={(e) => set("suspended", e.target.checked)} /> Tạm dừng {L.verb} (các tháng tạm dừng không tính, thời gian {L.verb}{" "}
            kéo dài tương ứng)
          </label>
        ) : null}

        <div className="col-span-2 rounded-md bg-navy-50 p-2 text-xs md:col-span-4" data-testid="asset-schedule">
          {sum ? (
            <>
              Tháng đầu {monthLabel(sum.first.month)}: <b>{vnd(sum.first.amount)}</b>
              {sum.first.days ? ` (${sum.first.days} ngày)` : ""} · mỗi tháng ≈ <b>{vnd(sum.regular)}</b> · {sum.last.remaining === 0 ? "hết" : "đến"} {L.verb} tháng{" "}
              {monthLabel(sum.last.month)} ({sum.count} lần tính)
            </>
          ) : (
            `Nhập ${L.cost.toLowerCase()}, số tháng và ngày bắt đầu để xem lịch ${L.verb}.`
          )}
          {locked ? <p className="mt-1 text-muted">Đã {L.verb} đến tháng {monthLabel(asset!.last_month!)}: chỉ sửa được tên, bộ phận, số tháng, TK chi phí, tạm dừng.</p> : null}
        </div>
        <div className="col-span-2 flex justify-end gap-2 md:col-span-4">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy || !f.code || !f.name || !f.start_on || !num(f.cost) || !Number(f.months) || (f.increase && canIncrease && creditTracksPartner && !f.partner_id)} onClick={() => void save()}>
            Lưu
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Ghi giảm: TSCĐ khấu hao đến trước ngày giảm, ghi giảm hao mòn và giá trị còn lại; CCDC phân bổ hết phần còn lại */
function DisposeDialog({ kind, asset, onClose, onDone }: { kind: AssetKind; asset: AssetRegisterRow; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const accounts = useAccounts(tenant.id);
  const L = ASSET_LABEL[kind];
  const [date, setDate] = useState(todayVN());
  const [reason, setReason] = useState("");
  const [account, setAccount] = useState(kind === "fixed" ? assetDefaults(tenant.regime, kind).disposalAccount : asset.expense_account);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await api.disposeAsset(db, tenant.id, asset.id, date, reason, account);
      await onDone();
      toast.success(r.number ? `Đã ghi giảm ${asset.code}: phiếu ${r.number}, giá trị còn lại ${vnd(r.remaining)}` : `Đã ghi giảm ${asset.code}`);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`Ghi giảm ${L.short} ${asset.code}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>
          {asset.name} · {L.cost} <b>{vnd(asset.cost)}</b> · {L.accumulated.toLowerCase()} {vnd(asset.accumulated)} · còn lại <b>{vnd(asset.remaining)}</b>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày ghi giảm">
            <Input type="date" aria-label="Ngày ghi giảm" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={kind === "fixed" ? "Ghi Nợ giá trị còn lại vào TK" : "Phân bổ phần còn lại vào TK"}>
            <Select aria-label="TK giá trị còn lại" value={account} onChange={(e) => setAccount(e.target.value)}>
              {pick(accounts.data, ACCOUNT_RULES.expense).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Lý do">
          <Input aria-label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "fixed" ? "Thanh lý, nhượng bán, hỏng không sửa được…" : "Hỏng, mất…"} />
        </Field>
        <p className="text-xs text-muted">
          {kind === "fixed"
            ? `AccEdu lập phiếu kế toán: khấu hao các ngày trong tháng đến trước ngày giảm (Nợ ${asset.expense_account} / Có ${asset.accum_account}), Nợ ${asset.accum_account} hao mòn lũy kế / Có ${asset.asset_account}, Nợ ${account} giá trị còn lại / Có ${asset.asset_account}. Tiền thu thanh lý (nếu có) lập phiếu thu / hóa đơn như thường (Có 711).`
            : `AccEdu lập phiếu kế toán Nợ ${account} / Có ${asset.asset_account} phần chưa phân bổ.`}{" "}
          Ghi giảm trước khi tính {L.verb} cuối tháng.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy || !date} onClick={() => void save()}>
            Ghi giảm
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Thẻ tài sản: thông tin chung và từng tháng đã tính */
function AssetCardDialog({ kind, asset, onClose, onOpenVoucher }: { kind: AssetKind; asset: AssetRegisterRow; onClose: () => void; onOpenVoucher: (id: string) => void }) {
  const { tenant } = useTenantCtx();
  const card = useAssetCard(tenant.id, asset.id);
  const L = ASSET_LABEL[kind];
  const cols: ColDef<NonNullable<typeof card.data>[number]>[] = [
    { field: "month", headerName: "Tháng", width: 95, valueFormatter: (p) => (p.value ? monthLabel(String(p.value)) : "") },
    { field: "source", headerName: "Nghiệp vụ", width: 125, valueFormatter: (p) => (p.value === "disposal" ? "Ghi giảm" : kind === "fixed" ? "Khấu hao" : "Phân bổ") },
    {
      field: "months_used",
      headerName: "Phần tháng",
      width: 105,
      type: "rightAligned",
      valueFormatter: (p) => formatAmount(Number(p.value), { decimals: 4 }),
    },
    amountCol("amount", "Số tiền", { width: 125 }),
    amountCol("accumulated", "Lũy kế", { width: 130 }),
    amountCol("remaining", "Còn lại", { width: 130 }),
    {
      field: "voucher_number",
      headerName: "Phiếu",
      width: 120,
      cellRenderer: (p: ICellRendererParams<NonNullable<typeof card.data>[number]>) =>
        p.data ? (
          <button type="button" className="text-navy-600 underline" onClick={() => onOpenVoucher(p.data!.voucher_id)}>
            {p.data.voucher_number}
            {p.data.posted ? "" : " (chưa ghi sổ)"}
          </button>
        ) : null,
    },
  ];
  return (
    <Modal open wide title={`Thẻ ${L.short} ${asset.code}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
          <span>
            Tên: <b>{asset.name}</b>
          </span>
          <span>Loại / nhóm: {asset.category ?? "—"}</span>
          <span>Bộ phận: {asset.department ?? "—"}</span>
          <span>
            Ngày ghi tăng: {formatDateVN(asset.acquired_on)} · bắt đầu tính {formatDateVN(asset.start_on)}
          </span>
          <span>
            {L.cost}: <b>{vnd(asset.cost)}</b> · {asset.months} tháng
          </span>
          <span>
            TK: {asset.asset_account}
            {asset.accum_account ? ` / ${asset.accum_account}` : ""} → {asset.expense_account}
          </span>
          {Number(asset.opening_accumulated) > 0 || Number(asset.opening_months) > 0 ? (
            <span>
              Đầu kỳ: {vnd(asset.opening_accumulated)} · {formatAmount(Number(asset.opening_months), { decimals: 2 })} tháng
            </span>
          ) : null}
          <span>
            Trạng thái: <Badge tone={STATUS_TONE[asset.status]}>{ASSET_STATUS_LABEL[asset.status]}</Badge>
            {asset.disposal_reason ? ` · ${asset.disposal_reason}` : ""}
          </span>
        </div>
        <DataGrid rowData={card.data ?? []} columnDefs={cols} loading={card.isLoading} height={320} getRowId={(p) => `${p.data.month}-${p.data.source}`} />
      </div>
    </Modal>
  );
}
