import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Pool } from "pg";
import type { Logger } from "pino";
import { createAuthRoutes } from "./auth/routes.ts";
import { TokenService } from "./auth/tokens.ts";
import type { Config } from "./config.ts";
import { createPlatformRoutes } from "./platform/routes.ts";

export const VERSION = "0.1.0";

export function createApp(deps: { db: Pool; config: Config; log: Logger; realtimeConnections?: () => number }) {
  const tokens = new TokenService(deps.config.JWT_SECRET, deps.config.JWT_EXP);
  const auth = createAuthRoutes({ ...deps, tokens });
  const app = new Hono();

  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    deps.log.debug({ method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) }, "request");
  });

  app.route("/auth/v1", auth.app);
  app.route("/platform/v1", createPlatformRoutes(deps.db, auth));

  app.get("/healthz", async (c) => {
    try {
      await deps.db.query("select 1");
      return c.json({ status: "ok", version: VERSION, realtime_connections: deps.realtimeConnections?.() ?? 0 });
    } catch {
      return c.json({ status: "degraded", version: VERSION, db: false }, 503);
    }
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    deps.log.error({ err, path: c.req.path }, "lỗi không xử lý");
    return c.json({ code: 500, error_code: "unexpected_failure", msg: "Lỗi máy chủ" }, 500);
  });

  return { app, tokens };
}
