import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { buildLedgerEntries, closingBalance } from "../src";

describe("buildLedgerEntries — kiểu cặp (phiếu thu)", () => {
  it("Nợ 1111 / Có 131 sinh 2 bút toán đối ứng", () => {
    const r = buildLedgerEntries([{ lineNo: 1, debitAccount: "1111", creditAccount: "131", amount: 5_000_000 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entries).toEqual([
      { lineNo: 1, account: "1111", contraAccount: "131", debit: 5_000_000, credit: 0, debitFc: 5_000_000, creditFc: 0 },
      { lineNo: 1, account: "131", contraAccount: "1111", debit: 0, credit: 5_000_000, debitFc: 0, creditFc: 5_000_000 },
    ]);
  });
});

describe("buildLedgerEntries — kiểu một vế (phiếu kế toán)", () => {
  it("cân theo nhóm định khoản, xác định TK đối ứng khi một bên chỉ có 1 dòng", () => {
    const r = buildLedgerEntries([
      { lineNo: 1, debitAccount: "6421", amount: 300 },
      { lineNo: 2, debitAccount: "1331", amount: 30 },
      { lineNo: 3, creditAccount: "331", amount: 330 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entries.map((e) => [e.account, e.contraAccount])).toEqual([
      ["6421", "331"],
      ["1331", "331"],
      ["331", null],
    ]);
  });

  it("báo lỗi khi lệch Nợ/Có", () => {
    const r = buildLedgerEntries([
      { lineNo: 1, debitAccount: "6421", amount: 300 },
      { lineNo: 2, creditAccount: "331", amount: 299 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.code).toBe("unbalanced");
  });

  it("báo lỗi dòng trống tài khoản / số âm / chứng từ rỗng", () => {
    expect(buildLedgerEntries([]).ok).toBe(false);
    const r = buildLedgerEntries([
      { lineNo: 1, amount: 10 },
      { lineNo: 2, debitAccount: "111", creditAccount: "511", amount: -1 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.code).toSorted()).toEqual(["missing_account", "negative_amount"]);
  });
});

describe("bất biến", () => {
  const line = fc.record({
    debitAccount: fc.constantFrom("111", "112", "131", "511", "642"),
    creditAccount: fc.constantFrom("111", "112", "331", "511", "3331"),
    amount: fc.integer({ min: 0, max: 1e12 }),
  });
  test.prop([fc.array(line, { minLength: 1, maxLength: 50 })])("kiểu cặp luôn cân Nợ = Có", (ls) => {
    const r = buildLedgerEntries(ls.map((l, i) => ({ ...l, lineNo: i + 1 })));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalDebit).toBe(r.totalCredit);
  });

  it("số dư cuối kỳ bù trừ", () => {
    expect(closingBalance(100, 50, 200)).toEqual({ debit: 0, credit: 50 });
    expect(closingBalance(-100, 300, 0)).toEqual({ debit: 200, credit: 0 });
  });
});
