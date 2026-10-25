import { IMPORT_SPECS, templateRows, type ImportKind } from "@accedu/core";
import { isTauri } from "./supabase";

type Value = string | number | null | undefined;

const NAVY = "#2B3990";

/** Độ rộng cột theo nội dung dài nhất (ký tự), trong khoảng 8–60 */
function widths(rows: ReadonlyArray<ReadonlyArray<Value>>): Array<{ width: number }> {
  const n = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: n }, (_, i) => ({
    width: Math.min(60, Math.max(8, ...rows.map((r) => String(r[i] ?? "").length + 2))),
  }));
}

/**
 * Xuất Excel .xlsx thật (không phải CSV — Excel định dạng vùng Việt Nam mở CSV dấu phẩy bị dồn một cột).
 * Hàng tiêu đề nền navy chữ trắng, cố định khi cuộn. Desktop: hộp thoại lưu file gốc của hệ điều hành.
 */
export async function downloadXlsx(
  filename: string,
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<Value>>,
  opts: { sheet?: string; notes?: readonly string[] } = {},
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const head = header.map((value) => ({ value, fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: NAVY }));
  const body = rows.map((r) =>
    r.map((v) => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number") return { value: v, type: Number, format: Number.isInteger(v) ? "#,##0" : "#,##0.00" };
      return { value: v, type: String };
    }),
  );
  const sheets = [{ sheet: opts.sheet ?? "Dữ liệu", data: [head, ...body], columns: widths([header, ...rows]), stickyRowsCount: 1 }];
  if (opts.notes?.length) {
    sheets.push({
      sheet: "Hướng dẫn",
      data: [[{ value: "Hướng dẫn nhập", fontWeight: "bold" as const, textColor: "#FFFFFF", backgroundColor: NAVY }], ...opts.notes.map((n) => [{ value: n, type: String }])],
      columns: [{ width: 110 }],
      stickyRowsCount: 1,
    });
  }
  const blob = await writeXlsxFile(sheets, { fontFamily: "Calibri", fontSize: 11 }).toBlob();
  await saveBlob(filename, blob);
}

/** Tệp mẫu nhập từ Excel: tiêu đề cột chuẩn + dòng mẫu (dữ liệu giả) + sheet hướng dẫn */
export function downloadTemplate(kind: ImportKind) {
  const spec = IMPORT_SPECS[kind];
  const [header = [], ...sample] = templateRows(kind);
  return downloadXlsx(`${spec.fileName}.xlsx`, header, sample, { sheet: "Nhập liệu", notes: spec.notes });
}

async function saveBlob(filename: string, blob: Blob) {
  if (isTauri) {
    const [{ save }, { invoke }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/api/core")]);
    const path = await save({ defaultPath: filename, filters: [{ name: "Excel", extensions: ["xlsx"] }] });
    if (path) await invoke("save_export_bytes", { path, data: Array.from(new Uint8Array(await blob.arrayBuffer())) });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
