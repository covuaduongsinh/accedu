import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createTenant, createUser, pool, q } from "./db";

let owner: string;
let tenant: string;

beforeAll(async () => {
  owner = await createUser();
  tenant = await createTenant(owner, "TT133");
});

afterAll(async () => {
  await pool.end();
});

async function asServer<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("set role accedu_server");
    return await fn(c as unknown as Client);
  } finally {
    await c.query("reset role");
    c.release();
  }
}

describe("platform.create_user", () => {
  it("chủ sở hữu tạo tài khoản kế toán mới (bắt đổi mật khẩu)", async () => {
    const email = `KeToan-${Date.now()}@DuongSinh.vn`;
    const r = await asServer((c) =>
      c.query<{ r: { user_id: string; created: boolean } }>(
        "select platform.create_user($1, $2, $3, $4, $5, 'accountant') as r",
        [owner, tenant, email, "$argon2id$hash", "Nguyễn Kế Toán"],
      ),
    );
    expect(r.rows[0]?.r.created).toBe(true);
    const u = await pool.query("select email, must_change_password, raw_user_meta_data->>'full_name' as name from auth.users where id = $1", [r.rows[0]?.r.user_id]);
    expect(u.rows[0]).toEqual({ email: email.toLowerCase(), must_change_password: true, name: "Nguyễn Kế Toán" });
    const roles = await q<{ role: string }>(r.rows[0]!.r.user_id, "select role from public.my_tenants where id = $1", [tenant]);
    expect(roles).toEqual([{ role: "accountant" }]);
  });

  it("người không phải quản trị bị từ chối; không tạo được vai trò owner", async () => {
    const stranger = await createUser();
    await expect(
      asServer((c) => c.query("select platform.create_user($1, $2, 'x@y.vn', 'h', 'X', 'viewer')", [stranger, tenant])),
    ).rejects.toThrow(/Chỉ quản trị/);
    await expect(
      asServer((c) => c.query("select platform.create_user($1, $2, 'x@y.vn', 'h', 'X', 'owner')", [owner, tenant])),
    ).rejects.toThrow(/Vai trò không hợp lệ/);
  });

  it("client thường (authenticated) không gọi được hàm platform", async () => {
    await expect(q(owner, "select platform.create_user($1, $2, 'a@b.vn', 'h', 'A', 'viewer')", [owner, tenant])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("platform.bootstrap_owner", () => {
  it("tạo chủ sở hữu + đơn vị, chạy lại không sinh trùng", async () => {
    const slug = `boot-${Date.now().toString(36)}`;
    const args = [`owner-${slug}@duongsinh.vn`, "$argon2id$x", "Phùng Đức Tường", slug, "Công ty CP Cờ vua Dương Sinh", "TT133", "2026-01-01"];
    const first = await asServer((c) => c.query<{ r: Record<string, unknown> }>("select platform.bootstrap_owner($1,$2,$3,$4,$5,$6,$7) as r", args));
    expect(first.rows[0]?.r).toMatchObject({ user_created: true, tenant_created: true });
    const second = await asServer((c) => c.query<{ r: Record<string, unknown> }>("select platform.bootstrap_owner($1,$2,$3,$4,$5,$6,$7) as r", args));
    expect(second.rows[0]?.r).toMatchObject({ user_created: false, tenant_created: false, tenant_id: first.rows[0]?.r.tenant_id });
    const n = await pool.query("select count(*)::int as n from public.accounts where tenant_id = $1", [first.rows[0]?.r.tenant_id]);
    expect(n.rows[0]?.n).toBe(126);
  });
});

describe("realtime NOTIFY", () => {
  it("lưu chứng từ phát sự kiện theo đơn vị, không kèm dữ liệu", async () => {
    const listener = await pool.connect();
    const events: Array<Record<string, string | null>> = [];
    listener.on("notification", (m) => m.payload && events.push(JSON.parse(m.payload)));
    await listener.query("listen accedu_changes");
    await q(owner, "insert into public.partners (tenant_id, code, name) values ($1, 'NCC01', 'Nhà sách Dương Sinh')", [tenant]);
    await q(owner, "select public.save_voucher($1::jsonb, true)", [
      JSON.stringify({ tenant_id: tenant, voucher_type: "PC", posting_date: "2026-03-02", lines: [{ debit_account: "6422", amount: 100000 }] }),
    ]);
    await new Promise((r) => setTimeout(r, 200));
    await listener.query("unlisten accedu_changes");
    listener.release();
    expect(events).toContainEqual({ tenant, table: "partners", op: "INSERT", id: null });
    const v = events.filter((e) => e.table === "vouchers");
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]?.tenant).toBe(tenant);
    expect(Object.keys(v[0] ?? {}).sort()).toEqual(["id", "op", "table", "tenant"]);
  });
});
