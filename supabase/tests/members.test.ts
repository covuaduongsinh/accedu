import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createUser, pool, q, saveVoucher } from "./db";

let owner: string;
let accountant: string;
let accountantEmail: string;
let tenant: string;

beforeAll(async () => {
  owner = await createUser();
  accountantEmail = `ketoan-${Date.now()}@duongsinh.test`;
  accountant = await createUser(accountantEmail);
  tenant = await createTenant(owner, "TT133");
});

afterAll(async () => {
  await pool.end();
});

describe("người sử dụng & phân quyền", () => {
  it("chủ sở hữu thêm kế toán theo email; kế toán thấy đơn vị", async () => {
    await q(owner, "select public.set_member($1, $2, 'accountant')", [tenant, accountantEmail.toUpperCase()]);
    const mine = await q<{ role: string }>(accountant, "select role from public.my_tenants where id = $1", [tenant]);
    expect(mine).toEqual([{ role: "accountant" }]);
    const members = await q<{ email: string | null; role: string }>(owner, "select email, role from public.list_members($1)", [tenant]);
    expect(members.map((m) => m.role)).toEqual(["owner", "accountant"]);
    expect(members[1]?.email).toBe(accountantEmail);
  });

  it("kế toán không xem email người khác, không phân quyền được", async () => {
    const members = await q<{ email: string | null }>(accountant, "select email from public.list_members($1)", [tenant]);
    expect(members.filter((m) => m.email !== null)).toEqual([{ email: accountantEmail }]);
    await expect(q(accountant, "select public.set_member($1, $2, 'admin')", [tenant, accountantEmail])).rejects.toThrow(/Chỉ quản trị/);
  });

  it("email chưa đăng ký bị từ chối; không đổi/xóa được chủ sở hữu", async () => {
    await expect(q(owner, "select public.set_member($1, 'khongco@x.vn', 'viewer')", [tenant])).rejects.toThrow(/chưa đăng ký/);
    await expect(q(owner, "select public.remove_member($1, $2)", [tenant, owner])).rejects.toThrow(/chủ sở hữu/);
  });

  it("xóa thành viên làm mất quyền truy cập ngay", async () => {
    await q(owner, "select public.remove_member($1, $2)", [tenant, accountant]);
    const rows = await q(accountant, "select * from public.accounts where tenant_id = $1 limit 1", [tenant]);
    expect(rows).toHaveLength(0);
  });
});

describe("số dư đầu kỳ", () => {
  it("nhập số dư đầu kỳ → CĐPS hiện số dư đầu kỳ và cân", async () => {
    const n = await q<{ n: number }>(owner, "select public.set_opening_balances($1, $2::jsonb) as n", [
      tenant,
      JSON.stringify([
        { account: "1111", debit: 50_000_000 },
        { account: "1121", debit: 150_000_000 },
        { account: "4111", credit: 200_000_000 },
        { account: "3331", debit: 0, credit: 0 },
      ]),
    ]);
    expect(n[0]?.n).toBe(3);
    const tb = await q<{ account_code: string; level: number; opening_debit: string; opening_credit: string; closing_debit: string }>(
      owner,
      "select * from public.rpt_trial_balance($1, '2026-01-01', '2026-01-31')",
      [tenant],
    );
    const l1 = tb.filter((r) => r.level === 1);
    const sum = (k: "opening_debit" | "opening_credit") => l1.reduce((s, r) => s + Number(r[k]), 0);
    expect(sum("opening_debit")).toBe(200_000_000);
    expect(sum("opening_credit")).toBe(200_000_000);
    expect(tb.find((r) => r.account_code === "111")?.closing_debit).toBe("50000000.00");
  });

  it("từ chối tài khoản tổng hợp; số dư đầu kỳ + phát sinh = số dư cuối", async () => {
    await expect(
      q(owner, "select public.set_opening_balances($1, $2::jsonb)", [tenant, JSON.stringify([{ account: "111", debit: 1 }])]),
    ).rejects.toThrow(/không phải tài khoản chi tiết: 111/);
    await saveVoucher(owner, { tenant_id: tenant, voucher_type: "PC", posting_date: "2026-02-03", lines: [{ debit_account: "6422", amount: 2_000_000 }] }, true);
    const rows = await q<{ row_kind: string; balance_debit: string | null }>(
      owner,
      "select row_kind, balance_debit from public.rpt_account_ledger($1, '111', '2026-02-01', '2026-02-28')",
      [tenant],
    );
    expect(rows.find((r) => r.row_kind === "opening")?.balance_debit).toBe("50000000.00");
    expect(rows.find((r) => r.row_kind === "closing")?.balance_debit).toBe("48000000.00");
  });

  it("hồ sơ người dùng tự tạo khi đăng ký", async () => {
    const id = (await pool.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [`hv-${Date.now()}@x.vn`, JSON.stringify({ full_name: "Nguyễn Minh An" })],
    )).rows[0]!.id;
    const p = await pool.query("select full_name from public.profiles where user_id = $1", [id]);
    expect(p.rows[0]).toEqual({ full_name: "Nguyễn Minh An" });
  });
});
