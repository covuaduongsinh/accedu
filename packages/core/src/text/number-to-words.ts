/**
 * Đọc số thành chữ tiếng Việt cho chứng từ (phiếu thu, phiếu chi, hóa đơn).
 * Ví dụ: 1_005 → "Một nghìn không trăm lẻ năm đồng chẵn".
 */

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"] as const;

export interface ReadNumberOptions {
  /** "lẻ" (mặc định, theo cách đọc của FAO/MISA) hoặc "linh" */
  odd?: "lẻ" | "linh";
}

function digit(n: number): string {
  return DIGITS[n] ?? "";
}

/** Đọc một nhóm 3 chữ số. `full` = nhóm không đứng đầu (phải đọc "không trăm", "lẻ"). */
function readTriple(n: number, full: boolean, odd: string): string[] {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const words: string[] = [];
  if (h > 0 || full) {
    words.push(digit(h), "trăm");
  }
  if (t === 0) {
    if (u > 0 && (h > 0 || full)) words.push(odd);
  } else if (t === 1) {
    words.push("mười");
  } else {
    words.push(digit(t), "mươi");
  }
  if (u > 0) {
    if (u === 1 && t >= 2) words.push("mốt");
    else if (u === 5 && t >= 1) words.push("lăm");
    else words.push(digit(u));
  }
  return words;
}

/** Đọc số nguyên < 1 tỷ. `full` = có nhóm đứng trước (đọc đủ "không trăm"). */
function readBelowBillion(n: number, full: boolean, odd: string): string[] {
  const groups = [Math.floor(n / 1_000_000), Math.floor((n % 1_000_000) / 1000), n % 1000];
  const units = ["triệu", "nghìn", ""];
  const words: string[] = [];
  let started = full;
  groups.forEach((g, i) => {
    if (g === 0) return;
    words.push(...readTriple(g, started, odd));
    if (units[i]) words.push(units[i] as string);
    started = true;
  });
  return words;
}

function readBig(n: bigint, odd: string): string[] {
  if (n === 0n) return [];
  const billion = 1_000_000_000n;
  const high = n / billion;
  const low = Number(n % billion);
  const words: string[] = [];
  if (high > 0n) {
    words.push(...readBig(high, odd), "tỷ");
    words.push(...readBelowBillion(low, true, odd));
  } else {
    words.push(...readBelowBillion(low, false, odd));
  }
  return words;
}

/** Đọc số nguyên (number an toàn hoặc bigint) thành chữ thường, không đơn vị tiền. */
export function readInteger(value: number | bigint, opts: ReadNumberOptions = {}): string {
  const odd = opts.odd ?? "lẻ";
  let n: bigint;
  if (typeof value === "bigint") n = value;
  else {
    if (!Number.isSafeInteger(value)) throw new RangeError(`Không đọc được số: ${value}`);
    n = BigInt(value);
  }
  const negative = n < 0n;
  if (negative) n = -n;
  const words = n === 0n ? ["không"] : readBig(n, odd);
  return (negative ? "âm " : "") + words.join(" ");
}

export interface AmountInWordsOptions extends ReadNumberOptions {
  /** Đơn vị tiền chính, mặc định "đồng" */
  unit?: string;
  /** Đơn vị phần lẻ (ví dụ "xu", "cent"); bỏ qua nếu không có */
  subunit?: string;
  /** Số chữ số phần lẻ, mặc định 0 (VND) */
  decimals?: number;
  /** Thêm "chẵn" khi không có phần lẻ, mặc định true */
  even?: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase("vi-VN") + s.slice(1);
}

/** Số tiền bằng chữ, viết hoa chữ đầu: "Hai triệu năm trăm nghìn đồng chẵn" */
export function amountInWords(amount: number, opts: AmountInWordsOptions = {}): string {
  const { unit = "đồng", subunit, decimals = 0, even = true } = opts;
  if (!Number.isFinite(amount)) throw new RangeError(`Số tiền không hợp lệ: ${amount}`);
  const factor = 10 ** decimals;
  const totalMinor = Math.round(Math.abs(amount) * factor);
  const major = Math.floor(totalMinor / factor);
  const minor = totalMinor % factor;
  let text = `${readInteger(major, opts)} ${unit}`;
  if (minor > 0 && subunit) text += ` ${readInteger(minor, opts)} ${subunit}`;
  else if (minor === 0 && even) text += " chẵn";
  if (amount < 0) text = `âm ${text}`;
  return capitalize(text);
}
