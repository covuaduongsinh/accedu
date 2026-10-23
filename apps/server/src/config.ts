import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  /** Kết nối của server (role accedu_server) */
  DATABASE_URL: z.string().min(1),
  /** Kết nối superuser — chỉ CLI migrate/bootstrap dùng */
  DATABASE_ADMIN_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET phải ≥ 32 ký tự"),
  JWT_EXP: z.coerce.number().int().positive().default(3600),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Khóa anon công khai (hằng số) — Caddy bỏ header Bearer này trước khi tới PostgREST */
  ANON_KEY: z.string().default("accedu-public-anon"),
  ALLOW_SIGNUP: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Cấu hình không hợp lệ — ${issues}`);
  }
  return parsed.data;
}
