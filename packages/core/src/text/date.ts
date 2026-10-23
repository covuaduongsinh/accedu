/** Ngày kế toán luôn lưu dạng ISO `YYYY-MM-DD` (không giờ, không múi giờ). */
export type IsoDate = string & { readonly __brand?: "IsoDate" };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const VN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}

export function isIsoDate(text: string): text is IsoDate {
  const m = ISO.exec(text);
  return !!m && valid(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** 2026-10-23 → 23/10/2026 */
export function formatDateVN(iso: IsoDate | null | undefined): string {
  if (!iso) return "";
  const m = ISO.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** 23/10/2026 hoặc 3/1/2026 → 2026-10-23 / 2026-01-03; null nếu sai */
export function parseDateVN(text: string): IsoDate | null {
  const m = VN.exec(text.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!valid(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Ngày hiện tại theo giờ Việt Nam (UTC+7), dạng ISO. */
export function todayVN(now: Date = new Date()): IsoDate {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  return vn.toISOString().slice(0, 10);
}

/** Kỳ kế toán dạng YYYY-MM chứa ngày */
export function periodOf(iso: IsoDate): string {
  return iso.slice(0, 7);
}
