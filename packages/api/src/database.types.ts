/**
 * Kiểu dữ liệu Supabase cho các bảng/RPC AccEdu đang dùng.
 * Khi có Supabase CLI + Docker: `supabase gen types typescript --local > packages/api/src/database.types.ts`
 * để thay bằng bản sinh tự động (cùng cấu trúc `Database`).
 */
type Timestamp = string;
type DateStr = string;
type Numeric = number | string;

interface Table<Row, Insert = Partial<Row>, Update = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  tax_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  regime: "TT99" | "TT133";
  base_currency: string;
  /** weighted_moving: bình quân di động; weighted_period: bình quân cả tháng */
  costing_method: string;
  vat_method: string;
  fiscal_year_start_month: number;
  start_date: DateStr;
  settings: Record<string, unknown>;
  /** Tài khoản nhận học phí (VietQR): mã ngân hàng BIN, số tài khoản, tên chủ tài khoản */
  bank_bin?: string | null;
  bank_account_no?: string | null;
  bank_account_name?: string | null;
  created_at: Timestamp;
};

export type AccountRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  name_en: string | null;
  parent_code: string | null;
  level: number;
  kind: "asset" | "liability" | "equity" | "revenue" | "expense" | "result";
  normal_side: "debit" | "credit" | "both";
  currency: string | null;
  track_partner: boolean;
  track_item: boolean;
  is_postable: boolean;
  is_active: boolean;
};

export type PartnerRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  tax_code: string | null;
  id_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  group_code: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  is_employee: boolean;
  is_student: boolean;
  is_active: boolean;
  note: string | null;
};

export type VoucherRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  voucher_type: string;
  book_id: string | null;
  number: string;
  issue_date: DateStr;
  posting_date: DateStr;
  partner_id: string | null;
  partner_name: string | null;
  address: string | null;
  contact_name: string | null;
  description: string | null;
  currency: string;
  exchange_rate: Numeric;
  header_account: string | null;
  original_documents: string | null;
  status: "draft" | "review" | "posted" | "cancelled";
  total_amount: Numeric;
  total_amount_fc: Numeric;
  source: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  posted_at: Timestamp | null;
  version: number;
  invoice_series: string | null;
  invoice_number: string | null;
  invoice_date: DateStr | null;
  due_date: DateStr | null;
  partner_tax_code: string | null;
  total_net: Numeric;
  total_vat: Numeric;
  /** Phiếu điều chuyển: kho nhập */
  to_warehouse_id: string | null;
};

export type VoucherLineRow = {
  id: string;
  voucher_id: string;
  tenant_id: string;
  line_no: number;
  debit_account: string | null;
  credit_account: string | null;
  amount: Numeric;
  amount_fc: Numeric;
  entry_group: number;
  description: string | null;
  partner_id: string | null;
  job_id: string | null;
  department_id: string | null;
  expense_item_id: string | null;
  item_id: string | null;
  warehouse_id: string | null;
  quantity: Numeric | null;
  unit_price: Numeric | null;
  uom: string | null;
  discount_amount: Numeric;
  vat_code: string | null;
  vat_rate: Numeric;
  vat_amount: Numeric;
  vat_account: string | null;
  /** Hóa đơn mà dòng thu/chi này trừ vào */
  invoice_id: string | null;
  /** Hóa đơn bán: giá vốn hàng xuất kho của dòng (hệ thống tính khi ghi sổ) */
  cost_amount?: Numeric | null;
  /** Hóa đơn bán: TK Nợ giá vốn */
  cost_account?: string | null;
};

export type ItemRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  kind: "goods" | "material" | "finished" | "service" | "tool" | "book";
  uom: string;
  group_code: string | null;
  inventory_account: string | null;
  revenue_account: string | null;
  cogs_account: string | null;
  vat_code: string;
  sale_price: Numeric | null;
  purchase_price: Numeric | null;
  track_inventory: boolean;
  barcode: string | null;
  default_warehouse_id: string | null;
  is_active: boolean;
};

export type PartnerLedgerRow = {
  row_kind: "opening" | "entry" | "total" | "closing";
  posting_date: DateStr;
  voucher_number: string | null;
  voucher_type: string | null;
  issue_date: DateStr | null;
  voucher_id: string | null;
  description: string | null;
  account: string;
  contra_account: string | null;
  debit: Numeric | null;
  credit: Numeric | null;
  balance_debit: Numeric | null;
  balance_credit: Numeric | null;
};

export type PartnerBalanceRow = {
  partner_id: string;
  partner_code: string;
  partner_name: string;
  opening_debit: Numeric;
  opening_credit: Numeric;
  debit: Numeric;
  credit: Numeric;
  closing_debit: Numeric;
  closing_credit: Numeric;
};

/** Hóa đơn đã ghi sổ còn nợ (open_invoices) */
export type OpenInvoiceRow = {
  id: string;
  voucher_type: string;
  number: string;
  posting_date: DateStr;
  invoice_series: string | null;
  invoice_number: string | null;
  invoice_date: DateStr | null;
  due_date: DateStr | null;
  partner_id: string;
  partner_code: string | null;
  partner_name: string | null;
  account: string;
  description: string | null;
  total_amount: Numeric;
  paid: Numeric;
  remaining: Numeric;
  /** Số ngày quá hạn; âm = chưa đến hạn */
  days_overdue: number;
};

export type AgingRow = {
  partner_id: string;
  partner_code: string;
  partner_name: string;
  not_due: Numeric;
  d1_30: Numeric;
  d31_60: Numeric;
  d61_90: Numeric;
  over_90: Numeric;
  /** Số dư không gắn hóa đơn (đầu kỳ, trả trước, bút toán khác) */
  unallocated: Numeric;
  total: Numeric;
};

export type VatListingRow = {
  group_order: number;
  vat_code: string;
  vat_rate: Numeric;
  voucher_id: string;
  voucher_type: string;
  voucher_number: string;
  posting_date: DateStr;
  invoice_series: string | null;
  invoice_number: string | null;
  invoice_date: DateStr;
  partner_code: string | null;
  partner_name: string | null;
  partner_tax_code: string | null;
  item_description: string | null;
  net_amount: Numeric;
  vat_amount: Numeric;
};

/** Kết quả nhập hóa đơn điện tử đầu vào (import_purchase_invoices) */
export type EInvoiceImportResult = {
  ok: boolean;
  dry_run: boolean;
  /** Số hóa đơn đã tạo (0 khi chạy thử hoặc có lỗi) */
  created: number;
  /** Số hóa đơn mới sẽ tạo / đã tạo */
  new: number;
  skipped: number;
  errors: number;
  partners_created: number;
  results: Array<{
    row: number;
    status: "new" | "created" | "exists" | "error";
    voucher_id?: string;
    number?: string;
    partner?: "new" | "existing" | null;
    message?: string;
    /** Số dòng đã gắn được mã hàng / tổng số dòng */
    items?: { matched: number; lines: number };
  }>;
};

/** Một hóa đơn gửi lên import_purchase_invoices */
export type PurchaseInvoiceImport = {
  row: number;
  voucher_type: "HDM" | "HMV";
  posting_date: string;
  invoice_date: string;
  line_account: string;
  seller: { name: string; tax_code: string; address?: string };
  invoice_series: string;
  invoice_series_short: string;
  invoice_number: string;
  description?: string;
  lines: Array<{
    /** Mã hàng của người bán (MHHDVu) — khớp với mã hàng trước khi khớp theo tên */
    item_code?: string | null;
    description: string;
    uom?: string;
    quantity?: number | null;
    unit_price?: number | null;
    amount: number;
    discount_amount?: number;
    vat_code: string | null;
    vat_amount: number;
  }>;
};

export type WarehouseRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  branch_id: string | null;
  account_code: string | null;
  address: string | null;
  is_active: boolean;
};

export type StockOpeningRow = {
  id: string;
  tenant_id: string;
  item_id: string;
  warehouse_id: string;
  account: string;
  quantity: Numeric;
  amount: Numeric;
};

export type StockBalanceRow = {
  item_id: string;
  warehouse_id: string;
  quantity: Numeric;
  amount: Numeric;
  /** Tổng mọi kho của mặt hàng — giá bình quân = item_amount / item_quantity */
  item_quantity: Numeric;
  item_amount: Numeric;
};

export type StockSummaryRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  account: string;
  opening_qty: Numeric;
  opening_amount: Numeric;
  in_qty: Numeric;
  in_amount: Numeric;
  out_qty: Numeric;
  out_amount: Numeric;
  closing_qty: Numeric;
  closing_amount: Numeric;
};

export type StockCardRow = {
  row_kind: "opening" | "entry" | "closing";
  line: number;
  posting_date: DateStr;
  voucher_id: string | null;
  voucher_type: string | null;
  voucher_number: string | null;
  description: string | null;
  warehouse_code: string | null;
  qty_in: Numeric | null;
  amount_in: Numeric | null;
  qty_out: Numeric | null;
  amount_out: Numeric | null;
  balance_qty: Numeric;
  balance_amount: Numeric;
};

export type StockVsLedgerRow = { account: string; stock_amount: Numeric; ledger_amount: Numeric; difference: Numeric };

/** Lãi gộp theo mặt hàng / khách hàng (rpt_gross_profit) */
export type GrossProfitRow = {
  key_id: string | null;
  code: string | null;
  name: string;
  uom: string | null;
  quantity: Numeric;
  revenue: Numeric;
  deductions: Numeric;
  net_revenue: Numeric;
  cogs: Numeric;
  gross_profit: Numeric;
  margin: Numeric | null;
};

export type StockOpeningImportResult =
  | { ok: true; inserted: number; skipped: number; quantity: Numeric; amount: Numeric }
  | { ok: false; errors: Array<{ row: number; message: string }> };

/** Một dòng phiếu thu/chi đã trừ vào hóa đơn */
export type InvoicePaymentRow = {
  voucher_id: string;
  line_no: number;
  amount: Numeric;
  vouchers: Pick<VoucherRow, "number" | "posting_date" | "status" | "voucher_type"> | null;
};

export type JobRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  kind: "project" | "class" | "course" | "event" | "contract";
  group_code: string | null;
  partner_id: string | null;
  start_date: DateStr | null;
  end_date: DateStr | null;
  budget: Numeric | null;
  is_active: boolean;
};

export type OpeningBalanceRow = {
  id: string;
  tenant_id: string;
  account: string;
  partner_id: string | null;
  job_id: string | null;
  debit: Numeric;
  credit: Numeric;
};

export type PeriodLockRow = {
  tenant_id: string;
  voucher_type: string;
  locked_until: DateStr;
  locked_by: string | null;
  locked_at: Timestamp;
};

export type MemberRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: MyTenantRow["role"];
  created_at: Timestamp;
};

export type MyTenantRow = {
  id: string;
  slug: string;
  name: string;
  regime: "TT99" | "TT133";
  tax_code: string | null;
  role: "owner" | "admin" | "chief_accountant" | "accountant" | "cashier" | "viewer" | "coach";
};

export type TrialBalanceRow = {
  account_code: string;
  account_name: string;
  level: number;
  is_postable: boolean;
  opening_debit: Numeric;
  opening_credit: Numeric;
  debit: Numeric;
  credit: Numeric;
  closing_debit: Numeric;
  closing_credit: Numeric;
};

export type JournalRow = {
  posting_date: DateStr;
  voucher_number: string;
  issue_date: DateStr;
  voucher_type: string;
  voucher_id: string;
  description: string | null;
  account: string;
  contra_account: string | null;
  debit: Numeric;
  credit: Numeric;
  line_no: number;
};

export type LedgerRow = {
  row_kind: "opening" | "entry" | "total" | "closing";
  posting_date: DateStr;
  voucher_number: string | null;
  issue_date: DateStr | null;
  voucher_id: string | null;
  description: string | null;
  account: string;
  contra_account: string | null;
  debit: Numeric | null;
  credit: Numeric | null;
  balance_debit: Numeric | null;
  balance_credit: Numeric | null;
};

/** Kết quả các hàm nhập từ Excel (import_accounts / import_partners / import_opening_balances) */
export type ImportResult =
  | { ok: false; errors: Array<{ row: number; message: string }> }
  | { ok: true; inserted: number; updated?: number; unchanged?: number; skipped?: number; debit?: number; credit?: number };

/** Hồ sơ học viên (đối tượng partners.is_student) */
export type StudentProfileRow = {
  partner_id: string;
  tenant_id: string;
  birth_date: DateStr | null;
  gender: "M" | "F" | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  school: string | null;
  level: "tot" | "ma" | "tuong" | "xe" | "hau" | "vua" | null;
  joined_on: DateStr | null;
};

/** Học viên = đối tượng + hồ sơ */
export type StudentRow = PartnerRow & { student_profiles: StudentProfileRow | null };

/** Lớp học = vụ việc kind class + thông tin lớp */
export type ClassInfoRow = {
  job_id: string;
  tenant_id: string;
  level: StudentProfileRow["level"];
  billing: "monthly" | "course";
  fee: Numeric;
  sessions_per_course: number | null;
  schedule: string | null;
  location: string | null;
  coach_partner_id: string | null;
  /** Tài khoản HLV điểm danh lớp */
  coach_user_id: string | null;
  capacity: number | null;
};
export type ClassRow = ClassInfoRow & { jobs: JobRow };

export type EnrollmentRow = {
  id: string;
  tenant_id: string;
  class_id: string;
  student_id: string;
  start_date: DateStr;
  end_date: DateStr | null;
  status: "active" | "paused" | "finished" | "dropped";
  fee: Numeric | null;
  note: string | null;
};

/** Tình hình học phí (rpt_tuition_status): mỗi phiếu học phí một dòng */
export type TuitionStatusRow = {
  bill_id: string;
  enrollment_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  billing: "monthly" | "course";
  student_id: string;
  student_code: string;
  student_name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  period_start: DateStr;
  period_end: DateStr | null;
  sessions: number | null;
  amount: Numeric;
  invoice_id: string;
  invoice_number: string;
  invoice_status: "draft" | "posted" | "cancelled";
  invoice_date: DateStr;
  due_date: DateStr | null;
  paid: Numeric;
  remaining: Numeric;
};

/** Kết quả lập học phí (generate_tuition) */
export type TuitionGenerateResult = {
  ok: boolean;
  dry_run: boolean;
  new: number;
  created: number;
  existing: number;
  total: Numeric;
  items: Array<{
    enrollment_id: string;
    class_code: string;
    class_name: string;
    student_code: string;
    student_name: string;
    period_start: DateStr;
    amount: Numeric;
    status: "new" | "created" | "exists";
    voucher_id?: string;
    number?: string;
  }>;
};

export type PayTuitionResult = {
  ok: boolean;
  total: Numeric;
  vouchers: Array<{ voucher_id: string; number: string; student_name: string; amount: Numeric }>;
};

export type StudentImportResult =
  | { ok: false; errors: Array<{ row: number; message: string }> }
  | { ok: true; inserted: number; updated: number; enrolled: number };

export type AttendanceStatus = "present" | "absent" | "excused";

/** Buổi học (mỗi lớp mỗi ngày một buổi) */
export type ClassSessionRow = {
  id: string;
  tenant_id: string;
  class_id: string;
  held_on: DateStr;
  topic: string | null;
  coach_user_id: string | null;
};

export type AttendanceRow = {
  id: string;
  tenant_id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  note: string | null;
};

/** Lớp của tôi (my_classes): HLV thấy lớp mình phụ trách */
export type MyClassRow = {
  class_id: string;
  code: string;
  name: string;
  level: StudentProfileRow["level"];
  billing: "monthly" | "course";
  sessions_per_course: number | null;
  schedule: string | null;
  location: string | null;
  students: number;
  last_held_on: DateStr | null;
  is_mine: boolean;
};

/** Học viên của lớp tại một ngày (class_roster) — không có số tiền */
export type RosterRow = {
  student_id: string;
  student_code: string;
  student_name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  enrollment_status: EnrollmentRow["status"] | null;
  status: AttendanceStatus | null;
  note: string | null;
  /** Lớp theo khóa: tổng số buổi các khóa, đã trừ, còn lại */
  sessions: number | null;
  used: number | null;
  remaining: number | null;
};

export type RecordAttendanceResult = { ok: boolean; session_id: string | null; saved: number; removed: number };

/** Ma trận điểm danh tháng (rpt_attendance): học viên × buổi */
export type AttendanceReportRow = {
  student_id: string;
  student_code: string;
  student_name: string;
  enrollment_status: EnrollmentRow["status"] | null;
  remaining: number | null;
  session_id: string | null;
  held_on: DateStr | null;
  topic: string | null;
  status: AttendanceStatus | null;
  note: string | null;
};

/** Số buổi từng khóa (rpt_course_balance) */
export type CourseBalanceRow = {
  enrollment_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  student_id: string;
  student_code: string;
  student_name: string;
  guardian_phone: string | null;
  start_date: DateStr;
  end_date: DateStr | null;
  status: EnrollmentRow["status"];
  sessions: number;
  used: number;
  excused: number;
  remaining: number;
  billed: boolean;
  invoice_number: string | null;
  last_held_on: DateStr | null;
};

/** Học phí chờ phân bổ (rpt_deferred_tuition): số dư 3387 theo phiếu học phí */
export type DeferredTuitionRow = {
  bill_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  student_id: string;
  student_code: string;
  student_name: string;
  billing: "monthly" | "course";
  period_start: DateStr;
  sessions: number | null;
  invoice_number: string;
  amount: Numeric;
  recognized: Numeric;
  balance: Numeric;
};

/** Kết quả phân bổ doanh thu học phí tháng (allocate_tuition_revenue) */
export type AllocationResult = {
  ok: boolean;
  dry_run: boolean;
  month: DateStr;
  count: number;
  total: Numeric;
  voucher_id: string | null;
  number: string | null;
  posted: boolean;
  /** Số phiếu phân bổ cũ của tháng đã được thay */
  replaced: string[];
  /** Số tháng sau đã phân bổ (nên lập lại nếu điểm danh thay đổi) */
  later_months: number;
  items: Array<{
    bill_id: string;
    class_id: string;
    class_code: string;
    class_name: string;
    student_id: string;
    student_code: string;
    student_name: string;
    billing: "monthly" | "course";
    period_start: DateStr;
    invoice_number: string;
    bill_amount: Numeric;
    recognized_before: Numeric;
    amount: Numeric;
    remaining: Numeric;
    sessions: number | null;
    used_in_month: number | null;
    used_through: number | null;
  }>;
};

export type Database = {
  public: {
    Tables: {
      tenants: Table<TenantRow>;
      accounts: Table<AccountRow, Partial<AccountRow> & Pick<AccountRow, "tenant_id" | "code" | "name" | "kind">>;
      partners: Table<PartnerRow, Partial<PartnerRow> & Pick<PartnerRow, "tenant_id" | "code" | "name">>;
      vouchers: Table<VoucherRow>;
      voucher_lines: Table<VoucherLineRow>;
      jobs: Table<JobRow, Partial<JobRow> & Pick<JobRow, "tenant_id" | "code" | "name">>;
      items: Table<ItemRow, Partial<ItemRow> & Pick<ItemRow, "tenant_id" | "code" | "name">>;
      opening_balances: Table<OpeningBalanceRow>;
      warehouses: Table<WarehouseRow, Partial<WarehouseRow> & Pick<WarehouseRow, "tenant_id" | "code" | "name">>;
      stock_openings: Table<StockOpeningRow>;
      student_profiles: Table<StudentProfileRow>;
      classes: Table<ClassInfoRow>;
      enrollments: Table<EnrollmentRow>;
      class_sessions: Table<ClassSessionRow>;
      attendance: Table<AttendanceRow>;
      period_locks: Table<PeriodLockRow>;
    };
    Views: {
      my_tenants: { Row: MyTenantRow; Relationships: [] };
    };
    Functions: {
      create_tenant: {
        Args: { p_slug: string; p_name: string; p_regime?: string; p_tax_code?: string | null; p_start_date?: string | null };
        Returns: string;
      };
      save_voucher: { Args: { p_voucher: Record<string, unknown>; p_post?: boolean }; Returns: string };
      post_voucher: { Args: { p_voucher_id: string }; Returns: number };
      unpost_voucher: { Args: { p_voucher_id: string }; Returns: undefined };
      delete_voucher: { Args: { p_voucher_id: string }; Returns: undefined };
      lock_period: { Args: { p_tenant: string; p_until: string; p_voucher_type?: string }; Returns: undefined };
      list_members: { Args: { p_tenant: string }; Returns: MemberRow[] };
      set_member: { Args: { p_tenant: string; p_email: string; p_role: string }; Returns: string };
      remove_member: { Args: { p_tenant: string; p_user: string }; Returns: undefined };
      set_opening_balances: {
        Args: { p_tenant: string; p_rows: Array<{ account: string; partner_id?: string | null; debit: number; credit: number }> };
        Returns: number;
      };
      import_accounts: { Args: { p_tenant: string; p_rows: unknown[] }; Returns: ImportResult };
      import_partners: { Args: { p_tenant: string; p_rows: unknown[] }; Returns: ImportResult };
      import_items: { Args: { p_tenant: string; p_rows: unknown[] }; Returns: ImportResult };
      rpt_partner_ledger: {
        Args: { p_tenant: string; p_account: string; p_partner: string; p_from: string; p_to: string };
        Returns: PartnerLedgerRow[];
      };
      rpt_partner_balances: { Args: { p_tenant: string; p_account: string; p_from: string; p_to: string }; Returns: PartnerBalanceRow[] };
      open_invoices: {
        Args: { p_tenant: string; p_side: "receivable" | "payable"; p_partner?: string | null; p_as_of?: string | null; p_include_paid?: boolean };
        Returns: OpenInvoiceRow[];
      };
      rpt_aging: { Args: { p_tenant: string; p_side: "receivable" | "payable"; p_as_of: string; p_account?: string | null }; Returns: AgingRow[] };
      import_stock_openings: { Args: { p_tenant: string; p_rows: unknown[] }; Returns: StockOpeningImportResult };
      save_student: { Args: { p_tenant: string; p_student: Record<string, unknown>; p_id?: string | null }; Returns: string };
      save_class: { Args: { p_tenant: string; p_class: Record<string, unknown>; p_id?: string | null }; Returns: string };
      save_enrollment: { Args: { p_tenant: string; p_row: Record<string, unknown>; p_id?: string | null }; Returns: string };
      import_students: { Args: { p_tenant: string; p_rows: unknown[] }; Returns: StudentImportResult };
      generate_tuition: {
        Args: { p_tenant: string; p_month: string; p_class?: string | null; p_date?: string | null; p_post?: boolean; p_dry_run?: boolean };
        Returns: TuitionGenerateResult;
      };
      pay_tuition: { Args: { p_tenant: string; p_bills: string[]; p_method?: "cash" | "bank"; p_date?: string | null }; Returns: PayTuitionResult };
      rpt_tuition_status: {
        Args: { p_tenant: string; p_as_of?: string | null; p_class?: string | null; p_month?: string | null };
        Returns: TuitionStatusRow[];
      };
      my_classes: { Args: { p_tenant: string }; Returns: MyClassRow[] };
      class_roster: { Args: { p_tenant: string; p_class: string; p_date?: string | null }; Returns: RosterRow[] };
      record_attendance: {
        Args: { p_tenant: string; p_class: string; p_date: string; p_rows: Array<{ student_id: string; status: AttendanceStatus | null; note?: string | null }>; p_topic?: string | null };
        Returns: RecordAttendanceResult;
      };
      renew_course: { Args: { p_tenant: string; p_enrollment: string; p_start?: string | null }; Returns: string };
      allocate_tuition_revenue: { Args: { p_tenant: string; p_month: string; p_post?: boolean; p_dry_run?: boolean }; Returns: AllocationResult };
      rpt_course_balance: { Args: { p_tenant: string; p_class?: string | null }; Returns: CourseBalanceRow[] };
      rpt_attendance: { Args: { p_tenant: string; p_class: string; p_month: string }; Returns: AttendanceReportRow[] };
      rpt_deferred_tuition: { Args: { p_tenant: string; p_as_of?: string | null }; Returns: DeferredTuitionRow[] };
      stock_balances: { Args: { p_tenant: string; p_as_of?: string | null; p_warehouse?: string | null }; Returns: StockBalanceRow[] };
      rpt_stock_summary: { Args: { p_tenant: string; p_from: string; p_to: string; p_warehouse?: string | null }; Returns: StockSummaryRow[] };
      rpt_stock_card: {
        Args: { p_tenant: string; p_item: string; p_from: string; p_to: string; p_warehouse?: string | null };
        Returns: StockCardRow[];
      };
      rpt_stock_vs_ledger: { Args: { p_tenant: string; p_to: string }; Returns: StockVsLedgerRow[] };
      rpt_gross_profit: { Args: { p_tenant: string; p_from: string; p_to: string; p_by?: "item" | "customer" }; Returns: GrossProfitRow[] };
      recost_inventory: { Args: { p_tenant: string; p_from?: string | null }; Returns: number };
      set_stock_cost_method: { Args: { p_tenant: string; p_method: "moving" | "monthly" }; Returns: number };
      import_purchase_invoices: {
        Args: { p_tenant: string; p_invoices: PurchaseInvoiceImport[]; p_dry_run?: boolean };
        Returns: EInvoiceImportResult;
      };
      rpt_vat_listing: { Args: { p_tenant: string; p_direction: "out" | "in"; p_from: string; p_to: string }; Returns: VatListingRow[] };
      import_opening_balances: { Args: { p_tenant: string; p_scope: "account" | "partner"; p_rows: unknown[] }; Returns: ImportResult };
      rpt_trial_balance: {
        Args: { p_tenant: string; p_from: string; p_to: string; p_max_level?: number };
        Returns: TrialBalanceRow[];
      };
      rpt_general_journal: { Args: { p_tenant: string; p_from: string; p_to: string }; Returns: JournalRow[] };
      rpt_account_ledger: {
        Args: { p_tenant: string; p_account: string; p_from: string; p_to: string };
        Returns: LedgerRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
