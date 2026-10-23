/** Chế độ kế toán áp dụng cho đơn vị */
export const ACCOUNTING_REGIMES = {
  TT99: "Thông tư 99/2025/TT-BTC (thay thế TT200, áp dụng từ 01/01/2026)",
  TT133: "Thông tư 133/2016/TT-BTC (doanh nghiệp nhỏ và vừa)",
} as const;
export type AccountingRegime = keyof typeof ACCOUNTING_REGIMES;

/**
 * Trạng thái chứng từ — giữ ngữ nghĩa FAO để kế toán quen tay:
 * chỉ `posted` (Chuyển sổ cái) mới phát sinh trên sổ.
 */
export const VOUCHER_STATUSES = {
  draft: "Lập chứng từ",
  review: "Chờ duyệt",
  posted: "Chuyển sổ cái",
  cancelled: "Hủy",
} as const;
export type VoucherStatus = keyof typeof VOUCHER_STATUSES;

/** Phương pháp tính giá xuất kho */
export const COSTING_METHODS = {
  weighted_period: "Bình quân gia quyền cuối kỳ",
  weighted_moving: "Bình quân di động",
  fifo: "Nhập trước xuất trước",
  specific: "Đích danh",
} as const;
export type CostingMethod = keyof typeof COSTING_METHODS;

/** Phương pháp tính thuế GTGT */
export const VAT_METHODS = {
  deduction: "Khấu trừ",
  direct: "Trực tiếp",
} as const;
export type VatMethod = keyof typeof VAT_METHODS;

/** Loại tài khoản (theo tính chất số dư) */
export const ACCOUNT_KINDS = {
  asset: "Tài sản (dư Nợ)",
  liability: "Nợ phải trả (dư Có)",
  equity: "Vốn chủ sở hữu (dư Có)",
  revenue: "Doanh thu (không dư)",
  expense: "Chi phí (không dư)",
  result: "Xác định kết quả (không dư)",
  both: "Lưỡng tính (dư Nợ hoặc Có)",
} as const;
export type AccountKind = keyof typeof ACCOUNT_KINDS;
