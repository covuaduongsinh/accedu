import type { FieldSpec } from "./table";

export type ImportKind = "accounts" | "partners" | "opening-accounts" | "opening-partners";

export interface ImportSpec {
  kind: ImportKind;
  title: string;
  /** Tên tệp mẫu (không đuôi) */
  fileName: string;
  fields: readonly FieldSpec[];
  /** Dòng mẫu theo thứ tự fields — dữ liệu giả, chỉ để minh họa */
  sample: readonly (readonly string[])[];
  /** Hướng dẫn in trong sheet "Hướng dẫn" của tệp mẫu và trên hộp thoại nhập */
  notes: readonly string[];
}

const ACCOUNT_CODE: FieldSpec = {
  key: "account",
  label: "Tài khoản",
  required: true,
  synonyms: ["Tài khoản", "Số hiệu tài khoản", "Số hiệu TK", "Số hiệu", "Mã tài khoản", "Mã TK", "Số TK", "TK"],
  exclude: ["tên", "mẹ", "ngân hàng", "đối ứng", "sổ cái", "công nợ", "loại", "nhóm", "bậc", "nt"],
};

const BALANCE_EXCLUDE = ["phát sinh", "ps", "nt", "nguyên tệ", "công", "tài khoản"];

const DEBIT: FieldSpec = { key: "debit", label: "Dư Nợ", synonyms: ["Dư nợ", "Số dư nợ", "Dư nợ đầu kỳ", "Nợ"], exclude: BALANCE_EXCLUDE };
const CREDIT: FieldSpec = { key: "credit", label: "Dư Có", synonyms: ["Dư có", "Số dư có", "Dư có đầu kỳ", "Có"], exclude: BALANCE_EXCLUDE };

const PARTNER_CODE_SYNONYMS = [
  "Mã khách",
  "Mã khách hàng",
  "Mã KH",
  "Mã đối tượng",
  "Mã nhà cung cấp",
  "Mã NCC",
  "Mã nhân viên",
  "Mã học viên",
  "Mã",
];
const PARTNER_NAME_SYNONYMS = ["Tên khách hàng", "Tên khách", "Tên đối tượng", "Tên nhà cung cấp", "Tên NCC", "Họ và tên", "Họ tên", "Tên"];
const FLAG_EXCLUDE = ["mã", "tên", "nhóm", "loại", "địa chỉ", "tài khoản", "ngân hàng"];

export const IMPORT_SPECS: Record<ImportKind, ImportSpec> = {
  accounts: {
    kind: "accounts",
    title: "Danh mục tài khoản",
    fileName: "mau-danh-muc-tai-khoan",
    fields: [
      { ...ACCOUNT_CODE, key: "code" },
      { key: "name", label: "Tên tài khoản", required: true, synonyms: ["Tên tài khoản", "Tên TK", "Tên"], exclude: ["khác", "ngắn", "anh", "mẹ"] },
      { key: "nameEn", label: "Tên tiếng Anh", synonyms: ["Tên tiếng Anh", "Tên khác", "Tên TA", "English name"] },
      { key: "parentCode", label: "Tài khoản mẹ", synonyms: ["Tài khoản mẹ", "Tk mẹ", "TK cấp trên"] },
      { key: "currency", label: "Mã ngoại tệ", synonyms: ["Mã nt", "Mã ngoại tệ", "Ngoại tệ", "Loại tiền", "Tiền tệ"] },
      { key: "normalSide", label: "Tính chất", synonyms: ["Tính chất", "Tính chất số dư", "Số dư"] },
      { key: "trackPartner", label: "Theo dõi công nợ", synonyms: ["Theo dõi công nợ", "Tk theo dõi công nợ", "Công nợ", "TK công nợ"] },
    ],
    sample: [
      ["11211", "Tiền gửi VND — Ngân hàng mẫu A", "", "1121", "", "Nợ", "0"],
      ["11212", "Tiền gửi VND — Ngân hàng mẫu B", "", "1121", "", "Nợ", "0"],
      ["51131", "Doanh thu học phí lớp Tốt", "Tuition revenue", "5113", "", "Có", "0"],
    ],
    notes: [
      "Chỉ cột Tài khoản và Tên tài khoản là bắt buộc. Thiếu Tài khoản mẹ thì AccEdu tự tìm theo số hiệu (11211 → 1121).",
      "Tính chất: Nợ / Có / Lưỡng tính. Theo dõi công nợ: 1 hoặc 0. Bỏ trống thì AccEdu suy ra theo số hiệu.",
      "Tài khoản đã có sẽ được cập nhật tên/thuộc tính; không tài khoản nào bị xóa.",
      "Từ FAO: Tổng hợp › Danh mục tài khoản › Kết xuất Excel, rồi chọn tệp đó — không cần sửa tiêu đề cột.",
    ],
  },
  partners: {
    kind: "partners",
    title: "Danh mục đối tượng (khách hàng, nhà cung cấp, nhân viên, học viên)",
    fileName: "mau-danh-muc-doi-tuong",
    fields: [
      { key: "code", label: "Mã", required: true, synonyms: PARTNER_CODE_SYNONYMS, exclude: ["thuế", "nt", "tk", "nhóm", "ngân hàng", "tài khoản"] },
      { key: "name", label: "Tên", required: true, synonyms: PARTNER_NAME_SYNONYMS, exclude: ["ngân hàng", "khác", "liên hệ", "nhóm", "tài khoản"] },
      { key: "taxCode", label: "Mã số thuế", synonyms: ["Mã số thuế", "MST", "Mã thuế"] },
      { key: "idNumber", label: "Số CCCD", synonyms: ["Số CCCD", "CCCD", "CMND", "Số CMND", "Căn cước"] },
      { key: "address", label: "Địa chỉ", synonyms: ["Địa chỉ"] },
      { key: "phone", label: "Điện thoại", synonyms: ["Điện thoại", "Số điện thoại", "SĐT", "Di động", "Tel"] },
      { key: "email", label: "Email", synonyms: ["Email", "E-mail", "Thư điện tử"] },
      { key: "contactName", label: "Người liên hệ", synonyms: ["Người liên hệ", "Liên hệ", "Đối tác", "Phụ huynh"] },
      { key: "groupCode", label: "Nhóm", synonyms: ["Nhóm", "Mã nhóm", "Nhóm khách hàng", "Nhóm KH"] },
      { key: "type", label: "Loại (KH/NCC/NV/HV)", synonyms: ["Loại", "Loại đối tượng", "Phân loại"], exclude: ["khách", "tài khoản"] },
      { key: "isCustomer", label: "Là khách hàng", synonyms: ["Là khách hàng", "Khách hàng"], exclude: FLAG_EXCLUDE },
      { key: "isSupplier", label: "Là nhà cung cấp", synonyms: ["Là nhà cung cấp", "Nhà cung cấp"], exclude: FLAG_EXCLUDE },
      { key: "isEmployee", label: "Là nhân viên", synonyms: ["Là nhân viên", "Nhân viên"], exclude: FLAG_EXCLUDE },
      { key: "isStudent", label: "Là học viên", synonyms: ["Là học viên", "Học viên"], exclude: FLAG_EXCLUDE },
      { key: "bankAccountNo", label: "Số tài khoản ngân hàng", synonyms: ["Tài khoản ngân hàng", "Số tài khoản", "TK ngân hàng", "STK"] },
      { key: "bankName", label: "Ngân hàng", synonyms: ["Ngân hàng", "Tên ngân hàng"], exclude: ["tài khoản", "số", "stk"] },
      { key: "note", label: "Ghi chú", synonyms: ["Ghi chú", "Diễn giải"] },
    ],
    sample: [
      ["HV0001", "Học viên Mẫu Một", "", "", "Số 1 Phố Mẫu, Hà Nội", "0900000001", "hocvien1@example.com", "Phụ huynh Mẫu", "LOP-TOT", "HV", "", "", "", "", "", "", ""],
      ["NCC001", "Công ty TNHH Sách Mẫu", "0100000000", "", "Số 2 Phố Mẫu, Hà Nội", "0240000000", "", "", "", "NCC", "", "", "", "", "0000000000", "Ngân hàng mẫu", ""],
      ["NV001", "Huấn luyện viên Mẫu", "", "", "", "0900000002", "", "", "", "NV", "", "", "", "", "", "", ""],
    ],
    notes: [
      "Chỉ cột Mã và Tên là bắt buộc. Mã tối đa 16 ký tự, không trùng.",
      "Loại: KH (khách hàng), NCC (nhà cung cấp), NV (nhân viên), HV (học viên); nhiều loại thì ngăn bằng dấu phẩy, vd. KH,NCC.",
      "Bỏ trống cột Loại: đối tượng mới là khách hàng (hoặc nhà cung cấp nếu nhập từ Danh mục nhà cung cấp).",
      "Đối tượng đã có (trùng mã) được cập nhật các cột có trong tệp; cột không có trong tệp giữ nguyên.",
      "Từ FAO: Bán hàng › Danh mục khách hàng › Kết xuất Excel.",
    ],
  },
  "opening-accounts": {
    kind: "opening-accounts",
    title: "Số dư đầu kỳ các tài khoản",
    fileName: "mau-so-du-dau-ky-tai-khoan",
    fields: [ACCOUNT_CODE, { key: "name", label: "Tên tài khoản (để đối chiếu)", synonyms: ["Tên tài khoản", "Tên TK", "Tên"] }, DEBIT, CREDIT],
    sample: [
      ["1111", "Tiền Việt Nam", "50000000", "0"],
      ["1121", "Tiền Việt Nam", "150000000", "0"],
      ["4111", "Vốn góp của chủ sở hữu", "0", "200000000"],
    ],
    notes: [
      "Số dư tại ngày bắt đầu nhập liệu của đơn vị. Nhập lại sẽ thay toàn bộ số dư tài khoản (không đụng số dư công nợ).",
      "Chỉ nhập tài khoản chi tiết; dòng tài khoản tổng hợp và dòng Tổng cộng được bỏ qua.",
      "Tài khoản theo dõi công nợ (131, 331, 141…) nhập ở mẫu Số dư công nợ theo từng đối tượng.",
      "Có thể chọn thẳng tệp Bảng cân đối phát sinh của FAO và chọn lấy cột đầu kỳ hay cuối kỳ.",
    ],
  },
  "opening-partners": {
    kind: "opening-partners",
    title: "Số dư công nợ đầu kỳ theo đối tượng",
    fileName: "mau-so-du-cong-no",
    fields: [
      ACCOUNT_CODE,
      { key: "partnerCode", label: "Mã đối tượng", required: true, synonyms: PARTNER_CODE_SYNONYMS.toSpliced(8, 0, "Đối tượng"), exclude: ["thuế", "nt", "tk", "tài khoản"] },
      { key: "partnerName", label: "Tên đối tượng (để đối chiếu)", synonyms: PARTNER_NAME_SYNONYMS, exclude: ["tài khoản", "tk"] },
      DEBIT,
      CREDIT,
    ],
    sample: [
      ["131", "HV0001", "Học viên Mẫu Một", "3000000", "0"],
      ["331", "NCC001", "Công ty TNHH Sách Mẫu", "0", "12000000"],
    ],
    notes: [
      "Nhập sau khi đã có danh mục đối tượng. Nhập lại sẽ thay toàn bộ số dư công nợ.",
      "Tài khoản phải là tài khoản chi tiết có theo dõi công nợ.",
      "Từ FAO: Bán hàng / Mua hàng › Số dư đầu kỳ › Vào số dư công nợ đầu kỳ, hoặc Báo cáo số dư công nợ.",
    ],
  },
};
