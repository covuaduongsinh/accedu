import { roundAmount } from "../money/round";

/** Dòng chứng từ tối thiểu để sinh bút toán sổ cái. */
export interface PostingLine {
  lineNo: number;
  /** Kiểu cặp: cả hai; kiểu một vế: chỉ một trong hai */
  debitAccount?: string | null;
  creditAccount?: string | null;
  /** Số tiền hạch toán (VND) — luôn dương */
  amount: number;
  /** Nguyên tệ — luôn dương, mặc định bằng amount */
  amountFc?: number;
  /** Nhóm định khoản (chỉ dùng cho kiểu một vế) */
  entryGroup?: number;
}

export interface LedgerEntry {
  lineNo: number;
  account: string;
  contraAccount: string | null;
  debit: number;
  credit: number;
  debitFc: number;
  creditFc: number;
}

export type PostingError =
  | { code: "empty"; message: string }
  | { code: "negative_amount"; lineNo: number; message: string }
  | { code: "missing_account"; lineNo: number; message: string }
  | { code: "unbalanced"; group: number; debit: number; credit: number; message: string };

export type PostingResult =
  | { ok: true; entries: LedgerEntry[]; totalDebit: number; totalCredit: number }
  | { ok: false; errors: PostingError[] };

/**
 * Sinh bút toán sổ cái (một vế/dòng) từ dòng chứng từ, đồng thời kiểm tra cân Nợ = Có.
 * Logic này trùng với hàm SQL `accounting.post_voucher` — dùng để xem trước và kiểm thử.
 */
export function buildLedgerEntries(lines: readonly PostingLine[], decimals = 0): PostingResult {
  const errors: PostingError[] = [];
  if (lines.length === 0) return { ok: false, errors: [{ code: "empty", message: "Chứng từ chưa có dòng chi tiết" }] };

  const entries: LedgerEntry[] = [];
  const singles = new Map<number, PostingLine[]>();

  for (const line of lines) {
    if (!(line.amount >= 0)) {
      errors.push({ code: "negative_amount", lineNo: line.lineNo, message: `Dòng ${line.lineNo}: số tiền phải ≥ 0` });
      continue;
    }
    const amount = roundAmount(line.amount, decimals);
    const amountFc = line.amountFc ?? amount;
    const d = line.debitAccount || null;
    const c = line.creditAccount || null;
    if (d && c) {
      entries.push(
        { lineNo: line.lineNo, account: d, contraAccount: c, debit: amount, credit: 0, debitFc: amountFc, creditFc: 0 },
        { lineNo: line.lineNo, account: c, contraAccount: d, debit: 0, credit: amount, debitFc: 0, creditFc: amountFc },
      );
    } else if (d || c) {
      const g = line.entryGroup ?? 1;
      const bucket = singles.get(g) ?? [];
      bucket.push(line);
      singles.set(g, bucket);
    } else {
      errors.push({ code: "missing_account", lineNo: line.lineNo, message: `Dòng ${line.lineNo}: thiếu tài khoản` });
    }
  }

  for (const [group, bucket] of singles) {
    const debits = bucket.filter((l) => l.debitAccount);
    const credits = bucket.filter((l) => !l.debitAccount);
    const sumD = roundAmount(debits.reduce((s, l) => s + l.amount, 0), decimals);
    const sumC = roundAmount(credits.reduce((s, l) => s + l.amount, 0), decimals);
    if (sumD !== sumC) {
      errors.push({
        code: "unbalanced",
        group,
        debit: sumD,
        credit: sumC,
        message: `Nhóm định khoản ${group}: tổng Nợ ${sumD} ≠ tổng Có ${sumC}`,
      });
      continue;
    }
    const contraFor = (side: PostingLine[]) =>
      side.length === 1 ? ((side[0]?.debitAccount ?? side[0]?.creditAccount) || null) : null;
    for (const l of bucket) {
      const amount = roundAmount(l.amount, decimals);
      const amountFc = l.amountFc ?? amount;
      if (l.debitAccount) {
        entries.push({ lineNo: l.lineNo, account: l.debitAccount, contraAccount: contraFor(credits), debit: amount, credit: 0, debitFc: amountFc, creditFc: 0 });
      } else {
        entries.push({ lineNo: l.lineNo, account: l.creditAccount as string, contraAccount: contraFor(debits), debit: 0, credit: amount, debitFc: 0, creditFc: amountFc });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  entries.sort((a, b) => a.lineNo - b.lineNo || b.debit - a.debit);
  const totalDebit = roundAmount(entries.reduce((s, e) => s + e.debit, 0), decimals);
  const totalCredit = roundAmount(entries.reduce((s, e) => s + e.credit, 0), decimals);
  return { ok: true, entries, totalDebit, totalCredit };
}

export interface TrialBalanceRow {
  account: string;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
}

/** Tính số dư cuối kỳ theo nguyên tắc bù trừ (dư Nợ hoặc dư Có). */
export function closingBalance(openingNet: number, debit: number, credit: number): { debit: number; credit: number } {
  const net = openingNet + debit - credit;
  return net >= 0 ? { debit: net, credit: 0 } : { debit: 0, credit: -net };
}
