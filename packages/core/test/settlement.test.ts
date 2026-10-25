import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { agingBucket, allocateFifo, daysBetween, paymentSide } from "../src";

const invoices = [
  { id: "sach", remaining: 252_000, dueDate: "2026-03-31", invoiceDate: "2026-03-01" },
  { id: "hocphi", remaining: 3_000_000, dueDate: "2026-01-20", invoiceDate: "2026-01-10" },
  { id: "khonghan", remaining: 500_000, invoiceDate: "2026-02-15" },
];

describe("phân bổ tiền vào hóa đơn (FIFO)", () => {
  it("trừ hóa đơn đến hạn sớm nhất trước; thiếu hạn thì theo ngày hóa đơn", () => {
    expect(allocateFifo(3_200_000, invoices)).toEqual({
      allocations: [
        { invoiceId: "hocphi", amount: 3_000_000 },
        { invoiceId: "khonghan", amount: 200_000 },
      ],
      leftover: 0,
    });
  });
  it("đủ: trả hết mọi hóa đơn", () => {
    expect(allocateFifo(3_752_000, invoices)).toEqual({
      allocations: [
        { invoiceId: "hocphi", amount: 3_000_000 },
        { invoiceId: "khonghan", amount: 500_000 },
        { invoiceId: "sach", amount: 252_000 },
      ],
      leftover: 0,
    });
  });
  it("thừa: phần dư là tiền trả trước", () => {
    expect(allocateFifo(4_000_000, invoices).leftover).toBe(248_000);
    expect(allocateFifo(100_000, []).leftover).toBe(100_000);
  });
  it("bỏ qua hóa đơn đã trả đủ, số tiền âm hoặc 0", () => {
    expect(allocateFifo(100, [{ id: "a", remaining: 0, dueDate: "2026-01-01" }])).toEqual({ allocations: [], leftover: 100 });
    expect(allocateFifo(-5, invoices)).toEqual({ allocations: [], leftover: 0 });
  });
  test.prop([
    fc.integer({ min: 0, max: 1e10 }),
    fc.array(fc.record({ remaining: fc.integer({ min: 0, max: 1e9 }), day: fc.integer({ min: 1, max: 28 }) }), { maxLength: 10 }),
  ])("tổng phân bổ = min(số tiền, tổng còn nợ); phân bổ + dư = số tiền; không hóa đơn nào bị trừ quá", (amount, ls) => {
    const list = ls.map((l, i) => ({ id: String(i), remaining: l.remaining, dueDate: `2026-01-${String(l.day).padStart(2, "0")}` }));
    const { allocations, leftover } = allocateFifo(amount, list);
    const allocated = allocations.reduce((s, a) => s + a.amount, 0);
    const owed = list.reduce((s, l) => s + l.remaining, 0);
    expect(allocated).toBe(Math.min(amount, owed));
    expect(allocated + leftover).toBe(amount);
    for (const a of allocations) {
      expect(a.amount).toBeGreaterThan(0);
      expect(a.amount).toBeLessThanOrEqual(list.find((l) => l.id === a.invoiceId)!.remaining);
    }
  });
});

describe("tuổi nợ", () => {
  it("biên các khoảng (khớp rpt_aging)", () => {
    expect(daysBetween("2026-01-20", "2026-03-31")).toBe(70);
    expect(agingBucket("2026-03-31", "2026-03-31")).toBe("not_due");
    expect(agingBucket("2026-04-15", "2026-03-31")).toBe("not_due");
    expect(agingBucket("2026-03-30", "2026-03-31")).toBe("d1_30");
    expect(agingBucket("2026-03-01", "2026-03-31")).toBe("d1_30"); // 30 ngày
    expect(agingBucket("2026-02-28", "2026-03-31")).toBe("d31_60"); // 31 ngày
    expect(agingBucket("2026-01-01", "2026-03-31")).toBe("d61_90"); // 89 ngày
    expect(agingBucket("2025-12-31", "2026-03-31")).toBe("d61_90"); // 90 ngày
    expect(agingBucket("2025-12-30", "2026-03-31")).toBe("over_90"); // 91 ngày
  });
  it("phía công nợ theo loại phiếu", () => {
    expect(paymentSide("PT")).toBe("receivable");
    expect(paymentSide("BC")).toBe("receivable");
    expect(paymentSide("PC")).toBe("payable");
    expect(paymentSide("BN")).toBe("payable");
    expect(paymentSide("PK")).toBeNull();
  });
});
