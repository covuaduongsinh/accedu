import { createAccEduClient, type AccEduClient } from "@accedu/api";

/** Chạy trong vỏ desktop Tauri? */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const db: AccEduClient | null = isConfigured
  ? createAccEduClient({ url: supabaseUrl as string, anonKey: supabaseAnonKey as string, platform: isTauri ? "desktop" : "web" })
  : null;

export const platform: "web" | "desktop" = isTauri ? "desktop" : "web";
