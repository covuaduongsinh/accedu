import { describe, expect, it } from "vitest";
import { einvoiceKey, guessPurchaseType, parseEInvoiceXml } from "../src/import/einvoice";

/** Dựng XML hóa đơn theo TT78 — dữ liệu giả hoàn toàn */
interface Fx {
  form?: string;
  series?: string;
  number?: string;
  date?: string;
  currency?: string;
  seller?: { name: string; mst: string };
  buyerMst?: string;
  lines: Array<{ tchat?: number; name: string; uom?: string; qty?: number; price?: number; ck?: number; amount: number; rate?: string }>;
  rates?: Array<{ rate: string; net: number; tax: number }>;
  net?: number;
  tax?: number;
  total?: number;
  mccqt?: string | null;
  envelope?: boolean;
  related?: { kind: 1 | 2; series: string; number: string };
}

function xml(f: Fx): string {
  const tag = (name: string, v: string | number | undefined) => (v === undefined ? "" : `<${name}>${v}</${name}>`);
  const lines = f.lines
    .map(
      (l, i) =>
        `<HHDVu>${tag("TChat", l.tchat ?? 1)}${tag("STT", i + 1)}${tag("THHDVu", l.name)}${tag("DVTinh", l.uom)}${tag("SLuong", l.qty)}${tag("DGia", l.price)}${tag("STCKhau", l.ck)}${tag("ThTien", l.amount)}${tag("TSuat", l.rate)}</HHDVu>`,
    )
    .join("");
  const rates = f.rates
    ? `<THTTLTSuat>${f.rates.map((r) => `<LTSuat><TSuat>${r.rate}</TSuat><ThTien>${r.net}</ThTien><TThue>${r.tax}</TThue></LTSuat>`).join("")}</THTTLTSuat>`
    : "";
  const related = f.related
    ? `<TTHDLQuan><TCHDon>${f.related.kind}</TCHDon><KHMSHDCLQuan>1</KHMSHDCLQuan><KHHDCLQuan>${f.related.series}</KHHDCLQuan><SHDCLQuan>${f.related.number}</SHDCLQuan></TTHDLQuan>`
    : "";
  const hdon = `<HDon><DLHDon Id="data"><TTChung><PBan>2.0.1</PBan>${tag("KHMSHDon", f.form ?? "1")}${tag("KHHDon", f.series ?? "C26TSM")}${tag("SHDon", f.number ?? "00000123")}${tag("NLap", f.date ?? "2026-10-20")}${tag("DVTTe", f.currency ?? "VND")}<TGia>1</TGia>${related}</TTChung><NDHDon><NBan><Ten>${f.seller?.name ?? "Công ty TNHH Sách Mẫu"}</Ten><MST>${f.seller?.mst ?? "0109999991"}</MST><DChi>Số 1 Phố Mẫu, Hà Nội</DChi></NBan><NMua><Ten>Công ty CP Cờ vua Mẫu</Ten>${tag("MST", f.buyerMst ?? "0108888888")}</NMua><DSHHDVu>${lines}</DSHHDVu><TToan>${rates}${tag("TgTCThue", f.net)}${tag("TgTThue", f.tax)}${tag("TgTTTBSo", f.total)}</TToan></NDHDon></DLHDon>${f.mccqt === null ? "" : `<MCCQT>${f.mccqt ?? "00ABCDEF0123456789ABCDEF0123456789"}</MCCQT>`}<DSCKS><NBan>chu-ky-gia</NBan></DSCKS></HDon>`;
  const body = f.envelope ? `<TDiep><TTChung><MNGui>V0000000000</MNGui></TTChung><DLieu>${hdon}</DLieu></TDiep>` : hdon;
  return `<?xml version="1.0" encoding="UTF-8"?>${body}`;
}

const books: Fx = {
  lines: [
    { name: "Sách cờ vua nhập môn", uom: "Cuốn", qty: 10, price: 80_000, amount: 800_000, rate: "5%" },
    { name: "Bàn cờ gỗ tiêu chuẩn", uom: "Bộ", qty: 3, price: 333_333, amount: 999_999, rate: "10%" },
  ],
  rates: [
    { rate: "5%", net: 800_000, tax: 40_000 },
    { rate: "10%", net: 999_999, tax: 100_000 },
  ],
  net: 1_799_999,
  tax: 140_000,
  total: 1_939_999,
};

describe("đọc XML hóa đơn điện tử (TT78)", () => {
  it("hóa đơn GTGT nhiều thuế suất: dòng, ký hiệu đầy đủ, tiền thuế khớp hóa đơn", () => {
    const [r] = parseEInvoiceXml(xml(books), { buyerTaxCode: "0108888888" });
    expect(r?.errors).toEqual([]);
    expect(r?.warnings).toEqual([]);
    const inv = r!.invoice!;
    expect(inv).toMatchObject({ series: "1C26TSM", seriesShort: "C26TSM", number: "00000123", date: "2026-10-20" });
    expect(inv.seller).toEqual({ name: "Công ty TNHH Sách Mẫu", taxCode: "0109999991", address: "Số 1 Phố Mẫu, Hà Nội" });
    expect(inv.lines.map((l) => [l.description, l.quantity, l.unitPrice, l.amount, l.vatCode, l.vatAmount])).toEqual([
      ["Sách cờ vua nhập môn", 10, 80_000, 800_000, "5", 40_000],
      // 999.999 × 10% = 99.999,9 → 100.000 theo hóa đơn
      ["Bàn cờ gỗ tiêu chuẩn", 3, 333_333, 999_999, "10", 100_000],
    ]);
    expect(inv.totals).toEqual({ net: 1_799_999, vat: 140_000, total: 1_939_999 });
    expect(guessPurchaseType(inv)).toBe("HDM");
  });

  it("dồn chênh làm tròn vào dòng lớn nhất cho khớp tiền thuế của người bán", () => {
    const [r] = parseEInvoiceXml(
      xml({
        lines: [
          { name: "Bút", amount: 33_333, rate: "10%" },
          { name: "Vở", amount: 33_333, rate: "10%" },
          { name: "Bảng", amount: 33_334, rate: "10%" },
        ],
        tax: 10_001,
      }),
    );
    expect(r!.invoice!.lines.map((l) => l.vatAmount)).toEqual([3_333, 3_333, 3_335]);
    expect(r!.invoice!.totals.vat).toBe(10_001);
  });

  it("dịch vụ không chịu thuế, vỏ TDiep, gợi ý hóa đơn mua dịch vụ", () => {
    const [r] = parseEInvoiceXml(
      xml({ envelope: true, seller: { name: "Công ty Dịch vụ Mẫu", mst: "0107777777-001" }, lines: [{ name: "Phí thuê sân thi đấu", amount: 5_000_000, rate: "KCT" }] }),
    );
    expect(r?.errors).toEqual([]);
    expect(r!.invoice!.seller.taxCode).toBe("0107777777-001");
    expect(r!.invoice!.lines[0]).toMatchObject({ vatCode: "KCT", vatAmount: 0 });
    expect(guessPurchaseType(r!.invoice!)).toBe("HMV");
  });

  it("chiết khấu thương mại trừ vào dòng cùng thuế suất; bỏ dòng ghi chú và khuyến mại 0 đồng", () => {
    const [r] = parseEInvoiceXml(
      xml({
        lines: [
          { name: "Đồng hồ cờ vua", uom: "Cái", qty: 5, price: 400_000, amount: 2_000_000, rate: "8%" },
          { tchat: 2, name: "Tặng túi đựng cờ", amount: 0, rate: "8%" },
          { tchat: 3, name: "Chiết khấu thương mại", amount: 100_000, rate: "8%" },
          { tchat: 4, name: "Giao hàng tại CLB", amount: 0 },
        ],
        tax: 152_000,
      }),
    );
    expect(r?.errors).toEqual([]);
    expect(r!.invoice!.lines).toHaveLength(1);
    expect(r!.invoice!.lines[0]).toMatchObject({ amount: 1_900_000, discount: 100_000, vatAmount: 152_000 });
  });

  it("cảnh báo: thiếu mã CQT, MST người mua khác đơn vị, tổng không khớp, hóa đơn thay thế", () => {
    const [r] = parseEInvoiceXml(
      xml({ ...books, mccqt: null, net: 1_800_000, related: { kind: 1, series: "C26TSM", number: "100" } }),
      { buyerTaxCode: "0101111111" },
    );
    expect(r?.errors).toEqual([]);
    expect(r?.warnings.join("\n")).toMatch(/không có mã của cơ quan thuế/);
    expect(r?.warnings.join("\n")).toMatch(/MST người mua 0108888888 khác MST đơn vị 0101111111/);
    expect(r?.warnings.join("\n")).toMatch(/Tổng tiền hàng trên hóa đơn 1\.800\.000/);
    expect(r?.warnings.join("\n")).toMatch(/thay thế cho hóa đơn 1C26TSM-100/);
  });

  it("lỗi: ngoại tệ, thuế suất khác, điều chỉnh giảm, không phải hóa đơn", () => {
    expect(parseEInvoiceXml(xml({ ...books, currency: "USD" }))[0]?.errors).toContain("Hóa đơn ngoại tệ (USD) — nhập tay");
    expect(parseEInvoiceXml(xml({ lines: [{ name: "Hàng", amount: 100, rate: "KHAC:3.5%" }] }))[0]?.errors.join()).toMatch(/thuế suất khác/);
    expect(parseEInvoiceXml(xml({ lines: [{ name: "Giảm giá", amount: -100, rate: "10%" }] }))[0]?.errors.join()).toMatch(/điều chỉnh giảm/);
    expect(parseEInvoiceXml("<Foo><Bar>1</Bar></Foo>")[0]?.errors).toEqual(["Tệp không phải hóa đơn điện tử (không có thẻ HDon)"]);
  });

  it("hóa đơn bán hàng (mẫu 2): dòng không có mã thuế", () => {
    const [r] = parseEInvoiceXml(xml({ form: "2", lines: [{ name: "Quân cờ nhựa", amount: 150_000 }] }));
    expect(r?.errors).toEqual([]);
    expect(r!.invoice!.series).toBe("2C26TSM");
    expect(r!.invoice!.lines[0]).toMatchObject({ vatCode: null, vatAmount: 0 });
  });

  it("khóa nhận diện bỏ số 0 đầu của số hóa đơn", () => {
    expect(einvoiceKey("0109999991 ", "1c26tsm", "00000123")).toBe(einvoiceKey("0109999991", "1C26TSM", "123"));
  });
});
