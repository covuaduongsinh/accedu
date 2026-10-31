import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createTenant, createUser, pool, q, saveVoucher } from "./db";

let owner: string;
let viewer: string;
let coach: string;
let tenant: string;

interface CloseResult {
  ok: boolean;
  dry_run: boolean;
  count: number;
  revenue: number;
  expense: number;
  other: number;
  profit: number;
  voucher_id: string | null;
  number: string | null;
  posted: boolean;
  replaced: string[];
  warnings: string[];
  items: Array<{ account: string; kind: string; balance: number | null; debit_account: string; credit_account: string; amount: number }>;
}
interface ChecklistItem {
  key: string;
  status: "done" | "pending" | "na";
  detail: string;
  count: number;
  path: string;
}

const rpc = async <T>(user: string, sql: string, params: unknown[]) => (await q<{ r: T }>(user, `select ${sql} as r`, params))[0]!.r;
const close = (month: string, opts: { dryRun?: boolean; user?: string } = {}) =>
  rpc<CloseResult>(opts.user ?? owner, "public.close_period($1, $2, true, $3)", [tenant, month, opts.dryRun ?? false]);
type ChecklistKey = "drafts" | "tuition" | "coach_pay" | "depreciation" | "tools" | "stock" | "bank" | "closing" | "lock";
const checklist = async (month: string, user = owner) =>
  Object.fromEntries((await rpc<{ items: ChecklistItem[] }>(user, "public.rpt_period_checklist($1, $2)", [tenant, month])).items.map((i) => [i.key, i])) as Record<
    ChecklistKey,
    ChecklistItem
  >;
/** Phiếu kế toán đã ghi sổ: [Nợ, Có, số tiền] */
const pk = (date: string, lines: Array<[string, string, number]>) =>
  saveVoucher(
    owner,
    {
      tenant_id: tenant,
      voucher_type: "PK",
      posting_date: date,
      description: "Nghiệp vụ thử",
      lines: lines.map(([d, c, amount]) => ({ debit_account: d, credit_account: c, amount })),
    },
    true,
  );
const balance = async (account: string, asOf: string) =>
  Number(
    (
      await pool.query<{ b: string }>(
        `select (coalesce((select sum(debit - credit) from public.opening_balances where tenant_id = $1 and account = $2), 0)
               + coalesce((select sum(debit - credit) from public.gl_entries where tenant_id = $1 and account = $2 and posting_date <= $3), 0))::text as b`,
        [tenant, account, asOf],
      )
    ).rows[0]!.b,
  );
const pnlLeft = async (asOf: string) =>
  Number((await pool.query<{ n: string }>("select count(*)::text as n from app.closing_balances($1, $2)", [tenant, asOf])).rows[0]!.n);
const voucherExists = async (id: string) => (await pool.query("select 1 from public.vouchers where id = $1", [id])).rowCount === 1;

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  coach = await createUser();
  tenant = await createTenant(owner, "TT99", "2026-01-01");
  await addMember(tenant, viewer, "viewer");
  await addMember(tenant, coach, "coach");
  // Lợi nhuận năm 2025 chưa chuyển sang 4211 (số dư đầu kỳ 4212 dư Có), đối ứng vốn góp
  await pool.query(
    "insert into public.opening_balances (tenant_id, account, debit, credit) values ($1, '1111', 105000000, 0), ($1, '4212', 0, 5000000), ($1, '4111', 0, 100000000)",
    [tenant],
  );
  // Tháng 10: doanh thu học phí, lãi tiền gửi, thu nhập khác, chiết khấu thương mại, giá vốn, chi phí dịch vụ mua ngoài, chi phí khác
  await pk("2026-10-10", [
    ["1111", "5113", 50_000_000],
    ["1111", "515", 200_000],
    ["1111", "711", 1_000_000],
  ]);
  await pk("2026-10-20", [
    ["5211", "1111", 2_000_000],
    ["632", "1111", 20_000_000],
    ["6427", "1111", 8_000_000],
    ["811", "1111", 500_000],
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe("kết chuyển xác định kết quả kinh doanh (911)", () => {
  it("xem trước: doanh thu thuần, chi phí, lãi; không ghi gì", async () => {
    const r = await close("2026-10-01", { dryRun: true });
    expect(r).toMatchObject({ dry_run: true, revenue: 49_200_000, expense: 28_500_000, other: 0, profit: 20_700_000, number: null, warnings: [] });
    expect(r.items.map((i) => [i.account, i.debit_account, i.credit_account, i.amount])).toEqual([
      ["5113", "5113", "911", 50_000_000],
      ["515", "515", "911", 200_000],
      ["5211", "911", "5211", 2_000_000],
      ["632", "911", "632", 20_000_000],
      ["6427", "911", "6427", 8_000_000],
      ["711", "711", "911", 1_000_000],
      ["811", "911", "811", 500_000],
      ["4212", "911", "4212", 20_700_000],
    ]);
    expect(await pnlLeft("2026-10-31")).toBe(7);
  });

  it("kết chuyển: phiếu kế toán cuối tháng, TK doanh thu / chi phí hết số dư, 911 về 0, lãi vào 4212", async () => {
    const r = await close("2026-10-01");
    expect(r).toMatchObject({ posted: true, profit: 20_700_000, replaced: [] });
    const [v] = (await pool.query<{ posting_date: string; description: string; source: string }>(
      "select posting_date::text, description, source from public.vouchers where id = $1",
      [r.voucher_id],
    )).rows;
    expect(v).toEqual({ posting_date: "2026-10-31", description: "Kết chuyển xác định kết quả kinh doanh tháng 10/2026", source: "system" });
    expect(await pnlLeft("2026-10-31")).toBe(0);
    expect(await balance("911", "2026-10-31")).toBe(0);
    expect(await balance("4212", "2026-10-31")).toBe(-25_700_000);
    const c = await checklist("2026-10-01");
    expect(c.closing).toMatchObject({ status: "done", detail: "Đã kết chuyển: lãi 20.700.000 đ" });
  });

  it("tháng lỗ: Nợ 4212 / Có 911; không kết chuyển lại tháng trước khi đã có tháng sau; xóa từ tháng gần nhất", async () => {
    await pk("2026-11-15", [
      ["1111", "5113", 10_000_000],
      ["6427", "1111", 12_000_000],
    ]);
    const nov = await close("2026-11-01");
    expect(nov).toMatchObject({ revenue: 10_000_000, expense: 12_000_000, profit: -2_000_000, warnings: [] });
    expect(nov.items.at(-1)).toMatchObject({ account: "4212", debit_account: "4212", credit_account: "911", amount: 2_000_000 });
    await expect(close("2026-10-01")).rejects.toThrow("Đã kết chuyển tháng 11/2026 — xóa kết chuyển các tháng sau");
    await expect(rpc(owner, "public.delete_period_closing($1, 'pl', '2026-10-01')", [tenant])).rejects.toThrow(
      "Chỉ xóa được kết chuyển tháng gần nhất (11/2026)",
    );
    const del = await rpc<{ number: string }>(owner, "public.delete_period_closing($1, 'pl', '2026-11-01')", [tenant]);
    expect(del.number).toBe(nov.number);
    expect(await voucherExists(nov.voucher_id!)).toBe(false);
  });

  it("chứng từ tháng thay đổi sau khi kết chuyển: việc cuối tháng báo cần kết chuyển lại; kết chuyển lại thay phiếu cũ", async () => {
    const before = await rpc<Array<{ voucher_id: string; number: string }>>(owner, "(select json_agg(x) from public.rpt_period_closings($1) x)", [tenant]);
    const oct = before.find(Boolean)!;
    await pk("2026-10-28", [["6427", "1111", 700_000]]);
    const c = await checklist("2026-10-01");
    expect(c.closing).toMatchObject({ status: "pending", detail: "Số liệu thay đổi sau khi kết chuyển: 1 TK doanh thu / chi phí còn số dư — kết chuyển lại" });
    const r = await close("2026-10-01");
    expect(r).toMatchObject({ profit: 20_000_000, replaced: [oct.number] });
    expect(await voucherExists(oct.voucher_id)).toBe(false);
    expect(await pnlLeft("2026-10-31")).toBe(0);
  });

  it("911 có số dư hạch toán tay và tháng trước chưa kết chuyển: tính hết vào lợi nhuận, có cảnh báo", async () => {
    await pk("2026-12-05", [["1111", "911", 300_000]]);
    await pk("2026-12-10", [["1111", "5113", 4_000_000]]);
    const dec = await close("2026-12-01");
    // Tháng 11 chưa kết chuyển (đã xóa) → kết quả tháng 12 gồm cả tháng 11: 10.000.000 + 4.000.000 − 12.000.000 + 300.000
    expect(dec).toMatchObject({ revenue: 14_000_000, expense: 12_000_000, other: 300_000, profit: 2_300_000 });
    expect(dec.warnings).toEqual([
      "TK 911 có số dư -300.000 trước khi kết chuyển (hạch toán tay) — đã tính vào lợi nhuận",
      "Tháng 11/2026 chưa kết chuyển — kết quả tháng này gồm cả số liệu tháng trước",
    ]);
    expect(await balance("911", "2026-12-31")).toBe(0);
    expect(await pnlLeft("2026-12-31")).toBe(0);
  });

  it("kỳ đã khóa sổ, quyền", async () => {
    await pool.query("insert into public.period_locks (tenant_id, voucher_type, locked_until) values ($1, '*', '2026-10-31')", [tenant]);
    await expect(close("2026-10-01", { dryRun: true })).rejects.toThrow("Số liệu đã khóa đến ngày 31/10/2026");
    const c = await checklist("2026-10-01");
    expect(c.lock).toMatchObject({ status: "done", detail: "Đã khóa đến 31/10/2026" });
    expect((await checklist("2026-12-01")).lock.status).toBe("pending");
    await pool.query("delete from public.period_locks where tenant_id = $1", [tenant]);
    await expect(close("2026-12-01", { dryRun: true, user: viewer })).rejects.toThrow("Bạn không có quyền kết chuyển cuối kỳ");
    expect((await checklist("2026-12-01", viewer)).closing.status).toBe("done");
    await expect(checklist("2026-12-01", coach)).rejects.toThrow("Bạn không có quyền xem việc cuối kỳ");
    expect(await q(coach, "select * from public.period_closings where tenant_id = $1", [tenant])).toEqual([]);
  });
});

describe("chuyển lợi nhuận năm trước (4212 → 4211)", () => {
  it("đầu năm 2026: số dư đầu kỳ 4212 (lãi 2025) sang 4211, phiếu ngày đầu năm; chạy lại thay phiếu cũ", async () => {
    const r = await rpc<{ profit: number; number: string; voucher_id: string; year_start: string; warnings: string[] }>(
      owner,
      "public.carry_forward_profit($1, '2026-03-15')",
      [tenant],
    );
    expect(r).toMatchObject({ profit: 5_000_000, year_start: "2026-01-01", warnings: [] });
    const gl = (await pool.query<{ account: string; debit: string; credit: string; posting_date: string }>(
      "select account, debit::bigint::text as debit, credit::bigint::text as credit, posting_date::text from public.gl_entries where voucher_id = $1 order by debit desc",
      [r.voucher_id],
    )).rows;
    expect(gl).toEqual([
      { account: "4212", debit: "5000000", credit: "0", posting_date: "2026-01-01" },
      { account: "4211", debit: "0", credit: "5000000", posting_date: "2026-01-01" },
    ]);
    const again = await rpc<{ replaced: string[]; profit: number }>(owner, "public.carry_forward_profit($1, '2026-01-01')", [tenant]);
    expect(again).toMatchObject({ replaced: [r.number], profit: 5_000_000 });
    expect(await balance("4211", "2026-01-01")).toBe(-5_000_000);
  });

  it("đầu năm 2027: lợi nhuận cả năm 2026 sang 4211", async () => {
    const profit2026 = -(await balance("4212", "2026-12-31"));
    expect(profit2026).toBe(20_000_000 + 2_300_000);
    const r = await rpc<{ profit: number; warnings: string[] }>(owner, "public.carry_forward_profit($1, '2027-02-01')", [tenant]);
    expect(r).toMatchObject({ profit: profit2026, warnings: [] });
    expect(await balance("4212", "2027-01-01")).toBe(0);
    expect(await balance("4211", "2027-01-01")).toBe(-(5_000_000 + profit2026));
    const hist = await q<{ kind: string; month: string; profit: string }>(owner, "select kind, month::text, profit::text from public.rpt_period_closings($1)", [tenant]);
    expect(hist.map((h) => [h.kind, h.month, Number(h.profit)])).toEqual([
      ["carry", "2027-01-01", profit2026],
      ["pl", "2026-12-01", 2_300_000],
      ["pl", "2026-10-01", 20_000_000],
      ["carry", "2026-01-01", 5_000_000],
    ]);
  });

  it("năm tài chính bắt đầu trước ngày bắt đầu nhập liệu thì báo rõ", async () => {
    const mid = await createTenant(owner, "TT133", "2026-07-01");
    await expect(rpc(owner, "public.carry_forward_profit($1, '2026-08-01')", [mid])).rejects.toThrow(
      "Năm tài chính bắt đầu 01/01/2026 trước ngày bắt đầu nhập liệu 01/07/2026",
    );
  });
});

describe("việc cuối tháng", () => {
  it("chứng từ nháp, TSCĐ cần khấu hao, học phí / lương / kho / ngân hàng không áp dụng", async () => {
    await saveVoucher(owner, { tenant_id: tenant, voucher_type: "PK", posting_date: "2026-12-20", lines: [{ debit_account: "6427", credit_account: "1111", amount: 100_000 }] });
    await rpc(owner, "public.save_asset($1, $2::jsonb)", [
      tenant,
      JSON.stringify({ kind: "fixed", code: "MAYTINH", name: "Máy tính", start_on: "2026-12-01", cost: 24_000_000, months: 24 }),
    ]);
    const c = await checklist("2026-12-01");
    expect(Object.keys(c)).toEqual(["drafts", "tuition", "coach_pay", "depreciation", "tools", "stock", "bank", "closing", "lock"]);
    expect(c.drafts).toMatchObject({ status: "pending", detail: "1 chứng từ chưa ghi sổ (1 PK)", path: "general/journal" });
    expect(c.depreciation).toMatchObject({ status: "pending", detail: "1 TSCĐ cần tính khấu hao", path: "assets/depreciation" });
    expect(c.tools.status).toBe("na");
    expect(c.tuition.status).toBe("na");
    expect(c.coach_pay.status).toBe("na");
    expect(c.stock.status).toBe("na");
    expect(c.bank).toMatchObject({ status: "na", detail: "Chưa nhập sao kê tháng này" });

    await rpc(owner, "public.run_asset_depreciation($1, 'fixed', '2026-12-01')", [tenant]);
    const after = await checklist("2026-12-01");
    expect(after.depreciation).toMatchObject({ status: "done", detail: "Đã tính 1 TSCĐ" });
    // Khấu hao vào chi phí sau khi đã kết chuyển → cần kết chuyển lại
    expect(after.closing.status).toBe("pending");
    const r = await close("2026-12-01");
    expect(r.warnings[0]).toBe("Còn 1 chứng từ chưa ghi sổ trong tháng — ghi sổ rồi kết chuyển lại");
    expect(r.profit).toBe(2_300_000 - 1_000_000);
    expect((await checklist("2026-12-01")).closing.status).toBe("done");
  });
});

describe("số chứng từ đánh lại mỗi năm", () => {
  it("PK0001 năm 2026 và PK0001 năm 2027 cùng tồn tại; trùng số trong cùng năm thì báo lỗi", async () => {
    const t = await createTenant(owner, "TT133", "2026-01-01");
    const save = (date: string, number?: string) =>
      saveVoucher(owner, { tenant_id: t, voucher_type: "PK", posting_date: date, ...(number ? { number } : {}), lines: [{ debit_account: "6422", credit_account: "1111", amount: 1000 }] });
    const a = await save("2026-12-31");
    const b = await save("2027-01-02");
    const numbers = (await pool.query<{ number: string; y: string }>(
      "select number, extract(year from posting_date)::text as y from public.vouchers where id = any($1) order by posting_date",
      [[a, b]],
    )).rows;
    expect(numbers).toEqual([
      { number: "PK0001", y: "2026" },
      { number: "PK0001", y: "2027" },
    ]);
    await expect(save("2027-03-01", "PK0001")).rejects.toThrow(/duplicate key.*vouchers_tenant_id_voucher_type_number_year/);
  });
});
