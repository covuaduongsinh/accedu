import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { RealtimeClient } from "./realtime";

export type AccEduClient = SupabaseClient<Database>;

export interface ClientOptions {
  /** URL gốc AccEdu Platform (vd. https://api.217-15-160-118.sslip.io) */
  url: string;
  /** Khóa anon công khai (hằng số của nền tảng, không phải bí mật) */
  anonKey: string;
  /** Web/desktop: localStorage (mặc định); mobile: AsyncStorage */
  storage?: SupportedStorage;
  /** Nền tảng ghi vào vouchers.source */
  platform?: "web" | "desktop" | "mobile";
}

interface PlatformHandle {
  url: string;
  anonKey: string;
  realtime: RealtimeClient;
}

const handles = new WeakMap<AccEduClient, PlatformHandle>();

export function createAccEduClient(opts: ClientOptions): AccEduClient {
  if (!opts.url || !opts.anonKey) {
    throw new Error("Thiếu cấu hình AccEdu Platform (URL / anon key)");
  }
  const url = opts.url.replace(/\/+$/, "");
  const db = createClient<Database>(url, opts.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      ...(opts.storage ? { storage: opts.storage } : {}),
    },
    global: { headers: { "x-accedu-platform": opts.platform ?? "web" } },
  });

  const realtime = new RealtimeClient({
    url,
    getToken: async () => (await db.auth.getSession()).data.session?.access_token ?? null,
  });
  // Không gọi hàm supabase khác trong callback (tránh khóa phiên) — dùng session được truyền vào
  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") realtime.refreshAuth(null);
    else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") realtime.refreshAuth(session?.access_token ?? null);
  });

  // Trình duyệt/desktop có mạng lại → nối lại ngay, không đợi backoff
  (globalThis as { addEventListener?: (type: string, fn: () => void) => void }).addEventListener?.("online", () =>
    realtime.reconnectNow(),
  );

  handles.set(db, { url, anonKey: opts.anonKey, realtime });
  return db;
}

function handle(db: AccEduClient): PlatformHandle {
  const h = handles.get(db);
  if (!h) throw new Error("Client không được tạo bằng createAccEduClient");
  return h;
}

export function realtimeOf(db: AccEduClient): RealtimeClient {
  return handle(db).realtime;
}

/** Gọi API quản trị của nền tảng (/platform/v1/*) bằng phiên đăng nhập hiện tại */
export async function platformFetch<T>(db: AccEduClient, path: string, body: unknown): Promise<{ status: number; data: T }> {
  const { url, anonKey } = handle(db);
  const token = (await db.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
  const res = await fetch(`${url}/platform/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anonKey, authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message ?? `Lỗi máy chủ (${res.status})`);
  return { status: res.status, data };
}
