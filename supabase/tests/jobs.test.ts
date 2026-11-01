import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createPartner, createTenant, createUser, pool, q } from "./db";

let owner: string;
let viewer: string;
let coach: string;
let tenant: string;
let school: string;
let printer: string;
let student: string;
let lop1: string; // lớp học TOT-K12
let giai: string; // giải đấu GIAI-T10

interface PnlRow {
  job_id: string | null;
  code: string | null;
  name: string;
  kind: string | null;
  revenue: number;
  deductions: number;
  net_revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  deferred: number;
}
interface LedgerRow {
  row_kind: string;
  account: string | null;
  debit: number | null;
  credit: number | null;
  revenue: number | null;
  cost: number | null;
  profit: number;
}
interface ContractRow {
  id: string;
  job_id: string;
  code: string;
  name: string;
  direction: string;
  status: string;
  value: number;
  invoiced: number;
  settled: number;
  balance: number;
  not_invoiced: number;
  revenue: number;
  cost: number;
  profit: number;
  overdue: boolean;
}

const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const numeric = <T extends object>(r: T, keys: string[]) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, keys.includes(k) ? N(v) : v])) as T;
const PNL_NUM = ["revenue", "deductions", "net_revenue", "cost", "profit", "margin", "deferred"];
const LEDGER_NUM = ["debit", "credit", "revenue", "cost", "profit"];
const CONTRACT_NUM = ["value", "invoiced", "settled", "balance", "not_invoiced", "revenue", "cost", "profit"];

const save = async (v: Record<string, unknown>, post = true) => {
  const [row] = await q<{ id: string }>(owner, "select public.save_voucher($1::jsonb, $2) as id", [
    JSON.stringify({ tenant_id: tenant, description: "Nghiệp vụ thử", ...v }),
    post,
  ]);
  return row!.id;
};
/** Phiếu kế toán đã ghi sổ: [Nợ, Có, số tiền, vụ việc, đối tượng] */
const pk = (date: string, lines: Array<[string, string, number, string | null, string?]>) =>
  save({
    voucher_type: "PK",
    posting_date: date,
    lines: lines.map(([d, c, amount, job, partner]) => ({ debit_account: d, credit_account: c, amount, job_id: job, partner_id: partner ?? null })),
  });
const pnl = async (from: string, to: string, kind: string | null = null, user = owner) =>
  (await q<PnlRow>(user, "select * from public.rpt_job_pnl($1, $2, $3, $4)", [tenant, from, to, kind])).map((r) => numeric(r, PNL_NUM));
const ledger = async (job: string | null, from: string, to: string, plOnly = true) =>
  (
    await q<LedgerRow>(owner, "select row_kind, account, debit, credit, revenue, cost, profit from public.rpt_job_ledger($1, $2, $3, $4, $5)", [
      tenant,
      job,
      from,
      to,
      plOnly,
    ])
  ).map((r) => numeric(r, LEDGER_NUM));
const contracts = async (asOf: string | null = null, user = owner) =>
  (await q<ContractRow>(user, "select * from public.rpt_contracts($1, $2)", [tenant, asOf])).map((r) => numeric(r, CONTRACT_NUM));
const saveContract = async (c: Record<string, unknown>, id: string | null = null, user = owner) =>
  (await q<{ id: string }>(user, "select public.save_contract($1, $2::jsonb, $3) as id", [tenant, JSON.stringify(c), id]))[0]!.id;
const deleteContract = async (id: string) =>
  (await q<{ r: { ok: boolean; job_deleted: boolean } }>(owner, "select public.delete_contract($1, $2) as r", [tenant, id]))[0]!.r;
const job = async (code: string) =>
  (await pool.query<{ id: string; name: string; kind: string; partner_id: string | null; start_date: string | null }>(
    "select id, name, kind, partner_id, start_date::text from public.jobs where tenant_id = $1 and code = $2",
    [tenant, code],
  )).rows[0];

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  coach = await createUser();
  tenant = await createTenant(owner, "TT99", "2026-01-01");
  await addMember(tenant, viewer, "viewer");
  await addMember(tenant, coach, "coach");
  school = await createPartner(owner, tenant, "TH-KIMDONG");
  printer = await createPartner(owner, tenant, "NHAIN");
  student = await createPartner(owner, tenant, "HV001");
  const ins = async (code: string, name: string, kind: string) =>
    (await pool.query<{ id: string }>("insert into public.jobs (tenant_id, code, name, kind) values ($1, $2, $3, $4) returning id", [tenant, code, name, kind]))
      .rows[0]!.id;
  lop1 = await ins("TOT-K12", "Lớp Tốt K12", "class");
  await pool.query("insert into public.classes (job_id, tenant_id, level, fee) values ($1, $2, 'tot', 1500000)", [lop1, tenant]);
  giai = await ins("GIAI-T10", "Giải cờ vua thiếu nhi tháng 10", "event");

  // Tháng 10 — lớp TOT-K12: học phí 6 tr vào 3387, phân bổ 2 tr sang 5113, lương HLV 800 nghìn, chi mua bảng cờ 300 nghìn
  await pk("2026-10-01", [["131", "3387", 6_000_000, lop1, student]]);
  await pk("2026-10-31", [
    ["3387", "5113", 2_000_000, lop1],
    ["632", "1111", 800_000, lop1],
  ]);
  await save({ voucher_type: "PC", posting_date: "2026-10-15", lines: [{ debit_account: "6427", amount: 300_000, job_id: lop1 }] });
  // Giải đấu: thuê sân 2 tr (phiếu chi), tài trợ 1,5 tr (phiếu thu)
  await save({ voucher_type: "PC", posting_date: "2026-10-18", lines: [{ debit_account: "6418", amount: 2_000_000, job_id: giai }] });
  await save({ voucher_type: "PT", posting_date: "2026-10-19", lines: [{ credit_account: "5113", amount: 1_500_000, job_id: giai }] });
  // Không gắn vụ việc: chi phí văn phòng 1 tr, lãi tiền gửi 100 nghìn
  await pk("2026-10-25", [
    ["6427", "1111", 1_000_000, null],
    ["1121", "515", 100_000, null],
  ]);
  // Tháng 11 — phân bổ thêm 2 tr cho lớp
  await pk("2026-11-30", [["3387", "5113", 2_000_000, lop1]]);
});

afterAll(async () => {
  await pool.end();
});

describe("lãi lỗ theo vụ việc", () => {
  it("doanh thu, chi phí, lãi lỗ, tỷ suất, doanh thu chưa thực hiện theo lớp / giải đấu; dòng không gắn vụ việc", async () => {
    const rows = await pnl("2026-10-01", "2026-10-31");
    expect(rows.map((r) => [r.code, r.kind, r.revenue, r.cost, r.profit, r.margin, r.deferred])).toEqual([
      ["GIAI-T10", "event", 1_500_000, 2_000_000, -500_000, -33.3, 0],
      ["TOT-K12", "class", 2_000_000, 1_100_000, 900_000, 45, 4_000_000],
      [null, null, 100_000, 1_000_000, -900_000, -900, 0],
    ]);
    expect(rows[2]!.name).toBe("(Không gắn vụ việc)");
  });

  it("lọc theo loại vụ việc thì bỏ dòng không gắn vụ việc", async () => {
    expect((await pnl("2026-10-01", "2026-10-31", "class")).map((r) => r.code)).toEqual(["TOT-K12"]);
    expect(await pnl("2026-10-01", "2026-10-31", "contract")).toEqual([]);
  });

  it("kết chuyển 911 không làm sai lãi lỗ vụ việc và lãi gộp; tổng các dòng = lãi lỗ kết chuyển", async () => {
    const before = await pnl("2026-10-01", "2026-10-31");
    const [r] = await q<{ r: { profit: number } }>(owner, "select public.close_period($1, '2026-10-01', true, false) as r", [tenant]);
    expect(Number(r!.r.profit)).toBe(-500_000);
    const after = await pnl("2026-10-01", "2026-10-31");
    expect(after).toEqual(before);
    expect(after.reduce((s, x) => s + x.profit, 0)).toBe(-500_000);

    const [gp] = await q<{ revenue: string; cogs: string }>(owner, "select revenue, cogs from public.rpt_gross_profit($1, '2026-10-01', '2026-10-31', 'item')", [
      tenant,
    ]);
    expect([Number(gp!.revenue), Number(gp!.cogs)]).toEqual([3_500_000, 800_000]);
  });

  it("HLV không xem được lãi lỗ", async () => {
    expect(await pnl("2026-10-01", "2026-10-31", null, coach)).toEqual([]);
    expect((await pnl("2026-10-01", "2026-10-31", null, viewer)).length).toBe(3);
  });
});

describe("sổ chi tiết vụ việc", () => {
  it("từng bút toán doanh thu / chi phí, lãi lỗ lũy kế trong kỳ", async () => {
    const rows = await ledger(lop1, "2026-10-01", "2026-10-31");
    expect(rows.map((r) => [r.row_kind, r.account, r.revenue, r.cost, r.profit])).toEqual([
      ["opening", null, 0, 0, 0],
      ["entry", "6427", null, 300_000, -300_000],
      ["entry", "5113", 2_000_000, null, 1_700_000],
      ["entry", "632", null, 800_000, 900_000],
      ["total", null, 2_000_000, 1_100_000, 900_000],
      ["closing", null, 2_000_000, 1_100_000, 900_000],
    ]);
  });

  it("lũy kế trước kỳ; xem cả bút toán công nợ, 3387", async () => {
    const pl = await ledger(lop1, "2026-11-01", "2026-11-30");
    expect(pl.map((r) => [r.row_kind, r.account, r.revenue, r.cost, r.profit])).toEqual([
      ["opening", null, 2_000_000, 1_100_000, 900_000],
      ["entry", "5113", 2_000_000, null, 2_900_000],
      ["total", null, 2_000_000, 0, 2_000_000],
      ["closing", null, 4_000_000, 1_100_000, 2_900_000],
    ]);
    const all = await ledger(lop1, "2026-11-01", "2026-11-30", false);
    expect(all.filter((r) => r.row_kind === "entry").map((r) => [r.account, r.debit, r.credit, r.revenue])).toEqual([
      ["3387", 2_000_000, 0, null],
      ["5113", 0, 2_000_000, 2_000_000],
    ]);
  });

  it("bút toán không gắn vụ việc: chỉ doanh thu / chi phí, không có phiếu kết chuyển", async () => {
    const rows = await ledger(null, "2026-10-01", "2026-10-31", false);
    expect(rows.filter((r) => r.row_kind === "entry").map((r) => [r.account, r.revenue, r.cost])).toEqual([
      ["6427", null, 1_000_000],
      ["515", 100_000, null],
    ]);
  });
});

describe("hợp đồng", () => {
  let hd: string;
  let invoice: string;

  it("hợp đồng bán mới: tạo vụ việc loại hợp đồng, gắn đối tác, thời hạn", async () => {
    hd = await saveContract({
      code: "hd-kd",
      name: "Dạy cờ vua trường TH Kim Đồng 2026-2027",
      direction: "sale",
      number: "15/2026/HĐ-DS",
      partner_id: school,
      signed_date: "2026-11-01",
      start_date: "2026-11-01",
      end_date: "2027-05-31",
      value: 120_000_000,
    });
    expect(await job("HD-KD")).toMatchObject({ kind: "contract", partner_id: school, start_date: "2026-11-01" });
    const [c] = await contracts("2026-11-30");
    expect(c).toMatchObject({ code: "HD-KD", direction: "sale", status: "active", value: 120_000_000, invoiced: 0, not_invoiced: 120_000_000 });
  });

  it("hóa đơn một phần, thu theo hóa đơn (theo tỷ lệ dòng của hợp đồng), khoản ứng trước", async () => {
    const hdJob = (await job("HD-KD"))!.id;
    // Hóa đơn 50 tr: 40 tr của hợp đồng + 10 tr bán sách lẻ
    invoice = await save({
      voucher_type: "HDV",
      partner_id: school,
      posting_date: "2026-11-05",
      invoice_date: "2026-11-05",
      lines: [
        { credit_account: "5113", amount: 40_000_000, vat_code: "KCT", job_id: hdJob },
        { credit_account: "5111", amount: 10_000_000, vat_code: "KCT" },
      ],
    });
    await save({
      voucher_type: "PT",
      partner_id: school,
      posting_date: "2026-11-10",
      lines: [{ credit_account: "131", amount: 25_000_000, invoice_id: invoice }],
    });
    await save({
      voucher_type: "BC",
      partner_id: school,
      posting_date: "2026-11-12",
      lines: [{ credit_account: "131", amount: 5_000_000, job_id: hdJob }],
    });
    // Bản nháp không tính
    await save({ voucher_type: "PT", partner_id: school, posting_date: "2026-11-13", lines: [{ credit_account: "131", amount: 1_000_000, job_id: hdJob }] }, false);

    const [c] = await contracts("2026-11-30");
    expect(c).toMatchObject({
      invoiced: 40_000_000,
      settled: 25_000_000, // 25 tr × 40/50 + 5 tr ứng trước
      balance: 15_000_000,
      not_invoiced: 80_000_000,
      revenue: 40_000_000,
      cost: 0,
      profit: 40_000_000,
      overdue: false,
    });
    const [early] = await contracts("2026-11-07");
    expect(early).toMatchObject({ invoiced: 40_000_000, settled: 0, balance: 40_000_000 });
    const [late] = await contracts("2027-06-01");
    expect(late!.overdue).toBe(true);

    const detail = await q<{ kind: string; voucher_type: string; amount: string; paid: string }>(
      owner,
      "select kind, voucher_type, amount, paid from public.rpt_contract_detail($1, $2)",
      [tenant, hd],
    );
    expect(detail.map((d) => [d.kind, d.voucher_type, Number(d.amount), Number(d.paid)])).toEqual([
      ["invoice", "HDV", 40_000_000, 20_000_000],
      ["advance", "BC", 5_000_000, 5_000_000],
    ]);
  });

  it("sửa hợp đồng cập nhật cả vụ việc; mã không đổi", async () => {
    await saveContract(
      { code: "KHAC", name: "Dạy cờ vua TH Kim Đồng (phụ lục 1)", direction: "sale", partner_id: school, value: 100_000_000, status: "active", start_date: "2026-11-01" },
      hd,
    );
    expect((await job("HD-KD"))!.name).toBe("Dạy cờ vua TH Kim Đồng (phụ lục 1)");
    expect(await job("KHAC")).toBeUndefined();
    const [c] = await contracts("2026-11-30");
    expect(c).toMatchObject({ code: "HD-KD", value: 100_000_000, not_invoiced: 60_000_000 });
  });

  it("gắn vào vụ việc có sẵn; chặn lớp học, vụ việc đã có hợp đồng; kiểm tra dữ liệu", async () => {
    const id = await saveContract({ code: "giai-t10", name: "Tài trợ giải tháng 10", direction: "sale", partner_id: school, value: 1_500_000 });
    expect((await job("GIAI-T10"))!.kind).toBe("event");
    const c = (await contracts("2026-11-30")).find((x) => x.id === id)!;
    expect(c).toMatchObject({ code: "GIAI-T10", revenue: 1_500_000, cost: 2_000_000, profit: -500_000, invoiced: 0 });

    await expect(saveContract({ code: "TOT-K12", name: "X", partner_id: school })).rejects.toThrow("là lớp học");
    await expect(saveContract({ code: "HD-KD", name: "X", partner_id: school })).rejects.toThrow("đã có hợp đồng");
    await expect(saveContract({ code: "HD-Y", name: "X" })).rejects.toThrow("Chưa chọn đối tác");
    await expect(saveContract({ code: "HD-Y", name: "X", partner_id: school, start_date: "2026-12-01", end_date: "2026-11-01" })).rejects.toThrow(
      "Ngày kết thúc trước ngày bắt đầu",
    );
    await expect(saveContract({ code: "HD-Y", name: "X", partner_id: school, status: "x" })).rejects.toThrow("Trạng thái hợp đồng không hợp lệ");
    await expect(saveContract({ code: "HD-Y", name: "X", partner_id: printer }, null, viewer)).rejects.toThrow("không có quyền");
  });

  it("hợp đồng mua: hóa đơn mua dịch vụ có thuế, trả theo hóa đơn, ứng trước", async () => {
    const id = await saveContract({ code: "HD-IN", name: "In sách Cờ vua nhập môn", direction: "purchase", partner_id: printer, value: 30_000_000 });
    const inJob = (await job("HD-IN"))!.id;
    const bill = await save({
      voucher_type: "HMV",
      partner_id: printer,
      posting_date: "2026-11-08",
      invoice_series: "1C26TIN",
      invoice_number: "0000123",
      invoice_date: "2026-11-08",
      lines: [{ debit_account: "6427", amount: 20_000_000, vat_code: "10", job_id: inJob }],
    });
    await save({ voucher_type: "PC", partner_id: printer, posting_date: "2026-11-09", lines: [{ debit_account: "331", amount: 11_000_000, invoice_id: bill }] });
    await save({ voucher_type: "BN", partner_id: printer, posting_date: "2026-11-09", lines: [{ debit_account: "331", amount: 3_000_000, job_id: inJob }] });
    const c = (await contracts("2026-11-30")).find((x) => x.id === id)!;
    expect(c).toMatchObject({
      direction: "purchase",
      invoiced: 22_000_000,
      settled: 14_000_000,
      balance: 8_000_000,
      not_invoiced: 8_000_000,
      cost: 20_000_000,
      profit: -20_000_000,
    });
  });

  it("xóa hợp đồng: vụ việc chưa dùng thì xóa luôn, đã có chứng từ hoặc không phải loại hợp đồng thì giữ", async () => {
    const fresh = await saveContract({ code: "HD-NEW", name: "Hợp đồng chưa thực hiện", partner_id: school, status: "draft" });
    expect(await deleteContract(fresh)).toEqual({ ok: true, job_deleted: true });
    expect(await job("HD-NEW")).toBeUndefined();

    expect(await deleteContract(hd)).toEqual({ ok: true, job_deleted: false });
    expect(await job("HD-KD")).toBeDefined();
    const giaiContract = (await contracts()).find((x) => x.code === "GIAI-T10")!;
    expect(await deleteContract(giaiContract.id)).toEqual({ ok: true, job_deleted: false });
    expect((await job("GIAI-T10"))!.kind).toBe("event");
    expect((await contracts()).map((x) => x.code)).toEqual(["HD-IN"]);
    // Gắn lại hợp đồng vào vụ việc có chứng từ
    await saveContract({ code: "HD-KD", name: "Dạy cờ vua TH Kim Đồng", partner_id: school, value: 100_000_000 });
    expect((await contracts("2026-11-30")).find((x) => x.code === "HD-KD")).toMatchObject({ invoiced: 40_000_000, settled: 25_000_000 });
  });

  it("người xem đọc được hợp đồng, HLV thì không", async () => {
    expect((await contracts(null, viewer)).length).toBe(2);
    expect(await contracts(null, coach)).toEqual([]);
  });
});
