import "react-native-url-polyfill/auto";
import { createAccEduClient, realtimeOf, type AccEduClient } from "@accedu/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

// URL AccEdu Platform; tên biến cũ EXPO_PUBLIC_SUPABASE_* vẫn được chấp nhận
const url = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_API_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "accedu-public-anon";

export const isConfigured = !!url;

export const db: AccEduClient | null = isConfigured
  ? createAccEduClient({ url, anonKey, storage: AsyncStorage, platform: "mobile" })
  : null;

// Chỉ làm mới token khi app đang mở; quay lại foreground thì nối lại realtime ngay
if (db) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void db.auth.startAutoRefresh();
      realtimeOf(db).reconnectNow();
    } else void db.auth.stopAutoRefresh();
  });
}
