import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const root = fileURLToPath(new URL("../..", import.meta.url));

export const pool = new Pool({
  host: process.env.PGHOST ?? `${root}.pgdata`,
  port: Number(process.env.PGPORT ?? 54329),
  user: process.env.PGUSER ?? "postgres",
  database: process.env.PGDATABASE ?? "accedu_test",
  max: 4,
});

export async function createUser(email = `${randomUUID()}@test.vn`): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  return rows[0]!.id;
}

/** Chạy truy vấn với tư cách một người dùng đã đăng nhập (role authenticated + JWT sub) — RLS có hiệu lực. */
export async function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export async function q<T extends QueryResultRow = Record<string, unknown>>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return asUser(userId, async (c) => (await c.query<T>(sql, params)).rows);
}

export function slug(prefix = "t"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export async function createTenant(userId: string, regime: "TT99" | "TT133" = "TT99", startDate = "2026-01-01") {
  const [row] = await q<{ id: string }>(userId, "select public.create_tenant($1, $2, $3, null, $4) as id", [
    slug(),
    "Công ty CP Cờ vua Dương Sinh",
    regime,
    startDate,
  ]);
  return row!.id;
}

export async function addMember(tenantId: string, userId: string, role: string) {
  await pool.query("insert into public.memberships (tenant_id, user_id, role) values ($1, $2, $3)", [tenantId, userId, role]);
}

export async function createPartner(userId: string, tenantId: string, code = "KH001") {
  const [row] = await q<{ id: string }>(
    userId,
    "insert into public.partners (tenant_id, code, name) values ($1, $2, $3) returning id",
    [tenantId, code, `Khách hàng ${code}`],
  );
  return row!.id;
}

export interface VoucherJson {
  id?: string;
  tenant_id: string;
  voucher_type: string;
  posting_date: string;
  issue_date?: string;
  partner_id?: string | null;
  description?: string;
  header_account?: string;
  number?: string;
  version?: number;
  lines: Array<Record<string, unknown>>;
}

export async function saveVoucher(userId: string, v: VoucherJson, post = false): Promise<string> {
  const [row] = await q<{ id: string }>(userId, "select public.save_voucher($1::jsonb, $2) as id", [JSON.stringify(v), post]);
  return row!.id;
}
