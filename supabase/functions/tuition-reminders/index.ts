// Edge Function `tuition-reminders`: gửi email thông báo học phí (có mã VietQR) cho phụ huynh còn nợ.
// - Kế toán gửi tay: JWT người dùng + {tenant_id, student_ids?, dry_run?, test_to?} — quyền kiểm tra trong CSDL (can_post).
// - Lịch tự động (pg_cron 8:00 giờ VN): header x-cron-token khớp bí mật accedu_cron_token trong Vault → mọi đơn vị đến ngày nhắc.
// Hộp thư gửi (SMTP) và token đọc từ Supabase Vault qua RPC system_secrets (chỉ service role); không có trong mã nguồn.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import nodemailer from "npm:nodemailer@6.9.16";
import qrcode from "npm:qrcode-generator@2.0.4";
import { renderTuitionEmail, type ReminderCandidate, type ReminderTenant } from "../_shared/tuition-email.ts";
import { vietQrPayload } from "../_shared/vietqr.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-accedu-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SECRET_NAMES = ["accedu_smtp_host", "accedu_smtp_port", "accedu_smtp_user", "accedu_smtp_password", "accedu_smtp_from", "accedu_cron_token"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const todayVN = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dateVN = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

type Secrets = Record<string, string>;
type Mode = "auto" | "manual" | "test";
interface Outcome {
  student_id: string;
  student_code: string;
  student_name: string;
  email: string | null;
  amount: number;
  status: "sent" | "failed" | "skipped" | "preview";
  error?: string;
}

async function loadSecrets(admin: SupabaseClient): Promise<Secrets> {
  const { data, error } = await admin.rpc("system_secrets", { p_names: SECRET_NAMES });
  if (error) throw new Error(`Không đọc được cấu hình: ${error.message}`);
  return Object.fromEntries(((data ?? []) as Array<{ name: string; value: string }>).map((r) => [r.name, r.value]));
}

function transport(s: Secrets) {
  if (!s.accedu_smtp_host || !s.accedu_smtp_from) return null;
  const port = Number(s.accedu_smtp_port || 587);
  return nodemailer.createTransport({
    host: s.accedu_smtp_host,
    port,
    secure: port === 465,
    ...(s.accedu_smtp_user ? { auth: { user: s.accedu_smtp_user, pass: s.accedu_smtp_password ?? "" } } : {}),
  });
}

/** Ảnh GIF mã VietQR (base64) — đính kèm thư, tham chiếu bằng cid */
function qrGif(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  return qr.createDataURL(4, 8).split(",")[1] ?? "";
}

async function runTenant(
  db: SupabaseClient,
  tenantId: string,
  mode: Mode,
  smtp: ReturnType<typeof transport>,
  from: string,
  opts: { studentIds?: string[] | null; dryRun?: boolean; testTo?: string | null } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .select("id, name, address, phone, email, bank_bin, bank_account_no, bank_account_name, reminder_reply_to")
    .eq("id", tenantId)
    .maybeSingle();
  if (tErr || !tenant) return { status: 404, body: { error: "not_found", message: "Không tìm thấy đơn vị" } };

  const { data: rows, error: cErr } = await db.rpc("reminder_candidates", { p_tenant: tenantId, p_student_ids: opts.studentIds ?? null });
  if (cErr) return { status: cErr.code === "42501" ? 403 : 422, body: { error: "candidates_failed", message: cErr.message } };
  let candidates = ((rows ?? []) as ReminderCandidate[]).map((c) => ({ ...c, total: Number(c.total) }));
  // Tự động: mỗi học viên tối đa một email mỗi ngày
  if (mode === "auto") candidates = candidates.filter((c) => !c.last_auto_at || dateVN(c.last_auto_at) !== todayVN());

  if (opts.dryRun) {
    const results: Outcome[] = candidates.map((c) => ({
      student_id: c.student_id,
      student_code: c.student_code,
      student_name: c.student_name,
      email: c.email,
      amount: c.total,
      status: "preview",
      ...(c.email ? {} : { error: "Thiếu email phụ huynh" }),
    }));
    return { status: 200, body: { dry_run: true, smtp_configured: !!smtp, results } };
  }
  if (!smtp) {
    return { status: 503, body: { error: "smtp_not_configured", message: "Chưa cấu hình hộp thư gửi email (SMTP) — xem hướng dẫn Nhắc học phí qua email" } };
  }

  const t = tenant as ReminderTenant & { email: string | null; reminder_reply_to: string | null };
  const replyTo = t.reminder_reply_to || t.email || undefined;
  const targets = mode === "test" ? candidates.slice(0, 1) : candidates;
  if (mode === "test" && targets.length === 0) {
    return { status: 422, body: { error: "no_candidates", message: "Không có học viên còn nợ học phí để làm thư mẫu" } };
  }

  const results: Outcome[] = [];
  for (const c of targets) {
    const to = mode === "test" ? opts.testTo! : c.email;
    const base = { student_id: c.student_id, student_code: c.student_code, student_name: c.student_name, email: to, amount: c.total };
    if (!to) {
      results.push({ ...base, status: "skipped", error: "Thiếu email phụ huynh" });
      continue;
    }
    try {
      const qr = t.bank_bin && t.bank_account_no;
      const mail = renderTuitionEmail(t, c, qr ? "vietqr" : null, { test: mode === "test" });
      await smtp.sendMail({
        from: `"${t.name.replaceAll('"', "")}" <${from}>`,
        to,
        ...(replyTo ? { replyTo } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        attachments: qr
          ? [{ filename: "vietqr.gif", cid: "vietqr", encoding: "base64", content: qrGif(vietQrPayload({ bin: t.bank_bin!, accountNo: t.bank_account_no!, amount: c.total, note: mail.note })) }]
          : [],
      });
      results.push({ ...base, status: "sent" });
    } catch (e) {
      results.push({ ...base, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const byId = new Map(targets.map((c) => [c.student_id, c]));
  const { error: logErr } = await db.rpc("log_tuition_reminders", {
    p_tenant: tenantId,
    p_trigger: mode,
    p_rows: results.map((r) => ({ ...r, bill_ids: byId.get(r.student_id)?.bill_ids ?? [] })),
  });
  if (logErr) console.error("log_tuition_reminders", logErr.message);
  const count = (s: Outcome["status"]) => results.filter((r) => r.status === s).length;
  return { status: 200, body: { sent: count("sent"), failed: count("failed"), skipped: count("skipped"), results } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", message: "Chỉ hỗ trợ POST" });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const noSession = { persistSession: false, autoRefreshToken: false };
  const admin = createClient(url, serviceKey, { auth: noSession });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  let secrets: Secrets;
  try {
    secrets = await loadSecrets(admin);
  } catch (e) {
    return json(500, { error: "config_failed", message: e instanceof Error ? e.message : String(e) });
  }
  const smtp = transport(secrets);
  const from = secrets.accedu_smtp_from ?? "";

  // Lịch tự động
  const cronToken = req.headers.get("x-cron-token");
  if (cronToken) {
    if (!secrets.accedu_cron_token || cronToken !== secrets.accedu_cron_token) return json(401, { error: "unauthorized", message: "Sai token lịch" });
    const { data: due, error } = await admin.rpc("reminder_due_tenants", { p_date: null });
    if (error) return json(500, { error: "due_failed", message: error.message });
    const summary = [];
    for (const t of (due ?? []) as Array<{ tenant_id: string; name: string }>) {
      const r = await runTenant(admin, t.tenant_id, "auto", smtp, from);
      summary.push({ tenant: t.name, ...(r.body as object) });
    }
    return json(200, { tenants: summary.length, summary });
  }

  // Kế toán gửi tay (quyền của chính người gọi)
  const authHeader = req.headers.get("authorization") ?? "";
  if (!/^bearer\s+\S+/i.test(authHeader)) return json(401, { error: "unauthorized", message: "Cần đăng nhập" });
  const caller = createClient(url, anonKey, { auth: noSession, global: { headers: { Authorization: authHeader } } });
  const { data: me, error: meError } = await caller.auth.getUser();
  if (meError || !me.user) return json(401, { error: "unauthorized", message: "Phiên đăng nhập không hợp lệ" });

  const tenantId = String(body.tenant_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json(422, { error: "validation_failed", message: "Mã đơn vị không hợp lệ" });
  const studentIds = Array.isArray(body.student_ids) ? body.student_ids.map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s)) : null;
  const testTo = typeof body.test_to === "string" ? body.test_to.trim() : "";
  if (testTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) return json(422, { error: "validation_failed", message: "Email nhận thư thử không hợp lệ" });

  const r = await runTenant(caller, tenantId, testTo ? "test" : "manual", smtp, from, {
    studentIds,
    dryRun: body.dry_run === true,
    testTo: testTo || null,
  });
  return json(r.status, r.body);
});
