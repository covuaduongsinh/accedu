/**
 * CLI quản trị AccEdu Platform (chạy trên máy chủ):
 *   node src/cli.ts migrate                 — áp nền CSDL + migration nghiệp vụ + seed
 *   node src/cli.ts create-owner --email … --tenant-slug duongsinh --tenant-name "…" [--regime TT99] [--name "…"]
 *                                           — mật khẩu lấy từ biến OWNER_PASSWORD (bắt đổi ở lần đăng nhập đầu)
 *   node src/cli.ts reset-password --email … — mật khẩu mới lấy từ NEW_PASSWORD
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";
import { hashPassword, passwordProblem } from "./auth/password.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");

/** Vị trí file SQL: trong image Docker dùng ACCEDU_DB_DIR, trong repo dùng đường dẫn gốc */
function sqlPaths() {
  const dir = process.env.ACCEDU_DB_DIR;
  if (dir) {
    return { base: join(dir, "00-platform.sql"), migrations: join(dir, "migrations"), seed: join(dir, "seed.sql") };
  }
  return {
    base: join(repoRoot, "platform/db/00-platform.sql"),
    migrations: join(repoRoot, "supabase/migrations"),
    seed: join(repoRoot, "supabase/seed.sql"),
  };
}

function adminUrl(): string {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_ADMIN_URL");
  return url;
}

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

export async function migrate(opts: { allowChanged?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? ((m: string) => process.stdout.write(`${m}\n`));
  const paths = sqlPaths();
  const db = new pg.Client({ connectionString: adminUrl() });
  await db.connect();
  try {
    await db.query(readFileSync(paths.base, "utf8"));
    log("✓ nền CSDL (role, schema auth)");

    for (const [role, env] of [
      ["authenticator", "AUTHENTICATOR_PASSWORD"],
      ["accedu_server", "SERVER_DB_PASSWORD"],
    ] as const) {
      const pw = process.env[env];
      if (pw) await db.query(`alter role ${role} with password ${quote(pw)}`);
    }

    const files = readdirSync(paths.migrations).filter((f) => f.endsWith(".sql")).toSorted();
    const applied = new Map(
      (await db.query<{ version: string; checksum: string }>("select version, checksum from platform.schema_migrations")).rows.map((r) => [
        r.version,
        r.checksum,
      ]),
    );
    for (const f of files) {
      const sql = readFileSync(join(paths.migrations, f), "utf8");
      const sum = createHash("sha256").update(sql).digest("hex");
      const prev = applied.get(f);
      if (prev) {
        if (prev !== sum && !opts.allowChanged) throw new Error(`Migration ${f} đã áp nhưng nội dung bị sửa (checksum khác)`);
        continue;
      }
      await db.query("begin");
      try {
        await db.query(sql);
        await db.query("insert into platform.schema_migrations (version, checksum) values ($1, $2)", [f, sum]);
        await db.query("commit");
        log(`✓ migration ${f}`);
      } catch (e) {
        await db.query("rollback");
        throw new Error(`Migration ${f} lỗi: ${(e as Error).message}`, { cause: e });
      }
    }

    if (existsSync(paths.seed)) {
      await db.query(readFileSync(paths.seed, "utf8"));
      log("✓ seed (hệ thống tài khoản mẫu)");
    }
    await db.query("notify pgrst, 'reload schema'");
  } finally {
    await db.end();
  }
}

export async function createOwner(args: {
  email: string;
  password: string;
  name?: string;
  tenantSlug: string;
  tenantName: string;
  regime?: "TT99" | "TT133";
  startDate?: string;
}) {
  const problem = passwordProblem(args.password);
  if (problem) throw new Error(problem);
  const db = new pg.Client({ connectionString: adminUrl() });
  await db.connect();
  try {
    const { rows } = await db.query<{ r: Record<string, unknown> }>(
      "select platform.bootstrap_owner($1, $2, $3, $4, $5, $6, $7) as r",
      [
        args.email,
        await hashPassword(args.password),
        args.name ?? "",
        args.tenantSlug,
        args.tenantName,
        args.regime ?? "TT99",
        args.startDate ?? null,
      ],
    );
    return rows[0]!.r;
  } finally {
    await db.end();
  }
}

export async function resetPassword(email: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const db = new pg.Client({ connectionString: adminUrl() });
  await db.connect();
  try {
    const { rowCount } = await db.query(
      "update auth.users set encrypted_password = $2, must_change_password = true, updated_at = now() where lower(email) = lower($1)",
      [email, await hashPassword(password)],
    );
    if (!rowCount) throw new Error(`Không có tài khoản ${email}`);
    await db.query(
      "update auth.sessions set revoked_at = now() where user_id = (select id from auth.users where lower(email) = lower($1)) and revoked_at is null",
      [email],
    );
  } finally {
    await db.end();
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      "tenant-slug": { type: "string" },
      "tenant-name": { type: "string" },
      regime: { type: "string" },
      "start-date": { type: "string" },
      "allow-changed": { type: "boolean" },
    },
  });
  switch (cmd) {
    case "migrate":
      await migrate({ allowChanged: !!values["allow-changed"] });
      break;
    case "create-owner": {
      const email = values.email ?? process.env.OWNER_EMAIL;
      const password = process.env.OWNER_PASSWORD;
      if (!email || !password) throw new Error("Cần --email (hoặc OWNER_EMAIL) và biến OWNER_PASSWORD");
      const r = await createOwner({
        email,
        password,
        ...(values.name ? { name: values.name } : {}),
        tenantSlug: values["tenant-slug"] ?? "duongsinh",
        tenantName: values["tenant-name"] ?? "Công ty CP Cờ vua Dương Sinh",
        regime: values.regime === "TT133" ? "TT133" : "TT99",
        ...(values["start-date"] ? { startDate: values["start-date"] } : {}),
      });
      process.stdout.write(
        `✓ chủ sở hữu ${email}: ${r.user_created ? "đã tạo" : "đã có"}; đơn vị: ${r.tenant_created ? "đã tạo" : "đã có"}\n`,
      );
      break;
    }
    case "reset-password": {
      const password = process.env.NEW_PASSWORD;
      if (!values.email || !password) throw new Error("Cần --email và biến NEW_PASSWORD");
      await resetPassword(values.email, password);
      process.stdout.write(`✓ đã đặt lại mật khẩu ${values.email} (bắt đổi ở lần đăng nhập tới)\n`);
      break;
    }
    default:
      process.stdout.write("Lệnh: migrate | create-owner | reset-password\n");
      process.exitCode = 1;
  }
}

if (import.meta.filename === process.argv[1] || process.argv[1]?.endsWith("cli.ts")) {
  main().catch((e: Error) => {
    process.stderr.write(`✗ ${e.message}\n`);
    process.exit(1);
  });
}
