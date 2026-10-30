// Edge Function `ai-ask`: "Hỏi AccEdu" — trả lời câu hỏi về số liệu bằng Claude, tra cứu qua các báo cáo của AccEdu.
// - Người gọi: JWT người dùng + {tenant_id, question}. Quyền và hạn mức trong CSDL (ai_begin); tool gọi báo cáo bằng
//   chính JWT đó nên RLS giữ nguyên, AI chỉ thấy đúng những gì người hỏi được xem.
// - Trả về ngay {usage_id, pending: true} rồi chạy nền (EdgeRuntime.waitUntil) để không vướng giới hạn thời gian chờ của
//   proxy; client đọc kết quả từ bảng ai_usage. Môi trường không có waitUntil thì chờ xong và trả luôn câu trả lời.
// Khóa Anthropic đọc từ Supabase Vault (accedu_anthropic_api_key) qua RPC system_secrets (chỉ service role).
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { askAccEdu, type AiDataSource, type AiRole, type ClaudeClient, type ClaudeResponse } from "../_shared/ai-agent.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-accedu-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_QUESTION = 1000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const todayVN = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Nguồn dữ liệu cho tool: client Supabase mang JWT người hỏi */
function dataSource(db: SupabaseClient): AiDataSource {
  return {
    async rpc(fn, args) {
      const { data, error } = await db.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    },
    async select(table, columns, eq) {
      const { data, error } = await db.from(table).select(columns).match(eq).limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    },
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    if (e.status === 401 || e.status === 403) return "Khóa Anthropic API không hợp lệ hoặc đã bị thu hồi — quản trị cần cập nhật ANTHROPIC_API_KEY.";
    if (e.status === 429 || e.status === 529) return "Dịch vụ AI đang quá tải. Thầy/Cô thử lại sau ít phút.";
    if (e.status === 400) return `Yêu cầu AI không hợp lệ: ${e.message}`;
    return `Dịch vụ AI lỗi (${e.status ?? "mạng"}). Thầy/Cô thử lại sau.`;
  }
  return e instanceof Error ? e.message : String(e);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", message: "Chỉ hỗ trợ POST" });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const noSession = { persistSession: false, autoRefreshToken: false };

  const authHeader = req.headers.get("authorization") ?? "";
  if (!/^bearer\s+\S+/i.test(authHeader)) return json(401, { error: "unauthorized", message: "Cần đăng nhập" });
  const caller = createClient(url, anonKey, { auth: noSession, global: { headers: { Authorization: authHeader } } });
  const { data: me, error: meError } = await caller.auth.getUser();
  if (meError || !me.user) return json(401, { error: "unauthorized", message: "Phiên đăng nhập không hợp lệ" });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tenantId = String(body.tenant_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json(422, { error: "validation_failed", message: "Mã đơn vị không hợp lệ" });
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return json(422, { error: "validation_failed", message: "Thầy/Cô chưa nhập câu hỏi" });
  if (question.length > MAX_QUESTION) return json(422, { error: "validation_failed", message: `Câu hỏi tối đa ${MAX_QUESTION} ký tự` });

  const admin = createClient(url, serviceKey, { auth: noSession });
  const { data: secretRows, error: sErr } = await admin.rpc("system_secrets", {
    p_names: ["accedu_anthropic_api_key", "accedu_anthropic_base_url"],
  });
  if (sErr) return json(500, { error: "config_failed", message: `Không đọc được cấu hình: ${sErr.message}` });
  const secrets = Object.fromEntries(((secretRows ?? []) as Array<{ name: string; value: string }>).map((r) => [r.name, r.value]));
  if (!secrets.accedu_anthropic_api_key) {
    return json(503, {
      error: "ai_not_configured",
      message: "Chưa cấu hình AI hỏi đáp: quản trị cần thêm khóa ANTHROPIC_API_KEY (xem hướng dẫn Hỏi đáp AI).",
    });
  }

  // Quyền + hạn mức câu hỏi hôm nay; giữ chỗ một dòng nhật ký
  const { data: begin, error: bErr } = await caller.rpc("ai_begin", { p_tenant: tenantId, p_question: question });
  if (bErr) return json(bErr.code === "42501" ? 403 : 422, { error: "begin_failed", message: bErr.message });
  const b = begin as { ok: boolean; error?: string; usage_id?: string; role: AiRole; limit: number; used: number; remaining: number };
  if (!b.ok) {
    return json(429, {
      error: b.error === "disabled" ? "ai_disabled" : "limit_reached",
      message: b.error === "disabled" ? "Đơn vị đã tắt AI hỏi đáp (hạn mức 0 câu / ngày)." : `Đã hết ${b.limit} câu hỏi AI của hôm nay. Thầy/Cô quay lại vào ngày mai.`,
      limit: b.limit,
      remaining: 0,
    });
  }
  const usageId = b.usage_id!;

  const anthropic = new Anthropic({
    apiKey: secrets.accedu_anthropic_api_key,
    ...(secrets.accedu_anthropic_base_url ? { baseURL: secrets.accedu_anthropic_base_url } : {}),
    maxRetries: 2,
    timeout: 240_000,
  });
  const claude: ClaudeClient = {
    create: (params) => anthropic.beta.messages.stream(params as never).finalMessage() as unknown as Promise<ClaudeResponse>,
  };

  const work = (async () => {
    try {
      const r = await askAccEdu({ client: claude, db: dataSource(caller), tenantId, role: b.role, question, today: todayVN() });
      const { error } = await admin.rpc("ai_finish", {
        p_usage: usageId,
        p_row: { status: r.status, answer: r.answer, tools: r.tools, model: r.model, ...r.usage, cost_usd: r.cost_usd },
      });
      if (error) console.error("ai_finish", error.message);
      return { status: r.status, answer: r.answer, tools: r.tools };
    } catch (e) {
      const message = errorMessage(e);
      console.error("ai-ask", message);
      const { error } = await admin.rpc("ai_finish", { p_usage: usageId, p_row: { status: "error", error: message } });
      if (error) console.error("ai_finish", error.message);
      return { status: "error", error: message, tools: [] as string[] };
    }
  })();

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return json(202, { usage_id: usageId, pending: true, limit: b.limit, remaining: b.remaining });
  }
  const done = await work;
  return json(200, { usage_id: usageId, pending: false, ...done, limit: b.limit, remaining: b.remaining });
});
