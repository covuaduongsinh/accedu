import { isTauri } from "./supabase";

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Xuất CSV UTF-8 có BOM để Excel mở đúng tiếng Việt. Desktop: hộp thoại lưu file gốc của hệ điều hành. */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  if (isTauri) {
    void saveWithDialog(filename, csv);
    return;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveWithDialog(filename: string, contents: string) {
  const [{ save }, { invoke }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/api/core")]);
  const path = await save({ defaultPath: filename, filters: [{ name: "CSV (Excel)", extensions: ["csv"] }] });
  if (path) await invoke("save_export", { path, contents });
}
