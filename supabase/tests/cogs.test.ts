import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createPartner, createTenant, createUser, pool, q } from "./db";

let owner: string;
let viewer: string;
let outsider: string;

interface Ctx {
  tenant: string;
  customer: string;
  supplier: string;
  kho: string;
}

async function setup(regime: "TT99" | "TT133" = "TT99"): Promise<Ctx> {
  const tenant = await createTenant(owner, regime);
  const customer = await createPartner(owner, tenant, "KH01");
  const supplier = await createPartner(owner, tenant, "NCC01");
  const kho = (await pool.query<{ id: string }>("select id from public.warehouses where tenant_id = $1 and code = 'KHO'", [tenant])).rows[0]!.id;
  return { tenant, customer, supplier, kho };
}

const item = async (c: Ctx, code: string, opts: { uom?: string; kind?: string; name?: string; track?: boolean } = {}) => {
  const [r] = await q<{ id: string }>(
    owner,
    "insert into public.items (tenant_id, code, name, uom, kind, track_inventory) values ($1, $2, $3, $4, $5, $6) returning id",
    [c.tenant, code, opts.name ?? `Mặt hàng ${code}`, opts.uom ?? "Cuốn", opts.kind ?? "book", opts.track ?? true],
  );
  return r!.id;
};

const save = async (c: Ctx, v: Record<string, unknown>, post = true) => {
  const [row] = await q<{ id: string }>(owner, "select public.save_voucher($1::jsonb, $2) as id", [JSON.stringify({ tenant_id: c.tenant, ...v }), post]);
  return row!.id;
};

const openings = (c: Ctx, rows: unknown[]) =>
  q<{ r: { ok: boolean } }>(owner, "select public.import_stock_openings($1, $2::jsonb) as r", [c.tenant, JSON.stringify(rows)]).then((x) => x[0]!.r);

/** Phiếu nhập kho: Nợ TK kho (dòng) / Có 331 */
const receipt = (c: Ctx, date: string, itemId: string, qty: number, price: number, account = "1561") =>
  save(c, {
    voucher_type: "PNK",
    posting_date: date,
    partner_id: c.supplier,
    lines: [{ debit_account: account, item_id: itemId, warehouse_id: c.kho, quantity: qty, unit_price: price, amount: qty * price }],
  });

/** Hóa đơn bán hàng: Nợ 131 / Có 5111, thuế 5% */
const sale = (c: Ctx, date: string, itemId: string, qty: number | null, price: number, extra: Record<string, unknown> = {}, partner = c.customer) =>
  save(c, {
    voucher_type: "HDB",
    posting_date: date,
    partner_id: partner,
    lines: [
      {
        credit_account: "5111",
        item_id: itemId,
        warehouse_id: c.kho,
        quantity: qty,
        unit_price: price,
        amount: (qty ?? 1) * price,
        vat_code: "5",
        ...extra,
      },
    ],
  });

const line = async (voucherId: string) =>
  (
    await pool.query<{ amount: string; cost_amount: string | null; cost_account: string | null; warehouse_id: string | null }>(
      "select amount, cost_amount, cost_account, warehouse_id from public.voucher_lines where voucher_id = $1 order by line_no limit 1",
      [voucherId],
    )
  ).rows[0]!;

const cost = async (voucherId: string) => {
  const c = (await line(voucherId)).cost_amount;
  return c === null ? null : Number(c);
};

const gl = async (voucherId: string) =>
  (
    await pool.query<{ account: string; debit: string; credit: string }>(
      "select account, sum(debit)::text as debit, sum(credit)::text as credit from public.gl_entries where voucher_id = $1 group by account order by account",
      [voucherId],
    )
  ).rows;

const total = async (voucherId: string) =>
  Number((await pool.query<{ total_amount: string }>("select total_amount from public.vouchers where id = $1", [voucherId])).rows[0]!.total_amount);

const balance = async (c: Ctx, itemId: string) => {
  const [r] = await q<{ quantity: string; amount: string }>(owner, "select quantity, amount from public.stock_balances($1) where item_id = $2 and warehouse_id = $3", [
    c.tenant,
    itemId,
    c.kho,
  ]);
  return r ? { quantity: Number(r.quantity), amount: Number(r.amount) } : { quantity: 0, amount: 0 };
};

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  outsider = await createUser();
});

afterAll(async () => {
  await pool.end();
});

describe("hóa đơn bán hàng tự xuất kho, giá vốn", () => {
  let c: Ctx;
  let sach: string;
  let hd1: string;
  let hd3: string;

  beforeAll(async () => {
    c = await setup();
    sach = await item(c, "SACH");
    await openings(c, [{ row: 2, warehouse_code: "KHO", item_code: "SACH", quantity: 10, amount: 800_000 }]);
    await receipt(c, "2026-03-10", sach, 10, 90_000);
  });

  it("ghi sổ hóa đơn bán: xuất kho theo giá bình quân, Nợ 632 / Có 1561, doanh thu & thuế giữ nguyên", async () => {
    hd1 = await sale(c, "2026-03-15", sach, 3, 120_000);
    expect(await line(hd1)).toMatchObject({ amount: "360000.00", cost_amount: "255000.00", cost_account: "632" });
    expect(await gl(hd1)).toEqual([
      { account: "131", debit: "378000.00", credit: "0.00" },
      { account: "1561", debit: "0.00", credit: "255000.00" },
      { account: "33311", debit: "0.00", credit: "18000.00" },
      { account: "5111", debit: "0.00", credit: "360000.00" },
      { account: "632", debit: "255000.00", credit: "0.00" },
    ]);
    expect(await total(hd1)).toBe(378_000);
    expect(await balance(c, sach)).toEqual({ quantity: 17, amount: 1_445_000 });
    const [e] = await q<{ kind: string; account: string; qty_out: string; cogs: boolean }>(
      owner,
      "select kind, account, qty_out, cogs from public.stock_entries where voucher_id = $1",
      [hd1],
    );
    expect(e).toMatchObject({ kind: "out", account: "1561", qty_out: "3.0000", cogs: true });
  });

  it("chặn bán quá số tồn và dòng hàng thiếu thông tin", async () => {
    await expect(sale(c, "2026-03-16", sach, 100, 120_000)).rejects.toThrow(/Không đủ tồn: SACH tại kho KHO còn 17 Cuốn, phiếu này xuất 100/);
    await expect(sale(c, "2026-03-16", sach, null, 120_000)).rejects.toThrow(/chưa nhập số lượng bán mặt hàng SACH/);
    const loi = await item(c, "LOI");
    await pool.query("update public.items set inventory_account = '156' where id = $1", [loi]);
    await expect(sale(c, "2026-03-16", loi, 1, 10_000)).rejects.toThrow(/TK kho 156 của mặt hàng LOI/);
    expect(await balance(c, sach)).toEqual({ quantity: 17, amount: 1_445_000 });
  });

  it("dòng chưa chọn kho: lấy Kho chính (bản web cũ vẫn ghi sổ được)", async () => {
    hd3 = await sale(c, "2026-03-20", sach, 1, 120_000, { warehouse_id: null });
    expect((await line(hd3)).warehouse_id).toBe(c.kho);
    expect(await cost(hd3)).toBe(85_000);
  });

  it("nhập lùi ngày: giá vốn hóa đơn bán tự tính lại, bút toán dựng lại, tổng hóa đơn không đổi", async () => {
    await receipt(c, "2026-03-12", sach, 10, 100_000);
    // Trước 15/03: 30 cuốn, 2.700.000 → 90.000/cuốn
    expect(await cost(hd1)).toBe(270_000);
    expect(await gl(hd1)).toContainEqual({ account: "632", debit: "270000.00", credit: "0.00" });
    expect(await gl(hd1)).toContainEqual({ account: "5111", debit: "0.00", credit: "360000.00" });
    expect(await total(hd1)).toBe(378_000);
    expect(await cost(hd3)).toBe(90_000);
  });

  it("bỏ ghi sổ hóa đơn bán trả lại tồn và xóa giá vốn; ghi sổ lại tính lại", async () => {
    await q(owner, "select public.unpost_voucher($1)", [hd3]);
    expect(await cost(hd3)).toBeNull();
    expect(await gl(hd3)).toEqual([]);
    expect(await balance(c, sach)).toEqual({ quantity: 27, amount: 2_430_000 });
    await q(owner, "select public.post_voucher($1)", [hd3]);
    expect(await cost(hd3)).toBe(90_000);
  });

  it("không bỏ ghi sổ được phiếu nhập mà hóa đơn bán đã xuất hết", async () => {
    const ban = await item(c, "BAN", { uom: "Bộ", kind: "goods" });
    const pn = await receipt(c, "2026-03-21", ban, 2, 500_000);
    await sale(c, "2026-03-22", ban, 2, 700_000);
    await expect(q(owner, "select public.unpost_voucher($1)", [pn])).rejects.toThrow(/Không bỏ ghi sổ được: BAN tại kho KHO — phiếu HD\S* ngày 22\/03\/2026 sẽ bị xuất âm \(thiếu 2 Bộ\)/);
  });

  it("mặt hàng không theo dõi tồn kho, dịch vụ: như cũ", async () => {
    const hp = await item(c, "HOCPHI", { uom: "Tháng", kind: "service", track: false });
    const id = await save(c, {
      voucher_type: "HDV",
      posting_date: "2026-03-25",
      partner_id: c.customer,
      lines: [{ credit_account: "5113", item_id: hp, quantity: 1, unit_price: 3_000_000, amount: 3_000_000, vat_code: "KCT" }],
    });
    expect(await cost(id)).toBeNull();
    expect(await gl(id)).toEqual([
      { account: "131", debit: "3000000.00", credit: "0.00" },
      { account: "5113", debit: "0.00", credit: "3000000.00" },
    ]);
  });
});

describe("hóa đơn bán theo bình quân cả tháng (TT133, TK 156)", () => {
  it("đổi phương pháp: giá vốn hóa đơn bán tính lại theo bình quân tháng", async () => {
    const c = await setup("TT133");
    const s = await item(c, "S");
    await openings(c, [{ row: 2, warehouse_code: "KHO", item_code: "S", quantity: 10, amount: 800_000 }]);
    const hd = await sale(c, "2026-04-03", s, 5, 150_000);
    expect(await cost(hd)).toBe(400_000);
    expect(await gl(hd)).toContainEqual({ account: "156", debit: "0.00", credit: "400000.00" });
    await receipt(c, "2026-04-05", s, 10, 100_000, "156");
    expect(await cost(hd)).toBe(400_000);
    await q(owner, "select public.set_stock_cost_method($1, 'monthly')", [c.tenant]);
    // (800.000 + 1.000.000) / 20 = 90.000
    expect(await cost(hd)).toBe(450_000);
    expect(await gl(hd)).toContainEqual({ account: "632", debit: "450000.00", credit: "0.00" });
  });
});

describe("lãi gộp theo mặt hàng, khách hàng", () => {
  let c: Ctx;
  let kh2: string;

  interface GpRow {
    code: string | null;
    name: string;
    quantity: string;
    revenue: string;
    net_revenue: string;
    cogs: string;
    gross_profit: string;
    margin: string | null;
  }
  const report = (by: "item" | "customer", user = owner) =>
    q<GpRow>(user, "select * from public.rpt_gross_profit($1, '2026-05-01', '2026-05-31', $2)", [c.tenant, by]);

  beforeAll(async () => {
    c = await setup();
    await addMember(c.tenant, viewer, "viewer");
    kh2 = await createPartner(owner, c.tenant, "KH02");
    const sach = await item(c, "SACH");
    const hp = await item(c, "HOCPHI", { uom: "Tháng", kind: "service", track: false });
    await openings(c, [{ row: 2, warehouse_code: "KHO", item_code: "SACH", quantity: 10, amount: 800_000 }]);
    await sale(c, "2026-05-02", sach, 3, 120_000);
    await sale(c, "2026-05-03", sach, 2, 120_000, {}, kh2);
    await save(c, {
      voucher_type: "HDV",
      posting_date: "2026-05-04",
      partner_id: c.customer,
      lines: [{ credit_account: "5113", item_id: hp, quantity: 1, unit_price: 3_000_000, amount: 3_000_000, vat_code: "KCT" }],
    });
    // Phiếu xuất dùng nội bộ cho mặt hàng: Nợ 632 có mã hàng → vào giá vốn của mặt hàng
    await save(c, {
      voucher_type: "PXK",
      posting_date: "2026-05-05",
      lines: [{ credit_account: "1561", item_id: sach, warehouse_id: c.kho, quantity: 1, amount: 0 }],
    });
    // Ngoài kỳ báo cáo
    await sale(c, "2026-06-01", sach, 1, 120_000);
  });

  it("theo mặt hàng: doanh thu, giá vốn (gồm phiếu xuất 632), lãi gộp, tỷ suất", async () => {
    const rows = await report("item");
    expect(rows.map((r) => [r.code, r.quantity, r.revenue, r.cogs, r.gross_profit, r.margin])).toEqual([
      ["HOCPHI", "1.0000", "3000000.00", "0.00", "3000000.00", "100.0"],
      ["SACH", "5.0000", "600000.00", "480000.00", "120000.00", "20.0"],
    ]);
  });

  it("theo khách hàng: dòng không gắn khách hàng gộp chung; tổng khớp sổ cái", async () => {
    const rows = await report("customer");
    expect(rows.map((r) => [r.code, r.name, r.revenue, r.cogs, r.gross_profit])).toEqual([
      ["KH01", "Khách hàng KH01", "3360000.00", "240000.00", "3120000.00"],
      ["KH02", "Khách hàng KH02", "240000.00", "160000.00", "80000.00"],
      [null, "(Không gắn khách hàng)", "0.00", "80000.00", "-80000.00"],
    ]);
    const [l] = await q<{ revenue: string; cogs: string }>(
      owner,
      `select sum(credit - debit) filter (where account like '511%')::text as revenue, sum(debit - credit) filter (where account like '632%')::text as cogs
       from public.gl_entries where tenant_id = $1 and posting_date between '2026-05-01' and '2026-05-31'`,
      [c.tenant],
    );
    expect(l).toEqual({ revenue: "3600000.00", cogs: "480000.00" });
  });

  it("phân quyền: thành viên xem được, người ngoài không thấy số liệu", async () => {
    expect(await report("item", viewer)).toHaveLength(2);
    expect(await report("item", outsider)).toEqual([]);
  });
});

describe("nhập hóa đơn XML: tự gắn mã hàng và kho", () => {
  interface ImportResult {
    ok: boolean;
    results: { status: string; voucher_id?: string; items?: { matched: number; lines: number } }[];
  }

  it("khớp theo mã hàng rồi theo tên; dòng không khớp giữ nguyên; ghi sổ thì nhập kho", async () => {
    const c = await setup();
    const sach = await item(c, "SACH-NM", { name: "Sách cờ vua nhập môn" });
    const ban = await item(c, "BAN-GO", { uom: "Bộ", kind: "goods", name: "Bàn cờ gỗ tiêu chuẩn" });
    const invoice = {
      row: 1,
      voucher_type: "HDM",
      posting_date: "2026-10-20",
      invoice_date: "2026-10-20",
      line_account: "1561",
      seller: { name: "Công ty TNHH Sách Mẫu", tax_code: "0109999991", address: "Số 1 Phố Mẫu" },
      invoice_series: "1C26TSM",
      invoice_series_short: "C26TSM",
      invoice_number: "00000123",
      lines: [
        { item_code: "ban-go", description: "Bàn cờ (tên trên hóa đơn khác)", uom: "Bộ", quantity: 3, unit_price: 300_000, amount: 900_000, vat_code: "10", vat_amount: 90_000 },
        { description: "  sách cờ vua   NHẬP MÔN ", uom: "Cuốn", quantity: 10, unit_price: 80_000, amount: 800_000, vat_code: "5", vat_amount: 40_000 },
        { description: "Phí vận chuyển", amount: 50_000, vat_code: "10", vat_amount: 5_000 },
      ],
    };
    const run = async (dry: boolean) =>
      (await q<{ r: ImportResult }>(owner, "select public.import_purchase_invoices($1, $2::jsonb, $3) as r", [c.tenant, JSON.stringify([invoice]), dry]))[0]!.r;

    expect((await run(true)).results[0]).toMatchObject({ status: "new", items: { matched: 2, lines: 3 } });
    const done = await run(false);
    expect(done.results[0]).toMatchObject({ status: "created", items: { matched: 2, lines: 3 } });
    const id = done.results[0]!.voucher_id!;
    const lines = (
      await pool.query<{ item_id: string | null; warehouse_id: string | null; debit_account: string }>(
        "select item_id, warehouse_id, debit_account from public.voucher_lines where voucher_id = $1 order by line_no",
        [id],
      )
    ).rows;
    expect(lines).toEqual([
      { item_id: ban, warehouse_id: c.kho, debit_account: "1561" },
      { item_id: sach, warehouse_id: c.kho, debit_account: "1561" },
      { item_id: null, warehouse_id: null, debit_account: "1561" },
    ]);
    await q(owner, "select public.post_voucher($1)", [id]);
    expect(await balance(c, ban)).toEqual({ quantity: 3, amount: 900_000 });
    expect(await balance(c, sach)).toEqual({ quantity: 10, amount: 800_000 });
  });
});
