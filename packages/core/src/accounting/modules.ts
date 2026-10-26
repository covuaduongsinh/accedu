import type { ModuleKey } from "./voucher-types";

export type FeatureKind = "voucher" | "catalog" | "report" | "process" | "setting" | "dashboard";

export interface Feature {
  /** Đường dẫn tương đối trong đơn vị: /:tenant/<path> */
  path: string;
  title: string;
  kind: FeatureKind;
  /** Phase trong kế hoạch; `ready` = đã có màn hình */
  phase: `P${number}`;
  ready?: boolean;
  /** Hiển thị trên app mobile */
  mobile?: boolean;
}

export interface ModuleDef {
  key: ModuleKey;
  title: string;
  features: Feature[];
}

/** Cây chức năng AccEdu — dùng chung cho menu web/desktop và mobile. */
export const MODULES: ModuleDef[] = [
  {
    key: "system",
    title: "Hệ thống",
    features: [
      { path: "dashboard", title: "Tổng quan", kind: "dashboard", phase: "P1", ready: true, mobile: true },
      { path: "system/company", title: "Thông tin đơn vị", kind: "setting", phase: "P1", ready: true },
      { path: "system/branches", title: "Đơn vị cơ sở", kind: "catalog", phase: "P2" },
      { path: "system/users", title: "Người sử dụng & phân quyền", kind: "setting", phase: "P1", ready: true },
      { path: "system/voucher-books", title: "Quyển chứng từ", kind: "catalog", phase: "P2" },
      { path: "system/periods", title: "Kỳ kế toán & khóa sổ", kind: "setting", phase: "P2", ready: true },
      { path: "system/import", title: "Chuyển dữ liệu từ FAO (nhập Excel)", kind: "process", phase: "P2", ready: true },
      { path: "system/currencies", title: "Tiền tệ & tỷ giá", kind: "catalog", phase: "P2" },
      { path: "system/audit", title: "Nhật ký hệ thống", kind: "report", phase: "P2" },
    ],
  },
  {
    key: "general",
    title: "Tổng hợp",
    features: [
      { path: "general/journal-vouchers", title: "Phiếu kế toán", kind: "voucher", phase: "P2", ready: true },
      { path: "general/accounts", title: "Danh mục tài khoản", kind: "catalog", phase: "P2", ready: true, mobile: true },
      { path: "general/opening-balances", title: "Số dư đầu kỳ tài khoản & công nợ", kind: "process", phase: "P2", ready: true },
      { path: "general/general-journal", title: "Sổ nhật ký chung", kind: "report", phase: "P2", ready: true },
      { path: "general/ledger", title: "Sổ cái tài khoản", kind: "report", phase: "P2", ready: true, mobile: true },
      { path: "general/trial-balance", title: "Bảng cân đối phát sinh", kind: "report", phase: "P2", ready: true, mobile: true },
      { path: "general/closing", title: "Kết chuyển cuối kỳ", kind: "process", phase: "P7" },
      { path: "general/financial-position", title: "Báo cáo tình hình tài chính", kind: "report", phase: "P8", mobile: true },
      { path: "general/income-statement", title: "Báo cáo kết quả kinh doanh", kind: "report", phase: "P8", mobile: true },
      { path: "general/cash-flow", title: "Báo cáo lưu chuyển tiền tệ", kind: "report", phase: "P8" },
      { path: "general/vat-out", title: "Bảng kê hóa đơn bán ra", kind: "report", phase: "P4", ready: true },
      { path: "general/vat-in", title: "Bảng kê hóa đơn mua vào", kind: "report", phase: "P4", ready: true },
      { path: "general/vat-return", title: "Tờ khai thuế GTGT", kind: "report", phase: "P8" },
    ],
  },
  {
    key: "cash",
    title: "Tiền",
    features: [
      { path: "cash/receipts", title: "Phiếu thu tiền mặt", kind: "voucher", phase: "P3", ready: true, mobile: true },
      { path: "cash/payments", title: "Phiếu chi tiền mặt", kind: "voucher", phase: "P3", ready: true, mobile: true },
      { path: "cash/bank-credits", title: "Giấy báo có", kind: "voucher", phase: "P3", ready: true },
      { path: "cash/bank-debits", title: "Giấy báo nợ", kind: "voucher", phase: "P3", ready: true },
      { path: "cash/cash-book", title: "Sổ quỹ tiền mặt", kind: "report", phase: "P3", ready: true, mobile: true },
      { path: "cash/bank-book", title: "Sổ tiền gửi ngân hàng", kind: "report", phase: "P3", ready: true },
      { path: "cash/bank-accounts", title: "Tài khoản ngân hàng", kind: "catalog", phase: "P3" },
    ],
  },
  {
    key: "sales",
    title: "Bán hàng",
    features: [
      { path: "sales/invoices", title: "Hóa đơn bán hàng", kind: "voucher", phase: "P4", ready: true },
      { path: "sales/service-invoices", title: "Hóa đơn dịch vụ (học phí, giải đấu)", kind: "voucher", phase: "P4", ready: true },
      { path: "sales/customers", title: "Danh mục khách hàng", kind: "catalog", phase: "P2", ready: true, mobile: true },
      { path: "sales/receivable-ledger", title: "Sổ chi tiết công nợ khách hàng", kind: "report", phase: "P4", ready: true, mobile: true },
      { path: "sales/receivable-summary", title: "Tổng hợp công nợ phải thu", kind: "report", phase: "P4", ready: true },
      { path: "sales/aging", title: "Tuổi nợ phải thu", kind: "report", phase: "P4", ready: true, mobile: true },
      { path: "sales/gross-profit", title: "Lãi gộp theo mặt hàng, khách hàng", kind: "report", phase: "P5", ready: true },
      { path: "sales/einvoices", title: "Hóa đơn điện tử", kind: "process", phase: "P8" },
    ],
  },
  {
    key: "purchase",
    title: "Mua hàng",
    features: [
      { path: "purchase/invoices", title: "Hóa đơn mua hàng", kind: "voucher", phase: "P4", ready: true },
      { path: "purchase/service-invoices", title: "Hóa đơn mua dịch vụ", kind: "voucher", phase: "P4", ready: true },
      { path: "purchase/suppliers", title: "Danh mục nhà cung cấp", kind: "catalog", phase: "P2", ready: true },
      { path: "purchase/input-invoices", title: "Hóa đơn đầu vào (XML)", kind: "process", phase: "P4", ready: true },
      { path: "purchase/payable-ledger", title: "Sổ chi tiết công nợ nhà cung cấp", kind: "report", phase: "P4", ready: true },
      { path: "purchase/payable-summary", title: "Tổng hợp công nợ phải trả", kind: "report", phase: "P4", ready: true },
      { path: "purchase/aging", title: "Tuổi nợ phải trả", kind: "report", phase: "P4", ready: true },
    ],
  },
  {
    key: "inventory",
    title: "Tồn kho",
    features: [
      { path: "inventory/receipts", title: "Phiếu nhập kho", kind: "voucher", phase: "P5", ready: true },
      { path: "inventory/issues", title: "Phiếu xuất kho", kind: "voucher", phase: "P5", ready: true },
      { path: "inventory/transfers", title: "Phiếu xuất điều chuyển", kind: "voucher", phase: "P5", ready: true },
      { path: "inventory/items", title: "Danh mục hàng hóa, dịch vụ", kind: "catalog", phase: "P4", ready: true },
      { path: "inventory/warehouses", title: "Danh mục kho", kind: "catalog", phase: "P5", ready: true },
      { path: "inventory/costing", title: "Tính giá vốn hàng xuất kho", kind: "process", phase: "P5", ready: true },
      { path: "inventory/stock-summary", title: "Tổng hợp nhập xuất tồn", kind: "report", phase: "P5", ready: true, mobile: true },
      { path: "inventory/stock-card", title: "Thẻ kho / sổ chi tiết vật tư", kind: "report", phase: "P5", ready: true },
    ],
  },
  {
    key: "project",
    title: "Dự án",
    features: [
      { path: "project/jobs", title: "Công trình, vụ việc", kind: "catalog", phase: "P2", ready: true },
      { path: "project/contracts", title: "Hợp đồng", kind: "catalog", phase: "P7" },
      { path: "project/job-ledger", title: "Sổ chi tiết vụ việc", kind: "report", phase: "P7" },
    ],
  },
  {
    key: "assets",
    title: "Tài sản",
    features: [
      { path: "assets/fixed-assets", title: "Tài sản cố định", kind: "catalog", phase: "P6" },
      { path: "assets/depreciation", title: "Tính khấu hao TSCĐ", kind: "process", phase: "P6" },
    ],
  },
  {
    key: "tools",
    title: "Công cụ",
    features: [
      { path: "tools/items", title: "Công cụ dụng cụ", kind: "catalog", phase: "P6" },
      { path: "tools/allocation", title: "Phân bổ CCDC", kind: "process", phase: "P6" },
    ],
  },
  {
    key: "education",
    title: "Đào tạo",
    features: [
      { path: "education/students", title: "Học viên", kind: "catalog", phase: "P9", ready: true, mobile: true },
      { path: "education/classes", title: "Lớp học (Tốt → Vua)", kind: "catalog", phase: "P9", ready: true, mobile: true },
      { path: "education/tuition", title: "Học phí & VietQR", kind: "process", phase: "P9", ready: true, mobile: true },
    ],
  },
];

export function findFeature(path: string): (Feature & { module: ModuleKey }) | undefined {
  for (const m of MODULES) {
    const f = m.features.find((x) => x.path === path);
    if (f) return { ...f, module: m.key };
  }
  return undefined;
}

/** Tìm chức năng theo từ khóa (bỏ dấu tiếng Việt) — giống ô "Tìm kiếm..." của FAO. */
export function searchFeatures(query: string): Array<Feature & { module: ModuleKey }> {
  const q = stripDiacritics(query.trim().toLowerCase());
  if (!q) return [];
  return MODULES.flatMap((m) =>
    m.features.filter((f) => stripDiacritics(f.title.toLowerCase()).includes(q)).map((f) => ({ ...f, module: m.key })),
  );
}

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
