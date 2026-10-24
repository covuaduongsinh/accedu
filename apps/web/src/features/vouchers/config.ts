import type { VoucherRow } from "@accedu/api";

export interface VoucherUiConfig {
  type: string;
  title: string;
  subtitle: string;
  style: "pair" | "single";
  /** Vế của tài khoản phần đầu */
  headerSide?: "debit" | "credit";
  headerAccountLabel?: string;
  defaultHeaderAccount?: string;
  /** Tiền tố tài khoản hợp lệ cho phần đầu (lọc gợi ý) */
  headerAccountPrefix?: string;
  lineAccountLabel?: string;
  partnerLabel: string;
  contactLabel: string;
  descriptionLabel: string;
  /** Mẫu chứng từ in */
  printForm?: { code: string; title: string; contactLabel: string; reasonLabel: string };
}

export const VOUCHER_UI: Record<string, VoucherUiConfig> = {
  PT: {
    type: "PT",
    title: "Phiếu thu tiền mặt",
    subtitle: "Cập nhật phiếu thu: thêm, sửa, xóa, ghi sổ",
    style: "pair",
    headerSide: "debit",
    headerAccountLabel: "Tài khoản nợ",
    defaultHeaderAccount: "1111",
    headerAccountPrefix: "111",
    lineAccountLabel: "Tk có",
    partnerLabel: "Mã khách",
    contactLabel: "Người nộp tiền",
    descriptionLabel: "Lý do nộp",
    printForm: { code: "01-TT", title: "PHIẾU THU", contactLabel: "Họ và tên người nộp tiền", reasonLabel: "Lý do nộp" },
  },
  PC: {
    type: "PC",
    title: "Phiếu chi tiền mặt",
    subtitle: "Cập nhật phiếu chi: thêm, sửa, xóa, ghi sổ",
    style: "pair",
    headerSide: "credit",
    headerAccountLabel: "Tài khoản có",
    defaultHeaderAccount: "1111",
    headerAccountPrefix: "111",
    lineAccountLabel: "Tk nợ",
    partnerLabel: "Mã khách",
    contactLabel: "Người nhận tiền",
    descriptionLabel: "Lý do chi",
    printForm: { code: "02-TT", title: "PHIẾU CHI", contactLabel: "Họ và tên người nhận tiền", reasonLabel: "Lý do chi" },
  },
  BC: {
    type: "BC",
    title: "Giấy báo có",
    subtitle: "Thu tiền qua ngân hàng",
    style: "pair",
    headerSide: "debit",
    headerAccountLabel: "Tài khoản nợ (ngân hàng)",
    defaultHeaderAccount: "1121",
    headerAccountPrefix: "112",
    lineAccountLabel: "Tk có",
    partnerLabel: "Mã khách",
    contactLabel: "Người nộp tiền",
    descriptionLabel: "Diễn giải",
  },
  BN: {
    type: "BN",
    title: "Giấy báo nợ",
    subtitle: "Chi tiền qua ngân hàng",
    style: "pair",
    headerSide: "credit",
    headerAccountLabel: "Tài khoản có (ngân hàng)",
    defaultHeaderAccount: "1121",
    headerAccountPrefix: "112",
    lineAccountLabel: "Tk nợ",
    partnerLabel: "Mã khách",
    contactLabel: "Người nhận tiền",
    descriptionLabel: "Diễn giải",
  },
  PK: {
    type: "PK",
    title: "Phiếu kế toán",
    subtitle: "Bút toán tổng hợp: Nợ/Có theo nhóm định khoản",
    style: "single",
    partnerLabel: "Mã khách",
    contactLabel: "Người lập",
    descriptionLabel: "Diễn giải",
  },
};

export const STATUS_BADGE: Record<VoucherRow["status"], { label: string; tone: "gray" | "gold" | "green" | "red" }> = {
  draft: { label: "Lập chứng từ", tone: "gray" },
  review: { label: "Chờ duyệt", tone: "gold" },
  posted: { label: "Đã ghi sổ", tone: "green" },
  cancelled: { label: "Hủy", tone: "red" },
};
