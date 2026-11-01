/** Màn hình cập nhật chứng từ theo loại — mở chứng từ từ sổ, báo cáo (?edit=id). Loại khác mở ở Phiếu kế toán. */
export const VOUCHER_PATH: Record<string, string> = {
  PT: "cash/receipts",
  PC: "cash/payments",
  BC: "cash/bank-credits",
  BN: "cash/bank-debits",
  HDB: "sales/invoices",
  HDV: "sales/service-invoices",
  HDM: "purchase/invoices",
  HMV: "purchase/service-invoices",
  PNK: "inventory/receipts",
  PXK: "inventory/issues",
  PDC: "inventory/transfers",
  PK: "general/journal-vouchers",
};

export const voucherPath = (type: string | null | undefined) => (type && VOUCHER_PATH[type]) || "general/journal-vouchers";
