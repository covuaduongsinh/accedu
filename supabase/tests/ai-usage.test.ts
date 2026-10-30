import { beforeAll, describe, expect, it } from "vitest";
import { addMember, createTenant, createUser, pool, q } from "./db";

let owner: string;
let accountant: string;
let coach: string;
let outsider: string;
let tenant: string;

interface Begin {
  ok: boolean;
  error?: string;
  usage_id?: string;
  role: string;
  limit: number;
  used: number;
  remaining: number;
}

const begin = async (user: string, question = "Tháng này còn bao nhiêu học viên chưa đóng học phí?") =>
  (await q<{ r: Begin }>(user, "select public.ai_begin($1, $2) as r", [tenant, question]))[0]!.r;
const quota = async (user: string) =>
  (await q<{ r: { limit: number; used: number; remaining: number } }>(user, "select public.ai_quota($1) as r", [tenant]))[0]!.r;

/** Gọi với tư cách service role (Edge Function dùng khóa service role) */
async function asService(sql: string, params: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    await c.query("set local role service_role");
    await c.query(sql, params);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const finish = (usage: string, row: Record<string, unknown>) => asService("select public.ai_finish($1, $2::jsonb)", [usage, JSON.stringify(row)]);

beforeAll(async () => {
  owner = await createUser();
  accountant = await createUser();
  coach = await createUser();
  outsider = await createUser();
  tenant = await createTenant(owner);
  await addMember(tenant, accountant, "accountant");
  await addMember(tenant, coach, "coach");
});

describe("AI hỏi đáp: hạn mức và nhật ký ai_usage", () => {
  it("mặc định 100 câu / ngày; HLV và kế toán xem được hạn mức, người ngoài thì không", async () => {
    expect(await quota(accountant)).toEqual({ limit: 100, used: 0, remaining: 100 });
    expect((await quota(coach)).limit).toBe(100);
    await expect(quota(outsider)).rejects.toThrow(/không thuộc đơn vị/);
  });

  it("ai_begin giữ chỗ một dòng pending, trả vai trò để chọn bộ tool", async () => {
    const a = await begin(accountant);
    expect(a).toMatchObject({ ok: true, role: "accountant", limit: 100, used: 1, remaining: 99 });
    const c = await begin(coach, "Tháng này tôi dạy bao nhiêu buổi?");
    expect(c).toMatchObject({ ok: true, role: "coach", used: 2 });
    const [row] = (await pool.query("select status, user_id, role, question from public.ai_usage where id = $1", [a.usage_id])).rows;
    expect(row).toMatchObject({ status: "pending", user_id: accountant, role: "accountant" });
    await expect(begin(outsider)).rejects.toThrow(/không thuộc đơn vị/);
    await expect(begin(accountant, "   ")).rejects.toThrow(/Câu hỏi trống/);
    await expect(begin(accountant, "x".repeat(2001))).rejects.toThrow(/quá dài/);
  });

  it("chỉ service role ghi được kết quả; người dùng không tự sửa / thêm nhật ký", async () => {
    const a = await begin(accountant);
    await expect(
      q(accountant, "select public.ai_finish($1, $2::jsonb)", [a.usage_id, JSON.stringify({ status: "ok", answer: "Giả" })]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      q(accountant, "insert into public.ai_usage (tenant_id, role, question, asked_on) values ($1, 'accountant', 'x', current_date)", [tenant]),
    ).rejects.toThrow(/row-level security/);
    const updated = await q(accountant, "update public.ai_usage set status = 'ok' where id = $1 returning id", [a.usage_id]);
    expect(updated).toHaveLength(0);

    await finish(a.usage_id!, {
      status: "ok",
      answer: "Còn 3 học viên chưa đóng học phí tháng 10/2026.\nNguồn: Tình hình học phí, tháng 10/2026",
      tools: ["Tình hình học phí"],
      model: "claude-opus-5-5",
      input_tokens: 5200,
      output_tokens: 410,
      cache_read_tokens: 4100,
      cache_write_tokens: 900,
      cost_usd: 0.0339,
    });
    const [row] = (await pool.query("select * from public.ai_usage where id = $1", [a.usage_id])).rows;
    expect(row).toMatchObject({ status: "ok", tools: ["Tình hình học phí"], input_tokens: 5200, output_tokens: 410, cost_usd: "0.0339" });
    expect(row.finished_at).not.toBeNull();
    // Ghi lần hai không đổi (chỉ dòng pending)
    await finish(a.usage_id!, { status: "error", error: "x" });
    expect((await pool.query("select status from public.ai_usage where id = $1", [a.usage_id])).rows[0].status).toBe("ok");
    await expect(finish(a.usage_id!, { status: "weird" })).rejects.toThrow(/Trạng thái không hợp lệ/);
  });

  it("người hỏi thấy lịch sử của mình; chủ sở hữu thấy cả đơn vị; người ngoài không thấy gì", async () => {
    const mine = await q<{ user_id: string }>(accountant, "select user_id from public.ai_usage where tenant_id = $1", [tenant]);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.user_id === accountant)).toBe(true);
    const coachRows = await q<{ user_id: string }>(coach, "select user_id from public.ai_usage where tenant_id = $1", [tenant]);
    expect(coachRows).toHaveLength(1);
    expect(coachRows[0]!.user_id).toBe(coach);
    const all = await q<{ user_id: string }>(owner, "select user_id from public.ai_usage where tenant_id = $1", [tenant]);
    expect(new Set(all.map((r) => r.user_id))).toEqual(new Set([accountant, coach]));
    expect(await q(outsider, "select 1 from public.ai_usage where tenant_id = $1", [tenant])).toHaveLength(0);
  });

  it("hết hạn mức thì từ chối; câu lỗi kỹ thuật không tính; hạn mức 0 = tắt", async () => {
    // Quản trị đổi hạn mức (RLS tenants_update); kế toán không đổi được
    expect(await q(accountant, "update public.tenants set ai_daily_limit = 1 where id = $1 returning id", [tenant])).toHaveLength(0);
    const used = (await quota(owner)).used;
    await q(owner, "update public.tenants set ai_daily_limit = $2 where id = $1", [tenant, used + 1]);

    const last = await begin(accountant);
    expect(last).toMatchObject({ ok: true, remaining: 0 });
    expect(await begin(coach)).toMatchObject({ ok: false, error: "limit", remaining: 0 });

    await finish(last.usage_id!, { status: "error", error: "Dịch vụ AI đang quá tải" });
    expect(await quota(accountant)).toMatchObject({ used, remaining: 1 });
    expect(await begin(coach)).toMatchObject({ ok: true });

    await q(owner, "update public.tenants set ai_daily_limit = 0 where id = $1", [tenant]);
    expect(await begin(accountant)).toMatchObject({ ok: false, error: "disabled" });
    await expect(q(owner, "update public.tenants set ai_daily_limit = -1 where id = $1", [tenant])).rejects.toThrow(/check constraint/);
  });
});
