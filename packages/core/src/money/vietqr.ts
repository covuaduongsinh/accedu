import makeQr from "qrcode-generator";

/**
 * Mã VietQR (chuẩn EMVCo QR của NAPAS) để phụ huynh quét chuyển khoản học phí bằng ứng dụng ngân hàng.
 * Sinh hoàn toàn tại máy — không gọi dịch vụ ngoài.
 */
export interface VietQrInput {
  /** Mã ngân hàng (BIN NAPAS, 6 số), vd. 970436 */
  bin: string;
  /** Số tài khoản nhận */
  accountNo: string;
  /** Số tiền (đồng); bỏ trống → người chuyển tự nhập */
  amount?: number | null;
  /** Nội dung chuyển khoản (không dấu) */
  note?: string | null;
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF) — 4 ký tự hex in hoa; chuỗi chỉ gồm ký tự ASCII */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let k = 0; k < text.length; k++) {
    const byte = text.charCodeAt(k) & 0xff;
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function vietQrPayload({ bin, accountNo, amount, note }: VietQrInput): string {
  if (!/^\d{6}$/.test(bin)) throw new Error("Mã ngân hàng (BIN) phải gồm 6 chữ số");
  if (!/^[0-9A-Za-z]{1,19}$/.test(accountNo)) throw new Error("Số tài khoản không hợp lệ");
  const beneficiary = tlv("00", bin) + tlv("01", accountNo);
  const merchant = tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");
  const amt = amount && amount > 0 ? Math.round(amount) : null;
  const purpose = (note ?? "").replaceAll(/[^A-Za-z0-9 ]/g, "").slice(0, 50);
  const body =
    tlv("00", "01") +
    tlv("01", amt ? "12" : "11") +
    tlv("38", merchant) +
    tlv("53", "704") +
    (amt ? tlv("54", String(amt)) : "") +
    tlv("58", "VN") +
    (purpose ? tlv("62", tlv("08", purpose)) : "") +
    "6304";
  return body + crc16(body);
}

/** Ma trận điểm của mã QR (true = ô đen), mức sửa lỗi M — vẽ bằng SVG (web) hoặc View (mobile) */
export function qrMatrix(text: string): boolean[][] {
  const qr = makeQr(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_row, r) => Array.from({ length: n }, (_cell, c) => qr.isDark(r, c)));
}

/** Ngân hàng phổ biến (BIN NAPAS) để chọn nhanh khi khai báo tài khoản nhận học phí */
export const VIETQR_BANKS: ReadonlyArray<{ bin: string; name: string }> = [
  { bin: "970436", name: "Vietcombank" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970405", name: "Agribank" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970416", name: "ACB" },
  { bin: "970432", name: "VPBank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970441", name: "VIB" },
  { bin: "970443", name: "SHB" },
  { bin: "970437", name: "HDBank" },
  { bin: "970448", name: "OCB" },
];
