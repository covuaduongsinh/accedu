import type {
  AccountImportRow,
  AccountInput,
  ItemImportRow,
  ItemInput,
  OpeningImportRow,
  PartnerImportRow,
  PartnerInput,
  StockOpeningImportRow,
  VoucherInput,
  WarehouseInput,
} from "@accedu/core";
import type { AccEduClient } from "./client";
import type {
  AccountRow,
  AgingRow,
  EInvoiceImportResult,
  ImportResult,
  InvoicePaymentRow,
  ItemRow,
  JobRow,
  MemberRow,
  OpeningBalanceRow,
  PeriodLockRow,
  JournalRow,
  LedgerRow,
  MyTenantRow,
  OpenInvoiceRow,
  PartnerBalanceRow,
  PartnerLedgerRow,
  PartnerRow,
  PurchaseInvoiceImport,
  StockBalanceRow,
  StockCardRow,
  StockOpeningImportResult,
  StockOpeningRow,
  StockSummaryRow,
  StockVsLedgerRow,
  TenantRow,
  TrialBalanceRow,
  VatListingRow,
  VoucherRow,
  WarehouseRow,
} from "./database.types";
import { toVoucherPayload, type VoucherWithLines } from "./mappers";

/** Ném lỗi nếu Supabase trả về error; khi thành công data luôn có giá trị. */
function unwrap<D>(res: { data: D; error: { message: string } | null }): NonNullable<D> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<D>;
}

/** Như unwrap nhưng cho phép null (maybeSingle: không tìm thấy). */
function unwrapMaybe<D>(res: { data: D; error: { message: string } | null }): D {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Giới hạn một lần nhập (máy chủ cũng chặn) */
export const IMPORT_MAX_ROWS = 5000;

function checkBatch<T>(rows: T[]): T[] {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(`Tối đa ${IMPORT_MAX_ROWS.toLocaleString("vi-VN")} dòng mỗi lần nhập — chia tệp thành nhiều phần`);
  }
  return rows;
}

export const api = {
  async myTenants(db: AccEduClient): Promise<MyTenantRow[]> {
    return unwrap(await db.from("my_tenants").select("*").order("name"));
  },

  async tenantBySlug(db: AccEduClient, slug: string): Promise<TenantRow | null> {
    return unwrapMaybe(await db.from("tenants").select("*").eq("slug", slug.toLowerCase()).maybeSingle());
  },

  async createTenant(db: AccEduClient, args: { slug: string; name: string; regime: "TT99" | "TT133"; taxCode?: string }): Promise<string> {
    return unwrap(
      await db.rpc("create_tenant", {
        p_slug: args.slug,
        p_name: args.name,
        p_regime: args.regime,
        p_tax_code: args.taxCode ?? null,
      }),
    );
  },

  async accounts(db: AccEduClient, tenantId: string): Promise<AccountRow[]> {
    return unwrap(await db.from("accounts").select("*").eq("tenant_id", tenantId).order("code"));
  },

  async saveAccount(db: AccEduClient, tenantId: string, a: AccountInput, id?: string): Promise<AccountRow> {
    const row = {
      tenant_id: tenantId,
      code: a.code,
      name: a.name,
      name_en: a.nameEn ?? null,
      parent_code: a.parentCode ?? null,
      kind: a.kind,
      normal_side: a.normalSide ?? "debit",
      currency: a.currency ?? null,
      track_partner: a.trackPartner ?? false,
      track_item: a.trackItem ?? false,
    };
    return id
      ? unwrap(await db.from("accounts").update(row).eq("id", id).select().single())
      : unwrap(await db.from("accounts").insert(row).select().single());
  },

  async partners(db: AccEduClient, tenantId: string): Promise<PartnerRow[]> {
    return unwrap(await db.from("partners").select("*").eq("tenant_id", tenantId).order("code"));
  },

  async savePartner(db: AccEduClient, tenantId: string, p: PartnerInput, id?: string): Promise<PartnerRow> {
    const row = {
      tenant_id: tenantId,
      code: p.code,
      name: p.name,
      tax_code: p.taxCode || null,
      address: p.address ?? null,
      phone: p.phone ?? null,
      email: p.email || null,
      is_customer: p.isCustomer ?? true,
      is_supplier: p.isSupplier ?? false,
      is_employee: p.isEmployee ?? false,
    };
    return id
      ? unwrap(await db.from("partners").update(row).eq("id", id).select().single())
      : unwrap(await db.from("partners").insert(row).select().single());
  },

  async items(db: AccEduClient, tenantId: string): Promise<ItemRow[]> {
    return unwrap(await db.from("items").select("*").eq("tenant_id", tenantId).order("code"));
  },
  async saveItem(db: AccEduClient, tenantId: string, it: ItemInput, id?: string): Promise<ItemRow> {
    const kind = it.kind ?? "goods";
    const row = {
      tenant_id: tenantId,
      code: it.code,
      name: it.name,
      kind,
      uom: it.uom ?? "Cái",
      vat_code: it.vatCode ?? "10",
      sale_price: it.salePrice ?? null,
      purchase_price: it.purchasePrice ?? null,
      revenue_account: it.revenueAccount || null,
      inventory_account: it.inventoryAccount || null,
      group_code: it.groupCode || null,
      track_inventory: it.trackInventory ?? kind !== "service",
      cogs_account: it.cogsAccount || null,
      default_warehouse_id: it.defaultWarehouseId || null,
    };
    return id
      ? unwrap(await db.from("items").update(row).eq("id", id).select().single())
      : unwrap(await db.from("items").insert(row).select().single());
  },
  async warehouses(db: AccEduClient, tenantId: string): Promise<WarehouseRow[]> {
    return unwrap(await db.from("warehouses").select("*").eq("tenant_id", tenantId).order("code"));
  },
  async saveWarehouse(db: AccEduClient, tenantId: string, w: WarehouseInput, id?: string): Promise<WarehouseRow> {
    const row = { tenant_id: tenantId, code: w.code.trim().toUpperCase(), name: w.name.trim(), address: w.address || null, is_active: w.isActive ?? true };
    return id
      ? unwrap(await db.from("warehouses").update(row).eq("id", id).select().single())
      : unwrap(await db.from("warehouses").insert(row).select().single());
  },
  async stockOpenings(db: AccEduClient, tenantId: string): Promise<StockOpeningRow[]> {
    return unwrap(await db.from("stock_openings").select("*").eq("tenant_id", tenantId));
  },
  /** Thay toàn bộ tồn kho đầu kỳ (từ Excel hoặc lưới) — nguyên khối, lỗi theo dòng */
  async importStockOpenings(db: AccEduClient, tenantId: string, rows: StockOpeningImportRow[]): Promise<StockOpeningImportResult> {
    return unwrap(await db.rpc("import_stock_openings", { p_tenant: tenantId, p_rows: checkBatch(rows) }));
  },
  async stockBalances(db: AccEduClient, tenantId: string, asOf?: string | null, warehouseId?: string | null): Promise<StockBalanceRow[]> {
    return unwrap(await db.rpc("stock_balances", { p_tenant: tenantId, p_as_of: asOf ?? null, p_warehouse: warehouseId ?? null }));
  },
  async stockSummary(db: AccEduClient, tenantId: string, from: string, to: string, warehouseId?: string | null): Promise<StockSummaryRow[]> {
    return unwrap(await db.rpc("rpt_stock_summary", { p_tenant: tenantId, p_from: from, p_to: to, p_warehouse: warehouseId ?? null }));
  },
  async stockCard(db: AccEduClient, tenantId: string, itemId: string, from: string, to: string, warehouseId?: string | null): Promise<StockCardRow[]> {
    return unwrap(await db.rpc("rpt_stock_card", { p_tenant: tenantId, p_item: itemId, p_from: from, p_to: to, p_warehouse: warehouseId ?? null }));
  },
  async stockVsLedger(db: AccEduClient, tenantId: string, to: string): Promise<StockVsLedgerRow[]> {
    return unwrap(await db.rpc("rpt_stock_vs_ledger", { p_tenant: tenantId, p_to: to }));
  },
  /** Tính lại giá vốn hàng xuất từ ngày (bỏ trống: từ ngày bắt đầu) — trả số chứng từ thay đổi */
  async recostInventory(db: AccEduClient, tenantId: string, from?: string | null): Promise<number> {
    return unwrap(await db.rpc("recost_inventory", { p_tenant: tenantId, p_from: from ?? null }));
  },
  async setStockCostMethod(db: AccEduClient, tenantId: string, method: "moving" | "monthly"): Promise<number> {
    return unwrap(await db.rpc("set_stock_cost_method", { p_tenant: tenantId, p_method: method }));
  },
  async importItems(db: AccEduClient, tenantId: string, rows: ItemImportRow[]): Promise<ImportResult> {
    return unwrap(await db.rpc("import_items", { p_tenant: tenantId, p_rows: checkBatch(rows) }));
  },

  async vouchers(
    db: AccEduClient,
    tenantId: string,
    filter: { types?: string[]; from?: string; to?: string; limit?: number } = {},
  ): Promise<VoucherRow[]> {
    let query = db.from("vouchers").select("*").eq("tenant_id", tenantId);
    if (filter.types?.length) query = query.in("voucher_type", filter.types);
    if (filter.from) query = query.gte("posting_date", filter.from);
    if (filter.to) query = query.lte("posting_date", filter.to);
    return unwrap(
      await query
        .order("posting_date", { ascending: false })
        .order("number", { ascending: false })
        .limit(filter.limit ?? 500),
    );
  },

  async voucher(db: AccEduClient, id: string): Promise<VoucherWithLines> {
    return unwrap(await db.from("vouchers").select("*, voucher_lines(*)").eq("id", id).single()) as unknown as VoucherWithLines;
  },

  async saveVoucher(
    db: AccEduClient,
    tenantId: string,
    v: VoucherInput & { id?: string; version?: number },
    opts: { post?: boolean; source?: "web" | "desktop" | "mobile" } = {},
  ): Promise<string> {
    return unwrap(
      await db.rpc("save_voucher", { p_voucher: toVoucherPayload(tenantId, v, opts.source), p_post: opts.post ?? false }),
    );
  },

  async postVoucher(db: AccEduClient, id: string): Promise<number> {
    return unwrap(await db.rpc("post_voucher", { p_voucher_id: id }));
  },
  async unpostVoucher(db: AccEduClient, id: string) {
    unwrap(await db.rpc("unpost_voucher", { p_voucher_id: id }));
  },
  async deleteVoucher(db: AccEduClient, id: string) {
    unwrap(await db.rpc("delete_voucher", { p_voucher_id: id }));
  },

  async updateTenant(
    db: AccEduClient,
    id: string,
    patch: Partial<Pick<TenantRow, "name" | "tax_code" | "address" | "phone" | "email" | "start_date">>,
  ): Promise<TenantRow> {
    return unwrap(await db.from("tenants").update(patch).eq("id", id).select().single());
  },

  async members(db: AccEduClient, tenantId: string): Promise<MemberRow[]> {
    return unwrap(await db.rpc("list_members", { p_tenant: tenantId }));
  },
  async setMember(db: AccEduClient, tenantId: string, email: string, role: string): Promise<string> {
    return unwrap(await db.rpc("set_member", { p_tenant: tenantId, p_email: email, p_role: role }));
  },
  async removeMember(db: AccEduClient, tenantId: string, userId: string) {
    unwrap(await db.rpc("remove_member", { p_tenant: tenantId, p_user: userId }));
  },
  /** Quản trị tạo tài khoản mới với mật khẩu tạm (bắt đổi ở lần đăng nhập đầu); email đã có thì chỉ gán vai trò */
  async createUser(
    db: AccEduClient,
    input: { tenantId: string; email: string; fullName: string; password: string; role: string },
  ): Promise<{ user_id: string; created: boolean }> {
    const { data, error } = await db.functions.invoke<{ user_id: string; created: boolean }>("admin-users", {
      body: { tenant_id: input.tenantId, email: input.email, full_name: input.fullName, password: input.password, role: input.role },
    });
    if (error) {
      // Lỗi HTTP từ function: lấy thông điệp tiếng Việt trong body
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? ((await ctx.json().catch(() => null)) as { message?: string } | null) : null;
      throw new Error(body?.message ?? error.message);
    }
    if (!data) throw new Error("Máy chủ không trả kết quả");
    return data;
  },
  /** Đổi mật khẩu của chính mình: gỡ cờ bắt đổi mật khẩu tạm, đăng xuất các thiết bị khác */
  async changePassword(db: AccEduClient, password: string) {
    const { error } = await db.auth.updateUser({ password, data: { must_change_password: false } });
    if (!error) await db.auth.signOut({ scope: "others" });
    if (error) throw new Error(error.message);
  },

  async openingBalances(db: AccEduClient, tenantId: string): Promise<OpeningBalanceRow[]> {
    return unwrap(await db.from("opening_balances").select("*").eq("tenant_id", tenantId));
  },
  async setOpeningBalances(
    db: AccEduClient,
    tenantId: string,
    rows: Array<{ account: string; partner_id?: string | null; debit: number; credit: number }>,
  ): Promise<number> {
    return unwrap(await db.rpc("set_opening_balances", { p_tenant: tenantId, p_rows: rows }));
  },

  /** Nhập danh mục tài khoản từ Excel — nguyên khối: có lỗi thì không ghi gì, trả lỗi theo số dòng */
  async importAccounts(db: AccEduClient, tenantId: string, rows: AccountImportRow[]): Promise<ImportResult> {
    return unwrap(await db.rpc("import_accounts", { p_tenant: tenantId, p_rows: checkBatch(rows) }));
  },
  async importPartners(db: AccEduClient, tenantId: string, rows: PartnerImportRow[]): Promise<ImportResult> {
    return unwrap(await db.rpc("import_partners", { p_tenant: tenantId, p_rows: checkBatch(rows) }));
  },
  /** Thay toàn bộ số dư cấp tài khoản ('account') hoặc số dư công nợ theo đối tượng ('partner') */
  async importOpeningBalances(db: AccEduClient, tenantId: string, scope: "account" | "partner", rows: OpeningImportRow[]): Promise<ImportResult> {
    return unwrap(await db.rpc("import_opening_balances", { p_tenant: tenantId, p_scope: scope, p_rows: checkBatch(rows) }));
  },

  async periodLocks(db: AccEduClient, tenantId: string): Promise<PeriodLockRow[]> {
    return unwrap(await db.from("period_locks").select("*").eq("tenant_id", tenantId));
  },
  async lockPeriod(db: AccEduClient, tenantId: string, until: string, voucherType = "*") {
    unwrap(await db.rpc("lock_period", { p_tenant: tenantId, p_until: until, p_voucher_type: voucherType }));
  },

  async jobs(db: AccEduClient, tenantId: string): Promise<JobRow[]> {
    return unwrap(await db.from("jobs").select("*").eq("tenant_id", tenantId).order("code"));
  },
  async saveJob(db: AccEduClient, tenantId: string, j: Omit<Partial<JobRow>, "id" | "tenant_id"> & { code: string; name: string }, id?: string): Promise<JobRow> {
    const row = { ...j, tenant_id: tenantId };
    return id
      ? unwrap(await db.from("jobs").update(row).eq("id", id).select().single())
      : unwrap(await db.from("jobs").insert(row).select().single());
  },

  async trialBalance(db: AccEduClient, tenantId: string, from: string, to: string, maxLevel = 9): Promise<TrialBalanceRow[]> {
    return unwrap(await db.rpc("rpt_trial_balance", { p_tenant: tenantId, p_from: from, p_to: to, p_max_level: maxLevel }));
  },
  async generalJournal(db: AccEduClient, tenantId: string, from: string, to: string): Promise<JournalRow[]> {
    return unwrap(await db.rpc("rpt_general_journal", { p_tenant: tenantId, p_from: from, p_to: to }));
  },
  async partnerLedger(db: AccEduClient, tenantId: string, account: string, partnerId: string, from: string, to: string): Promise<PartnerLedgerRow[]> {
    return unwrap(
      await db.rpc("rpt_partner_ledger", { p_tenant: tenantId, p_account: account, p_partner: partnerId, p_from: from, p_to: to }),
    );
  },
  async partnerBalances(db: AccEduClient, tenantId: string, account: string, from: string, to: string): Promise<PartnerBalanceRow[]> {
    return unwrap(await db.rpc("rpt_partner_balances", { p_tenant: tenantId, p_account: account, p_from: from, p_to: to }));
  },
  /**
   * Nhập hóa đơn điện tử đầu vào thành hóa đơn mua nháp (nguyên khối: có lỗi thì không ghi gì).
   * dryRun: chỉ kiểm tra, trả trạng thái từng hóa đơn (mới / đã có / lỗi) để xem trước.
   */
  async importPurchaseInvoices(db: AccEduClient, tenantId: string, invoices: PurchaseInvoiceImport[], opts: { dryRun?: boolean } = {}): Promise<EInvoiceImportResult> {
    if (invoices.length > 500) throw new Error("Tối đa 500 hóa đơn mỗi lần nhập");
    return unwrap(await db.rpc("import_purchase_invoices", { p_tenant: tenantId, p_invoices: invoices, p_dry_run: opts.dryRun ?? false }));
  },
  /** Hóa đơn đã ghi sổ còn nợ; includePaid: cả hóa đơn đã trả đủ */
  async openInvoices(
    db: AccEduClient,
    tenantId: string,
    side: "receivable" | "payable",
    opts: { partnerId?: string | null; asOf?: string | null; includePaid?: boolean } = {},
  ): Promise<OpenInvoiceRow[]> {
    return unwrap(
      await db.rpc("open_invoices", {
        p_tenant: tenantId,
        p_side: side,
        p_partner: opts.partnerId ?? null,
        p_as_of: opts.asOf ?? null,
        p_include_paid: opts.includePaid ?? false,
      }),
    );
  },
  async aging(db: AccEduClient, tenantId: string, side: "receivable" | "payable", asOf: string, account?: string): Promise<AgingRow[]> {
    return unwrap(await db.rpc("rpt_aging", { p_tenant: tenantId, p_side: side, p_as_of: asOf, p_account: account || null }));
  },
  async vatListing(db: AccEduClient, tenantId: string, direction: "out" | "in", from: string, to: string): Promise<VatListingRow[]> {
    return unwrap(await db.rpc("rpt_vat_listing", { p_tenant: tenantId, p_direction: direction, p_from: from, p_to: to }));
  },
  /** Các dòng phiếu thu/chi (mọi trạng thái) đã chọn trừ vào hóa đơn */
  async invoicePayments(db: AccEduClient, invoiceId: string): Promise<InvoicePaymentRow[]> {
    const rows = unwrap(
      await db.from("voucher_lines").select("voucher_id, line_no, amount, vouchers(number, posting_date, status, voucher_type)").eq("invoice_id", invoiceId),
    ) as unknown as InvoicePaymentRow[];
    return rows.toSorted((a, b) => (a.vouchers?.posting_date ?? "").localeCompare(b.vouchers?.posting_date ?? "") || a.line_no - b.line_no);
  },
  async accountLedger(db: AccEduClient, tenantId: string, account: string, from: string, to: string): Promise<LedgerRow[]> {
    return unwrap(await db.rpc("rpt_account_ledger", { p_tenant: tenantId, p_account: account, p_from: from, p_to: to }));
  },
};

/** Khóa cache TanStack Query — dùng chung web & mobile */
export const qk = {
  tenants: () => ["tenants"] as const,
  tenant: (slug: string) => ["tenant", slug] as const,
  accounts: (tenantId: string) => ["accounts", tenantId] as const,
  partners: (tenantId: string) => ["partners", tenantId] as const,
  vouchers: (tenantId: string, types?: readonly string[]) => ["vouchers", tenantId, ...(types ?? [])] as const,
  voucher: (id: string) => ["voucher", id] as const,
  members: (tenantId: string) => ["members", tenantId] as const,
  opening: (tenantId: string) => ["opening", tenantId] as const,
  locks: (tenantId: string) => ["locks", tenantId] as const,
  jobs: (tenantId: string) => ["jobs", tenantId] as const,
  items: (tenantId: string) => ["items", tenantId] as const,
  warehouses: (tenantId: string) => ["warehouses", tenantId] as const,
  stockOpenings: (tenantId: string) => ["stock-openings", tenantId] as const,
  report: (tenantId: string, name: string, ...args: string[]) => ["report", tenantId, name, ...args] as const,
};
