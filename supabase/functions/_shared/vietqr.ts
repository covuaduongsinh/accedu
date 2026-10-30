// Mã VietQR (chuẩn EMVCo QR của NAPAS) — dùng trong Edge Function (Deno).
// Trùng với packages/core/src/money/vietqr.ts (Edge Function không nhập được gói của monorepo); test giữ hai bản khớp nhau.

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE — 4 ký tự hex in hoa */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let k = 0; k < text.length; k++) {
    crc ^= (text.charCodeAt(k) & 0xff) << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function vietQrPayload({ bin, accountNo, amount, note }: { bin: string; accountNo: string; amount?: number | null; note?: string | null }): string {
  if (!/^\d{6}$/.test(bin)) throw new Error("Mã ngân hàng (BIN) phải gồm 6 chữ số");
  if (!/^[0-9A-Za-z]{1,19}$/.test(accountNo)) throw new Error("Số tài khoản không hợp lệ");
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", bin) + tlv("01", accountNo)) + tlv("02", "QRIBFTTA");
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

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Nội dung chuyển khoản học phí: không dấu, chỉ chữ số và khoảng trắng */
export function tuitionTransferNote(studentCode: string, invoiceNumber?: string | null): string {
  return stripDiacritics(`HP ${studentCode}${invoiceNumber ? ` ${invoiceNumber}` : ""}`)
    .replaceAll(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, 50);
}

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
