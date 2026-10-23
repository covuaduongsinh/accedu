import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import type { Logger } from "pino";
import type { Config } from "../config.ts";
import { hashPassword, passwordProblem, verifyPassword } from "./password.ts";
import { RateLimiter } from "./rate-limit.ts";
import { hashToken, newRefreshToken, type TokenService } from "./tokens.ts";

/**
 * Auth tương thích giao thức GoTrue (Supabase Auth) ở phạm vi supabase-js dùng:
 * đăng nhập mật khẩu, làm mới phiên (refresh token xoay vòng), lấy/sửa user, đăng xuất.
 * Đăng ký tự do tắt mặc định — tài khoản do quản trị tạo (platform/v1/users).
 */

interface UserRow {
  id: string;
  email: string;
  encrypted_password: string | null;
  raw_user_meta_data: Record<string, unknown>;
  raw_app_meta_data: Record<string, unknown>;
  must_change_password: boolean;
  banned_until: Date | null;
  last_sign_in_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuthDeps {
  db: Pool;
  tokens: TokenService;
  config: Config;
  log: Logger;
}

function gotrueError(c: Context, status: 400 | 401 | 403 | 404 | 422 | 429, error_code: string, msg: string) {
  return c.json({ code: status, error_code, msg }, status);
}

export function toGotrueUser(u: UserRow) {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: iso(u.created_at),
    phone: "",
    confirmed_at: iso(u.created_at),
    last_sign_in_at: iso(u.last_sign_in_at),
    app_metadata: { provider: "email", providers: ["email"], ...u.raw_app_meta_data, must_change_password: u.must_change_password },
    user_metadata: u.raw_user_meta_data,
    identities: [],
    created_at: iso(u.created_at),
    updated_at: iso(u.updated_at),
    is_anonymous: false,
  };
}

export function createAuthRoutes({ db, tokens, config, log }: AuthDeps) {
  const app = new Hono();
  const limiter = new RateLimiter(config.LOGIN_MAX_ATTEMPTS, config.LOGIN_WINDOW_MIN * 60_000);
  const refreshTtlMs = config.REFRESH_TTL_DAYS * 86_400_000;

  async function issueSession(user: UserRow, sessionId: string) {
    const { token, expiresAt } = await tokens.signAccess({
      sub: user.id,
      email: user.email,
      session_id: sessionId,
      user_metadata: user.raw_user_meta_data,
      app_metadata: { provider: "email", must_change_password: user.must_change_password },
    });
    const refresh = newRefreshToken();
    await db.query(
      "insert into auth.refresh_tokens (token_hash, session_id, user_id, expires_at) values ($1, $2, $3, $4)",
      [hashToken(refresh), sessionId, user.id, new Date(Date.now() + refreshTtlMs)],
    );
    return {
      access_token: token,
      token_type: "bearer",
      expires_in: tokens.expiresIn,
      expires_at: expiresAt,
      refresh_token: refresh,
      user: toGotrueUser(user),
    };
  }

  async function userFromBearer(c: Context): Promise<{ user: UserRow; sessionId: string } | null> {
    const h = c.req.header("authorization") ?? "";
    const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
    if (!token || token === config.ANON_KEY) return null;
    try {
      const claims = await tokens.verifyAccess(token);
      const { rows } = await db.query<UserRow>("select * from auth.users where id = $1", [claims.sub]);
      const s = await db.query("select 1 from auth.sessions where id = $1 and revoked_at is null", [claims.session_id]);
      if (!rows[0] || !s.rowCount) return null;
      return { user: rows[0], sessionId: claims.session_id };
    } catch {
      return null;
    }
  }

  const clientIp = (c: Context) =>
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";

  app.post("/token", async (c) => {
    const grant = c.req.query("grant_type");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

    if (grant === "password") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const key = `${clientIp(c)}|${email}`;
      if (limiter.isLimited(key)) {
        return gotrueError(c, 429, "over_request_rate_limit", "Quá nhiều lần đăng nhập sai, vui lòng thử lại sau 15 phút");
      }
      const { rows } = await db.query<UserRow>("select * from auth.users where lower(email) = $1", [email]);
      const user = rows[0];
      const ok = await verifyPassword(user?.encrypted_password ?? null, password);
      if (!user || !ok) {
        limiter.fail(key);
        log.info({ email, ip: clientIp(c) }, "đăng nhập sai");
        return gotrueError(c, 400, "invalid_credentials", "Invalid login credentials");
      }
      if (user.banned_until && user.banned_until > new Date()) {
        return gotrueError(c, 400, "user_banned", "Tài khoản đang bị khóa");
      }
      limiter.reset(key);
      const session = await db.query<{ id: string }>(
        "insert into auth.sessions (user_id, user_agent, ip) values ($1, $2, $3) returning id",
        [user.id, c.req.header("user-agent")?.slice(0, 256) ?? null, clientIp(c)],
      );
      const { rows: upd } = await db.query<UserRow>(
        "update auth.users set last_sign_in_at = now() where id = $1 returning *",
        [user.id],
      );
      return c.json(await issueSession(upd[0] ?? user, session.rows[0]!.id));
    }

    if (grant === "refresh_token") {
      const token = String(body.refresh_token ?? "");
      if (!token) return gotrueError(c, 400, "validation_failed", "refresh_token is required");
      const client = await db.connect();
      try {
        await client.query("begin");
        const { rows } = await client.query<{
          id: string;
          session_id: string;
          user_id: string;
          revoked: boolean;
          expires_at: Date;
          revoked_at: Date | null;
        }>(
          `select rt.id, rt.session_id, rt.user_id, rt.revoked, rt.expires_at, s.revoked_at
           from auth.refresh_tokens rt join auth.sessions s on s.id = rt.session_id
           where rt.token_hash = $1 for update of rt`,
          [hashToken(token)],
        );
        const rt = rows[0];
        if (!rt || rt.revoked_at) {
          await client.query("rollback");
          return gotrueError(c, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        }
        if (rt.revoked) {
          // Dùng lại token đã xoay vòng → nghi bị đánh cắp: thu hồi cả phiên
          await client.query("update auth.sessions set revoked_at = now() where id = $1", [rt.session_id]);
          await client.query("update auth.refresh_tokens set revoked = true where session_id = $1", [rt.session_id]);
          await client.query("commit");
          log.warn({ user: rt.user_id, session: rt.session_id }, "phát hiện dùng lại refresh token — thu hồi phiên");
          return gotrueError(c, 400, "refresh_token_already_used", "Invalid Refresh Token: Already Used");
        }
        if (rt.expires_at < new Date()) {
          await client.query("rollback");
          return gotrueError(c, 400, "session_expired", "Session expired");
        }
        await client.query("update auth.refresh_tokens set revoked = true where id = $1", [rt.id]);
        await client.query("update auth.sessions set refreshed_at = now() where id = $1", [rt.session_id]);
        const { rows: users } = await client.query<UserRow>("select * from auth.users where id = $1", [rt.user_id]);
        await client.query("commit");
        const user = users[0];
        if (!user || (user.banned_until && user.banned_until > new Date())) {
          return gotrueError(c, 400, "user_banned", "Tài khoản đang bị khóa");
        }
        return c.json(await issueSession(user, rt.session_id));
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    }

    return gotrueError(c, 400, "unsupported_grant_type", "Unsupported grant type");
  });

  app.get("/user", async (c) => {
    const auth = await userFromBearer(c);
    if (!auth) return gotrueError(c, 401, "bad_jwt", "invalid JWT");
    return c.json(toGotrueUser(auth.user));
  });

  app.put("/user", async (c) => {
    const auth = await userFromBearer(c);
    if (!auth) return gotrueError(c, 401, "bad_jwt", "invalid JWT");
    const body = (await c.req.json().catch(() => ({}))) as { password?: string; data?: Record<string, unknown> };
    let user = auth.user;
    if (typeof body.password === "string") {
      const problem = passwordProblem(body.password);
      if (problem) return gotrueError(c, 422, "weak_password", problem);
      if (await verifyPassword(user.encrypted_password, body.password)) {
        return gotrueError(c, 422, "same_password", "Mật khẩu mới phải khác mật khẩu cũ");
      }
      const { rows } = await db.query<UserRow>(
        `update auth.users set encrypted_password = $2, must_change_password = false, updated_at = now()
         where id = $1 returning *`,
        [user.id, await hashPassword(body.password)],
      );
      user = rows[0] ?? user;
      // Đổi mật khẩu → đăng xuất mọi phiên khác
      await db.query("update auth.sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null", [
        user.id,
        auth.sessionId,
      ]);
    }
    if (body.data && typeof body.data === "object") {
      const { rows } = await db.query<UserRow>(
        "update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1 returning *",
        [user.id, JSON.stringify(body.data)],
      );
      user = rows[0] ?? user;
      if (typeof body.data.full_name === "string") {
        await db.query("select platform.set_full_name($1, $2)", [user.id, body.data.full_name]);
      }
    }
    return c.json(toGotrueUser(user));
  });

  app.post("/logout", async (c) => {
    const auth = await userFromBearer(c);
    if (auth) {
      const scope = c.req.query("scope") ?? "global";
      if (scope === "local") {
        await db.query("update auth.sessions set revoked_at = now() where id = $1", [auth.sessionId]);
      } else if (scope === "others") {
        await db.query("update auth.sessions set revoked_at = now() where user_id = $1 and id <> $2", [auth.user.id, auth.sessionId]);
      } else {
        await db.query("update auth.sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [auth.user.id]);
      }
    }
    return c.body(null, 204);
  });

  app.post("/signup", (c) =>
    config.ALLOW_SIGNUP
      ? gotrueError(c, 422, "not_implemented", "Signup is not implemented")
      : gotrueError(c, 403, "signup_disabled", "Signups not allowed for this instance"),
  );

  app.get("/settings", (c) =>
    c.json({ external: { email: true }, disable_signup: !config.ALLOW_SIGNUP, mailer_autoconfirm: true, phone_autoconfirm: false }),
  );

  app.get("/health", (c) => c.json({ name: "AccEdu Auth", version: "0.1.0" }));

  return { app, userFromBearer };
}
