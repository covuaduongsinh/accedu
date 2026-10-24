import { describe, expect, it } from "vitest";
import { COA_TT133, COA_TT99 } from "../src";

const byCode = (list: typeof COA_TT99) => new Map(list.map((a) => [a.code, a]));

describe("Hệ thống tài khoản TT99/2025", () => {
  const m = byCode(COA_TT99);
  it("bổ sung tài khoản mới", () => {
    for (const c of ["1383", "215", "2295", "2414", "332", "3525", "6275", "82111", "82112"]) expect(m.has(c)).toBe(true);
  });
  it("bỏ tài khoản cũ", () => {
    for (const c of ["1385", "1562", "161", "3385", "417", "441", "461", "466", "611", "631"]) expect(m.has(c)).toBe(false);
  });
  it("đổi tên", () => {
    expect(m.get("112")?.name).toBe("Tiền gửi không kỳ hạn");
    expect(m.get("3387")?.name).toBe("Doanh thu chờ phân bổ");
    expect(m.get("6415")?.name).toBe("Thuế, phí, lệ phí");
  });
  it("cây tài khoản hợp lệ", () => {
    expect(m.get("82111")?.parent).toBe("8211");
    expect(m.get("33311")?.level).toBe(3);
    expect(m.get("214")?.normalSide).toBe("credit");
    expect(m.get("131")?.trackPartner).toBe(true);
    expect(m.get("1561")?.trackItem).toBe(true);
  });
});

describe.each([
  ["TT99", COA_TT99],
  ["TT133", COA_TT133],
])("%s — tính toàn vẹn", (_name, list) => {
  it("mã duy nhất, cha tồn tại, cha là tiền tố của con", () => {
    const m = byCode(list);
    expect(m.size).toBe(list.length);
    for (const a of list) {
      if (a.parent) {
        expect(m.has(a.parent)).toBe(true);
        expect(a.code.startsWith(a.parent)).toBe(true);
      } else {
        expect(a.code).toHaveLength(3);
      }
    }
  });
});

describe("TT133", () => {
  it("tài khoản đặc trưng DNNVV", () => {
    const m = byCode(COA_TT133);
    expect(m.get("6421")?.name).toBe("Chi phí bán hàng");
    expect(m.has("641")).toBe(false);
    expect(m.has("1386")).toBe(true);
  });
});
