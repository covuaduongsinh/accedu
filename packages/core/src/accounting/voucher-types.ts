/**
 * Danh mục loại chứng từ. `style`:
 * - `pair`: mỗi dòng có cặp Nợ/Có (phiếu thu/chi, hóa đơn…); tài khoản phần đầu là một vế cố định.
 * - `single`: mỗi dòng một vế Nợ hoặc Có (phiếu kế toán), cân theo nhóm định khoản.
 */
export interface VoucherTypeDef {
  code: string;
  name: string;
  module: ModuleKey;
  style: "pair" | "single";
  /** Vế của tài khoản phần đầu (PT: Nợ 111, PC: Có 111) */
  headerSide?: "debit" | "credit";
  /** Tài khoản phần đầu gợi ý theo chế độ */
  defaultHeaderAccount?: string;
  prefix: string;
}

export type ModuleKey =
  | "system"
  | "general"
  | "cash"
  | "sales"
  | "purchase"
  | "inventory"
  | "project"
  | "assets"
  | "tools"
  | "education";

export const VOUCHER_TYPES = [
  { code: "PT", name: "Phiếu thu tiền mặt", module: "cash", style: "pair", headerSide: "debit", defaultHeaderAccount: "1111", prefix: "PT" },
  { code: "PC", name: "Phiếu chi tiền mặt", module: "cash", style: "pair", headerSide: "credit", defaultHeaderAccount: "1111", prefix: "PC" },
  { code: "BC", name: "Giấy báo có", module: "cash", style: "pair", headerSide: "debit", defaultHeaderAccount: "1121", prefix: "BC" },
  { code: "BN", name: "Giấy báo nợ", module: "cash", style: "pair", headerSide: "credit", defaultHeaderAccount: "1121", prefix: "BN" },
  { code: "PK", name: "Phiếu kế toán", module: "general", style: "single", prefix: "PK" },
  { code: "HDB", name: "Hóa đơn bán hàng", module: "sales", style: "pair", headerSide: "debit", defaultHeaderAccount: "131", prefix: "HD" },
  { code: "HDV", name: "Hóa đơn dịch vụ", module: "sales", style: "pair", headerSide: "debit", defaultHeaderAccount: "131", prefix: "DV" },
  { code: "HDM", name: "Hóa đơn mua hàng", module: "purchase", style: "pair", headerSide: "credit", defaultHeaderAccount: "331", prefix: "MH" },
  { code: "HMV", name: "Hóa đơn mua dịch vụ", module: "purchase", style: "pair", headerSide: "credit", defaultHeaderAccount: "331", prefix: "MV" },
  { code: "PNK", name: "Phiếu nhập kho", module: "inventory", style: "pair", headerSide: "credit", defaultHeaderAccount: "331", prefix: "PN" },
  { code: "PXK", name: "Phiếu xuất kho", module: "inventory", style: "pair", headerSide: "debit", defaultHeaderAccount: "632", prefix: "PX" },
  { code: "PDC", name: "Phiếu xuất điều chuyển", module: "inventory", style: "pair", prefix: "DC" },
  { code: "KH", name: "Bút toán khấu hao TSCĐ", module: "assets", style: "pair", prefix: "KH" },
  { code: "PB", name: "Bút toán phân bổ CCDC", module: "tools", style: "pair", prefix: "PB" },
  { code: "KC", name: "Bút toán kết chuyển", module: "general", style: "pair", prefix: "KC" },
] as const satisfies readonly VoucherTypeDef[];

export type VoucherTypeCode = (typeof VOUCHER_TYPES)[number]["code"];

export function voucherType(code: string): VoucherTypeDef | undefined {
  return VOUCHER_TYPES.find((t) => t.code === code);
}
