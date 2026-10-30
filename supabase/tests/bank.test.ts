import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createTenant, createUser, pool, q, saveVoucher } from "./db";

let owner: string;
let viewer: string;
let coach: string;
let outsider: string;
let tenant: string;
const bill: Record<string, string> = {};
let manualBc: string;
let manualBn: string;

interface Suggestion {
  kind: "existing" | "tuition" | "invoice";
  sure: boolean;
  partner_code?: string;
  invoice_number?: string | null;
  allocations?: Array<{ number: string; amount: number; remaining: number }>;
  advance?: number;
  number?: string;
}
interface BankLineRow {
  id: string;
  txn_date: string;
  description: string;
  amount_in: string;
  amount_out: string;
  status: "matched" | "ignored" | "suggested" | "new";
  voucher_number: string | null;
  suggestion: Suggestion | null;
}

const rpc = async <T>(user: string, sql: string, params: unknown[]) => (await q<{ r: T }>(user, `select ${sql} as r`, params))[0]!.r;
const line = (date: string, description: string, amountIn: number, amountOut: number, balance: number, ref = "") => ({
  txn_date: date,
  ref,
  description,
  amount_in: amountIn,
  amount_out: amountOut,
  balance,
  fingerprint: `${date}|${ref}|${amountIn}|${amountOut}|${description.toUpperCase()}`,
});
const importStatement = (lines: unknown[], user = owner, account = "1121") =>
  rpc<{ ok: boolean; statement_id: string; inserted: number; duplicates: number }>(user, "public.import_bank_statement($1, $2, $3::jsonb, $4::jsonb)", [
    tenant,
    account,
    JSON.stringify({ file_name: "saoke-t10.xlsx", period_from: "2026-10-01", period_to: "2026-10-31", closing_balance: 8_664_000 }),
    JSON.stringify(lines),
  ]);
const lines = async (user = owner) =>
  q<BankLineRow>(user, "select * from public.rpt_bank_lines($1, '1121', '2026-10-01', '2026-10-31')", [tenant]);
const byText = async (text: string) => (await lines()).find((l) => l.description.includes(text))!;
const gl = async (voucher: string) =>
  (
    await pool.query<{ account: string; debit: string; credit: string }>(
      "select account, debit::text, credit::text from public.gl_entries where voucher_id = $1 order by debit desc, account",
      [voucher],
    )
  ).rows.map((r) => [r.account, Number(r.debit), Number(r.credit)]);
const remaining = async (number: string) =>
  Number((await pool.query<{ r: string }>("select app.invoice_remaining(id)::text as r from public.vouchers where tenant_id = $1 and number = $2", [tenant, number])).rows[0]!.r);

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  coach = await createUser();
  outsider = await createUser();
  tenant = await createTenant(owner, "TT133", "2026-01-01");
  await addMember(tenant, viewer, "viewer");
  await addMember(tenant, coach, "coach");

  const cls = await rpc<string>(owner, "public.save_class($1, $2::jsonb)", [
    tenant,
    JSON.stringify({ code: "TOT-K20", name: "Lớp Tốt K20", level: "tot", billing: "monthly", fee: 600_000 }),
  ]);
  for (const [code, start] of [
    ["HV101", "2026-09-01"],
    ["HV102", "2026-09-01"],
    ["HV103", "2026-09-01"],
    ["HV104", "2026-10-01"],
  ] as const) {
    const id = await rpc<string>(owner, "public.save_student($1, $2::jsonb)", [tenant, JSON.stringify({ code, name: `Học viên ${code}` })]);
    await rpc(owner, "public.save_enrollment($1, $2::jsonb)", [tenant, JSON.stringify({ class_id: cls, student_id: id, start_date: start })]);
  }
  for (const month of ["2026-09-01", "2026-10-01"]) await rpc(owner, "public.generate_tuition($1, $2, null, $3, true, false)", [tenant, month, month]);
  const bills = await pool.query<{ code: string; month: string; number: string }>(
    `select p.code, to_char(t.period_start, 'MM') as month, v.number
     from public.tuition_bills t join public.enrollments e on e.id = t.enrollment_id join public.partners p on p.id = e.student_id
     join public.vouchers v on v.id = t.invoice_id where t.tenant_id = $1`,
    [tenant],
  );
  for (const b of bills.rows) bill[`${b.code}-${b.month}`] = b.number;

  // Hóa đơn bán sách 200.000 + VAT 10% cho khách hàng KH01 → HD0001, 220.000
  const [kh] = await q<{ id: string }>(owner, "insert into public.partners (tenant_id, code, name) values ($1, 'KH01', 'Nhà sách Mẫu') returning id", [tenant]);
  await saveVoucher(owner, { tenant_id: tenant, voucher_type: "HDB", posting_date: "2026-10-02", partner_id: kh!.id, lines: [{ credit_account: "5111", amount: 200_000, vat_code: "10" }] }, true);
  // Kế toán đã lập tay BC góp vốn 5.000.000 ngày 10/10 (sao kê ghi ngày 11/10) và BN chi 300.000 chưa có trên sao kê
  manualBc = await saveVoucher(owner, { tenant_id: tenant, voucher_type: "BC", posting_date: "2026-10-10", description: "Góp vốn", lines: [{ credit_account: "4111", amount: 5_000_000 }] }, true);
  manualBn = await saveVoucher(owner, { tenant_id: tenant, voucher_type: "BN", posting_date: "2026-10-20", description: "Chi mua văn phòng phẩm", lines: [{ debit_account: "6422", amount: 300_000 }] }, true);
});

afterAll(async () => {
  await pool.end();
});

const statement = () => [
  line("2026-10-05", "MBVCB.111.HP HV101.CT tu 0011 PHU HUYNH A", 1_200_000, 0, 1_200_000, "FT1"),
  line("2026-10-05", `IBFT HP HV102 ${bill["HV102-10"]} chuyen tien`, 600_000, 0, 1_800_000, "FT2"),
  line("2026-10-06", "HPHV103", 900_000, 0, 2_700_000, "FT3"),
  line("2026-10-07", "HP HV104 HOC PHI", 700_000, 0, 3_400_000, "FT4"),
  line("2026-10-08", "THANH TOAN HD0001 NHA SACH MAU", 220_000, 0, 3_620_000, "FT5"),
  line("2026-10-11", "NOP VON GOP", 5_000_000, 0, 8_620_000, "FT6"),
  line("2026-10-31", "PHI QUAN LY TAI KHOAN", 0, 11_000, 8_609_000, "FEE"),
  line("2026-10-31", "TRA LAI TIEN GUI", 5_000, 0, 8_614_000, "INT"),
  line("2026-10-31", "CHUYEN TIEN NHAM 999", 50_000, 0, 8_664_000, "X9"),
];

describe("sao kê ngân hàng: nhập, gợi ý khớp, xác nhận, đối chiếu", () => {

  it("nhập sao kê: chỉ TK 112 chi tiết, chỉ người ghi sổ; nhập lại không sinh dòng trùng", async () => {
    await expect(importStatement(statement(), owner, "1111")).rejects.toThrow(/không phải TK tiền gửi ngân hàng/);
    await expect(importStatement(statement(), owner, "112")).rejects.toThrow(/không phải TK tiền gửi ngân hàng/);
    await expect(importStatement(statement(), viewer)).rejects.toThrow(/không có quyền/);
    await expect(importStatement([{ txn_date: "2026-10-01", fingerprint: "x", amount_in: 1, amount_out: 1 }])).rejects.toThrow(/Dòng 1 của sao kê không hợp lệ/);

    expect(await importStatement(statement())).toMatchObject({ ok: true, inserted: 9, duplicates: 0 });
    expect(await importStatement(statement())).toMatchObject({ ok: true, inserted: 0, duplicates: 9 });
    expect(await lines()).toHaveLength(9);
  });

  it("gợi ý: chứng từ có sẵn, học phí theo mã HV / số hóa đơn, hóa đơn bán; trả thiếu / thừa thì cần xem lại", async () => {
    const hv101 = await byText("HV101");
    expect(hv101.status).toBe("suggested");
    expect(hv101.suggestion).toMatchObject({ kind: "tuition", sure: true, partner_code: "HV101", invoice_number: null, advance: 0 });
    expect(hv101.suggestion!.allocations!.map((a) => [a.number, a.amount])).toEqual([
      [bill["HV101-09"], 600_000],
      [bill["HV101-10"], 600_000],
    ]);

    // Có số hóa đơn → trừ đúng hóa đơn đó (tháng 10), không phải hóa đơn cũ hơn
    const hv102 = await byText("HV102");
    expect(hv102.suggestion).toMatchObject({ kind: "tuition", sure: true, invoice_number: bill["HV102-10"] });
    expect(hv102.suggestion!.allocations!.map((a) => [a.number, a.amount])).toEqual([[bill["HV102-10"], 600_000]]);

    // Dính liền "HPHV103", trả 900.000 cho hai phiếu 600.000 → trả một phần phiếu sau
    const hv103 = await byText("HPHV103");
    expect(hv103.suggestion).toMatchObject({ kind: "tuition", sure: false, partner_code: "HV103", advance: 0 });
    expect(hv103.suggestion!.allocations!.map((a) => [a.number, a.amount])).toEqual([
      [bill["HV103-09"], 600_000],
      [bill["HV103-10"], 300_000],
    ]);

    // Trả thừa 100.000 → ghi nhận trước
    expect((await byText("HV104")).suggestion).toMatchObject({ kind: "tuition", sure: false, advance: 100_000 });
    expect((await byText("HD0001")).suggestion).toMatchObject({ kind: "invoice", sure: true, invoice_number: "HD0001", advance: 0 });
    expect((await byText("NOP VON")).suggestion).toMatchObject({ kind: "existing", sure: true, number: "BC0001" });
    for (const t of ["PHI QUAN LY", "TRA LAI", "CHUYEN TIEN NHAM"]) expect((await byText(t)).status).toBe("new");
  });

  it("quyền xem: thành viên xem được; HLV và người ngoài thì không", async () => {
    expect(await lines(viewer)).toHaveLength(9);
    await expect(lines(coach)).rejects.toThrow(/không thuộc đơn vị/);
    await expect(lines(outsider)).rejects.toThrow(/không thuộc đơn vị/);
    await expect(rpc(viewer, "public.bank_confirm($1, $2)", [tenant, [(await byText("HV101")).id]])).rejects.toThrow(/không có quyền/);
  });

  it("xác nhận gợi ý: lập BC Nợ 1121 / Có 131 trừ đúng hóa đơn, ngày giao dịch; chứng từ có sẵn chỉ gắn", async () => {
    const ids = await Promise.all(["HV101", "HV102", "HV104", "HD0001", "NOP VON"].map(async (t) => (await byText(t)).id));
    const r = await rpc<{ confirmed: number; failed: number; results: Array<{ ok: boolean; kind: string; voucher_id: string; number: string }> }>(
      owner,
      "public.bank_confirm($1, $2)",
      [tenant, ids],
    );
    expect(r).toMatchObject({ confirmed: 5, failed: 0 });

    const hv101 = await byText("HV101");
    expect(hv101.status).toBe("matched");
    const [v] = (
      await pool.query<{ voucher_type: string; header_account: string; posting_date: string; source: string; status: string; original_documents: string }>(
        "select voucher_type, header_account, posting_date::text, source, status, original_documents from public.vouchers where number = $1 and tenant_id = $2",
        [hv101.voucher_number, tenant],
      )
    ).rows;
    expect(v).toEqual({ voucher_type: "BC", header_account: "1121", posting_date: "2026-10-05", source: "import", status: "posted", original_documents: "Sao kê 1121 · FT1" });
    expect(await remaining(bill["HV101-09"]!)).toBe(0);
    expect(await remaining(bill["HV101-10"]!)).toBe(0);
    expect(await remaining(bill["HV102-10"]!)).toBe(0);
    expect(await remaining(bill["HV102-09"]!)).toBe(600_000);
    expect(await remaining("HD0001")).toBe(0);

    // HV104 trả thừa: 600.000 trừ hóa đơn, 100.000 Có 131 trả trước (không gắn hóa đơn)
    const v104 = (await byText("HV104")).voucher_number!;
    const credits = await pool.query<{ amount: string; invoice_id: string | null }>(
      "select l.amount::text, l.invoice_id from public.voucher_lines l join public.vouchers v on v.id = l.voucher_id where v.number = $1 and v.tenant_id = $2 order by l.amount desc",
      [v104, tenant],
    );
    expect(credits.rows.map((c) => [Number(c.amount), c.invoice_id !== null])).toEqual([
      [600_000, true],
      [100_000, false],
    ]);

    // Chứng từ có sẵn: không lập thêm, gắn BC0001
    expect((await byText("NOP VON")).voucher_number).toBe("BC0001");
    expect(await gl(manualBc)).toEqual([
      ["1121", 5_000_000, 0],
      ["4111", 0, 5_000_000],
    ]);

    // Xác nhận lại: không có gợi ý nữa
    const again = await rpc<{ confirmed: number; failed: number; results: Array<{ error: string }> }>(owner, "public.bank_confirm($1, $2)", [tenant, ids.slice(0, 1)]);
    expect(again).toMatchObject({ confirmed: 0, failed: 1 });
    expect(again.results[0]!.error).toMatch(/Không có gợi ý/);
  });

  it("dòng chưa khớp: lập BN phí ngân hàng (6422), BC lãi tiền gửi (515); bỏ qua khoản lạ", async () => {
    const fee = await byText("PHI QUAN LY");
    await expect(rpc(owner, "public.bank_create_voucher($1, $2, $3::jsonb)", [tenant, fee.id, JSON.stringify({ account: "642" })])).rejects.toThrow(/phải là TK chi tiết/);
    await expect(rpc(owner, "public.bank_create_voucher($1, $2, $3::jsonb)", [tenant, fee.id, JSON.stringify({ account: "1121" })])).rejects.toThrow(/trùng TK ngân hàng/);
    const r = await rpc<{ voucher_id: string; number: string }>(owner, "public.bank_create_voucher($1, $2, $3::jsonb)", [
      tenant,
      fee.id,
      JSON.stringify({ account: "6422", description: "Phí quản lý tài khoản T10" }),
    ]);
    expect(r.number).toMatch(/^BN/);
    expect(await gl(r.voucher_id)).toEqual([
      ["6422", 11_000, 0],
      ["1121", 0, 11_000],
    ]);
    const interest = await rpc<{ voucher_id: string }>(owner, "public.bank_create_voucher($1, $2, $3::jsonb)", [tenant, (await byText("TRA LAI")).id, JSON.stringify({ account: "515" })]);
    expect(await gl(interest.voucher_id)).toEqual([
      ["1121", 5_000, 0],
      ["515", 0, 5_000],
    ]);
    await expect(rpc(owner, "public.bank_create_voucher($1, $2, $3::jsonb)", [tenant, fee.id, JSON.stringify({ account: "6422" })])).rejects.toThrow(/đã khớp/);

    const stray = await byText("CHUYEN TIEN NHAM");
    await rpc(owner, "public.bank_ignore($1, $2, true)", [tenant, stray.id]);
    expect((await byText("CHUYEN TIEN NHAM")).status).toBe("ignored");
    await expect(rpc(owner, "public.bank_ignore($1, $2, true)", [tenant, fee.id])).rejects.toThrow(/chưa khớp/);
  });

  it("gắn tay / bỏ khớp: số tiền ghi TK ngân hàng phải bằng dòng sao kê; một chứng từ chỉ khớp một dòng", async () => {
    const hv103 = await byText("HPHV103");
    await expect(rpc(owner, "public.bank_link($1, $2, $3)", [tenant, hv103.id, manualBn])).rejects.toThrow(/khác dòng sao kê/);
    await expect(rpc(owner, "public.bank_link($1, $2, $3)", [tenant, hv103.id, manualBc])).rejects.toThrow(/đã khớp với một dòng sao kê khác/);

    const vonGop = await byText("NOP VON");
    await rpc(owner, "public.bank_unlink($1, $2)", [tenant, vonGop.id]);
    expect((await byText("NOP VON")).status).toBe("suggested");
    await rpc(owner, "public.bank_link($1, $2, $3)", [tenant, vonGop.id, manualBc]);
    expect((await byText("NOP VON")).status).toBe("matched");
  });

  it("kỳ đã khóa sổ: dòng lỗi được báo riêng, không lập chứng từ", async () => {
    await rpc(owner, "public.lock_period($1, $2)", [tenant, "2026-10-31"]);
    const hv103 = await byText("HPHV103");
    const r = await rpc<{ confirmed: number; failed: number; results: Array<{ ok: boolean; error: string }> }>(owner, "public.bank_confirm($1, $2)", [tenant, [hv103.id]]);
    expect(r).toMatchObject({ confirmed: 0, failed: 1 });
    expect(r.results[0]!.error).toMatch(/khóa/);
    expect((await byText("HPHV103")).status).toBe("suggested");
  });

  it("đối chiếu TK 1121 đến 31/10: số dư sổ, số dư sao kê, chênh lệch, dòng chưa khớp, chứng từ chưa có trên sao kê", async () => {
    const r = await rpc<{
      book_balance: number;
      statement_balance: number;
      difference: number;
      unmatched_count: number;
      unmatched_in: number;
      book_only: Array<{ number: string; amount: number }>;
    }>(viewer, "public.rpt_bank_reconciliation($1, '1121', '2026-10-31')", [tenant]);
    // Sổ: 1.200.000 + 600.000 + 700.000 + 220.000 + 5.000.000 − 11.000 + 5.000 − 300.000 (BN chưa có trên sao kê)
    expect(Number(r.book_balance)).toBe(7_414_000);
    expect(Number(r.statement_balance)).toBe(8_664_000);
    // Chênh lệch = HV103 chưa ghi sổ 900.000 + khoản lạ bỏ qua 50.000 + BN 300.000 chưa có trên sao kê
    expect(Number(r.difference)).toBe(1_250_000);
    expect(r).toMatchObject({ unmatched_count: 1 });
    expect(Number(r.unmatched_in)).toBe(900_000);
    expect(r.book_only.map((b) => [b.number, Number(b.amount)])).toEqual([["BN0001", -300_000]]);
    await expect(rpc(coach, "public.rpt_bank_reconciliation($1, '1121', '2026-10-31')", [tenant])).rejects.toThrow(/không thuộc đơn vị/);
  });

  it("xóa lần nhập sao kê: dòng sao kê mất, chứng từ đã lập vẫn giữ", async () => {
    const [s] = (await pool.query<{ id: string }>("select id from public.bank_statements where tenant_id = $1 and inserted = 9", [tenant])).rows;
    const before = Number((await pool.query<{ n: string }>("select count(*) as n from public.vouchers where tenant_id = $1", [tenant])).rows[0]!.n);
    expect(await rpc<number>(owner, "public.delete_bank_statement($1, $2)", [tenant, s!.id])).toBe(9);
    expect(await lines()).toHaveLength(0);
    expect(Number((await pool.query<{ n: string }>("select count(*) as n from public.vouchers where tenant_id = $1", [tenant])).rows[0]!.n)).toBe(before);
  });
});
