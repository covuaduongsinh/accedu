/**
 * Tài sản cố định (TSCĐ) và công cụ dụng cụ (CCDC) — cùng công thức với CSDL (migration 0018):
 * khấu hao đường thẳng, phần còn lại chia đều cho số tháng còn lại, tháng cuối lấy hết phần còn lại.
 * TSCĐ tính theo số ngày sử dụng trong tháng (TT45/2013); CCDC phân bổ tròn tháng.
 */

export type AssetKind = "fixed" | "tool";
export type AssetStatus = "active" | "suspended" | "done" | "disposed";

export const ASSET_LABEL: Record<AssetKind, { short: string; long: string; verb: string; accumulated: string; cost: string; months: string }> = {
  fixed: { short: "TSCĐ", long: "tài sản cố định", verb: "khấu hao", accumulated: "Hao mòn lũy kế", cost: "Nguyên giá", months: "Số tháng khấu hao" },
  tool: { short: "CCDC", long: "công cụ dụng cụ", verb: "phân bổ", accumulated: "Đã phân bổ", cost: "Giá trị", months: "Số tháng phân bổ" },
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: "Đang dùng",
  suspended: "Tạm dừng",
  done: "Hết khấu hao",
  disposed: "Đã ghi giảm",
};

/** TK hao mòn mặc định theo TK nguyên giá */
export function defaultAccumAccount(regime: "TT99" | "TT133", assetAccount: string): string {
  if (regime === "TT133") return assetAccount === "2113" ? "2143" : assetAccount === "2112" ? "2142" : "2141";
  return assetAccount.startsWith("213") ? "2143" : assetAccount.startsWith("212") ? "2142" : "2141";
}

/** Tài khoản mặc định khi khai báo tài sản (giống app.asset_default_accounts) */
export function assetDefaults(regime: "TT99" | "TT133", kind: AssetKind) {
  const assetAccount = kind === "tool" ? "242" : regime === "TT133" ? "2111" : "2112";
  return {
    assetAccount,
    accumAccount: kind === "tool" ? null : defaultAccumAccount(regime, assetAccount),
    expenseAccount: regime === "TT133" ? "6422" : kind === "tool" ? "6423" : "6424",
    /** Ghi tăng: mua chịu nhà cung cấp */
    increaseCredit: "331",
    /** Ghi giảm TSCĐ: giá trị còn lại vào chi phí khác */
    disposalAccount: "811",
  } as const;
}

const ymd = (iso: string) => iso.slice(0, 10).split("-").map(Number) as [number, number, number];
const utc = (iso: string) => {
  const [y, m, d] = ymd(iso);
  return Date.UTC(y, m - 1, d);
};
const DAY = 86_400_000;

/** Ngày đầu tháng của một ngày ISO (YYYY-MM-DD hoặc YYYY-MM) */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = ymd(monthStart(month));
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(month: string): number {
  const [y, m] = ymd(monthStart(month));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Số ngày được tính trong tháng: từ max(ngày bắt đầu, đầu tháng) đến hết tháng, hoặc đến trước ngày ghi giảm */
export function assetDays(start: string, month: string, until?: string | null): number {
  const first = utc(monthStart(month));
  const afterEnd = first + daysInMonth(month) * DAY;
  const to = until ? Math.min(utc(until), afterEnd) : afterEnd;
  return Math.max(0, Math.round((to - Math.max(utc(start), first)) / DAY));
}

/** Phần tháng được tính (0–1): TSCĐ theo ngày, CCDC tròn tháng */
export function assetMonthFraction(kind: AssetKind, start: string, month: string, until?: string | null): number {
  if (kind === "tool") return monthStart(start) <= monthStart(month) ? 1 : 0;
  return assetDays(start, month, until) / daysInMonth(month);
}

/** Số khấu hao của tháng (đồng): tháng cuối lấy hết phần còn lại, còn lại chia đều theo số tháng còn lại */
export function assetCharge(cost: number, months: number, accumulated: number, used: number, fraction: number): number {
  const left = cost - accumulated;
  if (left <= 0 || fraction <= 0) return 0;
  if (months - used <= fraction) return left;
  return Math.min(left, Math.round((left * fraction) / (months - used)));
}

/** Phần tháng lưu trong sổ (4 chữ số) */
export const roundFraction = (f: number) => Math.round(f * 10_000) / 10_000;

export interface AssetScheduleInput {
  kind: AssetKind;
  cost: number;
  months: number;
  startOn: string;
  openingAccumulated?: number;
  openingMonths?: number;
  /** Tháng bắt đầu lập lịch (mặc định tháng của ngày bắt đầu; tài sản có số đầu kỳ: tháng bắt đầu nhập liệu) */
  fromMonth?: string;
}

export interface AssetScheduleRow {
  month: string;
  fraction: number;
  /** Số ngày tính (TSCĐ, tháng không trọn) */
  days: number | null;
  amount: number;
  accumulated: number;
  remaining: number;
  monthsLeft: number;
}

/** Lịch khấu hao / phân bổ đến hết (giả định tính đều mỗi tháng, không tạm dừng) */
export function assetSchedule(input: AssetScheduleInput, maxRows = 700): AssetScheduleRow[] {
  const rows: AssetScheduleRow[] = [];
  if (!(input.cost > 0) || !(input.months > 0) || !/^\d{4}-\d{2}-\d{2}/.test(input.startOn)) return rows;
  let acc = input.openingAccumulated ?? 0;
  let used = input.openingMonths ?? 0;
  let month = monthStart(input.fromMonth && input.fromMonth > input.startOn ? input.fromMonth : input.startOn);
  while (acc < input.cost && rows.length < maxRows) {
    const f = assetMonthFraction(input.kind, input.startOn, month);
    const amount = assetCharge(input.cost, input.months, acc, used, f);
    if (amount > 0) {
      acc += amount;
      used += roundFraction(f);
      const days = input.kind === "fixed" && f < 1 ? assetDays(input.startOn, month) : null;
      rows.push({ month, fraction: roundFraction(f), days, amount, accumulated: acc, remaining: input.cost - acc, monthsLeft: Math.max(0, roundFraction(input.months - used)) });
    } else if (f > 0) {
      break;
    }
    month = addMonths(month, 1);
  }
  return rows;
}

/** Tóm tắt lịch để hiện trên form: tháng đầu, mức thường, tháng cuối */
export function scheduleSummary(rows: readonly AssetScheduleRow[]) {
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const regular = rows.length > 2 ? rows[1]!.amount : first.amount;
  return { first, last, regular, count: rows.length };
}
