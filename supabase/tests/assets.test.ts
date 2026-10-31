import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createPartner, createTenant, createUser, pool, q } from "./db";

let owner: string;
let viewer: string;
let coach: string;
let outsider: string;
let tenant: string;
let supplier: string;
const id: Record<string, string> = {};

interface RunResult {
  ok: boolean;
  dry_run: boolean;
  count: number;
  total: number;
  number: string | null;
  voucher_id: string | null;
  posted: boolean;
  replaced: string[];
  warnings: string[];
  items: Array<{ code: string; amount: number; fraction: number; days: number | null; accumulated: number; remaining: number; months_left: number }>;
}
interface RegisterRow {
  code: string;
  status: "active" | "suspended" | "done" | "disposed";
  cost: string;
  accumulated: string;
  remaining: string;
  months_used: string;
  months_left: string;
  next_amount: string;
  increase_number: string | null;
  disposal_number: string | null;
  last_month_iso: string | null;
}

const rpc = async <T>(user: string, sql: string, params: unknown[]) => (await q<{ r: T }>(user, `select ${sql} as r`, params))[0]!.r;
const saveAsset = (asset: Record<string, unknown>, assetId: string | null = null, user = owner) =>
  rpc<string>(user, "public.save_asset($1, $2::jsonb, $3)", [tenant, JSON.stringify(asset), assetId]);
const run = (kind: "fixed" | "tool", month: string, opts: { dryRun?: boolean; user?: string } = {}) =>
  rpc<RunResult>(opts.user ?? owner, "public.run_asset_depreciation($1, $2, $3, true, $4)", [tenant, kind, month, opts.dryRun ?? false]);
const register = async (kind: "fixed" | "tool", asOf: string, user = owner) =>
  q<RegisterRow>(user, "select r.*, r.last_month::text as last_month_iso from public.rpt_assets($1, $2, $3) r", [tenant, kind, asOf]);
const row = async (kind: "fixed" | "tool", code: string, asOf: string) => (await register(kind, asOf)).find((r) => r.code === code)!;
const gl = async (voucher: string) =>
  (
    await pool.query<{ account: string; debit: string; credit: string }>(
      "select g.account, g.debit::text as debit, g.credit::text as credit from public.gl_entries g where g.voucher_id = $1 order by g.debit desc, g.credit desc, g.account",
      [voucher],
    )
  ).rows.map((r) => [r.account, Number(r.debit), Number(r.credit)]);
const balance = async (account: string, asOf = "2026-12-31") =>
  Number(
    (
      await pool.query<{ b: string }>(
        "select coalesce(sum(debit - credit), 0)::text as b from public.gl_entries where tenant_id = $1 and account = $2 and posting_date <= $3",
        [tenant, account, asOf],
      )
    ).rows[0]!.b,
  );
const voucherStatus = async (voucherId: string) =>
  (await pool.query<{ status: string }>("select status from public.vouchers where id = $1", [voucherId])).rows[0]?.status ?? null;

/** Cùng công thức với app.asset_charge: tháng cuối lấy hết, còn lại chia đều theo số tháng còn lại */
const charge = (cost: number, months: number, acc: number, used: number, f: number) =>
  cost - acc <= 0 || f <= 0 ? 0 : months - used <= f ? cost - acc : Math.min(cost - acc, Math.round(((cost - acc) * f) / (months - used)));

const MAY_CHIEU = {
  kind: "fixed",
  code: "may-chieu-01",
  name: "Máy chiếu tương tác phòng học 1",
  category: "Máy móc thiết bị",
  department: "Phòng học 1",
  acquired_on: "2026-10-15",
  start_on: "2026-10-15",
  cost: 36_000_000,
  months: 36,
};

const BAN_CO_DT = {
  kind: "fixed",
  code: "BANCO-DT",
  name: "Bộ bàn cờ điện tử DGT",
  start_on: "2025-07-01",
  cost: 24_000_000,
  months: 24,
  opening_accumulated: 12_000_000,
  opening_months: 12,
};

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  coach = await createUser();
  outsider = await createUser();
  tenant = await createTenant(owner, "TT133", "2026-07-01");
  await addMember(tenant, viewer, "viewer");
  await addMember(tenant, coach, "coach");
  supplier = await createPartner(owner, tenant, "NCC01");
});

afterAll(async () => {
  await pool.end();
});

describe("khai báo TSCĐ / CCDC", () => {
  it("ghi tăng TSCĐ: lập phiếu kế toán Nợ 2111 / Có 331 đã ghi sổ, TK mặc định theo TT133", async () => {
    id.A = await saveAsset({ ...MAY_CHIEU, increase: { credit_account: "331", partner_id: supplier } });
    const [a] = await pool.query<{ code: string; asset_account: string; accum_account: string; expense_account: string; increase_voucher_id: string }>(
      "select code, asset_account, accum_account, expense_account, increase_voucher_id from public.assets where id = $1",
      [id.A],
    ).then((r) => r.rows);
    expect(a).toMatchObject({ code: "MAY-CHIEU-01", asset_account: "2111", accum_account: "2141", expense_account: "6422" });
    expect(await gl(a!.increase_voucher_id)).toEqual([
      ["2111", 36_000_000, 0],
      ["331", 0, 36_000_000],
    ]);
    expect((await row("fixed", "MAY-CHIEU-01", "2026-10-31")).increase_number).toMatch(/^PK/);
  });

  it("tài sản dùng từ trước ngày bắt đầu nhập liệu: khai báo hao mòn đầu kỳ, không lập phiếu ghi tăng", async () => {
    id.B = await saveAsset(BAN_CO_DT);
    const b = await row("fixed", "BANCO-DT", "2026-07-01");
    expect(b).toMatchObject({ status: "active", increase_number: null });
    expect(Number(b.accumulated)).toBe(12_000_000);
    expect(Number(b.months_left)).toBe(12);
    expect(Number(b.next_amount)).toBe(1_000_000);

    await expect(
      saveAsset({ kind: "fixed", code: "BANCO-DT2", name: "x", start_on: "2026-08-01", cost: 1_000_000, months: 12, opening_accumulated: 100_000, opening_months: 1 }),
    ).rejects.toThrow("Số đầu kỳ chỉ khai báo cho tài sản bắt đầu sử dụng trước ngày bắt đầu nhập liệu 01/07/2026");
    await expect(
      saveAsset({ kind: "fixed", code: "BANCO-DT3", name: "x", start_on: "2025-01-01", cost: 1_000_000, months: 12, opening_months: 1, increase: { credit_account: "1111" } }),
    ).rejects.toThrow("không lập phiếu ghi tăng");
  });

  it("CCDC: ghi tăng Nợ 242 / Có 1111; không cho ghi tăng bằng Có 153 (theo dõi tồn kho)", async () => {
    id.C = await saveAsset({
      kind: "tool",
      code: "DONGHO-01",
      name: "Đồng hồ cờ DGT 3000 (10 chiếc)",
      quantity: 10,
      uom: "Chiếc",
      start_on: "2026-10-20",
      cost: 3_000_000,
      months: 12,
      increase: { credit_account: "1111" },
    });
    const [c] = (await pool.query<{ asset_account: string; accum_account: string | null; increase_voucher_id: string }>(
      "select asset_account, accum_account, increase_voucher_id from public.assets where id = $1",
      [id.C],
    )).rows;
    expect(c).toMatchObject({ asset_account: "242", accum_account: null });
    expect(await gl(c!.increase_voucher_id)).toEqual([
      ["242", 3_000_000, 0],
      ["1111", 0, 3_000_000],
    ]);
    await expect(
      saveAsset({ kind: "tool", code: "QUANCO", name: "Bộ quân cờ", start_on: "2026-10-01", cost: 900_000, months: 6, increase: { credit_account: "153" } }),
    ).rejects.toThrow("TK 153 theo dõi tồn kho — xuất kho bằng phiếu xuất kho (Nợ 242 / Có 153)");
  });

  it("kiểm tra dữ liệu: TK, trùng mã, số tháng, nhà cung cấp cho TK công nợ, quyền", async () => {
    const base = { kind: "fixed", code: "X1", name: "X", start_on: "2026-10-01", cost: 1_000_000, months: 12 };
    await expect(saveAsset({ ...base, asset_account: "242" })).rejects.toThrow("TK nguyên giá TSCĐ phải là TK chi tiết đầu 211, 212 hoặc 213");
    await expect(saveAsset({ ...base, expense_account: "1111" })).rejects.toThrow("TK chi phí phải là TK chi tiết");
    await expect(saveAsset({ ...base, code: "may-chieu-01" })).rejects.toThrow("Mã TSCĐ MAY-CHIEU-01 đã có");
    await expect(saveAsset({ ...base, months: 0 })).rejects.toThrow("Số tháng khấu hao từ 1 đến 600");
    await expect(saveAsset({ ...base, acquired_on: "2026-10-05", start_on: "2026-10-01" })).rejects.toThrow("không được trước ngày ghi tăng");
    await expect(saveAsset({ ...base, increase: { credit_account: "331" } })).rejects.toThrow("TK 331 theo dõi công nợ — chọn nhà cung cấp");
    await expect(saveAsset(base, null, viewer)).rejects.toThrow("Bạn không có quyền khai báo tài sản");
    expect(await q(outsider, "select * from public.assets where tenant_id = $1", [tenant])).toEqual([]);
    expect(await q(coach, "select * from public.assets where tenant_id = $1", [tenant])).toEqual([]);
    await expect(register("fixed", "2026-10-31", coach)).rejects.toThrow("Bạn không có quyền xem sổ tài sản");
    expect((await register("fixed", "2026-10-31", viewer)).map((r) => r.code)).toEqual(["BANCO-DT", "MAY-CHIEU-01"]);
  });
});

describe("tính khấu hao / phân bổ hằng tháng", () => {
  it("tháng 10: TSCĐ mới tính theo ngày (17/31), TSCĐ cũ tròn tháng; báo tháng 9 chưa tính", async () => {
    const preview = await run("fixed", "2026-10-01", { dryRun: true });
    expect(preview).toMatchObject({ dry_run: true, count: 2, number: null, posted: false });
    expect(preview.warnings).toEqual(["Tháng 09/2026 chưa tính khấu hao — nên tính tháng đó trước"]);
    const byCode = Object.fromEntries(preview.items.map((i) => [i.code, i]));
    expect(byCode["MAY-CHIEU-01"]).toMatchObject({ amount: 548_387, days: 17, fraction: 0.5484 });
    expect(byCode["BANCO-DT"]).toMatchObject({ amount: 1_000_000, fraction: 1, accumulated: 13_000_000, remaining: 11_000_000, months_left: 11 });
    expect(await pool.query("select 1 from public.asset_depreciations where tenant_id = $1", [tenant]).then((r) => r.rowCount)).toBe(0);

    const r = await run("fixed", "2026-10-01");
    expect(r).toMatchObject({ dry_run: false, count: 2, total: 1_548_387, posted: true });
    id.octFixed = r.voucher_id!;
    expect(await gl(r.voucher_id!)).toEqual([
      ["6422", 1_000_000, 0],
      ["6422", 548_387, 0],
      ["2141", 0, 1_000_000],
      ["2141", 0, 548_387],
    ]);
    const [v] = (await pool.query<{ posting_date: string; description: string; source: string }>(
      "select posting_date::text, description, source from public.vouchers where id = $1",
      [r.voucher_id],
    )).rows;
    expect(v).toEqual({ posting_date: "2026-10-31", description: "Khấu hao TSCĐ tháng 10/2026", source: "system" });
  });

  it("tháng 11: phần còn lại chia đều cho số tháng còn lại (35.451.613 / 35,4516 ≈ 1.000.000)", async () => {
    const r = await run("fixed", "2026-11-01");
    const a = r.items.find((i) => i.code === "MAY-CHIEU-01")!;
    expect(a.amount).toBe(charge(36_000_000, 36, 548_387, 0.5484, 1));
    expect(a.amount).toBe(1_000_000);
    expect(r.warnings).toEqual([]);
    const reg = await row("fixed", "MAY-CHIEU-01", "2026-11-30");
    expect(reg).toMatchObject({ status: "active", last_month_iso: "2026-11-01" });
    expect([Number(reg.accumulated), Number(reg.remaining), Number(reg.months_used), Number(reg.months_left)]).toEqual([
      1_548_387, 34_451_613, 1.5484, 34.4516,
    ]);
    // Sổ tại ngày giữa tháng chưa tính phiếu cuối tháng
    expect(Number((await row("fixed", "MAY-CHIEU-01", "2026-11-15")).accumulated)).toBe(548_387);
    expect(await balance("2141")).toBe(-3_548_387);
  });

  it("không tính lại tháng cũ khi đã có tháng sau; xóa tháng gần nhất rồi tính lại thì thay phiếu", async () => {
    await expect(run("fixed", "2026-10-01")).rejects.toThrow("Đã tính khấu hao tháng 11/2026 — xóa các tháng sau");
    await expect(rpc(owner, "public.delete_asset_run($1, 'fixed', '2026-10-01')", [tenant])).rejects.toThrow(
      "Chỉ xóa được tháng tính gần nhất (11/2026)",
    );
    const del = await rpc<{ deleted: string[] }>(owner, "public.delete_asset_run($1, 'fixed', '2026-11-01')", [tenant]);
    expect(del.deleted).toHaveLength(1);
    const oldNumber = (await pool.query<{ number: string }>("select number from public.vouchers where id = $1", [id.octFixed])).rows[0]!.number;
    const redo = await run("fixed", "2026-10-01");
    expect(redo.replaced).toEqual([oldNumber]);
    expect(redo.total).toBe(1_548_387);
    expect(await voucherStatus(id.octFixed!)).toBeNull();
    const nov = await run("fixed", "2026-11-01");
    expect(nov.total).toBe(2_000_000);
    const runs = await q<{ month: string; count: number; total: string }>(owner, "select month::text, count, total::text from public.rpt_asset_runs($1, 'fixed')", [tenant]);
    expect(runs.map((x) => [x.month, x.count, Number(x.total)])).toEqual([
      ["2026-11-01", 2, 2_000_000],
      ["2026-10-01", 2, 1_548_387],
    ]);
  });

  it("CCDC phân bổ tròn tháng: Nợ 6422 / Có 242", async () => {
    const r = await run("tool", "2026-10-01");
    expect(r.items.map((i) => [i.code, i.amount])).toEqual([["DONGHO-01", 250_000]]);
    expect(await gl(r.voucher_id!)).toEqual([
      ["6422", 250_000, 0],
      ["242", 0, 250_000],
    ]);
    const [v] = (await pool.query<{ description: string }>("select description from public.vouchers where id = $1", [r.voucher_id])).rows;
    expect(v!.description).toBe("Phân bổ chi phí CCDC tháng 10/2026");
  });

  it("tạm dừng: tháng tạm dừng không tính, tiếp tục thì chia phần còn lại; sửa số tháng sử dụng", async () => {
    const b = BAN_CO_DT;
    await saveAsset({ ...b, suspended: true }, id.B);
    let dec = await run("fixed", "2026-12-01", { dryRun: true });
    expect(dec.items.map((i) => i.code)).toEqual(["MAY-CHIEU-01"]);
    expect((await row("fixed", "BANCO-DT", "2026-12-31")).status).toBe("suspended");

    await saveAsset({ ...b, suspended: false, months: 30 }, id.B);
    // Đã dùng 14 tháng, còn 10.000.000 → 16 tháng còn lại
    dec = await run("fixed", "2026-12-01", { dryRun: true });
    expect(dec.items.find((i) => i.code === "BANCO-DT")!.amount).toBe(625_000);
    await expect(saveAsset({ ...b, months: 13 }, id.B)).rejects.toThrow("Số tháng sử dụng (13) nhỏ hơn số tháng đã tính (14)");
    await expect(saveAsset({ ...b, cost: 25_000_000 }, id.B)).rejects.toThrow("không sửa được nguyên giá");
    await saveAsset({ ...b, months: 24 }, id.B);
  });

  it("kỳ đã khóa sổ: không tính được", async () => {
    await pool.query("insert into public.period_locks (tenant_id, voucher_type, locked_until) values ($1, '*', '2026-11-30')", [tenant]);
    await expect(run("fixed", "2026-11-01")).rejects.toThrow("Số liệu đã khóa đến ngày 30/11/2026");
    await expect(rpc(owner, "public.delete_asset_run($1, 'fixed', '2026-11-01')", [tenant])).rejects.toThrow("Số liệu đã khóa");
    await pool.query("delete from public.period_locks where tenant_id = $1", [tenant]);
    await expect(run("fixed", "2026-12-01", { user: viewer })).rejects.toThrow("Bạn không có quyền tính khấu hao");
  });
});

describe("ghi giảm, khôi phục, thẻ tài sản", () => {
  it("TSCĐ: khấu hao 9 ngày đầu tháng 12, ghi giảm hao mòn 2141 và giá trị còn lại vào 811", async () => {
    await expect(rpc(owner, "public.dispose_asset($1, $2, '2026-11-20', 'Hỏng')", [tenant, id.A])).rejects.toThrow(
      "đã tính khấu hao tháng 11/2026 — xóa lần tính tháng đó rồi ghi giảm",
    );
    const r = await rpc<{ number: string; voucher_id: string; partial: number; accumulated: number; remaining: number }>(
      owner,
      "public.dispose_asset($1, $2, '2026-12-10', 'Thanh lý do hỏng mạch')",
      [tenant, id.A],
    );
    const partial = charge(36_000_000, 36, 1_548_387, 1.5484, 9 / 31);
    expect(partial).toBe(290_323);
    expect(r).toMatchObject({ partial, accumulated: 1_548_387 + partial, remaining: 36_000_000 - 1_548_387 - partial });
    expect(await gl(r.voucher_id)).toEqual([
      ["811", 34_161_290, 0],
      ["2141", 1_838_710, 0],
      ["6422", 290_323, 0],
      ["2111", 0, 34_161_290],
      ["2111", 0, 1_838_710],
      ["2141", 0, 290_323],
    ]);
    expect(await balance("2111")).toBe(0);
    const reg = await row("fixed", "MAY-CHIEU-01", "2026-12-31");
    expect(reg).toMatchObject({ status: "disposed", disposal_number: r.number });
    expect(Number(reg.next_amount)).toBe(0);
    // Trước ngày ghi giảm vẫn đang dùng
    expect((await row("fixed", "MAY-CHIEU-01", "2026-12-09")).status).toBe("active");

    const dec = await run("fixed", "2026-12-01", { dryRun: true });
    expect(dec.items.map((i) => i.code)).toEqual(["BANCO-DT"]);
    await expect(saveAsset({ ...MAY_CHIEU, name: "Đổi tên" }, id.A)).rejects.toThrow("đã ghi giảm — khôi phục trước khi sửa");
    await expect(rpc(owner, "public.dispose_asset($1, $2, '2026-12-11')", [tenant, id.A])).rejects.toThrow("TSCĐ MAY-CHIEU-01 đã ghi giảm");
  });

  it("thẻ tài sản: từng tháng, lũy kế, phiếu", async () => {
    const card = await q<{ month: string; source: string; amount: string; accumulated: string; remaining: string; posted: boolean }>(
      owner,
      "select month::text, source, amount::text, accumulated::text, remaining::text, posted from public.rpt_asset_card($1, $2)",
      [tenant, id.A],
    );
    expect(card.map((c) => [c.month, c.source, Number(c.amount), Number(c.accumulated), Number(c.remaining), c.posted])).toEqual([
      ["2026-10-01", "run", 548_387, 548_387, 35_451_613, true],
      ["2026-11-01", "run", 1_000_000, 1_548_387, 34_451_613, true],
      ["2026-12-01", "disposal", 290_323, 1_838_710, 34_161_290, true],
    ]);
  });

  it("khôi phục: xóa phiếu ghi giảm, tài sản đang dùng trở lại", async () => {
    const disposal = (await pool.query<{ voucher_id: string }>("select voucher_id from public.asset_disposals where asset_id = $1", [id.A])).rows[0]!;
    await rpc(owner, "public.restore_asset($1, $2)", [tenant, id.A]);
    expect(await voucherStatus(disposal.voucher_id)).toBeNull();
    expect((await row("fixed", "MAY-CHIEU-01", "2026-12-31")).status).toBe("active");
    const dec = await run("fixed", "2026-12-01", { dryRun: true });
    expect(dec.items.map((i) => i.code)).toEqual(["BANCO-DT", "MAY-CHIEU-01"]);
    await expect(rpc(owner, "public.restore_asset($1, $2)", [tenant, id.A])).rejects.toThrow("Tài sản chưa ghi giảm");
  });

  it("CCDC hỏng: phân bổ hết phần còn lại vào chi phí (Nợ 6422 / Có 242)", async () => {
    const r = await rpc<{ voucher_id: string; remaining: number }>(owner, "public.dispose_asset($1, $2, '2026-11-15', 'Hỏng 10 chiếc')", [tenant, id.C]);
    expect(await gl(r.voucher_id)).toEqual([
      ["6422", 2_750_000, 0],
      ["242", 0, 2_750_000],
    ]);
    expect(await balance("242")).toBe(0);
    expect((await run("tool", "2026-11-01", { dryRun: true })).count).toBe(0);
  });

  it("xóa tài sản: chỉ khi chưa tính khấu hao; xóa luôn phiếu ghi tăng", async () => {
    await expect(rpc(owner, "public.delete_asset($1, $2)", [tenant, id.A])).rejects.toThrow("đã tính khấu hao tháng 11/2026");
    const tmp = await saveAsset({ kind: "fixed", code: "MAYTINH-01", name: "Máy tính", start_on: "2026-12-05", cost: 18_000_000, months: 36, increase: { credit_account: "1111" } });
    const inc = (await pool.query<{ increase_voucher_id: string }>("select increase_voucher_id from public.assets where id = $1", [tmp])).rows[0]!;
    // Sửa nguyên giá khi chưa khấu hao: lập lại phiếu ghi tăng
    await saveAsset({ kind: "fixed", code: "MAYTINH-01", name: "Máy tính", start_on: "2026-12-05", cost: 20_000_000, months: 36 }, tmp);
    const inc2 = (await pool.query<{ increase_voucher_id: string }>("select increase_voucher_id from public.assets where id = $1", [tmp])).rows[0]!;
    expect(inc2.increase_voucher_id).not.toBe(inc.increase_voucher_id);
    expect(await voucherStatus(inc.increase_voucher_id)).toBeNull();
    expect(await gl(inc2.increase_voucher_id)).toEqual([
      ["2111", 20_000_000, 0],
      ["1111", 0, 20_000_000],
    ]);
    await rpc(owner, "public.delete_asset($1, $2)", [tenant, tmp]);
    expect(await voucherStatus(inc2.increase_voucher_id)).toBeNull();
  });
});

describe("nhập danh sách từ Excel", () => {
  it("một dòng lỗi thì không nhập dòng nào; hợp lệ thì thêm mới / cập nhật, không lập chứng từ", async () => {
    const rows = [
      { row: 2, code: "BAN-01", name: "Bàn học sinh (20 bộ)", start_on: "2026-07-01", cost: 12_000_000, months: 24, quantity: 20 },
      { row: 3, code: "GHE-01", name: "Ghế học sinh", start_on: "2026-07-01", cost: 0, months: 24 },
    ];
    const bad = await rpc<{ ok: boolean; errors: Array<{ row: number; message: string }> }>(owner, "public.import_assets($1, 'tool', $2::jsonb)", [
      tenant,
      JSON.stringify(rows),
    ]);
    expect(bad).toEqual({ ok: false, errors: [{ row: 3, message: "Giá trị CCDC phải lớn hơn 0" }] });
    expect((await register("tool", "2026-12-31")).map((r) => r.code)).toEqual(["DONGHO-01"]);

    rows[1]!.cost = 6_000_000;
    const ok = await rpc<{ ok: boolean; inserted: number; updated: number }>(owner, "public.import_assets($1, 'tool', $2::jsonb)", [tenant, JSON.stringify(rows)]);
    expect(ok).toEqual({ ok: true, inserted: 2, updated: 0 });
    const again = await rpc<{ ok: boolean; inserted: number; updated: number }>(owner, "public.import_assets($1, 'tool', $2::jsonb)", [
      tenant,
      JSON.stringify([{ ...rows[0], name: "Bàn học sinh gấp gọn (20 bộ)" }]),
    ]);
    expect(again).toEqual({ ok: true, inserted: 0, updated: 1 });
    const reg = await register("tool", "2026-12-31");
    expect(reg.map((r) => [r.code, r.increase_number])).toEqual([
      ["BAN-01", null],
      ["DONGHO-01", expect.stringMatching(/^PK/)],
      ["GHE-01", null],
    ]);
    const dup = await rpc<{ ok: boolean; errors: Array<{ row: number; message: string }> }>(owner, "public.import_assets($1, 'tool', $2::jsonb)", [
      tenant,
      JSON.stringify([rows[0], { ...rows[0], row: 4 }]),
    ]);
    expect(dup.errors).toEqual([{ row: 4, message: "Trùng mã BAN-01 trong tệp" }]);
    await expect(rpc(viewer, "public.import_assets($1, 'tool', '[]'::jsonb)", [tenant])).rejects.toThrow("Bạn không có quyền");
  });
});
