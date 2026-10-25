import { api, friendlyError, qk, type ImportResult } from "@accedu/api";
import { useDb } from "@accedu/api/react";
import {
  IMPORT_SPECS,
  applyServerErrors,
  autoMap,
  balanceColumns,
  buildPreview,
  cellText,
  detectHeader,
  formatAmount,
  headersAt,
  missingRequired,
  parseDelimited,
  payloadOf,
  type AccountImportRow,
  type ColumnMap,
  type HeaderGuess,
  type ImportKind,
  type ItemImportRow,
  type OpeningImportRow,
  type PartnerImportRow,
  type Preview,
  type PreviewRow,
  type Table,
} from "@accedu/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { ArrowLeft, FileDown, FileUp, Upload } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { DataGrid } from "../../components/DataGrid";
import { Badge, Button, Field, Modal, Select } from "../../components/ui";
import { downloadTemplate } from "../../lib/export";
import { readSpreadsheet, type SheetTable } from "../../lib/sheet";
import { useTenantCtx } from "../../lib/tenant";

const STATUS_LABEL: Record<PreviewRow["status"], string> = { new: "Mới", update: "Cập nhật", skip: "Bỏ qua", error: "Lỗi" };

/** A, B, …, Z, AA… như tên cột Excel */
function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

interface Props {
  kind: ImportKind;
  open: boolean;
  onClose: () => void;
  /** Nhập từ trang Nhà cung cấp: đối tượng mới mặc định là NCC */
  partnerDefault?: "customer" | "supplier";
}

/** Nhập từ Excel dùng chung: chọn tệp / dán → ghép cột → xem trước từng dòng → nhập nguyên khối */
export function ImportDialog({ kind, open, onClose, partnerDefault }: Props) {
  const { tenant } = useTenantCtx();
  const db = useDb();
  const qc = useQueryClient();
  const spec = IMPORT_SPECS[kind];
  const isOpening = kind === "opening-accounts" || kind === "opening-partners";

  const [step, setStep] = useState<"source" | "map" | "preview">("source");
  const [sheets, setSheets] = useState<SheetTable[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [header, setHeader] = useState<HeaderGuess | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [busy, setBusy] = useState(false);

  const table: Table = sheets[sheetIdx]?.rows ?? [];

  function reset() {
    setStep("source");
    setSheets([]);
    setSheetIdx(0);
    setHeader(null);
    setMap({});
    setPasted("");
    setPreview(null);
    setOnlyProblems(false);
  }

  function close() {
    reset();
    onClose();
  }

  function applyHeader(guess: HeaderGuess) {
    setHeader(guess);
    setMap(autoMap(guess.headers, spec.fields));
  }

  function load(list: SheetTable[]) {
    const usable = list.filter((s) => s.rows.some((r) => r.some((c) => cellText(c) !== "")));
    if (!usable.length) {
      toast.error("Tệp không có dữ liệu");
      return;
    }
    // Chọn sheet khớp được nhiều cột nhất
    let best = 0;
    let bestScore = -1;
    usable.forEach((s, i) => {
      const g = detectHeader(s.rows, spec.fields);
      const m = autoMap(g.headers, spec.fields);
      const score = Object.values(m).filter((v) => v !== null).length;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    setSheets(usable);
    setSheetIdx(best);
    applyHeader(detectHeader(usable[best]!.rows, spec.fields));
    setStep("map");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      load(await readSpreadsheet(file));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    void onFile(e.dataTransfer.files[0]);
  }

  function chooseSheet(i: number) {
    setSheetIdx(i);
    const rows = sheets[i]?.rows ?? [];
    applyHeader(detectHeader(rows, spec.fields));
  }

  function chooseHeaderRow(row: number, height: 1 | 2) {
    applyHeader({ row, height, headers: headersAt(table, row, height) });
  }

  const periods = useMemo(() => (header && isOpening ? balanceColumns(header.headers) : {}), [header, isOpening]);
  const missing = missingRequired(kind, map);

  async function makePreview() {
    if (!header) return;
    setBusy(true);
    try {
      // Luôn đối chiếu với danh mục mới nhất trên máy chủ (bộ nhớ đệm có thể cũ vài giây sau lần nhập trước)
      const [accs, parts, items] = await Promise.all([
        qc.fetchQuery({ queryKey: qk.accounts(tenant.id), queryFn: () => api.accounts(db, tenant.id), staleTime: 0 }),
        qc.fetchQuery({ queryKey: qk.partners(tenant.id), queryFn: () => api.partners(db, tenant.id), staleTime: 0 }),
        kind === "items" ? qc.fetchQuery({ queryKey: qk.items(tenant.id), queryFn: () => api.items(db, tenant.id), staleTime: 0 }) : Promise.resolve([]),
      ]);
      setPreview(buildPreview(kind, table, header, map, { accounts: accs, partners: parts, items, ...(partnerDefault ? { partnerDefault } : {}) }));
      setStep("preview");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!preview) return;
    setBusy(true);
    try {
      const rows = payloadOf(preview);
      let result: ImportResult;
      if (kind === "accounts") result = await api.importAccounts(db, tenant.id, rows as AccountImportRow[]);
      else if (kind === "partners") result = await api.importPartners(db, tenant.id, rows as PartnerImportRow[]);
      else if (kind === "items") result = await api.importItems(db, tenant.id, rows as ItemImportRow[]);
      else result = await api.importOpeningBalances(db, tenant.id, kind === "opening-accounts" ? "account" : "partner", rows as OpeningImportRow[]);
      if (!result.ok) {
        setPreview(applyServerErrors(preview, result.errors));
        setOnlyProblems(true);
        toast.error(`Máy chủ từ chối ${result.errors.length} dòng — chưa ghi gì. Sửa tệp rồi nhập lại.`);
        return;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.accounts(tenant.id) }),
        qc.invalidateQueries({ queryKey: qk.partners(tenant.id) }),
        qc.invalidateQueries({ queryKey: qk.items(tenant.id) }),
        qc.invalidateQueries({ queryKey: qk.opening(tenant.id) }),
        qc.invalidateQueries({ queryKey: ["report", tenant.id] }),
      ]);
      const parts = isOpening
        ? [`${result.inserted} dòng số dư`, `Nợ ${formatAmount(result.debit ?? 0)}`, `Có ${formatAmount(result.credit ?? 0)}`]
        : [`thêm ${result.inserted}`, `cập nhật ${result.updated ?? 0}`, `không đổi ${result.unchanged ?? 0}`];
      toast.success(`Đã nhập ${spec.title.toLowerCase()}: ${parts.join(", ")}`);
      close();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const cols = useMemo<ColDef<PreviewRow>[]>(() => {
    const valueCols = spec.fields
      .filter((f) => map[f.key] !== null && map[f.key] !== undefined)
      .map<ColDef<PreviewRow>>((f) => ({
        headerName: f.label,
        valueGetter: (p) => p.data?.values[f.key] ?? "",
        width: f.key === "name" || f.key === "partnerName" || f.key === "address" ? 220 : 130,
        ...(f.key === "debit" || f.key === "credit" ? { type: "rightAligned" } : {}),
      }));
    return [
      { field: "row", headerName: "Dòng", width: 80, pinned: "left" },
      {
        field: "status",
        headerName: "Trạng thái",
        width: 110,
        pinned: "left",
        valueFormatter: (p) => STATUS_LABEL[p.value as PreviewRow["status"]] ?? "",
        cellClassRules: {
          "text-danger font-medium": (p) => p.value === "error",
          "text-success": (p) => p.value === "new",
          "text-navy-600": (p) => p.value === "update",
          "text-muted": (p) => p.value === "skip",
        },
      },
      { field: "message", headerName: "Ghi chú", width: 300, tooltipField: "message" },
      ...valueCols,
    ];
  }, [spec.fields, map]);

  const shownRows = useMemo(
    () => (preview ? (onlyProblems ? preview.rows.filter((r) => r.status === "error" || r.status === "skip") : preview.rows) : []),
    [preview, onlyProblems],
  );
  const toImport = preview ? preview.counts.new + preview.counts.update : 0;
  const diff = preview?.totals ? preview.totals.debit - preview.totals.credit : 0;

  return (
    <Modal open={open} title={`Nhập từ Excel — ${spec.title}`} onClose={close} wide>
      {step === "source" ? (
        <div className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
            {spec.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<FileDown size={14} />} onClick={() => void downloadTemplate(kind)}>
              Tải tệp mẫu
            </Button>
            <span className="text-xs text-muted">Tệp mẫu có tiêu đề cột chuẩn, dòng ví dụ và sheet Hướng dẫn.</span>
          </div>
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-navy-200 bg-navy-50/40 p-6 text-sm text-navy-700 hover:bg-navy-50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <FileUp className="text-navy-500" />
            <span className="font-medium">{busy ? "Đang đọc tệp…" : "Chọn hoặc kéo thả tệp Excel (.xlsx, .csv) vào đây"}</span>
            <input
              type="file"
              aria-label="Chọn tệp Excel"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <Field label="Hoặc dán dữ liệu đã sao chép từ Excel / lưới FAO (gồm cả dòng tiêu đề)">
            <textarea
              aria-label="Dữ liệu dán từ Excel"
              className="h-28 w-full rounded-md border border-line p-2 font-mono text-xs outline-none focus:border-navy-400"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button disabled={!pasted.trim()} onClick={() => load([{ name: "Dữ liệu dán", rows: parseDelimited(pasted) }])}>
              Dùng dữ liệu đã dán
            </Button>
          </div>
        </div>
      ) : null}

      {step === "map" && header ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {sheets.length > 1 ? (
              <Field label="Sheet">
                <Select value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={s.name + i} value={i}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Dòng tiêu đề">
              <Select value={header.row} onChange={(e) => chooseHeaderRow(Number(e.target.value), header.height)}>
                {table.slice(0, 30).map((r, i) => (
                  <option key={i} value={i}>
                    {`Dòng ${i + 1}: ${r.map(cellText).filter(Boolean).join(" | ").slice(0, 90)}`}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={header.height === 2} onChange={(e) => chooseHeaderRow(header.row, e.target.checked ? 2 : 1)} />
              Tiêu đề gộp 2 dòng (vd. “Số dư đầu kỳ” / “Nợ – Có”)
            </label>
          </div>

          {periods.opening && periods.closing ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-gold-50 p-2 text-sm">
              <span className="font-medium text-navy-700">Tệp có cả số dư đầu kỳ và cuối kỳ — lấy cột:</span>
              {(["opening", "closing"] as const).map((p) => (
                <label key={p} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="period"
                    checked={map.debit === periods[p]!.debit && map.credit === periods[p]!.credit}
                    onChange={() => setMap((m) => ({ ...m, debit: periods[p]!.debit, credit: periods[p]!.credit }))}
                  />
                  {p === "opening" ? "Đầu kỳ" : "Cuối kỳ"}
                </label>
              ))}
            </div>
          ) : null}

          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            {spec.fields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                <Select
                  aria-label={`Cột cho ${f.label}`}
                  value={map[f.key] ?? ""}
                  onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                >
                  <option value="">— Không nhập —</option>
                  {header.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {`Cột ${colName(i)}${h ? `: ${h}` : ""}`}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          {missing.length ? <p className="text-sm text-danger">Chưa chọn cột cho: {missing.join(", ")}</p> : null}
          <div className="flex justify-between">
            <Button variant="secondary" icon={<ArrowLeft size={14} />} onClick={reset}>
              Chọn tệp khác
            </Button>
            <Button disabled={busy || missing.length > 0} onClick={() => void makePreview()}>
              Xem trước
            </Button>
          </div>
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="green">Mới {preview.counts.new}</Badge>
            {kind === "accounts" || kind === "partners" || kind === "items" ? <Badge tone="navy">Cập nhật {preview.counts.update}</Badge> : null}
            <Badge tone="gray">Bỏ qua {preview.counts.skip}</Badge>
            <Badge tone={preview.counts.error ? "red" : "gray"}>Lỗi {preview.counts.error}</Badge>
            {preview.totals ? (
              <>
                <span className="ml-2 text-muted">
                  Nợ <b className="text-ink">{formatAmount(preview.totals.debit)}</b> · Có <b className="text-ink">{formatAmount(preview.totals.credit)}</b>
                </span>
                {kind === "opening-accounts" ? null : diff === 0 ? (
                  <Badge tone="green">Cân</Badge>
                ) : (
                  <Badge tone="gold">Chênh {formatAmount(diff)}</Badge>
                )}
              </>
            ) : null}
            <label className="ml-auto flex items-center gap-1 text-xs">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Chỉ xem dòng lỗi / bỏ qua
            </label>
          </div>
          {preview.totals && kind === "opening-accounts" ? (
            <p className="text-xs text-muted">
              {preview.totals.skippedDebit || preview.totals.skippedCredit
                ? `TK theo dõi công nợ bỏ qua: Nợ ${formatAmount(preview.totals.skippedDebit)}, Có ${formatAmount(preview.totals.skippedCredit)} — nhập ở mẫu Số dư công nợ. `
                : ""}
              {diff + preview.totals.skippedDebit - preview.totals.skippedCredit === 0
                ? "Tính cả công nợ thì tổng Nợ = tổng Có."
                : `Tính cả công nợ vẫn chênh ${formatAmount(diff + preview.totals.skippedDebit - preview.totals.skippedCredit)} — kiểm tra lại tệp.`}
            </p>
          ) : null}
          <DataGrid<PreviewRow> rowData={shownRows} columnDefs={cols} height={380} getRowId={(p) => String(p.data.row)} />
          {preview.counts.error ? (
            <p className="text-sm text-danger">Còn {preview.counts.error} dòng lỗi — sửa trong tệp Excel rồi chọn lại tệp (không dòng nào được ghi khi còn lỗi).</p>
          ) : null}
          <div className="flex justify-between">
            <Button variant="secondary" icon={<ArrowLeft size={14} />} onClick={() => setStep("map")}>
              Quay lại ghép cột
            </Button>
            <Button icon={<Upload size={14} />} disabled={busy || preview.counts.error > 0 || toImport === 0} onClick={() => void run()}>
              {busy ? "Đang nhập…" : `Nhập ${toImport} dòng`}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
