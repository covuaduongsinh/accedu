import { roundAmount } from "../money/round";

/**
 * Mã thuế suất GTGT (theo Luật thuế GTGT 48/2024/QH15).
 * `KCT`: không chịu thuế (ví dụ dịch vụ dạy học, dạy nghề); `KKKNT`: không kê khai, tính nộp thuế.
 */
export const VAT_CODES = {
  "0": { rate: 0, label: "0%" },
  "5": { rate: 5, label: "5%" },
  "8": { rate: 8, label: "8% (giảm thuế)" },
  "10": { rate: 10, label: "10%" },
  KCT: { rate: 0, label: "Không chịu thuế" },
  KKKNT: { rate: 0, label: "Không kê khai, tính nộp thuế" },
} as const;
export type VatCode = keyof typeof VAT_CODES;

export function vatAmount(base: number, code: VatCode, decimals = 0): number {
  return roundAmount((base * VAT_CODES[code].rate) / 100, decimals);
}

/** Tách giá đã gồm thuế thành tiền hàng + thuế. */
export function splitGross(gross: number, code: VatCode, decimals = 0): { net: number; vat: number } {
  const rate = VAT_CODES[code].rate;
  const net = roundAmount(gross / (1 + rate / 100), decimals);
  return { net, vat: roundAmount(gross - net, decimals) };
}
