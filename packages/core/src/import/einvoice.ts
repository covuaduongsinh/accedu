import { XMLParser } from "fast-xml-parser";
import { VAT_CODES, vatAmount, type VatCode } from "../accounting/vat";
import { roundAmount } from "../money/round";
import { normalizeHeader } from "./table";
import { parseVatCode } from "./validate";

/**
 * Đọc tệp XML hóa đơn điện tử theo TT78/2021 (định dạng của Tổng cục Thuế, QĐ 1450/QĐ-TCT).
 * Tách riêng khỏi `@accedu/core` (subpath `@accedu/core/einvoice`) để app mobile không mang thư viện XML.
 */

export interface EInvoiceLine {
  lineNo: number;
  /** Mã hàng hóa, dịch vụ của người bán (MHHDVu) — dùng để gắn mã hàng khi nhập */
  itemCode: string | null;
  description: string;
  uom: string;
  quantity: number | null;
  unitPrice: number | null;
  /** Thành tiền chưa thuế, đã trừ chiết khấu */
  amount: number;
  /** Chiết khấu (trên dòng + chiết khấu thương mại phân bổ vào dòng) */
  discount: number;
  vatCode: VatCode | null;
  vatAmount: number;
}

export interface EInvoice {
  /** Ký hiệu mẫu số (KHMSHDon): 1 = HĐ GTGT, 2 = HĐ bán hàng… */
  formNo: string;
  /** Ký hiệu đầy đủ như in trên hóa đơn: mẫu số + ký hiệu (1C26TAA) */
  series: string;
  /** Ký hiệu không gồm mẫu số (C26TAA) */
  seriesShort: string;
  number: string;
  /** Ngày lập (ISO) */
  date: string;
  seller: { name: string; taxCode: string; address: string };
  buyer: { name: string; taxCode: string };
  lines: EInvoiceLine[];
  totals: { net: number; vat: number; total: number };
  /** Mã của cơ quan thuế (MCCQT) */
  authorityCode: string | null;
  /** Hóa đơn thay thế / điều chỉnh cho hóa đơn khác */
  related: { kind: "replace" | "adjust"; ref: string } | null;
}

export interface EInvoiceParse {
  invoice: EInvoice | null;
  /** Lỗi: không tạo được hóa đơn, phải nhập tay */
  errors: string[];
  /** Cảnh báo: vẫn tạo được, kế toán cần xem lại */
  warnings: string[];
}

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  // Giữ chuỗi gốc: không mất số 0 đầu của số hóa đơn/MST, không sai số với số lớn
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "HHDVu" || name === "LTSuat" || name === "HDon",
});

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null => {
  const t = text(v).replace(/\s/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const node = (v: unknown): Node => (v && typeof v === "object" && !Array.isArray(v) ? (v as Node) : {});
const list = (v: unknown): Node[] => (Array.isArray(v) ? v.map(node) : v ? [node(v)] : []);

/** Mọi nút HDon trong cây, ở bất kỳ độ sâu nào (tệp có thể gói trong TDiep/DLieu) */
function findInvoices(v: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(v)) for (const x of v) findInvoices(x, out);
  else if (v && typeof v === "object") {
    for (const [k, child] of Object.entries(v as Node)) {
      if (k === "HDon") out.push(...list(child));
      else findInvoices(child, out);
    }
  }
  return out;
}

const normTax = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();

/** Khóa nhận diện một hóa đơn: MST người bán + ký hiệu + số (bỏ số 0 đầu) — để phát hiện tệp trùng */
export function einvoiceKey(sellerTaxCode: string, series: string, number: string): string {
  return `${normTax(sellerTaxCode)}|${series.trim().toUpperCase()}|${number.trim().replace(/^0+(?=\d)/, "")}`;
}

/** Đọc một tệp XML (có thể chứa nhiều hóa đơn). Không có hóa đơn nào thì trả một kết quả báo lỗi. */
export function parseEInvoiceXml(xml: string, opts: { buyerTaxCode?: string | null } = {}): EInvoiceParse[] {
  let tree: unknown;
  try {
    tree = parser.parse(xml);
  } catch (e) {
    return [{ invoice: null, errors: [`Tệp XML không đọc được: ${(e as Error).message}`], warnings: [] }];
  }
  const invoices = findInvoices(tree);
  if (!invoices.length) return [{ invoice: null, errors: ["Tệp không phải hóa đơn điện tử (không có thẻ HDon)"], warnings: [] }];
  return invoices.map((h) => readInvoice(h, opts));
}

function readInvoice(h: Node, opts: { buyerTaxCode?: string | null }): EInvoiceParse {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dl = node(h.DLHDon);
  const tt = node(dl.TTChung);
  const nd = node(dl.NDHDon);
  const ban = node(nd.NBan);
  const mua = node(nd.NMua);
  const toan = node(nd.TToan);

  const formNo = text(tt.KHMSHDon);
  const seriesShort = text(tt.KHHDon);
  const number = text(tt.SHDon);
  const date = text(tt.NLap).slice(0, 10);
  const currency = text(tt.DVTTe).toUpperCase() || "VND";
  const seller = { name: text(ban.Ten), taxCode: normTax(text(ban.MST)), address: text(ban.DChi) };
  const buyer = { name: text(mua.Ten), taxCode: normTax(text(mua.MST)) };

  if (!seller.taxCode) errors.push("Thiếu mã số thuế người bán");
  if (!number) errors.push("Thiếu số hóa đơn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push("Thiếu hoặc sai ngày lập hóa đơn");
  if (currency !== "VND") errors.push(`Hóa đơn ngoại tệ (${currency}) — nhập tay`);

  // Hóa đơn bán hàng (mẫu 2): người mua không được khấu trừ thuế → dòng không có mã thuế
  const salesForm = formNo === "2";
  const lines: EInvoiceLine[] = [];
  const tradeDiscounts: { amount: number; vatCode: VatCode | null; stt: number }[] = [];
  list(node(nd.DSHHDVu).HHDVu).forEach((l, i) => {
    const stt = num(l.STT) ?? i + 1;
    const kind = num(l.TChat) ?? 1; // 1 hàng hóa/dịch vụ, 2 khuyến mại, 3 chiết khấu thương mại, 4 ghi chú
    if (kind === 4) return;
    const quantity = num(l.SLuong);
    const unitPrice = num(l.DGia);
    const lineDiscount = num(l.STCKhau) ?? 0;
    const amount = num(l.ThTien) ?? (quantity !== null && unitPrice !== null ? roundAmount(quantity * unitPrice - lineDiscount) : 0);
    if (kind === 2 && amount === 0) return;
    if (amount < 0) {
      errors.push(`Dòng ${stt} có thành tiền âm (hóa đơn điều chỉnh giảm) — nhập tay`);
      return;
    }
    let vatCode: VatCode | null = null;
    const rate = text(l.TSuat);
    if (!salesForm) {
      if (!rate) warnings.push(`Dòng ${stt} không ghi thuế suất`);
      else if (/^KHAC/i.test(rate)) errors.push(`Dòng ${stt}: thuế suất khác (${rate}) — nhập tay`);
      else {
        vatCode = parseVatCode(rate);
        if (!vatCode) errors.push(`Dòng ${stt}: thuế suất ${rate} chưa hỗ trợ`);
      }
    }
    if (kind === 3) {
      tradeDiscounts.push({ amount, vatCode, stt });
      return;
    }
    lines.push({
      lineNo: lines.length + 1,
      itemCode: text(l.MHHDVu) || null,
      description: text(l.THHDVu) || `Dòng ${stt}`,
      uom: text(l.DVTinh),
      quantity,
      unitPrice,
      amount,
      discount: lineDiscount,
      vatCode,
      vatAmount: 0,
    });
  });

  // Chiết khấu thương mại: trừ vào dòng lớn nhất cùng thuế suất
  for (const d of tradeDiscounts) {
    const target = lines.filter((l) => l.vatCode === d.vatCode).toSorted((a, b) => b.amount - a.amount)[0];
    if (!target || target.amount < d.amount) {
      errors.push(`Chiết khấu thương mại dòng ${d.stt} không trừ được vào dòng hàng cùng thuế suất — nhập tay`);
      continue;
    }
    target.amount = roundAmount(target.amount - d.amount);
    target.discount = roundAmount(target.discount + d.amount);
  }
  if (!lines.length) errors.push("Hóa đơn không có dòng hàng hóa, dịch vụ");

  // Thuế theo dòng, rồi dồn chênh làm tròn vào dòng lớn nhất để khớp tiền thuế trên hóa đơn
  for (const l of lines) l.vatAmount = l.vatCode ? vatAmount(l.amount, l.vatCode) : 0;
  const byRate = new Map<string, number>();
  for (const r of list(node(toan.THTTLTSuat).LTSuat)) {
    const code = parseVatCode(text(r.TSuat));
    const tax = num(r.TThue);
    if (code && tax !== null) byRate.set(code, (byRate.get(code) ?? 0) + tax);
  }
  const reconcile = (group: EInvoiceLine[], target: number, label: string) => {
    const computed = group.reduce((s, l) => s + l.vatAmount, 0);
    const diff = roundAmount(target - computed);
    if (diff === 0 || !group.length) return;
    const largest = group.toSorted((a, b) => b.amount - a.amount)[0]!;
    // Cùng ngưỡng với save_voucher: lệch không quá max(10đ, 1% tiền thuế của dòng)
    if (Math.abs(diff) <= Math.max(10, largest.vatAmount * 0.01) && largest.vatAmount + diff >= 0) largest.vatAmount = roundAmount(largest.vatAmount + diff);
    else warnings.push(`Tiền thuế${label} trên hóa đơn ${target.toLocaleString("vi-VN")} khác tiền thuế tính theo dòng ${computed.toLocaleString("vi-VN")}`);
  };
  const taxed = lines.filter((l) => l.vatCode && VAT_CODES[l.vatCode].rate > 0);
  if (byRate.size) {
    for (const [code, tax] of byRate) {
      if (VAT_CODES[code as VatCode].rate > 0) reconcile(taxed.filter((l) => l.vatCode === code), tax, ` ${code}%`);
    }
  } else {
    const totalTax = num(toan.TgTThue);
    if (totalTax !== null) reconcile(taxed, totalTax, "");
  }

  const net = roundAmount(lines.reduce((s, l) => s + l.amount, 0));
  const vat = roundAmount(lines.reduce((s, l) => s + l.vatAmount, 0));
  const totals = { net, vat, total: roundAmount(net + vat) };
  const declaredNet = num(toan.TgTCThue);
  const declaredTotal = num(toan.TgTTTBSo);
  if (declaredNet !== null && Math.abs(declaredNet - net) >= 1)
    warnings.push(`Tổng tiền hàng trên hóa đơn ${declaredNet.toLocaleString("vi-VN")} khác tổng các dòng ${net.toLocaleString("vi-VN")}`);
  if (declaredTotal !== null && Math.abs(declaredTotal - totals.total) >= 1)
    warnings.push(`Tổng thanh toán trên hóa đơn ${declaredTotal.toLocaleString("vi-VN")} khác ${totals.total.toLocaleString("vi-VN")}`);

  const own = normTax(opts.buyerTaxCode);
  if (!buyer.taxCode) warnings.push("Hóa đơn không ghi mã số thuế người mua");
  else if (own && buyer.taxCode !== own) warnings.push(`MST người mua ${buyer.taxCode} khác MST đơn vị ${own}`);

  const authorityCode = text(h.MCCQT) || null;
  if (!authorityCode) warnings.push("Hóa đơn không có mã của cơ quan thuế");

  const rel = node(tt.TTHDLQuan);
  const relKind = text(rel.TCHDon);
  const related =
    relKind === "1" || relKind === "2"
      ? { kind: relKind === "1" ? ("replace" as const) : ("adjust" as const), ref: [text(rel.KHMSHDCLQuan) + text(rel.KHHDCLQuan), text(rel.SHDCLQuan)].filter(Boolean).join("-") }
      : null;
  if (related) warnings.push(`Hóa đơn ${related.kind === "replace" ? "thay thế" : "điều chỉnh"} cho hóa đơn ${related.ref || "khác"} — kiểm tra hóa đơn gốc`);

  return {
    invoice: { formNo, series: formNo + seriesShort, seriesShort, number, date, seller, buyer, lines, totals, authorityCode, related },
    errors,
    warnings,
  };
}

const SERVICE_WORDS = ["dich vu", "thue", "cuoc", "phi", "dien", "nuoc", "internet", "van chuyen", "quang cao", "sua chua", "bao tri", "tu van", "dao tao", "ve sinh", "bao ve"];

const isService = (description: string) => {
  const n = ` ${normalizeHeader(description)} `;
  return SERVICE_WORDS.some((w) => n.includes(` ${w} `));
};

/** Gợi ý loại hóa đơn mua: mọi dòng đều là dịch vụ (thuê, cước, phí, điện nước…) → HMV, còn lại → HDM */
export function guessPurchaseType(invoice: Pick<EInvoice, "lines">): "HDM" | "HMV" {
  return invoice.lines.length > 0 && invoice.lines.every((l) => isService(l.description)) ? "HMV" : "HDM";
}
