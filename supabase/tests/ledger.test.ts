import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createPartner, createTenant, createUser, pool, q, saveVoucher } from "./db";

let owner: string;
let outsider: string;
let tenant: string;
let customer: string;

beforeAll(async () => {
  owner = await createUser();
  outsider = await createUser();
  tenant = await createTenant(owner);
  customer = await createPartner(owner, tenant, "HV001");
});

afterAll(async () => {
  await pool.end();
});

describe("khởi tạo đơn vị", () => {
  it("tạo tenant kèm hệ thống tài khoản TT99, chủ sở hữu, quyển chứng từ", async () => {
    const [stat] = await q<{ accounts: string; postable: string; books: string; role: string }>(
      owner,
      `select (select count(*) from public.accounts where tenant_id = $1) as accounts,
              (select count(*) from public.accounts where tenant_id = $1 and is_postable) as postable,
              (select count(*) from public.voucher_books where tenant_id = $1) as books,
              (select role from public.my_tenants where id = $1) as role`,
      [tenant],
    );
    expect(Number(stat!.accounts)).toBe(227);
    expect(Number(stat!.books)).toBe(15);
    expect(stat!.role).toBe("owner");
    const [a111] = await q<{ is_postable: boolean; level: number }>(
      owner,
      "select is_postable, level from public.accounts where tenant_id = $1 and code in ('111', '1111') order by code",
      [tenant],
    );
    expect(a111!.is_postable).toBe(false);
    expect(Number(stat!.postable)).toBeGreaterThan(150);
  });

  it("thêm tài khoản con làm tài khoản mẹ hết là tài khoản chi tiết", async () => {
    await q(owner, "insert into public.accounts (tenant_id, code, name, parent_code, kind) values ($1, '11211', 'Vietcombank', '1121', 'asset')", [tenant]);
    const rows = await q<{ code: string; is_postable: boolean; level: number }>(
      owner,
      "select code, is_postable, level from public.accounts where tenant_id = $1 and code in ('1121', '11211') order by code",
      [tenant],
    );
    expect(rows).toEqual([
      { code: "1121", is_postable: false, level: 2 },
      { code: "11211", is_postable: true, level: 3 },
    ]);
  });
});

describe("RLS — cô lập dữ liệu giữa các đơn vị", () => {
  it("người ngoài không thấy tài khoản / đối tượng / chứng từ", async () => {
    const rows = await q(outsider, "select count(*)::int as n from public.accounts where tenant_id = $1", [tenant]);
    expect(rows[0]).toEqual({ n: 0 });
    const t = await q(outsider, "select * from public.tenants where id = $1", [tenant]);
    expect(t).toHaveLength(0);
  });

  it("người ngoài không lập được chứng từ / không sửa được danh mục", async () => {
    await expect(
      saveVoucher(outsider, {
        tenant_id: tenant,
        voucher_type: "PT",
        posting_date: "2026-10-01",
        lines: [{ credit_account: "5113", amount: 1000 }],
      }),
    ).rejects.toThrow(/không thuộc đơn vị/);
    await expect(
      q(outsider, "insert into public.partners (tenant_id, code, name) values ($1, 'X', 'X')", [tenant]),
    ).rejects.toThrow(/row-level security/);
  });

  it("client không ghi trực tiếp được vào sổ cái", async () => {
    await expect(
      q(owner, "insert into public.gl_entries (tenant_id, voucher_id, voucher_type, voucher_number, issue_date, posting_date, line_no, account, debit) values ($1, gen_random_uuid(), 'PK', 'X', now(), now(), 1, '1111', 1)", [tenant]),
    ).rejects.toThrow(/row-level security|permission denied/);
  });
});

describe("lập & ghi sổ chứng từ", () => {
  it("phiếu thu: tự điền TK Nợ 1111, cấp số PT0001, ghi sổ sinh 2 bút toán", async () => {
    const id = await saveVoucher(
      owner,
      {
        tenant_id: tenant,
        voucher_type: "PT",
        posting_date: "2026-10-05",
        partner_id: customer,
        description: "Thu học phí lớp Tốt tháng 10",
        lines: [{ credit_account: "131", amount: 1_500_000 }],
      },
      true,
    );
    const [v] = await q<{ number: string; status: string; total_amount: string }>(
      owner,
      "select number, status, total_amount from public.vouchers where id = $1",
      [id],
    );
    expect(v).toEqual({ number: "PT0001", status: "posted", total_amount: "1500000.00" });
    const gl = await q<{ account: string; contra_account: string; debit: string; credit: string }>(
      owner,
      "select account, contra_account, debit, credit from public.gl_entries where voucher_id = $1 order by debit desc",
      [id],
    );
    expect(gl).toEqual([
      { account: "1111", contra_account: "131", debit: "1500000.00", credit: "0.00" },
      { account: "131", contra_account: "1111", debit: "0.00", credit: "1500000.00" },
    ]);
  });

  it("số chứng từ tăng dần theo quyển", async () => {
    const id = await saveVoucher(owner, {
      tenant_id: tenant,
      voucher_type: "PT",
      posting_date: "2026-10-06",
      partner_id: customer,
      lines: [{ credit_account: "131", amount: 500_000 }],
    });
    const [v] = await q<{ number: string; status: string }>(owner, "select number, status from public.vouchers where id = $1", [id]);
    expect(v).toEqual({ number: "PT0002", status: "draft" });
  });

  it("từ chối tài khoản tổng hợp (không chi tiết)", async () => {
    await expect(
      saveVoucher(owner, { tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-07", lines: [{ debit_account: "642", amount: 100 }] }, true),
    ).rejects.toThrow(/không phải tài khoản chi tiết: 642/);
  });

  it("tài khoản công nợ bắt buộc có đối tượng", async () => {
    await expect(
      saveVoucher(owner, { tenant_id: tenant, voucher_type: "PT", posting_date: "2026-10-07", lines: [{ credit_account: "131", amount: 100 }] }, true),
    ).rejects.toThrow(/theo dõi công nợ/);
  });

  it("phiếu kế toán một vế: lệch Nợ/Có bị từ chối, cân thì ghi sổ với TK đối ứng", async () => {
    await expect(
      saveVoucher(owner, {
        tenant_id: tenant,
        voucher_type: "PK",
        posting_date: "2026-10-08",
        lines: [{ debit_account: "6427", amount: 300 }, { credit_account: "3388", amount: 299, partner_id: customer }],
      }, true),
    ).rejects.toThrow(/Nhóm định khoản 1/);

    const id = await saveVoucher(owner, {
      tenant_id: tenant,
      voucher_type: "PK",
      posting_date: "2026-10-08",
      description: "Chi phí điện nước văn phòng",
      lines: [
        { debit_account: "6427", amount: 1_000_000 },
        { debit_account: "1331", amount: 100_000 },
        { credit_account: "3388", amount: 1_100_000, partner_id: customer },
      ],
    }, true);
    const gl = await q<{ account: string; contra_account: string | null }>(
      owner,
      "select account, contra_account from public.gl_entries where voucher_id = $1 order by line_no",
      [id],
    );
    expect(gl).toEqual([
      { account: "6427", contra_account: "3388" },
      { account: "1331", contra_account: "3388" },
      { account: "3388", contra_account: null },
    ]);
  });

  it("không sửa được chứng từ đã ghi sổ; bỏ ghi sổ rồi sửa được", async () => {
    const id = await saveVoucher(owner, {
      tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-09",
      lines: [{ debit_account: "6428", amount: 200_000 }],
    }, true);
    const [v] = await q<{ number: string; version: number }>(owner, "select number, version from public.vouchers where id = $1", [id]);
    const edit = { id, tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-09", lines: [{ debit_account: "6428", amount: 250_000 }] };
    await expect(saveVoucher(owner, edit)).rejects.toThrow(/đã ghi sổ/);
    await q(owner, "select public.unpost_voucher($1)", [id]);
    await saveVoucher(owner, edit, true);
    const [after] = await q<{ number: string; total_amount: string; n: number }>(
      owner,
      "select number, total_amount, (select count(*)::int from public.gl_entries where voucher_id = $1) as n from public.vouchers where id = $1",
      [id],
    );
    expect(after).toEqual({ number: v!.number, total_amount: "250000.00", n: 2 });
  });

  it("phát hiện sửa đồng thời (version cũ)", async () => {
    const id = await saveVoucher(owner, {
      tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-10", lines: [{ debit_account: "6428", amount: 1 }],
    });
    await saveVoucher(owner, { id, version: 1, tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-10", lines: [{ debit_account: "6428", amount: 2 }] });
    await expect(
      saveVoucher(owner, { id, version: 1, tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-10", lines: [{ debit_account: "6428", amount: 3 }] }),
    ).rejects.toThrow(/người khác sửa/);
  });
});

describe("báo cáo", () => {
  it("bảng cân đối phát sinh luôn cân và tài khoản mẹ = tổng con", async () => {
    const rows = await q<{ account_code: string; level: number; debit: string; credit: string; closing_debit: string; closing_credit: string }>(
      owner,
      "select * from public.rpt_trial_balance($1, '2026-10-01', '2026-10-31')",
      [tenant],
    );
    const level1 = rows.filter((r) => r.level === 1);
    const sum = (k: "debit" | "credit" | "closing_debit" | "closing_credit") => level1.reduce((s, r) => s + Number(r[k]), 0);
    expect(sum("debit")).toBe(sum("credit"));
    expect(sum("closing_debit")).toBe(sum("closing_credit"));
    const r111 = rows.find((r) => r.account_code === "111");
    const r1111 = rows.find((r) => r.account_code === "1111");
    expect(r111?.debit).toBe(r1111?.debit);
    expect(Number(r111?.debit)).toBe(1_500_000);
  });

  it("sổ chi tiết tài khoản có số dư lũy kế", async () => {
    const rows = await q<{ row_kind: string; debit: string | null; credit: string | null; balance_debit: string | null; balance_credit: string | null }>(
      owner,
      "select * from public.rpt_account_ledger($1, '111', '2026-10-01', '2026-10-31')",
      [tenant],
    );
    expect(rows[0]?.row_kind).toBe("opening");
    const closing = rows.find((r) => r.row_kind === "closing");
    // Thu 1.500.000 – chi 250.000 = 1.250.000
    expect(Number(closing?.balance_debit)).toBe(1_250_000);
  });

  it("nhật ký chung liệt kê đủ bút toán đã ghi sổ", async () => {
    const rows = await q(owner, "select * from public.rpt_general_journal($1, '2026-10-01', '2026-10-31')", [tenant]);
    expect(rows.length).toBe(2 + 3 + 2);
  });
});

describe("khóa sổ & phân quyền", () => {
  it("vai trò chỉ xem không lập được chứng từ; thủ quỹ chỉ lập chứng từ tiền, không ghi sổ", async () => {
    const viewer = await createUser();
    const cashier = await createUser();
    await addMember(tenant, viewer, "viewer");
    await addMember(tenant, cashier, "cashier");
    await expect(
      saveVoucher(viewer, { tenant_id: tenant, voucher_type: "PT", posting_date: "2026-10-11", partner_id: customer, lines: [{ credit_account: "131", amount: 1 }] }),
    ).rejects.toThrow(/chỉ xem/);
    await expect(
      saveVoucher(cashier, { tenant_id: tenant, voucher_type: "PK", posting_date: "2026-10-11", lines: [{ debit_account: "6428", amount: 1 }, { credit_account: "1111", amount: 1 }] }),
    ).rejects.toThrow(/Thủ quỹ/);
    const id = await saveVoucher(cashier, { tenant_id: tenant, voucher_type: "PT", posting_date: "2026-10-11", partner_id: customer, lines: [{ credit_account: "131", amount: 1 }] });
    await expect(q(cashier, "select public.post_voucher($1)", [id])).rejects.toThrow(/quyền ghi sổ/);
  });

  it("khóa số liệu chặn lập/sửa/bỏ ghi chứng từ trong kỳ đã khóa", async () => {
    const id = await saveVoucher(owner, {
      tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-15", lines: [{ debit_account: "6428", amount: 10 }],
    }, true);
    await q(owner, "select public.lock_period($1, '2026-10-20')", [tenant]);
    await expect(q(owner, "select public.unpost_voucher($1)", [id])).rejects.toThrow(/đã khóa đến ngày 20\/10\/2026/);
    await expect(
      saveVoucher(owner, { tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-18", lines: [{ debit_account: "6428", amount: 10 }] }),
    ).rejects.toThrow(/đã khóa/);
    await saveVoucher(owner, { tenant_id: tenant, voucher_type: "PC", posting_date: "2026-10-21", lines: [{ debit_account: "6428", amount: 10 }] });
  });

  it("không lập chứng từ trước ngày bắt đầu nhập liệu", async () => {
    await expect(
      saveVoucher(owner, { tenant_id: tenant, voucher_type: "PC", posting_date: "2025-12-31", lines: [{ debit_account: "6428", amount: 10 }] }),
    ).rejects.toThrow(/ngày bắt đầu nhập liệu/);
  });
});
