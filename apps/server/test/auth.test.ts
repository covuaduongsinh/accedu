import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearer, login, OWNER, setupPlatform } from "./helpers.ts";

let p: Awaited<ReturnType<typeof setupPlatform>>;

beforeAll(async () => {
  p = await setupPlatform("accedu_server_auth");
});

afterAll(async () => {
  await p.db.end();
  await p.adminDb.end();
});

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: { id: string; email: string; app_metadata: { must_change_password: boolean }; user_metadata: Record<string, unknown> };
}

async function refresh(token: string) {
  return p.app.request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: token }),
  });
}

describe("đăng nhập (tương thích GoTrue/supabase-js)", () => {
  it("sai mật khẩu → 400 invalid_credentials; quá 5 lần → 429", async () => {
    const r = await login(p.app, OWNER.email, "SaiMatKhau1", "10.9.9.9");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error_code: "invalid_credentials", msg: "Invalid login credentials" });
    for (let i = 0; i < 4; i++) await login(p.app, OWNER.email, "SaiMatKhau1", "10.9.9.9");
    const blocked = await login(p.app, OWNER.email, OWNER.password, "10.9.9.9");
    expect(blocked.status).toBe(429);
    // IP khác không bị ảnh hưởng
    expect((await login(p.app, OWNER.email, OWNER.password, "10.1.1.1")).status).toBe(200);
  });

  it("đúng mật khẩu → session đúng định dạng, JWT hợp lệ, cờ bắt đổi mật khẩu", async () => {
    const r = await login(p.app, OWNER.email.toUpperCase(), OWNER.password);
    expect(r.status).toBe(200);
    const s = (await r.json()) as Session;
    expect(s.token_type).toBe("bearer");
    expect(s.expires_in).toBe(3600);
    expect(s.expires_at).toBeGreaterThan(Date.now() / 1000);
    expect(s.user.email).toBe(OWNER.email);
    expect(s.user.app_metadata.must_change_password).toBe(true);
    expect(s.user.user_metadata.full_name).toBe("Phùng Đức Tường");
    const claims = await p.tokens.verifyAccess(s.access_token);
    expect(claims).toMatchObject({ sub: p.ownerId, role: "authenticated", aud: "authenticated" });
    const me = await p.app.request("/auth/v1/user", { headers: bearer(s.access_token) });
    expect(((await me.json()) as { id: string }).id).toBe(p.ownerId);
  });

  it("JWT cấp ra dùng được với RLS (như PostgREST đặt request.jwt.claims)", async () => {
    const s = (await (await login(p.app, OWNER.email, OWNER.password)).json()) as Session;
    const claims = await p.tokens.verifyAccess(s.access_token);
    const c = await p.adminDb.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await c.query("set local role authenticated");
      const { rows } = await c.query("select slug, role from public.my_tenants");
      expect(rows).toEqual([{ slug: "duongsinh", role: "owner" }]);
      await c.query("rollback");
    } finally {
      c.release();
    }
  });

  it("đăng ký tự do bị tắt", async () => {
    const r = await p.app.request("/auth/v1/signup", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error_code: "signup_disabled" });
  });
});

describe("refresh token xoay vòng", () => {
  it("làm mới cấp token mới; dùng lại token cũ → thu hồi cả phiên", async () => {
    const s1 = (await (await login(p.app, OWNER.email, OWNER.password)).json()) as Session;
    const r2 = await refresh(s1.refresh_token);
    expect(r2.status).toBe(200);
    const s2 = (await r2.json()) as Session;
    expect(s2.refresh_token).not.toBe(s1.refresh_token);

    const reuse = await refresh(s1.refresh_token);
    expect(reuse.status).toBe(400);
    expect(await reuse.json()).toMatchObject({ error_code: "refresh_token_already_used" });
    // Token mới nhất của phiên cũng không còn dùng được
    expect((await refresh(s2.refresh_token)).status).toBe(400);
    expect((await p.app.request("/auth/v1/user", { headers: bearer(s2.access_token) })).status).toBe(401);
  });

  it("token rác → 400", async () => {
    expect((await refresh("khong-ton-tai")).status).toBe(400);
  });
});

describe("đổi mật khẩu & đăng xuất", () => {
  it("chính sách mật khẩu; đổi thành công gỡ cờ bắt đổi và đăng xuất các phiên khác", async () => {
    const a = (await (await login(p.app, OWNER.email, OWNER.password)).json()) as Session;
    const b = (await (await login(p.app, OWNER.email, OWNER.password, "10.2.2.2")).json()) as Session;

    const weak = await p.app.request("/auth/v1/user", { method: "PUT", headers: bearer(a.access_token), body: JSON.stringify({ password: "123" }) });
    expect(weak.status).toBe(422);
    const same = await p.app.request("/auth/v1/user", {
      method: "PUT",
      headers: bearer(a.access_token),
      body: JSON.stringify({ password: OWNER.password }),
    });
    expect(same.status).toBe(422);

    const ok = await p.app.request("/auth/v1/user", {
      method: "PUT",
      headers: bearer(a.access_token),
      body: JSON.stringify({ password: "VuiTriTue2026", data: { full_name: "Thầy Tường" } }),
    });
    expect(ok.status).toBe(200);
    const u = (await ok.json()) as Session["user"];
    expect(u.app_metadata.must_change_password).toBe(false);
    expect(u.user_metadata.full_name).toBe("Thầy Tường");

    expect((await refresh(b.refresh_token)).status).toBe(400);
    expect((await p.app.request("/auth/v1/user", { headers: bearer(a.access_token) })).status).toBe(200);
    expect((await login(p.app, OWNER.email, "VuiTriTue2026")).status).toBe(200);
    OWNER.password = "VuiTriTue2026";
  });

  it("đăng xuất thu hồi phiên", async () => {
    const s = (await (await login(p.app, OWNER.email, OWNER.password)).json()) as Session;
    const out = await p.app.request("/auth/v1/logout?scope=local", { method: "POST", headers: bearer(s.access_token) });
    expect(out.status).toBe(204);
    expect((await p.app.request("/auth/v1/user", { headers: bearer(s.access_token) })).status).toBe(401);
    expect((await refresh(s.refresh_token)).status).toBe(400);
  });
});
