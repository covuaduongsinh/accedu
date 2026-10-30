import { api, friendlyError, type BankLineRow, type BankSuggestion, type VoucherRow } from "@accedu/api";
import { useAccounts, useBankLines, useBankReconciliation, useBankStatements, useDb, usePartners } from "@accedu/api/react";
import { formatAmount, formatDateVN, parseBankStatement, todayVN, type BankStatementParse } from "@accedu/core";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { CheckCheck, FileUp, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataGrid, amountCol, dateCol } from "../../components/DataGrid";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select } from "../../components/ui";
import { readSpreadsheet } from "../../lib/sheet";
import { canPost, useTenantCtx } from "../../lib/tenant";

const VOUCHER_PATH: Record<string, string> = { BC: "cash/bank-credits", BN: "cash/bank-debits", PT: "cash/receipts", PC: "cash/payments", PK: "general/journal-vouchers" };

const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10);
};
const vnd = (n: number | string | null | undefined) => formatAmount(n === null || n === undefined ? 0 : Number(n));

/** Mô tả gợi ý khớp bằng lời */
export function suggestionText(s: BankSuggestion): string {
  if (s.kind === "existing") return `Khớp ${s.number} ngày ${formatDateVN(s.posting_date)}`;
  const who = s.kind === "tuition" ? `Học phí ${s.partner_code ?? ""} ${s.partner_name ?? ""}`.trim() : `Hóa đơn ${s.invoice_number} · ${s.partner_name ?? ""}`;
  const numbers = s.allocations.map((a) => a.number).join(", ");
  const advance = Number(s.advance);
  if (!s.allocations.length) return `${who}: không còn nợ — ghi nhận trước ${vnd(advance)}`;
  const tail = s.sure ? "đủ tiền" : advance > 0 ? `thừa ${vnd(advance)} (ghi nhận trước)` : "trả một phần";
  return `${who} · ${numbers} — ${tail}`;
}

const STATUS: Record<BankLineRow["status"], { label: string; tone: "green" | "gold" | "gray" | "red" | "navy" }> = {
  matched: { label: "Đã khớp", tone: "green" },
  suggested: { label: "Gợi ý", tone: "gold" },
  new: { label: "Chưa khớp", tone: "red" },
  ignored: { label: "Bỏ qua", tone: "gray" },
};

/**
 * Sao kê ngân hàng: nhập tệp sao kê, AccEdu gợi ý khớp (học phí chuyển khoản theo nội dung VietQR, hóa đơn bán, chứng từ
 * đã lập), kế toán xác nhận để lập Giấy báo có; lập BC / BN cho phí, lãi; đối chiếu số dư TK 112 với sao kê.
 */
export function BankStatementPage() {
  const { tenant, role, slug } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const accounts = useAccounts(tenant.id);
  const bankAccounts = (accounts.data ?? []).filter((a) => a.code.startsWith("112") && a.is_postable && a.is_active);
  const [account, setAccount] = useState("");
  const acc = account || bankAccounts[0]?.code || "";
  const [month, setMonth] = useState(todayVN().slice(0, 7));
  const from = `${month}-01`;
  const to = monthEnd(month);
  const asOf = to < todayVN() ? to : todayVN();
  const lines = useBankLines(tenant.id, acc, from, to);
  const recon = useBankReconciliation(tenant.id, acc, asOf);
  const allowed = canPost(role);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState<BankLineRow | null>(null);
  const [linking, setLinking] = useState<BankLineRow | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["report", tenant.id] }), qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] })]);
  const rows = lines.data ?? [];
  const sure = rows.filter((r) => r.status === "suggested" && r.suggestion?.sure);

  async function confirm(ids: string[]) {
    setBusy(true);
    try {
      const r = await api.bankConfirm(db, tenant.id, ids);
      await refresh();
      if (r.confirmed) toast.success(`Đã xác nhận ${r.confirmed} dòng sao kê${r.results.some((x) => x.number) ? `: ${r.results.filter((x) => x.ok && x.number).map((x) => x.number).join(", ")}` : ""}`);
      for (const f of r.results.filter((x) => !x.ok)) toast.error(f.error ?? "Không xác nhận được");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      await refresh();
      toast.success(ok);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const openVoucher = (r: BankLineRow) => {
    const path = r.voucher_type ? VOUCHER_PATH[r.voucher_type] : undefined;
    if (path && r.voucher_id) void navigate({ to: "/$tenant/$", params: { tenant: slug, _splat: path }, search: { edit: r.voucher_id } });
  };

  const cols: ColDef<BankLineRow>[] = [
      dateCol("txn_date", "Ngày", { width: 100 }),
      { field: "ref", headerName: "Số tham chiếu", width: 120 },
      { field: "description", headerName: "Nội dung", flex: 1, minWidth: 220, tooltipField: "description" },
      amountCol("amount_in", "Tiền vào", { width: 120 }),
      amountCol("amount_out", "Tiền ra", { width: 110 }),
      amountCol("balance", "Số dư", { width: 125 }),
      {
        headerName: "Trạng thái",
        width: 105,
        valueGetter: (p) => (p.data ? (p.data.status === "suggested" && !p.data.suggestion?.sure ? "Cần xem" : STATUS[p.data.status].label) : ""),
        cellRenderer: (p: ICellRendererParams<BankLineRow>) => {
          if (!p.data) return null;
          const s = STATUS[p.data.status];
          return <Badge tone={p.data.status === "suggested" && !p.data.suggestion?.sure ? "navy" : s.tone}>{p.value as string}</Badge>;
        },
      },
      {
        headerName: "Gợi ý / chứng từ",
        flex: 1,
        minWidth: 240,
        valueGetter: (p) =>
          !p.data
            ? ""
            : p.data.status === "matched"
              ? `${p.data.voucher_number ?? ""}${p.data.voucher_status && p.data.voucher_status !== "posted" ? " (chưa ghi sổ)" : ""}`
              : p.data.suggestion
                ? suggestionText(p.data.suggestion)
                : "",
        cellRenderer: (p: ICellRendererParams<BankLineRow>) =>
          p.data?.status === "matched" ? (
            <button type="button" className="text-navy-600 underline" onClick={() => p.data && openVoucher(p.data)}>
              {p.value as string}
            </button>
          ) : (
            <span title={p.value as string}>{p.value as string}</span>
          ),
      },
      {
        headerName: "",
        width: 290,
        sortable: false,
        filter: false,
        cellRenderer: (p: ICellRendererParams<BankLineRow>) => {
          const r = p.data;
          if (!r || !allowed) return null;
          const btn = "rounded px-1.5 py-0.5 text-xs font-medium hover:bg-navy-50";
          if (r.status === "matched")
            return (
              <button type="button" className={`${btn} text-muted`} onClick={() => void act(() => api.bankUnlink(db, tenant.id, r.id), "Đã bỏ khớp dòng sao kê")}>
                Bỏ khớp
              </button>
            );
          if (r.status === "ignored")
            return (
              <button type="button" className={`${btn} text-muted`} onClick={() => void act(() => api.bankIgnore(db, tenant.id, r.id, false), "Đã đưa dòng về chưa khớp")}>
                Khôi phục
              </button>
            );
          return (
            <span className="flex gap-1">
              {r.suggestion ? (
                <button type="button" className={`${btn} bg-gold-100 text-navy-800`} disabled={busy} onClick={() => void confirm([r.id])}>
                  Xác nhận
                </button>
              ) : null}
              <button type="button" className={`${btn} text-navy-700`} onClick={() => setCreating(r)}>
                Lập chứng từ
              </button>
              <button type="button" className={`${btn} text-navy-700`} onClick={() => setLinking(r)}>
                Gắn
              </button>
              <button type="button" className={`${btn} text-muted`} onClick={() => void act(() => api.bankIgnore(db, tenant.id, r.id, true), "Đã bỏ qua dòng sao kê")}>
                Bỏ qua
              </button>
            </span>
          );
        },
      },
  ];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Sao kê ngân hàng"
        subtitle="Nhập sao kê, tự khớp học phí chuyển khoản theo nội dung VietQR, đối chiếu số dư TK 112"
        actions={
          allowed ? (
            <>
              <Button variant="gold" icon={<CheckCheck size={14} />} disabled={busy || sure.length === 0} onClick={() => void confirm(sure.map((r) => r.id))}>
                Xác nhận {sure.length} gợi ý chắc chắn
              </Button>
              <Button icon={<FileUp size={14} />} disabled={!acc} onClick={() => setImporting(true)}>
                Nhập sao kê
              </Button>
            </>
          ) : null
        }
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tài khoản ngân hàng" className="w-72">
            <Select aria-label="Tài khoản ngân hàng" value={acc} onChange={(e) => setAccount(e.target.value)}>
              {bankAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tháng" className="w-40">
            <Input type="month" aria-label="Tháng sao kê" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </Field>
          {recon.data ? (
            <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
              <Stat label={`Số dư sổ ${acc} đến ${formatDateVN(asOf)}`} value={vnd(recon.data.book_balance)} testId="bank-book" />
              <Stat
                label={recon.data.statement_date ? `Số dư sao kê ngày ${formatDateVN(recon.data.statement_date)}` : "Số dư sao kê"}
                value={recon.data.statement_balance === null ? "—" : vnd(recon.data.statement_balance)}
                testId="bank-statement"
              />
              <Stat
                label="Chênh lệch"
                value={recon.data.difference === null ? "—" : vnd(recon.data.difference)}
                tone={recon.data.difference !== null && Number(recon.data.difference) !== 0 ? "red" : "green"}
                testId="bank-diff"
              />
              <Stat
                label="Dòng sao kê chưa khớp"
                value={`${recon.data.unmatched_count} dòng`}
                tone={recon.data.unmatched_count ? "red" : "green"}
                testId="bank-unmatched"
              />
            </div>
          ) : null}
        </div>
        {recon.data?.book_only.length ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-navy-700">
              {recon.data.book_only.length} chứng từ ghi TK {acc} chưa có trên sao kê (tổng {vnd(recon.data.book_only.reduce((s, b) => s + Number(b.amount), 0))})
            </summary>
            <ul className="mt-1 space-y-0.5 pl-4">
              {recon.data.book_only.map((b) => (
                <li key={b.voucher_id}>
                  {formatDateVN(b.posting_date)} · {b.number} · {vnd(b.amount)} · {b.description ?? ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>
      <DataGrid<BankLineRow>
        rowData={rows}
        columnDefs={cols}
        loading={lines.isLoading}
        getRowId={(p) => p.data.id}
        height="calc(100vh - 330px)"
        overlayNoRowsTemplate="Chưa có dòng sao kê trong tháng — bấm Nhập sao kê"
      />
      <StatementHistory account={acc} />
      {importing ? <ImportDialog account={acc} onClose={() => setImporting(false)} onDone={refresh} /> : null}
      {creating ? <CreateVoucherDialog line={creating} onClose={() => setCreating(null)} onDone={refresh} /> : null}
      {linking ? <LinkDialog line={linking} onClose={() => setLinking(null)} onDone={refresh} /> : null}
    </div>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: string; tone?: "red" | "green"; testId: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-semibold tabular-nums ${tone === "red" ? "text-danger" : tone === "green" ? "text-success" : "text-navy-700"}`} data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/** Nhập tệp sao kê: đọc ở trình duyệt, xem trước rồi gửi các dòng hợp lệ */
function ImportDialog({ account, onClose, onDone }: { account: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<BankStatementParse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(f: File) {
    setFile(f);
    setParsed(null);
    setError(null);
    try {
      const sheets = await readSpreadsheet(f);
      // Sheet có nhiều giao dịch nhất
      const best = sheets.map((s) => parseBankStatement(s.rows)).toSorted((a, b) => b.lines.length - a.lines.length)[0];
      if (!best) throw new Error("Tệp trống");
      setParsed(best);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function submit() {
    if (!parsed || !file) return;
    setBusy(true);
    try {
      const r = await api.importBankStatement(db, tenant.id, account, parsed, file.name);
      await onDone();
      toast.success(`Đã nhập ${r.inserted} giao dịch${r.duplicates ? `, bỏ qua ${r.duplicates} giao dịch đã có` : ""}`);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`Nhập sao kê vào TK ${account}`} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Tải sao kê từ internet banking dạng Excel (.xlsx) hoặc CSV. AccEdu tự tìm dòng tiêu đề và các cột ngày, nội dung, tiền vào / ra, số dư.
          Nhập lại cùng tệp không tạo dòng trùng.
        </p>
        <input
          type="file"
          aria-label="Tệp sao kê"
          accept=".xlsx,.csv,.tsv,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void read(f);
          }}
        />
        {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-danger">{error}</p> : null}
        {parsed ? (
          <div className="rounded-md border border-line p-3" data-testid="bank-preview">
            <p>
              Dòng tiêu đề {parsed.headerRow}: {Object.entries(parsed.columns).map(([, v]) => `“${v}”`).join(", ")}
            </p>
            <p className="mt-1 font-medium text-navy-700">
              {parsed.lines.length} giao dịch{parsed.from ? ` từ ${formatDateVN(parsed.from)} đến ${formatDateVN(parsed.to)}` : ""} · tiền vào {vnd(parsed.totalIn)} ·
              tiền ra {vnd(parsed.totalOut)}
              {parsed.closingBalance !== null ? ` · số dư cuối ${vnd(parsed.closingBalance)}` : ""}
            </p>
            {parsed.errors.length ? (
              <ul className="mt-2 list-disc pl-5 text-danger">
                {parsed.errors.slice(0, 10).map((e) => (
                  <li key={e.row}>
                    Dòng {e.row}: {e.message}
                  </li>
                ))}
                {parsed.errors.length > 10 ? <li>… và {parsed.errors.length - 10} lỗi khác</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={!parsed?.lines.length || busy} onClick={() => void submit()}>
            Nhập {parsed?.lines.length ?? 0} giao dịch
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Dòng chưa khớp: lập Giấy báo có / báo nợ với TK đối ứng tự chọn */
function CreateVoucherDialog({ line, onClose, onDone }: { line: BankLineRow; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const accounts = useAccounts(tenant.id);
  const partners = usePartners(tenant.id);
  const incoming = Number(line.amount_in) > 0;
  // Gợi ý: tiền ra thường là phí ngân hàng (chi phí quản lý), tiền vào nhỏ thường là lãi tiền gửi (515)
  const [form, setForm] = useState({
    account: incoming ? "515" : tenant.regime === "TT133" ? "6422" : "6427",
    partnerId: "",
    description: line.description,
  });
  const [busy, setBusy] = useState(false);
  const postable = (accounts.data ?? []).filter((a) => a.is_postable && a.is_active && !a.code.startsWith("112"));

  async function save() {
    setBusy(true);
    try {
      const r = await api.bankCreateVoucher(db, tenant.id, line.id, { account: form.account, partnerId: form.partnerId || null, description: form.description });
      await onDone();
      toast.success(`Đã lập ${r.number}`);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={incoming ? "Lập giấy báo có từ sao kê" : "Lập giấy báo nợ từ sao kê"} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>
          {formatDateVN(line.txn_date)} · {incoming ? "Tiền vào" : "Tiền ra"} <b>{vnd(incoming ? line.amount_in : line.amount_out)}</b> · {line.description}
        </p>
        <Field label={incoming ? "Ghi Có tài khoản" : "Ghi Nợ tài khoản"}>
          <Select aria-label="Tài khoản đối ứng" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
            {postable.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Đối tượng (khi ghi công nợ 131 / 331)">
          <Select aria-label="Đối tượng" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
            <option value="">— Không —</option>
            {(partners.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Diễn giải">
          <Input aria-label="Diễn giải" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy || !form.account} onClick={() => void save()}>
            Lập và ghi sổ
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Gắn tay một chứng từ đã ghi sổ cùng số tiền (lập trước khi có sao kê) */
function LinkDialog({ line, onClose, onDone }: { line: BankLineRow; onClose: () => void; onDone: () => Promise<unknown> }) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const [voucher, setVoucher] = useState("");
  const amount = Number(line.amount_in) || Number(line.amount_out);
  const shift = (days: number) => new Date(Date.parse(`${line.txn_date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const candidates = useQuery({
    queryKey: ["vouchers", tenant.id, "bank-link", line.id],
    queryFn: () => api.vouchers(db, tenant.id, { from: shift(-31), to: shift(31), limit: 2000 }),
  });
  const choices: VoucherRow[] | null = candidates.data ? candidates.data.filter((v) => v.status === "posted" && Number(v.total_amount) === amount) : null;

  return (
    <Modal open title="Gắn dòng sao kê với chứng từ có sẵn" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>
          {formatDateVN(line.txn_date)} · {vnd(amount)} · {line.description}
        </p>
        <Field label="Chứng từ đã ghi sổ cùng số tiền (± 1 tháng)">
          <Select aria-label="Chứng từ" value={voucher} onChange={(e) => setVoucher(e.target.value)}>
            <option value="">{choices === null ? "Đang tải…" : choices.length ? "— Chọn chứng từ —" : "Không có chứng từ phù hợp"}</option>
            {(choices ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.number} · {formatDateVN(v.posting_date)} · {v.description ?? ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button
            icon={<Link2 size={14} />}
            disabled={!voucher}
            onClick={() =>
              void api
                .bankLink(db, tenant.id, line.id, voucher)
                .then(onDone)
                .then(() => {
                  toast.success("Đã gắn chứng từ");
                  onClose();
                })
                .catch((e: unknown) => toast.error(friendlyError(e)))
            }
          >
            Gắn
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Các lần nhập sao kê của TK: xóa lần nhập sai (dòng sao kê mất, chứng từ đã lập giữ nguyên) */
function StatementHistory({ account }: { account: string }) {
  const { tenant, role } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const statements = useBankStatements(tenant.id, account);
  if (!statements.data?.length) return null;
  return (
    <details className="rounded-md border border-line bg-surface p-3 text-sm">
      <summary className="cursor-pointer font-medium text-navy-700">Các lần nhập sao kê ({statements.data.length})</summary>
      <ul className="mt-2 space-y-1">
        {statements.data.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span>
              {new Date(s.created_at).toLocaleString("vi-VN")} · {s.file_name ?? "—"} · {s.period_from ? `${formatDateVN(s.period_from)} – ${formatDateVN(s.period_to)}` : ""} ·{" "}
              {s.inserted} mới{s.duplicates ? `, ${s.duplicates} trùng` : ""}
            </span>
            {canPost(role) ? (
              <button
                type="button"
                aria-label="Xóa lần nhập"
                className="text-muted hover:text-danger"
                onClick={() => {
                  if (!window.confirm("Xóa lần nhập sao kê này? Các dòng sao kê bị xóa, chứng từ đã lập vẫn giữ.")) return;
                  void api
                    .deleteBankStatement(db, tenant.id, s.id)
                    .then((n) => qc.invalidateQueries({ queryKey: ["report", tenant.id] }).then(() => toast.success(`Đã xóa ${n} dòng sao kê`)))
                    .catch((e: unknown) => toast.error(friendlyError(e)));
                }}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
