import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { IMPORT_SPECS, autoMap, buildPreview, costMovements, detectHeader, estimateIssueCost, grossMargin, stockDefaults, type StockMovement, type Table } from "../src";

describe("giá vốn hàng xuất kho (khớp app.stock_recost)", () => {
  const opening = { quantity: 10, amount: 800_000 };
  it("bình quân di động: nhập 10 × 90.000 → xuất 5 = 425.000", () => {
    const r = costMovements(
      opening,
      [
        { id: "pn", date: "2026-03-10", kind: "in", quantity: 10, amount: 900_000 },
        { id: "px", date: "2026-03-15", kind: "out", quantity: 5 },
      ],
      "moving",
    );
    expect(r.costs.get("px")).toBe(425_000);
    expect(r.closing).toEqual({ quantity: 15, amount: 1_275_000 });
  });
  it("trong cùng ngày nhập trước xuất sau, dù nhập sau trong danh sách", () => {
    const r = costMovements(
      { quantity: 0, amount: 0 },
      [
        { id: "px", date: "2026-03-10", kind: "out", quantity: 1 },
        { id: "pn", date: "2026-03-10", kind: "in", quantity: 2, amount: 200 },
      ],
      "moving",
    );
    expect(r.costs.get("px")).toBe(100);
  });
  it("xuất hết số tồn lấy trọn giá trị còn lại", () => {
    const r = costMovements(
      { quantity: 0, amount: 0 },
      [
        { id: "a", date: "2026-03-01", kind: "in", quantity: 3, amount: 99_999 },
        { id: "b", date: "2026-03-01", kind: "in", quantity: 3, amount: 100_002 },
        { id: "x", date: "2026-03-05", kind: "out", quantity: 1 },
        { id: "y", date: "2026-03-06", kind: "out", quantity: 5 },
      ],
      "moving",
    );
    expect(r.costs.get("x")).toBe(33_334);
    expect(r.costs.get("y")).toBe(200_001 - 33_334);
    expect(r.closing).toEqual({ quantity: 0, amount: 0 });
  });
  it("bình quân cả tháng: (tồn đầu + nhập trong tháng) ÷ số lượng; dồn chênh làm tròn vào phiếu xuất cuối", () => {
    const moves: StockMovement[] = [
      { id: "pn1", date: "2026-04-02", kind: "in", quantity: 10, amount: 1_000_000 },
      { id: "px1", date: "2026-04-05", kind: "out", quantity: 5 },
      { id: "pn2", date: "2026-04-20", kind: "in", quantity: 10, amount: 1_300_000 },
    ];
    expect(costMovements({ quantity: 0, amount: 0 }, moves, "monthly").costs.get("px1")).toBe(575_000);
    expect(costMovements({ quantity: 0, amount: 0 }, moves, "moving").costs.get("px1")).toBe(500_000);
    const r = costMovements(
      { quantity: 0, amount: 0 },
      [
        { id: "a", date: "2026-05-01", kind: "in", quantity: 1, amount: 33_333 },
        { id: "b", date: "2026-05-01", kind: "in", quantity: 2, amount: 66_668 },
        { id: "x", date: "2026-05-02", kind: "out", quantity: 1 },
        { id: "y", date: "2026-05-03", kind: "out", quantity: 1 },
        { id: "z", date: "2026-05-04", kind: "out", quantity: 1 },
      ],
      "monthly",
    );
    expect([r.costs.get("x"), r.costs.get("y"), r.costs.get("z")]).toEqual([33_334, 33_334, 33_333]);
    expect(r.closing).toEqual({ quantity: 0, amount: 0 });
  });
  it("dòng thuộc kỳ khóa giữ nguyên số tiền", () => {
    const r = costMovements(
      { quantity: 0, amount: 0 },
      [
        { id: "a", date: "2026-01-05", kind: "in", quantity: 10, amount: 100_000 },
        { id: "x", date: "2026-01-10", kind: "out", quantity: 5, locked: true },
        { id: "b", date: "2026-01-20", kind: "in", quantity: 10, amount: 200_000 },
      ],
      "monthly",
      new Map([["x", 50_000]]),
    );
    expect(r.costs.get("x")).toBe(50_000);
  });
  test.prop([
    fc.constantFrom("moving" as const, "monthly" as const),
    fc.array(fc.record({ day: fc.integer({ min: 1, max: 28 }), month: fc.integer({ min: 1, max: 3 }), qty: fc.integer({ min: 1, max: 50 }), price: fc.integer({ min: 1, max: 500_000 }), out: fc.boolean() }), {
      maxLength: 20,
    }),
  ])("tồn cuối không âm; giá trị đầu + nhập − xuất = giá trị cuối", (method, raw) => {
    // Chỉ xuất khi còn đủ hàng (như CSDL chặn xuất âm)
    let have = 0;
    const moves: StockMovement[] = [];
    raw
      .map((r, i) => ({ ...r, i, date: `2026-0${r.month}-${String(r.day).padStart(2, "0")}` }))
      .toSorted((a, b) => a.date.localeCompare(b.date) || (a.out === b.out ? 0 : a.out ? 1 : -1) || a.i - b.i)
      .forEach((r) => {
        if (r.out) {
          if (r.qty <= have) {
            moves.push({ id: r.i, date: r.date, kind: "out", quantity: r.qty });
            have -= r.qty;
          }
        } else {
          moves.push({ id: r.i, date: r.date, kind: "in", quantity: r.qty, amount: r.qty * r.price });
          have += r.qty;
        }
      });
    const res = costMovements({ quantity: 0, amount: 0 }, moves, method);
    const inV = moves.filter((m) => m.kind === "in").reduce((s, m) => s + (m.amount ?? 0), 0);
    const outV = [...res.costs.values()].reduce((s, v) => s + v, 0);
    expect(res.closing.quantity).toBe(have);
    expect(res.closing.amount).toBe(inV - outV);
    for (const v of res.costs.values()) expect(v).toBeGreaterThanOrEqual(0);
    if (method === "moving") expect(res.closing.amount).toBeGreaterThanOrEqual(0);
    if (have === 0 && method === "moving") expect(res.closing.amount).toBe(0);
  });
  it("ước tính giá xuất và TK mặc định", () => {
    expect(estimateIssueCost({ quantity: 15, amount: 1_275_000 }, 5)).toBe(425_000);
    expect(estimateIssueCost({ quantity: 15, amount: 1_275_000 }, 15)).toBe(1_275_000);
    expect(stockDefaults("TT133")).toMatchObject({ inventoryAccount: "156", issueDebitAccount: "632" });
  });
});

describe("nhập tồn kho đầu kỳ từ Excel", () => {
  const ctx = { accounts: [], partners: [], items: [{ code: "SACH-NM" }, { code: "HP-TOT", track_inventory: false }], warehouses: [{ code: "KHO" }] };
  it("ghép cột, kiểm tra kho, mã hàng, số lượng", () => {
    const table: Table = [
      ["Mã kho", "Mã vật tư", "Tên vật tư", "SL tồn", "Giá trị tồn"],
      ["kho", "sach-nm", "Sách", 10, "800.000"],
      ["KHO", "HP-TOT", "Học phí", 1, 1],
      ["KHO2", "SACH-NM", "Sách", 1, 1],
      ["KHO", "X", "Không có", 1, 1],
      ["KHO", "SACH-NM", "Sách", 2, 1],
      ["", "", "Tổng cộng", 14, 800_003],
      ["KHO", "SACH-NM", "Sách", 0, 500],
    ];
    const header = detectHeader(table, IMPORT_SPECS["opening-stock"].fields);
    const map = autoMap(header.headers, IMPORT_SPECS["opening-stock"].fields);
    expect(map).toMatchObject({ warehouseCode: 0, itemCode: 1, itemName: 2, quantity: 3, amount: 4 });
    const p = buildPreview("opening-stock", table, header, map, ctx);
    expect(p.rows.map((r) => [r.status, r.message ?? ""])).toEqual([
      ["new", ""],
      ["error", "Mặt hàng HP-TOT không theo dõi tồn kho"],
      ["error", "Chưa có kho KHO2 — thêm ở Tồn kho › Danh mục kho"],
      ["error", "Chưa có mã hàng X — nhập danh mục hàng hóa trước"],
      ["error", "Trùng mã kho + mã hàng với dòng 2"],
      ["skip", "Không phải dòng hàng hóa"],
      ["error", "Có giá trị nhưng số lượng bằng 0"],
    ]);
    expect(p.rows[0]?.payload).toEqual({ row: 2, warehouse_code: "kho", item_code: "sach-nm", quantity: 10, amount: 800_000 });
  });
});

describe("tỷ suất lãi gộp", () => {
  it("làm tròn 1 chữ số, doanh thu thuần bằng 0 thì không tính", () => {
    expect(grossMargin(600_000, 120_000)).toBe(20);
    expect(grossMargin(360_000, 105_000)).toBe(29.2);
    expect(grossMargin(100_000, -50_000)).toBe(-50);
    expect(grossMargin(0, -80_000)).toBeNull();
  });
});
