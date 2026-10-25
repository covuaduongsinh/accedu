import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createPartner, createTenant, createUser, pool, q } from "./db";

let owner: string;
let viewer: string;
let outsider: string;

interface Ctx {
  tenant: string;
  supplier: string;
  kho: string;
}

const warehouse = async (tenant: string, code = "KHO") =>
  (await pool.query<{ id: string }>("select id from public.warehouses where tenant_id = $1 and code = $2", [tenant, code])).rows[0]!.id;

async function setup(regime: "TT99" | "TT133" = "TT99"): Promise<Ctx> {
  const tenant = await createTenant(owner, regime);
  const supplier = await createPartner(owner, tenant, "NCC01");
  return { tenant, supplier, kho: await warehouse(tenant) };
}

const item = async (c: Ctx, code: string, uom = "Cuốn", kind = "book") => {
  const [r] = await q<{ id: string }>(owner, "insert into public.items (tenant_id, code, name, uom, kind) values ($1, $2, $3, $4, $5) returning id", [
    c.tenant,
    code,
    `Mặt hàng ${code}`,
    uom,
    kind,
  ]);
  return r!.id;
};

const save = async (c: Ctx, v: Record<string, unknown>, post = true, user = owner) => {
  const [row] = await q<{ id: string }>(user, "select public.save_voucher($1::jsonb, $2) as id", [JSON.stringify({ tenant_id: c.tenant, ...v }), post]);
  return row!.id;
};

/** Phiếu nhập kho: Nợ 1561 (dòng) / Có 331 (phần đầu) */
const receipt = (c: Ctx, date: string, itemId: string, qty: number, price: number, wh = c.kho) =>
  save(c, {
    voucher_type: "PNK",
    posting_date: date,
    partner_id: c.supplier,
    description: "Nhập sách",
    lines: [{ debit_account: "1561", item_id: itemId, warehouse_id: wh, quantity: qty, unit_price: price, amount: qty * price }],
  });

/** Phiếu xuất kho: Nợ 632 (phần đầu) / Có 1561 (dòng) — số tiền do AccEdu tính */
const issue = (c: Ctx, date: string, itemId: string, qty: number, wh = c.kho, post = true) =>
  save(c, { voucher_type: "PXK", posting_date: date, description: "Xuất sách", lines: [{ credit_account: "1561", item_id: itemId, warehouse_id: wh, quantity: qty, amount: 0 }] }, post);

const lineAmount = async (voucherId: string) =>
  Number((await pool.query<{ amount: string }>("select amount from public.voucher_lines where voucher_id = $1 order by line_no limit 1", [voucherId])).rows[0]!.amount);

const gl = async (voucherId: string) =>
  (
    await pool.query<{ account: string; debit: string; credit: string }>(
      "select account, sum(debit)::text as debit, sum(credit)::text as credit from public.gl_entries where voucher_id = $1 group by account order by account",
      [voucherId],
    )
  ).rows;

const balance = async (c: Ctx, itemId: string, wh = c.kho) => {
  const [r] = await q<{ quantity: string; amount: string }>(owner, "select quantity, amount from public.stock_balances($1) where item_id = $2 and warehouse_id = $3", [
    c.tenant,
    itemId,
    wh,
  ]);
  return r ? { quantity: Number(r.quantity), amount: Number(r.amount) } : { quantity: 0, amount: 0 };
};

const openings = (c: Ctx, rows: unknown[]) =>
  q<{ r: { ok: boolean; inserted?: number; errors?: { row: number; message: string }[] } }>(owner, "select public.import_stock_openings($1, $2::jsonb) as r", [
    c.tenant,
    JSON.stringify(rows),
  ]).then((x) => x[0]!.r);

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  outsider = await createUser();
});

afterAll(async () => {
  await pool.end();
});

describe("tồn kho đầu kỳ, nhập – xuất theo bình quân di động", () => {
  let c: Ctx;
  let sach: string;
  let px1: string;
  let pn2: string;
  let px2: string;

  beforeAll(async () => {
    c = await setup();
    await addMember(c.tenant, viewer, "viewer");
    sach = await item(c, "SACH");
    const hocphi = await item(c, "HOCPHI", "Tháng", "service");
    await pool.query("update public.items set track_inventory = false where id = $1", [hocphi]);
  });

  it("mỗi đơn vị có sẵn Kho chính; nhập tồn đầu kỳ, báo lỗi theo dòng", async () => {
    expect(c.kho).toBeTruthy();
    const bad = await openings(c, [
      { row: 2, warehouse_code: "KHO", item_code: "KHONGCO", quantity: 1, amount: 1 },
      { row: 3, warehouse_code: "KHO", item_code: "HOCPHI", quantity: 1, amount: 1 },
      { row: 4, warehouse_code: "KHO9", item_code: "SACH", quantity: 1, amount: 1 },
      { row: 5, warehouse_code: "KHO", item_code: "SACH", quantity: -1, amount: 1 },
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.errors?.map((e) => e.message)).toEqual([
      "Chưa có mã hàng KHONGCO — nhập danh mục hàng hóa trước",
      "Mặt hàng HOCPHI không theo dõi tồn kho",
      "Chưa có kho KHO9",
      "Số lượng, giá trị phải là số không âm",
    ]);
    expect(await openings(c, [{ row: 2, warehouse_code: "kho", item_code: "sach", quantity: 10, amount: 800_000 }])).toMatchObject({ ok: true, inserted: 1 });
    expect(await balance(c, sach)).toEqual({ quantity: 10, amount: 800_000 });
  });

  it("phiếu nhập rồi phiếu xuất: giá vốn bình quân, bút toán Nợ 632 / Có 1561", async () => {
    await receipt(c, "2026-03-10", sach, 10, 90_000);
    px1 = await issue(c, "2026-03-15", sach, 5);
    expect(await lineAmount(px1)).toBe(425_000);
    expect(await gl(px1)).toEqual([
      { account: "1561", debit: "0.00", credit: "425000.00" },
      { account: "632", debit: "425000.00", credit: "0.00" },
    ]);
    const [v] = await q<{ total_amount: string }>(owner, "select total_amount from public.vouchers where id = $1", [px1]);
    expect(v?.total_amount).toBe("425000.00");
    expect(await balance(c, sach)).toEqual({ quantity: 15, amount: 1_275_000 });
  });

  it("nhập lùi ngày: phiếu xuất sau đó tự tính lại giá và dựng lại bút toán", async () => {
    pn2 = await receipt(c, "2026-03-12", sach, 10, 100_000);
    // Trước ngày 15/03: 30 cuốn, 2.700.000 → 90.000/cuốn
    expect(await lineAmount(px1)).toBe(450_000);
    expect((await gl(px1)).find((r) => r.account === "632")?.debit).toBe("450000.00");
    expect(await balance(c, sach)).toEqual({ quantity: 25, amount: 2_250_000 });
  });

  it("chặn xuất quá số tồn (tại ngày xuất)", async () => {
    await expect(issue(c, "2026-03-20", sach, 100)).rejects.toThrow("Không đủ tồn: SACH tại kho KHO còn 25 Cuốn, phiếu này xuất 100");
    // Ngày 11/03 mới có 20 cuốn
    await expect(issue(c, "2026-03-11", sach, 21)).rejects.toThrow("Không đủ tồn: SACH tại kho KHO còn 20 Cuốn, phiếu này xuất 21");
  });

  it("không bỏ ghi sổ được phiếu nhập đã bị xuất; bỏ phiếu xuất trước thì được, giá tính lại", async () => {
    px2 = await issue(c, "2026-03-16", sach, 20);
    await expect(q(owner, "select public.unpost_voucher($1)", [pn2])).rejects.toThrow(
      /Không bỏ ghi sổ được: SACH tại kho KHO — phiếu PX\d+ ngày 16\/03\/2026 sẽ bị xuất âm \(thiếu 5 Cuốn\)/,
    );
    await q(owner, "select public.unpost_voucher($1)", [px2]);
    await q(owner, "select public.unpost_voucher($1)", [pn2]);
    expect(await lineAmount(px1)).toBe(425_000);
    expect(await balance(c, sach)).toEqual({ quantity: 15, amount: 1_275_000 });
    await q(owner, "select public.delete_voucher($1)", [px2]);
  });

  it("xuất hết số tồn: lấy trọn giá trị còn lại, không còn tiền lẻ", async () => {
    const lap = await item(c, "LAP");
    await receipt(c, "2026-03-01", lap, 3, 33_333);
    await receipt(c, "2026-03-02", lap, 3, 33_334);
    await issue(c, "2026-03-05", lap, 1);
    const last = await issue(c, "2026-03-06", lap, 5);
    expect(await balance(c, lap)).toEqual({ quantity: 0, amount: 0 });
    expect(await lineAmount(last)).toBe(200_001 - 33_334);
  });

  it("điều chuyển kho: tồn từng kho đổi, tổng giá trị không đổi, bút toán Nợ = Có 1561", async () => {
    const kho2 = (await q<{ id: string }>(owner, "insert into public.warehouses (tenant_id, code, name) values ($1, 'KHO2', 'Kho CLB') returning id", [c.tenant]))[0]!.id;
    const dc = await save(c, {
      voucher_type: "PDC",
      posting_date: "2026-03-18",
      to_warehouse_id: kho2,
      description: "Chuyển sách sang kho CLB",
      lines: [{ debit_account: "1561", credit_account: "1561", item_id: sach, warehouse_id: c.kho, quantity: 6, amount: 0 }],
    });
    expect(await balance(c, sach)).toEqual({ quantity: 9, amount: 765_000 });
    expect(await balance(c, sach, kho2)).toEqual({ quantity: 6, amount: 510_000 });
    expect(await gl(dc)).toEqual([{ account: "1561", debit: "510000.00", credit: "510000.00" }]);
    await expect(
      save(c, { voucher_type: "PDC", posting_date: "2026-03-19", to_warehouse_id: c.kho, lines: [{ debit_account: "1561", credit_account: "1561", item_id: sach, warehouse_id: c.kho, quantity: 1 }] }),
    ).rejects.toThrow(/kho xuất trùng kho nhập/);
  });

  it("hóa đơn mua có chọn kho thì nhập kho (giá trị chưa thuế); thiếu kho thì báo", async () => {
    const ban = await item(c, "BAN", "Bộ", "goods");
    const hdm = await save(c, {
      voucher_type: "HDM",
      posting_date: "2026-03-20",
      partner_id: c.supplier,
      invoice_number: "777",
      lines: [{ debit_account: "1561", item_id: ban, warehouse_id: c.kho, quantity: 2, unit_price: 150_000, amount: 300_000, vat_code: "10" }],
    });
    const [e] = await q<{ kind: string; qty_in: string; amount_in: string }>(owner, "select kind, qty_in, amount_in from public.stock_entries where voucher_id = $1", [hdm]);
    expect(e).toEqual({ kind: "in", qty_in: "2.0000", amount_in: "300000.00" });
    await expect(
      save(c, { voucher_type: "HDM", posting_date: "2026-03-20", partner_id: c.supplier, invoice_number: "778", lines: [{ debit_account: "1561", item_id: ban, quantity: 1, amount: 1, vat_code: "10" }] }),
    ).rejects.toThrow(/chưa chọn kho cho mặt hàng BAN/);
  });

  it("báo cáo nhập – xuất – tồn và thẻ kho; đối chiếu với sổ cái", async () => {
    const rows = await q<{ item_code: string; opening_qty: string; in_qty: string; out_qty: string; closing_qty: string; closing_amount: string }>(
      owner,
      "select item_code, opening_qty, in_qty, out_qty, closing_qty, closing_amount from public.rpt_stock_summary($1, '2026-03-01', '2026-03-31')",
      [c.tenant],
    );
    // Điều chuyển nội bộ không tính là nhập/xuất khi xem mọi kho
    expect(rows.find((r) => r.item_code === "SACH")).toEqual({
      item_code: "SACH",
      opening_qty: "10.0000",
      in_qty: "10.0000",
      out_qty: "5.0000",
      closing_qty: "15.0000",
      closing_amount: "1275000.00",
    });
    const card = await q<{ row_kind: string; voucher_type: string | null; balance_qty: string }>(
      owner,
      "select row_kind, voucher_type, balance_qty from public.rpt_stock_card($1, $2, '2026-03-01', '2026-03-31')",
      [c.tenant, sach],
    );
    expect(card.map((r) => [r.row_kind, r.voucher_type, Number(r.balance_qty)])).toEqual([
      ["opening", null, 10],
      ["entry", "PNK", 20],
      ["entry", "PXK", 15],
      ["closing", null, 15],
    ]);
    // Tồn đầu kỳ 800.000 chưa có số dư đầu kỳ TK 1561 → lệch đúng 800.000
    const recon = await q<{ account: string; difference: string }>(owner, "select account, difference from public.rpt_stock_vs_ledger($1, '2026-03-31')", [c.tenant]);
    expect(recon).toEqual([{ account: "1561", difference: "800000.00" }]);
  });

  it("phân quyền: chỉ xem không tính lại giá được; người ngoài không thấy sổ kho", async () => {
    await expect(q(viewer, "select public.recost_inventory($1)", [c.tenant])).rejects.toThrow(/không có quyền tính giá vốn/);
    expect(await q(viewer, "select * from public.rpt_stock_summary($1, '2026-01-01', '2026-12-31')", [c.tenant])).not.toEqual([]);
    expect(await q(outsider, "select * from public.stock_entries where tenant_id = $1", [c.tenant])).toEqual([]);
    expect(await q(outsider, "select * from public.rpt_stock_summary($1, '2026-01-01', '2026-12-31')", [c.tenant])).toEqual([]);
  });
});

describe("bình quân cả tháng, đổi phương pháp, kỳ đã khóa", () => {
  let c: Ctx;

  beforeAll(async () => {
    c = await setup();
  });

  it("đổi sang bình quân tháng: giá xuất = (tồn đầu tháng + nhập trong tháng) ÷ số lượng; đổi lại thì như cũ", async () => {
    const quan = await item(c, "QUAN", "Bộ", "goods");
    await receipt(c, "2026-04-02", quan, 10, 100_000);
    const px = await issue(c, "2026-04-05", quan, 5);
    await receipt(c, "2026-04-20", quan, 10, 130_000);
    expect(await lineAmount(px)).toBe(500_000);

    await q(owner, "select public.set_stock_cost_method($1, 'monthly')", [c.tenant]);
    // (1.000.000 + 1.300.000) / 20 = 115.000
    expect(await lineAmount(px)).toBe(575_000);
    expect((await gl(px)).find((r) => r.account === "632")?.debit).toBe("575000.00");
    // Phiếu xuất mới trong tháng cũng theo giá tháng
    const px2 = await issue(c, "2026-04-25", quan, 3);
    expect(await lineAmount(px2)).toBe(345_000);

    await q(owner, "select public.set_stock_cost_method($1, 'moving')", [c.tenant]);
    expect(await lineAmount(px)).toBe(500_000);
    await expect(q(viewer, "select public.set_stock_cost_method($1, 'monthly')", [c.tenant])).rejects.toThrow();
  });

  it("bình quân tháng: hết hàng cuối tháng thì dồn tiền lẻ vào phiếu xuất cuối", async () => {
    await q(owner, "select public.set_stock_cost_method($1, 'monthly')", [c.tenant]);
    const le = await item(c, "LE");
    // 100.001 đồng / 3 cuốn = 33.333,67 → mỗi lần xuất 33.334, lần cuối dồn chênh còn 33.333
    await receipt(c, "2026-05-01", le, 1, 33_333);
    await receipt(c, "2026-05-01", le, 2, 33_334);
    const a = await issue(c, "2026-05-02", le, 1);
    const b = await issue(c, "2026-05-03", le, 1);
    const d = await issue(c, "2026-05-04", le, 1);
    expect([await lineAmount(a), await lineAmount(b), await lineAmount(d)]).toEqual([33_334, 33_334, 33_333]);
    expect(await balance(c, le)).toEqual({ quantity: 0, amount: 0 });
    await q(owner, "select public.set_stock_cost_method($1, 'moving')", [c.tenant]);
  });

  it("kỳ đã khóa: tính lại giá không làm đổi phiếu xuất trong kỳ khóa", async () => {
    const khoa = await item(c, "KHOA");
    await receipt(c, "2026-01-05", khoa, 10, 10_000);
    const px = await issue(c, "2026-01-10", khoa, 5);
    await receipt(c, "2026-01-20", khoa, 10, 20_000);
    expect(await lineAmount(px)).toBe(50_000);
    await q(owner, "select public.lock_period($1, '2026-01-31')", [c.tenant]);
    await q(owner, "select public.set_stock_cost_method($1, 'monthly')", [c.tenant]);
    expect(await lineAmount(px)).toBe(50_000);
    expect(await q<{ n: number }>(owner, "select public.recost_inventory($1, '2026-01-01') as n", [c.tenant])).toBeTruthy();
    expect(await lineAmount(px)).toBe(50_000);
  });
});
