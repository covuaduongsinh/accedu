const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Xuất CSV UTF-8 có BOM để Excel mở đúng tiếng Việt. */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
