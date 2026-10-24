import "react-native-url-polyfill/auto";
import { createAccEduClient, type AccEduClient } from "@accedu/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = !!url && !!anonKey;

export const db: AccEduClient | null = isConfigured
  ? createAccEduClient({ url, anonKey, storage: AsyncStorage, platform: "mobile" })
  : null;

// Chỉ làm mới token khi app đang mở (khuyến nghị của Supabase cho React Native)
if (db) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void db.auth.startAutoRefresh();
    else void db.auth.stopAutoRefresh();
  });
}
