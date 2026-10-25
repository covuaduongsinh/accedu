import { stripDiacritics } from "../accounting/modules";

/** Một ô đọc từ Excel/CSV/dữ liệu dán */
export type Cell = string | number | boolean | Date | null | undefined;
export type Table = Cell[][];

/** Mô tả một trường cần nhập: nhãn hiển thị + các tên cột tương đương (FAO, Excel tự làm) */
export interface FieldSpec<K extends string = string> {
  key: K;
  label: string;
  required?: boolean;
  /** Tên cột tương đương — so khớp không dấu, không phân biệt hoa thường */
  synonyms: readonly string[];
  /** Cột chứa một trong các từ này thì không phải trường này (vd. "Tên tài khoản" không phải "Tài khoản") */
  exclude?: readonly string[];
}

export type ColumnMap<K extends string = string> = Record<K, number | null>;

const DELIMS = ["\t", ";", ","] as const;

/** Chuỗi hiển thị của một ô (đã bỏ khoảng trắng đầu cuối) */
export function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? "" : c.toISOString().slice(0, 10);
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  if (typeof c === "boolean") return c ? "1" : "0";
  return c.replace(/ /g, " ").trim();
}

/** "Số hiệu TK (*)" → "so hieu tk" */
export function normalizeHeader(text: string): string {
  return stripDiacritics(text.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  const n = normalizeHeader(text);
  return n ? n.split(" ") : [];
}

function guessDelimiter(text: string): string {
  // Bỏ phần trong ngoặc kép (kể cả xuống dòng trong ô) trước khi đếm
  const firstLines = text
    .slice(0, 64_000)
    .replace(/"(?:[^"]|"")*"/g, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .slice(0, 5);
  let best: string = ",";
  let bestScore = 0;
  for (const d of DELIMS) {
    // Ưu tiên dấu phân cách xuất hiện đều đặn trên các dòng đầu
    const counts = firstLines.map((l) => l.split(d).length - 1);
    const min = counts.length ? Math.min(...counts) : 0;
    if (min > bestScore) {
      best = d;
      bestScore = min;
    }
  }
  return best;
}

/**
 * Đọc CSV/TSV (tệp .csv hoặc dữ liệu dán từ lưới Excel/FAO): bỏ BOM, tự nhận dấu phân cách tab / ; / ,
 * và hỗ trợ ngoặc kép theo RFC 4180 (kể cả xuống dòng trong ô).
 */
export function parseDelimited(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? guessDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Ghi CSV (dùng cho kiểm thử khứ hồi & tệp mẫu dự phòng) */
export function toDelimited(rows: readonly (readonly string[])[], delimiter = ","): string {
  const esc = (s: string) => (s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  return rows.map((r) => r.map(esc).join(delimiter)).join("\r\n");
}

/** Điểm khớp giữa tiêu đề cột và một trường: 3 = trùng hẳn, 2 = chứa đủ các từ, 0 = không khớp */
function score(header: string, field: FieldSpec): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  const ht = new Set(h.split(" "));
  if (field.exclude?.some((x) => tokens(x).every((t) => ht.has(t)))) return 0;
  let best = 0;
  for (const syn of field.synonyms) {
    const s = normalizeHeader(syn);
    if (s === h) return 3;
    if (s && s.split(" ").every((t) => ht.has(t))) best = 2;
  }
  return best;
}

/** Tự ghép cột nguồn với các trường; mỗi cột dùng tối đa một lần, ưu tiên khớp hẳn rồi cột bên trái */
export function autoMap<K extends string>(headers: readonly string[], fields: readonly FieldSpec<K>[]): ColumnMap<K> {
  const used = new Set<number>();
  const map = {} as ColumnMap<K>;
  for (const pass of [3, 2]) {
    for (const f of fields) {
      if (map[f.key] !== undefined && map[f.key] !== null) continue;
      let idx: number | null = null;
      headers.forEach((h, i) => {
        if (idx === null && !used.has(i) && score(h, f) === pass) idx = i;
      });
      if (idx !== null) {
        used.add(idx);
        map[f.key] = idx;
      } else if (map[f.key] === undefined) map[f.key] = null;
    }
  }
  return map;
}

export interface HeaderGuess {
  /** Chỉ số (từ 0) dòng tiêu đề đầu tiên */
  row: number;
  /** Số dòng tiêu đề (2 khi tiêu đề gộp ô kiểu "Số dư đầu kỳ" / "Nợ | Có") */
  height: 1 | 2;
  headers: string[];
}

/** Tiêu đề cột khi chọn dòng tiêu đề `row` (từ 0), một hoặc hai tầng */
export function headersAt(rows: Table, row: number, height: 1 | 2): string[] {
  return height === 1 ? (rows[row] ?? []).map(cellText) : combine(rows[row] ?? [], rows[row + 1] ?? []);
}

/** Ghép tiêu đề 2 tầng: ô gộp ở tầng trên được kéo sang phải cho đến ô có chữ tiếp theo */
function combine(top: readonly Cell[], bottom: readonly Cell[]): string[] {
  const n = Math.max(top.length, bottom.length);
  const out: string[] = [];
  let carry = "";
  for (let i = 0; i < n; i++) {
    const t = cellText(top[i]);
    const b = cellText(bottom[i]);
    if (t) carry = t;
    out.push(b ? (carry && carry !== b ? `${carry} ${b}` : b) : t);
  }
  return out;
}

/**
 * Tìm dòng tiêu đề trong 30 dòng đầu: tệp xuất từ FAO thường có tên báo cáo, kỳ báo cáo ở trên.
 * Chọn dòng (hoặc cặp dòng) khớp được nhiều trường nhất.
 */
export function detectHeader(rows: Table, fields: readonly FieldSpec[]): HeaderGuess {
  let best: HeaderGuess = { row: 0, height: 1, headers: (rows[0] ?? []).map(cellText) };
  let bestScore = -1;
  const evaluate = (headers: string[]) => {
    const m = autoMap(headers, fields);
    return fields.reduce((s, f) => s + (m[f.key] !== null ? (f.required ? 2 : 1) : 0), 0);
  };
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const single = (rows[i] ?? []).map(cellText);
    const s1 = evaluate(single);
    if (s1 > bestScore) {
      best = { row: i, height: 1, headers: single };
      bestScore = s1;
    }
    if (i + 1 < rows.length && single.some(Boolean)) {
      const double = combine(rows[i] ?? [], rows[i + 1] ?? []);
      const s2 = evaluate(double);
      if (s2 > bestScore) {
        best = { row: i, height: 2, headers: double };
        bestScore = s2;
      }
    }
  }
  return best;
}

/** Cột số dư theo kỳ (tệp Bảng cân đối phát sinh): dư Nợ/Có đầu kỳ và cuối kỳ nếu có */
export function balanceColumns(headers: readonly string[]): Partial<Record<"opening" | "closing", { debit: number; credit: number }>> {
  const find = (period: string, side: string) =>
    headers.findIndex((h) => {
      const t = new Set(tokens(h));
      return t.has(period) && t.has("ky") && t.has(side) && !t.has("phat");
    });
  const out: Partial<Record<"opening" | "closing", { debit: number; credit: number }>> = {};
  for (const [key, period] of [
    ["opening", "dau"],
    ["closing", "cuoi"],
  ] as const) {
    const debit = find(period, "no");
    const credit = find(period, "co");
    if (debit >= 0 && credit >= 0) out[key] = { debit, credit };
  }
  return out;
}

/**
 * Đọc số tiền từ ô Excel hoặc chuỗi: 1.234.567 · 1,234,567.5 · 1.234,5 · (1.000) · -500 · "1 000 đ".
 * Dấu chấm/phẩy chỉ đứng trước nhóm 3 chữ số được hiểu là phân cách hàng nghìn. Trả về null nếu không phải số.
 */
export function parseLooseAmount(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  let t = cellText(c).replace(/\s|đ|vnd/gi, "");
  if (t === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  }
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    t = t.replaceAll(decimal === "." ? "," : ".", "").replace(decimal, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const grouped = new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`);
    t = grouped.test(t) ? t.replaceAll(sep, "") : t.replace(sep, ".");
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return negative ? -n : n;
}

const TRUE = new Set(["1", "x", "co", "c", "yes", "y", "true", "dung", "v"]);
const FALSE = new Set(["0", "", "khong", "k", "no", "n", "false", "sai"]);

/** Có/không: 1, x, có, yes, true… → true; 0, trống, không… → false; còn lại null */
export function parseFlag(c: Cell): boolean | null {
  if (typeof c === "boolean") return c;
  const t = normalizeHeader(cellText(c));
  if (TRUE.has(t)) return true;
  if (FALSE.has(t)) return false;
  return null;
}
