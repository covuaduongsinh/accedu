import { resolve } from "node:path";
import pg from "pg";
import { pino } from "pino";
import { createApp } from "../src/app.ts";
import { createOwner, migrate } from "../src/cli.ts";
import { loadConfig } from "../src/config.ts";

const socketDir = process.env.PGHOST ?? resolve(import.meta.dirname, "../../../.pgdata");
const port = process.env.PGPORT ?? "54329";
const url = (user: string, db: string) => `postgresql://${user}@/${db}?host=${encodeURIComponent(socketDir)}&port=${port}`;

export const OWNER = { email: "thay.tuong@duongsinh.vn", password: "TamThoi2026" };

/** Dựng CSDL test bằng chính lệnh `migrate` của CLI rồi tạo chủ sở hữu bằng `create-owner`. */
export async function setupPlatform(dbName: string) {
  const admin = new pg.Client({ connectionString: url("postgres", "postgres") });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  process.env.DATABASE_ADMIN_URL = url("postgres", dbName);
  await migrate({ log: () => undefined });
  const boot = await createOwner({
    email: OWNER.email,
    password: OWNER.password,
    name: "Phùng Đức Tường",
    tenantSlug: "duongsinh",
    tenantName: "Công ty CP Cờ vua Dương Sinh",
    regime: "TT99",
    startDate: "2026-01-01",
  });

  const config = loadConfig({
    DATABASE_URL: url("accedu_server", dbName),
    JWT_SECRET: "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
    LOG_LEVEL: "silent",
    LOGIN_MAX_ATTEMPTS: "5",
  } as NodeJS.ProcessEnv);
  const db = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
  const adminDb = new pg.Pool({ connectionString: url("postgres", dbName), max: 2 });
  const log = pino({ level: "silent" });
  const { app, tokens } = createApp({ db, config, log });
  return { app, tokens, db, adminDb, config, log, tenantId: boot.tenant_id as string, ownerId: boot.user_id as string };
}

export async function login(app: ReturnType<typeof createApp>["app"], email: string, password: string, ip = "10.0.0.1") {
  return app.request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
}

export function bearer(token: string, extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json", ...extra };
}
