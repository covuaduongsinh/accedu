import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createTenant, createUser, pool, q, saveVoucher } from "./db";

interface ImportResult {
  ok: boolean;
  errors?: Array<{ row: number; message: string }>;
  inserted?: number;
  updated?: number;
  unchanged?: number;
  skipped?: number;
  debit?: number;
  credit?: number;
}

let owner: string;
let viewer: string;
let outsider: string;
let tenant: string;

const call = async (user: string, fn: string, ...args: unknown[]): Promise<ImportResult> => {
  const params = args.map((_, i) => `$${i + 2}`);
  const casts = args.map((a, i) => (typeof a === "string" ? params[i] : `${params[i]}::jsonb`));
  const [row] = await q<{ r: ImportResult }>(user, `select public.${fn}($1, ${casts.join(", ")}) as r`, [
    tenant,
    ...args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))),
  ]);
  return row!.r;
};

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  outsider = await createUser();
  tenant = await createTenant(owner, "TT99");
  await addMember(tenant, viewer, "viewer");
  await createTenant(outsider, "TT99");
});

afterAll(async () => {
  await pool.end();
});

describe("nhập danh mục tài khoản", () => {
  it("một dòng lỗi thì không ghi gì; trả lỗi theo số dòng", async () => {
    const r = await call(owner, "import_accounts", [
      { row: 2, code: "11218", name: "Hợp", parent_code: "1121", kind: "asset", normal_side: "debit" },
      { row: 3, code: "11A", name: "Sai" },
      { row: 4, code: "11219", name: "", parent_code: "1121", kind: "asset" },
      { row: 5, code: "99991", name: "Mẹ chưa có", parent_code: "9999", kind: "result" },
      { row: 6, code: "11218", name: "Lặp", parent_code: "1121", kind: "asset" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      { row: 3, message: "Số hiệu tài khoản chỉ gồm chữ số (3–16 ký tự)" },
      { row: 4, message: "Thiếu tên tài khoản" },
      { row: 5, message: "Chưa có tài khoản mẹ 9999" },
      { row: 6, message: "Trùng số hiệu 11218 trong tệp" },
    ]);
    const rows = await q(owner, "select 1 from public.accounts where tenant_id = $1 and code = '11218'", [tenant]);
    expect(rows).toHaveLength(0);
  });

  it("thứ tự lộn xộn vẫn dựng đúng cây, cập nhật bậc & cờ chi tiết; nhập lại là cập nhật", async () => {
    const rows = [
      { row: 2, code: "112111", name: "TGNH mẫu A — phụ", parent_code: "11211", kind: "asset", normal_side: "debit" },
      { row: 3, code: "11211", name: "TGNH mẫu A", parent_code: "1121", kind: "asset", normal_side: "debit" },
      { row: 4, code: "13111", name: "Phải thu học phí", parent_code: "131", kind: "asset", normal_side: "both", track_partner: true },
      { row: 5, code: "1121", name: "Tiền gửi VND" },
    ];
    expect(await call(owner, "import_accounts", rows)).toEqual({ ok: true, inserted: 3, updated: 1, unchanged: 0 });
    const tree = await q<{ code: string; level: number; is_postable: boolean; parent_code: string | null }>(
      owner,
      "select code, level, is_postable, parent_code from public.accounts where tenant_id = $1 and code in ('1121','11211','112111','131','13111') order by code",
      [tenant],
    );
    expect(tree).toEqual([
      { code: "1121", level: 2, is_postable: false, parent_code: "112" },
      { code: "11211", level: 3, is_postable: false, parent_code: "1121" },
      { code: "112111", level: 4, is_postable: true, parent_code: "11211" },
      { code: "131", level: 1, is_postable: false, parent_code: null },
      { code: "13111", level: 2, is_postable: true, parent_code: "131" },
    ]);
    expect(await call(owner, "import_accounts", rows)).toEqual({ ok: true, inserted: 0, updated: 0, unchanged: 4 });
    const [name] = await q<{ name: string }>(owner, "select name from public.accounts where tenant_id = $1 and code = '1121'", [tenant]);
    expect(name?.name).toBe("Tiền gửi VND");
  });

  it("không thêm tài khoản con dưới tài khoản đã có số liệu", async () => {
    await q(owner, "select public.set_opening_balances($1, $2::jsonb)", [tenant, JSON.stringify([{ account: "1111", debit: 1_000 }, { account: "4118", credit: 1_000 }])]);
    const r = await call(owner, "import_accounts", [{ row: 2, code: "11111", name: "Quỹ phụ", parent_code: "1111", kind: "asset" }]);
    expect(r.errors).toEqual([{ row: 2, message: "Tài khoản mẹ 1111 đã có số liệu — không thêm tài khoản con được" }]);
  });

  it("chỉ người có quyền danh mục của chính đơn vị được nhập", async () => {
    await expect(call(viewer, "import_accounts", [])).rejects.toThrow(/không có quyền sửa danh mục/);
    await expect(call(outsider, "import_accounts", [])).rejects.toThrow(/không có quyền sửa danh mục/);
    await expect(call(owner, "import_accounts", { code: "1" })).rejects.toThrow(/danh sách dòng/);
  });
});

describe("nhập đối tượng", () => {
  it("thêm mới, cập nhật không phân biệt hoa thường, giữ nguyên cột không có trong tệp", async () => {
    await q(owner, "insert into public.partners (tenant_id, code, name, phone) values ($1, 'HV0001', 'Học viên cũ', '0900000009')", [tenant]);
    const r = await call(owner, "import_partners", [
      { row: 2, code: "hv0001", name: "Học viên Mẫu Một", is_student: true },
      { row: 3, code: "NCC001", name: "Công ty Sách Mẫu", tax_code: "0100000000", is_customer: false, is_supplier: true },
    ]);
    expect(r).toEqual({ ok: true, inserted: 1, updated: 1, unchanged: 0 });
    const rows = await q<{ code: string; name: string; phone: string | null; is_student: boolean; is_supplier: boolean; is_customer: boolean }>(
      owner,
      "select code, name, phone, is_student, is_supplier, is_customer from public.partners where tenant_id = $1 order by code",
      [tenant],
    );
    expect(rows).toEqual([
      { code: "HV0001", name: "Học viên Mẫu Một", phone: "0900000009", is_student: true, is_supplier: false, is_customer: true },
      { code: "NCC001", name: "Công ty Sách Mẫu", phone: null, is_student: false, is_supplier: true, is_customer: false },
    ]);
  });

  it("báo lỗi MST, email, mã trùng; không ghi gì", async () => {
    const r = await call(owner, "import_partners", [
      { row: 2, code: "KH1", name: "A", tax_code: "123" },
      { row: 3, code: "KH2", name: "B", email: "khong-hop-le" },
      { row: 4, code: "kh2", name: "C" },
      { row: 5, code: "KH3" },
    ]);
    expect(r.errors?.map((e) => e.row)).toEqual([2, 3, 4, 5]);
    expect(r.errors?.[0]?.message).toMatch(/Mã số thuế/);
    expect(await q(owner, "select 1 from public.partners where tenant_id = $1 and code = 'KH1'", [tenant])).toHaveLength(0);
  });
});

describe("nhập số dư đầu kỳ", () => {
  it("số dư tài khoản & số dư công nợ không ghi đè nhau; CĐPS cân", async () => {
    const acc = await call(owner, "import_opening_balances", "account", [
      { row: 2, account: "1111", debit: 50_000_000, credit: 0 },
      { row: 3, account: "111", debit: 50_000_000, credit: 0 },
      { row: 4, account: "13111", debit: 3_000_000, credit: 0 },
      { row: 5, account: "4118", debit: 0, credit: 41_000_000 },
      { row: 6, account: "3331", debit: 0, credit: 0 },
    ]);
    expect(acc).toEqual({ ok: true, inserted: 2, skipped: 3, debit: 50_000_000, credit: 41_000_000 });

    const partner = await call(owner, "import_opening_balances", "partner", [
      { row: 2, account: "13111", partner_code: "hv0001", debit: 3_000_000, credit: 0 },
      { row: 3, account: "331", partner_code: "NCC001", debit: 0, credit: 12_000_000 },
    ]);
    expect(partner).toEqual({ ok: true, inserted: 2, skipped: 0, debit: 3_000_000, credit: 12_000_000 });

    const tb = await q<{ level: number; opening_debit: string; opening_credit: string }>(
      owner,
      "select level, opening_debit, opening_credit from public.rpt_trial_balance($1, '2026-01-01', '2026-01-31')",
      [tenant],
    );
    const sum = (k: "opening_debit" | "opening_credit") => tb.filter((r) => r.level === 1).reduce((s, r) => s + Number(r[k]), 0);
    expect(sum("opening_debit")).toBe(53_000_000);
    expect(sum("opening_credit")).toBe(53_000_000);

    // Lưu lại lưới số dư tài khoản không làm mất số dư công nợ
    await q(owner, "select public.set_opening_balances($1, $2::jsonb)", [
      tenant,
      JSON.stringify([
        { account: "1111", debit: 40_000_000 },
        { account: "4118", credit: 31_000_000 },
      ]),
    ]);
    const left = await q<{ n: string }>(owner, "select count(*) as n from public.opening_balances where tenant_id = $1 and partner_id is not null", [tenant]);
    expect(left[0]?.n).toBe("2");
  });

  it("lỗi: TK không theo dõi công nợ, đối tượng chưa có, trùng, số âm", async () => {
    const r = await call(owner, "import_opening_balances", "partner", [
      { row: 2, account: "1111", partner_code: "HV0001", debit: 1, credit: 0 },
      { row: 3, account: "13111", partner_code: "KHONGCO", debit: 1, credit: 0 },
      { row: 4, account: "331", partner_code: "NCC001", debit: 0, credit: 1 },
      { row: 5, account: "331", partner_code: "ncc001", debit: 0, credit: 1 },
      { row: 6, account: "331", partner_code: "HV0001", debit: -1, credit: 0 },
      { row: 7, account: "9999", partner_code: "HV0001", debit: 1, credit: 0 },
    ]);
    expect(r.errors).toEqual([
      { row: 2, message: "Tài khoản 1111 không theo dõi công nợ — nhập ở mẫu Số dư tài khoản" },
      { row: 3, message: "Chưa có đối tượng KHONGCO — nhập danh mục đối tượng trước" },
      { row: 5, message: "Trùng tài khoản + đối tượng trong tệp" },
      { row: 6, message: "Số tiền không hợp lệ (phải là số không âm)" },
      { row: 7, message: "Chưa có tài khoản 9999 — nhập danh mục tài khoản trước" },
    ]);
  });

  it("set_opening_balances từ chối TK theo dõi công nợ; viewer không nhập được; kỳ khóa thì chặn", async () => {
    await expect(
      q(owner, "select public.set_opening_balances($1, $2::jsonb)", [tenant, JSON.stringify([{ account: "331", credit: 1 }])]),
    ).rejects.toThrow(/theo dõi công nợ.*331/);
    await expect(call(viewer, "import_opening_balances", "account", [])).rejects.toThrow(/không có quyền nhập số dư/);
    await q(owner, "select public.lock_period($1, '2026-01-31', '*')", [tenant]);
    await expect(call(owner, "import_opening_balances", "account", [])).rejects.toThrow(/đã khóa/);
  });

  it("đổi loại tài khoản đã phát sinh bị chặn", async () => {
    const t2 = await createTenant(owner, "TT99");
    await saveVoucher(owner, { tenant_id: t2, voucher_type: "PC", posting_date: "2026-02-03", lines: [{ debit_account: "6422", amount: 1_000 }] }, true);
    const [row] = await q<{ r: ImportResult }>(owner, "select public.import_accounts($1, $2::jsonb) as r", [
      t2,
      JSON.stringify([{ row: 2, code: "6422", name: "Chi phí QLDN", kind: "asset" }]),
    ]);
    expect(row?.r.errors).toEqual([{ row: 2, message: "Tài khoản 6422 đã có số liệu — không đổi loại tài khoản" }]);
  });
});
