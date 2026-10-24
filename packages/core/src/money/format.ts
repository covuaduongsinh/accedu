const cache = new Map<string, Intl.NumberFormat>();

function formatter(decimals: number): Intl.NumberFormat {
  const key = String(decimals);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    cache.set(key, f);
  }
  return f;
}

export interface FormatAmountOptions {
  decimals?: number;
  /** Số âm hiển thị trong ngoặc đơn như trên báo cáo tài chính: (1.234) */
  parentheses?: boolean;
  /** Hiển thị rỗng thay cho số 0 (thường dùng trong sổ sách) */
  blankZero?: boolean;
}

/** Định dạng số kiểu Việt Nam: 1.234.567,89 */
export function formatAmount(value: number | null | undefined, opts: FormatAmountOptions = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const { decimals = 0, parentheses = false, blankZero = false } = opts;
  if (blankZero && value === 0) return "";
  const text = formatter(decimals).format(Math.abs(value));
  if (value < 0) return parentheses ? `(${text})` : `-${text}`;
  return text;
}

/** Đọc lại chuỗi số kiểu Việt Nam ("1.234.567,5" → 1234567.5). Trả về null nếu không hợp lệ. */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const negative = /^\(.*\)$/.test(t) || t.startsWith("-");
  const cleaned = t.replace(/[()\s-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return negative ? -n : n;
}
