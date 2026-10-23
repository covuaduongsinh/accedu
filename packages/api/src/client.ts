import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type AccEduClient = SupabaseClient<Database>;

export interface ClientOptions {
  url: string;
  anonKey: string;
  /** Web/desktop: localStorage (mặc định); mobile: expo-secure-store adapter */
  storage?: SupportedStorage;
  /** Nền tảng ghi vào vouchers.source */
  platform?: "web" | "desktop" | "mobile";
}

export function createAccEduClient(opts: ClientOptions): AccEduClient {
  if (!opts.url || !opts.anonKey) {
    throw new Error("Thiếu cấu hình Supabase (URL / anon key)");
  }
  return createClient<Database>(opts.url, opts.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: opts.platform === "web",
      ...(opts.storage ? { storage: opts.storage } : {}),
    },
    global: { headers: { "x-accedu-platform": opts.platform ?? "web" } },
  });
}
