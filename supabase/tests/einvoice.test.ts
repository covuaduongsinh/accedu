import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createPartner, createTenant, createUser, pool, q } from "./db";

let owner: string;
let viewer: string;
let tenant: string;
let supplier: string;

interface ImportResult {
  ok: boolean;
  dry_run: boolean;
  created: number;
  new: number;
  skipped: number;
  errors: number;
  partners_created: number;
  results: Array<{ row: number; status: string; number?: string; voucher_id?: string; partner?: string; message?: string }>;
}

const run = async (invoices: unknown[], dryRun: boolean, user = owner) => {
  const [r] = await q<{ r: ImportResult }>(user, "select public.import_purchase_invoices($1, $2::jsonb, $3) as r", [
    tenant,
    JSON.stringify(invoices),
    dryRun,
  ]);
  return r!.r;
};

/** Hóa đơn đã đọc từ XML (dữ liệu giả) */
const books = {
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
    { description: "Sách cờ vua nhập môn", uom: "Cuốn", quantity: 10, unit_price: 80_000, amount: 800_000, vat_code: "5", vat_amount: 40_000 },
    { description: "Bàn cờ gỗ tiêu chuẩn", uom: "Bộ", quantity: 3, unit_price: 333_333, amount: 999_999, vat_code: "10", vat_amount: 100_000 },
  ],
};
const rent = {
  row: 2,
  voucher_type: "HMV",
  posting_date: "2026-10-21",
  invoice_date: "2026-10-21",
  line_account: "6427",
  seller: { name: "Công ty Dịch vụ Sân Mẫu", tax_code: "0107777777-001", address: "Số 2 Phố Mẫu" },
  invoice_series: "1C26TDV",
  invoice_series_short: "C26TDV",
  invoice_number: "45",
  lines: [{ description: "Phí thuê sân thi đấu", amount: 5_000_000, vat_code: "10", vat_amount: 500_000 }],
};

const counts = async () => {
  const { rows } = await pool.query<{ vouchers: string; partners: string; counters: string }>(
    `select (select count(*) from public.vouchers where tenant_id = $1) as vouchers,
            (select count(*) from public.partners where tenant_id = $1) as partners,
            (select coalesce(sum(c.last_number), 0) from public.voucher_book_counters c
               join public.voucher_books b on b.id = c.book_id where b.tenant_id = $1) as counters`,
    [tenant],
  );
  return rows[0];
};

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  tenant = await createTenant(owner, "TT99");
  await addMember(tenant, viewer, "viewer");
  supplier = await createPartner(owner, tenant, "NCC01");
  await pool.query("update public.partners set tax_code = '0109999991', is_supplier = true, payment_term_days = 30 where id = $1", [supplier]);
});

afterAll(async () => {
  await pool.end();
});

describe("nhập hóa đơn điện tử đầu vào", () => {
  it("chạy thử: trả trạng thái từng hóa đơn, không ghi gì (kể cả số chứng từ, nhà cung cấp mới)", async () => {
    const before = await counts();
    const r = await run([books, rent], true);
    expect(r).toMatchObject({ ok: true, dry_run: true, created: 0, new: 2, skipped: 0, partners_created: 1 });
    expect(r.results).toEqual([
      { row: 1, status: "new", partner: "existing", items: { matched: 0, lines: 2 } },
      { row: 2, status: "new", partner: "new", items: { matched: 0, lines: 1 } },
    ]);
    expect(await counts()).toEqual(before);
  });

  it("tạo hóa đơn mua nháp; nhà cung cấp tìm theo MST hoặc tạo mới; ghi sổ ra đúng bút toán", async () => {
    const r = await run([books, rent], false);
    expect(r).toMatchObject({ ok: true, created: 2, partners_created: 1 });
    expect(r.results.map((x) => [x.status, x.number, x.partner])).toEqual([
      ["created", "MH0001", "existing"],
      ["created", "MV0001", "new"],
    ]);
    const [hdm] = await q<{ status: string; partner_id: string; partner_tax_code: string; invoice_series: string; total_amount: string; due_date: string; source: string }>(
      owner,
      "select status, partner_id, partner_tax_code, invoice_series, total_amount, to_char(due_date, 'YYYY-MM-DD') as due_date, source from public.vouchers where id = $1",
      [r.results[0]!.voucher_id],
    );
    expect(hdm).toEqual({
      status: "draft",
      partner_id: supplier,
      partner_tax_code: "0109999991",
      invoice_series: "1C26TSM",
      total_amount: "1939999.00",
      due_date: "2026-11-19",
      source: "import",
    });
    const [ncc] = await q<{ code: string; name: string; tax_code: string; is_supplier: boolean; is_customer: boolean }>(
      owner,
      "select code, name, tax_code, is_supplier, is_customer from public.partners where tenant_id = $1 and tax_code = '0107777777-001'",
      [tenant],
    );
    expect(ncc).toEqual({ code: "0107777777-001", name: "Công ty Dịch vụ Sân Mẫu", tax_code: "0107777777-001", is_supplier: true, is_customer: false });

    await q(owner, "select public.post_voucher($1)", [r.results[0]!.voucher_id]);
    const gl = await q<{ account: string; debit: string; credit: string }>(
      owner,
      "select account, sum(debit) as debit, sum(credit) as credit from public.gl_entries where voucher_id = $1 group by account order by account",
      [r.results[0]!.voucher_id],
    );
    expect(gl).toEqual([
      { account: "1331", debit: "140000.00", credit: "0.00" },
      { account: "1561", debit: "1799999.00", credit: "0.00" },
      { account: "331", debit: "0.00", credit: "1939999.00" },
    ]);
  });

  it("nhập lại: hóa đơn đã có thì bỏ qua (không phân biệt số 0 đầu, ký hiệu có/không mẫu số)", async () => {
    const before = await counts();
    const r = await run([{ ...books, invoice_number: "123" }, { ...rent, invoice_series: "C26TDV" }], false);
    expect(r).toMatchObject({ ok: true, created: 0, skipped: 2, partners_created: 0 });
    expect(r.results.map((x) => [x.status, x.number])).toEqual([
      ["exists", "MH0001"],
      ["exists", "MV0001"],
    ]);
    expect(await counts()).toEqual(before);
  });

  it("một hóa đơn lỗi thì cả lô không ghi; báo lỗi theo dòng", async () => {
    const before = await counts();
    const good = { ...books, row: 1, invoice_number: "200", seller: { name: "Nhà sách Mẫu Ba", tax_code: "0105555555" } };
    const badAccount = { ...rent, row: 2, invoice_number: "46", line_account: "999" };
    const badVat = { ...rent, row: 3, invoice_number: "47", lines: [{ description: "Phí", amount: 100, vat_code: "7" }] };
    const r = await run([good, badAccount, badVat], false);
    expect(r).toMatchObject({ ok: false, created: 0, new: 1, errors: 2 });
    expect(r.results[0]).toEqual({ row: 1, status: "new", partner: "new", items: { matched: 0, lines: 2 } });
    expect(r.results[1]).toMatchObject({ row: 2, status: "error", message: "TK 999 không tồn tại hoặc không phải tài khoản chi tiết" });
    expect(r.results[2]?.message).toMatch(/mã thuế 7 không hợp lệ/);
    expect(await counts()).toEqual(before);
  });

  it("vai trò chỉ xem không được nhập", async () => {
    await expect(run([books], true, viewer)).rejects.toThrow(/không có quyền nhập hóa đơn/);
  });
});
