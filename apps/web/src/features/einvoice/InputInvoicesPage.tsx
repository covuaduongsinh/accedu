import { api, friendlyError, qk, type EInvoiceImportResult, type PurchaseInvoiceImport } from "@accedu/api";
import { useAccounts, useDb } from "@accedu/api/react";
import { VAT_CODES, formatAmount, formatDateVN, invoiceDefaults } from "@accedu/core";
import { einvoiceKey, guessPurchaseType, parseEInvoiceXml, type EInvoiceParse } from "@accedu/core/einvoice";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { strFromU8, unzipSync } from "fflate";
import { ChevronDown, ChevronRight, FileUp, Trash2 } from "lucide-react";
import { Fragment, useId, useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Badge, Button, Input, PageHeader, Select } from "../../components/ui";
import { canPost, useTenantCtx } from "../../lib/tenant";

const MAX_XML = 2 * 1024 * 1024;
const MAX_ZIP = 20 * 1024 * 1024;
const MAX_INVOICES = 200;

type PurchaseType = "HDM" | "HMV";
type ServerResult = EInvoiceImportResult["results"][number];

interface Item {
  id: number;
  file: string;
  key: string | null;
  parse: EInvoiceParse;
  type: PurchaseType;
  account: string;
  postingDate: string;
  /** Trùng hóa đơn khác trong cùng lô */
  duplicate: boolean;
}

let seq = 0;

/** Đọc các tệp được thả: .xml, hoặc .zip chứa .xml (thường kèm .pdf) */
async function readFiles(files: File[]): Promise<{ name: string; xml: string | null; error?: string }[]> {
  const out: { name: string; xml: string | null; error?: string }[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      if (f.size > MAX_ZIP) {
        out.push({ name: f.name, xml: null, error: "Tệp nén quá 20 MB" });
        continue;
      }
      try {
        const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.xml$/i.test(e.name) && e.originalSize <= MAX_XML });
        const xmls = Object.entries(entries);
        if (!xmls.length) out.push({ name: f.name, xml: null, error: "Tệp nén không có tệp .xml" });
        for (const [name, data] of xmls) out.push({ name: `${f.name} › ${name}`, xml: strFromU8(data) });
      } catch (e) {
        out.push({ name: f.name, xml: null, error: `Không giải nén được: ${(e as Error).message}` });
      }
    } else if (/\.xml$/i.test(f.name)) {
      out.push(f.size > MAX_XML ? { name: f.name, xml: null, error: "Tệp XML quá 2 MB" } : { name: f.name, xml: await f.text() });
    } else {
      out.push({ name: f.name, xml: null, error: "Chỉ nhận tệp .xml hoặc .zip" });
    }
  }
  return out;
}

/** Băm ngắn nội dung lô (làm khóa cache cho lần chạy thử) */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + text.length.toString(36);
}

const usable = (it: Item) => !!it.parse.invoice && it.parse.errors.length === 0 && !it.duplicate;

function toPayload(it: Item): PurchaseInvoiceImport {
  const inv = it.parse.invoice!;
  return {
    row: it.id,
    voucher_type: it.type,
    posting_date: it.postingDate,
    invoice_date: inv.date,
    line_account: it.account.trim(),
    seller: { name: inv.seller.name, tax_code: inv.seller.taxCode, address: inv.seller.address },
    invoice_series: inv.series,
    invoice_series_short: inv.seriesShort,
    invoice_number: inv.number,
    lines: inv.lines.map((l) => ({
      description: l.description,
      uom: l.uom,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      amount: l.amount,
      discount_amount: l.discount,
      vat_code: l.vatCode,
      vat_amount: l.vatAmount,
    })),
  };
}

/** Hóa đơn đầu vào: kéo thả XML hóa đơn điện tử (TT78) → xem trước → tạo hóa đơn mua nháp */
export function InputInvoicesPage() {
  const { tenant, role, slug } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const accounts = useAccounts(tenant.id);
  const listId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [created, setCreated] = useState<Record<number, ServerResult>>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const allowed = canPost(role);

  const postable = useMemo(() => (accounts.data ?? []).filter((a) => a.is_postable && a.is_active), [accounts.data]);
  const payload = useMemo(() => items.filter(usable).map(toPayload), [items]);

  // Chạy thử trên máy chủ mỗi khi danh sách hoặc lựa chọn Loại / TK / Ngày thay đổi (không ghi gì)
  const check = useQuery({
    queryKey: ["einvoice-check", tenant.id, hash(JSON.stringify(payload))],
    queryFn: () => api.importPurchaseInvoices(db, tenant.id, payload, { dryRun: true }),
    enabled: allowed && payload.length > 0,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const checking = check.isFetching || check.isPlaceholderData;
  const server = useMemo<Record<number, ServerResult>>(
    () => ({ ...Object.fromEntries((payload.length ? (check.data?.results ?? []) : []).map((x) => [x.row, x])), ...created }),
    [check.data, created, payload.length],
  );

  async function addFiles(files: File[]) {
    if (!files.length) return;
    const read = await readFiles(files);
    setItems((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((p) => p.key).filter(Boolean));
      for (const f of read) {
        const parses: EInvoiceParse[] = f.xml === null ? [{ invoice: null, errors: [f.error ?? "Không đọc được tệp"], warnings: [] }] : parseEInvoiceXml(f.xml, { buyerTaxCode: tenant.tax_code });
        for (const p of parses) {
          if (next.length >= MAX_INVOICES) {
            toast.error(`Tối đa ${MAX_INVOICES} hóa đơn mỗi lần — nhập phần còn lại sau`);
            return next;
          }
          const inv = p.invoice;
          const key = inv ? einvoiceKey(inv.seller.taxCode, inv.series, inv.number) : null;
          const type = inv ? guessPurchaseType(inv) : "HDM";
          next.push({
            id: ++seq,
            file: f.name,
            key,
            parse: p,
            type,
            account: invoiceDefaults(tenant.regime, type).lineAccount,
            postingDate: inv?.date ?? "",
            duplicate: !!key && seen.has(key),
          });
          if (key) seen.add(key);
        }
      }
      return next;
    });
  }

  const update = (id: number, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const results = payload.map((p) => server[p.row]);
  const newCount = results.filter((r) => r?.status === "new").length;
  const existsCount = results.filter((r) => r?.status === "exists").length;
  const createdCount = results.filter((r) => r?.status === "created").length;
  const errorCount = items.filter((it) => !usable(it) && !it.duplicate).length + results.filter((r) => r?.status === "error").length;
  const creatable = payload.filter((p) => server[p.row]?.status === "new");

  async function create() {
    setBusy(true);
    try {
      const r = await api.importPurchaseInvoices(db, tenant.id, creatable);
      if (!r.ok) {
        toast.error(r.results.find((x) => x.status === "error")?.message ?? "Có hóa đơn lỗi — chưa tạo hóa đơn nào");
        return;
      }
      setCreated((s) => ({ ...s, ...Object.fromEntries(r.results.map((x) => [x.row, x])) }));
      toast.success(`Đã tạo ${r.created} hóa đơn mua nháp${r.partners_created ? `, ${r.partners_created} nhà cung cấp mới` : ""}`);
      void qc.invalidateQueries({ queryKey: ["vouchers", tenant.id] });
      void qc.invalidateQueries({ queryKey: qk.partners(tenant.id) });
      void qc.invalidateQueries({ queryKey: ["report", tenant.id] });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    void addFiles([...e.dataTransfer.files]);
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Hóa đơn đầu vào (XML)"
        subtitle="Kéo thả tệp XML hóa đơn điện tử người bán gửi (hoặc tệp .zip) — AccEdu đọc, kiểm tra rồi tạo hóa đơn mua ở trạng thái nháp"
        actions={
          items.length ? (
            <Button variant="secondary" icon={<Trash2 size={14} />} onClick={() => (setItems([]), setCreated({}), setOpen(new Set()))}>
              Xóa danh sách
            </Button>
          ) : null
        }
      />
      {!allowed ? <div className="rounded-md border border-gold-300 bg-gold-50 p-3 text-sm">Vai trò của bạn không được nhập hóa đơn mua.</div> : null}
      <datalist id={listId}>
        {postable.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </datalist>
      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-navy-200 bg-navy-50/40 p-6 text-sm text-navy-700 hover:bg-navy-50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <FileUp className="text-navy-500" />
        <span className="font-medium">Chọn hoặc kéo thả tệp hóa đơn (.xml, .zip) vào đây — được chọn nhiều tệp</span>
        <span className="text-xs text-muted">Hóa đơn điện tử theo TT78/2021. Tệp chỉ được đọc trên máy này; AccEdu lưu dữ liệu hóa đơn, không lưu tệp gốc.</span>
        <input
          type="file"
          multiple
          aria-label="Chọn tệp hóa đơn XML"
          accept=".xml,.zip"
          className="sr-only"
          disabled={!allowed}
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </label>

      {items.length ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              {items.length} hóa đơn · <b>{newCount}</b> mới{createdCount ? ` · ${createdCount} đã tạo` : ""} · {existsCount} đã có · <span className={errorCount ? "text-danger" : ""}>{errorCount} lỗi</span>
              {checking ? <span className="ml-2 text-xs text-muted">Đang kiểm tra…</span> : null}
              {check.error ? <span className="ml-2 text-xs text-danger">{friendlyError(check.error)}</span> : null}
            </span>
            <span className="text-xs text-muted">Hóa đơn được tạo ở trạng thái nháp — mở Mua hàng › Hóa đơn mua để xem lại và ghi sổ.</span>
            <Button className="ml-auto" disabled={!allowed || busy || checking || !creatable.length} onClick={() => void create()}>
              Tạo {creatable.length} hóa đơn mua (nháp)
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-xs text-navy-700">
                <tr>
                  <th className="w-8" />
                  <th className="px-2 py-1.5 text-left">Nhà cung cấp</th>
                  <th className="px-2 text-left">Ký hiệu · Số</th>
                  <th className="px-2 text-left">Ngày HĐ</th>
                  <th className="px-2 text-right">Tiền hàng</th>
                  <th className="px-2 text-right">Thuế GTGT</th>
                  <th className="px-2 text-right">Tổng</th>
                  <th className="w-40 px-2 text-left">Loại</th>
                  <th className="w-28 px-2 text-left">TK Nợ</th>
                  <th className="w-40 px-2 text-left">Ngày hạch toán</th>
                  <th className="px-2 text-left">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const inv = it.parse.invoice;
                  const r = usable(it) ? server[it.id] : undefined;
                  const locked = !usable(it) || r?.status === "created" || r?.status === "exists" || !allowed;
                  return (
                    <Fragment key={it.id}>
                      <tr className="border-t border-line align-top">
                        <td className="px-1 py-1.5">
                          <button type="button" aria-label={`Chi tiết hóa đơn ${inv?.number ?? it.file}`} className="text-muted" onClick={() => toggle(it.id)}>
                            {open.has(it.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td className="px-2 py-1.5">
                          {inv ? (
                            <>
                              <div className="font-medium text-navy-700">{inv.seller.name}</div>
                              <div className="text-xs text-muted">
                                MST {inv.seller.taxCode}
                                {r?.partner === "new" ? (
                                  <span className="ml-1">
                                    <Badge tone="gold">NCC mới</Badge>
                                  </span>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-muted">{it.file}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">{inv ? `${inv.series} · ${inv.number}` : ""}</td>
                        <td className="px-2 py-1.5">{inv ? formatDateVN(inv.date) : ""}</td>
                        <td className="num px-2 py-1.5 text-right">{inv ? formatAmount(inv.totals.net) : ""}</td>
                        <td className="num px-2 py-1.5 text-right">{inv ? formatAmount(inv.totals.vat) : ""}</td>
                        <td className="num px-2 py-1.5 text-right font-medium">{inv ? formatAmount(inv.totals.total) : ""}</td>
                        <td className="px-1 py-1">
                          {inv ? (
                            <Select
                              aria-label={`Loại hóa đơn ${inv.number}`}
                              value={it.type}
                              disabled={locked}
                              onChange={(e) => {
                                const type = e.target.value as PurchaseType;
                                update(it.id, { type, account: invoiceDefaults(tenant.regime, type).lineAccount });
                              }}
                            >
                              <option value="HDM">Mua hàng</option>
                              <option value="HMV">Mua dịch vụ</option>
                            </Select>
                          ) : null}
                        </td>
                        <td className="px-1 py-1">
                          {inv ? <Input list={listId} aria-label={`TK Nợ hóa đơn ${inv.number}`} value={it.account} disabled={locked} onChange={(e) => update(it.id, { account: e.target.value })} /> : null}
                        </td>
                        <td className="px-1 py-1">
                          {inv ? (
                            <Input type="date" aria-label={`Ngày hạch toán hóa đơn ${inv.number}`} value={it.postingDate} disabled={locked} onChange={(e) => update(it.id, { postingDate: e.target.value })} />
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5" data-testid={`status-${inv?.number ?? it.id}`}>
                          <Status it={it} r={r} checking={checking} slug={slug} />
                        </td>
                      </tr>
                      {open.has(it.id) ? (
                        <tr className="bg-navy-50/40">
                          <td />
                          <td colSpan={10} className="px-2 py-2">
                            <div className="mb-1 text-xs text-muted">Tệp: {it.file}</div>
                            {inv ? (
                              <table className="w-full text-xs">
                                <thead className="text-muted">
                                  <tr>
                                    <th className="px-2 text-left">Hàng hóa, dịch vụ</th>
                                    <th className="px-2 text-left">Đvt</th>
                                    <th className="px-2 text-right">SL</th>
                                    <th className="px-2 text-right">Đơn giá</th>
                                    <th className="px-2 text-right">Chiết khấu</th>
                                    <th className="px-2 text-right">Thành tiền</th>
                                    <th className="px-2 text-left">Thuế suất</th>
                                    <th className="px-2 text-right">Tiền thuế</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {inv.lines.map((l) => (
                                    <tr key={l.lineNo} className="border-t border-line">
                                      <td className="px-2">{l.description}</td>
                                      <td className="px-2">{l.uom}</td>
                                      <td className="num px-2 text-right">{l.quantity ?? ""}</td>
                                      <td className="num px-2 text-right">{l.unitPrice === null ? "" : formatAmount(l.unitPrice)}</td>
                                      <td className="num px-2 text-right">{l.discount ? formatAmount(l.discount) : ""}</td>
                                      <td className="num px-2 text-right">{formatAmount(l.amount)}</td>
                                      <td className="px-2">{l.vatCode ? VAT_CODES[l.vatCode].label : "—"}</td>
                                      <td className="num px-2 text-right">{formatAmount(l.vatAmount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : null}
                            <Messages it={it} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Status({ it, r, checking, slug }: { it: Item; r: ServerResult | undefined; checking: boolean; slug: string }) {
  const warnings = it.parse.warnings.length;
  const badge = (() => {
    if (it.parse.errors.length || !it.parse.invoice) return <Badge tone="red">Lỗi</Badge>;
    if (it.duplicate) return <Badge tone="gray">Trùng trong lô</Badge>;
    if (!r) return <span className="text-xs text-muted">{checking ? "Đang kiểm tra…" : "—"}</span>;
    switch (r.status) {
      case "new":
        return <Badge tone="navy">Mới</Badge>;
      case "created":
        return (
          <Link to="/$tenant/$" params={{ tenant: slug, _splat: "purchase/invoices" }} search={r.voucher_id ? { edit: r.voucher_id } : {}}>
            <Badge tone="green">Đã tạo {r.number}</Badge>
          </Link>
        );
      case "exists":
        return <Badge tone="gray">Đã có {r.number}</Badge>;
      case "error":
        return <Badge tone="red">Lỗi</Badge>;
    }
  })();
  const firstError = it.parse.errors[0] ?? (r?.status === "error" ? r.message : undefined);
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1">
        {badge}
        {warnings ? <Badge tone="gold">{warnings} cảnh báo</Badge> : null}
      </div>
      {firstError ? <div className="max-w-xs text-xs text-danger">{firstError}</div> : null}
      {!firstError && warnings ? <div className="max-w-xs text-xs text-gold-800">{it.parse.warnings[0]}</div> : null}
    </div>
  );
}

function Messages({ it }: { it: Item }) {
  if (!it.parse.errors.length && !it.parse.warnings.length) return null;
  return (
    <ul className="mt-2 list-disc pl-5 text-xs">
      {it.parse.errors.map((m) => (
        <li key={m} className="text-danger">
          {m}
        </li>
      ))}
      {it.parse.warnings.map((m) => (
        <li key={m} className="text-gold-800">
          {m}
        </li>
      ))}
    </ul>
  );
}
