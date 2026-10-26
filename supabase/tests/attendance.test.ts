import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createTenant, createUser, pool, q } from "./db";

// Điểm danh không cho ngày tương lai → dùng các tháng đã qua tính từ hôm nay
const ym = (monthsAgo: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString().slice(0, 7);
};
const M1 = ym(2);
const M2 = ym(1);
const day = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10);
};

let owner: string;
let coach: string;
let idleCoach: string;
let viewer: string;
let tenant: string;
let tot: string;
let ma: string;
let xe: string;
let hv1: string;
let hv2: string;
let hv3: string;

interface AllocItem {
  class_code: string;
  student_code: string;
  billing: string;
  amount: number;
  remaining: number;
  used_in_month: number | null;
}
interface AllocResult {
  ok: boolean;
  dry_run: boolean;
  count: number;
  total: number;
  voucher_id: string | null;
  number: string | null;
  replaced: string[];
  later_months: number;
  items: AllocItem[];
}
interface Roster {
  student_code: string;
  status: string | null;
  sessions: number | null;
  used: number | null;
  remaining: number | null;
}

const rpc = async <T>(user: string, sql: string, params: unknown[]) => (await q<{ r: T }>(user, `select ${sql} as r`, params))[0]!.r;
const saveClass = (c: Record<string, unknown>) => rpc<string>(owner, "public.save_class($1, $2::jsonb)", [tenant, JSON.stringify(c)]);
const saveStudent = (s: Record<string, unknown>) => rpc<string>(owner, "public.save_student($1, $2::jsonb)", [tenant, JSON.stringify(s)]);
const enroll = (e: Record<string, unknown>) => rpc<string>(owner, "public.save_enrollment($1, $2::jsonb)", [tenant, JSON.stringify(e)]);
const generate = (m: string, date: string) =>
  rpc<{ created: number }>(owner, "public.generate_tuition($1, $2, null, $3, true, false)", [tenant, `${m}-01`, date]);
const record = (user: string, cls: string, date: string, rows: { student_id: string; status: string | null }[], topic: string | null = null) =>
  rpc<{ saved: number; removed: number; session_id: string | null }>(user, "public.record_attendance($1, $2, $3, $4::jsonb, $5)", [
    tenant,
    cls,
    date,
    JSON.stringify(rows),
    topic,
  ]);
const roster = (user: string, cls: string, date: string) =>
  q<Roster>(user, "select * from public.class_roster($1, $2, $3)", [tenant, cls, date]);
const allocate = (m: string, opts: { dry?: boolean } = {}, user = owner) =>
  rpc<AllocResult>(user, "public.allocate_tuition_revenue($1, $2, true, $3)", [tenant, `${m}-01`, opts.dry ?? false]);
const balance = () =>
  q<{ student_code: string; enrollment_id: string; status: string; sessions: number; used: number; excused: number; remaining: number; billed: boolean }>(
    owner,
    "select * from public.rpt_course_balance($1, $2)",
    [tenant, ma],
  );
const gl = async (account: string) =>
  Number(
    (
      await pool.query<{ n: string }>("select coalesce(sum(credit - debit), 0)::text as n from public.gl_entries where tenant_id = $1 and account = $2", [
        tenant,
        account,
      ])
    ).rows[0]!.n,
  );

beforeAll(async () => {
  owner = await createUser();
  coach = await createUser();
  idleCoach = await createUser();
  viewer = await createUser();
  tenant = await createTenant(owner, "TT99", `${ym(6)}-01`);
  await addMember(tenant, coach, "coach");
  await addMember(tenant, idleCoach, "coach");
  await addMember(tenant, viewer, "viewer");

  tot = await saveClass({ code: "TOT-K20", name: "Lớp Tốt K20", level: "tot", billing: "monthly", fee: 600_000, coach_user_id: coach });
  ma = await saveClass({ code: "MA-K3", name: "Lớp Mã K3", level: "ma", billing: "course", fee: 1_000_000, sessions_per_course: 3, coach_user_id: coach });
  xe = await saveClass({ code: "XE-K1", name: "Lớp Xe K1", level: "xe", billing: "monthly", fee: 800_000 });
  hv1 = await saveStudent({ code: "HV201", name: "Phạm Minh Khôi" });
  hv2 = await saveStudent({ code: "HV202", name: "Đỗ Thu Hà" });
  hv3 = await saveStudent({ code: "HV203", name: "Vũ Gia Bảo", guardian_phone: "0900000203" });
  await enroll({ class_id: tot, student_id: hv1, start_date: `${M1}-01` });
  await enroll({ class_id: tot, student_id: hv2, start_date: `${M1}-01` });
  await enroll({ class_id: ma, student_id: hv3, start_date: `${M1}-01` });
  await generate(M1, `${M1}-01`);
});

afterAll(async () => {
  await pool.end();
});

describe("HLV điểm danh, số buổi còn lại, phân bổ doanh thu học phí 3387 → 5113", () => {
  it("vai trò HLV: thấy đơn vị và lớp mình phụ trách, không đọc được số liệu kế toán", async () => {
    const [mine] = await q<{ role: string }>(coach, "select role from public.my_tenants where id = $1", [tenant]);
    expect(mine!.role).toBe("coach");
    for (const table of ["vouchers", "voucher_lines", "gl_entries", "partners", "accounts", "tuition_bills", "enrollments", "classes", "student_profiles"]) {
      expect(await q(coach, `select 1 from public.${table} where tenant_id = $1`, [tenant]), table).toEqual([]);
    }
    expect(await q(coach, "select * from public.rpt_tuition_status($1)", [tenant])).toEqual([]);
    await expect(
      q(coach, "select public.save_voucher($1::jsonb)", [
        JSON.stringify({ tenant_id: tenant, voucher_type: "PK", posting_date: `${M1}-05`, lines: [{ debit_account: "6421", credit_account: "1111", amount: 1 }] }),
      ]),
    ).rejects.toThrow(/không thuộc đơn vị/);
    await expect(q(coach, "select public.list_members($1)", [tenant])).rejects.toThrow(/không thuộc đơn vị/);

    const classes = await q<{ code: string; is_mine: boolean; students: number }>(coach, "select * from public.my_classes($1)", [tenant]);
    expect(classes.map((c) => [c.code, c.is_mine, c.students])).toEqual([
      ["MA-K3", true, 1],
      ["TOT-K20", true, 2],
    ]);
    expect(await q(idleCoach, "select * from public.my_classes($1)", [tenant])).toEqual([]);
    expect((await q(viewer, "select * from public.my_classes($1)", [tenant])).length).toBe(3);
    await expect(roster(coach, xe, `${M1}-05`)).rejects.toThrow(/không phụ trách/);
    await expect(roster(idleCoach, tot, `${M1}-05`)).rejects.toThrow(/không phụ trách/);

    // Tài khoản HLV phải là thành viên đơn vị
    const stranger = await createUser();
    await expect(saveClass({ code: "XE-K1", name: "Lớp Xe K1", billing: "monthly", fee: 800_000, coach_user_id: stranger })).rejects.toThrow(
      /không thuộc đơn vị/,
    );
  });

  it("điểm danh: ghi / sửa một buổi, chặn ngày tương lai, học viên ngoài lớp, lớp không phụ trách", async () => {
    const r1 = await record(coach, tot, day(M1, 5), [
      { student_id: hv1, status: "present" },
      { student_id: hv2, status: "excused" },
    ], "Khai cuộc Ý");
    expect(r1.saved).toBe(2);
    await record(coach, tot, day(M1, 5), [{ student_id: hv2, status: "absent" }]);
    const rows = await roster(coach, tot, day(M1, 5));
    expect(rows.map((r) => [r.student_code, r.status])).toEqual([
      ["HV201", "present"],
      ["HV202", "absent"],
    ]);
    // HLV đọc được buổi học / điểm danh lớp mình (đồng bộ realtime)
    const [s] = await q<{ topic: string; n: string }>(
      coach,
      "select s.topic, (select count(*) from public.attendance a where a.session_id = s.id)::text as n from public.class_sessions s where s.class_id = $1",
      [tot],
    );
    expect(s).toEqual({ topic: "Khai cuộc Ý", n: "2" });

    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await expect(record(coach, tot, tomorrow, [{ student_id: hv1, status: "present" }])).rejects.toThrow(/Chưa đến ngày học/);
    await expect(record(coach, tot, day(M1, 6), [{ student_id: hv3, status: "present" }])).rejects.toThrow(/HV203 không học lớp này/);
    await expect(record(coach, xe, day(M1, 6), [])).rejects.toThrow(/không phụ trách/);
    await expect(record(viewer, tot, day(M1, 6), [])).rejects.toThrow(/không phụ trách/);

    // Bỏ hết điểm danh của một buổi → xóa buổi
    await record(owner, tot, day(M1, 12), [{ student_id: hv1, status: "present" }]);
    const cleared = await record(owner, tot, day(M1, 12), [{ student_id: hv1, status: null }]);
    expect(cleared).toMatchObject({ removed: 1, session_id: null });
  });

  it("lớp theo khóa: vắng có phép không trừ buổi; học vượt khóa → gia hạn khóa, học phí khóa mới", async () => {
    await record(coach, ma, day(M1, 3), [{ student_id: hv3, status: "present" }]);
    await record(coach, ma, day(M1, 10), [{ student_id: hv3, status: "absent" }]);
    await record(coach, ma, day(M1, 17), [{ student_id: hv3, status: "excused" }]);
    const [r] = await roster(coach, ma, day(M1, 17));
    expect(r).toMatchObject({ student_code: "HV203", status: "excused", sessions: 3, used: 2, remaining: 1 });
    expect((await balance())[0]).toMatchObject({ used: 2, excused: 1, remaining: 1, billed: true });

    await record(coach, ma, day(M2, 7), [{ student_id: hv3, status: "present" }]);
    await record(coach, ma, day(M2, 14), [{ student_id: hv3, status: "present" }]);
    const [over] = await balance();
    expect(over).toMatchObject({ used: 4, remaining: -1 });

    await expect(rpc(coach, "public.renew_course($1, $2)", [tenant, over!.enrollment_id])).rejects.toThrow(/không có quyền/);
    const renewed = await rpc<string>(owner, "public.renew_course($1, $2)", [tenant, over!.enrollment_id]);
    const [old] = await q<{ status: string; end_date: string }>(owner, "select status, end_date::text from public.enrollments where id = $1", [over!.enrollment_id]);
    expect(old).toEqual({ status: "finished", end_date: day(M2, 13) });
    const courses = await balance();
    expect(courses.map((c) => [c.status, c.sessions, c.used, c.remaining, c.billed])).toEqual([
      ["finished", 3, 3, 0, true],
      ["active", 3, 1, 2, false],
    ]);
    expect(courses[1]!.enrollment_id).toBe(renewed);

    // Lập học phí tháng sau: lớp tháng 2 phiếu + khóa mới của HV203
    const gen = await generate(M2, day(M2, 14));
    expect(gen.created).toBe(3);
    expect((await balance())[1]!.billed).toBe(true);
  });

  it("phân bổ doanh thu: chạy thử không ghi gì; lớp tháng trọn tháng, lớp khóa theo buổi đã học", async () => {
    const dry = await allocate(M1, { dry: true });
    expect(dry).toMatchObject({ dry_run: true, count: 3, total: 1_866_667, voucher_id: null });
    expect(Number((await pool.query("select count(*) from public.vouchers where tenant_id = $1 and voucher_type = 'PK'", [tenant])).rows[0].count)).toBe(0);

    const r = await allocate(M1);
    expect(r).toMatchObject({ count: 3, total: 1_866_667, replaced: [] });
    expect(r.items.map((i) => [i.class_code, i.student_code, i.amount, i.remaining, i.used_in_month])).toEqual([
      ["MA-K3", "HV203", 666_667, 333_333, 2],
      ["TOT-K20", "HV201", 600_000, 0, null],
      ["TOT-K20", "HV202", 600_000, 0, null],
    ]);
    const [pk] = await q<{ status: string; posting_date: string; total_amount: string }>(
      owner,
      "select status, posting_date::text, total_amount::text from public.vouchers where id = $1",
      [r.voucher_id],
    );
    expect(pk).toEqual({ status: "posted", posting_date: monthEnd(M1), total_amount: "1866667.00" });
    expect(await gl("5113")).toBe(1_866_667);

    // Chạy lại: thay phiếu cũ, không nhân đôi
    const again = await allocate(M1);
    expect(again).toMatchObject({ total: 1_866_667, replaced: [r.number] });
    expect(await gl("5113")).toBe(1_866_667);
    expect(Number((await pool.query("select count(*) from public.vouchers where tenant_id = $1 and voucher_type = 'PK'", [tenant])).rows[0].count)).toBe(1);
  });

  it("tháng sau: lớp khóa nhận nốt phần dư làm tròn, khóa mới phân bổ theo buổi; số dư 3387 khớp sổ cái", async () => {
    const r = await allocate(M2);
    expect(r.items.map((i) => [i.class_code, i.student_code, i.amount, i.remaining])).toEqual([
      ["MA-K3", "HV203", 333_333, 0],
      ["MA-K3", "HV203", 333_333, 666_667],
      ["TOT-K20", "HV201", 600_000, 0],
      ["TOT-K20", "HV202", 600_000, 0],
    ]);
    expect(r.total).toBe(1_866_666);
    expect((await allocate(M1, { dry: true })).later_months).toBe(1);

    const deferred = await q<{ student_code: string; amount: string; recognized: string; balance: string }>(
      owner,
      "select * from public.rpt_deferred_tuition($1)",
      [tenant],
    );
    const open = deferred.filter((d) => Number(d.balance) !== 0);
    expect(open.map((d) => [d.student_code, Number(d.amount), Number(d.recognized), Number(d.balance)])).toEqual([["HV203", 1_000_000, 333_333, 666_667]]);
    expect(await gl("3387")).toBe(666_667);
    expect(await gl("5113")).toBe(1_866_667 + 1_866_666);
  });

  it("hóa đơn học phí đã phân bổ không bỏ ghi sổ được; tháng đã khóa sổ thì chặn phân bổ và sửa điểm danh", async () => {
    const [inv] = await q<{ invoice_id: string }>(
      owner,
      "select b.invoice_id from public.tuition_bills b join public.enrollments e on e.id = b.enrollment_id where e.student_id = $1 order by b.period_start limit 1",
      [hv1],
    );
    await expect(q(owner, "select public.unpost_voucher($1)", [inv!.invoice_id])).rejects.toThrow(/đã phân bổ doanh thu/);

    await expect(allocate(M1, {}, viewer)).rejects.toThrow(/không có quyền/);
    await expect(allocate(M1, {}, coach)).rejects.toThrow(/không có quyền/);

    await q(owner, "select public.lock_period($1, $2)", [tenant, monthEnd(M1)]);
    await expect(allocate(M1)).rejects.toThrow(/khóa/);
    await expect(record(coach, tot, day(M1, 19), [{ student_id: hv1, status: "present" }])).rejects.toThrow(/đã khóa/);
    // Tháng chưa khóa vẫn điểm danh được
    await record(coach, tot, day(M2, 19), [{ student_id: hv1, status: "present" }]);

    const matrix = await q<{ student_code: string; held_on: string | null; status: string | null }>(
      coach,
      "select student_code, held_on::text, status from public.rpt_attendance($1, $2, $3)",
      [tenant, tot, `${M1}-01`],
    );
    expect(matrix.map((m) => [m.student_code, m.held_on, m.status])).toEqual([
      ["HV201", day(M1, 5), "present"],
      ["HV202", day(M1, 5), "absent"],
    ]);
  });
});
