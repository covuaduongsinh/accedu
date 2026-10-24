import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type AccEduClient = SupabaseClient<Database>;

export interface ClientOptions {
  /** URL Supabase của AccEdu (vd. https://supabaseaccedu.dsc.edu.vn) */
  url: string;
  /** anon key (khóa công khai) của Supabase */
  anonKey: string;
  /** Web/desktop: localStorage (mặc định); mobile: AsyncStorage */
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
      detectSessionInUrl: false,
      ...(opts.storage ? { storage: opts.storage } : {}),
    },
    global: { headers: { "x-accedu-platform": opts.platform ?? "web" } },
  });
}
