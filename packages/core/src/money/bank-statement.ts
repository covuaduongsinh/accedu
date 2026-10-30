// Đọc tệp sao kê ngân hàng (Excel / CSV xuất từ internet banking) thành các dòng giao dịch chuẩn.
// Dò dòng tiêu đề và cột bằng bộ nhập Excel dùng chung; tên cột tiếng Việt / tiếng Anh của các ngân hàng phổ biến.
import { autoMap, cellText, detectHeader, normalizeHeader, parseLooseAmount, type Cell, type FieldSpec, type Table } from "../import/table";
import { isIsoDate, parseDateVN, type IsoDate } from "../text/date";

export type BankField = "date" | "ref" | "description" | "credit" | "debit" | "amount" | "direction" | "balance";

/** Thứ tự quan trọng: số tham chiếu được ghép trước để cột "Transaction No." không bị nhầm sang cột tiền */
export const BANK_FIELDS: readonly FieldSpec<BankField>[] = [
  {
    key: "date",
    label: "Ngày giao dịch",
    required: true,
    synonyms: ["ngày giao dịch", "ngày gd", "ngày hiệu lực", "ngày hạch toán", "ngày", "transaction date", "posting date", "value date", "date", "trans date"],
  },
  {
    key: "ref",
    label: "Số tham chiếu",
    synonyms: ["số tham chiếu", "mã giao dịch", "số bút toán", "số giao dịch", "mã gd", "số ct", "tham chiếu", "reference", "reference no", "ref no", "transaction no", "trace no"],
  },
  {
    key: "description",
    label: "Nội dung",
    required: true,
    synonyms: ["nội dung", "nội dung giao dịch", "nội dung chi tiết", "diễn giải", "mô tả", "chi tiết giao dịch", "description", "details", "transaction details", "remark", "remarks", "narrative"],
  },
  {
    key: "credit",
    label: "Tiền vào (ghi có)",
    synonyms: ["ghi có", "số tiền ghi có", "phát sinh có", "tiền vào", "số tiền có", "có tktt", "credit", "credit amount", "có"],
    exclude: ["nợ"],
  },
  {
    key: "debit",
    label: "Tiền ra (ghi nợ)",
    synonyms: ["ghi nợ", "số tiền ghi nợ", "phát sinh nợ", "tiền ra", "số tiền nợ", "nợ tktt", "debit", "debit amount"],
    exclude: ["có"],
  },
  {
    key: "direction",
    label: "Loại (Nợ / Có)",
    synonyms: ["loại giao dịch", "nợ có", "dr cr", "cr dr", "c d", "d c", "debit credit", "type"],
  },
  {
    key: "balance",
    label: "Số dư",
    synonyms: ["số dư", "số dư cuối", "balance", "running balance", "available balance"],
  },
  {
    key: "amount",
    label: "Số tiền (có dấu)",
    synonyms: ["số tiền", "số tiền giao dịch", "amount", "transaction amount"],
    exclude: ["dư", "balance"],
  },
];

export interface BankLine {
  /** Dòng trong tệp (đếm từ 1) */
  row: number;
  date: IsoDate;
  ref: string;
  description: string;
  amountIn: number;
  amountOut: number;
  balance: number | null;
  /** Khóa chống trùng khi nhập lại cùng tệp hoặc tệp chồng kỳ */
  fingerprint: string;
}

export interface BankStatementParse {
  ok: boolean;
  lines: BankLine[];
  errors: Array<{ row: number; message: string }>;
  /** Dòng tiêu đề (đếm từ 1) và cột đã nhận */
  headerRow: number;
  columns: Partial<Record<BankField, string>>;
  from: IsoDate | null;
  to: IsoDate | null;
  totalIn: number;
  totalOut: number;
  /** Số dư sau giao dịch cuối cùng (khi tệp có cột số dư) */
  closingBalance: number | null;
  /** Dòng bỏ qua: trống, tổng cộng, số dư đầu / cuối kỳ */
  skipped: number;
}

/** Ô ngày: Date, số ngày kiểu Excel, "dd/mm/yyyy[ hh:mm[:ss]]", "dd-mm-yyyy", "yyyy-mm-dd" → ISO; trống → ""; sai → null */
export function bankDate(c: Cell): IsoDate | "" | null {
  if (c === null || c === undefined || c === "") return "";
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "number") {
    if (c < 1 || c > 200_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(c) * 86_400_000).toISOString().slice(0, 10);
  }
  const t = cellText(c).split(/[\sT]/)[0] ?? "";
  if (!t) return "";
  const iso = t.replaceAll("/", "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return isIsoDate(iso) ? iso : null;
  return parseDateVN(t.replaceAll(/[-.]/g, "/"));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Chuẩn hóa nội dung để so khớp / chống trùng: không dấu, chữ hoa, gộp khoảng trắng */
export function normalizeBankText(text: string): string {
  return normalizeHeader(text).toUpperCase();
}

export function bankFingerprint(l: Pick<BankLine, "date" | "ref" | "amountIn" | "amountOut" | "description">): string {
  return [l.date, l.ref.trim(), l.amountIn.toFixed(2), l.amountOut.toFixed(2), normalizeBankText(l.description).slice(0, 120)].join("|");
}

const IN = new Set(["c", "cr", "co", "credit", "+", "ghi co", "tien vao"]);
const OUT = new Set(["d", "dr", "no", "debit", "-", "ghi no", "tien ra"]);

/** Dòng không phải giao dịch: tổng cộng, số dư đầu / cuối kỳ */
const SUMMARY = /^(tong|cong|so du|opening|closing|total|balance)/;

/**
 * Đọc sao kê: tìm dòng tiêu đề, ghép cột, đọc từng giao dịch. Cần cột ngày, nội dung và (tiền vào / tiền ra hoặc một cột
 * số tiền có dấu). Dòng trống, dòng tổng cộng, dòng số dư đầu / cuối kỳ bị bỏ qua.
 */
export function parseBankStatement(rows: Table): BankStatementParse {
  const header = detectHeader(rows, BANK_FIELDS);
  const map = autoMap(header.headers, BANK_FIELDS);
  const columns: Partial<Record<BankField, string>> = {};
  for (const f of BANK_FIELDS) if (map[f.key] !== null) columns[f.key] = header.headers[map[f.key]!];

  const result: BankStatementParse = {
    ok: false,
    lines: [],
    errors: [],
    headerRow: header.row + 1,
    columns,
    from: null,
    to: null,
    totalIn: 0,
    totalOut: 0,
    closingBalance: null,
    skipped: 0,
  };
  const hasAmounts = map.credit !== null || map.debit !== null || map.amount !== null;
  if (map.date === null || map.description === null || !hasAmounts) {
    const missing = [
      map.date === null ? "Ngày giao dịch" : null,
      map.description === null ? "Nội dung" : null,
      hasAmounts ? null : "Tiền vào / Tiền ra (hoặc Số tiền)",
    ].filter(Boolean);
    result.errors.push({ row: header.row + 1, message: `Không nhận ra cột: ${missing.join(", ")}` });
    return result;
  }

  const at = (cells: readonly Cell[], key: BankField): Cell => (map[key] === null ? null : cells[map[key]!]);
  for (let i = header.row + header.height; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const row = i + 1;
    const description = cellText(at(cells, "description"));
    const rawDate = at(cells, "date");
    const date = bankDate(rawDate);
    const firstText = normalizeHeader(cells.map(cellText).filter(Boolean)[0] ?? "");
    if (date === "" || SUMMARY.test(firstText)) {
      result.skipped++;
      continue;
    }
    if (date === null) {
      result.errors.push({ row, message: `Ngày giao dịch không hợp lệ: ${cellText(rawDate)}` });
      continue;
    }

    let amountIn = 0;
    let amountOut = 0;
    if (map.credit !== null || map.debit !== null) {
      const cr = parseLooseAmount(at(cells, "credit"));
      const dr = parseLooseAmount(at(cells, "debit"));
      if ((cellText(at(cells, "credit")) && cr === null) || (cellText(at(cells, "debit")) && dr === null)) {
        result.errors.push({ row, message: "Số tiền không hợp lệ" });
        continue;
      }
      amountIn = Math.abs(cr ?? 0);
      amountOut = Math.abs(dr ?? 0);
    } else {
      const amount = parseLooseAmount(at(cells, "amount"));
      if (amount === null) {
        result.errors.push({ row, message: `Số tiền không hợp lệ: ${cellText(at(cells, "amount"))}` });
        continue;
      }
      const dir = normalizeHeader(cellText(at(cells, "direction")));
      const outgoing = OUT.has(dir) ? true : IN.has(dir) ? false : amount < 0;
      if (outgoing) amountOut = Math.abs(amount);
      else amountIn = Math.abs(amount);
    }
    if (amountIn === 0 && amountOut === 0) {
      result.skipped++;
      continue;
    }
    const balance = parseLooseAmount(at(cells, "balance"));
    const line: BankLine = {
      row,
      date,
      ref: cellText(at(cells, "ref")),
      description,
      amountIn: round2(amountIn),
      amountOut: round2(amountOut),
      balance: balance === null ? null : round2(balance),
      fingerprint: "",
    };
    line.fingerprint = bankFingerprint(line);
    result.lines.push(line);
  }

  const dates = result.lines.map((l) => l.date).sort();
  result.from = dates[0] ?? null;
  result.to = dates.at(-1) ?? null;
  result.totalIn = round2(result.lines.reduce((s, l) => s + l.amountIn, 0));
  result.totalOut = round2(result.lines.reduce((s, l) => s + l.amountOut, 0));
  // Số dư cuối: dòng có ngày lớn nhất; cùng ngày thì dòng sau cùng theo thứ tự trong tệp (ngân hàng xếp tăng hoặc giảm dần)
  const withBalance = result.lines.filter((l) => l.balance !== null);
  if (withBalance.length) {
    const ascending = withBalance[0]!.date <= withBalance.at(-1)!.date;
    const last = ascending ? withBalance.at(-1)! : withBalance[0]!;
    result.closingBalance = last.balance;
  }
  result.ok = result.lines.length > 0 && result.errors.length === 0;
  if (!result.lines.length && !result.errors.length) result.errors.push({ row: header.row + 1, message: "Tệp không có giao dịch nào" });
  return result;
}
