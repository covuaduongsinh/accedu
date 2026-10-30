import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createTenant, createUser, pool, q } from "./db";

// Điểm danh không cho ngày tương lai → dùng tháng trước
const ym = (monthsAgo: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString().slice(0, 7);
};
const M1 = ym(1);
const day = (d: number) => `${M1}-${String(d).padStart(2, "0")}`;
const monthEnd = () => {
  const [y, mo] = M1.split("-").map(Number);
  return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10);
};

let owner: string;
let coachUser: string;
let viewer: string;
let tenant: string;
let gv1: string;
let gv2: string;
let tot: string;
let ma: string;
let xe: string;
let khac: string;
let hv1: string;
let hv2: string;
let hv3: string;

interface CoachPayResult {
  dry_run: boolean;
  gross: number;
  pit: number;
  net: number;
  voucher_id: string | null;
  number: string | null;
  replaced: string[];
  coaches: Array<{ code: string; kind: string; sessions: number; gross: number; pit: number; net: number; classes: Array<{ class_code: string; sessions: number; rate: number; amount: number }> }>;
  unassigned: Array<{ class_code: string; held_on: string }>;
}

const rpc = async <T>(user: string, sql: string, params: unknown[]) => (await q<{ r: T }>(user, `select ${sql} as r`, params))[0]!.r;
const saveClass = (c: Record<string, unknown>) => rpc<string>(owner, "public.save_class($1, $2::jsonb)", [tenant, JSON.stringify(c)]);
const saveStudent = (s: Record<string, unknown>) => rpc<string>(owner, "public.save_student($1, $2::jsonb)", [tenant, JSON.stringify(s)]);
const enroll = (e: Record<string, unknown>) => rpc<string>(owner, "public.save_enrollment($1, $2::jsonb)", [tenant, JSON.stringify(e)]);
const profile = (partner: string, row: Record<string, unknown>, user = owner) =>
  rpc<string>(user, "public.save_coach_profile($1, $2, $3::jsonb)", [tenant, partner, JSON.stringify(row)]);
const record = (user: string, cls: string, date: string, students: string[]) =>
  rpc<{ session_id: string }>(user, "public.record_attendance($1, $2, $3, $4::jsonb)", [
    tenant,
    cls,
    date,
    JSON.stringify(students.map((s) => ({ student_id: s, status: "present" }))),
  ]);
const pay = (opts: { dry?: boolean } = {}, user = owner) =>
  rpc<CoachPayResult>(user, "public.generate_coach_pay($1, $2, true, $3)", [tenant, `${M1}-01`, opts.dry ?? false]);
const gl = async (account: string) => {
  const r = (
    await pool.query<{ d: string; c: string }>(
      "select coalesce(sum(debit), 0)::text as d, coalesce(sum(credit), 0)::text as c from public.gl_entries where tenant_id = $1 and account = $2",
      [tenant, account],
    )
  ).rows[0]!;
  return { d: Number(r.d), c: Number(r.c) };
};

/** Gọi với tư cách service role (Edge Function dùng khóa service role) */
async function asService<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    await c.query("set local role service_role");
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows as T[];
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  owner = await createUser();
  coachUser = await createUser();
  viewer = await createUser();
  tenant = await createTenant(owner, "TT99", `${ym(6)}-01`);
  await addMember(tenant, coachUser, "coach");
  await addMember(tenant, viewer, "viewer");

  const emp = async (code: string, name: string) =>
    (await q<{ id: string }>(owner, "insert into public.partners (tenant_id, code, name, is_employee) values ($1, $2, $3, true) returning id", [tenant, code, name]))[0]!.id;
  gv1 = await emp("GV01", "HLV Nhân Viên");
  gv2 = await emp("GV02", "HLV Cộng Tác");

  tot = await saveClass({ code: "TOT-L1", name: "Lớp Tốt L1", billing: "monthly", fee: 600_000, coach_partner_id: gv1, coach_user_id: coachUser });
  ma = await saveClass({ code: "MA-L1", name: "Lớp Mã L1", billing: "course", fee: 2_000_000, sessions_per_course: 12, coach_partner_id: gv2 });
  xe = await saveClass({ code: "XE-L1", name: "Lớp Xe L1", billing: "monthly", fee: 800_000, coach_partner_id: gv2, coach_rate: 250_000 });
  khac = await saveClass({ code: "KHAC", name: "Lớp chưa có HLV", billing: "monthly", fee: 500_000 });
  hv1 = await saveStudent({ code: "HV301", name: "Học viên Một", email: "phuhuynh1@example.test", guardian_name: "Phụ huynh Một" });
  hv2 = await saveStudent({ code: "HV302", name: "Học viên Hai" });
  hv3 = await saveStudent({ code: "HV303", name: "Học viên Ba", email: "phuhuynh3@example.test" });
  for (const [cls, hv] of [
    [tot, hv1],
    [ma, hv2],
    [xe, hv3],
    [khac, hv3],
  ] as const) {
    await enroll({ class_id: cls, student_id: hv, start_date: `${M1}-01` });
  }
});

afterAll(async () => {
  await pool.end();
});

describe("lương HLV theo buổi dạy", () => {
  it("hồ sơ HLV: nhân viên / cộng tác viên, gắn tài khoản đăng nhập; một tài khoản chỉ gắn một HLV", async () => {
    await profile(gv1, { kind: "employee", session_rate: 150_000, user_id: coachUser });
    await profile(gv2, { kind: "contractor" });
    await expect(profile(gv2, { kind: "contractor", user_id: coachUser })).rejects.toThrow(/đã gắn với HLV khác/);
    await expect(profile(gv2, { kind: "khac" })).rejects.toThrow(/Loại HLV/);
    await expect(profile(gv1, { kind: "employee" }, coachUser)).rejects.toThrow(/không có quyền/);
    await expect(profile(gv1, { kind: "employee", user_id: await createUser() })).rejects.toThrow(/không thuộc đơn vị/);
  });

  it("điểm danh gán HLV nhận lương; dạy thay đổi người nhận; chưa có đơn giá thì báo lỗi", async () => {
    // HLV điểm danh lớp Tốt 3 buổi → nhận lương là GV01 (tài khoản gắn hồ sơ)
    for (const d of [3, 10, 17]) await record(coachUser, tot, day(d), [hv1]);
    // Kế toán điểm danh lớp Mã 10 buổi, lớp Xe 2 buổi → HLV phụ trách lớp (GV02)
    for (let d = 1; d <= 10; d++) await record(owner, ma, day(d), [hv2]);
    for (const d of [4, 11]) await record(owner, xe, day(d), [hv3]);
    // Lớp chưa có HLV
    await record(owner, khac, day(5), [hv3]);

    const [s17] = await q<{ id: string }>(owner, "select id from public.class_sessions where class_id = $1 and held_on = $2", [tot, day(17)]);
    await expect(q(coachUser, "select public.set_session_coach($1, $2, $3)", [tenant, s17!.id, gv2])).rejects.toThrow(/không có quyền/);
    await q(owner, "select public.set_session_coach($1, $2, $3)", [tenant, s17!.id, gv2]);

    await expect(pay({ dry: true })).rejects.toThrow(/Chưa có đơn giá buổi dạy của HLV: GV02/);
    await profile(gv2, { kind: "contractor", session_rate: 200_000 });
  });

  it("chạy thử: xem trước theo HLV × lớp, khấu trừ TNCN 10% cộng tác viên ≥ 2 triệu, buổi chưa có người nhận; không ghi gì", async () => {
    const r = await pay({ dry: true });
    expect(r).toMatchObject({ dry_run: true, voucher_id: null, gross: 3_000_000, pit: 270_000, net: 2_730_000 });
    expect(r.coaches.map((c) => [c.code, c.kind, c.sessions, c.gross, c.pit, c.net])).toEqual([
      ["GV01", "employee", 2, 300_000, 0, 300_000],
      ["GV02", "contractor", 13, 2_700_000, 270_000, 2_430_000],
    ]);
    expect(r.coaches[1]!.classes.map((c) => [c.class_code, c.sessions, c.rate, c.amount])).toEqual([
      ["MA-L1", 10, 200_000, 2_000_000],
      ["TOT-L1", 1, 200_000, 200_000],
      ["XE-L1", 2, 250_000, 500_000],
    ]);
    expect(r.unassigned.map((u) => [u.class_code, u.held_on])).toEqual([["KHAC", day(5)]]);
    expect(Number((await pool.query("select count(*) from public.coach_pay where tenant_id = $1", [tenant])).rows[0].count)).toBe(0);
  });

  it("lập lương: PK Nợ 632 (theo lớp) / Có 3341 nhân viên, Có 331 cộng tác viên, Nợ 331 / Có 3335; chạy lại không nhân đôi", async () => {
    const r = await pay();
    const [v] = await q<{ status: string; posting_date: string }>(owner, "select status, posting_date::text from public.vouchers where id = $1", [r.voucher_id]);
    expect(v).toEqual({ status: "posted", posting_date: monthEnd() });
    expect(await gl("632")).toEqual({ d: 3_000_000, c: 0 });
    expect(await gl("3341")).toEqual({ d: 0, c: 300_000 });
    expect(await gl("331")).toEqual({ d: 270_000, c: 2_700_000 });
    expect(await gl("3335")).toEqual({ d: 0, c: 270_000 });
    const [byJob] = await q<{ n: string }>(
      owner,
      "select sum(debit)::text as n from public.gl_entries where tenant_id = $1 and account = '632' and job_id = $2",
      [tenant, ma],
    );
    expect(byJob!.n).toBe("2000000.00");

    const again = await pay();
    expect(again.replaced).toEqual([r.number]);
    expect(await gl("632")).toEqual({ d: 3_000_000, c: 0 });
    expect(Number((await pool.query("select count(*) from public.coach_pay where tenant_id = $1", [tenant])).rows[0].count)).toBe(2);
  });

  it("phân quyền: HLV chỉ xem số buổi của mình, không xem lương; người xem không lập được", async () => {
    expect(await q(coachUser, "select * from public.coach_pay where tenant_id = $1", [tenant])).toEqual([]);
    const mine = await q<{ class_code: string; sessions: number }>(coachUser, "select class_code, sessions from public.my_coach_sessions($1, $2)", [tenant, `${M1}-01`]);
    expect(mine).toEqual([{ class_code: "TOT-L1", sessions: 2 }]);
    await expect(pay({}, coachUser)).rejects.toThrow(/không có quyền/);
    await expect(pay({}, viewer)).rejects.toThrow(/không có quyền/);
  });
});

describe("nhắc học phí qua email", () => {
  it("danh sách học viên còn nợ: có / thiếu email, bỏ học viên đã đóng; chỉ kế toán hoặc dịch vụ hệ thống", async () => {
    await q(owner, "select public.generate_tuition($1, $2, null, $3, true, false)", [tenant, `${M1}-01`, `${M1}-01`]);
    const [bill3] = await q<{ bill_id: string }>(
      owner,
      "select bill_id from public.rpt_tuition_status($1) where student_code = 'HV303' and class_code = 'XE-L1'",
      [tenant],
    );
    await q(owner, "select public.pay_tuition($1, $2::uuid[], 'cash', $3)", [tenant, [bill3!.bill_id], `${M1}-05`]);

    const rows = await q<{ student_code: string; email: string | null; total: string; items: Array<{ class_name: string; remaining: number }> }>(
      owner,
      "select * from public.reminder_candidates($1)",
      [tenant],
    );
    expect(rows.map((r) => [r.student_code, r.email, Number(r.total)])).toEqual([
      ["HV301", "phuhuynh1@example.test", 600_000],
      ["HV302", null, 2_000_000],
      ["HV303", "phuhuynh3@example.test", 500_000],
    ]);
    expect(rows[2]!.items.map((i) => i.class_name)).toEqual(["Lớp chưa có HLV"]);
    const only = await q<{ student_code: string }>(owner, "select student_code from public.reminder_candidates($1, $2::uuid[])", [tenant, [hv1]]);
    expect(only).toEqual([{ student_code: "HV301" }]);
    await expect(q(viewer, "select * from public.reminder_candidates($1)", [tenant])).rejects.toThrow(/không có quyền/);
    await expect(q(coachUser, "select * from public.reminder_candidates($1)", [tenant])).rejects.toThrow(/không có quyền/);
    expect((await asService("select * from public.reminder_candidates($1)", [tenant])).length).toBe(3);
  });

  it("nhật ký gửi; đơn vị đến ngày nhắc; bí mật hệ thống chỉ service role", async () => {
    const n = await rpc<number>(owner, "public.log_tuition_reminders($1, $2::jsonb, 'manual')", [
      tenant,
      JSON.stringify([
        { student_id: hv1, email: "phuhuynh1@example.test", amount: 600_000, status: "sent" },
        { student_id: hv2, status: "skipped", error: "Thiếu email phụ huynh" },
      ]),
    ]);
    expect(n).toBe(2);
    const [c1] = await q<{ last_sent_at: string | null; last_auto_at: string | null }>(owner, "select last_sent_at, last_auto_at from public.reminder_candidates($1, $2::uuid[])", [tenant, [hv1]]);
    expect(c1!.last_sent_at).not.toBeNull();
    expect(c1!.last_auto_at).toBeNull();

    const today = Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(8, 10));
    const dueDay = Math.min(today, 28);
    await q(owner, "update public.tenants set reminder_enabled = true, reminder_days = $2 where id = $1", [tenant, `{${dueDay}}`]);
    const due = await asService<{ tenant_id: string }>("select tenant_id from public.reminder_due_tenants($1)", [`${M1}-${String(dueDay).padStart(2, "0")}`]);
    expect(due.map((d) => d.tenant_id)).toContain(tenant);
    const notDue = await asService<{ tenant_id: string }>("select tenant_id from public.reminder_due_tenants($1)", [`${M1}-${String(dueDay === 1 ? 2 : 1).padStart(2, "0")}`]);
    expect(notDue.map((d) => d.tenant_id)).not.toContain(tenant);
    await expect(q(owner, "update public.tenants set reminder_days = '{30}' where id = $1", [tenant])).rejects.toThrow();

    await expect(q(owner, "select * from public.reminder_due_tenants()")).rejects.toThrow(/permission denied/);
    await expect(q(owner, "select * from public.system_secrets(array['accedu_smtp_host'])")).rejects.toThrow(/permission denied/);
    expect(await asService("select * from public.system_secrets(array['accedu_smtp_host'])")).toEqual([]);
  });

  it("tháng đã khóa sổ: chặn lập lương", async () => {
    await q(owner, "select public.lock_period($1, $2)", [tenant, monthEnd()]);
    await expect(pay()).rejects.toThrow(/khóa/);
  });
});
