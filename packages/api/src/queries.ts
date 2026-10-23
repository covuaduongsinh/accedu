import type { AccountInput, PartnerInput, VoucherInput } from "@accedu/core";
import type { AccEduClient } from "./client";
import type {
  AccountRow,
  JobRow,
  MemberRow,
  OpeningBalanceRow,
  PeriodLockRow,
  JournalRow,
  LedgerRow,
  MyTenantRow,
  PartnerRow,
  TenantRow,
  TrialBalanceRow,
  VoucherRow,
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
  report: (tenantId: string, name: string, ...args: string[]) => ["report", tenantId, name, ...args] as const,
};
