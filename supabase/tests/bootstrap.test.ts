import { afterAll, describe, expect, it } from "vitest";
import { createUser, pool, q, slug } from "./db";

afterAll(async () => {
  await pool.end();
});

type Boot = { tenant_id: string; tenant_created: boolean };

async function asService<T>(fn: () => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("set role service_role");
    return await fn.call(c);
  } finally {
    await c.query("reset role");
    c.release();
  }
}

describe("app.bootstrap_owner", () => {
  it("tạo đơn vị + gán chủ sở hữu; chạy lại không sinh trùng", async () => {
    const owner = await createUser(`chu-${Date.now()}@duongsinh.vn`);
    const s = slug("ds");
    const boot = async () =>
      (await pool.query<{ r: Boot }>("select app.bootstrap_owner($1, $2, 'Công ty CP Cờ vua Dương Sinh', 'TT99', '2026-01-01') as r", [owner, s])).rows[0]!.r;

    const first = await boot();
    expect(first.tenant_created).toBe(true);
    const again = await boot();
    expect(again).toEqual({ tenant_id: first.tenant_id, tenant_created: false });

    const rows = await q<{ slug: string; role: string; regime: string }>(owner, "select slug, role, regime from public.my_tenants");
    expect(rows).toEqual([{ slug: s, role: "owner", regime: "TT99" }]);
    const [acc] = await q<{ n: string }>(owner, "select count(*) as n from public.accounts where tenant_id = $1", [first.tenant_id]);
    expect(Number(acc?.n)).toBeGreaterThan(200);
  });

  it("đơn vị đã có: người được bootstrap trở thành chủ sở hữu", async () => {
    const a = await createUser();
    const b = await createUser();
    const s = slug("ds");
    await pool.query("select app.bootstrap_owner($1, $2, 'Đơn vị A')", [a, s]);
    const r = (await pool.query<{ r: Boot }>("select app.bootstrap_owner($1, $2, 'Đơn vị A') as r", [b, s])).rows[0]!.r;
    expect(r.tenant_created).toBe(false);
    expect(await q(b, "select role from public.my_tenants where slug = $1", [s])).toEqual([{ role: "owner" }]);
  });

  it("tài khoản không tồn tại → lỗi; service_role gọi được; client (authenticated) không gọi được", async () => {
    await expect(pool.query("select app.bootstrap_owner(gen_random_uuid(), 'x', 'X')")).rejects.toThrow(/Không có tài khoản/);

    const u = await createUser();
    await asService(async function (this: import("pg").PoolClient) {
      const r = await this.query<{ r: Boot }>("select app.bootstrap_owner($1, $2, 'Đơn vị S') as r", [u, slug("sv")]);
      expect(r.rows[0]?.r.tenant_created).toBe(true);
    });

    await expect(q(u, "select app.bootstrap_owner($1, 'hack', 'Hack')", [u])).rejects.toThrow(/permission denied/);
  });

  it("tenants nằm trong publication realtime", async () => {
    const { rows } = await pool.query(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('tenants', 'vouchers', 'memberships') order by 1",
    );
    expect(rows.map((r) => r.tablename)).toEqual(["memberships", "tenants", "vouchers"]);
  });
});
