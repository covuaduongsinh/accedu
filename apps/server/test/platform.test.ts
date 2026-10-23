import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearer, login, OWNER, setupPlatform } from "./helpers.ts";

let p: Awaited<ReturnType<typeof setupPlatform>>;
let ownerToken: string;

beforeAll(async () => {
  p = await setupPlatform("accedu_server_platform");
  ownerToken = ((await (await login(p.app, OWNER.email, OWNER.password)).json()) as { access_token: string }).access_token;
});

afterAll(async () => {
  await p.db.end();
  await p.adminDb.end();
});

const createUser = (token: string, body: Record<string, unknown>) =>
  p.app.request("/platform/v1/users", { method: "POST", headers: bearer(token), body: JSON.stringify(body) });

describe("quản trị tạo tài khoản", () => {
  it("chủ sở hữu tạo kế toán; kế toán đăng nhập được và bị bắt đổi mật khẩu", async () => {
    const r = await createUser(ownerToken, {
      tenant_id: p.tenantId,
      email: "KeToan@DuongSinh.vn",
      full_name: "Lê Kế Toán",
      password: "KeToan2026",
      role: "accountant",
    });
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ created: true });
    const s = (await (await login(p.app, "ketoan@duongsinh.vn", "KeToan2026")).json()) as {
      user: { app_metadata: { must_change_password: boolean } };
      access_token: string;
    };
    expect(s.user.app_metadata.must_change_password).toBe(true);

    // Kế toán không được tạo tài khoản
    const denied = await createUser(s.access_token, {
      tenant_id: p.tenantId,
      email: "x@duongsinh.vn",
      password: "KeToan2026",
      role: "viewer",
    });
    expect(denied.status).toBe(403);
  });

  it("email đã có → chỉ gán vai trò (200, created=false)", async () => {
    const r = await createUser(ownerToken, {
      tenant_id: p.tenantId,
      email: "ketoan@duongsinh.vn",
      password: "Khac2026xx",
      role: "chief_accountant",
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ created: false });
    // Mật khẩu cũ vẫn giữ nguyên
    expect((await login(p.app, "ketoan@duongsinh.vn", "KeToan2026", "10.3.3.3")).status).toBe(200);
  });

  it("kiểm tra dữ liệu: chưa đăng nhập 401, mật khẩu yếu 422, vai trò owner 422", async () => {
    expect((await p.app.request("/platform/v1/users", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await createUser(ownerToken, { tenant_id: p.tenantId, email: "a@b.vn", password: "abc", role: "viewer" })).status).toBe(422);
    expect((await createUser(ownerToken, { tenant_id: p.tenantId, email: "a@b.vn", password: "Abcdef123", role: "owner" })).status).toBe(422);
  });

  it("healthz", async () => {
    const r = await p.app.request("/healthz");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "ok" });
  });
});
