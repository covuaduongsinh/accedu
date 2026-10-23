import { createAccEduClient, type AccEduClient } from "@accedu/api";

/** Chạy trong vỏ desktop Tauri? */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const env = import.meta.env as Record<string, string | undefined>;

/** URL AccEdu Platform; tên biến cũ VITE_SUPABASE_* vẫn được chấp nhận */
export const apiUrl = env.VITE_API_URL ?? env.VITE_SUPABASE_URL;
/** Khóa anon là hằng số công khai của nền tảng */
export const apiAnonKey = env.VITE_API_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? "accedu-public-anon";
export const isConfigured = !!apiUrl;

export const db: AccEduClient | null = isConfigured
  ? createAccEduClient({ url: apiUrl as string, anonKey: apiAnonKey, platform: isTauri ? "desktop" : "web" })
  : null;

export const platform: "web" | "desktop" = isTauri ? "desktop" : "web";
