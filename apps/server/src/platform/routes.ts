import { Hono } from "hono";
import type { Pool } from "pg";
import { z } from "zod";
import { hashPassword, passwordProblem } from "../auth/password.ts";
import type { createAuthRoutes } from "../auth/routes.ts";

const createUserBody = z.object({
  tenant_id: z.uuid(),
  email: z.email(),
  full_name: z.string().trim().max(128).default(""),
  password: z.string(),
  role: z.enum(["admin", "chief_accountant", "accountant", "cashier", "viewer"]),
});

/** API quản trị nền tảng: quản trị đơn vị tạo tài khoản (thay cho đăng ký tự do). */
export function createPlatformRoutes(db: Pool, auth: ReturnType<typeof createAuthRoutes>) {
  const app = new Hono();

  app.post("/users", async (c) => {
    const actor = await auth.userFromBearer(c);
    if (!actor) return c.json({ error: "unauthorized", message: "Cần đăng nhập" }, 401);
    const parsed = createUserBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "validation_failed", message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, 422);
    }
    const b = parsed.data;
    const problem = passwordProblem(b.password);
    if (problem) return c.json({ error: "weak_password", message: problem }, 422);
    try {
      const { rows } = await db.query<{ r: { user_id: string; created: boolean } }>(
        "select platform.create_user($1, $2, $3, $4, $5, $6) as r",
        [actor.user.id, b.tenant_id, b.email, await hashPassword(b.password), b.full_name, b.role],
      );
      const r = rows[0]!.r;
      return c.json(r, r.created ? 201 : 200);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "42501") return c.json({ error: "forbidden", message: err.message }, 403);
      if (err.code === "22023") return c.json({ error: "validation_failed", message: err.message }, 422);
      throw e;
    }
  });

  return app;
}
