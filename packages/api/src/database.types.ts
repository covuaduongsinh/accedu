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
  costing_method: string;
  vat_method: string;
  fiscal_year_start_month: number;
  start_date: DateStr;
  settings: Record<string, unknown>;
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
  role: "owner" | "admin" | "chief_accountant" | "accountant" | "cashier" | "viewer";
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

export type Database = {
  public: {
    Tables: {
      tenants: Table<TenantRow>;
      accounts: Table<AccountRow, Partial<AccountRow> & Pick<AccountRow, "tenant_id" | "code" | "name" | "kind">>;
      partners: Table<PartnerRow, Partial<PartnerRow> & Pick<PartnerRow, "tenant_id" | "code" | "name">>;
      vouchers: Table<VoucherRow>;
      voucher_lines: Table<VoucherLineRow>;
      jobs: Table<JobRow, Partial<JobRow> & Pick<JobRow, "tenant_id" | "code" | "name">>;
      opening_balances: Table<OpeningBalanceRow>;
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
