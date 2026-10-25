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
  /** Hóa đơn: form có mặt hàng, số lượng, đơn giá, thuế GTGT theo dòng */
  invoice?: boolean;
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
  HDB: {
    type: "HDB",
    title: "Hóa đơn bán hàng",
    subtitle: "Bán sách, bàn cờ, đồng phục… — thuế GTGT theo từng dòng",
    style: "pair",
    headerSide: "debit",
    headerAccountLabel: "TK nợ (công nợ)",
    defaultHeaderAccount: "131",
    lineAccountLabel: "TK doanh thu",
    partnerLabel: "Mã khách",
    contactLabel: "Người mua",
    descriptionLabel: "Diễn giải",
    invoice: true,
  },
  HDV: {
    type: "HDV",
    title: "Hóa đơn dịch vụ",
    subtitle: "Học phí, giải đấu, dịch vụ đào tạo — mặc định không chịu thuế (KCT)",
    style: "pair",
    headerSide: "debit",
    headerAccountLabel: "TK nợ (công nợ)",
    defaultHeaderAccount: "131",
    lineAccountLabel: "TK doanh thu",
    partnerLabel: "Mã khách",
    contactLabel: "Người mua / phụ huynh",
    descriptionLabel: "Diễn giải",
    invoice: true,
  },
  HDM: {
    type: "HDM",
    title: "Hóa đơn mua hàng",
    subtitle: "Mua sách, bàn cờ, đồ dùng — thuế GTGT đầu vào được khấu trừ (1331)",
    style: "pair",
    headerSide: "credit",
    headerAccountLabel: "TK có (công nợ)",
    defaultHeaderAccount: "331",
    lineAccountLabel: "TK hàng / chi phí",
    partnerLabel: "Mã NCC",
    contactLabel: "Người giao hàng",
    descriptionLabel: "Diễn giải",
    invoice: true,
  },
  HMV: {
    type: "HMV",
    title: "Hóa đơn mua dịch vụ",
    subtitle: "Thuê mặt bằng, điện nước, dịch vụ mua ngoài",
    style: "pair",
    headerSide: "credit",
    headerAccountLabel: "TK có (công nợ)",
    defaultHeaderAccount: "331",
    lineAccountLabel: "TK chi phí",
    partnerLabel: "Mã NCC",
    contactLabel: "Người liên hệ",
    descriptionLabel: "Diễn giải",
    invoice: true,
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
