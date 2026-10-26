import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createTenant, createUser, pool, q } from "./db";

let owner: string;
let viewer: string;
let outsider: string;
let tenant: string;

interface TuitionItem {
  class_code: string;
  student_code: string;
  period_start: string;
  amount: number;
  status: "new" | "created" | "exists";
  number?: string;
  voucher_id?: string;
}
interface TuitionResult {
  ok: boolean;
  new: number;
  created: number;
  existing: number;
  total: number;
  items: TuitionItem[];
}

const saveClass = async (c: Record<string, unknown>, user = owner) =>
  (await q<{ id: string }>(user, "select public.save_class($1, $2::jsonb) as id", [tenant, JSON.stringify(c)]))[0]!.id;
const saveStudent = async (s: Record<string, unknown>) =>
  (await q<{ id: string }>(owner, "select public.save_student($1, $2::jsonb) as id", [tenant, JSON.stringify(s)]))[0]!.id;
const enroll = async (e: Record<string, unknown>) =>
  (await q<{ id: string }>(owner, "select public.save_enrollment($1, $2::jsonb) as id", [tenant, JSON.stringify(e)]))[0]!.id;
const generate = async (month: string, opts: { post?: boolean; dry?: boolean; date?: string } = {}, user = owner) =>
  (
    await q<{ r: TuitionResult }>(user, "select public.generate_tuition($1, $2, null, $3, $4, $5) as r", [
      tenant,
      month,
      opts.date ?? month,
      opts.post ?? true,
      opts.dry ?? false,
    ])
  )[0]!.r;
const status = (user = owner, month: string | null = null) =>
  q<{ student_code: string; class_code: string; period_start: string; amount: string; paid: string; remaining: string; invoice_status: string; bill_id: string }>(
    user,
    "select * from public.rpt_tuition_status($1, null, null, $2)",
    [tenant, month],
  );
const count = async (sql: string) => Number((await pool.query<{ n: string }>(sql, [tenant])).rows[0]!.n);

beforeAll(async () => {
  owner = await createUser();
  viewer = await createUser();
  outsider = await createUser();
  tenant = await createTenant(owner);
  await addMember(tenant, viewer, "viewer");
});

afterAll(async () => {
  await pool.end();
});

describe("học viên, lớp học, học phí thu trước (3387)", () => {
  let tot: string;
  let ma: string;
  let hv1: string;
  let hv2: string;
  let hv3: string;

  it("lớp theo tháng / theo khóa; lớp theo khóa phải có số buổi", async () => {
    tot = await saveClass({ code: "tot-k12", name: "Lớp Tốt K12", level: "tot", billing: "monthly", fee: 600_000, schedule: "Sáng thứ 7" });
    ma = await saveClass({ code: "MA-K1", name: "Lớp Mã K1", level: "ma", billing: "course", fee: 2_400_000, sessions_per_course: 12 });
    await expect(saveClass({ code: "X", name: "Lỗi", billing: "course", fee: 1 })).rejects.toThrow(/cần số buổi/);
    await expect(saveClass({ code: "Y", name: "Lỗi", billing: "monthly", fee: 1 }, viewer)).rejects.toThrow(/không có quyền/);
    const [j] = await q<{ code: string; kind: string }>(owner, "select code, kind from public.jobs where id = $1", [tot]);
    expect(j).toEqual({ code: "TOT-K12", kind: "class" });
  });

  it("nhập học viên từ Excel: báo lỗi theo dòng, rồi tạo học viên + ghi danh", async () => {
    const bad = await q<{ r: { ok: boolean; errors: { row: number; message: string }[] } }>(owner, "select public.import_students($1, $2::jsonb) as r", [
      tenant,
      JSON.stringify([
        { row: 2, code: "", name: "A" },
        { row: 3, code: "HV9", name: "B", level: "si" },
        { row: 4, code: "HV9", name: "C", class_code: "KHONGCO" },
      ]),
    ]);
    expect(bad[0]!.r.ok).toBe(false);
    expect(bad[0]!.r.errors.map((e) => e.message)).toEqual(["Thiếu mã học viên", "Cấp phải là tot, ma, tuong, xe, hau hoặc vua", "Trùng mã HV9 trong tệp"]);

    const [ok] = await q<{ r: { ok: boolean; inserted: number; enrolled: number } }>(owner, "select public.import_students($1, $2::jsonb) as r", [
      tenant,
      JSON.stringify([
        { row: 2, code: "hv001", name: "Nguyễn Minh An", birth_date: "2016-05-01", guardian_name: "Nguyễn Văn Bố", guardian_phone: "0900000001", level: "tot", class_code: "TOT-K12", start_date: "2026-11-01" },
        { row: 3, code: "HV002", name: "Trần Bảo Ngọc", guardian_phone: "0900000002", class_code: "tot-k12", start_date: "2026-11-01" },
      ]),
    ]);
    expect(ok!.r).toMatchObject({ ok: true, inserted: 2, enrolled: 2 });
    const ids = await q<{ id: string; code: string; is_student: boolean; phone: string }>(
      owner,
      "select id, code, is_student, phone from public.partners where tenant_id = $1 and code in ('HV001', 'HV002') order by code",
      [tenant],
    );
    expect(ids.map((p) => [p.code, p.is_student, p.phone])).toEqual([
      ["HV001", true, "0900000001"],
      ["HV002", true, "0900000002"],
    ]);
    hv1 = ids[0]!.id;
    hv2 = ids[1]!.id;
    const [prof] = await q<{ guardian_name: string; level: string }>(owner, "select guardian_name, level from public.student_profiles where partner_id = $1", [hv1]);
    expect(prof).toEqual({ guardian_name: "Nguyễn Văn Bố", level: "tot" });
  });

  it("ghi danh: giảm học phí riêng; không ghi danh trùng lớp đang học", async () => {
    hv3 = await saveStudent({ code: "HV003", name: "Lê Gia Huy", level: "tot" });
    await enroll({ class_id: tot, student_id: hv3, start_date: "2026-11-01", end_date: "2026-11-30", fee: 500_000 });
    await expect(enroll({ class_id: tot, student_id: hv1, start_date: "2026-11-15" })).rejects.toThrow(/đang học lớp này/);
    await enroll({ class_id: ma, student_id: hv2, start_date: "2026-11-05" });
  });

  it("chạy thử lập học phí tháng 11: không ghi gì", async () => {
    const before = await count("select count(*) as n from public.vouchers where tenant_id = $1");
    const r = await generate("2026-11-01", { dry: true });
    expect(r).toMatchObject({ ok: true, new: 4, created: 0, existing: 0, total: 4_100_000 });
    expect(r.items.map((i) => [i.class_code, i.student_code, Number(i.amount), i.status])).toEqual([
      ["MA-K1", "HV002", 2_400_000, "new"],
      ["TOT-K12", "HV001", 600_000, "new"],
      ["TOT-K12", "HV002", 600_000, "new"],
      ["TOT-K12", "HV003", 500_000, "new"],
    ]);
    expect(await count("select count(*) as n from public.vouchers where tenant_id = $1")).toBe(before);
    expect(await count("select count(*) as n from public.tuition_bills where tenant_id = $1")).toBe(0);
  });

  it("lập học phí tháng 11: hóa đơn dịch vụ Nợ 131 / Có 3387 theo lớp; chạy lại không trùng", async () => {
    const r = await generate("2026-11-01");
    expect(r).toMatchObject({ new: 4, created: 4, existing: 0 });
    const hd = r.items.find((i) => i.student_code === "HV001")!;
    expect(hd.status).toBe("created");
    expect(hd.number).toMatch(/^DV/);
    const gl = await q<{ account: string; debit: string; credit: string; job_id: string; partner_id: string }>(
      owner,
      "select account, debit, credit, job_id, partner_id from public.gl_entries where voucher_id = $1 order by account",
      [hd.voucher_id],
    );
    expect(gl.map((g) => [g.account, g.debit, g.credit])).toEqual([
      ["131", "600000.00", "0.00"],
      ["3387", "0.00", "600000.00"],
    ]);
    expect(gl.every((g) => g.job_id === tot && g.partner_id === hv1)).toBe(true);
    // Lớp theo khóa: kỳ tính từ ngày vào lớp, 12 buổi
    const [course] = await q<{ period_start: string; sessions: number; amount: string }>(
      owner,
      "select period_start::text, sessions, amount from public.tuition_bills b join public.enrollments e on e.id = b.enrollment_id where e.class_id = $1",
      [ma],
    );
    expect(course).toEqual({ period_start: "2026-11-05", sessions: 12, amount: "2400000.00" });
    expect(await generate("2026-11-01")).toMatchObject({ new: 0, existing: 4 });
  });

  it("tháng 12: lớp tháng lập tiếp (trừ học viên đã kết thúc), lớp khóa không lập lại", async () => {
    const r = await generate("2026-12-01", { post: false });
    expect(r.items.filter((i) => i.status === "created").map((i) => i.student_code)).toEqual(["HV001", "HV002"]);
    expect(r.items.filter((i) => i.status === "exists").map((i) => [i.class_code, i.student_code])).toEqual([["MA-K1", "HV002"]]);
  });

  it("thu học phí: tiền mặt / chuyển khoản, mỗi học viên một phiếu trừ đúng hóa đơn; hóa đơn nháp được ghi sổ trước", async () => {
    const nov = await status(owner, "2026-11-01");
    const bill = (code: string, cls = "TOT-K12") => nov.find((s) => s.student_code === code && s.class_code === cls)!.bill_id;
    const [cash] = await q<{ r: { vouchers: { number: string; amount: number }[]; total: number } }>(
      owner,
      "select public.pay_tuition($1, $2::uuid[], 'cash', '2026-11-03') as r",
      [tenant, [bill("HV001")]],
    );
    expect(cash!.r.vouchers).toHaveLength(1);
    expect(cash!.r.vouchers[0]!.number).toMatch(/^PT/);
    expect(Number(cash!.r.total)).toBe(600_000);

    const [bank] = await q<{ r: { vouchers: { number: string; amount: number }[] } }>(owner, "select public.pay_tuition($1, $2::uuid[], 'bank', '2026-11-06') as r", [
      tenant,
      [bill("HV002"), bill("HV002", "MA-K1")],
    ]);
    expect(bank!.r.vouchers.map((v) => [v.number.slice(0, 2), Number(v.amount)])).toEqual([["BC", 3_000_000]]);

    const after = await status(owner, "2026-11-01");
    expect(after.map((s) => [s.class_code, s.student_code, s.paid, s.remaining])).toEqual([
      ["MA-K1", "HV002", "2400000.00", "0.00"],
      ["TOT-K12", "HV001", "600000.00", "0.00"],
      ["TOT-K12", "HV002", "600000.00", "0.00"],
      ["TOT-K12", "HV003", "0.00", "500000.00"],
    ]);

    // Học phí tháng 12 còn nháp: thu thì ghi sổ hóa đơn trước
    const dec = await status(owner, "2026-12-01");
    expect(dec.every((s) => s.invoice_status === "draft")).toBe(true);
    await q(owner, "select public.pay_tuition($1, $2::uuid[], 'cash', '2026-12-02')", [tenant, [dec.find((s) => s.student_code === "HV001")!.bill_id]]);
    const dec2 = await status(owner, "2026-12-01");
    expect(dec2.find((s) => s.student_code === "HV001")).toMatchObject({ invoice_status: "posted", remaining: "0.00" });
    // Thu lại học phí đã đủ: không tạo phiếu
    const [again] = await q<{ r: { vouchers: unknown[] } }>(owner, "select public.pay_tuition($1, $2::uuid[]) as r", [tenant, [bill("HV001")]]);
    expect(again!.r.vouchers).toEqual([]);
  });

  it("số dư 3387 bằng tổng học phí đã lập và ghi sổ; công nợ 131 khớp tình hình học phí", async () => {
    const [b] = await q<{ d387: string; d131: string }>(
      owner,
      `select sum(credit - debit) filter (where account = '3387')::text as d387, sum(debit - credit) filter (where account = '131')::text as d131
       from public.gl_entries where tenant_id = $1`,
      [tenant],
    );
    // 4.100.000 (tháng 11) + 600.000 (HV001 tháng 12 đã ghi sổ khi thu)
    expect(b!.d387).toBe("4700000.00");
    const remaining = (await status()).filter((s) => s.invoice_status === "posted").reduce((sum, s) => sum + Number(s.remaining), 0);
    expect(Number(b!.d131)).toBe(remaining);
  });

  it("phân quyền: người xem thấy tình hình học phí nhưng không lập/thu được; người ngoài không thấy", async () => {
    expect((await status(viewer)).length).toBeGreaterThan(0);
    await expect(generate("2027-01-01", {}, viewer)).rejects.toThrow(/không có quyền/);
    await expect(q(viewer, "select public.pay_tuition($1, $2::uuid[])", [tenant, [(await status())[0]!.bill_id]])).rejects.toThrow(/không có quyền/);
    expect(await status(outsider)).toEqual([]);
    await expect(q(viewer, "insert into public.classes (job_id, tenant_id) values ($1, $2)", [tot, tenant])).rejects.toThrow();
  });

  it("tài khoản nhận học phí (VietQR): mã ngân hàng 6 số", async () => {
    await q(owner, "update public.tenants set bank_bin = '970436', bank_account_no = '0123456789', bank_account_name = 'CTY CP CO VUA DUONG SINH' where id = $1", [tenant]);
    await expect(q(owner, "update public.tenants set bank_bin = 'VCB' where id = $1", [tenant])).rejects.toThrow();
  });
});
