// Edge Function `admin-users`: quản trị đơn vị (owner/admin) tạo tài khoản AccEdu với mật khẩu tạm.
// Đăng ký tự do bị tắt (DISABLE_SIGNUP) — đây là con đường duy nhất để có tài khoản mới ngoài Studio.
// service_role chỉ dùng ở đây (biến môi trường của container functions), không bao giờ tới client.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ROLES = ["admin", "chief_accountant", "accountant", "cashier", "viewer", "coach"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-accedu-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

/** Trùng với passwordProblem trong packages/core/src/auth/password.ts */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Mật khẩu phải có cả chữ và số";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", message: "Chỉ hỗ trợ POST" });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!/^bearer\s+\S+/i.test(authHeader)) return json(401, { error: "unauthorized", message: "Cần đăng nhập" });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const noSession = { persistSession: false, autoRefreshToken: false };

  // Client theo quyền người gọi: RLS và các hàm phân quyền trong CSDL vẫn áp dụng
  const caller = createClient(url, anonKey, { auth: noSession, global: { headers: { Authorization: authHeader } } });
  const { data: me, error: meError } = await caller.auth.getUser();
  if (meError || !me.user) return json(401, { error: "unauthorized", message: "Phiên đăng nhập không hợp lệ" });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tenantId = String(body.tenant_id ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim().slice(0, 128);
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json(422, { error: "validation_failed", message: "Mã đơn vị không hợp lệ" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(422, { error: "validation_failed", message: "Email không hợp lệ" });
  if (!ROLES.includes(role)) return json(422, { error: "validation_failed", message: `Vai trò không hợp lệ: ${role}` });
  const problem = passwordProblem(password);
  if (problem) return json(422, { error: "weak_password", message: problem });

  // Chỉ owner/admin của đơn vị mới được tạo tài khoản — kiểm tra TRƯỚC khi đụng tới auth
  const { data: mine } = await caller.from("my_tenants").select("role").eq("id", tenantId).maybeSingle();
  if (!mine || !["owner", "admin"].includes(mine.role as string)) {
    return json(403, { error: "forbidden", message: "Chỉ quản trị đơn vị được tạo tài khoản" });
  }

  const admin = createClient(url, serviceKey, { auth: noSession });
  let createdId: string | null = null;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || null, must_change_password: true },
  });
  if (createError) {
    // Email đã có tài khoản: chỉ gán vai trò, KHÔNG đổi mật khẩu của người đó
    const exists = createError.code === "email_exists" || /already (been )?registered|already exists/i.test(createError.message);
    if (!exists) return json(422, { error: createError.code ?? "create_failed", message: createError.message });
  } else {
    createdId = created.user.id;
  }

  // Gán vai trò bằng quyền người gọi (set_member kiểm tra quyền quản trị và bảo vệ chủ sở hữu)
  const { data: userId, error: roleError } = await caller.rpc("set_member", { p_tenant: tenantId, p_email: email, p_role: role });
  if (roleError) {
    if (createdId) await admin.auth.admin.deleteUser(createdId);
    return json(roleError.code === "42501" ? 403 : 422, { error: "set_member_failed", message: roleError.message });
  }
  return json(createdId ? 201 : 200, { user_id: userId, created: !!createdId });
});
